// fix_riding_gear_accessories.mjs
// Reclassifies the 157-row vendor-Accessories cluster (Riding Gear & Apparel,
// display_subcategory IS NULL, category='Accessories') per Laken's row-by-row
// annotations, session 84.
//
// DRY RUN (default): node fix_riding_gear_accessories.mjs > output.txt 2>&1
// APPLY:             node fix_riding_gear_accessories.mjs --apply > output.txt 2>&1

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

// Each group: ids, and either {category, subcategory} or {deactivate: true}
const GROUPS = [
  {
    label: 'DEACTIVATE (remove)',
    deactivate: true,
    ids: [
      48552, 43544, 52856,
      56814, 56829, 56819, 56816, 56827, 56821, 56824, 56837, 56843, 56840, 56845, 56847, 56834, 56850, 56832,
      48300,
      45352, 54731, 54730, 54729, 44295, 43384, 43385,
      42293,
      55126, 55125, 43217, 46730,
      46817, 43380, 50888, 55049,
    ],
  },
  {
    label: 'Handlebar & Controls / Risers, Clamps & Components',
    category: 'Handlebar & Controls',
    subcategory: 'Risers, Clamps & Components',
    ids: [
      39304, 50131, 50127, 43917, 50116, 50115, 50063, 50119, 50136, 39303,
      50117, 50118, 50123, 50112, 50106, 50126, 50120, 48720, 48721,
    ],
  },
  {
    label: 'Accessories & Misc / Trailer & Towing',
    category: 'Accessories & Misc',
    subcategory: 'Trailer & Towing',
    ids: [
      38125, 38124, 38123, 38122, 54877,
      38130, 38118, 38120, 38116, 38117, 38119, 38121,
      45864, 45862, 45865, 45843, 38127, 38126, 38080, 45863, 38131,
      38642, 38643, 38644, 38129,
      38637, 38638, 38639, 38640,
    ],
  },
  {
    label: 'Brakes / Brake Pedals & Pads',
    category: 'Brakes',
    subcategory: 'Brake Pedals & Pads',
    ids: [58407],
  },
  {
    label: 'Carburetion & Fuel / Air Cleaner & Components',
    category: 'Carburetion & Fuel',
    subcategory: 'Air Cleaner & Components',
    ids: [41835, 41836, 41834],
  },
  {
    label: 'Luggage & Racks / Sissy Bars',
    category: 'Luggage & Racks',
    subcategory: 'Sissy Bars',
    ids: [41683, 41688, 41681, 41682, 41687, 41685, 41692, 41690, 41691],
  },
  {
    label: 'Tanks & Body / Gas Tanks & Gas Caps',
    category: 'Tanks & Body',
    subcategory: 'Gas Tanks & Gas Caps',
    ids: [45442, 45443],
  },
  {
    label: 'Tanks & Body / Fuel/Oil Line, Clamps and Finishers',
    category: 'Tanks & Body',
    subcategory: 'Fuel/Oil Line, Clamps and Finishers',
    ids: [41833],
  },
  {
    label: 'Luggage & Racks / Luggage Parts',
    category: 'Luggage & Racks',
    subcategory: 'Luggage Parts',
    ids: [39588, 38367, 39589],
  },
  {
    label: 'Transmission & Clutch / Primary & Derby Covers',
    category: 'Transmission & Clutch',
    subcategory: 'Primary & Derby Covers',
    ids: [43679, 43673, 43429, 43428, 43432],
  },
  {
    label: 'Hardware, Covers & General / Drink Holders & Coolers, Flags, Flagpoles & Accessories',
    category: 'Hardware, Covers & General',
    subcategory: 'Drink Holders & Coolers, Flags, Flagpoles & Accessories',
    ids: [50133, 50134, 50129, 50130, 50124, 41081],
  },
  {
    label: 'Tools & Chemicals / Tools',
    category: 'Tools & Chemicals',
    subcategory: 'Tools',
    ids: [40839, 38633],
  },
  {
    label: 'Tanks & Body / License Plate Mounts, Frames, Lighting, Hardware',
    category: 'Tanks & Body',
    subcategory: 'License Plate Mounts, Frames, Lighting, Hardware',
    ids: [39509, 39397, 39386, 39510, 39327, 39517, 39516, 39499, 39514, 39515, 39512, 39513, 46295, 46296],
  },
  {
    label: 'Exhaust / Exhaust Parts',
    category: 'Exhaust',
    subcategory: 'Exhaust Parts',
    ids: [58414],
  },
  {
    label: 'Tanks & Body / Oil Tank, Dipstick, Hoses',
    category: 'Tanks & Body',
    subcategory: 'Oil Tank, Dipstick, Hoses',
    ids: [45406, 58700, 45403, 45803],
  },
  {
    label: 'Electrical / Electrical Parts',
    category: 'Electrical',
    subcategory: 'Electrical Parts',
    ids: [46931, 55050],
  },
  {
    label: 'Dashes & Gauges / Housings',
    category: 'Dashes & Gauges',
    subcategory: 'Housings',
    ids: [38949],
  },
  {
    label: 'Electrical / Audio & Communication',
    category: 'Electrical',
    subcategory: 'Audio & Communication',
    ids: [51057, 51056, 40368],
  },
  {
    label: 'Suspension / Swingarms',
    category: 'Suspension',
    subcategory: 'Swingarms',
    ids: [41721],
  },
  {
    label: 'Frames & Suspension / General Accessories',
    category: 'Frames & Suspension',
    subcategory: 'General Accessories',
    ids: [50125, 40370],
  },
  {
    label: 'Seating / Seat Hardware',
    category: 'Seating',
    subcategory: 'Seat Hardware',
    ids: [46733],
  },
  {
    label: 'Windshields & Fairings / Fairings',
    category: 'Windshields & Fairings',
    subcategory: 'Fairings',
    ids: [46186],
  },
  {
    label: 'Windshields & Fairings / Windshields',
    category: 'Windshields & Fairings',
    subcategory: 'Windshields',
    ids: [50135],
  },
  {
    label: 'Tools & Chemicals / Chemicals & Lubricants',
    category: 'Tools & Chemicals',
    subcategory: 'Chemicals & Lubricants',
    ids: [49839],
  },
  {
    label: 'Foot Controls / Highway Bars & Pegs (crash bars)',
    category: 'Foot Controls',
    subcategory: 'Highway Bars & Pegs',
    ids: [55632, 55635, 55638, 55640, 55634, 55637, 55624, 55639, 55633, 55636],
  },
];

async function main() {
  const totalIds = GROUPS.reduce((sum, g) => sum + g.ids.length, 0);
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Groups: ${GROUPS.length}, total rows: ${totalIds}\n`);

  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    for (const g of GROUPS) {
      // Verify current state before touching anything — ids can shift between
      // annotation time and apply time (per project convention).
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE id = ANY($1::int[])
           AND is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL`,
        [g.ids]
      );
      const foundIds = checkRes.rows.map((r) => r.id);
      const missingIds = g.ids.filter((id) => !foundIds.includes(id));

      console.log(`--- ${g.label} ---`);
      console.log(`  expected: ${g.ids.length}, found in current state: ${foundIds.length}`);
      if (missingIds.length) {
        console.log(`  MISSING/ALREADY-CHANGED ids (skipped): ${missingIds.join(', ')}`);
      }

      if (foundIds.length === 0) {
        console.log('');
        continue;
      }

      if (g.deactivate) {
        if (APPLY) {
          await client.query(
            `UPDATE catalog_unified SET is_active = false WHERE id = ANY($1::int[])`,
            [foundIds]
          );
        }
        console.log(`  ${APPLY ? 'DEACTIVATED' : 'would deactivate'}: ${foundIds.length} rows`);
      } else {
        if (APPLY) {
          await client.query(
            `UPDATE catalog_unified
             SET display_category = $2, display_subcategory = $3
             WHERE id = ANY($1::int[])`,
            [foundIds, g.category, g.subcategory]
          );
        }
        console.log(`  ${APPLY ? 'UPDATED' : 'would update'} ${foundIds.length} rows -> category="${g.category}" subcategory="${g.subcategory}"`);
      }
      console.log('');
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
