/**
 * update_vtwin_custom_application_universal.mjs
 *
 * Fourth pass over catalog_vtwin_enriched.csv. The ~2,363 rows whose
 * fitment_details reads "Custom application..." / "Custom Application" (no
 * specific model/year -- these are chopper-build parts: mounting hardware,
 * carburetor adapters, patches, reference books, tie-downs, that "bolt to
 * whatever you're building") were left unstructured by both the strict and
 * recovered fitment parsers, and the scraper's own is_universal column only
 * caught 2 of them.
 *
 * lib/eras/config.ts defines the 'chopper' era as universal:true, families:[]
 * -- i.e. driven entirely by catalog_unified.is_universal, not by
 * family/year matching like every other era. recompute_era_flags.mjs
 * deliberately left era_chopper uncomputed because is_universal had no
 * trustworthy signal (100% false). This flips is_universal true for the
 * "Custom application" rows (false -> true only, same safe direction as
 * import_vtwin_ds_product_details.mjs's is_universal pass), feeding
 * era_chopper the second half of its real signal.
 *
 * Usage:
 *   node scripts/ingest/update_vtwin_custom_application_universal.mjs           # dry run
 *   node scripts/ingest/update_vtwin_custom_application_universal.mjs --apply
 */
'use strict';

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const CSV_PATH = '/Users/home/Desktop/ds-fitment-scraper/catalog_vtwin_enriched.csv';
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const found = rows.filter((r) => r.fitment_status === 'found' && r.is_harley_fitment?.trim().toLowerCase() === 'true');

  const customSkus = [...new Set(
    found
      .filter((r) => (r.fitment_details || '').toLowerCase().includes('custom applicat'))
      .map((r) => r.sku.trim())
  )];
  console.log(`"Custom application" rows: ${customSkus.length}`);

  const client = await pool.connect();
  const { rows: toFlip } = await client.query(
    `SELECT sku FROM catalog_unified WHERE sku = ANY($1) AND is_universal = false`,
    [customSkus]
  );
  const skipped = customSkus.length - toFlip.length;
  console.log(`To flip false->true: ${toFlip.length}, already true: ${skipped}`);

  if (!APPLY) {
    console.log('\nDry run -- no writes made. Re-run with --apply to write.');
    client.release();
    await pool.end();
    return;
  }

  let written = 0;
  for (const batch of chunks(toFlip.map((r) => r.sku), BATCH)) {
    const res = await client.query(`UPDATE catalog_unified SET is_universal = true WHERE sku = ANY($1)`, [batch]);
    written += res.rowCount;
    process.stdout.write(`\r  is_universal flipped: ${written}`);
  }
  console.log(`\n\nDone. is_universal +${written}`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
