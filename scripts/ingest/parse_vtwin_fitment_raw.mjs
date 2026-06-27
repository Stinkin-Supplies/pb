#!/usr/bin/env node
/**
 * parse_vtwin_fitment_raw.mjs
 *
 * Parses fitment_raw strings from vtwin_scrape_data for products that have
 * scrape data but no catalog_fitment_v2 rows. Inserts model_year_id rows
 * with fitment_source='vtwin_fitment_raw'.
 *
 * Patterns handled:
 *   FL 1937-1946
 *   FLT 2009-UP
 *   EL 1936-1952 front and rear | W 1936-1952 rear   (pipe-separated)
 *
 * Silently skips:
 *   - Model codes not in harley_models (Chief, Scout, Excelsior, Custom, etc.)
 *   - Segments with no parseable year range
 *
 * Usage:
 *   node parse_vtwin_fitment_raw.mjs           # dry run
 *   node parse_vtwin_fitment_raw.mjs --apply   # write to DB
 */

import pg from 'pg';
const { Pool } = pg;

const APPLY = process.argv.includes('--apply');
const DB_URL = process.env.CATALOG_DATABASE_URL
  || 'postgresql://catalog_app@5.161.100.126:5432/stinkin_catalog';

const pool = new Pool({ connectionString: DB_URL });

// Regex: MODEL_CODE YEAR-YEAR or MODEL_CODE YEAR-UP/PRESENT
// Allows trailing text ("61\"", "front and rear", etc.)
const SEGMENT_RE = /^([A-Z][A-Z0-9_]*)\s+(\d{4})\s*[-–]\s*(\d{4}|up|present)\b/i;

async function main() {
  const db = await pool.connect();
  try {
    // ── Load reference data ───────────────────────────────────────────────────

    const { rows: modelRows } = await db.query(
      `SELECT DISTINCT model_code FROM harley_models`
    );
    const validModelCodes = new Set(modelRows.map(r => r.model_code.toUpperCase()));

    const { rows: [{ max_year: maxYear }] } = await db.query(
      `SELECT MAX(year) AS max_year FROM harley_model_years`
    );
    console.log(`Max year in harley_model_years: ${maxYear}`);
    console.log(`Valid HD model codes: ${validModelCodes.size}`);

    // model_code (upper) → year → Set of model_year_ids
    const { rows: myRows } = await db.query(`
      SELECT hmy.id, hmy.year, UPPER(hm.model_code) AS model_code
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
    `);
    const modelYearMap = new Map(); // Map<modelCode, Map<year, Set<id>>>
    for (const { id, year, model_code } of myRows) {
      if (!modelYearMap.has(model_code)) modelYearMap.set(model_code, new Map());
      const ym = modelYearMap.get(model_code);
      if (!ym.has(year)) ym.set(year, new Set());
      ym.get(year).add(id);
    }

    // ── Load uncovered products with fitment_raw ──────────────────────────────

    const { rows: products } = await db.query(`
      SELECT cu.id AS product_id, cu.vendor_sku, vsd.fitment_raw
      FROM catalog_unified cu
      JOIN vtwin_scrape_data vsd ON vsd.sku = cu.vendor_sku
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.is_active = true
        AND cu.is_universal = false
        AND cu.id NOT IN (SELECT DISTINCT product_id FROM catalog_fitment_v2)
        AND vsd.fitment_raw IS NOT NULL
        AND vsd.fitment_raw <> ''
        AND vsd.fitment_raw ~* '[A-Z]+\\s+\\d{4}[-–](\\d{4}|up|present)'
    `);
    console.log(`\nProducts to process: ${products.length}`);

    // ── Parse + collect ───────────────────────────────────────────────────────

    let totalFitmentRows = 0;
    let productsMatched = 0;
    let productsNoMatch = 0;
    const unknownModels = new Set();
    const skipped = [];

    // Collect all inserts: [{product_id, model_year_id, parsed_snapshot}]
    const inserts = [];

    for (const { product_id, vendor_sku, fitment_raw } of products) {
      const segments = fitment_raw.split('|').map(s => s.trim());
      const rowsForProduct = [];

      for (const segment of segments) {
        const match = segment.match(SEGMENT_RE);
        if (!match) continue;

        const [, rawCode, startStr, endStr] = match;
        const modelCode = rawCode.toUpperCase();
        const startYear = parseInt(startStr, 10);
        const endYear = /^(up|present)$/i.test(endStr)
          ? parseInt(maxYear, 10)
          : parseInt(endStr, 10);

        if (!validModelCodes.has(modelCode)) {
          unknownModels.add(modelCode);
          continue;
        }

        const yearMap = modelYearMap.get(modelCode);
        if (!yearMap) continue;

        for (let y = startYear; y <= endYear; y++) {
          const ids = yearMap.get(y);
          if (!ids) continue;
          for (const model_year_id of ids) {
            rowsForProduct.push(model_year_id);
          }
        }
      }

      if (rowsForProduct.length === 0) {
        productsNoMatch++;
        skipped.push({ vendor_sku, fitment_raw });
        continue;
      }

      productsMatched++;
      totalFitmentRows += rowsForProduct.length;

      for (const model_year_id of rowsForProduct) {
        inserts.push({ product_id, model_year_id, parsed_snapshot: fitment_raw });
      }
    }

    // ── Report ────────────────────────────────────────────────────────────────

    console.log(`\n── Parse results ──`);
    console.log(`  Products matched:     ${productsMatched}`);
    console.log(`  Products no match:    ${productsNoMatch}`);
    console.log(`  Fitment rows to ins:  ${totalFitmentRows}`);
    console.log(`\n  Unknown model codes (skipped):`);
    for (const code of [...unknownModels].sort()) {
      console.log(`    ${code}`);
    }

    if (skipped.length > 0 && !APPLY) {
      console.log(`\n  Sample skipped (no HD model match):`);
      skipped.slice(0, 10).forEach(r =>
        console.log(`    [${r.vendor_sku}] ${r.fitment_raw}`)
      );
    }

    if (!APPLY) {
      console.log(`\nDRY RUN — pass --apply to write ${totalFitmentRows} rows`);
      return;
    }

    // ── Insert ────────────────────────────────────────────────────────────────

    console.log(`\nInserting ${inserts.length} rows...`);
    let inserted = 0;
    let conflicts = 0;

    // Batch in chunks of 500
    const CHUNK = 500;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const chunk = inserts.slice(i, i + CHUNK);
      for (const { product_id, model_year_id, parsed_snapshot } of chunk) {
        const { rowCount } = await db.query(`
          INSERT INTO catalog_fitment_v2
            (product_id, model_year_id, fitment_source, confidence_score, parsed_snapshot)
          VALUES ($1, $2, 'vtwin_fitment_raw', 0.80, $3)
          ON CONFLICT (product_id, model_year_id) DO NOTHING
        `, [product_id, model_year_id, parsed_snapshot]);
        if (rowCount > 0) inserted++; else conflicts++;
      }
      process.stdout.write(`\r  ${Math.min(i + CHUNK, inserts.length)} / ${inserts.length}`);
    }

    console.log(`\n\n── Done ──`);
    console.log(`  Inserted:  ${inserted}`);
    console.log(`  Conflicts: ${conflicts}`);

  } finally {
    db.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
