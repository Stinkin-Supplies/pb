#!/usr/bin/env node
/**
 * import_ebc_fitment.mjs
 *
 * Cross-references the ebc_brake_fitment staging table against
 * catalog_unified to back-fill catalog_fitment_v2.
 *
 * Match logic:
 *   catalog_unified.brand_part_number  ← matches →  ebc_brake_fitment.*_pn
 *   (checks fa_pn, v_pn, hh_pn, epfa_pn in priority order)
 *
 * Model → harley_models resolution:
 *   Extracts leading model code(s) from ebc model string (FXDB, XL883, etc.)
 *   and joins to harley_models, then expands year_from–year_to against
 *   harley_model_years to produce one row per (product_id, model_year_id).
 *
 * Usage:
 *   node scripts/ingest/import_ebc_fitment.mjs              # dry run
 *   node scripts/ingest/import_ebc_fitment.mjs --apply      # commit
 *   node scripts/ingest/import_ebc_fitment.mjs --report     # match report only
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool    = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const APPLY   = process.argv.includes('--apply');
const REPORT  = process.argv.includes('--report');
const DRY_RUN = !APPLY;

// ── Model code extraction ──────────────────────────────────────────────────────
//
// EBC model strings look like:
//   "FXDB Street Bob"                   → ["FXDB"]
//   "FLHX Street Glide"                 → ["FLHX"]
//   "XL 883 L Superlow Cast Wheel"      → ["XL883L", "XL883"]   (try both)
//   "XLH 883"                           → ["XLH"]
//   "FXD,FXDL,FXDWG,FXR,..."           → ["FXD","FXDL","FXDWG","FXR"]
//   "FL, FLH Banana Caliper"            → ["FL","FLH"]
//   "FXST/B/C/S, FLST/C/F/S/N"         → ["FXST","FXSTB","FXSTC","FXSTS",...]
//   "LiveWire"                          → [] (no H-D model code — skip)
//
// Strategy:
//   1. Split on , and whitespace to get candidate tokens
//   2. A token is a model code if it looks like: [A-Z]{2,}[0-9]* or FX*/FLST*
//   3. Expand slash-shorthand: FXST/B/C → FXST, FXSTB, FXSTC

const MODEL_CODE_RE = /^(FL[A-Z]{1,6}|FX[A-Z]{1,6}|XL[A-Z0-9]{0,6}|XLH|XLR|XLCH|XR\d{4}|VRSCA?[A-Z]*|XG\d{3}|RH\d+|RA\d+|FLHTCUTG[A-Z]*)$/i;

function expandSlash(token) {
  // "FXST/B/C/S" → ["FXST","FXSTB","FXSTC","FXSTS"]
  const parts = token.split('/');
  if (parts.length === 1) return [token];
  const base = parts[0];
  const result = [base];
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts[i].replace(/[^A-Z0-9]/gi, '');
    if (suffix) result.push(base + suffix.toUpperCase());
  }
  return result;
}

function extractModelCodes(ebcModel) {
  if (!ebcModel) return [];

  // Clean up common noise
  const clean = ebcModel
    .replace(/\*Oversize Rotor Available.*/i, '')
    .replace(/Hayes Caliper|Girling Caliper|Banana Caliper/gi, '')
    .replace(/\d+th Anniversary Edition/gi, '')
    .replace(/\d+mm Rotors/gi, '')
    .replace(/Cast Wheel|Flat Track|Rivet Type/gi, '')
    .replace(/inc \d+ model/gi, '')
    .replace(/[®©]/g, '')
    .trim();

  // Split on comma, ampersand, semicolon
  const segments = clean.split(/[,;&]/);
  const codes = new Set();

  for (const seg of segments) {
    // Each segment: split on whitespace, check first few tokens
    const tokens = seg.trim().split(/\s+/);
    for (let i = 0; i < Math.min(tokens.length, 3); i++) {
      const tok = tokens[i].replace(/[^A-Z0-9/]/gi, '').toUpperCase();
      if (!tok) continue;

      // Expand slash notation
      const expanded = expandSlash(tok);
      for (const exp of expanded) {
        if (MODEL_CODE_RE.test(exp)) {
          codes.add(exp);
        }
        // Also try stripping trailing digits (e.g. XG500 → XG)... no, keep them
        // Try adding XL prefix variations: "XL 883" → "XL883"
        if (i + 1 < tokens.length && /^[0-9]+/.test(tokens[i + 1])) {
          const combined = exp + tokens[i + 1];
          if (MODEL_CODE_RE.test(combined)) {
            codes.add(combined);
          }
        }
      }
      // Stop after first meaningful code-looking token in this segment
      if (codes.size > 0 && MODEL_CODE_RE.test(expanded[0])) break;
    }
  }

  return [...codes];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  console.log(`\n=== EBC Fitment Cross-Reference ===`);
  console.log(`Mode: ${APPLY ? '** APPLY **' : REPORT ? 'REPORT ONLY' : 'DRY RUN'}\n`);

  try {
    // ── 1. Load EBC fitment table ──────────────────────────────────────────
    const { rows: ebcRows } = await client.query(`
      SELECT id, position, hd_family, model, year_from, year_to,
             fa_pn, v_pn, hh_pn, epfa_pn,
             requires_two_sets
      FROM ebc_brake_fitment
      ORDER BY hd_family, model, year_from
    `);
    console.log(`EBC fitment records: ${ebcRows.length}`);

    // ── 2. Load all EBC products from catalog_unified ─────────────────────
    //   Match on brand_part_number (manufacturer cross-ref for PU; sku for WPS)
    const { rows: catalogRows } = await client.query(`
      SELECT cu.id AS product_id, cu.sku, cu.source_vendor,
             cu.brand_part_number, cu.name
      FROM catalog_unified cu
      WHERE cu.brand ILIKE '%ebc%'
        AND cu.is_active = true
        AND cu.brand_part_number IS NOT NULL
        AND cu.brand_part_number != ''
    `);
    console.log(`EBC catalog products (with brand_part_number): ${catalogRows.length}`);

    // Build lookup: part_number (normalized) → [product_id, ...]
    const pnToProducts = new Map();
    for (const row of catalogRows) {
      const pn = row.brand_part_number.trim().toUpperCase();
      if (!pnToProducts.has(pn)) pnToProducts.set(pn, []);
      pnToProducts.get(pn).push(row);
    }

    // ── 3. Load harley_models and harley_model_years ───────────────────────
    const { rows: modelRows } = await client.query(`
      SELECT hm.id AS model_id, hm.model_code, hmy.id AS model_year_id, hmy.year
      FROM harley_models hm
      JOIN harley_model_years hmy ON hmy.model_id = hm.id
      ORDER BY hm.model_code, hmy.year
    `);

    // Build lookup: model_code → { year → model_year_id }
    const codeYearMap = new Map();
    for (const row of modelRows) {
      const code = row.model_code.toUpperCase();
      if (!codeYearMap.has(code)) codeYearMap.set(code, new Map());
      codeYearMap.get(code).set(row.year, row.model_year_id);
    }
    console.log(`harley_models loaded: ${codeYearMap.size} codes\n`);

    // ── 4. Cross-reference ─────────────────────────────────────────────────
    const toInsert = [];  // { product_id, model_year_id }
    const stats = {
      ebcTotal: ebcRows.length,
      matched: 0, noProduct: 0, noModelCode: 0, noYearRows: 0,
      skipped: 0,
    };
    const matchReport = [];

    // Load existing fitment set (product_id, model_year_id) from EBC source
    const { rows: existingRows } = await client.query(`
      SELECT product_id, model_year_id
      FROM catalog_fitment_v2
      WHERE fitment_source = 'ebc_catalog'
    `);
    const existingSet = new Set(existingRows.map(r => `${r.product_id}:${r.model_year_id}`));
    console.log(`Existing ebc_catalog fitment rows: ${existingSet.size}`);

    for (const ebc of ebcRows) {
      // Find matching catalog product(s)
      const pnCandidates = [ebc.fa_pn, ebc.v_pn, ebc.hh_pn, ebc.epfa_pn]
        .filter(Boolean)
        .map(p => p.toUpperCase());

      let matchedProducts = [];
      for (const pn of pnCandidates) {
        const prods = pnToProducts.get(pn) || [];
        matchedProducts.push(...prods);
      }
      // Deduplicate by product_id
      const seen = new Set();
      matchedProducts = matchedProducts.filter(p => {
        if (seen.has(p.product_id)) return false;
        seen.add(p.product_id);
        return true;
      });

      if (matchedProducts.length === 0) {
        stats.noProduct++;
        continue;
      }

      // Extract model codes from EBC model string
      const modelCodes = extractModelCodes(ebc.model);
      if (modelCodes.length === 0) {
        stats.noModelCode++;
        continue;
      }

      // Find model_year_ids for each code + year range
      const yearIds = new Set();
      const codesFound = [];
      for (const code of modelCodes) {
        const yearMap = codeYearMap.get(code);
        if (!yearMap) continue;
        codesFound.push(code);
        for (let y = ebc.year_from; y <= ebc.year_to; y++) {
          const myid = yearMap.get(y);
          if (myid) yearIds.add(myid);
        }
      }

      if (yearIds.size === 0) {
        stats.noYearRows++;
        continue;
      }

      stats.matched++;

      if (REPORT) {
        matchReport.push({
          ebcModel: ebc.model,
          years: `${ebc.year_from}-${ebc.year_to}`,
          pns: pnCandidates.join('|'),
          catalogProducts: matchedProducts.length,
          codesFound,
          fitmentYears: yearIds.size,
        });
      }

      // Build insert rows
      for (const prod of matchedProducts) {
        for (const myid of yearIds) {
          const key = `${prod.product_id}:${myid}`;
          if (existingSet.has(key)) {
            stats.skipped++;
            continue;
          }
          existingSet.add(key); // prevent dupes within run
          toInsert.push({ product_id: prod.product_id, model_year_id: myid });
        }
      }
    }

    // ── 5. Report ─────────────────────────────────────────────────────────
    console.log('\n── Match Stats ──────────────────────────────────────────────');
    console.log(`  EBC records:           ${stats.ebcTotal}`);
    console.log(`  Matched (product+year): ${stats.matched}`);
    console.log(`  No catalog product:     ${stats.noProduct}`);
    console.log(`  No model code:          ${stats.noModelCode}`);
    console.log(`  No harley_model_years:  ${stats.noYearRows}`);
    console.log(`  fitment rows to insert: ${toInsert.length}`);
    console.log(`  Already existed:        ${stats.skipped}`);

    if (REPORT && matchReport.length > 0) {
      console.log('\n── Match Detail (first 20) ──────────────────────────────────');
      for (const r of matchReport.slice(0, 20)) {
        console.log(`  ${r.ebcModel} ${r.years}`);
        console.log(`    PNs: ${r.pns} → ${r.catalogProducts} product(s)`);
        console.log(`    Codes: [${r.codesFound.join(', ')}] → ${r.fitmentYears} year-model rows`);
      }
    }

    if (toInsert.length === 0) {
      console.log('\nNothing to insert.');
      return;
    }

    if (DRY_RUN) {
      // Show sample
      console.log('\n── Sample inserts (first 5) ─────────────────────────────────');
      const sample = toInsert.slice(0, 5);
      for (const row of sample) {
        const { rows: [detail] } = await client.query(`
          SELECT cu.name, cu.sku, hmy.year, hm.model_code
          FROM catalog_unified cu, harley_model_years hmy
          JOIN harley_models hm ON hm.id = hmy.model_id
          WHERE cu.id = $1 AND hmy.id = $2
        `, [row.product_id, row.model_year_id]);
        if (detail) {
          console.log(`  ${detail.model_code} ${detail.year} → ${detail.sku} "${detail.name?.slice(0, 50)}"`);
        }
      }
      console.log('\nDry run complete. Pass --apply to commit.\n');
      return;
    }

    // ── 6. Insert ─────────────────────────────────────────────────────────
    console.log('\nInserting...');
    const CHUNK = 500;
    let inserted = 0;

    await client.query('BEGIN');
    try {
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const productIds  = chunk.map(r => r.product_id);
        const modelYearIds = chunk.map(r => r.model_year_id);

        await client.query(`
          INSERT INTO catalog_fitment_v2
            (product_id, model_year_id, fitment_source)
          SELECT
            unnest($1::int[]),
            unnest($2::int[]),
            'ebc_catalog'
          ON CONFLICT (product_id, model_year_id) DO NOTHING
        `, [productIds, modelYearIds]);

        inserted += chunk.length;
        process.stdout.write(`\r  Processed ${Math.min(inserted, toInsert.length)} / ${toInsert.length}`);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const { rows: [{ total }] } = await client.query(`
      SELECT COUNT(*) AS total FROM catalog_fitment_v2 WHERE fitment_source = 'ebc_catalog'
    `);

    console.log(`\n\n✅ Done.`);
    console.log(`   ebc_catalog fitment rows: ${total}`);
    console.log('');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
