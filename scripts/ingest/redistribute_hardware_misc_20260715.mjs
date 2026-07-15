#!/usr/bin/env node
/**
 * redistribute_hardware_misc_20260715.mjs
 *
 * Hardware > "Bolt Kits, Hardware Assortments & Replenishment" (3163 rows)
 * turned out to have ~400 rows of system-specific hardware kits that don't
 * belong in Hardware at all (dash cover kits, primary mounting kits, engine
 * fastener kits, brake mounting kits, etc.) -- same "big hardware dumping
 * ground" pattern as session 86's Engine Parts pass and this session's
 * Dashes & Gauges "Housing" bucket. Full manual read of all 398 rows, not a
 * blind regex pass -- classified by destination below.
 *
 * Usage:
 *   node redistribute_hardware_misc_20260715.mjs           # dry run
 *   node redistribute_hardware_misc_20260715.mjs --apply
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

import pg from 'pg';
const pool = new pg.Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const APPLY = process.argv.includes('--apply');

// Each destination maps to { category, subcategory, ids: [...] } -- explicit
// IDs, hand-verified against the full 398-row read, not regex.
const MOVES = [
  { category: 'Engine', subcategory: 'Engine Accessories', ids: [
    14852, 45807, 75350, 60314, 31120, 14923, 8712, 14850, 31124, 14920, 31126,
    30983, 8592, 8724, 8725, 31054, 14885, 14921, 28113, 28111, 6547, 28112,
    75094, 1690, 13169, 6549, 6552, 28137, 28128, 28148, 24662, 20454, 24691,
    24682, 29574, 64414, 796, 1696, 2169, 14986, 77506, 23939, 28146, 41904,
    24488, 41905, 23782, 28129, 28149, 28138, 28158, 28085, 28154, 23820,
    64728, 77609, 79966, 83494, 63073, 68355, 82816,
  ]},
  { category: 'Transmission & Clutch', subcategory: 'Transmission Parts', ids: [
    63163, 13171, 26812, 6577, 22263, 26172, 6561, 6554, 27522, 24741, 24523,
    24524, 44152, 44165, 44166, 44169, 44158, 44159, 44163, 44167, 44168,
    61167, 61168, 90055, 90057, 90056, 93135, 24656, 1601, 1338, 496513,
    64377, 64425, 64426, 64424, 3580, 1377, 45808, 51193, 23783, 27815, 9072,
  ]},
  { category: 'Dashes & Gauges', subcategory: 'Tank Dashes/ Console & Accessories', ids: [
    68339, 76657, 43699, 43355, 76725, 76757, 76724, 76758, 76760, 76756,
    76510, 28119, 76573, 76489, 76433, 18408, 18407, 28088, 18417, 76795,
    28115,
  ]},
  { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps', ids: [
    75927, 44146, 44145, 44149, 44151, 44150, 22261, 22260, 27527, 22262,
    23766, 26150, 23789, 28098,
  ]},
  { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware', ids: [
    28087, 70187, 6580,
  ]},
  { category: 'Tanks & Body', subcategory: 'Rear Fender, Struts & Hardware', ids: [
    6548, 6566, 23814, 23815, 89354, 68250, 89429, 89432,
  ]},
  { category: 'Tanks & Body', subcategory: 'License Plates', ids: [
    45597,
  ]},
  { category: 'Frames & Suspension', subcategory: 'Trike Kits & Sidecar Parts', ids: [
    80065, 95140, 88826, 95254,
  ]},
  { category: 'Frames & Suspension', subcategory: 'General', ids: [
    94833, 2898,
  ]},
  { category: 'Foot Controls', subcategory: 'Kickstands', ids: [
    75850, 89199, 69422, 68603, 82970,
  ]},
  { category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW', ids: [
    49271, 11645, 7291, 28940,
  ]},
  { category: 'Handlebar & Controls', subcategory: 'Risers, Clamps & Components', ids: [
    40790, 40792, 40791, 49326,
  ]},
  { category: 'Handlebar & Controls', subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware', ids: [
    74575, 13174, 69874,
  ]},
  { category: 'Windshields & Fairings', subcategory: 'Mounts, Brackets & Hardware', ids: [
    38884, 38883, 38880, 26451,
  ]},
  { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories', ids: [
    27967,
  ]},
  { category: 'Electrical', subcategory: 'Wiring & Components', ids: [
    68395, 25514, 93153, 27794, 36843, 36841, 23923, 23931, 23932,
  ]},
  { category: 'Electrical', subcategory: 'Points, Distributors & Accessories', ids: [
    93747, 93825, 77515, 93806, 70867, 13175,
  ]},
  { category: 'Electrical', subcategory: 'Sensors & Switches', ids: [
    69867, 69842, 69868, 69840, 69843, 86021, 69780,
  ]},
  { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories', ids: [
    75394, 42126, 42127, 42128, 42129,
  ]},
  { category: 'Electrical', subcategory: 'Ignition Coils', ids: [
    // (Coil Mount Kit already covered above under Points if needed)
  ]},
  { category: 'Electrical', subcategory: 'Audio & Communication', ids: [
    89362, 6545,
  ]},
  { category: 'Lighting', subcategory: 'Turn Signals', ids: [
    13850, 29334,
  ]},
  { category: 'Lighting', subcategory: 'Headlights', ids: [
    23803, 69953, 69956,
  ]},
  { category: 'Brakes', subcategory: 'Hardware', ids: [
    44155, 44147, 4799, 23892, 29206, 23891, 23903, 23894, 30410, 28984,
    23884, 7956, 14092, 29347, 7562, 29348, 7563, 2042, 58578, 44156, 44148,
    1351, 28089, 89351,
  ]},
  { category: 'Exhaust', subcategory: 'Exhaust Parts', ids: [
    69681, 89849, 70005, 89623, 89690, 70085,
  ]},
  { category: 'Seating', subcategory: 'Seat Hardware', ids: [
    27300, 27056, 27086, 1041, 28096, 23794, 69766, 69702,
  ]},
  { category: 'Luggage & Racks', subcategory: 'General Accessories', ids: [
    67073, 27826, 29439, 87282,
  ]},
  { category: 'Luggage & Racks', subcategory: 'Docking', ids: [
    41704, 41702, 41707, 41700, 41686, 41695, 41701, 41699, 41708, 41706,
    41705, 89877, 89875, 89874, 89876, 89871, 89872, 89873,
  ]},
  { category: 'Accessories & Gear', subcategory: 'Towing Equipment', ids: [
    79089, 80607, 79691, 89619, 95378,
  ]},
  { category: 'Accessories & Gear', subcategory: 'Merchandising', ids: [
    79153, 75420, 75826,
  ]},
  { category: 'Wheels & Tires', subcategory: 'Axles & Spacers', ids: [
    11353, 34442, 2215,
  ]},
  { category: 'Carburetion & Fuel', subcategory: 'Air Cleaners', ids: [
    19850, 25868, 19846, 25815,
  ]},
  { category: 'Carburetion & Fuel', subcategory: 'Carburetors', ids: [
    73600, 1335, 1349, 13168, 2217, 26319, 6562, 33707,
  ]},
  { category: 'Tools & Chemicals', subcategory: 'Tools', ids: [
    75739,
  ]},
];

async function main() {
  const client = await pool.connect();
  try {
    let total = 0;
    for (const move of MOVES) {
      const ids = move.ids.filter(id => typeof id === 'number' && id < 900000);
      if (ids.length === 0) continue;
      total += ids.length;
      console.log(`${APPLY ? 'Applying' : 'Would move'} ${ids.length} rows -> ${move.category} / ${move.subcategory}`);
      if (APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now()
           WHERE id = ANY($3::int[])`,
          [move.category, move.subcategory, ids]
        );
      }
    }
    console.log(`\nTotal rows ${APPLY ? 'moved' : 'targeted'}: ${total}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
