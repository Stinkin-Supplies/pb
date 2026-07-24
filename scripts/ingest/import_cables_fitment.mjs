#!/usr/bin/env node
/**
 * import_cables_fitment.mjs
 *
 * Imports authoritative cable fitment from harley_oem_cables_fitment.csv
 * (manually assembled from oldbook_2026 and fatbook_2026 catalog sources).
 *
 * Each CSV row has a pre-mapped catalog_unified_id, so no product lookup needed.
 * Generates catalog_fitment_v2 rows from:
 *   catalog_unified_id + hd_model_code + year_start + year_end
 *
 * Also inserts missing OEM crossref entries for rows where already_has_oem = 'no'.
 *
 * Usage:
 *   node scripts/ingest/import_cables_fitment.mjs --dry-run
 *   node scripts/ingest/import_cables_fitment.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_PATH = path.resolve('harley_oem_cables_fitment.csv');
const FITMENT_SOURCE = 'oldbook_fatbook_cables';
const CONFIDENCE = 0.92; // Authoritative human-curated catalog data

// ── Model code normalization ──────────────────────────────────────────────────
// Maps raw tokens (post-cleaning) to actual harley_models.model_code values
const CODE_MAP = {
  'XLH883STD':    'XLH883',
  'XLH883HUGGER': 'XLH883HUG',
  'XLH883DELUXE': 'XLH883DLX',
  '883R':         'XL883R',
  'FXRSCONV':     'FXRS-CON',
  'FXRSCONVENTION':'FXRS-CON',
  'FXDSCONV':     'FXDS',
  'FXDS-CONV':    'FXDS',
};
// Model codes not in DB — silently skip rather than log as unmatched
const KNOWN_MISSING = new Set(['XL1200CB', 'XL1200CP', 'VRSCXA']);

function normY(yy) {
  const n = parseInt(yy, 10);
  return n <= 30 ? 2000 + n : 1900 + n;
}

/**
 * Parse the hd_model_code field into an array of {code, yearStart, yearEnd}.
 *
 * Examples handled:
 *   "FLHR"                        → [{FLHR, def, def}]
 *   "FLHR/I"                      → [{FLHR, def, def}]  (I = EFI suffix)
 *   "FL/FLH"                      → [{FL, def, def}, {FLH, def, def}]
 *   "FLDE/FXFB"                   → [{FLDE, def, def}, {FXFB, def, def}]
 *   "FLTRX/FLTRXS"                → [{FLTRX, def, def}, {FLTRXS, def, def}]
 *   "VRSCA/F"                     → [{VRSCA, def, def}, {VRSCF, def, def}]
 *   "VRSCD/R/X/XA"                → [{VRSCD,def,def},{VRSCR,def,def},{VRSCX,def,def}]
 *   "FLTRK, 21-23 FLTRX/FLTRXS"  → [{FLTRK, def, def}, {FLTRX, 2021,2023}, {FLTRXS, 2021,2023}]
 *   "XLH883 Std."                 → [{XLH883, def, def}]
 *   "XLH883 Hugger"               → [{XLH883HUG, def, def}]
 *   "XLH883 Deluxe"               → [{XLH883DLX, def, def}]
 *   "883R"                        → [{XL883R, def, def}]
 *   "FXRS-CONV."                  → [{FXRS-CON, def, def}]
 *   "FXRS-SP"                     → [{FXRS-SP, def, def}]
 */
function parseModelCodes(rawField, defaultStart, defaultEnd) {
  const results = [];

  // Split by comma — each segment may have its own inline year range
  const segments = rawField.split(',').map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    let yearStart = defaultStart;
    let yearEnd = defaultEnd;
    let codePart = seg;

    // Detect inline 2-digit year range at start: "21-23 FLTRX/FLTRXS"
    const m2 = codePart.match(/^(\d{2})-(\d{2})\s+(.+)/);
    if (m2) {
      yearStart = normY(m2[1]);
      yearEnd = normY(m2[2]);
      codePart = m2[3].trim();
    }

    // Detect inline 4-digit year range at start (safety)
    const m4 = codePart.match(/^(20\d{2})-(20\d{2})\s+(.+)/);
    if (m4) {
      yearStart = parseInt(m4[1]);
      yearEnd = parseInt(m4[2]);
      codePart = m4[3].trim();
    }

    // Remove "w/" (meaning "with") before slash-splitting to avoid false code tokens
    // e.g. "FXDB w/ base mini apes" → "FXDB  base mini apes"
    codePart = codePart.replace(/\bw\//gi, ' ');

    // Split by "/" — may be model families, multi-models, or single-char suffixes
    const slashParts = codePart.split('/');
    let prevFullCode = null;

    for (const part of slashParts) {
      // Take only the first whitespace-separated token to handle "XLH883 Std." → "XLH883"
      const firstWord = part.trim().split(/\s+/)[0];
      // Remove non-alphanumeric except hyphens; uppercase
      const tok = firstWord.replace(/[^A-Z0-9-]/gi, '').toUpperCase();

      if (!tok) continue;

      let resolved = null;

      if (tok.length >= 3 && /^[A-Z]{2}/.test(tok)) {
        // Looks like a full model code (e.g. FLHR, FLDE, FXFB, VRSCA, XLH883, FXRS-CON)
        resolved = tok;
        prevFullCode = tok;
      } else if (tok.length >= 1 && tok.length <= 3 && /^[A-Z]+$/.test(tok) && prevFullCode?.startsWith('VRSC')) {
        // V-Rod shorthand: VRSCA/F → VRSCF, VRSCD/R/X/XA → VRSCR, VRSCX
        const expanded = 'VRSC' + tok;
        resolved = expanded;
        prevFullCode = expanded;
      }
      // Single/double char non-VRS suffixes (/I, /C, /S, /T) → skip

      if (resolved) {
        // Apply normalization for known irregular codes
        const normalized = normalizeCode(resolved, part.trim());
        results.push({ code: normalized, yearStart, yearEnd });
      }
    }
  }

  return results;
}

function normalizeCode(tok, originalPart) {
  // Check exact map first (stripped of hyphens for lookup)
  const key = tok.replace(/-/g, '');
  if (CODE_MAP[key]) return CODE_MAP[key];

  // Handle "XLH883 Hugger" / "XLH883 Deluxe" via the full original part text
  const upper = originalPart.toUpperCase();
  if (upper.includes('HUGGER')) return 'XLH883HUG';
  if (upper.includes('DELUXE')) return 'XLH883DLX';
  if (upper.includes('STD')) return 'XLH883'; // standard

  return tok;
}

// ── Minimal RFC 4180 CSV parser ───────────────────────────────────────────────
function parseCSV(content) {
  const rows = [];
  let field = '';
  let fields = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(field);
        field = '';
      } else if (ch === '\n') {
        fields.push(field);
        rows.push(fields);
        fields = [];
        field = '';
        if (content[i - 1] === '\r') {
          // already handled \r above if any
        }
      } else if (ch === '\r') {
        // skip bare CR
      } else {
        field += ch;
      }
    }
  }
  // Last row
  fields.push(field);
  if (fields.some(f => f !== '')) rows.push(fields);

  return rows;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV not found at', CSV_PATH);
    process.exit(1);
  }

  console.log('Loading harley_model_years from DB...');
  const { rows: modelRows } = await pool.query(`
    SELECT id, model_code, start_year, end_year FROM harley_models
  `);
  const modelsByCode = new Map();
  for (const m of modelRows) {
    const key = m.model_code.toUpperCase();
    if (!modelsByCode.has(key)) modelsByCode.set(key, []);
    modelsByCode.get(key).push(m);
  }

  const { rows: yearRows } = await pool.query(`SELECT id, model_id, year FROM harley_model_years`);
  const myrMap = new Map();
  for (const y of yearRows) myrMap.set(`${y.model_id}:${y.year}`, y.id);

  // Existing fitment pairs
  console.log('Loading existing fitment pairs...');
  const { rows: existingRows } = await pool.query(`
    SELECT product_id, model_year_id FROM catalog_fitment_v2
  `);
  const existingPairs = new Set(existingRows.map(r => `${r.product_id}:${r.model_year_id}`));
  console.log(`  Existing pairs: ${existingPairs.size}`);

  // Existing OEM crossref
  const { rows: oemRows } = await pool.query(`
    SELECT oem_number, product_id FROM catalog_oem_crossref WHERE product_id IS NOT NULL
  `);
  const existingOem = new Set(oemRows.map(r => `${r.oem_number}:${r.product_id}`));

  // Parse CSV
  console.log('\nParsing CSV...');
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const allRows = parseCSV(raw);
  const header = allRows[0];
  const dataRows = allRows.slice(1);

  // Column indices
  const COL = {};
  header.forEach((h, i) => { COL[h.trim()] = i; });

  console.log(`  Columns: ${header.map(h => h.trim()).join(', ')}`);
  console.log(`  Data rows: ${dataRows.length}`);

  const toInsertFitment = [];
  const toInsertOem = [];
  const unmatchedCodes = new Map(); // code → count
  let skippedNoId = 0, skippedNoModel = 0, skippedNoMyr = 0;

  for (const row of dataRows) {
    if (row.length < 20) continue;

    const productId = parseInt(row[COL.catalog_unified_id]);
    if (!productId || isNaN(productId)) { skippedNoId++; continue; }

    const rawModelCode = row[COL.hd_model_code].trim();
    const yearStart = parseInt(row[COL.year_start]);
    const yearEnd = parseInt(row[COL.year_end]);
    const oemNumber = row[COL.oem_number]?.trim() || '';
    const alreadyHasOem = row[COL.already_has_oem]?.trim().toLowerCase();

    if (!rawModelCode || !yearStart || !yearEnd) { skippedNoModel++; continue; }

    const parsedCodes = parseModelCodes(rawModelCode, yearStart, yearEnd);
    if (parsedCodes.length === 0) { skippedNoModel++; continue; }

    let gotAnyModel = false;

    for (const { code, yearStart: ys, yearEnd: ye } of parsedCodes) {
      const models = modelsByCode.get(code.toUpperCase());
      if (!models || models.length === 0) {
        const key = code.toUpperCase();
        if (!KNOWN_MISSING.has(key)) {
          unmatchedCodes.set(key, (unmatchedCodes.get(key) || 0) + 1);
        }
        continue;
      }

      for (const model of models) {
        const lo = Math.max(ys, model.start_year);
        const hi = Math.min(ye, model.end_year);
        if (lo > hi) continue;

        for (let yr = lo; yr <= hi; yr++) {
          const myrId = myrMap.get(`${model.id}:${yr}`);
          if (!myrId) { skippedNoMyr++; continue; }

          const key = `${productId}:${myrId}`;
          if (existingPairs.has(key)) continue;
          existingPairs.add(key);
          toInsertFitment.push({ productId, modelYearId: myrId });
          gotAnyModel = true;
        }
      }
    }

    if (!gotAnyModel) skippedNoModel++;

    // OEM crossref enrichment
    const cableSku = row[COL.sku]?.trim() || '';
    if (oemNumber && alreadyHasOem === 'no' && cableSku) {
      // May be slash-separated multiple OEM numbers (e.g. "37200439/37200560")
      const oemNums = oemNumber.split('/').map(o => o.trim()).filter(o => /\d/.test(o));
      for (const oem of oemNums) {
        const key = `${oem}:${productId}`;
        if (!existingOem.has(key)) {
          existingOem.add(key);
          toInsertOem.push({ oemNumber: oem, productId, sku: cableSku });
        }
      }
    }
  }

  console.log(`\nResults:`);
  console.log(`  Skipped (no catalog_unified_id): ${skippedNoId}`);
  console.log(`  Skipped (no model match/year):   ${skippedNoModel}`);
  console.log(`  Skipped (no model_year row):     ${skippedNoMyr}`);
  console.log(`  Net-new fitment pairs:           ${toInsertFitment.length}`);
  console.log(`  Distinct products:               ${new Set(toInsertFitment.map(r => r.productId)).size}`);
  console.log(`  OEM crossref to add:             ${toInsertOem.length}`);

  if (unmatchedCodes.size > 0) {
    console.log(`\n  Unmatched model codes (skipped):`);
    [...unmatchedCodes.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([code, n]) => console.log(`    ${n.toString().padStart(4)}  ${code}`));
  }

  if (DRY_RUN) {
    console.log('\n--dry-run set, no writes performed.');
    await pool.end();
    return;
  }

  if (toInsertFitment.length === 0 && toInsertOem.length === 0) {
    console.log('Nothing to insert.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let fitmentWritten = 0, oemWritten = 0;
  try {
    await client.query('BEGIN');

    // Write fitment
    if (toInsertFitment.length > 0) {
      const BATCH = 1000;
      for (let i = 0; i < toInsertFitment.length; i += BATCH) {
        const batch = toInsertFitment.slice(i, i + BATCH);
        const values = [];
        const params = [];
        batch.forEach((r, idx) => {
          const base = idx * 4;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
          params.push(r.productId, r.modelYearId, FITMENT_SOURCE, CONFIDENCE);
        });
        const res = await client.query(
          `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
           VALUES ${values.join(',')}
           ON CONFLICT (product_id, model_year_id) DO NOTHING`,
          params
        );
        fitmentWritten += res.rowCount;
      }
    }

    // Write OEM crossref
    if (toInsertOem.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < toInsertOem.length; i += BATCH) {
        const batch = toInsertOem.slice(i, i + BATCH);
        const values = [];
        const params = [];
        batch.forEach((r, idx) => {
          const base = idx * 4;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
          params.push(r.sku, r.oemNumber, r.productId, FITMENT_SOURCE);
        });
        const res = await client.query(
          `INSERT INTO catalog_oem_crossref (sku, oem_number, product_id, source)
           VALUES ${values.join(',')}
           ON CONFLICT (sku, oem_number) DO NOTHING`,
          params
        );
        oemWritten += res.rowCount;
      }
    }

    await client.query('COMMIT');
    console.log(`\nCommitted:`);
    console.log(`  catalog_fitment_v2 rows written: ${fitmentWritten}`);
    console.log(`  catalog_oem_crossref rows written: ${oemWritten}`);
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
