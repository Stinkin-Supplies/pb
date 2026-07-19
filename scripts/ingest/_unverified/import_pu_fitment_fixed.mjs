/**
 * import_pu_fitment.mjs
 *
 * Imports PU fitment data from catalog_fitment_enriched.csv into:
 *   - harley_model_years   (creates missing year rows as needed)
 *   - catalog_fitment_v2   (product_id → model_year_id)
 *   - catalog_oem_crossref (cleaned OEM numbers)
 *
 * Usage:
 *   node import_pu_fitment.mjs --dry-run    # stats only, no writes
 *   node import_pu_fitment.mjs --verbose    # log misses
 *   node import_pu_fitment.mjs              # live import
 *
 * Place this file at scripts/ingest/ and the CSV at the project root,
 * or adjust CSV_PATH below.
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import pg from 'pg';

const { Pool } = pg;
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');
const FITMENT_SOURCE = 'pu_enriched_csv';

// Adjust this path to wherever you placed catalog_fitment_enriched.csv
const CSV_PATH = new URL('../../catalog_fitment_enriched.csv', import.meta.url).pathname;

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  user: 'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
});

// ─── OEM cleanup ──────────────────────────────────────────────────────────────
const YEAR_RE    = /^(19|20)\d{2}(-(19|20)\d{2})?$/;
const NOISE_NUMS = new Set(['1200', '1370', '1560', '9044']);

function extractCleanOems(raw) {
  if (!raw) return [];
  return raw.split(';').map(t => t.trim()).filter(t => t && !YEAR_RE.test(t) && !NOISE_NUMS.has(t));
}

// ─── Fitment entry parser ─────────────────────────────────────────────────────
const ENTRY_RE      = /^(\d{4})(?:-(\d{4}))?\s+Harley[\s\-]Davidson\s+(.+)$/i;
const MODEL_CODE_RE = /\b(FL[A-Z0-9]{0,8}(?:-[A-Z0-9]+)?|FX[A-Z0-9]{0,8}(?:-[A-Z0-9]+)?|XL[A-Z0-9]{0,8}(?:-[A-Z0-9]+)?|XR[A-Z0-9]{0,8}|VR[A-Z0-9]{0,8}|KH?[A-Z0-9]{0,6}|XG[A-Z0-9]{0,8}|EL[A-Z0-9]{0,4}|WL[A-Z0-9]{0,4}|UL[A-Z0-9]{0,4}|RA[A-Z0-9]{0,8}|RH[A-Z0-9]{0,8}|VL[A-Z0-9]{0,6})\b/;

function parseFitmentEntry(raw) {
  const main = raw.trim().split('\t')[0].trim();
  const m = ENTRY_RE.exec(main);
  if (!m) return null;
  const yearStart = parseInt(m[1], 10);
  const yearEnd   = m[2] ? parseInt(m[2], 10) : yearStart;
  const rest      = m[3].trim();
  const codeMatch = MODEL_CODE_RE.exec(rest);
  const modelCode = codeMatch ? codeMatch[0] : null;
  return { yearStart, yearEnd, modelCode };
}

// ─── CSV reader ───────────────────────────────────────────────────────────────
async function readCsv(path) {
  return new Promise((resolve, reject) => {
    const records = [];
    createReadStream(path)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', r => records.push(r))
      .on('end',  () => resolve(records))
      .on('error', reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`CSV:  ${CSV_PATH}`);
  const client = await pool.connect();

  try {
    // ── 1. Load reference maps ────────────────────────────────────────────────

    // catalog_unified: sku variants → product id
    const { rows: cuRows } = await client.query(
      `SELECT id, sku, sku_normalized FROM catalog_unified WHERE sku IS NOT NULL`
    );
    const skuToId = new Map();
    for (const r of cuRows) {
      skuToId.set(r.sku, r.id);
      if (r.sku_normalized) skuToId.set(r.sku_normalized, r.id);
      skuToId.set(r.sku.replace(/-/g, ''), r.id);
    }
    console.log(`catalog_unified: ${cuRows.length} products`);

    // harley_models: model_code (uppercase) → row
    const { rows: hmRows } = await client.query(
      `SELECT id, model_code, start_year, end_year FROM harley_models`
    );
    const codeToModel = new Map();
    for (const r of hmRows) codeToModel.set(r.model_code.toUpperCase(), r);
    console.log(`harley_models: ${hmRows.length} models`);

    // harley_model_years: "model_id:year" → hmy id
    const { rows: hmyRows } = await client.query(
      `SELECT id, model_id, year FROM harley_model_years`
    );
    const modelYearToId = new Map();
    for (const r of hmyRows) modelYearToId.set(`${r.model_id}:${r.year}`, r.id);
    console.log(`harley_model_years: ${hmyRows.length} rows`);

    // ── 2. Parse CSV ──────────────────────────────────────────────────────────
    const records = await readCsv(CSV_PATH);
    console.log(`CSV rows: ${records.length}`);

    const stats = {
      skuFound: 0, skuMissing: 0,
      fitmentRows: 0, modelCodeMiss: 0, yearOutOfRange: 0, parseErrors: 0,
      newHmy: 0, fitmentInserts: 0, oemInserts: 0,
    };

    const newHmyNeeded = new Map();  // "model_id:year" → {model_id, year}
    const fitmentRows  = [];          // {product_id, model_id, year}
    const oemRows      = new Map();   // "sku:oem_number" → {sku, oem_number}
    
    for (const record of records) {
      if (record.fitment_status !== 'found') continue;

      const rawSku    = record.sku;
      const normSku   = rawSku.replace(/-/g, '');
      const productId = skuToId.get(rawSku) ?? skuToId.get(normSku);

      if (!productId) {
        stats.skuMissing++;
        if (VERBOSE) console.log(`  SKU MISS: ${rawSku}`);
        continue;
      }
      stats.skuFound++;

      const entries = record.fitment_details
        ? record.fitment_details.split(';').map(e => e.trim()).filter(Boolean)
        : [];

      for (const rawEntry of entries) {
        const parsed = parseFitmentEntry(rawEntry);
        if (!parsed) { stats.parseErrors++; continue; }

        const model = parsed.modelCode ? codeToModel.get(parsed.modelCode.toUpperCase()) : null;
        if (!model) {
          stats.modelCodeMiss++;
          if (VERBOSE && parsed.modelCode) console.log(`  MODEL MISS: ${parsed.modelCode}`);
          continue;
        }

        for (let yr = parsed.yearStart; yr <= parsed.yearEnd; yr++) {
          // Allow 1 year buffer beyond model range to handle minor data inconsistencies
          if (yr < model.start_year - 1 || yr > model.end_year + 1) {
            stats.yearOutOfRange++;
            continue;
          }
          const key = `${model.id}:${yr}`;
          if (!modelYearToId.has(key)) newHmyNeeded.set(key, { model_id: model.id, year: yr });
          fitmentRows.push({ product_id: productId, model_id: model.id, year: yr });
          stats.fitmentRows++;
        }
      }

      for (const oem of extractCleanOems(record.oem_numbers)) {
        oemRows.set(`${normSku}:${oem}`, { sku: normSku, oem_number: oem });
      }
    }

    // ── 3. Stats ──────────────────────────────────────────────────────────────
    console.log('\n=== Pre-import stats ===');
    console.log(`SKU resolved:              ${stats.skuFound}`);
    console.log(`SKU missing (not in DB):   ${stats.skuMissing}`);
    console.log(`Fitment rows to write:     ${stats.fitmentRows}`);
    console.log(`  Model code misses:       ${stats.modelCodeMiss}`);
    console.log(`  Year out of range:       ${stats.yearOutOfRange}`);
    console.log(`  Parse errors:            ${stats.parseErrors}`);
    console.log(`New harley_model_years:    ${newHmyNeeded.size}`);
    console.log(`OEM rows to write:         ${oemRows.length}`);

    if (DRY_RUN) {
      if (newHmyNeeded.size > 0) {
        console.log('\nSample new harley_model_years needed:');
        [...newHmyNeeded.values()].slice(0, 10).forEach(r => {
          const mc = hmRows.find(m => m.id === r.model_id)?.model_code;
          console.log(`  ${mc} year=${r.year}`);
        });
      }
      console.log('\nSample fitment rows:');
      fitmentRows.slice(0, 5).forEach(r => {
        const mc = hmRows.find(m => m.id === r.model_id)?.model_code;
        console.log(`  product_id=${r.product_id} ${mc} ${r.year}`);
      });
      console.log('\nSample OEM rows:');
      oemRows.slice(0, 5).forEach(r => console.log(`  ${r.sku} → ${r.oem_number}`));
      return;
    }

    // ── 4. Write ──────────────────────────────────────────────────────────────
    await client.query('BEGIN');
    const CHUNK = 500;

    // 4a. Create missing harley_model_years
    if (newHmyNeeded.size > 0) {
      console.log(`\nCreating ${newHmyNeeded.size} new harley_model_years rows...`);
      const arr = [...newHmyNeeded.values()];
      for (let i = 0; i < arr.length; i += CHUNK) {
        const chunk = arr.slice(i, i + CHUNK);
        const vals   = chunk.map((_, j) => `($${j*2+1},$${j*2+2})`).join(',');
        const params = chunk.flatMap(r => [r.model_id, r.year]);
        const { rows: created } = await client.query(
          `INSERT INTO harley_model_years (model_id, year)
           VALUES ${vals}
           ON CONFLICT (model_id, year) DO NOTHING
           RETURNING id, model_id, year`,
          params
        );
        for (const r of created) {
          modelYearToId.set(`${r.model_id}:${r.year}`, r.id);
          stats.newHmy++;
        }
      }
      console.log(`  Created ${stats.newHmy}`);
    }

    // 4b. Delete old pu_enriched_csv rows
    const { rowCount: deletedFit } = await client.query(
      `DELETE FROM catalog_fitment_v2 WHERE fitment_source = $1`, [FITMENT_SOURCE]
    );
    console.log(`\nDeleted ${deletedFit} existing fitment rows`);

    // 4c. Insert catalog_fitment_v2
    console.log(`Inserting ${fitmentRows.length} fitment rows...`);
    let fitInserted = 0;
    for (let i = 0; i < fitmentRows.length; i += CHUNK) {
      const chunk    = fitmentRows.slice(i, i + CHUNK);
      const resolved = [];
      for (const r of chunk) {
        const hmyId = modelYearToId.get(`${r.model_id}:${r.year}`);
        if (hmyId) resolved.push({ product_id: r.product_id, model_year_id: hmyId });
      }
      if (!resolved.length) continue;
      const vals   = resolved.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(',');
      const params = resolved.flatMap(r => [r.product_id, r.model_year_id, FITMENT_SOURCE]);
      await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source)
         VALUES ${vals}
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        params
      );
      fitInserted += resolved.length;
      if (fitInserted % 20000 === 0) console.log(`  ${fitInserted}/${fitmentRows.length}...`);
    }
    stats.fitmentInserts = fitInserted;

    // 4d. OEM crossref
    const { rowCount: deletedOem } = await client.query(
      `DELETE FROM catalog_oem_crossref WHERE source_file = $1`, [FITMENT_SOURCE]
    );
    console.log(`\nDeleted ${deletedOem} existing OEM rows`);

    let oemInserted = 0;
    const oemRowsArr = [...oemRows.values()];
    for (let i = 0; i < oemRowsArr.length; i += CHUNK) {
      const oemChunk = oemRowsArr.slice(i, i + CHUNK);
      const vals   = oemChunk.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4})`).join(',');
      const params = oemChunk.flatMap(r => [r.sku, r.oem_number, 'Harley-Davidson', FITMENT_SOURCE]);
      await client.query(
        `INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
         VALUES ${vals}
         ON CONFLICT (sku, oem_number, oem_manufacturer) DO UPDATE SET source_file = EXCLUDED.source_file`,
        params
      );
      oemInserted += oemChunk.length;
    }
    stats.oemInserts = oemInserted;

    await client.query('COMMIT');

    console.log('\n=== Final stats ===');
    console.log(`harley_model_years created:  ${stats.newHmy}`);
    console.log(`catalog_fitment_v2 inserted: ${stats.fitmentInserts}`);
    console.log(`catalog_oem_crossref upsert: ${stats.oemInserts}`);
    console.log('\n✓ Import complete.');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nERROR — rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
