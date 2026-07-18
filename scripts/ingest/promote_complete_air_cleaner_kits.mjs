#!/usr/bin/env node
/**
 * promote_complete_air_cleaner_kits.mjs
 *
 * Laken's ask: split "Complete Air Cleaner Kits & Assemblies" out into its
 * own subcategory under Fuel, Air & Carburetors, rather than leaving it as
 * a display_subcategory_detail tag inside the main "Air Cleaner" bucket
 * (same pattern as the prior Air Cleaner Inserts & Covers promotion).
 * Leaves "Air Cleaner" holding just the remaining Breather Hardware rows
 * (76) -- the detail tag is left as-is on the promoted rows too, though
 * with only one detail value left it won't render a DETAIL section.
 *
 * Usage:
 *   node scripts/ingest/promote_complete_air_cleaner_kits.mjs            # dry run
 *   node scripts/ingest/promote_complete_air_cleaner_kits.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Fuel, Air & Carburetors';
const NEW_SUBCAT = 'Complete Air Cleaner Kits & Assemblies';

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name FROM catalog_unified
       WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Air Cleaner'
       AND display_subcategory_detail = $2`,
      [CAT, NEW_SUBCAT]
    );
    console.log(`Rows to promote to "${NEW_SUBCAT}": ${res.rows.length}`);
    for (const r of res.rows.slice(0, 8)) console.log(`  e.g. ${r.name}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE catalog_unified SET display_subcategory = $1
       WHERE is_active = true AND display_category = $2 AND display_subcategory = 'Air Cleaner'
       AND display_subcategory_detail = $1`,
      [NEW_SUBCAT, CAT]
    );
    await client.query('COMMIT');
    console.log(`\nPromoted ${result.rowCount} rows. Committed.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
