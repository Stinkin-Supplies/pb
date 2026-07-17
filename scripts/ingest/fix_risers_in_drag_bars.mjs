#!/usr/bin/env node
/**
 * fix_risers_in_drag_bars.mjs
 *
 * Laken caught: riser products sitting in Drag Style Bars. Root cause --
 * Drag Specialties' "Big Buffalo" riser line and Wild 1's "Chubby" riser
 * line matched the DRAG keyword regex (buffalo|chubby, brand-naming
 * signals for those two vendors' bar lines) even though the products
 * themselves are risers, not bars. All 31 rows move to Risers & Clamps.
 *
 * Usage:
 *   node scripts/ingest/fix_risers_in_drag_bars.mjs            # dry run
 *   node scripts/ingest/fix_risers_in_drag_bars.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = 'Handlebars & Hand Controls' AND display_subcategory = 'Drag Style Bars'
        AND name ~* 'riser'`);

    console.log(`Rows moving to Risers & Clamps: ${rows.length}`);
    rows.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = 'Risers & Clamps', display_subcategory_detail = NULL WHERE id = $1`, [r.id]);
    }
    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
    console.log('\nNEXT STEP: node scripts/ingest/index_unified.js --recreate');
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
