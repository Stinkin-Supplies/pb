#!/usr/bin/env node
/**
 * sweep_discontinued_legacy_categories.mjs
 *
 * Consolidates all fully-orphaned legacy display_category names (100%
 * is_active = false, pre-dating the current taxonomy) into a single
 * "Discontinued" category, with display_subcategory set to the old
 * category name so provenance isn't lost.
 *
 * These 11 names produced "orphan categories" every time a category-map
 * audit ran, because they're stale labels left over from before the
 * current taxonomy pass — none of them have any active rows, so they
 * aren't visible in browse/search, but they kept resurfacing as
 * unfinished-looking taxonomy work.
 *
 * "Uncategorized" is scoped to is_active = false only — there are also
 * ~931 ACTIVE rows named "Uncategorized" which are a live-taxonomy gap,
 * not discontinued inventory, and are intentionally left untouched here.
 *
 * Usage:
 *   node scripts/ingest/sweep_discontinued_legacy_categories.mjs            # dry run
 *   node scripts/ingest/sweep_discontinued_legacy_categories.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const NEW_CATEGORY = 'Discontinued';

const LEGACY_CATEGORIES = [
  'Accessories & Misc',
  'Uncategorized',
  'Security & Covers',
  'Handlebar & Controls',
  'Fenders & Body',
  'Suspension',
  'Frame & Hardware',
  'Luggage & Racks',
  'Foot Controls',
  'Instrumentation',
  'Carburetion & Fuel',
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    // Safety check: confirm each legacy name is still 100% inactive before touching it.
    const { rows: check } = await client.query(`
      SELECT display_category,
             COUNT(*) FILTER (WHERE is_active = true) AS active_n,
             COUNT(*) FILTER (WHERE is_active = false) AS inactive_n
      FROM catalog_unified
      WHERE display_category = ANY($1::text[])
      GROUP BY display_category
      ORDER BY inactive_n DESC
    `, [LEGACY_CATEGORIES]);

    console.log('=== Pre-flight: active vs inactive rows per legacy category ===');
    let totalInactive = 0;
    let anyActive = false;
    for (const cat of LEGACY_CATEGORIES) {
      const row = check.find(r => r.display_category === cat);
      const activeN = row ? Number(row.active_n) : 0;
      const inactiveN = row ? Number(row.inactive_n) : 0;
      totalInactive += inactiveN;
      if (activeN > 0) anyActive = true;
      console.log(`  ${cat.padEnd(24)} active=${activeN}  inactive=${inactiveN}${activeN > 0 ? '  *** HAS ACTIVE ROWS, will be skipped ***' : ''}`);
    }
    console.log(`\nTotal inactive rows to sweep: ${totalInactive}`);
    if (anyActive) {
      console.log('\nNOTE: any category above with active_n > 0 will NOT be touched (is_active = false filter protects it).');
    }

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    let total = 0;
    for (const cat of LEGACY_CATEGORIES) {
      const result = await client.query(`
        UPDATE catalog_unified
        SET display_category = $1, display_subcategory = $2
        WHERE display_category = $2 AND is_active = false
      `, [NEW_CATEGORY, cat]);
      console.log(`${cat}: ${result.rowCount} rows -> Discontinued / ${cat}`);
      total += result.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\nAPPLIED: ${total} rows moved total.`);

    const { rows: remaining } = await client.query(`
      SELECT display_category, COUNT(*) FROM catalog_unified
      WHERE display_category = ANY($1::text[]) AND is_active = false
      GROUP BY display_category
    `, [LEGACY_CATEGORIES]);
    console.log(`\nLegacy names with inactive rows remaining (should be empty): ${JSON.stringify(remaining)}`);
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
