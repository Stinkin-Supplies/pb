#!/usr/bin/env node
/**
 * import_hd_parts_fitment.mjs
 *
 * Generates catalog_fitment_v2 rows from hd_parts_data_final.csv
 * (~/Downloads/hd_parts_data_final.csv).
 *
 * The CSV has: year, model (e.g. "FLHR ROAD KING (FB)"), assembly,
 * oem_part_number, part_description — covering 1979-2012, 41K unique OEM #s.
 *
 * Strategy:
 *   1. For each CSV row, extract model_code = first word of model column.
 *   2. Filter to rows whose OEM number exists in catalog_oem_crossref → get product_id(s).
 *   3. For each product + model_year combo, insert into catalog_fitment_v2 if missing.
 *
 * Only rows where model_code matches harley_models AND year is within that
 * model's harley_model_years are promoted.
 *
 * Usage:
 *   node scripts/ingest/import_hd_parts_fitment.mjs --dry-run
 *   node scripts/ingest/import_hd_parts_fitment.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_PATH = path.join(os.homedir(), 'Downloads', 'hd_parts_data_final.csv');
const SOURCE = 'hd_parts_data_final';
const CONFIDENCE = 0.85;

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV not found at', CSV_PATH);
    process.exit(1);
  }

  console.log('Loading DB reference tables...');

  // OEM → product_ids map (one OEM can link to multiple products)
  const { rows: crossrefRows } = await pool.query(`
    SELECT oem_number, product_id FROM catalog_oem_crossref WHERE product_id IS NOT NULL
  `);
  const oemToProducts = new Map();
  for (const r of crossrefRows) {
    if (!oemToProducts.has(r.oem_number)) oemToProducts.set(r.oem_number, new Set());
    oemToProducts.get(r.oem_number).add(r.product_id);
  }
  console.log(`  OEM numbers with product links: ${oemToProducts.size}`);

  // model_code → model rows
  const { rows: modelRows } = await pool.query(`
    SELECT id, model_code, start_year, end_year FROM harley_models
  `);
  const modelsByCode = new Map();
  for (const m of modelRows) {
    if (!modelsByCode.has(m.model_code)) modelsByCode.set(m.model_code, []);
    modelsByCode.get(m.model_code).push(m);
  }

  // model_id + year → model_year_id
  const { rows: yearRows } = await pool.query(`
    SELECT id, model_id, year FROM harley_model_years
  `);
  const myrMap = new Map();
  for (const y of yearRows) myrMap.set(`${y.model_id}:${y.year}`, y.id);

  // Existing fitment pairs to avoid duplicates
  console.log('Loading existing fitment pairs...');
  const { rows: existingRows } = await pool.query(`
    SELECT product_id, model_year_id FROM catalog_fitment_v2
  `);
  const existingPairs = new Set(existingRows.map(r => `${r.product_id}:${r.model_year_id}`));
  console.log(`  Existing pairs: ${existingPairs.size}`);

  // Parse CSV
  console.log('\nParsing CSV...');
  const lines = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
  let parsed = 0, skippedNoOem = 0, skippedNoModel = 0, skippedNoMyr = 0;
  const toInsert = []; // {productId, modelYearId}

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // year,model,assembly,oem_part_number,part_description
    const commaIdx1 = line.indexOf(',');
    const commaIdx2 = line.indexOf(',', commaIdx1 + 1);
    const commaIdx3 = line.indexOf(',', commaIdx2 + 1);
    const commaIdx4 = line.indexOf(',', commaIdx3 + 1);

    const year = parseInt(line.slice(0, commaIdx1));
    const model = line.slice(commaIdx1 + 1, commaIdx2);
    const oem = line.slice(commaIdx3 + 1, commaIdx4 >= 0 ? commaIdx4 : undefined)
      .trim().replace(/^"|"$/g, '');

    parsed++;
    if (!year || year < 1970 || !oem) { skippedNoOem++; continue; }

    const productIds = oemToProducts.get(oem);
    if (!productIds) { skippedNoOem++; continue; }

    const modelCode = model.split(' ')[0].trim();
    const models = modelsByCode.get(modelCode);
    if (!models) { skippedNoModel++; continue; }

    for (const m of models) {
      const myrId = myrMap.get(`${m.id}:${year}`);
      if (!myrId) { skippedNoMyr++; continue; }

      for (const productId of productIds) {
        const key = `${productId}:${myrId}`;
        if (existingPairs.has(key)) continue;
        existingPairs.add(key);
        toInsert.push({ productId, modelYearId: myrId });
      }
    }
  }

  console.log(`Parsed ${parsed} rows.`);
  console.log(`  Skipped (no OEM match or invalid): ${skippedNoOem}`);
  console.log(`  Skipped (model code not in DB):    ${skippedNoModel}`);
  console.log(`  Skipped (no harley_model_years):   ${skippedNoMyr}`);
  console.log(`\nNet-new fitment pairs to insert: ${toInsert.length}`);
  console.log(`Distinct products gaining fitment: ${new Set(toInsert.map(r => r.productId)).size}`);

  if (DRY_RUN) {
    console.log('\n--dry-run set, no writes performed.');
    await pool.end();
    return;
  }

  if (toInsert.length === 0) {
    console.log('Nothing to insert.');
    await pool.end();
    return;
  }

  console.log('\nWriting to catalog_fitment_v2...');
  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');
    const BATCH = 2000;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = [];
      const params = [];
      batch.forEach((r, idx) => {
        const base = idx * 4;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(r.productId, r.modelYearId, SOURCE, CONFIDENCE);
      });
      const res = await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
         VALUES ${values.join(',')}
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        params
      );
      written += res.rowCount;
      process.stdout.write(`  ${Math.min(i + BATCH, toInsert.length)}/${toInsert.length}\r`);
    }
    await client.query('COMMIT');
    console.log(`\nCommitted. ${written} new rows written.`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error, rolled back:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
