require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CHECKPOINT = './phase2-images-checkpoint.json';
const BATCH_SIZE = 500;

function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — offset: ${d.offset} | images written: ${d.written}\n`);
    return d;
  }
  return { offset: 0, written: 0, skipped: 0, failed: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── Dedupe + merge images across vendors ──────────────────────────────────────
function mergeImages(rows) {
  const seen = new Set();
  const images = [];
  for (const row of rows) {
    let imgs = row.images_raw ?? [];
    if (typeof imgs === 'string') {
      try { imgs = JSON.parse(imgs); } catch { imgs = []; }
    }
    if (!Array.isArray(imgs)) continue;
    for (const img of imgs) {
      const url = img?.url ?? img;
      if (typeof url === 'string' && url.startsWith('http') && !seen.has(url)) {
        seen.add(url);
        images.push({ url, position: img?.position ?? images.length, is_primary: false });
      }
    }
  }
  // Mark first image as primary
  if (images.length > 0) images[0].is_primary = true;
  return images;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const checkpoint = loadCheckpoint();
  let { offset, written, skipped, failed } = checkpoint;

  console.log('▶  Phase 2.3 — Populating catalog_images...\n');

  // Total catalog products
  const { rows: [{ total }] } = await client.query(
    'SELECT COUNT(*) AS total FROM public.catalog_products'
  );
  const totalNum = Number(total);
  console.log(`   Total catalog products: ${totalNum.toLocaleString()}\n`);

  // Verify catalog_images table exists
  const { rows: tableCheck } = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'catalog_images'
  `);
  if (tableCheck.length === 0) {
    console.error('❌  catalog_images table does not exist. Create it first:\n');
    console.error(`
    CREATE TABLE public.catalog_images (
      id                 BIGSERIAL PRIMARY KEY,
      catalog_product_id BIGINT NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
      url                TEXT NOT NULL,
      position           INT NOT NULL DEFAULT 0,
      is_primary         BOOLEAN NOT NULL DEFAULT false,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (catalog_product_id, url)
    );
    CREATE INDEX ON public.catalog_images (catalog_product_id);
    `);
    process.exit(1);
  }

  try {
    while (true) {
      // Fetch a batch of catalog products (id + MPN)
      const { rows: catalogBatch } = await client.query(`
        SELECT id, manufacturer_part_number
        FROM public.catalog_products
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (catalogBatch.length === 0) break;

      const mpns = catalogBatch.map(r => r.manufacturer_part_number).filter(Boolean);
      const catalogIdByMPN = {};
      for (const row of catalogBatch) {
        if (row.manufacturer_part_number) catalogIdByMPN[row.manufacturer_part_number] = row.id;
      }

      // Fetch images_raw for all MPNs in this batch from vendor source
      const { rows: vendorRows } = await client.query(`
        SELECT manufacturer_part_number, vendor_code, images_raw
        FROM vendor.vendor_products
        WHERE manufacturer_part_number = ANY($1)
          AND images_raw IS NOT NULL
          AND images_raw != 'null'
          AND images_raw::text != '[]'
      `, [mpns]);

      // Group by MPN
      const byMPN = {};
      for (const row of vendorRows) {
        const mpn = row.manufacturer_part_number;
        if (!byMPN[mpn]) byMPN[mpn] = [];
        byMPN[mpn].push(row);
      }

      // Write images for each catalog product
      for (const mpn of mpns) {
        const catalogProductId = catalogIdByMPN[mpn];
        if (!catalogProductId) continue;

        const rows = byMPN[mpn];
        if (!rows || rows.length === 0) { skipped++; continue; }

        const images = mergeImages(rows);
        if (images.length === 0) { skipped++; continue; }

        for (const img of images) {
          try {
            await client.query(`
              INSERT INTO public.catalog_images
                (catalog_product_id, url, position, is_primary, created_at)
              VALUES ($1, $2, $3, $4, NOW())
              ON CONFLICT (catalog_product_id, url) DO UPDATE SET
                position   = EXCLUDED.position,
                is_primary = EXCLUDED.is_primary
            `, [catalogProductId, img.url, img.position, img.is_primary]);
            written++;
          } catch (err) {
            failed++;
            if (failed <= 10) console.error(`\n  ❌  ${mpn} [${img.url}]: ${err.message}`);
          }
        }
      }

      offset += catalogBatch.length;
      saveCheckpoint({ offset, written, skipped, failed });

      const pct = Math.round((offset / totalNum) * 100);
      process.stdout.write(
        `\r  Progress: ${offset.toLocaleString()} / ${totalNum.toLocaleString()} products (${pct}%) | images written: ${written.toLocaleString()} | no-image: ${skipped.toLocaleString()}`
      );
    }

    clearCheckpoint();

    console.log(`\n\n✅  Phase 2.3 complete!`);
    console.log(`   Images written:       ${written.toLocaleString()}`);
    console.log(`   Products with no img: ${skipped.toLocaleString()}`);
    console.log(`   Failed:               ${failed}`);

    // Summary
    const { rows: summary } = await client.query(`
      SELECT
        COUNT(DISTINCT catalog_product_id) AS products_with_images,
        COUNT(*)                           AS total_image_rows
      FROM public.catalog_images
    `);
    console.log(`\n   DB totals:`);
    console.log(`     Products with images: ${Number(summary[0].products_with_images).toLocaleString()}`);
    console.log(`     Total image rows:     ${Number(summary[0].total_image_rows).toLocaleString()}`);

    // Vendor breakdown
    const { rows: vendorBreakdown } = await client.query(`
      SELECT
        vp.vendor_code,
        COUNT(DISTINCT vp.manufacturer_part_number) AS products_with_images
      FROM vendor.vendor_products vp
      JOIN public.catalog_images ci
        ON ci.catalog_product_id = (
          SELECT id FROM public.catalog_products
          WHERE manufacturer_part_number = vp.manufacturer_part_number
          LIMIT 1
        )
      WHERE vp.images_raw IS NOT NULL
        AND vp.images_raw::text != '[]'
      GROUP BY vp.vendor_code
    `);
    if (vendorBreakdown.length > 0) {
      console.log(`\n   Images by vendor source:`);
      for (const row of vendorBreakdown) {
        console.log(`     ${row.vendor_code}: ${Number(row.products_with_images).toLocaleString()} products`);
      }
    }

  } catch (err) {
    console.error('\n❌  Phase 2.3 failed:', err.message);
    console.error('    Re-run node phase2-images.js to resume from checkpoint.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
