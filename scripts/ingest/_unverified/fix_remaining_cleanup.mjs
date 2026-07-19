// fix_remaining_cleanup.mjs
//
// Applies everything decided in today's cleanup sweep:
//   1. Small category-only-move rows (5 rows): confirmed real subcategory
//      names for Carburetion & Fuel->Tanks & Body reroute, Frames &
//      Suspension riser covers, Tanks & Body dash panel, Hardware headbolt
//      cover.
//   2. Instrumentation -> Dashes & Gauges merge (38 rows) + retirement.
//      "Dash & Trim" subcat rows go to the real "Dash & Panel" bucket
//      (confirmed via sample_dash_subcats.mjs -- Dash & Panel holds actual
//      dash console/cover hardware; Decals & Trim is pure adhesive decals,
//      wrong fit). Gauges/Speedometers carry over unchanged (same names
//      exist in both categories).
//   3. Wheels & Tires tool cluster (5 rows): unrelated tools swept in by
//      an earlier pass -> Tools & Chemicals/Tools.
//   4. Brakes clutch/shift-lever misroutes (46 of 51 rows): clutch
//      hardware -> Transmission & Clutch/Clutch Kits & Components; shift
//      levers/arms/shafts -> Transmission & Clutch/Shifter Forks & Gears;
//      ambiguous lever SETS (brake+clutch combined) -> Handlebar &
//      Controls/Hand Control Sets, Levers per Laken's call. 5 true oddballs
//      (Bolt Screws, Springer Fender Mounts, 2x Air Cleaner Backing Plate,
//      Exhaust Pipe Baffle Set) explicitly skipped -- Laken's call, left in
//      Brakes for individual review later.
//
// Usage:
//   node fix_remaining_cleanup.mjs           (dry run, no writes)
//   node fix_remaining_cleanup.mjs --apply   (applies the updates)

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

// --- 1. Small category-only-move fixes ---
const SMALL_FIXES = {
  77297: { category: 'Tanks & Body', subcategory: 'Fuel/Oil Line, Clamps and Finishers' }, // 45 deg Oil Tube Fitting, was Carburetion & Fuel
  515253: { category: 'Tanks & Body', subcategory: 'Fender Parts & Accessories' }, // Black Panel for Split Tanks -- dash panel near tanks
  56152: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Aluminium Front Plate Black -- riser cover
  56154: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Aluminium Front Plate Silver
  83020: { category: 'Hardware, Covers & General', subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps' }, // Acorn Type Headbolt Cover Chrome
};

// --- 2. Instrumentation -> Dashes & Gauges merge ---
// Subcategory mapping: Gauges -> Gauges, Speedometers -> Speedometers
// (identical names, straight carryover), Dash & Trim -> Dash & Panel
// (confirmed real bucket via sample query -- Dash & Panel holds actual
// console/cover hardware, Decals & Trim is pure decals, wrong fit)
const INSTRUMENTATION_SUBCAT_MAP = {
  'Gauges': 'Gauges',
  'Speedometers': 'Speedometers',
  'Dash & Trim': 'Dash & Panel',
};

// --- 3. Wheels & Tires tool cluster -> Tools & Chemicals/Tools ---
const WHEELS_TOOL_IDS = [54985, 55110, 55187, 42726, 42727];

// --- 4. Brakes clutch/shift-lever misroutes ---
const BRAKES_TO_CLUTCH_KITS = [
  41302, // CLUTCH ACTUATOR ADAPTER CHROME
  56712, // CLUTCH ADAPTER HERITAGE LEVERS
  45873, // CLUTCH BASKET M8 MOTORS
  53557, 53555, 53556, 53554, // CLUTCH LEVER BARREL ADJUSTER x4
  56170, // HERITAGE CLUTCH LEVER
  45874, // TORQ-DRIVE CLUTCH DYNA
  48816, // TORQ-DRIVE CLUTCH INDIAN FTR
  41651, 41649, 41653, // WIDE V-CUT CLUTCH LEVER x3
];

const BRAKES_TO_SHIFTER_FORKS = [
  51858, // FOLDING SHIFT LEVER
  58600, // INNER SHIFT ARM CHROME FLST
  42152, // INNER SHIFT ARM W/O-RINGS CHROME
  51151, // INNER SHIFT LEVER 06-17 DYNA
  48285, // INNER SHIFT LEVER BLACK M8 SOFTAIL
  42153, // INNER SHIFT LEVER CHROME
  48284, // INNER SHIFT LEVER M8 SOFTAIL
  42154, // LEVER SHIFT XL LATE
  49331, // SHIFT LEVER BLACK XL 91-03
  42155, // SHIFT LEVER CHROME 34605-86T
  42157, // SHIFT LEVER CHR XL 04-24
  42156, // SHIFT LEVER CHR XL 91-03
  42159, // SHIFT LEVER DYNA GLIDE CHROME
  42158, // SHIFT LEVER FXR 82-94
  42151, // SHIFT SHAFT FXR CHROME 36T
  41927, // TRANS SHIFT LEVER BT 85-96
  41928, // TRANS SHIFT LEVER BT 97-14
];

const BRAKES_TO_HAND_CONTROL_SETS = [
  57143, 57147, 57141, 57142, 57146, 57140, // ANTHEM LEVER SET x6
  57145, 57149, 57139, 57144, 57148, 57138, // ANTHEM SHORTY LEVER SET x6
  57344, // MX STYLE LEVER SET
  57421, // SHORTY MX LEVER SET
  46242, 46243, // RACE LEVERS HYDRAULIC x2
];

// Explicitly skipped -- Laken's call, left in Brakes for individual review
const BRAKES_SKIPPED = [82965, 48675, 509248, 73706, 69235];

async function applyMove(client, id, category, subcategory, applied) {
  const curRes = await client.query(
    `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
    [id]
  );
  if (curRes.rows.length === 0) {
    console.log(`  [${id}] NOT FOUND -- skipping`);
    return;
  }
  const cur = curRes.rows[0];
  console.log(`  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory ?? 'NULL'} -> ${category}/${subcategory}`);
  if (APPLY) {
    const res = await client.query(
      `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
      [category, subcategory, id]
    );
    if (res.rowCount === 1) applied.count++;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (no writes) ===\n');
    const applied = { count: 0 };

    console.log('--- 1. Small category-only-move fixes (5 rows) ---');
    for (const [idStr, dest] of Object.entries(SMALL_FIXES)) {
      await applyMove(client, Number(idStr), dest.category, dest.subcategory, applied);
    }

    console.log('\n--- 2. Instrumentation -> Dashes & Gauges merge ---');
    const instRes = await client.query(`
      SELECT id, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Instrumentation' AND is_active = true
      ORDER BY name
    `);
    console.log(`  Found ${instRes.rows.length} rows in Instrumentation`);
    for (const r of instRes.rows) {
      const newSubcat = INSTRUMENTATION_SUBCAT_MAP[r.display_subcategory];
      if (!newSubcat) {
        console.log(`  [${r.id}] ${r.name} -- WARNING: no mapping for subcat "${r.display_subcategory}", skipping`);
        continue;
      }
      console.log(`  [${r.id}] ${r.name} | Instrumentation/${r.display_subcategory} -> Dashes & Gauges/${newSubcat}`);
      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          ['Dashes & Gauges', newSubcat, r.id]
        );
        if (res.rowCount === 1) applied.count++;
      }
    }
    if (APPLY) {
      const checkRes = await client.query(`
        SELECT COUNT(*)::int AS n FROM catalog_unified WHERE display_category = 'Instrumentation' AND is_active = true
      `);
      console.log(`  Instrumentation row count after merge: ${checkRes.rows[0].n} (should be 0 -- safe to retire/drop the category label if 0)`);
    }

    console.log('\n--- 3. Wheels & Tires tool cluster -> Tools & Chemicals/Tools (5 rows) ---');
    for (const id of WHEELS_TOOL_IDS) {
      await applyMove(client, id, 'Tools & Chemicals', 'Tools', applied);
    }

    console.log('\n--- 4a. Brakes -> Transmission & Clutch/Clutch Kits & Components ---');
    for (const id of BRAKES_TO_CLUTCH_KITS) {
      await applyMove(client, id, 'Transmission & Clutch', 'Clutch Kits & Components', applied);
    }

    console.log('\n--- 4b. Brakes -> Transmission & Clutch/Shifter Forks & Gears ---');
    for (const id of BRAKES_TO_SHIFTER_FORKS) {
      await applyMove(client, id, 'Transmission & Clutch', 'Shifter Forks & Gears', applied);
    }

    console.log('\n--- 4c. Brakes -> Handlebar & Controls/Hand Control Sets, Levers ---');
    for (const id of BRAKES_TO_HAND_CONTROL_SETS) {
      await applyMove(client, id, 'Handlebar & Controls', 'Hand Control Sets, Levers', applied);
    }

    console.log(`\n--- Skipped (Laken's call, left in Brakes): ${BRAKES_SKIPPED.join(', ')} ---`);

    console.log('\n=== Summary ===');
    const totalCandidates =
      Object.keys(SMALL_FIXES).length +
      instRes.rows.length +
      WHEELS_TOOL_IDS.length +
      BRAKES_TO_CLUTCH_KITS.length +
      BRAKES_TO_SHIFTER_FORKS.length +
      BRAKES_TO_HAND_CONTROL_SETS.length;
    console.log(`Total candidates: ${totalCandidates}`);
    console.log(`Skipped (Brakes oddballs): ${BRAKES_SKIPPED.length}`);
    if (APPLY) {
      console.log(`Applied: ${applied.count}`);
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
