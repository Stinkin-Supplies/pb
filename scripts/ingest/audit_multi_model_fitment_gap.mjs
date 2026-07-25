#!/usr/bin/env node
/**
 * audit_multi_model_fitment_gap.mjs
 *
 * READ-ONLY. Finds active catalog_unified products whose name lists multiple
 * slash-separated HD model codes (e.g. "FLSB/FXLR '18-'23", "FXBR/S") and checks
 * whether catalog_fitment_v2 actually has rows for every model code + model year
 * the name implies.
 *
 * This does NOT write any fitment rows. Model codes/years parsed from the name
 * are informational only — they are frequently wrong or incomplete on their own
 * (see harley_models.start_year/end_year, which can itself be stale) and must be
 * cross-checked against real parts-catalog source documents before any repair is
 * written to catalog_fitment_v2. Use this report to prioritize that manual/
 * cross-referenced repair pass, not to auto-generate fitment rows.
 *
 * Output: audit_output/multi_model_fitment_gap_<timestamp>.csv
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/audit_multi_model_fitment_gap.mjs
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const { Pool } = pg;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env.local.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL, max: 4 });

// Same pattern used for the session's scoping query: slash-separated 2-8 letter codes.
const MULTI_CODE_NAME_RE = /[A-Z]{2,8}(?:\/[A-Z0-9]{1,8})+/;

// ── Year extraction (mirrors backfill_fitment_from_name.mjs) ──
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

// ── Model code chain parsing ──
// "FLSB/FXLR" -> ["FLSB", "FXLR"]; "FXBR/S" -> ["FXBR", "FXBRS"]; "XL883/1200" -> ["XL883", "XL1200"]
// Segments after the first that look like a bare suffix (short, or all-digit) are stitched onto
// the previous code's alpha prefix rather than treated as a standalone code.
function parseModelCodeChain(chain) {
  const segments = chain.split('/');
  const codes = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (/^[A-Z]{3,8}$/.test(seg)) {
      // Looks like a full code on its own (3+ letters) — keep as-is.
      codes.push(seg);
      continue;
    }
    const prev = codes[codes.length - 1];
    const prefixMatch = prev.match(/^[A-Z]+/);
    const prefix = prefixMatch ? prefixMatch[0] : prev;
    codes.push(prefix + seg);
  }
  return [...new Set(codes)];
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(filepath, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => csvEscape(row[h])).join(','));
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
}

async function main() {
  const outDir = path.join(process.cwd(), 'audit_output');
  fs.mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log('Loading candidate products (active, multi-model-code name)...');
  const { rows: products } = await pool.query(`
    SELECT id, sku, slug, name, source_vendor, display_category, display_subcategory
    FROM catalog_unified
    WHERE is_active = true
      AND name ~ '[A-Z]{2,8}/[A-Z]{2,8}'
  `);
  console.log(`  Candidates: ${products.length}`);

  console.log('Loading known HD model codes + families...');
  const { rows: modelRows } = await pool.query(`
    SELECT hm.id, hm.model_code, hf.name AS family, hm.start_year, hm.end_year
    FROM harley_models hm JOIN harley_families hf ON hf.id = hm.family_id
  `);
  const knownCodes = new Map(); // code -> { family, start_year, end_year }
  for (const m of modelRows) knownCodes.set(m.model_code.toUpperCase(), m);

  console.log('Loading existing catalog_fitment_v2 coverage for candidates...');
  const ids = products.map(p => p.id);
  const { rows: fitmentRows } = await pool.query(`
    SELECT cfv.product_id, hm.model_code, hmy.year
    FROM catalog_fitment_v2 cfv
    JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
    JOIN harley_models hm ON hm.id = hmy.model_id
    WHERE cfv.product_id = ANY($1::int[])
  `, [ids]);

  const fitmentByProduct = new Map();
  for (const r of fitmentRows) {
    if (!fitmentByProduct.has(r.product_id)) {
      fitmentByProduct.set(r.product_id, { codes: new Set(), years: [] });
    }
    const f = fitmentByProduct.get(r.product_id);
    f.codes.add(r.model_code);
    f.years.push(r.year);
  }

  const results = [];
  const familyCounts = new Map();
  let zeroFitment = 0, partialModels = 0, partialYears = 0, noGap = 0;

  for (const p of products) {
    const chainMatch = p.name.match(MULTI_CODE_NAME_RE);
    if (!chainMatch) continue; // shouldn't happen given the WHERE clause, but be safe
    const namedCodes = parseModelCodeChain(chainMatch[0]);
    const namedYears = extractYears(p.name);

    const fitment = fitmentByProduct.get(p.id);
    const fittedCodes = fitment ? [...fitment.codes] : [];
    const fittedYearMin = fitment && fitment.years.length ? Math.min(...fitment.years) : null;
    const fittedYearMax = fitment && fitment.years.length ? Math.max(...fitment.years) : null;

    const missingCodes = namedCodes.filter(c => !fittedCodes.includes(c));

    let yearGapStart = null, yearGapEnd = null;
    if (namedYears) {
      if (fittedYearMin === null) {
        yearGapStart = namedYears.start;
        yearGapEnd = namedYears.end;
      } else {
        if (fittedYearMin > namedYears.start) yearGapStart = namedYears.start;
        if (fittedYearMax < namedYears.end) yearGapEnd = namedYears.end;
      }
    }

    let gapType;
    if (!fitment) {
      gapType = 'zero_fitment';
      zeroFitment++;
    } else if (missingCodes.length > 0 && (yearGapStart !== null || yearGapEnd !== null)) {
      gapType = 'partial_models_and_years';
      partialModels++; partialYears++;
    } else if (missingCodes.length > 0) {
      gapType = 'partial_models';
      partialModels++;
    } else if (yearGapStart !== null || yearGapEnd !== null) {
      gapType = 'partial_years';
      partialYears++;
    } else {
      gapType = 'none';
      noGap++;
    }

    // Prioritization: prefer the family of an already-resolved fitted code (these are
    // real harley_models matches, not just name-parse guesses). Falls back to the
    // longest/most-specific named code, since short generic codes like "FL"/"FLH"/"FLT"
    // are tagged with stale/umbrella families in harley_models and skew the count.
    let family = 'unknown';
    if (fittedCodes.length > 0 && knownCodes.has(fittedCodes[0])) {
      family = knownCodes.get(fittedCodes[0]).family;
    } else {
      const sortedNamed = [...namedCodes].sort((a, b) => b.length - a.length);
      for (const c of sortedNamed) {
        if (knownCodes.has(c)) { family = knownCodes.get(c).family; break; }
      }
    }
    if (gapType !== 'none') {
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    }

    if (gapType === 'none') continue;

    results.push({
      product_id: p.id,
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      source_vendor: p.source_vendor,
      display_category: p.display_category,
      display_subcategory: p.display_subcategory,
      inferred_family: family,
      named_model_codes: namedCodes.join('|'),
      named_year_start: namedYears ? namedYears.start : '',
      named_year_end: namedYears ? namedYears.end : '',
      fitted_model_codes: fittedCodes.join('|'),
      fitted_year_min: fittedYearMin ?? '',
      fitted_year_max: fittedYearMax ?? '',
      missing_model_codes: missingCodes.join('|'),
      year_gap_start: yearGapStart ?? '',
      year_gap_end: yearGapEnd ?? '',
      gap_type: gapType,
    });
  }

  const outFile = path.join(outDir, `multi_model_fitment_gap_${timestamp}.csv`);
  writeCsv(outFile, [
    'product_id', 'sku', 'slug', 'name', 'source_vendor', 'display_category', 'display_subcategory',
    'inferred_family', 'named_model_codes', 'named_year_start', 'named_year_end',
    'fitted_model_codes', 'fitted_year_min', 'fitted_year_max',
    'missing_model_codes', 'year_gap_start', 'year_gap_end', 'gap_type',
  ], results);

  console.log(`\n=== Summary ===`);
  console.log(`Candidates scanned:        ${products.length}`);
  console.log(`  zero_fitment:            ${zeroFitment}`);
  console.log(`  partial_models (any):    ${partialModels}`);
  console.log(`  partial_years (any):     ${partialYears}`);
  console.log(`  no gap:                  ${noGap}`);
  console.log(`  Total gap rows written:  ${results.length}`);

  console.log(`\n=== Gap count by inferred family (prioritization) ===`);
  const sortedFamilies = [...familyCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [family, n] of sortedFamilies) {
    console.log(`  ${n.toString().padStart(5)}  ${family}`);
  }

  console.log(`\nWrote ${results.length} rows to ${outFile}`);
  console.log('NO WRITES were performed against catalog_fitment_v2.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
