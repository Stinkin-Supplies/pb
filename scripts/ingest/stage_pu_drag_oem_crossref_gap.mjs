/**
 * stage_pu_drag_oem_crossref_gap.mjs
 *
 * Finds (oem_number, product) pairs present in pu_drag_oem_crossref_reference
 * (the official DRAG Specialties chart, see 118_pu_drag_oem_crossref_reference.sql)
 * that resolve to a real PU product in catalog_unified but are missing from
 * the live catalog_oem_crossref table, and stages them into
 * oem_crossref_staging for the normal validate/promote review pipeline --
 * NOT a direct write to catalog_oem_crossref.
 *
 * Usage:
 *   node stage_pu_drag_oem_crossref_gap.mjs           # dry run
 *   node stage_pu_drag_oem_crossref_gap.mjs --apply   # writes to oem_crossref_staging
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SOURCE = 'pu_drag_oem_crossref_reference';
const SOURCE_BATCH = `pu_drag_oem_crossref_reference_${new Date().toISOString().slice(0, 10)}`;
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const client = await pool.connect();

  const { rows: missing } = await client.query(`
    WITH matched AS (
      SELECT DISTINCT r.oem_number, pc.sku
      FROM pu_drag_oem_crossref_reference r
      JOIN pu_catalog pc ON pc.sku = REPLACE(r.drag_part_number, '-', '') OR pc.vendor_part_punctuated = r.drag_part_number
      JOIN catalog_unified cu ON cu.sku = pc.sku AND cu.source_vendor = 'PU'
    )
    SELECT m.oem_number, m.sku
    FROM matched m
    JOIN catalog_unified cu ON cu.sku = m.sku AND cu.source_vendor = 'PU'
    WHERE NOT EXISTS (
      SELECT 1 FROM catalog_oem_crossref coc WHERE coc.product_id = cu.id AND coc.oem_number = m.oem_number
    )
  `);

  console.log(`Found ${missing.length} (oem_number, sku) pairs missing from catalog_oem_crossref.`);
  console.log('Sample:', missing.slice(0, 5));

  if (!APPLY) {
    console.log('\nDry run -- no writes made. Re-run with --apply to stage.');
    client.release();
    await pool.end();
    return;
  }

  let inserted = 0;
  for (const batch of chunks(missing, BATCH)) {
    const values = [];
    const params = [];
    let idx = 1;
    for (const m of batch) {
      values.push(`($${idx++}, 'sku', $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(m.sku, m.oem_number, SOURCE, 'pu cross ref.pdf', SOURCE_BATCH);
    }
    const res = await client.query(
      `INSERT INTO oem_crossref_staging (sku, sku_key_type, oem_number, source, source_file, source_batch)
       VALUES ${values.join(',')}
       ON CONFLICT (sku, oem_number, source) DO NOTHING`,
      params
    );
    inserted += res.rowCount;
  }
  console.log(`\nStaged ${inserted} rows into oem_crossref_staging (batch: ${SOURCE_BATCH}).`);
  console.log(`Next: node scripts/ingest/validate_oem_crossref_staging.mjs --batch=${SOURCE_BATCH} --apply`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
