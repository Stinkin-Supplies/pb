#!/usr/bin/env node
/**
 * backfill_fitment_from_name.mjs
 *
 * Fills fitment gaps by parsing year+model info directly from catalog_unified.name
 * for products that have NO existing catalog_fitment_v2 rows.
 *
 * Works on all vendors (PU, WPS, VTwin, DS) but is most impactful for PU where
 * product titles commonly embed year ranges and model codes/families.
 *
 * Signal required: BOTH a parseable year range AND a model/family match in the name.
 *
 * Usage:
 *   node scripts/ingest/backfill_fitment_from_name.mjs --dry-run
 *   node scripts/ingest/backfill_fitment_from_name.mjs [--vendor PU]
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes('--dry-run');
const VENDOR_FILTER = (() => {
  const idx = process.argv.indexOf('--vendor');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();
const SOURCE = 'name_backfill';
const CONFIDENCE = 0.65; // Lower than direct data, higher than pure heuristics

// ── Year extraction (same logic as backfill_pu_brand_xml_fitment.mjs) ──
const RANGE_4 = /\b(19[7-9]\d|20\d{2})\s*[-–]\s*(19[7-9]\d|20\d{2})\b/;
const RANGE_2 = /(?<!\d)'?(\d{1,2})(?:CVO|TC)?[-–]'?(\d{2})\b/i;
const YEAR_APOS = /'(\d{2})\b/;
const YEAR_4 = /\b(19[7-9]\d|20\d{2})\b/g;

function normY(yy) {
  const n = parseInt(yy, 10);
  return n <= 30 ? 2000 + n : 1900 + n;
}

function extractYears(text) {
  if (/universal|most models|custom application|all models/i.test(text)) return null;
  let m = text.match(RANGE_4);
  if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  m = text.match(RANGE_2);
  if (m) return { start: normY(m[1]), end: normY(m[2]) };
  m = text.match(YEAR_APOS);
  if (m) return { start: normY(m[1]), end: normY(m[1]) };
  const all = [...text.matchAll(YEAR_4)].map(x => parseInt(x[1], 10));
  if (all.length === 1) return { start: all[0], end: all[0] };
  if (all.length === 2) return { start: Math.min(...all), end: Math.max(...all) };
  return null;
}

// ── Keyword → model_code extraction ──
// Also try to extract raw model codes (e.g. FLTRXSE, XL1200, FXBB) from the title
const MODEL_CODE_RE = /\b(FL[A-Z]{1,8}|FX[A-Z]{1,8}|XL[A-Z0-9]{0,6}|KH?[A-Z]{0,4}|VR[A-Z]{0,4}|RA\d{4}[A-Z]{0,4})\b/g;

async function main() {
  console.log('Loading DB reference tables...');

  // Get alias map grouped by alias_text → family/codes (same as XML backfill)
  const { rows: aliases } = await pool.query(
    `SELECT alias_text, model_family, model_code, priority FROM model_alias_map WHERE is_active`
  );
  const aliasGroups = new Map();
  for (const a of aliases) {
    if (!aliasGroups.has(a.alias_text)) {
      aliasGroups.set(a.alias_text, { alias_text: a.alias_text, family: a.model_family, codes: new Set(), priority: a.priority });
    }
    const g = aliasGroups.get(a.alias_text);
    g.priority = Math.max(g.priority, a.priority);
    if (a.model_code) g.codes.add(a.model_code);
  }
  const aliasRegexes = [...aliasGroups.values()]
    .sort((a, b) => b.priority - a.priority || b.alias_text.length - a.alias_text.length)
    .map(g => ({
      ...g,
      codes: [...g.codes],
      regex: new RegExp(`\\b${g.alias_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    }));
  console.log(`  Alias regexes: ${aliasRegexes.length}`);

  // model_code → DB model rows
  const { rows: modelRows } = await pool.query(`
    SELECT hm.id, hm.model_code, hm.start_year, hm.end_year, hf.name AS family
    FROM harley_models hm JOIN harley_families hf ON hf.id = hm.family_id
  `);
  const modelsByCode = new Map();
  for (const m of modelRows) {
    const key = m.model_code.toUpperCase();
    if (!modelsByCode.has(key)) modelsByCode.set(key, []);
    modelsByCode.get(key).push(m);
  }
  const modelsByFamily = new Map();
  for (const m of modelRows) {
    if (!modelsByFamily.has(m.family)) modelsByFamily.set(m.family, []);
    modelsByFamily.get(m.family).push(m);
  }

  // model_year_id lookup
  const { rows: yearRows } = await pool.query(`SELECT id, model_id, year FROM harley_model_years`);
  const myrMap = new Map();
  for (const y of yearRows) myrMap.set(`${y.model_id}:${y.year}`, y.id);

  // Load gap products
  let vendorClause = '';
  const params = [];
  if (VENDOR_FILTER) {
    vendorClause = ` AND cu.source_vendor = $1`;
    params.push(VENDOR_FILTER);
  }

  const { rows: gapRows } = await pool.query(`
    SELECT cu.id, cu.sku, cu.name, cu.source_vendor
    FROM catalog_unified cu
    WHERE cu.is_active AND cu.is_universal = false AND cu.fits_all_models = false
      AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 cfv WHERE cfv.product_id = cu.id)
      ${vendorClause}
  `, params);
  console.log(`  Gap products to process: ${gapRows.length}${VENDOR_FILTER ? ` (vendor: ${VENDOR_FILTER})` : ''}`);

  let hadYear = 0, hadModel = 0;
  const toInsert = [];
  const seen = new Set();

  for (const row of gapRows) {
    const title = row.name;

    const years = extractYears(title);
    if (!years) continue;
    hadYear++;

    // Try alias map first (same as XML backfill)
    const alias = aliasRegexes.find(a => a.regex.test(title));

    // Also try raw model codes extracted from the title
    const rawCodes = [...title.matchAll(MODEL_CODE_RE)].map(m => m[1].toUpperCase());

    let candidateModels = [];
    let confidence = CONFIDENCE;

    if (alias) {
      if (alias.codes.length > 0) {
        candidateModels = alias.codes.flatMap(code => modelsByCode.get(code.toUpperCase()) || []);
        confidence = 0.70;
      } else {
        const famName = alias.family;
        if (!famName) continue;
        candidateModels = modelsByFamily.get(famName) || [];
        confidence = 0.60;
      }
    } else if (rawCodes.length > 0) {
      // Fall back to raw model code extraction from title
      for (const code of rawCodes) {
        const models = modelsByCode.get(code);
        if (models) candidateModels.push(...models);
      }
      confidence = 0.65;
    }

    if (candidateModels.length === 0) continue;
    hadModel++;

    for (const model of candidateModels) {
      const lo = Math.max(years.start, model.start_year);
      const hi = Math.min(years.end, model.end_year);
      if (lo > hi) continue;

      for (let y = lo; y <= hi; y++) {
        const myrId = myrMap.get(`${model.id}:${y}`);
        if (!myrId) continue;
        const key = `${row.id}:${myrId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        toInsert.push({ productId: row.id, modelYearId: myrId, confidence });
      }
    }
  }

  console.log(`\nParsed ${gapRows.length} gap products:`);
  console.log(`  Had parseable year:   ${hadYear}`);
  console.log(`  Had model match:      ${hadModel}`);
  console.log(`  Fitment rows to add:  ${toInsert.length}`);
  console.log(`  Distinct products:    ${new Set(toInsert.map(r => r.productId)).size}`);

  if (DRY_RUN || toInsert.length === 0) {
    if (DRY_RUN) console.log('\n--dry-run set, no writes performed.');
    else console.log('Nothing to insert.');
    await pool.end();
    return;
  }

  console.log('\nWriting to catalog_fitment_v2...');
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
        params.push(r.productId, r.modelYearId, SOURCE, r.confidence);
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
    console.log(`Committed. ${written} rows written.`);
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
