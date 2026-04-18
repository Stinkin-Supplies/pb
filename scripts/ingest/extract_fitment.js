/**
 * extract_fitment.js
 *
 * Extracts HD fitment data from catalog_products name/description,
 * writes to catalog_fitment (staging), then syncs to catalog_products
 * fitment columns (fitment, fitment_hd_families, fitment_year_start, fitment_year_end).
 *
 * Years are always stored as full 4-digit integers.
 * e.g. "02-04" → year_start: 2002, year_end: 2004
 *      "98-UP"  → year_start: 1998, year_end: null (open-ended)
 *
 * Safe to re-run — idempotent via unique index on catalog_fitment.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ──────────────────────────────────────────────
// Year normalization
// ──────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Convert a 2-digit year string to a full 4-digit integer.
 * Uses 1970 cutoff: <= 30 → 2000s, > 30 → 1900s
 */
function expand2DigitYear(yy) {
  const n = parseInt(yy, 10);
  if (isNaN(n)) return null;
  return n <= 30 ? 2000 + n : 1900 + n;
}

/**
 * Parse a year token — handles:
 *   "2017", "17", "UP", "PRESENT", null
 * Returns integer or null.
 */
function parseYearToken(token, isEnd = false) {
  if (!token) return null;
  const t = token.trim().toUpperCase();
  if (t === 'UP' || t === 'PRESENT' || t === 'CURRENT') return null; // open-ended
  if (/^\d{4}$/.test(t)) return parseInt(t, 10);
  if (/^\d{2}$/.test(t)) return expand2DigitYear(t);
  return null;
}

/**
 * Parse a year-range string like:
 *   "02-04", "1999-2005", "2017-UP", "14-UP", "2006"
 * Returns { year_start, year_end } (both integers or null for open-ended)
 */
function parseYearRange(rangeStr) {
  if (!rangeStr) return null;
  const s = rangeStr.trim().toUpperCase();

  // Single year: "2017" or "17"
  if (/^\d{2,4}$/.test(s)) {
    const y = parseYearToken(s);
    return y ? { year_start: y, year_end: y } : null;
  }

  // Range: "02-04", "1999-2005", "2017-UP", "14-PRESENT"
  const rangeMatch = s.match(/^(\d{2,4})[^\d]+(\d{2,4}|UP|PRESENT|CURRENT)$/);
  if (rangeMatch) {
    const year_start = parseYearToken(rangeMatch[1]);
    const year_end   = parseYearToken(rangeMatch[2]);
    if (!year_start) return null;
    return { year_start, year_end }; // year_end null = open-ended (UP)
  }

  return null;
}

// ──────────────────────────────────────────────
// Model family patterns
// ──────────────────────────────────────────────

const FAMILY_PATTERNS = [
  // Touring — must come before FXR to avoid partial matches
  {
    family: 'Touring',
    pattern: /\b(FL[A-Z]{0,6}|FLHT|FLHR|FLHX|FLTR|FLHRC|FLHRCI|FLHRSEI|FLTRU|FLTRX|FLHXSE|FLH|FLT|FL\b|TOURING|ROAD KING|ROAD GLIDE|STREET GLIDE|ELECTRA GLIDE|ULTRA CLASSIC)\b/i,
  },
  // Softail
  {
    family: 'Softail',
    pattern: /\b(FXST|FLST|FXSTB|FXSTC|FXSTD|FXSTS|FLSTC|FLSTF|FLSTFB|FLSTN|FLSTNSE|FLSTS|SOFTAIL|FAT BOY|HERITAGE|NIGHT TRAIN|DEUCE|SPRINGER|CROSS BONES|BREAKOUT|SLIM|DELUXE)\b/i,
  },
  // Dyna — FXD prefix, distinct from FXR
  {
    family: 'Dyna',
    pattern: /\b(FXD[A-Z]{0,4}|FXDWG|FXDB|FXDC|FXDF|FXDL|FXDLS|FXDS|FXDXT|DYNA|WIDE GLIDE|LOW RIDER|STREET BOB|FAT BOB|SUPER GLIDE)\b/i,
  },
  // FXR — rubber-mount 1982-1994, separate from Dyna
  {
    family: 'FXR',
    pattern: /\b(FXRS|FXRT|FXRD|FXLR|FXRC|FXR\b|FXR )\b/i,
  },
  // Sportster
  {
    family: 'Sportster',
    pattern: /\b(XLH|XLS|XLX|XL\d{3,4}|XL1200|XL883|XL1000|XR1000|SPORTSTER|IRON 883|FORTY-EIGHT|SEVENTY-TWO|ROADSTER|NIGHTSTER)\b/i,
  },
  // V-Rod
  {
    family: 'V-Rod',
    pattern: /\b(VRSC[A-Z]{0,4}|VRSCA|VRSCAW|VRSCB|VRSCD|VRSCR|VRSCX|NIGHT ROD|V-ROD|VROD)\b/i,
  },
];

// M8 (Milwaukee-Eight) inference
// If "M8" in name/desc → add Touring 2017+, Softail 2018+
const M8_PATTERN = /\bM8\b|Milwaukee.Eight/i;

// ──────────────────────────────────────────────
// Year extraction from text
// ──────────────────────────────────────────────

// Matches: "2002-2010", "99-05", "2017-UP", "14-UP", "1984-1999"
const YEAR_RANGE_RE = /\b(\d{2,4})[- ](?:to[- ])?(\d{2,4}|UP|PRESENT|CURRENT)\b/gi;
// Matches standalone 4-digit years: "2017", "1984"
const YEAR_SOLO_RE  = /\b(19[7-9]\d|20[0-3]\d)\b/g;

function extractYearRanges(text) {
  if (!text) return [];
  const results = [];
  let m;

  YEAR_RANGE_RE.lastIndex = 0;
  while ((m = YEAR_RANGE_RE.exec(text)) !== null) {
    const parsed = parseYearRange(m[0]);
    if (parsed) results.push(parsed);
  }

  // If no ranges found, look for solo years
  if (results.length === 0) {
    YEAR_SOLO_RE.lastIndex = 0;
    while ((m = YEAR_SOLO_RE.exec(text)) !== null) {
      const y = parseInt(m[1], 10);
      if (y >= 1970 && y <= CURRENT_YEAR + 2) {
        results.push({ year_start: y, year_end: y });
      }
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// Core extraction
// ──────────────────────────────────────────────

function extractFitmentFromText(name, description, features) {
  const searchText = [name, description, ...(features || [])].filter(Boolean).join(' ');
  const results = [];

  // Check M8 first
  if (M8_PATTERN.test(searchText)) {
    const yearRanges = extractYearRanges(searchText);
    // M8 defaults: Touring 2017+, Softail 2018+
    if (yearRanges.length === 0) {
      results.push({ model: 'Touring',  year_start: 2017, year_end: null });
      results.push({ model: 'Softail',  year_start: 2018, year_end: null });
    } else {
      for (const range of yearRanges) {
        results.push({ model: 'Touring', ...range });
        results.push({ model: 'Softail', ...range });
      }
    }
    return results;
  }

  // Match each family pattern
  for (const { family, pattern } of FAMILY_PATTERNS) {
    if (pattern.test(searchText)) {
      const yearRanges = extractYearRanges(searchText);
      if (yearRanges.length === 0) {
        // Family matched but no years — store with NULL years
        results.push({ model: family, year_start: null, year_end: null });
      } else {
        for (const range of yearRanges) {
          results.push({ model: family, ...range });
        }
      }
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// Database sync
// ──────────────────────────────────────────────

/**
 * Write extracted fitment rows to catalog_fitment (staging).
 * catalog_fitment unique index (NULLS NOT DISTINCT) prevents duplicates.
 */
async function writeToFitmentStaging(client, productId, fitmentRows) {
  for (const row of fitmentRows) {
    await client.query(
      `INSERT INTO catalog_fitment
         (product_id, make, model, year_start, year_end)
       VALUES ($1, 'Harley-Davidson', $2, $3, $4)
       ON CONFLICT ON CONSTRAINT catalog_fitment_unique DO NOTHING`,
      [productId, row.model, row.year_start, row.year_end]
    );
  }
}

/**
 * Sync catalog_fitment → catalog_products fitment columns.
 * Aggregates all rows per product into:
 *   - fitment_hd_families: distinct model names array
 *   - fitment_year_start: MIN year_start
 *   - fitment_year_end: MAX year_end
 *   - fitment: full JSONB array
 */
async function syncFitmentToProducts(client) {
  console.log('  Syncing catalog_fitment → catalog_products...');

  const { rowCount } = await client.query(`
    UPDATE catalog_products cp
    SET
      fitment_hd_families = sub.families,
      fitment_year_start  = sub.year_start,
      fitment_year_end    = sub.year_end,
      fitment             = sub.fitment_json
    FROM (
      SELECT
        cf.product_id,
        array_agg(DISTINCT cf.model ORDER BY cf.model) AS families,
        MIN(cf.year_start)                              AS year_start,
        MAX(cf.year_end)                                AS year_end,
        jsonb_agg(
          jsonb_build_object(
            'make',       COALESCE(cf.make, 'Harley-Davidson'),
            'model',      cf.model,
            'year_start', cf.year_start,
            'year_end',   cf.year_end,
            'notes',      cf.notes
          )
          ORDER BY cf.model, cf.year_start
        ) AS fitment_json
      FROM catalog_fitment cf
      GROUP BY cf.product_id
    ) sub
    WHERE cp.id = sub.product_id
  `);

  console.log(`  Updated ${rowCount} catalog_products rows`);
}

/**
 * Sync catalog_products fitment → catalog_unified fitment columns.
 */
async function syncFitmentToUnified(client) {
  console.log('  Syncing catalog_products → catalog_unified...');

  const { rowCount } = await client.query(`
    UPDATE catalog_unified cu
    SET
      is_harley_fitment   = (cp.fitment IS NOT NULL),
      fitment_hd_families = cp.fitment_hd_families,
      fitment_year_start  = cp.fitment_year_start,
      fitment_year_end    = cp.fitment_year_end
    FROM catalog_products cp
    WHERE cu.sku = cp.sku
      AND cp.fitment IS NOT NULL
  `);

  console.log(`  Updated ${rowCount} catalog_unified rows`);

  // Also clear fitment on rows where catalog_products no longer has fitment
  const { rowCount: cleared } = await client.query(`
    UPDATE catalog_unified cu
    SET
      is_harley_fitment   = false,
      fitment_hd_families = NULL,
      fitment_year_start  = NULL,
      fitment_year_end    = NULL
    FROM catalog_products cp
    WHERE cu.sku = cp.sku
      AND cp.fitment IS NULL
      AND cu.is_harley_fitment = true
  `);

  if (cleared > 0) console.log(`  Cleared fitment on ${cleared} stale catalog_unified rows`);
}

// ──────────────────────────────────────────────
// Progress bar (project standard)
// ──────────────────────────────────────────────

class ProgressBar {
  constructor(total, label = '') {
    this.total   = total;
    this.current = 0;
    this.label   = label;
    this.width   = 40;
  }
  tick() {
    this.current++;
    const pct  = this.current / this.total;
    const done = Math.round(pct * this.width);
    const bar  = '█'.repeat(done) + '░'.repeat(this.width - done);
    process.stdout.write(
      `\r${this.label} [${bar}] ${this.current}/${this.total} (${Math.round(pct * 100)}%)`
    );
    if (this.current >= this.total) process.stdout.write('\n');
  }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const SYNC_ONLY = process.argv.includes('--sync-only');

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n🔧 Fitment extraction${DRY_RUN ? ' [DRY RUN]' : ''}${SYNC_ONLY ? ' [SYNC ONLY]' : ''}\n`);

    if (!SYNC_ONLY) {
      // ── Step 1: fetch all active products
      console.log('Fetching active catalog_products...');
      const { rows: products } = await client.query(`
        SELECT id, sku, name, description, source_vendor
        FROM catalog_products
        WHERE is_active = true
        ORDER BY id
      `);
      console.log(`  ${products.length} products to process\n`);

      // Also fetch features from catalog_product_enrichment
      console.log('Fetching features from catalog_product_enrichment...');
      const { rows: enrichRows } = await client.query(`
        SELECT sku, features FROM catalog_product_enrichment WHERE features IS NOT NULL
      `);
      const featuresBySku = {};
      for (const r of enrichRows) featuresBySku[r.sku] = r.features;
      console.log(`  ${enrichRows.length} enrichment rows\n`);

      // ── Step 2: extract + write to catalog_fitment
      console.log('Extracting fitment...');
      const bar = new ProgressBar(products.length, 'Extracting');
      let extracted = 0;
      let skipped   = 0;

      await client.query('BEGIN');
      for (const product of products) {
        const features = featuresBySku[product.sku] || [];
        const fitmentRows = extractFitmentFromText(product.name, product.description, features);

        if (fitmentRows.length > 0) {
          if (!DRY_RUN) {
            await writeToFitmentStaging(client, product.id, fitmentRows);
          }
          extracted++;
        } else {
          skipped++;
        }
        bar.tick();
      }

      if (DRY_RUN) {
        await client.query('ROLLBACK');
        console.log(`\nDry run: would extract fitment for ${extracted} products (${skipped} no match)`);
        return;
      }

      await client.query('COMMIT');
      console.log(`\nWrote fitment staging for ${extracted} products (${skipped} no match)`);
    }

    // ── Step 3: sync staging → catalog_products
    console.log('\nSyncing to catalog_products...');
    await client.query('BEGIN');
    await syncFitmentToProducts(client);
    await client.query('COMMIT');

    // ── Step 4: sync catalog_products → catalog_unified
    console.log('\nSyncing to catalog_unified...');
    await client.query('BEGIN');
    await syncFitmentToUnified(client);
    await client.query('COMMIT');

    // ── Step 5: summary
    const { rows: summary } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE fitment IS NOT NULL)               AS products_with_fitment,
        COUNT(*) FILTER (WHERE 'Touring'  = ANY(fitment_hd_families)) AS touring,
        COUNT(*) FILTER (WHERE 'Softail'  = ANY(fitment_hd_families)) AS softail,
        COUNT(*) FILTER (WHERE 'Dyna'     = ANY(fitment_hd_families)) AS dyna,
        COUNT(*) FILTER (WHERE 'Sportster'= ANY(fitment_hd_families)) AS sportster,
        COUNT(*) FILTER (WHERE 'FXR'      = ANY(fitment_hd_families)) AS fxr,
        COUNT(*) FILTER (WHERE 'V-Rod'    = ANY(fitment_hd_families)) AS vrod
      FROM catalog_products
      WHERE is_active = true
    `);

    const s = summary[0];
    console.log('\n✅ Fitment extraction complete\n');
    console.log('Family breakdown (catalog_products):');
    console.log(`  Total with fitment : ${s.products_with_fitment}`);
    console.log(`  Touring            : ${s.touring}`);
    console.log(`  Softail            : ${s.softail}`);
    console.log(`  Dyna               : ${s.dyna}`);
    console.log(`  Sportster          : ${s.sportster}`);
    console.log(`  FXR                : ${s.fxr}`);
    console.log(`  V-Rod              : ${s.vrod}`);
    console.log('\n⚠️  Remember to reindex Typesense:\n');
    console.log('  npx dotenv -e .env.local -- node -e "import(\'./scripts/ingest/index_assembly.js\').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
