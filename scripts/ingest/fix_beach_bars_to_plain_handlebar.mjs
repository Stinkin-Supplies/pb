#!/usr/bin/env node
/**
 * fix_beach_bars_to_plain_handlebar.mjs
 *
 * Laken's call: "Beach Bar" named handlebars (previously routed to Drag
 * Style Bars via the generic drag-style keyword regex) belong in Plain
 * Handlebar instead. Consolidates all 17 rows across the category
 * (16 in Drag Style Bars, 1 already correctly in Plain Handlebar via a
 * different path) into Plain Handlebar.
 *
 * Usage:
 *   node scripts/ingest/fix_beach_bars_to_plain_handlebar.mjs            # dry run
 *   node scripts/ingest/fix_beach_bars_to_plain_handlebar.mjs --apply    # live write
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
      SELECT id, brand, name, display_subcategory FROM catalog_unified
      WHERE is_active = true AND display_category = 'Handlebars & Hand Controls' AND name ~* 'beach\\s*bar'
        AND display_subcategory != 'Plain Handlebar'`);

    console.log(`Rows moving to Plain Handlebar: ${rows.length}`);
    rows.forEach(r => console.log(`  [${r.brand}] ${r.name} (was: ${r.display_subcategory})`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = 'Plain Handlebar', display_subcategory_detail = NULL WHERE id = $1`, [r.id]);
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
