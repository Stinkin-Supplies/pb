/**
 * import_wps_cross_fitment.mjs
 *
 * Loads scripts/data/wps-cross-fitment.csv (columns: OEM#,WPS#,Vendor,Vend#)
 * into oem_crossref_staging -- NOT directly into catalog_oem_crossref. Per
 * the staging-first policy in OEM_FITMENT_DATA_MODEL.md, every new source
 * document lands here first, then gets validate_oem_crossref_staging.mjs run
 * against it before anything is promoted.
 *
 * Column mapping:
 *   WPS#    -> sku (sku_key_type='vendor_sku' -- WPS joins on vendor_sku, not sku,
 *              per the vendor join-key footgun documented in
 *              OEM_FITMENT_DATA_MODEL.md)
 *   OEM#    -> oem_number
 *   Vendor  -> oem_manufacturer (the actual part brand, e.g. "Accel",
 *              "James Gaskets" -- NOT "WPS" itself, WPS is just the distributor)
 *   Vend#   -> page_reference (repurposed as a free-text "brand's own catalog
 *              number" field -- there's no dedicated column for this and it's
 *              secondary reference info, not needed to establish the crossref link)
 *
 * Usage:
 *   node scripts/ingest/import_wps_cross_fitment.mjs           # dry run, reports only
 *   node scripts/ingest/import_wps_cross_fitment.mjs --apply   # writes to oem_crossref_staging
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const CSV_PATH = 'scripts/data/wps-cross-fitment.csv';
const SOURCE = 'wps_cross_fitment_csv';
const SOURCE_BATCH = `wps_cross_fitment_${new Date().toISOString().slice(0, 10)}`;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  console.log(`\nParsed ${records.length} rows from ${CSV_PATH}`);

  const rows = [];
  let skippedBlank = 0;
  for (const r of records) {
    const oemNumber = (r['OEM#'] ?? '').trim();
    const wpsSku = (r['WPS#'] ?? '').trim();
    const vendor = (r['Vendor'] ?? '').trim() || null;
    const vendNum = (r['Vend#'] ?? '').trim() || null;
    if (!oemNumber || !wpsSku) {
      skippedBlank++;
      continue;
    }
    rows.push({ oemNumber, wpsSku, vendor, vendNum });
  }

  console.log(`  usable rows           : ${rows.length}`);
  console.log(`  skipped (blank fields): ${skippedBlank}`);
  console.log(`  source_batch          : ${SOURCE_BATCH}\n`);

  if (!APPLY) {
    console.log('Sample (first 5):');
    for (const r of rows.slice(0, 5)) {
      console.log(`  sku=${r.wpsSku}  oem_number=${r.oemNumber}  oem_manufacturer=${r.vendor}  page_reference=${r.vendNum}`);
    }
    console.log('\nDry run -- no writes made. Re-run with --apply to persist to oem_crossref_staging.\n');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted = 0;
    for (const r of rows) {
      const result = await client.query(
        `INSERT INTO oem_crossref_staging
           (sku, sku_key_type, oem_number, oem_manufacturer, source, source_file, page_reference, source_batch)
         VALUES ($1, 'vendor_sku', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (sku, oem_number, source) DO NOTHING`,
        [r.wpsSku, r.oemNumber, r.vendor, SOURCE, CSV_PATH, r.vendNum, SOURCE_BATCH]
      );
      inserted += result.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Inserted ${inserted} new staging row(s) (${rows.length - inserted} already present, skipped by ON CONFLICT).`);
    console.log(`\nNext: node scripts/ingest/validate_oem_crossref_staging.mjs --batch=${SOURCE_BATCH} --apply\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
