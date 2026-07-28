/**
 * import_vtwin_ds_fitment_scraper.mjs
 *
 * Parses /Users/home/Desktop/ds-fitment-scraper/catalog_vtwin_enriched.csv
 * (9,050 rows; 8,766 fitment_status='found', 8,697 with is_harley_fitment=true)
 * into fitment_staging / oem_crossref_staging -- never writes to
 * catalog_fitment_v2 or catalog_oem_crossref directly. See
 * import_ds_fitment_scraper.mjs (the PU counterpart) for the same pattern.
 *
 * Distinct source name 'vtwin_ds_scraper' -- deliberately NOT reusing the
 * existing 'vtwin_scrape' source already in catalog_fitment_v2 (374K rows
 * from an earlier, different scraper), so this batch stays traceable to
 * its own source_batch and doesn't get conflated with that legacy import.
 *
 * SKU handling: unlike the PU file, this file's sku column ("VT-37-1967")
 * already matches catalog_unified.sku exactly -- verified live, all 9,050
 * skus resolve with zero normalization needed (no dash-stripping/prefix
 * logic required, unlike PU's DS-prefix handling).
 *
 * fitment_details format (semicolon-separated "CODE YYYY-YYYY" or
 * "CODE YYYY" entries, e.g. "EL 1937-1946; FL 1937-1946; U 1937-1946"):
 * roughly 71% of entries match this shape; the rest are generic
 * "All models" / "Custom application..." free text with no structured
 * model/year to extract, and are silently skipped by the regex rather
 * than staged as junk.
 *
 * oem_numbers: checked for the same two junk patterns found in the PU
 * scrape (SKU-restated-as-OEM, year-range contamination) -- neither
 * appears here. Bare short numeric OEM values (e.g. "7905") were
 * spot-checked and found legitimate: the same number recurs only across
 * genuine finish variants of one physical part (Zinc/Parkerized/Chrome),
 * not across unrelated products the way PU's junk did. No filtering
 * applied beyond trimming.
 *
 * Usage:
 *   node scripts/ingest/import_vtwin_ds_fitment_scraper.mjs           # dry run
 *   node scripts/ingest/import_vtwin_ds_fitment_scraper.mjs --apply   # writes to both staging tables
 */
'use strict';

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const CSV_PATH = '/Users/home/Desktop/ds-fitment-scraper/catalog_vtwin_enriched.csv';
const SOURCE = 'vtwin_ds_scraper';
const SOURCE_BATCH = `vtwin_ds_scraper_${new Date().toISOString().slice(0, 10)}`;
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// "CODE YYYY-YYYY" or "CODE YYYY" -- CODE is whatever non-space token precedes
// the year(s) (model code like EL/FL/FXST, never contains spaces in this feed).
const FITMENT_ENTRY_RE = /^(\S+)\s+(\d{4})(?:-(\d{4}))?$/;

function parseFitmentDetails(sku, text) {
  const out = [];
  const entries = text.split(';').map((e) => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const m = entry.match(FITMENT_ENTRY_RE);
    if (!m) continue;
    const modelCode = m[1];
    const yearStart = parseInt(m[2], 10);
    const yearEnd = m[3] ? parseInt(m[3], 10) : yearStart;
    out.push({ sku, modelCode, modelName: null, yearStart, yearEnd });
  }
  return out;
}

function cleanOemNumbers(raw) {
  if (!raw || !raw.trim()) return [];
  return raw.split(';').map((t) => t.trim()).filter(Boolean);
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const found = rows.filter((r) => r.fitment_status === 'found' && r.is_harley_fitment?.trim().toLowerCase() === 'true');
  console.log(`Parsed ${rows.length} total rows, ${found.length} with fitment_status='found' AND is_harley_fitment=true`);

  // Confirm every sku resolves directly against catalog_unified (no normalization needed here)
  const client = await pool.connect();
  const { rows: allSkus } = await client.query(`SELECT sku FROM catalog_unified`);
  const skuSet = new Set(allSkus.map((r) => r.sku));

  const fitmentCandidates = [];
  const oemCandidates = [];
  let skuUnresolved = 0;

  for (const r of found) {
    const sku = r.sku.trim();
    if (!skuSet.has(sku)) { skuUnresolved++; continue; }

    const fitmentEntries = parseFitmentDetails(sku, r.fitment_details || '');
    fitmentCandidates.push(...fitmentEntries);

    const oemTokens = cleanOemNumbers(r.oem_numbers);
    for (const token of oemTokens) oemCandidates.push({ sku, oemNumber: token });
  }

  console.log(`SKUs unresolved against catalog_unified: ${skuUnresolved}`);
  console.log(`Fitment entries parsed: ${fitmentCandidates.length} (from ${new Set(fitmentCandidates.map(f => f.sku)).size} distinct SKUs)`);
  console.log(`OEM number candidates: ${oemCandidates.length}`);

  if (!APPLY) {
    console.log('\nSample fitment candidates:', fitmentCandidates.slice(0, 5));
    console.log('Sample OEM candidates:', oemCandidates.slice(0, 5));
    console.log('\nDry run -- no writes made. Re-run with --apply to stage both.');
    client.release();
    await pool.end();
    return;
  }

  let fitmentInserted = 0;
  for (const batch of chunks(fitmentCandidates, BATCH)) {
    const vals = [];
    const params = [];
    let idx = 1;
    for (const f of batch) {
      vals.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
      params.push(f.sku, f.modelCode, f.modelName, f.yearStart, f.yearEnd, SOURCE, CSV_PATH, SOURCE_BATCH);
    }
    const res = await client.query(
      `INSERT INTO fitment_staging (sku, model_code_raw, model_name_raw, year_start, year_end, source, source_file, source_batch)
       VALUES ${vals.join(',')}
       ON CONFLICT (sku, model_code_raw, year_start, year_end, source) DO NOTHING`,
      params
    );
    fitmentInserted += res.rowCount;
    process.stdout.write(`\r  fitment_staging: ${fitmentInserted} inserted`);
  }
  console.log();

  let oemInserted = 0;
  for (const batch of chunks(oemCandidates, BATCH)) {
    const vals = [];
    const params = [];
    let idx = 1;
    for (const o of batch) {
      vals.push(`($${idx++}, 'sku', $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(o.sku, o.oemNumber, SOURCE, CSV_PATH, SOURCE_BATCH);
    }
    const res = await client.query(
      `INSERT INTO oem_crossref_staging (sku, sku_key_type, oem_number, source, source_file, source_batch)
       VALUES ${vals.join(',')}
       ON CONFLICT (sku, oem_number, source) DO NOTHING`,
      params
    );
    oemInserted += res.rowCount;
    process.stdout.write(`\r  oem_crossref_staging: ${oemInserted} inserted`);
  }
  console.log();

  console.log(`\nDone. fitment_staging +${fitmentInserted}, oem_crossref_staging +${oemInserted} (batch: ${SOURCE_BATCH})`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
