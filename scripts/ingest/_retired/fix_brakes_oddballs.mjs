// fix_brakes_oddballs.mjs
//
// The last 5 rows held back from the Brakes wrong-category cluster (they
// didn't fit clutch/shift-lever destinations used for the other 46 rows).
// Confirmed via sample query that Frames & Suspension/General Accessories
// (skid plates, highway/freeway bars, chin spoilers -- mount/accessory
// hardware) is the right fit for Springer Fender Mounts, not Frame
// (structural frame components only).
//
// Usage:
//   node fix_brakes_oddballs.mjs           (dry run, no writes)
//   node fix_brakes_oddballs.mjs --apply   (applies the updates)

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

const MOVES = {
  82965: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Bolt Screws Chrome Allen -> general hardware
  48675: { category: 'Frames & Suspension', subcategory: 'General Accessories' }, // Springer Fender Mounts -> fender hardware
  509248: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' }, // S&S Air Cleaner Backing Plate
  73706: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' }, // Ultima Air Cleaner Backing Plate Adapter
  69235: { category: 'Exhaust', subcategory: 'Exhaust Parts' }, // V-Slot Style Exhaust Pipe Baffle Set
};

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (no writes) ===\n');
    let applied = 0;

    for (const [idStr, dest] of Object.entries(MOVES)) {
      const id = Number(idStr);
      const curRes = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
        [id]
      );
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(`  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory ?? 'NULL'} -> ${dest.category}/${dest.subcategory}`);
      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          [dest.category, dest.subcategory, id]
        );
        if (res.rowCount === 1) applied++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total candidates: ${Object.keys(MOVES).length}`);
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
