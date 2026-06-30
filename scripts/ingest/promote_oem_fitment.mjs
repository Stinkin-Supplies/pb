#!/usr/bin/env node
/**
 * promote_oem_fitment.mjs
 *
 * Promotes HD OEM catalog fitment data from oem_fitment → catalog_fitment_v2.
 * This is the consolidation step that makes oem_fitment useful for the live catalog.
 *
 * Three promotion paths:
 *
 *   Path A — Direct match (oem_fitment.matched_product_id IS NOT NULL)
 *     Product was found in catalog_unified via oem_numbers[] or oem_crossref.
 *     Model codes + year range → harley_model_years → catalog_fitment_v2.
 *     Source tag: 'oem_catalog_hd'    confidence: 0.95 (model-specific)
 *                 'oem_catalog_hd_universal'  0.85 (fits_all_models rows)
 *
 *   Path B — VT- crossref bridge (vtwin_oem_crossref)
 *     vtwin_oem_crossref maps HD OEM# → V-Twin part number (stored as VT-XXXXX in catalog_unified).
 *     Source tag: 'oem_crossref_vtwin'  confidence: 0.90
 *
 *   Path C — OEM/FatBook crossref bridge (catalog_oem_crossref)
 *     catalog_oem_crossref maps HD OEM# → aftermarket SKU.
 *     Source tag: 'oem_crossref_fatbook'  confidence: 0.88
 *
 * All inserts use ON CONFLICT DO UPDATE keeping the HIGHEST confidence score.
 * Existing manual (confidence=1.0) rows are never downgraded.
 *
 * Usage:
 *   node promote_oem_fitment.mjs             # run all three paths
 *   node promote_oem_fitment.mjs --path a    # direct match only
 *   node promote_oem_fitment.mjs --path b    # VT- crossref only
 *   node promote_oem_fitment.mjs --path c    # fatbook crossref only
 *   node promote_oem_fitment.mjs --dry-run   # count rows, no writes
 */

import pg from 'pg';
const { Pool } = pg;

const DB_CONFIG = {
  host:     '5.161.100.126',
  port:     5432,
  user:     'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
};

// ── Upsert fragment — keeps highest confidence, never downgrades manual rows ──
const UPSERT_SUFFIX = `
ON CONFLICT (product_id, model_year_id) DO UPDATE
  SET fitment_source    = CASE
        WHEN catalog_fitment_v2.confidence_score >= EXCLUDED.confidence_score
        THEN catalog_fitment_v2.fitment_source
        ELSE EXCLUDED.fitment_source
      END,
      confidence_score  = GREATEST(
        COALESCE(catalog_fitment_v2.confidence_score, 0),
        EXCLUDED.confidence_score
      )
`;

// ── Path A: direct matched rows — model-specific ──────────────────────────────
const PATH_A_SPECIFIC = `
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT
  f.matched_product_id,
  hmy.id,
  'oem_catalog_hd',
  0.95
FROM oem_fitment f
JOIN LATERAL unnest(f.model_codes) AS mc(code) ON true
JOIN harley_models hm ON hm.model_code = mc.code
JOIN harley_model_years hmy
  ON hmy.model_id = hm.id
 AND hmy.year >= f.catalog_year_start
 AND hmy.year <= f.catalog_year_end
WHERE f.matched_product_id IS NOT NULL
  AND NOT f.fits_all_models
  AND cardinality(f.model_codes) > 0
  AND mc.code <> 'ALL'
${UPSERT_SUFFIX}
`;

// ── Path A: direct matched rows — fits_all_models ─────────────────────────────
// Restricts to model_years within the catalog's year span AND the catalog's family.
// A Softail catalog's {ALL} rows only expand to Softail model years, not Touring/Dyna/etc.
// all_model catalogs (1340cc era) are allowed to expand across all families.
const PATH_A_UNIVERSAL = `
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT
  f.matched_product_id,
  hmy.id,
  'oem_catalog_hd_universal',
  0.85
FROM oem_fitment f
JOIN catalog_unified cu ON cu.id = f.matched_product_id
JOIN harley_model_years hmy
  ON hmy.year >= f.catalog_year_start
 AND hmy.year <= f.catalog_year_end
JOIN harley_models hm ON hm.id = hmy.model_id
JOIN harley_families hf ON hf.id = hm.family_id
WHERE f.matched_product_id IS NOT NULL
  AND f.fits_all_models
  AND (
    f.catalog_family = 'all_model'
    OR f.catalog_family IS NULL
    OR LOWER(hf.name) = f.catalog_family
    OR (f.catalog_family IN ('fxr', 'fx') AND hf.name = 'Dyna')
  )
${UPSERT_SUFFIX}
`;

// ── Path B: VT- crossref bridge ───────────────────────────────────────────────
const PATH_B_SPECIFIC = `
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT
  cu.id,
  hmy.id,
  'oem_crossref_vtwin',
  0.90
FROM vtwin_oem_crossref v
JOIN catalog_unified cu ON cu.sku = 'VT-' || v.vt_part_number
JOIN oem_fitment f ON f.oem_part_no = v.hd_oem_number
JOIN LATERAL unnest(f.model_codes) AS mc(code) ON true
JOIN harley_models hm ON hm.model_code = mc.code
JOIN harley_model_years hmy
  ON hmy.model_id = hm.id
 AND hmy.year >= f.catalog_year_start
 AND hmy.year <= f.catalog_year_end
WHERE NOT f.fits_all_models
  AND cardinality(f.model_codes) > 0
  AND mc.code <> 'ALL'
${UPSERT_SUFFIX}
`;

const PATH_B_UNIVERSAL = `
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT
  cu.id,
  hmy.id,
  'oem_crossref_vtwin_universal',
  0.80
FROM vtwin_oem_crossref v
JOIN catalog_unified cu ON cu.sku = 'VT-' || v.vt_part_number
JOIN oem_fitment f ON f.oem_part_no = v.hd_oem_number
JOIN harley_model_years hmy
  ON hmy.year >= f.catalog_year_start
 AND hmy.year <= f.catalog_year_end
JOIN harley_models hm ON hm.id = hmy.model_id
JOIN harley_families hf ON hf.id = hm.family_id
WHERE f.fits_all_models
  AND (
    f.catalog_family = 'all_model'
    OR f.catalog_family IS NULL
    OR LOWER(hf.name) = f.catalog_family
    OR (f.catalog_family IN ('fxr', 'fx') AND hf.name = 'Dyna')
  )
${UPSERT_SUFFIX}
`;

// ── Path C: FatBook/OldBook/Eastern crossref bridge ──────────────────────────
const PATH_C_SPECIFIC = `
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT
  cu.id,
  hmy.id,
  'oem_crossref_fatbook',
  0.88
FROM catalog_oem_crossref c
JOIN catalog_unified cu ON (cu.sku = c.sku OR c.sku = ANY(cu.oem_numbers))
JOIN oem_fitment f ON f.oem_part_no = c.oem_number
JOIN LATERAL unnest(f.model_codes) AS mc(code) ON true
JOIN harley_models hm ON hm.model_code = mc.code
JOIN harley_model_years hmy
  ON hmy.model_id = hm.id
 AND hmy.year >= f.catalog_year_start
 AND hmy.year <= f.catalog_year_end
WHERE NOT f.fits_all_models
  AND cardinality(f.model_codes) > 0
  AND mc.code <> 'ALL'
${UPSERT_SUFFIX}
`;

const PATH_C_UNIVERSAL = `
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT
  cu.id,
  hmy.id,
  'oem_crossref_fatbook_universal',
  0.78
FROM catalog_oem_crossref c
JOIN catalog_unified cu ON (cu.sku = c.sku OR c.sku = ANY(cu.oem_numbers))
JOIN oem_fitment f ON f.oem_part_no = c.oem_number
JOIN harley_model_years hmy
  ON hmy.year >= f.catalog_year_start
 AND hmy.year <= f.catalog_year_end
JOIN harley_models hm ON hm.id = hmy.model_id
JOIN harley_families hf ON hf.id = hm.family_id
WHERE f.fits_all_models
  AND (
    f.catalog_family = 'all_model'
    OR f.catalog_family IS NULL
    OR LOWER(hf.name) = f.catalog_family
    OR (f.catalog_family IN ('fxr', 'fx') AND hf.name = 'Dyna')
  )
${UPSERT_SUFFIX}
`;

// ── Dry-run count equivalents ──────────────────────────────────────────────────
const DRY_A_SPECIFIC = `
SELECT COUNT(DISTINCT (f.matched_product_id, hmy.id)) AS would_insert
FROM oem_fitment f
JOIN LATERAL unnest(f.model_codes) AS mc(code) ON true
JOIN harley_models hm ON hm.model_code = mc.code
JOIN harley_model_years hmy ON hmy.model_id = hm.id
  AND hmy.year >= f.catalog_year_start AND hmy.year <= f.catalog_year_end
WHERE f.matched_product_id IS NOT NULL AND NOT f.fits_all_models
  AND cardinality(f.model_codes) > 0 AND mc.code <> 'ALL'
`;

const DRY_B_SPECIFIC = `
SELECT COUNT(DISTINCT (cu.id, hmy.id)) AS would_insert
FROM vtwin_oem_crossref v
JOIN catalog_unified cu ON cu.sku = 'VT-' || v.vt_part_number
JOIN oem_fitment f ON f.oem_part_no = v.hd_oem_number
JOIN LATERAL unnest(f.model_codes) AS mc(code) ON true
JOIN harley_models hm ON hm.model_code = mc.code
JOIN harley_model_years hmy ON hmy.model_id = hm.id
  AND hmy.year >= f.catalog_year_start AND hmy.year <= f.catalog_year_end
WHERE NOT f.fits_all_models AND cardinality(f.model_codes) > 0 AND mc.code <> 'ALL'
`;

const DRY_C_SPECIFIC = `
SELECT COUNT(DISTINCT (cu.id, hmy.id)) AS would_insert
FROM catalog_oem_crossref c
JOIN catalog_unified cu ON (cu.sku = c.sku OR c.sku = ANY(cu.oem_numbers))
JOIN oem_fitment f ON f.oem_part_no = c.oem_number
JOIN LATERAL unnest(f.model_codes) AS mc(code) ON true
JOIN harley_models hm ON hm.model_code = mc.code
JOIN harley_model_years hmy ON hmy.model_id = hm.id
  AND hmy.year >= f.catalog_year_start AND hmy.year <= f.catalog_year_end
WHERE NOT f.fits_all_models AND cardinality(f.model_codes) > 0 AND mc.code <> 'ALL'
`;

async function run() {
  const argv   = process.argv.slice(2);
  const DRY     = argv.includes('--dry-run');
  const pathIdx = argv.findIndex(a => a === '--path');
  const pathArg = pathIdx >= 0 ? argv[pathIdx + 1]?.toLowerCase() : null;

  const runA = !pathArg || pathArg === 'a';
  const runB = !pathArg || pathArg === 'b';
  const runC = !pathArg || pathArg === 'c';

  console.log('\n🔗  OEM Fitment Promotion — catalog_fitment_v2');
  console.log('══════════════════════════════════════════════\n');
  if (DRY) console.log('  DRY RUN — no writes\n');

  const pool = new Pool(DB_CONFIG);

  try {
    const before = await pool.query(`SELECT COUNT(*) FROM catalog_fitment_v2`);
    console.log(`  catalog_fitment_v2 before: ${parseInt(before.rows[0].count).toLocaleString()} rows\n`);

    if (DRY) {
      if (runA) {
        const r = await pool.query(DRY_A_SPECIFIC);
        console.log(`  Path A (direct match, model-specific): ${parseInt(r.rows[0].would_insert).toLocaleString()} pairs`);
      }
      if (runB) {
        const r = await pool.query(DRY_B_SPECIFIC);
        console.log(`  Path B (VT- crossref, model-specific):  ${parseInt(r.rows[0].would_insert).toLocaleString()} pairs`);
      }
      if (runC) {
        const r = await pool.query(DRY_C_SPECIFIC);
        console.log(`  Path C (fatbook crossref, model-specific): ${parseInt(r.rows[0].would_insert).toLocaleString()} pairs`);
      }
      console.log('\n  (universal rows not counted in dry-run — run without --dry-run to apply)\n');
    } else {
      let total = 0;

      if (runA) {
        process.stdout.write('  Path A — direct match (model-specific)...');
        const r1 = await pool.query(PATH_A_SPECIFIC);
        console.log(` ${(r1.rowCount ?? 0).toLocaleString()} upserted`);
        process.stdout.write('  Path A — direct match (universal)...');
        const r2 = await pool.query(PATH_A_UNIVERSAL);
        console.log(` ${(r2.rowCount ?? 0).toLocaleString()} upserted`);
        total += (r1.rowCount ?? 0) + (r2.rowCount ?? 0);
      }

      if (runB) {
        process.stdout.write('  Path B — VT- crossref (model-specific)...');
        const r3 = await pool.query(PATH_B_SPECIFIC);
        console.log(` ${(r3.rowCount ?? 0).toLocaleString()} upserted`);
        process.stdout.write('  Path B — VT- crossref (universal)...');
        const r4 = await pool.query(PATH_B_UNIVERSAL);
        console.log(` ${(r4.rowCount ?? 0).toLocaleString()} upserted`);
        total += (r3.rowCount ?? 0) + (r4.rowCount ?? 0);
      }

      if (runC) {
        process.stdout.write('  Path C — fatbook crossref (model-specific)...');
        const r5 = await pool.query(PATH_C_SPECIFIC);
        console.log(` ${(r5.rowCount ?? 0).toLocaleString()} upserted`);
        process.stdout.write('  Path C — fatbook crossref (universal)...');
        const r6 = await pool.query(PATH_C_UNIVERSAL);
        console.log(` ${(r6.rowCount ?? 0).toLocaleString()} upserted`);
        total += (r5.rowCount ?? 0) + (r6.rowCount ?? 0);
      }

      const after = await pool.query(`SELECT COUNT(*) FROM catalog_fitment_v2`);
      const afterN = parseInt(after.rows[0].count);
      const beforeN = parseInt(before.rows[0].count);

      // Source breakdown
      const { rows: sources } = await pool.query(`
        SELECT fitment_source, COUNT(*) AS rows, COUNT(DISTINCT product_id) AS products
        FROM catalog_fitment_v2
        GROUP BY fitment_source
        ORDER BY rows DESC
      `);

      console.log(`\n  catalog_fitment_v2 after:  ${afterN.toLocaleString()} rows (+${(afterN - beforeN).toLocaleString()} net new)\n`);
      console.log('  Source breakdown:');
      for (const s of sources) {
        const src = (s.fitment_source || '(none)').padEnd(32);
        console.log(`    ${src} ${String(s.rows).padStart(8)} rows   ${String(s.products).padStart(6)} products`);
      }
    }
  } finally {
    await pool.end();
  }

  console.log('\n✅  Done.\n');
}

run().catch(e => {
  console.error('\n❌  Fatal:', e.message);
  process.exit(1);
});
