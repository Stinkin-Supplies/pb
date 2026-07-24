#!/usr/bin/env node
/**
 * import_ebc_brake_fitment.mjs
 *
 * Links EBC brake pad catalog products to HD model-year fitment using the
 * ebc_brake_fitment table (loaded from EBC's fitment guide).
 *
 * ebc_brake_fitment has: fa_pn, v_pn, hh_pn, epfa_pn (pad part numbers)
 * plus hd_family, model (description string), year_from, year_to.
 *
 * Strategy:
 *   1. Build a set of all EBC pad PNs across all PN columns.
 *   2. Match to catalog_unified products by SKU (direct) or name (contains PN).
 *   3. Extract model_code from first word of model description.
 *   4. Handle comma-separated multi-code entries (e.g. "FXD,FXDL,FXDWG,...").
 *   5. For each product + model_year range, insert catalog_fitment_v2 rows.
 *
 * Usage:
 *   node scripts/ingest/import_ebc_brake_fitment.mjs --dry-run
 *   node scripts/ingest/import_ebc_brake_fitment.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE = 'ebc_brake_fitment';
const CONFIDENCE = 0.80;

function extractModelCodes(modelStr) {
  // First word may be "FXD,FXDL,FXDWG" or "FXDB" or "FL, FLH" etc.
  // Split on comma and/or space, take tokens that look like HD model codes
  const tokens = modelStr
    .split(/[,\s]+/)
    .map(t => t.trim().replace(/[^A-Z0-9-]/gi, ''))
    .filter(t => /^[A-Z]{2}/.test(t) && t.length <= 10);
  return [...new Set(tokens)];
}

async function main() {
  console.log('Loading reference tables...');

  // Get all EBC fitment rows with their PN columns
  const { rows: ebcRows } = await pool.query(`
    SELECT id, fa_pn, v_pn, hh_pn, epfa_pn, model, year_from, year_to
    FROM ebc_brake_fitment
    WHERE fa_pn IS NOT NULL OR v_pn IS NOT NULL OR hh_pn IS NOT NULL
  `);
  console.log(`  EBC fitment rows: ${ebcRows.length}`);

  // Collect all unique EBC part numbers
  const allPns = new Set();
  for (const r of ebcRows) {
    if (r.fa_pn) allPns.add(r.fa_pn.trim());
    if (r.v_pn) allPns.add(r.v_pn.trim());
    if (r.hh_pn) allPns.add(r.hh_pn.trim());
    if (r.epfa_pn) allPns.add(r.epfa_pn.trim());
  }
  console.log(`  Distinct EBC part numbers: ${allPns.size}`);

  // Match PNs to catalog products (SKU exact match OR name contains PN)
  const pnToProducts = new Map(); // pn → Set<product_id>
  const pnArray = [...allPns];

  // SKU match
  const { rows: skuMatches } = await pool.query(`
    SELECT sku AS pn, id AS product_id
    FROM catalog_unified
    WHERE sku = ANY($1) AND is_active
  `, [pnArray]);

  // vendor_sku match
  const { rows: vendorMatches } = await pool.query(`
    SELECT vendor_sku AS pn, id AS product_id
    FROM catalog_unified
    WHERE vendor_sku = ANY($1) AND is_active
  `, [pnArray]);

  // name ILIKE match (e.g. "BRAKE PADS FA200 ORGANIC")
  const { rows: nameMatches } = await pool.query(`
    SELECT pn, id AS product_id
    FROM catalog_unified cu
    CROSS JOIN UNNEST($1::text[]) AS pn
    WHERE cu.name ILIKE '%' || pn || '%' AND cu.is_active AND cu.brand ILIKE '%EBC%'
  `, [pnArray]);

  for (const r of [...skuMatches, ...vendorMatches, ...nameMatches]) {
    if (!pnToProducts.has(r.pn)) pnToProducts.set(r.pn, new Set());
    pnToProducts.get(r.pn).add(r.product_id);
  }

  const matchedPns = pnToProducts.size;
  console.log(`  EBC PNs matched to catalog products: ${matchedPns}/${allPns.size}`);

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
  const { rows: yearRows } = await pool.query(`SELECT id, model_id, year FROM harley_model_years`);
  const myrMap = new Map();
  for (const y of yearRows) myrMap.set(`${y.model_id}:${y.year}`, y.id);

  // Existing pairs
  const { rows: existingRows } = await pool.query(`
    SELECT product_id, model_year_id FROM catalog_fitment_v2
  `);
  const existingPairs = new Set(existingRows.map(r => `${r.product_id}:${r.model_year_id}`));

  // Build fitment pairs
  const toInsert = [];
  let skippedNoProduct = 0, skippedNoModel = 0, skippedNoMyr = 0;

  for (const row of ebcRows) {
    // Collect all PNs for this fitment row
    const pns = [row.fa_pn, row.v_pn, row.hh_pn, row.epfa_pn]
      .filter(Boolean).map(p => p.trim());

    // Get all product IDs for these PNs
    const productIds = new Set();
    for (const pn of pns) {
      const prods = pnToProducts.get(pn);
      if (prods) for (const pid of prods) productIds.add(pid);
    }

    if (productIds.size === 0) { skippedNoProduct++; continue; }

    // Extract model codes from description
    const modelCodes = extractModelCodes(row.model);
    if (modelCodes.length === 0) { skippedNoModel++; continue; }

    for (const code of modelCodes) {
      const models = modelsByCode.get(code);
      if (!models) continue;

      for (const m of models) {
        const lo = Math.max(row.year_from, m.start_year);
        const hi = Math.min(row.year_to, m.end_year);
        if (lo > hi) continue;

        for (let yr = lo; yr <= hi; yr++) {
          const myrId = myrMap.get(`${m.id}:${yr}`);
          if (!myrId) { skippedNoMyr++; continue; }

          for (const productId of productIds) {
            const key = `${productId}:${myrId}`;
            if (existingPairs.has(key)) continue;
            existingPairs.add(key);
            toInsert.push({ productId, modelYearId: myrId });
          }
        }
      }
    }
  }

  console.log(`\nSkipped (no catalog product): ${skippedNoProduct}`);
  console.log(`Skipped (no model code):      ${skippedNoModel}`);
  console.log(`Skipped (no model-year):       ${skippedNoMyr}`);
  console.log(`\nNet-new fitment pairs: ${toInsert.length}`);
  console.log(`Distinct products:     ${new Set(toInsert.map(r => r.productId)).size}`);

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

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');
    const BATCH = 1000;
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
    }
    await client.query('COMMIT');
    console.log(`\nCommitted. ${written} rows written.`);
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
