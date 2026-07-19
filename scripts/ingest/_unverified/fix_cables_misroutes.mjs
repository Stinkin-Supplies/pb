// fix_cables_misroutes.mjs
//
// Fixes the genuine misroutes found within Cables/Universal or Build Your
// Own (290 rows total in that subcat). Audited via audit_cables_misroutes.mjs
// -- of 21 flagged candidates, 20 are confirmed grip/throttle-sleeve
// products that don't belong in Cables at all (matched on the word "CABLE"
// appearing in the name, but are actually Handlebar & Controls items).
// 1 row (Cable Sleeve Adjuster) is genuine cable hardware and stays in
// Cables, just gets a better subcategory than the generic catch-all.
//
// Usage:
//   node fix_cables_misroutes.mjs           (dry run, no writes)
//   node fix_cables_misroutes.mjs --apply   (applies the updates)

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString });

// 20 rows: CABLE THROTTLE MEMORY FOAM GRIP (12), THROTTLE SLEEVE (2),
// VANS SIGNATURE CABLE (6) -> Handlebar & Controls / Grips, Heated Grips
const MOVE_TO_GRIPS = [
  43755, 43756, 43760, 43762, 43767, 43751, 43761, 43771, 43750, 43754, 43758, 43768, // memory foam grips
  41661, 46336, // throttle sleeves
  52864, 52865, 52868, 52866, 52867, 52869, // Vans signature
];

// 1 row: Cable Sleeve Adjuster -- genuine cable hardware, move to
// Cable Hardware subcategory (confirmed existing, 180 rows) instead of the
// generic Universal/Build Your Own catch-all
const MOVE_TO_CABLE_HARDWARE = [1345];

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (no writes) ===\n');

    let applied = 0;

    console.log(`--- Move to Handlebar & Controls / Grips, Heated Grips (${MOVE_TO_GRIPS.length} rows) ---`);
    for (const id of MOVE_TO_GRIPS) {
      const curRes = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
        [id]
      );
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(`  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory} -> Handlebar & Controls/Grips, Heated Grips`);
      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          ['Handlebar & Controls', 'Grips, Heated Grips', id]
        );
        if (res.rowCount === 1) applied++;
      }
    }

    console.log(`\n--- Move to Cables / Cable Hardware (${MOVE_TO_CABLE_HARDWARE.length} row) ---`);
    for (const id of MOVE_TO_CABLE_HARDWARE) {
      const curRes = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
        [id]
      );
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(`  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory} -> Cables/Cable Hardware`);
      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          ['Cables', 'Cable Hardware', id]
        );
        if (res.rowCount === 1) applied++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total candidates: ${MOVE_TO_GRIPS.length + MOVE_TO_CABLE_HARDWARE.length}`);
    if (APPLY) {
      console.log(`Applied: ${applied}`);
      console.log('\nRemember: Typesense re-sync/reindex still needed after this.');
    } else {
      console.log('\nDry run only -- no writes made. Re-run with --apply to write changes.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
