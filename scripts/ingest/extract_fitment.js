/**
 * extract_fitment.js
 * Extracts HD fitment (make, model, year_start, year_end) from product
 * names and descriptions and inserts into catalog_fitment.
 *
 * Sources:
 *   1. Product name — e.g. "SPACR FNDR 5/8 B 14-19FL"
 *   2. Product description — e.g. "Fits Softail 2011-Up, Dyna 2012-Up"
 *
 * Run in dry-run mode first:
 *   node scripts/ingest/extract_fitment.js --dry-run
 *
 * Then commit:
 *   node scripts/ingest/extract_fitment.js
 */

import { sql } from '../lib/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const MAKE    = 'Harley-Davidson';

// ─── Model code → family ──────────────────────────────────────────────────────

const MODEL_PATTERNS = [
  // Softail — check FXST/FLST before plain FL/FX
  { re: /\bFXSTS?\b/i,     family: 'Softail' },
  { re: /\bFXSTB\b/i,      family: 'Softail' },
  { re: /\bFXSTD\b/i,      family: 'Softail' },
  { re: /\bFXSTC\b/i,      family: 'Softail' },
  { re: /\bFLST[A-Z]*/i,   family: 'Softail' },
  { re: /\bFXLRS?\b/i,     family: 'Softail' },
  { re: /\bSOFTAIL/i,      family: 'Softail' },

  // Touring — check FLH/FLT variants before plain FL
  { re: /\bFLHT[A-Z]*/i,   family: 'Touring' },
  { re: /\bFLHR[A-Z]*/i,   family: 'Touring' },
  { re: /\bFLHX[A-Z]*/i,   family: 'Touring' },
  { re: /\bFLH[A-Z]*/i,    family: 'Touring' },
  { re: /\bFLT[A-Z]*/i,    family: 'Touring' },
  { re: /\bFLTR[A-Z]*/i,   family: 'Touring' },
  { re: /\bTOURING/i,      family: 'Touring' },
  { re: /\bBAGGER/i,       family: 'Touring' },

  // Dyna
  { re: /\bFXDWG\b/i,      family: 'Dyna' },
  { re: /\bFXDB[A-Z]*/i,   family: 'Dyna' },
  { re: /\bFXDL[A-Z]*/i,   family: 'Dyna' },
  { re: /\bFXDC[A-Z]*/i,   family: 'Dyna' },
  { re: /\bFXD\b/i,        family: 'Dyna' },
  { re: /\bFXR\b/i,        family: 'Dyna' },
  { re: /\bDYNA\b/i,       family: 'Dyna' },

  // Sportster — require specific suffixes to avoid matching helmet/clothing sizes
  { re: /\bXLH[A-Z0-9]*/i, family: 'Sportster' },  // XLH, XLH883
  { re: /\bXL[0-9]/i,      family: 'Sportster' },  // XL883, XL1200
  { re: /\bXLS\b/i,        family: 'Sportster' },  // XLS (Sportster S)
  { re: /\bXR[0-9]/i,      family: 'Sportster' },  // XR750, XR1200
  { re: /\bSPORTSTER/i,    family: 'Sportster' },  // SPORTSTER

  // Plain FL (last resort Touring)
  { re: /\bFL\b/i,         family: 'Touring' },
];

function detectModels(text) {
  const families = new Set();
  for (const { re, family } of MODEL_PATTERNS) {
    if (re.test(text)) families.add(family);
  }
  return [...families];
}

// ─── Year parsing ─────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

function twoDigitYear(yy) {
  const n = parseInt(yy, 10);
  return n <= 30 ? 2000 + n : 1900 + n;
}

/**
 * Returns [{start, end}] from a text string.
 * end=null means "present" (open-ended).
 */
function parseYearRanges(text) {
  const ranges = [];
  const seen   = new Set();
  const add    = (s, e) => {
    const key = `${s}-${e}`;
    if (!seen.has(key) && s >= 1936 && s <= CURRENT_YEAR) {
      seen.add(key);
      ranges.push({ start: s, end: e });
    }
  };

  // 4-digit — 4-digit: 2000-2019 or 1999-2016
  for (const m of text.matchAll(/\b(1[89]\d{2}|20\d{2})-(1[89]\d{2}|20\d{2})\b/g)) {
    add(parseInt(m[1]), parseInt(m[2]));
  }

  // 4-digit + UP/up/later
  for (const m of text.matchAll(/\b(1[89]\d{2}|20\d{2})[-\s]*(?:UP|up|later|Later|and later)\b/g)) {
    add(parseInt(m[1]), null);
  }

  // 4-digit + 2-digit: 2017-19
  for (const m of text.matchAll(/\b(1[89]\d{2}|20\d{2})-(\d{2})\b/g)) {
    const start = parseInt(m[1]);
    const endYY = parseInt(m[2], 10);
    const century = Math.floor(start / 100) * 100;
    let end = century + endYY;
    if (end < start) end += 100;
    add(start, end);
  }

  // 2-digit + UP: 86-UP or '86-Up
  for (const m of text.matchAll(/['']?(\d{2})[-\s](?:UP|up|Up)\b/g)) {
    add(twoDigitYear(m[1]), null);
  }

  // 2-digit - 2-digit: 88-06 or '88-'06
  for (const m of text.matchAll(/['']?(\d{2})-['']?(\d{2})\b(?!\s*[/])/g)) {
    const start = twoDigitYear(m[1]);
    const endRaw = parseInt(m[2], 10);
    const century = Math.floor(start / 100) * 100;
    let end = century + endRaw;
    if (end < start) end += 100;
    // Sanity check — reject tire-size-like matches (e.g. 80-18)
    if (end - start > 50) continue; // no model has a 50+ year range
    add(start, end);
  }

  return ranges;
}

// ─── Name-based extraction ────────────────────────────────────────────────────

/**
 * Parse fitment from a product name.
 * Looks for year range adjacent to (or near) a model code.
 */
function extractFromName(name) {
  const results = [];
  const families = detectModels(name);
  if (!families.length) return results;

  const years = parseYearRanges(name);
  if (!years.length) {
    // Model code but no year — add Universal-ish entry with no years
    for (const family of families) {
      results.push({ family, year_start: null, year_end: null, source: 'name_model_only' });
    }
    return results;
  }

  for (const family of families) {
    for (const { start, end } of years) {
      results.push({ family, year_start: start, year_end: end, source: 'name' });
    }
  }
  return results;
}

// ─── Description-based extraction ─────────────────────────────────────────────

/**
 * Parse fitment from description text.
 * Handles patterns like:
 *   "Softail 2011-Up, Dyna 2012-Up and ALL 2014-Up"
 *   "Fits '99-'16 FLT/FLHT, FXD, XL and '00-'16 FLST"
 *   "2008-later 6-gallon H-D tanks"
 */
function extractFromDescription(desc) {
  if (!desc) return [];
  const results = [];

  // Strategy: scan for model-family keywords and nearby years
  // Split by sentence/clause separators and analyze each chunk
  const chunks = desc.split(/[,;()\n]+/);

  for (const chunk of chunks) {
    const families = detectModels(chunk);
    if (!families.length) continue;

    const years = parseYearRanges(chunk);

    // Also look for years in adjacent chunks if none in this one
    if (!years.length) continue;

    for (const family of families) {
      for (const { start, end } of years) {
        results.push({ family, year_start: start, year_end: end, source: 'description' });
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return results.filter(r => {
    const key = `${r.family}-${r.year_start}-${r.year_end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[Fitment] Starting extraction (${DRY_RUN ? 'DRY RUN' : 'LIVE'})...`);

  const products = await sql`
    SELECT id, sku, name, description
    FROM catalog_products
    WHERE is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM catalog_fitment cf WHERE cf.product_id = id
      )
    ORDER BY id
  `;

  console.log(`[Fitment] Processing ${products.length} products without fitment...`);

  let extracted = 0;
  let inserted  = 0;
  const rows    = [];

  for (const p of products) {
    const nameRows = extractFromName(p.name ?? '');
    const descRows = extractFromDescription(p.description ?? '');

    // Merge, deduplicate by family+year_start+year_end
    const allRows  = [...nameRows, ...descRows];
    const seen     = new Set();
    const deduped  = allRows.filter(r => {
      const key = `${r.family}-${r.year_start}-${r.year_end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!deduped.length) continue;
    extracted++;

    for (const r of deduped) {
      rows.push({
        product_id: p.id,
        sku:        p.sku,
        name:       p.name,
        family:     r.family,
        year_start: r.year_start,
        year_end:   r.year_end,
        source:     r.source,
      });
    }
  }

  console.log(`[Fitment] Extracted fitment from ${extracted} products → ${rows.length} rows`);

  // Show sample
  console.log('\n[Fitment] Sample (first 20):');
  for (const r of rows.slice(0, 20)) {
    const years = r.year_start
      ? `${r.year_start}${r.year_end ? '-' + r.year_end : '-Up'}`
      : '(no years)';
    console.log(`  [${r.source}] ${r.sku} | ${r.name.slice(0, 40).padEnd(40)} → ${r.family} ${years}`);
  }

  if (DRY_RUN) {
    console.log('\n[Fitment] DRY RUN — no inserts. Re-run without --dry-run to commit.');

    // Stats by family
    const byFamily = {};
    for (const r of rows) byFamily[r.family] = (byFamily[r.family] ?? 0) + 1;
    console.log('\n[Fitment] By family:', byFamily);

    // Stats by source
    const bySource = {};
    for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    console.log('[Fitment] By source:', bySource);

    await sql.end();
    return;
  }

  // Insert in batches
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const r of batch) {
      await sql`
        INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end, notes)
        VALUES (
          ${r.product_id},
          ${MAKE},
          ${r.family},
          ${r.year_start},
          ${r.year_end},
          ${`Extracted from ${r.source}: ${r.name}`}
        )
        ON CONFLICT DO NOTHING
      `;
      inserted++;
    }
    console.log(`[Fitment] Inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}...`);
  }

  console.log(`\n[Fitment] Done. Inserted ${inserted} fitment rows for ${extracted} products.`);
  await sql.end();
}

run().catch(err => {
  console.error('[Fitment] Fatal:', err);
  process.exit(1);
});
