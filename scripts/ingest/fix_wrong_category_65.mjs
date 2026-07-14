// fix_wrong_category_65.mjs
//
// Re-routes the 65 wrong-category candidates flagged (but never touched)
// during the "Subcategory pass for 5 categories" work back in an earlier
// session. Re-audited this session (audit_wrong_category_65.mjs) since the
// old ~65 estimate (47 Foot Controls + 18 Suspension) didn't match current
// data -- actual composition is 64 Wyatt Gatling-brand rows sitting wrong
// in Foot Controls (spanning several real categories) + 1 Suspension row.
//
// Excluded from this pass: rows that already have a real (non-NULL)
// subcategory assigned in Foot Controls, since those look correctly placed
// despite matching the Wyatt Gatling brand-name regex (Kickstands,
// Footpegs/Shift Pegs & HW, Floorboards & HW) -- 5 rows excluded.
//
// All destination categories/subcategories confirmed live via
// lookup_existing_categories.mjs / lookup_more_categories.mjs /
// lookup_final_categories.mjs -- no invented names.
//
// Usage:
//   node fix_wrong_category_65.mjs           (dry run, no writes)
//   node fix_wrong_category_65.mjs --apply   (applies the updates)

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

// id -> destination. subcategory: null means category-only move.
const MOVES = {
  // Exhaust (41 rows): fishtails, baffles, ground pounders, drag pipes,
  // exhaust systems, heat shield
  503861: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  503860: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  69190: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  503854: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  69332: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68849: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  502892: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  69333: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  503858: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  503859: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  69043: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68916: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68627: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68789: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68790: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68882: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68881: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68712: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  69210: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  69072: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68710: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  69209: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  69208: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68730: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68926: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68923: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68922: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68925: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68901: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68903: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68902: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  68904: { category: 'Exhaust', subcategory: 'Exhaust Systems' },
  69193: { category: 'Exhaust', subcategory: 'Headers & Pipes' },
  69195: { category: 'Exhaust', subcategory: 'Headers & Pipes' },
  69194: { category: 'Exhaust', subcategory: 'Headers & Pipes' },
  69192: { category: 'Exhaust', subcategory: 'Headers & Pipes' },
  68636: { category: 'Exhaust', subcategory: 'Exhaust Parts' }, // heat shield
  68718: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  69251: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  68676: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  69034: { category: 'Exhaust', subcategory: 'Exhaust Systems' },

  // Wheels & Tires (1 row)
  65206: { category: 'Wheels & Tires', subcategory: null }, // Front Disc Spoke Style -- no exact subcat confirmed

  // Tanks & Body (2 rows): fuel hose lock -> Fuel/Oil Line, Clamps and Finishers
  73967: { category: 'Tanks & Body', subcategory: 'Fuel/Oil Line, Clamps and Finishers' },
  73966: { category: 'Tanks & Body', subcategory: 'Fuel/Oil Line, Clamps and Finishers' },

  // Luggage & Racks (6 rows)
  94984: { category: 'Luggage & Racks', subcategory: 'Tour Pak' }, // Tour-Pak Luggage Latch Kit
  80844: { category: 'Luggage & Racks', subcategory: 'Racks' }, // Chrome Luggage Rack
  94957: { category: 'Luggage & Racks', subcategory: 'Tour Pak' }, // Tour-Pak Luggage Latch Kit
  80304: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // Saddlebag Bracket Kit
  80303: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // Saddlebag Brackets and Stud Kit
  69923: { category: 'Luggage & Racks', subcategory: 'Luggage Parts' }, // Tie Down Anchor Set

  // Hardware, Covers & General (4 rows): Allen head caps/assortment
  75358: { category: 'Hardware, Covers & General', subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps' },
  75360: { category: 'Hardware, Covers & General', subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps' },
  75359: { category: 'Hardware, Covers & General', subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps' },
  75361: { category: 'Hardware, Covers & General', subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps' },

  // Tanks & Body (3 rows): Contour Side Cover Set -- Fender Parts & Accessories
  80305: { category: 'Tanks & Body', subcategory: 'Fender Parts & Accessories' },
  80306: { category: 'Tanks & Body', subcategory: 'Fender Parts & Accessories' },
  95225: { category: 'Tanks & Body', subcategory: 'Fender Parts & Accessories' },

  // Hardware, Covers & General (1 row): Dealer Sign -> Merchandising
  79072: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },

  // Handlebar & Controls (4 rows): Grip Set -> Grips, Heated Grips
  68331: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  68334: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  68330: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  68333: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },

  // Engine (2 rows): Touring Torque Linkage System -> Engine Mounts & Hardware
  // Confirmed via vendor description: connects transmission case to frame
  // via isolation mount, reduces vibration -- drivetrain mounting hardware
  81205: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' },
  81206: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' },

  // Foot Controls (1 row): Brake Pedal Return Spring -- was miscategorized
  // under Suspension; this is the confirmed subcategory match, matches
  // precedent from the Suspension NULL cleanup (Spring Fork Brake items ->
  // Foot Controls/Brake Arm & Pedal Hardware)
  82: { category: 'Foot Controls', subcategory: 'Brake Arm & Pedal Hardware' },
};

// Excluded: already have a real subcategory in Foot Controls, look
// correctly placed despite matching the Wyatt Gatling brand regex
const EXCLUDED_IDS = new Set([67651, 67818, 89159, 89029, 87290]);

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (no writes) ===\n');

    let applied = 0;
    for (const [idStr, dest] of Object.entries(MOVES)) {
      const id = Number(idStr);
      // Fetch current state for logging
      const curRes = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
        [id]
      );
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND in catalog_unified -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(
        `  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory ?? 'NULL'} -> ${dest.category}${dest.subcategory ? '/' + dest.subcategory : ' (subcategory: null)'}`
      );

      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified
           SET display_category = $1, display_subcategory = $2
           WHERE id = $3`,
          [dest.category, dest.subcategory, id]
        );
        if (res.rowCount === 1) applied++;
      }
    }

    console.log(`\nExcluded (already correctly placed): ${[...EXCLUDED_IDS].join(', ')}`);

    console.log('\n=== Summary ===');
    console.log(`Total candidates: ${Object.keys(MOVES).length}`);
    console.log(`Excluded: ${EXCLUDED_IDS.size}`);
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
