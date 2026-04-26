#!/usr/bin/env node
/**
 * extract_fitment_db_driven.js
 * ───────────────────────────────────────────────────────────────────────────
 * Extracts fitment from product names using DB alias tables instead of
 * hardcoded regex patterns. More maintainable and auditable.
 *
 * Tables used:
 *   model_alias_map      — text token → family + optional model_code
 *   engine_platform_map  — engine keyword → year range + families
 *
 * Strategy (in priority order):
 *   1. Year regex + model_alias_map match   → HIGH confidence (0.85)
 *   2. Year regex + engine_platform_map     → HIGH confidence (0.80)
 *   3. model_alias_map only (no year)       → MEDIUM confidence (0.60)
 *   4. engine_platform_map only (no year)   → MEDIUM confidence (0.65)
 *
 * Only updates rows where fitment_year_start IS NULL (gaps left by previous scripts).
 * Use --force to reprocess all harley-flagged rows.
 *
 * Usage:
 *   node scripts/ingest/extract_fitment_db_driven.js --dry-run
 *   node scripts/ingest/extract_fitment_db_driven.js
 *   node scripts/ingest/extract_fitment_db_driven.js --vendor pu
 *   node scripts/ingest/extract_fitment_db_driven.js --force
 *   node scripts/ingest/extract_fitment_db_driven.js --min-confidence 0.7
 */

import pg from 'pg';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN        = process.argv.includes('--dry-run');
const FORCE          = process.argv.includes('--force');
const VENDOR_FLAG    = process.argv.includes('--vendor')
  ? process.argv[process.argv.indexOf('--vendor') + 1]?.toUpperCase()
  : null;
const MIN_CONFIDENCE = process.argv.includes('--min-confidence')
  ? parseFloat(process.argv[process.argv.indexOf('--min-confidence') + 1])
  : 0.60;

const BATCH       = 300;
const CURRENT_YEAR = new Date().getFullYear();
const pool        = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Year extraction (same regex engine as before) ─────────────────────────────

function expandYear(yy) {
  const n = parseInt(yy);
  if (n >= 1900) return n;
  return n >= 70 ? 1900 + n : 2000 + n;
}

const YEAR_PATTERNS = [
  { re: /['\u2018\u2019](\d{2})\s*-\s*['\u2018\u2019](\d{2})/, type: 'range2q' },
  { re: /['\u2018\u2019](\d{2})-[ELel](?:arly|ate)?['\u2018\u2019]?(\d{2})/i, type: 'range2q' },
  { re: /\b(20\d{2})-(20\d{2})\b/,                               type: 'range4'  },
  { re: /\b(20\d{2})\+/,                                          type: 'open4'   },
  { re: /(?<![\d])([0-9]{2})-([0-9]{2})(?![\d])/,                type: 'range2'  },
  { re: /(?<![\d])([0-9]{2})[A-Z]+-([0-9]{2})(?![\d])/,          type: 'range2cvo'},
  { re: /(?<![\d])([0-9]{1})-([0-9]{2})(?![\d])/,                type: 'range1x' },
  { re: /(?<![\d])([0-9]{2})-([0-9]{1})(?![\d])/,                type: 'range2x' },
  { re: /['\u2018\u2019]([0-9]{2})(?![0-9\-])/,                  type: 'single2q'},
  { re: /(?<=\s)([0-9]{2})(?=\s|$)/,                              type: 'single2' },
  { re: /(?<![\d])([0-9]{2})\+/,                                  type: 'open2'   },
  { re: /pre-?(20\d{2})/i,                                        type: 'pre4'    },
  { re: /\b(20\d{2})\b/,                                          type: 'single4' },
];

function extractYears(text) {
  const upper = text.toUpperCase();
  for (const { re, type } of YEAR_PATTERNS) {
    const m = upper.match(re);
    if (!m) continue;
    switch (type) {
      case 'range2q':
      case 'range2cvo':
      case 'range1x':
      case 'range2x':
      case 'range2': {
        const s = expandYear(m[1]), e = expandYear(m[2]);
        if (e >= s && e - s <= 55 && e <= CURRENT_YEAR + 2) return { year_start: s, year_end: e };
        break;
      }
      case 'range4': {
        const s = parseInt(m[1]), e = parseInt(m[2]);
        if (e >= s && e <= CURRENT_YEAR + 2) return { year_start: s, year_end: e };
        break;
      }
      case 'open4': return { year_start: parseInt(m[1]), year_end: CURRENT_YEAR + 1 };
      case 'open2': {
        const s = expandYear(m[1]);
        if (s >= 1970 && s <= CURRENT_YEAR + 2) return { year_start: s, year_end: CURRENT_YEAR + 1 };
        break;
      }
      case 'single2q':
      case 'single2': {
        const yr = expandYear(m[1]);
        if (yr >= 1936 && yr <= CURRENT_YEAR + 2) return { year_start: yr, year_end: yr };
        break;
      }
      case 'pre4': return { year_start: 1936, year_end: parseInt(m[1]) - 1 };
      case 'single4': {
        const yr = parseInt(m[1]);
        if (yr >= 1936 && yr <= CURRENT_YEAR + 2) return { year_start: yr, year_end: yr };
        break;
      }
    }
  }
  return null;
}

// ── Tokenize product name ─────────────────────────────────────────────────────
// Returns array of candidate tokens to look up in alias tables
function tokenize(text) {
  const tokens = new Set();
  const upper  = text.toUpperCase();
  const lower  = text.toLowerCase();

  // Single words
  for (const word of lower.split(/[\s\-\/,]+/)) {
    if (word.length >= 2) tokens.add(word);
  }

  // Bigrams (two consecutive words)
  const words = lower.split(/[\s\-\/,]+/).filter(w => w.length >= 2);
  for (let i = 0; i < words.length - 1; i++) {
    tokens.add(`${words[i]} ${words[i+1]}`);
  }

  // Model codes: uppercase letter sequences 2-8 chars
  const modelCodes = upper.match(/\b[A-Z]{2,8}[0-9]*\b/g) || [];
  for (const code of modelCodes) tokens.add(code.toLowerCase());

  // Slash-separated model codes: FLH/FLT → flh, flt
  const slashGroups = upper.match(/[A-Z]{2,6}(?:\/[A-Z]{2,6})+/g) || [];
  for (const group of slashGroups) {
    for (const code of group.split('/')) tokens.add(code.toLowerCase());
  }

  return [...tokens];
}

// ── Map family names to canonical catalog_unified format ──────────────────────
const FAMILY_CANONICAL = {
  'touring'   : 'Touring',
  'softail'   : 'Softail',
  'dyna'      : 'Dyna',
  'sportster' : 'Sportster',
  'fxr'       : 'FXR',
  'v-rod'     : 'V-Rod',
  'trike'     : 'Trike',
  'adventure' : null,   // skip — not in harley_families
  'other'     : null,   // skip
};

// ── Load alias tables from DB ─────────────────────────────────────────────────

async function loadAliasTables(client) {
  console.log('📚  Loading alias tables from DB…');

  const { rows: modelAliases } = await client.query(`
    SELECT alias_text, model_family, model_code, priority
    FROM model_alias_map
    WHERE is_active = true
    ORDER BY priority DESC
  `);

  const { rows: engineAliases } = await client.query(`
    SELECT alias_text, platform, start_year, end_year, applicable_families, confidence
    FROM engine_platform_map
    WHERE is_active = true
  `);

  // Build lookup maps
  const modelMap  = new Map(); // alias_text → {family, model_code, priority}
  for (const r of modelAliases) {
    const canonical = FAMILY_CANONICAL[r.model_family];
    if (!canonical) continue; // skip adventure/other
    if (!modelMap.has(r.alias_text) || r.priority > modelMap.get(r.alias_text).priority) {
      modelMap.set(r.alias_text, {
        family      : canonical,
        model_code  : r.model_code,
        priority    : r.priority,
      });
    }
  }

  const engineMap = new Map(); // alias_text → {platform, start_year, end_year, families}
  for (const r of engineAliases) {
    engineMap.set(r.alias_text, {
      platform    : r.platform,
      year_start  : r.start_year,
      year_end    : Math.min(r.end_year, CURRENT_YEAR + 1),
      families    : r.applicable_families
        .map(f => FAMILY_CANONICAL[f])
        .filter(Boolean),
      confidence  : parseFloat(r.confidence),
    });
  }

  console.log(`   → ${modelMap.size} model aliases, ${engineMap.size} engine aliases`);
  return { modelMap, engineMap };
}

// ── Resolve fitment for a single product name ─────────────────────────────────

function resolveFitment(name, description, modelMap, engineMap) {
  const sources = [name, description].filter(Boolean);
  let years     = null;
  let families  = new Set();
  let modelCodes = [];
  let engineHit  = null;
  let confidence = 0;

  for (const src of sources) {
    if (!years) years = extractYears(src);

    const tokens = tokenize(src);

    // Check model aliases
    for (const token of tokens) {
      const alias = modelMap.get(token);
      if (alias) {
        families.add(alias.family);
        if (alias.model_code) modelCodes.push(alias.model_code);
      }
    }

    // Check engine aliases (M8, Twin Cam, Evo, etc.)
    for (const token of tokens) {
      const engine = engineMap.get(token);
      if (engine && !engineHit) {
        engineHit = engine;
        for (const f of engine.families) families.add(f);
      }
    }
  }

  const familiesArr = [...families];
  if (familiesArr.length === 0) return null;

  // Determine year range
  let yearStart, yearEnd;
  if (years) {
    yearStart  = years.year_start;
    yearEnd    = years.year_end;
    confidence = familiesArr.length > 0 ? 0.85 : 0.60;
  } else if (engineHit) {
    yearStart  = engineHit.year_start;
    yearEnd    = engineHit.year_end;
    confidence = engineHit.confidence;
  } else {
    // Family only — use family year ranges
    const FAMILY_RANGES = {
      'Touring'   : { s: 1984, e: CURRENT_YEAR + 1 },
      'Softail'   : { s: 1984, e: 2017 },
      'Softail M8': { s: 2017, e: CURRENT_YEAR + 1 },
      'Dyna'      : { s: 1993, e: 2017 },
      'Sportster' : { s: 1984, e: 2022 },
      'FXR'       : { s: 1982, e: 2020 },
      'V-Rod'     : { s: 2002, e: 2017 },
      'Trike'     : { s: 2009, e: CURRENT_YEAR + 1 },
    };
    yearStart  = Math.min(...familiesArr.map(f => FAMILY_RANGES[f]?.s ?? 1984));
    yearEnd    = Math.max(...familiesArr.map(f => FAMILY_RANGES[f]?.e ?? CURRENT_YEAR + 1));
    confidence = 0.55;
  }

  if (confidence < MIN_CONFIDENCE) return null;

  const ranges = familiesArr.map(family => ({
    year_start : yearStart,
    year_end   : yearEnd,
    family,
    models     : modelCodes.filter(mc => {
      // Only include model codes that belong to this family
      return true; // simplified — could filter by family if needed
    }),
  }));

  return {
    year_start          : yearStart,
    year_end            : yearEnd,
    fitment_hd_families : familiesArr,
    fitment_year_ranges : ranges,
    confidence,
    source              : years ? 'year+alias' : (engineHit ? 'engine+alias' : 'alias_only'),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  extract_fitment_db_driven.js  ${DRY_RUN ? '[DRY RUN]' : ''}${VENDOR_FLAG ? `[vendor=${VENDOR_FLAG}]` : ''}`);
  console.log(`   Min confidence: ${MIN_CONFIDENCE}\n`);

  const client = await pool.connect();
  try {
    const { modelMap, engineMap } = await loadAliasTables(client);

    const vendorClause = VENDOR_FLAG ? `AND source_vendor = '${VENDOR_FLAG}'` : '';
    const forceClause  = FORCE ? 'true' : 'false';

    console.log('\n📡  Fetching rows with missing fitment…');
    const { rows } = await client.query(`
      SELECT id, sku, name, source_vendor, description
      FROM catalog_unified
      WHERE is_harley_fitment = 't'
        AND (fitment_year_start IS NULL OR ${forceClause})
        AND name IS NOT NULL
        ${vendorClause}
    `);
    console.log(`   → ${rows.length.toLocaleString()} rows to process\n`);

    const staging = [];
    const srcCount = {};
    let noMatch = 0;
    let belowConfidence = 0;

    const pb = new ProgressBar(rows.length, 'Extracting');
    for (const row of rows) {
      pb.increment();

      const fit = resolveFitment(row.name, row.description, modelMap, engineMap);

      if (!fit) { noMatch++; continue; }

      srcCount[fit.source] = (srcCount[fit.source] || 0) + 1;
      staging.push({ id: row.id, ...fit });
    }
    pb.finish();

    const total = Object.values(srcCount).reduce((a, b) => a + b, 0);
    console.log(`\n📊  Extraction results:`);
    for (const [src, count] of Object.entries(srcCount)) {
      console.log(`   ${src.padEnd(20)}: ${count.toLocaleString()}`);
    }
    console.log(`   ${'Total extracted'.padEnd(20)}: ${total.toLocaleString()}`);
    console.log(`   ${'No match'.padEnd(20)}: ${noMatch.toLocaleString()}`);

    if (DRY_RUN || staging.length === 0) {
      if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no changes written to DB');
      return;
    }

    // Bulk update via temp table
    console.log('\n📝  Writing to catalog_unified via temp table…');
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE fitment_db_staging (
        id                  INT,
        fitment_year_start  SMALLINT,
        fitment_year_end    SMALLINT,
        fitment_hd_families TEXT[],
        fitment_year_ranges JSONB
      ) ON COMMIT DROP
    `);

    const pb2 = new ProgressBar(staging.length, 'Loading staging');
    for (let i = 0; i < staging.length; i += BATCH) {
      const batch = staging.slice(i, i + BATCH);
      const vals  = [];
      const placeholders = batch.map((r, j) => {
        const b = j * 5;
        vals.push(
          r.id,
          r.year_start,
          r.year_end,
          r.fitment_hd_families,
          JSON.stringify(r.fitment_year_ranges)
        );
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5}::jsonb)`;
      });
      await client.query(
        `INSERT INTO fitment_db_staging VALUES ${placeholders.join(',')}`,
        vals
      );
      pb2.update(Math.min(i + BATCH, staging.length));
    }
    pb2.finish();

    console.log('   Running bulk UPDATE…');
    const res = await client.query(`
      UPDATE catalog_unified cu SET
        fitment_year_start    = s.fitment_year_start,
        fitment_year_end      = s.fitment_year_end,
        fitment_hd_families   = s.fitment_hd_families,
        fitment_year_ranges   = s.fitment_year_ranges,
        updated_at            = NOW()
      FROM fitment_db_staging s
      WHERE cu.id = s.id
    `);

    await client.query('COMMIT');
    console.log(`\n✅  Done. ${res.rowCount.toLocaleString()} rows updated.`);

    // Final coverage
    const { rows: report } = await client.query(`
      SELECT source_vendor,
        COUNT(*) as total,
        COUNT(fitment_year_start) as has_year,
        COUNT(fitment_hd_families) as has_families,
        COUNT(fitment_year_ranges) as has_ranges
      FROM catalog_unified
      GROUP BY source_vendor ORDER BY source_vendor
    `);
    console.log('\n📊  Final fitment coverage in catalog_unified:');
    console.log('  Vendor  | Total   | Has Year | Has Families | Has Ranges');
    console.log('  --------|---------|----------|--------------|------------');
    for (const r of report) {
      console.log(
        `  ${r.source_vendor.padEnd(7)} | ${String(r.total).padEnd(7)} | ` +
        `${String(r.has_year).padEnd(8)} | ${String(r.has_families).padEnd(12)} | ${r.has_ranges}`
      );
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌  Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
