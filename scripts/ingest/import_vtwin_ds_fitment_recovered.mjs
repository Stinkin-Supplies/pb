/**
 * import_vtwin_ds_fitment_recovered.mjs
 *
 * Third pass over /Users/home/Desktop/ds-fitment-scraper/catalog_vtwin_enriched.csv.
 * import_vtwin_ds_fitment_scraper.mjs's FITMENT_ENTRY_RE required an exact
 * "CODE YYYY" or "CODE YYYY-YYYY" match, so ~6,328 of the 13,654 harley-fitment
 * rows produced zero parsed entries. Spot-checking those misses found two
 * shapes:
 *
 *   1. Genuinely unstructured text ("All models", "Custom application...") --
 *      correctly skipped, nothing to recover (~5,006 rows).
 *   2. Real code+year data the strict regex rejected only because of an
 *      open-ended "-UP" end year or trailing descriptive text after the year
 *      token, e.g. "FXR 1982-1987 Early 1987", "XL 2014-UP",
 *      "EL 1936-1936 Only", "FLST 2007-UP; FXST 2007-UP" (~1,322 rows).
 *
 * This script re-parses ONLY the entries the strict regex already failed on
 * (so it can never insert a duplicate of what the first pass staged) using a
 * prefix match: CODE, then YYYY-YYYY or YYYY-UP, ignoring anything after.
 * "UP" maps to CURRENT_YEAR, matching this DB's own convention for
 * currently-in-production models (verified: FLFB/FLHC show end_year=2026,
 * the current year, not NULL).
 *
 * Same source ('vtwin_ds_scraper') so the existing validate/promote pipeline
 * treats these identically; distinct source_batch so this pass stays
 * traceable and re-runnable independent of the original.
 *
 * Usage:
 *   node scripts/ingest/import_vtwin_ds_fitment_recovered.mjs           # dry run
 *   node scripts/ingest/import_vtwin_ds_fitment_recovered.mjs --apply   # writes to fitment_staging
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
const SOURCE_BATCH = `vtwin_ds_scraper_${new Date().toISOString().slice(0, 10)}_recovered`;
const CURRENT_YEAR = new Date().getFullYear();
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const STRICT_RE = /^(\S+)\s+(\d{4})(?:-(\d{4}))?$/;
const RECOVER_RE = /^(\S+)\s+(\d{4})-(\d{4}|UP)\b/i;

function parseStrict(entry) {
  const m = entry.match(STRICT_RE);
  if (!m) return null;
  const yearStart = parseInt(m[2], 10);
  const yearEnd = m[3] ? parseInt(m[3], 10) : yearStart;
  return { modelCode: m[1], yearStart, yearEnd };
}

function parseRecovered(entry) {
  const m = entry.match(RECOVER_RE);
  if (!m) return null;
  const yearStart = parseInt(m[2], 10);
  const yearEnd = m[3].toUpperCase() === 'UP' ? CURRENT_YEAR : parseInt(m[3], 10);
  return { modelCode: m[1], yearStart, yearEnd };
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

  const client = await pool.connect();
  const skuSet = new Set((await client.query(`SELECT sku FROM catalog_unified`)).rows.map((r) => r.sku));

  const recovered = [];
  let skuUnresolved = 0;
  let strictOk = 0;
  let stillUnrecoverable = 0;

  for (const r of found) {
    const sku = r.sku.trim();
    if (!skuSet.has(sku)) { skuUnresolved++; continue; }

    const entries = (r.fitment_details || '').split(';').map((e) => e.trim()).filter(Boolean);
    for (const entry of entries) {
      if (parseStrict(entry)) { strictOk++; continue; } // already staged by the first pass
      const rec = parseRecovered(entry);
      if (rec) {
        recovered.push({ sku, modelCode: rec.modelCode, yearStart: rec.yearStart, yearEnd: rec.yearEnd, raw: entry });
      } else {
        stillUnrecoverable++;
      }
    }
  }

  console.log(`SKUs unresolved against catalog_unified: ${skuUnresolved}`);
  console.log(`Entries already covered by the strict pass: ${strictOk}`);
  console.log(`Entries recovered by the permissive pass: ${recovered.length}`);
  console.log(`Entries still unrecoverable (genuinely unstructured, e.g. "All models"): ${stillUnrecoverable}`);

  if (!APPLY) {
    console.log('\nSample recovered entries:', recovered.slice(0, 8).map((r) => ({ sku: r.sku, raw: r.raw, modelCode: r.modelCode, yearStart: r.yearStart, yearEnd: r.yearEnd })));
    console.log('\nDry run -- no writes made. Re-run with --apply to stage.');
    client.release();
    await pool.end();
    return;
  }

  let inserted = 0;
  for (const batch of chunks(recovered, BATCH)) {
    const vals = [];
    const params = [];
    let idx = 1;
    for (const f of batch) {
      vals.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
      params.push(f.sku, f.modelCode, null, f.yearStart, f.yearEnd, SOURCE, CSV_PATH, SOURCE_BATCH);
    }
    const res = await client.query(
      `INSERT INTO fitment_staging (sku, model_code_raw, model_name_raw, year_start, year_end, source, source_file, source_batch)
       VALUES ${vals.join(',')}
       ON CONFLICT (sku, model_code_raw, year_start, year_end, source) DO NOTHING`,
      params
    );
    inserted += res.rowCount;
    process.stdout.write(`\r  fitment_staging: ${inserted} inserted`);
  }
  console.log();

  console.log(`\nDone. fitment_staging +${inserted} (batch: ${SOURCE_BATCH})`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
