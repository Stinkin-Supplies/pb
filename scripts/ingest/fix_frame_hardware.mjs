// fix_frame_hardware.mjs
// Reclassifies Frame & Hardware's 436 NULL rows + cleans 11 seal/gasket rows out of
// the 1,743-row Hardware & Fasteners bin, per session-84 analysis.
//
// DRY RUN (default): node fix_frame_hardware.mjs > output.txt 2>&1
// APPLY:             node fix_frame_hardware.mjs --apply > output.txt 2>&1

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

// --- Vendor-category bulk moves (uniform groups, no per-row classification needed) ---
const CATEGORY_GROUPS = [
  { label: 'HARDWARE -> Hardware & Fasteners', vendorCategories: ['HARDWARE', 'HARDWARE GROUP'], newCat: 'Frame & Hardware', newSub: 'Hardware & Fasteners' },
  { label: 'Covers/crash bars -> Foot Controls/Highway Bars & Pegs', vendorCategories: ['Covers, '], newCat: 'Foot Controls', newSub: 'Highway Bars & Pegs' },
  { label: 'FRAME AND BODY -> Frame Parts', vendorCategories: ['FRAME AND BODY', 'FRAME AND BODY GROUP'], newCat: 'Frame & Hardware', newSub: 'Frame Parts' },
  { label: 'ENGINE (vendor cat) -> Engine/Engine Parts', vendorCategories: ['ENGINE', 'Engine'], newCat: 'Engine', newSub: 'Engine Parts' },
  { label: 'ENGINE MOUNTS (strap clamps) -> Handlebar & Controls', vendorCategories: ['ENGINE MOUNTS'], newCat: 'Handlebar & Controls', newSub: 'Risers, Clamps & Components' },
];

// The 3 null/null crash bar rows (no vendor category at all)
const NULL_CATEGORY_CRASH_BARS = [57068, 57066, 57067];

// --- Hardware Listing (159 rows), manually classified ---
const HARDWARE_LISTING_GROUPS = [
  { label: 'Engine / Performance Kits', category: 'Engine', subcategory: 'Performance Kits',
    ids: [42548,42546,42547,42545,42544,42550,42549] },
  { label: 'Engine / Camchest', category: 'Engine', subcategory: 'Camchest',
    ids: [42554,42553,42552,42551,42587,42498,42397,42555, 44020,44019,44013, 42558,42559,42560,42561,45811,42562, 58584,58583,44012,43959] },
  { label: 'Engine / Complete Engines', category: 'Engine', subcategory: 'Complete Engines',
    ids: [45813] },
  { label: 'Engine / Engine Parts', category: 'Engine', subcategory: 'Engine Parts',
    ids: [36860,36912,37807,58593] },
  { label: 'Engine / Oil Pumps', category: 'Engine', subcategory: 'Oil Pumps',
    ids: [58574,58576] },
  { label: 'Transmission & Clutch / Clutch Kits & Components', category: 'Transmission & Clutch', subcategory: 'Clutch Kits & Components',
    ids: [42120] },
  { label: 'Transmission & Clutch / Primary & Derby Covers', category: 'Transmission & Clutch', subcategory: 'Primary & Derby Covers',
    ids: [58472,58474,58473, 42588,42556, 45809] },
  { label: 'Transmission & Clutch / Pulleys & Sprockets', category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets',
    ids: [43363,43362,46060, 42037,42038,42036,42034,42035, 58475,42039, 42044,42043,42040, 42589,42591,42590] },
  { label: 'Transmission & Clutch / Mainshaft & Components', category: 'Transmission & Clutch', subcategory: 'Mainshaft & Components',
    ids: [58479, 42048,58480, 44161, 58587,58588] },
  { label: 'Transmission & Clutch / Transmission Covers & Dipsticks', category: 'Transmission & Clutch', subcategory: 'Transmission Covers & Dipsticks',
    ids: [42571,42568,42566,42567,42570,42569] },
  { label: 'Transmission & Clutch / Kickstarters & Hardware', category: 'Transmission & Clutch', subcategory: 'Kickstarters & Hardware',
    ids: [42122] },
  { label: 'Transmission & Clutch / Primary Chain Drives', category: 'Transmission & Clutch', subcategory: 'Primary Chain Drives',
    ids: [42124] },
  { label: 'Frame & Hardware / Hardware & Fasteners (generic)', category: 'Frame & Hardware', subcategory: 'Hardware & Fasteners',
    ids: [51955,51965, 58610,58712, 41554, 41221,41222, 42599, 43391,43390,43299,43395, 49468,49467,49470,49469,49472,49471, 36843,36841] },
  { label: 'Handlebar & Controls / Risers, Clamps & Components', category: 'Handlebar & Controls', subcategory: 'Risers, Clamps & Components',
    ids: [46403,42537, 41619,41618, 42595,42596,42597,42592,42594,42593] },
  { label: 'Brakes / Brake Hardware', category: 'Brakes', subcategory: 'Brake Hardware',
    ids: [58582, 42580,42581, 42586,42584, 41301] },
  { label: 'Tanks & Body / Gas Tanks & Gas Caps', category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps',
    ids: [49451,49457,49461,49452,49455,49458,49462,49454,49456,49459,49463,49460] },
  { label: 'Tanks & Body / License Plate Mounts, Frames, Lighting, Hardware', category: 'Tanks & Body', subcategory: 'License Plate Mounts, Frames, Lighting, Hardware',
    ids: [36706,36707,47228,48764] },
  { label: 'Lighting / Turn Signals', category: 'Lighting', subcategory: 'Turn Signals',
    ids: [45595, 41709,41592,41711,41710] },
  { label: 'Lighting / Lighting Components & Accessories', category: 'Lighting', subcategory: 'Lighting Components & Accessories',
    ids: [46308] },
  { label: 'Electrical / Points, Distributors & Accessories', category: 'Electrical', subcategory: 'Points, Distributors & Accessories',
    ids: [47616,42557] },
  { label: 'Electrical / Ignition Coils', category: 'Electrical', subcategory: 'Ignition Coils',
    ids: [49473] },
  { label: 'Frames & Suspension / General Accessories', category: 'Frames & Suspension', subcategory: 'General Accessories',
    ids: [51003, 58454,58455,58456] },
  { label: 'Suspension / Lowering & Lift Kits', category: 'Suspension', subcategory: 'Lowering & Lift Kits',
    ids: [49465,49466] },
  { label: 'Foot Controls / Floorboards & HW', category: 'Foot Controls', subcategory: 'Floorboards & HW',
    ids: [42030] },
  { label: 'Foot Controls / Footpegs, Shift Pegs, & HW', category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW',
    ids: [53257] },
  { label: 'Cables / Hydraulic Clutch Lines', category: 'Cables', subcategory: 'Hydraulic Clutch Lines',
    ids: [46676] },
  { label: 'Cables / Cable Hardware', category: 'Cables', subcategory: 'Cable Hardware',
    ids: [47461,47462,47442,47443] },
  { label: 'Carburetion & Fuel / Carburetors & Components', category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components',
    ids: [40027] },
  { label: 'Seating / Seat Hardware', category: 'Seating', subcategory: 'Seat Hardware',
    ids: [43393,43394,43399,43397, 54558] },
  { label: 'Luggage & Racks / Sissy Bars', category: 'Luggage & Racks', subcategory: 'Sissy Bars',
    ids: [51163] },
  { label: 'Luggage & Racks / Saddlebags', category: 'Luggage & Racks', subcategory: 'Saddlebags',
    ids: [46385] },
  { label: 'Riding Gear & Apparel / Helmet Accessories & Parts', category: 'Riding Gear & Apparel', subcategory: 'Helmet Accessories & Parts',
    ids: [53918,53916,53917,47350,40398] },
];

// --- 11 seal/gasket rows currently in the 1,743 Hardware & Fasteners bin ---
const SEAL_GASKET_IDS = [23785, 27615, 28124, 28145, 2207, 2820, 13796, 1368, 39675, 39676, 24736];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    async function categoryUpdate(label, vendorCategories, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Frame & Hardware'
           AND display_subcategory IS NULL
           AND category = ANY($1::text[])`,
        [vendorCategories]
      );
      console.log(`--- ${label}: ${checkRes.rows.length} rows ---`);
      if (checkRes.rows.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [checkRes.rows.map((r) => r.id), newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    async function idListUpdate(label, ids, newCat, newSub, extraWhere = `AND display_subcategory IS NULL`) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE id = ANY($1::int[]) AND is_active = true ${extraWhere}`,
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

    console.log('=== Vendor-category bulk moves ===\n');
    for (const g of CATEGORY_GROUPS) {
      await categoryUpdate(g.label, g.vendorCategories, g.newCat, g.newSub);
    }
    await idListUpdate('Null-category crash bars -> Foot Controls/Highway Bars & Pegs', NULL_CATEGORY_CRASH_BARS, 'Foot Controls', 'Highway Bars & Pegs');

    console.log('=== Hardware Listing (159 rows), manual classification ===\n');
    for (const g of HARDWARE_LISTING_GROUPS) {
      await idListUpdate(g.label, g.ids, g.category, g.subcategory);
    }

    console.log('=== 1,743-row Hardware & Fasteners bin cleanup ===\n');
    await idListUpdate(
      'Seal/gasket rows -> Gaskets & Seals/Gasket Kits',
      SEAL_GASKET_IDS,
      'Gaskets & Seals',
      'Gasket Kits',
      `AND display_category = 'Frame & Hardware' AND display_subcategory = 'Hardware & Fasteners'`
    );

    if (APPLY) {
      await client.query('COMMIT');
      console.log('=== COMMITTED ===');
    } else {
      console.log('=== DRY RUN COMPLETE — no changes made. Re-run with --apply to execute. ===');
      console.log('NOTE: 2 "FILLER HOSE" rows (Accessories vendor cat) intentionally left untouched per Laken\'s call.');
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
