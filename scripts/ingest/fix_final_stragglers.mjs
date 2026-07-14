// fix_final_stragglers.mjs
// Reclassifies the last 5 flagged categories: Seating (142), Foot Controls (59),
// Exhaust (21), Luggage & Racks (9), Wheels & Tires (6). Session 84.
//
// DRY RUN (default): node fix_final_stragglers.mjs > output.txt 2>&1
// APPLY:             node fix_final_stragglers.mjs --apply > output.txt 2>&1

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

// ===== SEATING (142) =====
const SEATING_GROUPS = [
  { label: 'Fender sissy bar item -> Luggage & Racks/Sissy Bars', cat: 'Luggage & Racks', sub: 'Sissy Bars',
    ids: [80668] },
  { label: 'SEATING vendor group: Seats', cat: 'Seating', sub: 'Seats',
    ids: [78842,78956,79006,79005,78999,78987,78947,78863,78862,78946,78838,79054,79053,79051,79052,79050,78447,79045,78978] },
  { label: 'SEATING vendor group: Saddlebags', cat: 'Luggage & Racks', sub: 'Saddlebags',
    ids: [79695,80289,94775] },
  { label: 'SEATING vendor group: Luggage Racks', cat: 'Luggage & Racks', sub: 'Racks',
    ids: [79038] },
  { label: 'SEATING vendor group: Seat Hardware', cat: 'Seating', sub: 'Seat Hardware',
    ids: [70182,79320,75578,70114,89745,69552,70115,89841,69927] },
  { label: 'SEATING GROUP: Seats', cat: 'Seating', sub: 'Seats',
    ids: [518834,518835] },
  { label: 'SEATING GROUP: Saddlebags', cat: 'Luggage & Racks', sub: 'Saddlebags',
    ids: [519534,518962,518947,519513,518871] },
  { label: 'SEATING GROUP: Seat Hardware', cat: 'Seating', sub: 'Seat Hardware',
    ids: [519778,520616,490880,512671,523813] },
  { label: 'SEATS exceptions: Shock mounts -> Frames & Suspension', cat: 'Frames & Suspension', sub: 'Rear Shocks & Lowering Kits',
    ids: [45902,45914] },
  { label: 'SEATS exceptions: Backrests', cat: 'Seating', sub: 'Backrests',
    ids: [57240,57242,57243,57198,57241,57192] },
  { label: 'SEATS exceptions: Seat Screws -> Seat Hardware', cat: 'Seating', sub: 'Seat Hardware',
    ids: [57083,57087,57089,57084,57090,57091,57088,57085,57086,57092] },
  { label: 'SEATS exceptions: Sissy bars -> Luggage & Racks', cat: 'Luggage & Racks', sub: 'Sissy Bars',
    ids: [41694,41698,41697,45402,45400] },
  { label: 'SEATS exceptions: Tail section covers -> Tanks & Body', cat: 'Tanks & Body', sub: 'Fender Parts & Accessories',
    ids: [52474,52473,52475,52472] },
];
// SEATS catch-all: whatever's left in category='SEATS' after exceptions -> Seating/Seats

// ===== FOOT CONTROLS (59) =====
const FOOTCONTROLS_GROUPS = [
  { label: 'COMMON MISC kick start pedal axle -> Transmission & Clutch', cat: 'Transmission & Clutch', sub: 'Kickstarters & Hardware',
    ids: [95249] },
  { label: 'Covers, -> Foot Controls/Footpegs, Shift Pegs, & HW', cat: 'Foot Controls', sub: 'Footpegs, Shift Pegs, & HW',
    ids: [54517,44200] },
  { label: 'FOOTBOARDS exceptions: LINBAR o-ring/dress-up kits -> Highway Bars & Pegs', cat: 'Foot Controls', sub: 'Highway Bars & Pegs',
    ids: [42624,42629] },
  { label: 'FOOTBOARDS exceptions: Brake pegs -> Brake Arm & Pedal Hardware', cat: 'Foot Controls', sub: 'Brake Arm & Pedal Hardware',
    ids: [51760,51759,51761] },
  { label: 'FOOTBOARDS exceptions: Shift linkage -> Transmission & Clutch', cat: 'Transmission & Clutch', sub: 'Shifter Forks & Gears',
    ids: [54905,54904] },
  { label: 'FOOTBOARDS exceptions: Forward controls brake line kit', cat: 'Foot Controls', sub: 'Forward Controls & HW',
    ids: [52650] },
  { label: 'FOOT CONTROLS(VTWIN) exceptions: Torque arm spacer -> Brakes', cat: 'Brakes', sub: 'Brake Hardware',
    ids: [67469] },
  { label: 'FOOT CONTROLS(VTWIN) exceptions: Tie rod ball joints -> Frames & Suspension', cat: 'Frames & Suspension', sub: 'General Accessories',
    ids: [88834,88835,91996] },
  { label: 'FOOT CONTROLS(VTWIN) exceptions: Front stand catch -> Kickstands', cat: 'Foot Controls', sub: 'Kickstands',
    ids: [75042] },
  { label: 'FOOT CONTROLS(VTWIN) exceptions: Stick starter lever -> Transmission & Clutch', cat: 'Transmission & Clutch', sub: 'Kickstarters & Hardware',
    ids: [70909,70859] },
  { label: 'FOOT CONTROLS(VTWIN) exceptions: Finger lever sets + side mount bracket -> Forward Controls & HW', cat: 'Foot Controls', sub: 'Forward Controls & HW',
    ids: [67330,67332,67334,67331,67335,67333,68640] },
];
// FOOTBOARDS, OPERATOR catch-all remainder -> Foot Controls/Floorboards & HW
// FOOT CONTROLS (VTWIN) catch-all remainder -> Foot Controls/Footpegs, Shift Pegs, & HW

// ===== EXHAUST (21) — fully explicit, no genuine exhaust rows exist =====
const EXHAUST_GROUPS = [
  { label: 'Engine valves', cat: 'Engine', sub: 'Valves & Valve Train',
    ids: [60890,60126,60127,60128,60943,60947,83579,60956,83566,60885] },
  { label: 'Handlebar grips', cat: 'Handlebar & Controls', sub: 'Grips, Heated Grips',
    ids: [68371,68369,68370,68374,67644] },
  { label: 'Tool', cat: 'Tools & Chemicals', sub: 'Tools',
    ids: [68070] },
  { label: 'Valve seats (EXHAUST SYSTEM vendor cat)', cat: 'Engine', sub: 'Valves & Valve Train',
    ids: [55595,55596,55597,55599,55600] },
];

// ===== LUGGAGE & RACKS (9) =====
const LUGGAGE_GROUPS = [
  { label: 'Sissy bar tab set', cat: 'Luggage & Racks', sub: 'Sissy Bars', ids: [78207] },
  { label: 'Saddlebags', cat: 'Luggage & Racks', sub: 'Saddlebags', ids: [42798, 43508, 79693] },
  { label: 'Windshield bags -> Bags & Packs', cat: 'Luggage & Racks', sub: 'Bags & Packs', ids: [38885, 39597, 39549] },
  { label: 'Luggage Parts', cat: 'Luggage & Racks', sub: 'Luggage Parts', ids: [80051] },
  { label: 'Bluetooth headset comfort kit -> Electrical', cat: 'Electrical', sub: 'Audio & Communication', ids: [53659] },
];

// ===== WHEELS & TIRES (6) =====
const WHEELS_GROUPS = [
  { label: 'Wheels/rims', cat: 'Wheels & Tires', sub: 'Wheels', ids: [81433, 81350] },
  { label: 'Valve stems', cat: 'Wheels & Tires', sub: 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights', ids: [94622, 94621] },
  { label: 'Hub', cat: 'Wheels & Tires', sub: 'Hubs & Spokes', ids: [78637] },
  { label: 'Wyatt Gatling front disc -> Brakes', cat: 'Brakes', sub: 'Rotors & Drums', ids: [65206] },
];

async function idListUpdate(client, label, ids, newCat, newSub) {
  const checkRes = await client.query(
    `SELECT id FROM catalog_unified WHERE id = ANY($1::int[]) AND is_active = true AND display_subcategory IS NULL`,
    [ids]
  );
  const foundIds = checkRes.rows.map((r) => r.id);
  const missing = ids.filter((id) => !foundIds.includes(id));
  console.log(`--- ${label}: expected ${ids.length}, found ${foundIds.length} ---`);
  if (missing.length) console.log(`  MISSING/ALREADY-CHANGED (skipped): ${missing.join(', ')}`);
  if (foundIds.length && APPLY) {
    await client.query(
      `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
      [foundIds, newCat, newSub]
    );
  }
  console.log(`  ${APPLY ? 'updated' : 'would update'} ${foundIds.length} -> category="${newCat}" subcategory="${newSub}"\n`);
}

async function catchAllUpdate(client, label, displayCat, vendorCat, newCat, newSub) {
  const checkRes = await client.query(
    `SELECT id FROM catalog_unified
     WHERE is_active = true AND display_category = $1 AND display_subcategory IS NULL AND category = $2`,
    [displayCat, vendorCat]
  );
  console.log(`--- ${label}: ${checkRes.rows.length} rows (remainder) ---`);
  if (checkRes.rows.length && APPLY) {
    await client.query(
      `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
      [checkRes.rows.map((r) => r.id), newCat, newSub]
    );
  }
  console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${newCat}" subcategory="${newSub}"\n`);
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    console.log('=== SEATING (142) ===\n');
    for (const g of SEATING_GROUPS) await idListUpdate(client, g.label, g.ids, g.cat, g.sub);
    await catchAllUpdate(client, 'SEATS catch-all remainder -> Seating/Seats', 'Seating', 'SEATS', 'Seating', 'Seats');

    console.log('=== FOOT CONTROLS (59) ===\n');
    for (const g of FOOTCONTROLS_GROUPS) await idListUpdate(client, g.label, g.ids, g.cat, g.sub);
    await catchAllUpdate(client, 'FOOTBOARDS catch-all remainder -> Floorboards & HW', 'Foot Controls', 'FOOTBOARDS, OPERATOR', 'Foot Controls', 'Floorboards & HW');
    await catchAllUpdate(client, 'FOOT CONTROLS(VTWIN) catch-all remainder -> Footpegs, Shift Pegs, & HW', 'Foot Controls', 'FOOT CONTROLS', 'Foot Controls', 'Footpegs, Shift Pegs, & HW');

    console.log('=== EXHAUST (21) ===\n');
    for (const g of EXHAUST_GROUPS) await idListUpdate(client, g.label, g.ids, g.cat, g.sub);

    console.log('=== LUGGAGE & RACKS (9) ===\n');
    for (const g of LUGGAGE_GROUPS) await idListUpdate(client, g.label, g.ids, g.cat, g.sub);

    console.log('=== WHEELS & TIRES (6) ===\n');
    for (const g of WHEELS_GROUPS) await idListUpdate(client, g.label, g.ids, g.cat, g.sub);

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
