#!/usr/bin/env node
/**
 * promote_air_cleaner_inserts_covers.mjs
 *
 * Laken's ask: split "Air Cleaner Inserts & Covers" out into its own
 * subcategory (16th) under Fuel, Air & Carburetors, rather than leaving it
 * as a display_subcategory_detail tag inside the main "Air Cleaner" bucket.
 * Maps directly onto the two existing detail groups from that bucket
 * (Air Cleaner Covers 190 + Inserts & Windows 22 = 212) -- the detail tags
 * are left as-is so the new subcategory gets its own tier-3 breakdown for
 * free (Covers vs Windows & Inserts).
 *
 * Usage:
 *   node scripts/ingest/promote_air_cleaner_inserts_covers.mjs            # dry run
 *   node scripts/ingest/promote_air_cleaner_inserts_covers.mjs --apply    # live write
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
const NEW_SUBCAT = 'Air Cleaner Inserts & Covers';

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name, display_subcategory_detail FROM catalog_unified
       WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Air Cleaner'
       AND display_subcategory_detail IN ('Air Cleaner Covers', 'Inserts & Windows')`,
      [CAT]
    );
    const tally = {};
    for (const row of res.rows) tally[row.display_subcategory_detail] = (tally[row.display_subcategory_detail] || 0) + 1;
    console.log(`Rows to promote to "${NEW_SUBCAT}": ${res.rows.length}`);
    for (const [k, v] of Object.entries(tally)) console.log(`  ${k}: ${v}`);
    for (const r of res.rows.slice(0, 8)) console.log(`  e.g. ${r.name}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE catalog_unified SET display_subcategory = $1
       WHERE is_active = true AND display_category = $2 AND display_subcategory = 'Air Cleaner'
       AND display_subcategory_detail IN ('Air Cleaner Covers', 'Inserts & Windows')`,
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
