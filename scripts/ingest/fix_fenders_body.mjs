// fix_fenders_body.mjs
// Reclassifies Fenders & Body's 98 NULL rows -- all rows move OUT to their real
// homes in Windshields & Fairings or Tanks & Body, per session-84 analysis.
//
// DRY RUN (default): node fix_fenders_body.mjs > output.txt 2>&1
// APPLY:             node fix_fenders_body.mjs --apply > output.txt 2>&1

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env location/name.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Each group keyed by vendor category (+ optional vendor subcategory)
const GROUPS = [
  { label: 'WINDSHIELD -> Windshields & Fairings/Windshields', vendorCat: 'WINDSHIELD', vendorSub: null, newCat: 'Windshields & Fairings', newSub: 'Windshields' },
  { label: 'TANK -> Tanks & Body/Gas Tanks & Gas Caps', vendorCat: 'TANK', vendorSub: null, newCat: 'Tanks & Body', newSub: 'Gas Tanks & Gas Caps' },
  { label: 'Covers, -> Tanks & Body/Gas Tanks & Gas Caps', vendorCat: 'Covers, ', vendorSub: null, newCat: 'Tanks & Body', newSub: 'Gas Tanks & Gas Caps' },
  { label: 'TANK GROUP-GAS AND OIL/FUEL LINES -> Fuel/Oil Line, Clamps and Finishers', vendorCat: 'TANK GROUP-GAS AND OIL', vendorSub: 'FUEL LINES', newCat: 'Tanks & Body', newSub: 'Fuel/Oil Line, Clamps and Finishers' },
  { label: 'TANK GROUP-GAS AND OIL/FUEL FILTERS -> Fuel/Oil Line, Clamps and Finishers', vendorCat: 'TANK GROUP-GAS AND OIL', vendorSub: 'FUEL FILTERS', newCat: 'Tanks & Body', newSub: 'Fuel/Oil Line, Clamps and Finishers' },
  { label: 'TANK GROUP-GAS AND OIL/OIL COOLERS -> Oil Tank, Dipstick, Hoses', vendorCat: 'TANK GROUP-GAS AND OIL', vendorSub: 'OIL COOLERS', newCat: 'Tanks & Body', newSub: 'Oil Tank, Dipstick, Hoses' },
  { label: 'TANK GROUP-GAS AND OIL/OIL FILTERS -> Oil Tank, Dipstick, Hoses', vendorCat: 'TANK GROUP-GAS AND OIL', vendorSub: 'OIL FILTERS', newCat: 'Tanks & Body', newSub: 'Oil Tank, Dipstick, Hoses' },
  { label: 'TANK GROUP-GAS AND OIL/OIL LINES -> Oil Tank, Dipstick, Hoses', vendorCat: 'TANK GROUP-GAS AND OIL', vendorSub: 'OIL LINES', newCat: 'Tanks & Body', newSub: 'Oil Tank, Dipstick, Hoses' },
  { label: 'TANK GROUP-GAS AND OIL/null -> Gas Tanks & Gas Caps', vendorCat: 'TANK GROUP-GAS AND OIL', vendorSub: null, newCat: 'Tanks & Body', newSub: 'Gas Tanks & Gas Caps' },
];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    for (const g of GROUPS) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Fenders & Body'
           AND display_subcategory IS NULL
           AND category = $1
           AND subcategory IS NOT DISTINCT FROM $2`,
        [g.vendorCat, g.vendorSub]
      );
      console.log(`--- ${g.label}: ${checkRes.rows.length} rows ---`);
      if (checkRes.rows.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [checkRes.rows.map((r) => r.id), g.newCat, g.newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${g.newCat}" subcategory="${g.newSub}"\n`);
    }

    if (APPLY) {
      await client.query('COMMIT');
      console.log('=== COMMITTED ===');
    } else {
      console.log('=== DRY RUN COMPLETE — no changes made. Re-run with --apply to execute. ===');
    }
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
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
