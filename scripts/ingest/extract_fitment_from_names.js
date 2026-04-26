#!/usr/bin/env node
/**
 * extract_fitment_from_names.js
 * ───────────────────────────────────────────────────────────────────────────
 * Extracts fitment data from product names in catalog_unified and writes
 * back to fitment_year_start, fitment_year_end, fitment_hd_families,
 * fitment_year_ranges for rows that currently have no fitment data.
 *
 * Only updates rows where:
 *   - is_harley_fitment = true
 *   - fitment_year_start IS NULL  (no existing fitment)
 *   - A year range AND at least one model/family was detected
 *
 * No fuzzy guessing — only writes when both year AND family are confident.
 *
 * Usage:
 *   node scripts/ingest/extract_fitment_from_names.js --dry-run
 *   node scripts/ingest/extract_fitment_from_names.js --dry-run --sample 50
 *   node scripts/ingest/extract_fitment_from_names.js
 *   node scripts/ingest/extract_fitment_from_names.js --vendor pu
 *   node scripts/ingest/extract_fitment_from_names.js --vendor wps
 */

import pg from 'pg';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN     = process.argv.includes('--dry-run');
const FORCE       = process.argv.includes('--force');
const VENDOR_FLAG = process.argv.includes('--vendor')
  ? process.argv[process.argv.indexOf('--vendor') + 1]?.toUpperCase()
  : null;
const SAMPLE      = process.argv.includes('--sample')
  ? parseInt(process.argv[process.argv.indexOf('--sample') + 1])
  : null;

const BATCH = 300;
const pool  = new Pool({ connectionString: process.env.DATABASE_URL });

const CURRENT_YEAR = new Date().getFullYear();

// ── Year extraction ───────────────────────────────────────────────────────────

const YEAR_PATTERNS = [
  // '17-'24, '10-'16, '06 - '17 — apostrophe quoted (common in PU names)
  { re: /[''](\d{2})\s*-\s*[''](\d{2})/,   type: 'range2q' },
  // '72-Early'73, '57-E'77 — early/late variant
  { re: /[''](\d{2})-[ELe](?:arly|ate)?['']?(\d{2})/i, type: 'range2q' },
  // YYYY-YYYY: 2014-2023
  { re: /\b(20\d{2})-(20\d{2})\b/,          type: 'range4'  },
  // YYYY+: 2023+, 2024+
  { re: /\b(20\d{2})\+/,                    type: 'open4'   },
  // YY-YY format: 86-06, 17-18, 99-07 (must come after apostrophe patterns)
  { re: /\b(\d{2})-(\d{2})\b/,              type: 'range2'  },
  // YY+: 17+, 18+, 14+
  { re: /\b(\d{2})\+/,                      type: 'open2'   },
  // pre-YYYY: pre-2014
  { re: /pre-?(20\d{2})/i,                  type: 'pre4'    },
  // YYYY only (standalone 4-digit): 2024, 2023
  { re: /\b(20\d{2})\b/,                    type: 'single4' },
];

function expandYear(yy) {
  const n = parseInt(yy);
  return n >= 70 ? 1900 + n : 2000 + n;
}

function extractYears(name) {
  const upper = name.toUpperCase();

  for (const { re, type } of YEAR_PATTERNS) {
    const m = upper.match(re);
    if (!m) continue;

    switch (type) {
      case 'range2q':
      case 'range2': {
        const start = expandYear(m[1]);
        const end   = expandYear(m[2]);
        // Sanity check — range shouldn't span more than 50 years
        if (end >= start && end - start <= 50 && end <= CURRENT_YEAR + 2) {
          return { year_start: start, year_end: end };
        }
        break;
      }
      case 'range4': {
        const start = parseInt(m[1]);
        const end   = parseInt(m[2]);
        if (end >= start && end <= CURRENT_YEAR + 2) {
          return { year_start: start, year_end: end };
        }
        break;
      }
      case 'open4': {
        const start = parseInt(m[1]);
        return { year_start: start, year_end: CURRENT_YEAR + 1 };
      }
      case 'single2q':
      case 'single2': {
        const yr = expandYear(m[1]);
        if (yr >= 1970 && yr <= CURRENT_YEAR + 2) return { year_start: yr, year_end: yr };
        break;
      }
      case 'open2': {
        const start = expandYear(m[1]);
        if (start >= 1970 && start <= CURRENT_YEAR + 2) {
          return { year_start: start, year_end: CURRENT_YEAR + 1 };
        }
        break;
      }
      case 'pre4': {
        const end = parseInt(m[1]);
        return { year_start: 1936, year_end: end - 1 };
      }
      case 'single4': {
        const year = parseInt(m[1]);
        if (year >= 1970 && year <= CURRENT_YEAR + 2) {
          return { year_start: year, year_end: year };
        }
        break;
      }
    }
  }
  return null;
}

// ── Family extraction ─────────────────────────────────────────────────────────

// Order matters — more specific patterns first
const FAMILY_PATTERNS = [
  // M8 / Milwaukee Eight — must come before Touring/Softail
  { re: /\bM[-\s]?8\b|\bM-EIGHT\b|MILWAUKEE[-\s]EIGHT/i,    family: 'M8'        },
  // Trike — must come before Touring
  { re: /\bTRIKE\b|\bFLRT\b|\bFREEWHEEL|\bTRI GLIDE\b|\bTRI-GLIDE\b/i,  family: 'Trike'     },
  // Touring — model codes first, then keywords
  { re: /\bFL[HTR][HTCRUSX]?\b|\bFLHX\b|\bFLTR[XS]?\b/,    family: 'Touring'   },
  { re: /\bTOURING\b|\bDRESSER\b|\bBAGGER\b|\bELECTRA\b|\bROAD KING\b|\bROAD GLIDE\b|\bSTREET GLIDE\b|\bBIG TWIN\b/i, family: 'Touring' },
  // Softail — model codes
  { re: /\bFLST[CFBN]?\b|\bFXST[BCDF]?\b/,                  family: 'Softail'   },
  { re: /\bSOFTAIL\b|\bFAT BOY\b|\bHERITAGE\b|\bDELUXE\b|\bBREAKOUT\b|\bSLIM\b|\bNIGHT TRAIN\b/i, family: 'Softail' },
  // Dyna
  { re: /\bFXD[BCILSWX]?\b|\bFLD\b/,                        family: 'Dyna'      },
  { re: /\bDYNA\b|\bLOW RIDER\b|\bWIDE GLIDE\b|\bFAT BOB\b|\bSTREET BOB\b|\bSWITCHBACK\b/i, family: 'Dyna' },
  // Sportster
  { re: /\bXL[H\d]?\b|\bXR1200\b/,                          family: 'Sportster' },
  { re: /\bSPORTSTER\b|\bSPTSTR\b|\bSPTSTR\b|\bNIGHTSTER\b|\bIRON\b|\bROADSTER\b|\bFORTY-EIGHT\b/i, family: 'Sportster' },
  // FXR
  { re: /\bFXR[SDTP]?\b/,                                    family: 'FXR'       },
  // V-Rod
  { re: /\bVRSC[A-Z]?\b|\bV-ROD\b|\bVROD\b|\bNIGHT ROD\b|\bMUSCLE\b/i, family: 'V-Rod' },
  // Generic FL — Touring if no other match
  { re: /\bFL\b/,                                             family: 'Touring'   },
  // Generic ST — Softail if no other match
  { re: /\bST\b/,                                             family: 'Softail'   },
  // DY/DYN — Dyna
  { re: /\bDY\b|\bDYN\b/,                                    family: 'Dyna'      },
];

function extractFamilies(name) {
  const families = new Set();
  const upper = name.toUpperCase();

  for (const { re, family } of FAMILY_PATTERNS) {
    if (re.test(upper)) {
      // M8 maps to both Softail M8 and Touring (M8 engine used in both)
      if (family === 'M8') {
        families.add('Softail M8');
        // Only add Touring if there's also a Touring indicator
        if (/\bFL[HT]\b|\bTOURING\b|\bBAGGER\b|\bDRESSER\b/i.test(upper)) {
          families.add('Touring');
        }
      } else {
        families.add(family);
      }
    }
  }

  return [...families];
}

// ── Family default year ranges ────────────────────────────────────────────────
const FAMILY_YEAR_RANGES = {
  'Touring'     : { year_start: 1984, year_end: 2026 },
  'Softail'     : { year_start: 1984, year_end: 2017 },
  'Softail M8'  : { year_start: 2017, year_end: 2026 },
  'Dyna'        : { year_start: 1993, year_end: 2017 },
  'Sportster'   : { year_start: 1984, year_end: 2022 },
  'FXR'         : { year_start: 1982, year_end: 2020 },
  'V-Rod'       : { year_start: 2002, year_end: 2017 },
  'Trike'       : { year_start: 2009, year_end: 2026 },
  'Twin Cam'    : { year_start: 1999, year_end: 2017 },
  'Evolution'   : { year_start: 1984, year_end: 1999 },
  'Shovelhead'  : { year_start: 1966, year_end: 1984 },
  'Panhead'     : { year_start: 1948, year_end: 1965 },
  'Knucklehead' : { year_start: 1936, year_end: 1947 },
};

// ── Model code → family mapping ───────────────────────────────────────────────
const MODEL_FAMILY_MAP = {
  // Touring
  'FLH': 'Touring', 'FLHT': 'Touring', 'FLHTC': 'Touring', 'FLHTCU': 'Touring',
  'FLHR': 'Touring', 'FLHRC': 'Touring', 'FLHRS': 'Touring', 'FLHX': 'Touring',
  'FLTR': 'Touring', 'FLTRX': 'Touring', 'FLT': 'Touring', 'FLTC': 'Touring',
  'FLTCU': 'Touring', 'FLHTP': 'Touring', 'FLRT': 'Trike',
  // Softail
  'FLST': 'Softail', 'FLSTC': 'Softail', 'FLSTF': 'Softail', 'FLSTN': 'Softail',
  'FLSTS': 'Softail', 'FLSTB': 'Softail', 'FLSTSC': 'Softail', 'FLSTSE': 'Softail',
  'FXST': 'Softail', 'FXSTB': 'Softail', 'FXSTC': 'Softail', 'FXSTD': 'Softail',
  'FXSTS': 'Softail', 'FXSTSSE': 'Softail', 'FLSB': 'Softail M8',
  'FXFB': 'Softail M8', 'FXLRST': 'Softail M8', 'FXRST': 'Softail M8',
  // Dyna
  'FXD': 'Dyna', 'FXDL': 'Dyna', 'FXDWG': 'Dyna', 'FXDC': 'Dyna',
  'FXDB': 'Dyna', 'FXDF': 'Dyna', 'FXDSE': 'Dyna', 'FXDX': 'Dyna',
  'FXDS': 'Dyna', 'FLD': 'Dyna', 'FXDLS': 'Dyna',
  // Sportster
  'XL': 'Sportster', 'XLH': 'Sportster', 'XLS': 'Sportster', 'XLX': 'Sportster',
  'XL883': 'Sportster', 'XL1200': 'Sportster', 'XLH883': 'Sportster',
  'XLH1200': 'Sportster', 'XR1200': 'Sportster', 'XR1000': 'Sportster',
  // FXR
  'FXR': 'FXR', 'FXRS': 'FXR', 'FXRT': 'FXR', 'FXRD': 'FXR',
  'FXRP': 'FXR', 'FXLR': 'FXR', 'FXSB': 'FXR',
  // V-Rod
  'VRSCA': 'V-Rod', 'VRSCB': 'V-Rod', 'VRSCD': 'V-Rod', 'VRSCDX': 'V-Rod',
  'VRSCF': 'V-Rod', 'VRSCR': 'V-Rod', 'VRSCSE': 'V-Rod', 'VRSCX': 'V-Rod',
  // Generic
  'FL': 'Touring', 'FX': 'Softail', 'ST': 'Softail', 'DY': 'Dyna',
};

// ── Extract slash-separated model codes from name ─────────────────────────────
// e.g. "FLH/FLT", "FLSTF/FXST", "FXD/XL/FXR"
function extractSlashModels(name) {
  const upper = name.toUpperCase();
  // Match sequences of model codes separated by slashes
  const matches = upper.match(/\b([A-Z]{2,6}(?:\/[A-Z]{2,6})+)\b/g);
  if (!matches) return [];

  const families = new Set();
  const models   = [];

  for (const group of matches) {
    const codes = group.split('/');
    for (const code of codes) {
      const trimmed = code.trim();
      if (MODEL_FAMILY_MAP[trimmed]) {
        families.add(MODEL_FAMILY_MAP[trimmed]);
        models.push(trimmed);
      }
    }
  }

  return { families: [...families], models };
}

// ── Full extraction ───────────────────────────────────────────────────────────

function extractFitment(name) {
  const years    = extractYears(name);
  const families = extractFamilies(name);

  // Case 1: year + family — highest confidence
  if (years && families.length > 0) {
    const ranges = families.map(family => ({
      year_start : years.year_start,
      year_end   : years.year_end,
      family,
      models     : [],
    }));
    return {
      year_start          : years.year_start,
      year_end            : years.year_end,
      fitment_hd_families : families,
      fitment_year_ranges : ranges,
      source              : 'year+family',
    };
  }

  // Case 2: slash model codes — use model's family year range
  const slashResult = extractSlashModels(name);
  if (slashResult.families && slashResult.families.length > 0) {
    const yearStart = Math.min(...slashResult.families.map(f => FAMILY_YEAR_RANGES[f]?.year_start ?? 1984));
    const yearEnd   = Math.max(...slashResult.families.map(f => FAMILY_YEAR_RANGES[f]?.year_end   ?? 2026));
    // If we also have years from the name, use those instead
    const y = years || extractYears(name) || { year_start: yearStart, year_end: yearEnd };
    const ranges = slashResult.families.map(family => ({
      year_start : y.year_start,
      year_end   : y.year_end,
      family,
      models     : slashResult.models.filter(m => MODEL_FAMILY_MAP[m] === family),
    }));
    return {
      year_start          : y.year_start,
      year_end            : y.year_end,
      fitment_hd_families : slashResult.families,
      fitment_year_ranges : ranges,
      source              : (years || extractYears(name)) ? 'year+family' : 'slash_models',
    };
  }

  // Case 3: family only, no year — use full family year range
  if (families.length > 0) {
    const yearStart = Math.min(...families.map(f => FAMILY_YEAR_RANGES[f]?.year_start ?? 1984));
    const yearEnd   = Math.max(...families.map(f => FAMILY_YEAR_RANGES[f]?.year_end   ?? 2026));
    const ranges = families.map(family => ({
      year_start : FAMILY_YEAR_RANGES[family]?.year_start ?? yearStart,
      year_end   : FAMILY_YEAR_RANGES[family]?.year_end   ?? yearEnd,
      family,
      models     : [],
    }));
    return {
      year_start          : yearStart,
      year_end            : yearEnd,
      fitment_hd_families : families,
      fitment_year_ranges : ranges,
      source              : 'family_only',
    };
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  extract_fitment_from_names.js  ${DRY_RUN ? '[DRY RUN]' : ''}${VENDOR_FLAG ? `[vendor=${VENDOR_FLAG}]` : ''}\n`);

  const client = await pool.connect();
  try {
    const vendorClause = VENDOR_FLAG ? `AND source_vendor = '${VENDOR_FLAG}'` : '';
    const limitClause  = SAMPLE ? `LIMIT ${SAMPLE}` : '';

    console.log('📡  Fetching rows with missing fitment…');
    const { rows } = await client.query(`
      SELECT id, sku, name, source_vendor, description,
             fitment_hd_families, fitment_year_start
      FROM catalog_unified
      WHERE is_harley_fitment = 't'
        AND (fitment_year_start IS NULL OR ${FORCE ? 'true' : 'false'})
        ${vendorClause}
        AND name IS NOT NULL
      ${limitClause}
    `);
    console.log(`   → ${rows.length.toLocaleString()} rows to process\n`);

    const staging  = [];
    const srcCount = { 'year+family': 0, 'slash_models': 0, 'family_only': 0 };
    let bothMissing = 0;

    const pb = new ProgressBar(rows.length, 'Extracting');
    for (const row of rows) {
      pb.increment();

      const sources = [row.name, row.description].filter(Boolean);
      let fit = null;
      for (const src of sources) {
        fit = extractFitment(src);
        if (fit) break;
      }

      if (!fit) { bothMissing++; continue; }

      srcCount[fit.source] = (srcCount[fit.source] || 0) + 1;
      staging.push({ id: row.id, ...fit });

      if (DRY_RUN && SAMPLE) {
        console.log(`\n  SKU: ${row.sku} [${row.source_vendor}] (${fit.source})`);
        console.log(`  Name: ${row.name}`);
        console.log(`  → years: ${fit.year_start}–${fit.year_end}  families: ${fit.fitment_hd_families.join(', ')}`);
      }
    }
    pb.finish();

    const totalExtracted = Object.values(srcCount).reduce((a, b) => a + b, 0);
    console.log(`\n📊  Extraction results:`);
    console.log(`   Year + family              : ${srcCount['year+family'].toLocaleString()}`);
    console.log(`   Slash model codes          : ${srcCount['slash_models'].toLocaleString()}`);
    console.log(`   Family only (full range)   : ${srcCount['family_only'].toLocaleString()}`);
    console.log(`   Total extracted            : ${totalExtracted.toLocaleString()}`);
    console.log(`   No fitment found           : ${bothMissing.toLocaleString()}`);
    console.log(`   Total rows processed       : ${rows.length.toLocaleString()}`);

    if (DRY_RUN || staging.length === 0) {
      if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no changes written to DB');
      return;
    }

    // Bulk update via temp table
    console.log('\n📝  Writing to catalog_unified via temp table…');
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE fitment_name_staging (
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
        `INSERT INTO fitment_name_staging VALUES ${placeholders.join(',')}`,
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
      FROM fitment_name_staging s
      WHERE cu.id = s.id
    `);

    await client.query('COMMIT');
    console.log(`\n✅  Done. ${res.rowCount.toLocaleString()} rows updated.`);

    // Coverage report
    const { rows: report } = await client.query(`
      SELECT
        source_vendor,
        COUNT(*) as total,
        COUNT(fitment_year_start) as has_year,
        COUNT(fitment_hd_families) as has_families,
        COUNT(fitment_year_ranges) as has_ranges
      FROM catalog_unified
      GROUP BY source_vendor
      ORDER BY source_vendor
    `);
    console.log('\n📊  Updated fitment coverage in catalog_unified:');
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
