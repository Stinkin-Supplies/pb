/**
 * import_ds_fitment_scraper.mjs
 *
 * Parses /Users/home/Desktop/ds-fitment-scraper/catalog_fitment_enriched.csv
 * (19,559 rows; only fitment_status='found' rows, 13,944, carry usable data)
 * into two staging tables -- never writes to catalog_fitment_v2 or
 * catalog_oem_crossref directly. See OEM_FITMENT_DATA_MODEL.md.
 *
 * fitment_details format (semicolon-separated entries, each with two
 * trailing tab-separated placeholder fields that are always "-"):
 *   "1988-1989 Harley-Davidson FLSTC Heritage Softail Classic\t-\t-"
 * Parsed into (model_code, model_name, year_start, year_end) and staged in
 * fitment_staging with sku_key_type resolved via the same normalization
 * (strip dashes, DS-prefix) verified against catalog_unified at 99.1%.
 *
 * oem_numbers is NOT trustworthy as-is: 81.7% of 'found' rows have
 * year-range junk mixed in (the scraper's OEM selector appears to have
 * picked up fitment-table year cells too), and PU's own site restates the
 * SKU as "XXXX-XXXX" (e.g. sku 09101918 -> "0910-1918") inside that same
 * cell -- never a real cross-referenced part number. This script filters
 * out both before staging the rest in oem_crossref_staging -- everything
 * else still goes through the existing validate_oem_crossref_staging.mjs
 * gate, so a bad token that slips through this filter still gets caught
 * downstream (no_product_match / conflict checks), not trusted blindly.
 *
 * Join key: sku (this file's skus resolve against catalog_unified.sku after
 * normalizing dashes/DS- prefix -- these are PU/Drag Specialties part
 * numbers, not vendor_sku).
 *
 * Usage:
 *   node scripts/ingest/import_ds_fitment_scraper.mjs           # dry run
 *   node scripts/ingest/import_ds_fitment_scraper.mjs --apply   # writes to both staging tables
 */
'use strict';

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const CSV_PATH = '/Users/home/Desktop/ds-fitment-scraper/catalog_fitment_enriched.csv';
const SOURCE = 'ds_fitment_scraper';
const SOURCE_BATCH = `ds_fitment_scraper_${new Date().toISOString().slice(0, 10)}`;
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const FITMENT_ENTRY_RE = /^(\d{4})(?:-(\d{4}))?\s+Harley[\s-]Davidson\s+(\S+)(?:\s+(.+))?$/;
const YEAR_RANGE_JUNK_RE = /^(19|20)\d{2}-(19|20)\d{2}$/;
const BARE_YEAR_JUNK_RE = /^(19|20)\d{2}$/;
// PU restates its own SKU as XXXX-XXXX (e.g. sku 09101918 -> "0910-1918")
// inside the OEM cell on its site; this is never a real cross-referenced
// part number, just the vendor's own SKU with a dash inserted.
const PU_SKU_FORMAT_JUNK_RE = /^\d{4}-\d{4}$/;

function normalizeSkuKey(s) {
  return s.trim().replace(/^DS-?/, 'DS').replace(/-/g, '');
}

function parseFitmentDetails(sku, text) {
  const out = [];
  const entries = text.split(';').map((e) => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const firstField = entry.split('\t')[0].trim();
    const m = firstField.match(FITMENT_ENTRY_RE);
    if (!m) continue;
    const yearStart = parseInt(m[1], 10);
    const yearEnd = m[2] ? parseInt(m[2], 10) : yearStart;
    out.push({ sku, modelCode: m[3], modelName: m[4] ? m[4].trim() : null, yearStart, yearEnd });
  }
  return out;
}

function cleanOemNumbers(raw) {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(';')
    .map((t) => t.trim())
    .filter((t) =>
      t &&
      !YEAR_RANGE_JUNK_RE.test(t) &&
      !BARE_YEAR_JUNK_RE.test(t) &&
      !PU_SKU_FORMAT_JUNK_RE.test(t)
    );
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const found = rows.filter((r) => r.fitment_status === 'found');
  console.log(`Parsed ${rows.length} total rows, ${found.length} with fitment_status='found'`);

  // Build a normalized-sku -> real catalog_unified.sku lookup once
  const client = await pool.connect();
  const { rows: allSkus } = await client.query(`SELECT sku FROM catalog_unified`);
  const normToReal = new Map();
  for (const r of allSkus) normToReal.set(normalizeSkuKey(r.sku), r.sku);

  const fitmentCandidates = [];
  const oemCandidates = [];
  let skuUnresolved = 0;
  let entriesParsed = 0;

  for (const r of found) {
    const realSku = allSkus.some((s) => s.sku === r.sku.trim())
      ? r.sku.trim()
      : normToReal.get(normalizeSkuKey(r.sku));
    if (!realSku) { skuUnresolved++; continue; }

    const fitmentEntries = parseFitmentDetails(realSku, r.fitment_details || '');
    entriesParsed += fitmentEntries.length;
    fitmentCandidates.push(...fitmentEntries);

    const oemTokens = cleanOemNumbers(r.oem_numbers);
    for (const token of oemTokens) oemCandidates.push({ sku: realSku, oemNumber: token });
  }

  console.log(`SKUs unresolved against catalog_unified: ${skuUnresolved}`);
  console.log(`Fitment entries parsed: ${entriesParsed} (from ${fitmentCandidates.length > 0 ? new Set(fitmentCandidates.map(f=>f.sku)).size : 0} distinct SKUs)`);
  console.log(`Clean OEM number candidates (post-junk-filter): ${oemCandidates.length}`);

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
