#!/usr/bin/env node
/**
 * fix_pushrods_in_camchest.mjs
 *
 * Caught while sampling Cam Chest for detail groups: 158 genuine pushrod
 * items (the rods themselves -- solid/adjustable pushrod sets/kits) were
 * sitting in Cam Chest while the separately-named "Pushrods" bucket
 * (renamed from the old "Pushrod Covers") only had the covers/tubes for
 * them. Laken's spec just says "Pushrods" -- one bucket, not split by
 * rod-vs-cover -- so merge the two.
 *
 * Usage:
 *   node scripts/ingest/fix_pushrods_in_camchest.mjs            # dry run
 *   node scripts/ingest/fix_pushrods_in_camchest.mjs --apply    # live write
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
    const res = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = 'Engine' AND display_subcategory = 'Cam Chest'
       AND name ILIKE '%pushrod%' AND name NOT ILIKE '%cam chest%' AND name NOT ILIKE '%camchest%'`
    );
    console.log(`Rows to move: ${res.rows.length}`);
    for (const r of res.rows.slice(0, 10)) console.log(`  ${r.name}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE catalog_unified SET display_subcategory = 'Pushrods' WHERE is_active = true AND display_category = 'Engine' AND display_subcategory = 'Cam Chest'
       AND name ILIKE '%pushrod%' AND name NOT ILIKE '%cam chest%' AND name NOT ILIKE '%camchest%'`
    );
    await client.query('COMMIT');
    console.log(`\nMoved ${result.rowCount} rows. Committed.`);
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
