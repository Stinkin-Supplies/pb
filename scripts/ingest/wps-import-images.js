require('dotenv').config();
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────
const pool       = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CSV_PATH   = process.argv[2] || './master-image-list.csv';
const CHECKPOINT = './wps-images-checkpoint.json';
const BATCH_SIZE = 500;

function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — line: ${d.line} | written: ${d.written}\n`);
    return d;
  }
  return { line: 0, written: 0, skipped: 0, failed: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── Parse CSV (no external deps) ─────────────────────────────
function* readCsvRows(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? null; });
    yield { row, lineNum: i };
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function run() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌  CSV not found: ${CSV_PATH}`);
    console.error(`    Usage: node wps-import-images.js /path/to/master-image-list.csv`);
    process.exit(1);
  }

  const client     = await pool.connect();
  const checkpoint = loadCheckpoint();
  let { line: startLine, written, skipped, failed } = checkpoint;

  console.log('▶  WPS Master Image Import...\n');
  console.log(`   CSV: ${path.resolve(CSV_PATH)}`);

  // Count total lines
  const totalLines = fs.readFileSync(CSV_PATH, 'utf8').split('\n').filter(l => l.trim()).length - 1;
  console.log(`   Total image rows: ${totalLines.toLocaleString()}\n`);

  // Build lookup: wps_sku → catalog_product_id
  // Match via vendor_offers WHERE vendor_code = 'wps' AND vendor_part_number = sku
  console.log('   Building SKU → catalog_product_id lookup from vendor_offers...');
  const { rows: offerRows } = await client.query(`
    SELECT vo.vendor_part_number AS sku, vo.catalog_product_id
    FROM public.vendor_offers vo
    WHERE vo.vendor_code = 'wps'
      AND vo.vendor_part_number IS NOT NULL
  `);
  const skuToProductId = {};
  for (const row of offerRows) {
    skuToProductId[row.sku] = row.catalog_product_id;
  }
  console.log(`   Loaded ${Object.keys(skuToProductId).length.toLocaleString()} WPS SKU mappings\n`);

  let batch   = [];
  let lineNum = 0;

  try {
    for (const { row, lineNum: ln } of readCsvRows(CSV_PATH)) {
      lineNum = ln;
      if (lineNum <= startLine) continue; // skip already processed

      const sku = row.sku?.trim();
      const url = row.image_uri?.trim();

      if (!sku || !url || !url.startsWith('http')) {
        skipped++;
        continue;
      }

      const catalogProductId = skuToProductId[sku];
      if (!catalogProductId) {
        skipped++;
        continue;
      }

      batch.push({ catalogProductId, url, sku });

      if (batch.length >= BATCH_SIZE) {
        await flushBatch(client, batch, (w, f) => { written += w; failed += f; });
        batch = [];
        saveCheckpoint({ line: lineNum, written, skipped, failed });

        const pct = Math.round((lineNum / totalLines) * 100);
        process.stdout.write(
          `\r  Progress: ${lineNum.toLocaleString()} / ${totalLines.toLocaleString()} (${pct}%) | written: ${written.toLocaleString()} | skipped: ${skipped.toLocaleString()}`
        );
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      await flushBatch(client, batch, (w, f) => { written += w; failed += f; });
    }

    clearCheckpoint();

    console.log(`\n\n✅  WPS image import complete!`);
    console.log(`   Images written:  ${written.toLocaleString()}`);
    console.log(`   Skipped (no match or no URL): ${skipped.toLocaleString()}`);
    console.log(`   Failed:          ${failed}`);

    // Final summary
    const { rows: [summary] } = await client.query(`
      SELECT
        COUNT(DISTINCT catalog_product_id) AS products_with_images,
        COUNT(*) AS total_images
      FROM public.catalog_images
    `);
    console.log(`\n   DB totals after import:`);
    console.log(`     Products with images: ${Number(summary.products_with_images).toLocaleString()}`);
    console.log(`     Total image rows:     ${Number(summary.total_images).toLocaleString()}`);

    // Coverage check
    const { rows: [coverage] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.catalog_images ci
          WHERE ci.catalog_product_id = cp.id
        )) AS with_image,
        COUNT(*) AS total
      FROM public.catalog_products cp
      WHERE cp.is_active = true
    `);
    const pct = Math.round(Number(coverage.with_image) / Number(coverage.total) * 100);
    console.log(`\n   Active product image coverage: ${Number(coverage.with_image).toLocaleString()} / ${Number(coverage.total).toLocaleString()} (${pct}%)`);

  } catch (err) {
    console.error('\n❌  Import failed:', err.message);
    console.error('    Re-run to resume from checkpoint.');
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Batch upsert ──────────────────────────────────────────────
async function flushBatch(client, batch, onResult) {
  let written = 0;
  let failed  = 0;

  // Group by catalogProductId — keep only first image per product from this file
  // (master-image-list has one row per SKU, so this is mostly 1:1)
  const seen = new Set();
  const deduped = [];
  for (const item of batch) {
    const key = `${item.catalogProductId}:${item.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  for (const { catalogProductId, url } of deduped) {
    try {
      await client.query(`
        INSERT INTO public.catalog_images
          (product_id, catalog_product_id, url, position, is_primary, created_at)
        VALUES ($1, $1, $2, 0, true, NOW())
        ON CONFLICT (catalog_product_id, url) DO UPDATE SET
          product_id = EXCLUDED.product_id,
          is_primary = true,
          position   = 0
      `, [catalogProductId, url]);
      written++;
    } catch (err) {
      failed++;
      if (failed <= 5) console.error(`\n  ❌  [${catalogProductId}] ${url}: ${err.message}`);
    }
  }

  onResult(written, failed);
}

run();
