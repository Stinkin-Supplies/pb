/**
 * recompute_era_flags.mjs
 *
 * catalog_unified.era_* (era_flathead ... era_milwaukee8, era_chopper) are
 * static booleans -- nothing recomputes them automatically. They were set
 * once, early on, and never revisited as fitment data grew (5M+
 * catalog_fitment_v2 rows added since). Auditing them turned up two
 * problems, not one:
 *   1. Products that only ever gained fitment after that original pass have
 *      every era_* flag false, even when their fitment clearly falls inside
 *      an era's year range.
 *   2. Some already-flagged products have flags that don't match their own
 *      fitment at all (e.g. a product fitting 1983-2012 with both
 *      era_panhead [1948-1965] and era_milwaukee8 [2017-present] set) --
 *      these look like they were never derived from fitment year ranges in
 *      the first place, not just stale.
 *
 * This script derives every era_* flag fresh from actual fitment: a flag is
 * true only if the product has a catalog_fitment_v2 row whose model's
 * family is one of the era's families (see lib/eras/config.ts) AND whose
 * year falls inside that era's [year_min, year_max]. Year-only matching
 * would be wrong -- eras overlap in year (e.g. Twin Cam 1999-2017 and Evo
 * Sportster 1986-2021 both cover 2005), so a Sportster part must not pick
 * up era_twin_cam just because the year matches; the family has to match
 * too.
 *
 * era_chopper is DELIBERATELY NOT handled here. lib/eras/config.ts marks it
 * `universal: true, families: []` ("no fitment required"), which implied it
 * should be driven by catalog_unified.is_universal -- but is_universal is
 * false for all 97,122 rows (never populated), and the products currently
 * flagged era_chopper=true are ordinary fitment-specific parts (a
 * '83-'93 FXRT windshield, Dyna-specific ignition modules), not universal
 * ones. There's no trustworthy existing signal for "genuinely universal"
 * to recompute from, so era_chopper is left untouched pending a real
 * decision on how to classify it -- guessing would just trade one wrong
 * heuristic for another.
 *
 * ERA_DEFS below must be kept in sync with lib/eras/config.ts by hand --
 * this is a plain .mjs script and that file is TypeScript, so it can't be
 * imported directly. If you change an era's year range or family list
 * there, mirror it here.
 *
 * Runs as two bulk statements (not a per-product loop): one CTE aggregates
 * every product's fitment into per-era booleans, joined into a single
 * UPDATE; a second UPDATE resets every era flag to false for products with
 * zero fitment rows at all (so their previously-wrong flags actually clear,
 * not just sit unmatched).
 *
 * Usage:
 *   node scripts/ingest/recompute_era_flags.mjs            # dry run -- reports diffs only
 *   node scripts/ingest/recompute_era_flags.mjs --apply    # writes
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Mirrors lib/eras/config.ts -- see file header comment.
const ERA_DEFS = [
  { flag: 'era_flathead',      families: ['Flathead'],                          yearMin: 1930, yearMax: 1952 },
  { flag: 'era_knucklehead',   families: ['Knucklehead'],                       yearMin: 1936, yearMax: 1947 },
  { flag: 'era_panhead',       families: ['Panhead'],                           yearMin: 1948, yearMax: 1965 },
  { flag: 'era_ironhead',      families: ['Sportster'],                         yearMin: 1957, yearMax: 1985 },
  { flag: 'era_shovelhead',    families: ['Shovelhead', 'FXR'],                 yearMin: 1966, yearMax: 1984 },
  { flag: 'era_evolution',     families: ['Evolution', 'Softail'],              yearMin: 1984, yearMax: 1999 },
  { flag: 'era_evo_sportster', families: ['Sportster'],                         yearMin: 1986, yearMax: 2021 },
  { flag: 'era_twin_cam',      families: ['Twin Cam', 'Dyna', 'Touring', 'Softail'], yearMin: 1999, yearMax: 2017 },
  { flag: 'era_milwaukee8',    families: ['Touring', 'Softail', 'Revolution Max'],   yearMin: 2017, yearMax: 9999 },
];

const FITMENT_ERA_FLAGS = ERA_DEFS.map((e) => e.flag);

function eraBoolExpr(def) {
  const familyList = def.families.map((f) => `'${f.replace(/'/g, "''")}'`).join(', ');
  return `bool_or(family_name IN (${familyList}) AND year BETWEEN ${def.yearMin} AND ${def.yearMax}) AS ${def.flag}`;
}

async function run() {
  const client = await pool.connect();
  try {
    console.log(`Recomputing era_* flags${APPLY ? '' : '  [DRY RUN]'}\n`);

    // ── Diff report: for each flag, how many rows currently true, how many
    // would be true after recompute, and the overlap -- run before writing
    // anything so a dry run is a real preview, not just a row count. ──
    const diffSql = `
      WITH fitment AS (
        SELECT DISTINCT cf.product_id, hf.name AS family_name, hmy.year
        FROM catalog_fitment_v2 cf
        JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
        JOIN harley_models hm       ON hm.id = hmy.model_id
        JOIN harley_families hf     ON hf.id = hm.family_id
      ),
      computed AS (
        SELECT product_id, ${ERA_DEFS.map(eraBoolExpr).join(', ')}
        FROM fitment
        GROUP BY product_id
      )
      SELECT
        ${ERA_DEFS.map((e) => `
        count(*) FILTER (WHERE cu.${e.flag})                                   AS ${e.flag}_before,
        count(*) FILTER (WHERE COALESCE(c.${e.flag}, false))                    AS ${e.flag}_after,
        count(*) FILTER (WHERE cu.${e.flag} AND NOT COALESCE(c.${e.flag}, false)) AS ${e.flag}_cleared,
        count(*) FILTER (WHERE NOT cu.${e.flag} AND COALESCE(c.${e.flag}, false)) AS ${e.flag}_added`).join(',\n        ')}
      FROM catalog_unified cu
      LEFT JOIN computed c ON c.product_id = cu.id
    `;
    const { rows: [diff] } = await client.query(diffSql);

    console.log('Flag              before -> after   (cleared / added)');
    for (const e of ERA_DEFS) {
      console.log(
        `  ${e.flag.padEnd(16)} ${String(diff[`${e.flag}_before`]).padStart(6)} -> ${String(diff[`${e.flag}_after`]).padEnd(6)} (-${diff[`${e.flag}_cleared`]} / +${diff[`${e.flag}_added`]})`
      );
    }
    console.log('  era_chopper      left untouched -- see file header comment (is_universal is unpopulated, no trustworthy signal yet)');

    if (!APPLY) {
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.');
      return;
    }

    console.log('\nApplying (single transaction -- any error rolls back everything)...');
    await client.query('BEGIN');

    // 1. Recompute every flag for products that have at least one fitment row.
    await client.query(`
      WITH fitment AS (
        SELECT DISTINCT cf.product_id, hf.name AS family_name, hmy.year
        FROM catalog_fitment_v2 cf
        JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
        JOIN harley_models hm       ON hm.id = hmy.model_id
        JOIN harley_families hf     ON hf.id = hm.family_id
      ),
      computed AS (
        SELECT product_id, ${ERA_DEFS.map(eraBoolExpr).join(', ')}
        FROM fitment
        GROUP BY product_id
      )
      UPDATE catalog_unified cu
      SET ${FITMENT_ERA_FLAGS.map((f) => `${f} = COALESCE(computed.${f}, false)`).join(', ')}
      FROM computed
      WHERE computed.product_id = cu.id
    `);
    console.log('  Step 1/2: recomputed flags for products with fitment rows.');

    // 2. Products with zero fitment rows at all -> every fitment-based flag false.
    await client.query(`
      UPDATE catalog_unified cu
      SET ${FITMENT_ERA_FLAGS.map((f) => `${f} = false`).join(', ')}
      WHERE NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id)
    `);
    console.log('  Step 2/2: cleared flags for products with no fitment at all. era_chopper untouched.');

    await client.query('COMMIT');
    console.log('\nDone.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Fatal, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
