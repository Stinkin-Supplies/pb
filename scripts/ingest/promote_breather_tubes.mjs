#!/usr/bin/env node
/**
 * promote_breather_tubes.mjs
 *
 * Laken's ask: promote "Breather Tubes" out of the Air Cleaner detail
 * group into its own subcategory, matching the same treatment "Breather
 * Bolts" already has (both were called out together: "breather tubes and
 * bolts" mixed into Air Cleaner -- bolts already had a dedicated
 * subcategory from the original 15-bucket spec, tubes didn't).
 *
 * Usage:
 *   node scripts/ingest/promote_breather_tubes.mjs            # dry run
 *   node scripts/ingest/promote_breather_tubes.mjs --apply    # live write
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
const NEW_SUBCAT = 'Breather Tubes';

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1
       AND display_subcategory = 'Air Cleaner' AND display_subcategory_detail = $2`,
      [CAT, NEW_SUBCAT]
    );
    console.log(`Rows to promote to "${NEW_SUBCAT}": ${res.rows.length}`);
    for (const r of res.rows) console.log(`  ${r.name}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL
       WHERE is_active = true AND display_category = $2 AND display_subcategory = 'Air Cleaner' AND display_subcategory_detail = $1`,
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
main().catch((err) => { console.error(err); process.exit(1); });
