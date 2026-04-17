require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CHECKPOINT = './phase2-descriptions-checkpoint.json';
const BATCH_SIZE = 500;

function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — offset: ${d.offset} | written: ${d.written}\n`);
    return d;
  }
  return { offset: 0, written: 0, skipped: 0, failed: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── Pick best description — PU preferred, WPS fallback ───────────────────────
function bestDescription(rows) {
  const pu  = rows.find(r => r.vendor_code === 'pu'  && isValidDesc(r.description_raw))?.description_raw;
  const wps = rows.find(r => r.vendor_code === 'wps' && isValidDesc(r.description_raw))?.description_raw;
  return pu ?? wps ?? null;
}

function isValidDesc(d) {
  if (!d) return false;
  const s = d.toString().trim();
  return s.length > 0 && s !== 'null' && s !== 'undefined' && s !== 'N/A';
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const checkpoint = loadCheckpoint();
  let { offset, written, skipped, failed } = checkpoint;

  console.log('▶  Phase 2.4 — Populating catalog_products.description...\n');

  // Only process products that have no description yet
  const { rows: [{ total }] } = await client.query(`
    SELECT COUNT(*) AS total
    FROM public.catalog_products
    WHERE description IS NULL OR description = ''
  `);
  const totalNum = Number(total);
  console.log(`   Products missing description: ${totalNum.toLocaleString()}`);
  console.log(`   (Products already with description will be skipped)\n`);

  if (totalNum === 0) {
    console.log('✅  All products already have descriptions. Nothing to do.');
    client.release();
    await pool.end();
    return;
  }

  try {
    while (true) {
      // Fetch batch of catalog products missing descriptions
      const { rows: catalogBatch } = await client.query(`
        SELECT id, sku, manufacturer_part_number
        FROM public.catalog_products
        WHERE description IS NULL OR description = ''
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (catalogBatch.length === 0) break;

      const skus = catalogBatch.map(r => r.sku).filter(Boolean);
      const idBySKU = {};
      for (const row of catalogBatch) {
        if (row.sku) idBySKU[row.sku] = row.id;
      }

      // Fetch description_raw from vendor source for this batch
      const { rows: vendorRows } = await client.query(`
        SELECT
          vendor_code,
          vendor_part_number,
          description_raw
        FROM vendor.vendor_products
        WHERE vendor_part_number = ANY($1)
          AND description_raw IS NOT NULL
          AND description_raw != ''
          AND description_raw != 'null'
      `, [skus]);

      // Group by vendor_part_number (matches catalog sku)
      const bySKU = {};
      for (const row of vendorRows) {
        const sku = row.vendor_part_number;
        if (!bySKU[sku]) bySKU[sku] = [];
        bySKU[sku].push(row);
      }

      // Write best description to catalog_products
      for (const { id, sku } of catalogBatch) {
        const rows = bySKU[sku];
        if (!rows || rows.length === 0) { skipped++; continue; }

        const description = bestDescription(rows);
        if (!description) { skipped++; continue; }

        try {
          await client.query(`
            UPDATE public.catalog_products
            SET description = $1, updated_at = NOW()
            WHERE id = $2
          `, [description, id]);
          written++;
        } catch (err) {
          failed++;
          if (failed <= 10) console.error(`\n  ❌  ${mpn}: ${err.message}`);
        }
      }

      offset += catalogBatch.length;
      saveCheckpoint({ offset, written, skipped, failed });

      const pct = Math.round((offset / totalNum) * 100);
      process.stdout.write(
        `\r  Progress: ${offset.toLocaleString()} / ${totalNum.toLocaleString()} products (${pct}%) | descriptions written: ${written.toLocaleString()} | no-description: ${skipped.toLocaleString()}`
      );
    }

    clearCheckpoint();

    console.log(`\n\n✅  Phase 2.4 complete!`);
    console.log(`   Descriptions written:         ${written.toLocaleString()}`);
    console.log(`   Products with no description: ${skipped.toLocaleString()}`);
    console.log(`   Failed:                       ${failed}`);

    // Final DB count
    const { rows: [summary] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') AS with_desc,
        COUNT(*) AS total
      FROM public.catalog_products
    `);
    const pct = Math.round((Number(summary.with_desc) / Number(summary.total)) * 100);
    console.log(`\n   DB totals:`);
    console.log(`     With description: ${Number(summary.with_desc).toLocaleString()} / ${Number(summary.total).toLocaleString()} (${pct}%)`);

    // Vendor source breakdown
    const { rows: breakdown } = await client.query(`
      SELECT
        vendor_code,
        COUNT(*) FILTER (WHERE description_raw IS NOT NULL AND description_raw != '' AND description_raw != 'null') AS with_desc,
        COUNT(*) AS total
      FROM vendor.vendor_products
      GROUP BY vendor_code
      ORDER BY vendor_code
    `);
    console.log(`\n   Source breakdown:`);
    for (const row of breakdown) {
      console.log(`     ${row.vendor_code}: ${Number(row.with_desc).toLocaleString()} / ${Number(row.total).toLocaleString()} had descriptions`);
    }

  } catch (err) {
    console.error('\n❌  Phase 2.4 failed:', err.message);
    console.error('    Re-run node phase2-descriptions.js to resume from checkpoint.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
