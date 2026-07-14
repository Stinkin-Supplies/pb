// fix_accessories_misc_batch2.mjs
//
// Applies the second round of Laken's hand-annotated change_to decisions
// (212 rows still actionable out of 287 filled -- 75 were already applied
// in the prior wave-4b pass). All destination category/subcategory names
// confirmed live via lookup_batch2_categories.mjs and sample_camchest.mjs
// before mapping -- key finds:
//   - "Timing points cover" -> Engine/Engine Accessories (confirmed 125
//     existing points/timer/timing cover rows there)
//   - "Frame crash bar/highway bar" -> Foot Controls/Highway Bars & Pegs
//   - "Handlebar ape hanger" -> Handlebar & Controls/Handlebars & Components
//   - "Brake caliper hardware"/"Brake hardware" -> Brakes/Brake Hardware
//
// Usage:
//   node fix_accessories_misc_batch2.mjs           (dry run, no writes)
//   node fix_accessories_misc_batch2.mjs --apply   (applies the updates)

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
  79712: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' },
  83021: { category: 'Engine', subcategory: 'Engine Accessories' },
  77651: { category: 'Engine', subcategory: 'Engine Accessories' },
  77816: { category: 'Engine', subcategory: 'Engine Accessories' },
  77623: { category: 'Engine', subcategory: 'Engine Accessories' },
  77628: { category: 'Engine', subcategory: 'Engine Accessories' },
  82977: { category: 'Engine', subcategory: 'Pistons & Cylinders' },
  82976: { category: 'Engine', subcategory: 'Pistons & Cylinders' },
  92992: { category: 'Engine', subcategory: 'Pistons & Cylinders' },
  75842: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' },
  75841: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' },
  523838: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' },
  60961: { category: 'Engine', subcategory: 'Valves & Valve Train' },
  83859: { category: 'Engine', subcategory: 'Camchest' },

  92718: { category: 'Engine', subcategory: 'Engine Accessories' },
  92719: { category: 'Engine', subcategory: 'Engine Accessories' },
  77775: { category: 'Engine', subcategory: 'Engine Accessories' },
  77776: { category: 'Engine', subcategory: 'Engine Accessories' },
  70947: { category: 'Engine', subcategory: 'Engine Accessories' },
  92723: { category: 'Engine', subcategory: 'Engine Accessories' },
  92724: { category: 'Engine', subcategory: 'Engine Accessories' },
  92720: { category: 'Engine', subcategory: 'Engine Accessories' },
  92722: { category: 'Engine', subcategory: 'Engine Accessories' },

  91469: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' },
  61483: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' },
  95193: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' },
  75345: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' },

  74298: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' },
  74065: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' },
  74207: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' },
  74175: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' },
  74325: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' },
  91893: { category: 'Carburetion & Fuel', subcategory: 'EFI Throttle Bodies' },
  91895: { category: 'Carburetion & Fuel', subcategory: 'EFI Throttle Bodies' },
  91894: { category: 'Carburetion & Fuel', subcategory: 'EFI Throttle Bodies' },
  74568: { category: 'Carburetion & Fuel', subcategory: 'EFI Throttle Bodies' },
  90265: { category: 'Carburetion & Fuel', subcategory: 'EFI Tuners & Diagnostic Tools' },
  91847: { category: 'Carburetion & Fuel', subcategory: 'EFI Throttle Bodies' },

  55186: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  55165: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  52881: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  52884: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  52885: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  52882: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  52886: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },
  52887: { category: 'Foot Controls', subcategory: 'Highway Bars & Pegs' },

  80917: { category: 'Frames & Suspension', subcategory: 'Frame' },
  80920: { category: 'Frames & Suspension', subcategory: 'Frame' },
  80919: { category: 'Frames & Suspension', subcategory: 'Frame' },
  81048: { category: 'Frames & Suspension', subcategory: 'Frame' },
  47445: { category: 'Frames & Suspension', subcategory: 'Frame' },
  47444: { category: 'Frames & Suspension', subcategory: 'Frame' },

  95088: { category: 'Frames & Suspension', subcategory: 'Forks' },
  95080: { category: 'Frames & Suspension', subcategory: 'Forks' },
  95079: { category: 'Frames & Suspension', subcategory: 'Forks' },
  92815: { category: 'Frames & Suspension', subcategory: 'Forks' },

  92965: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' },
  84101: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' },
  92403: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' },
  92792: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' },
  92558: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' },
  77295: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' },

  82775: { category: 'Electrical', subcategory: 'Generators & Starters' },
  82774: { category: 'Electrical', subcategory: 'Generators & Starters' },
  82748: { category: 'Electrical', subcategory: 'Generators & Starters' },
  82750: { category: 'Electrical', subcategory: 'Generators & Starters' },
  82773: { category: 'Electrical', subcategory: 'Generators & Starters' },
  83650: { category: 'Electrical', subcategory: 'Generators & Starters' },
  83652: { category: 'Electrical', subcategory: 'Generators & Starters' },
  90740: { category: 'Electrical', subcategory: 'Connectors & Terminals' },
  70712: { category: 'Electrical', subcategory: 'Ignition Switches & Accessories' },
  77494: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' },
  77495: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' },
  506517: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' },
  90952: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' },
  90937: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' },
  90951: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' },
  84766: { category: 'Electrical', subcategory: 'Sensors & Switches' },

  65914: { category: 'Electrical', subcategory: 'Ignition Coils' },
  92706: { category: 'Electrical', subcategory: 'Ignition Coils' },
  70237: { category: 'Electrical', subcategory: 'Ignition Coils' },
  90255: { category: 'Electrical', subcategory: 'Ignition Coils' },

  72098: { category: 'Lighting', subcategory: 'Lighting Parts' },
  72550: { category: 'Lighting', subcategory: 'Lighting Components & Accessories' },
  91363: { category: 'Lighting', subcategory: 'Lighting Parts' },
  72581: { category: 'Lighting', subcategory: 'Lighting Parts' },
  72544: { category: 'Lighting', subcategory: 'Reflectors & Lenses' },
  91226: { category: 'Lighting', subcategory: 'Taillights' },
  72177: { category: 'Lighting', subcategory: 'Taillights' },
  72171: { category: 'Lighting', subcategory: 'Taillights' },
  53433: { category: 'Lighting', subcategory: 'License Plate Lights' },

  79902: { category: 'Electrical', subcategory: 'Audio & Communication' },
  79903: { category: 'Electrical', subcategory: 'Audio & Communication' },

  57136: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' },
  57135: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' },
  57098: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' },
  57137: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' },
  37325: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' },
  37034: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' },
  89345: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  38954: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  38952: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  89233: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  89232: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  89244: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  89414: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  74891: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' },
  89399: { category: 'Handlebar & Controls', subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware' },

  75662: { category: 'Brakes', subcategory: 'Brake Hardware' },
  92819: { category: 'Brakes', subcategory: 'Brake Hardware' },
  96113: { category: 'Brakes', subcategory: 'Brake Hardware' },
  75576: { category: 'Brakes', subcategory: 'Brake Hardware' },
  88026: { category: 'Brakes', subcategory: 'Master Cylinders' },

  89940: { category: 'Exhaust', subcategory: 'Exhaust Parts' },
  91581: { category: 'Exhaust', subcategory: 'Exhaust Parts' },

  77334: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77333: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77343: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77365: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77366: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77371: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  56888: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77360: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77358: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77357: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77354: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77355: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77356: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },
  77359: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' },

  57155: { category: 'Tools & Chemicals', subcategory: 'Tools' },
  57156: { category: 'Tools & Chemicals', subcategory: 'Tools' },
  57153: { category: 'Tools & Chemicals', subcategory: 'Tools' },
  57157: { category: 'Tools & Chemicals', subcategory: 'Tools' },
  57154: { category: 'Tools & Chemicals', subcategory: 'Tools' },

  79338: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' },
  82145: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82101: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  76774: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  76772: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  76746: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  79179: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  24356: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  79284: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82096: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82140: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82147: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82104: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  79222: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82108: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  82109: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },
  79066: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' },

  78030: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },
  78029: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },
  92511: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },
  96127: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },
  93145: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },
  92876: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },
  64321: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' },

  90065: { category: 'Transmission & Clutch', subcategory: 'Rear Belts & Chains' },
  61185: { category: 'Transmission & Clutch', subcategory: 'Rear Belts & Chains' },

  57232: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  57179: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  55603: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  57234: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  57228: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  57230: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  51947: { category: 'Tanks & Body', subcategory: 'Front Fender & Hardware' },
  57237: { category: 'Tanks & Body', subcategory: 'Rear Fender, Struts, Hardware' },
  51963: { category: 'Tanks & Body', subcategory: 'Rear Fender, Struts, Hardware' },
  51964: { category: 'Tanks & Body', subcategory: 'Rear Fender, Struts, Hardware' },
  93289: { category: 'Tanks & Body', subcategory: 'Fender Trim' },
  93405: { category: 'Tanks & Body', subcategory: 'Fender Trim' },
  46298: { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps' },
  522896: { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps' },

  57335: { category: 'Luggage & Racks', subcategory: 'Bags & Packs' },
  57336: { category: 'Luggage & Racks', subcategory: 'Bags & Packs' },
  79503: { category: 'Luggage & Racks', subcategory: 'Saddlebags' },
  79504: { category: 'Luggage & Racks', subcategory: 'Saddlebags' },

  79145: { category: 'Riding Gear & Apparel', subcategory: 'Accessories' },
  79113: { category: 'Riding Gear & Apparel', subcategory: 'Accessories' },
};

const DEACTIVATE_IDS = [
  65681, 65680, 79090, 81473, 75315, 75089, 513022, 513021, 94856, 95236, 80343,
  82042, 82041, 82040, 82039, 79154, 82046, 82045, 79328, 82043, 24353,
  56852, 56856, 56858, 56860, 56863, 56865, 56867, 56870, 56811, 56874,
  24359,
];

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

    console.log(`--- Recategorize (${Object.keys(MOVES).length} rows) ---`);
    for (const [idStr, dest] of Object.entries(MOVES)) {
      await applyMove(client, Number(idStr), dest.category, dest.subcategory, applied);
    }

    console.log(`\n--- Deactivate ("Remove", ${DEACTIVATE_IDS.length} rows) ---`);
    for (const id of DEACTIVATE_IDS) {
      const curRes = await client.query(`SELECT id, name, is_active FROM catalog_unified WHERE id = $1`, [id]);
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(`  [${id}] ${cur.name} | is_active: ${cur.is_active} -> false`);
      if (APPLY) {
        const res = await client.query(`UPDATE catalog_unified SET is_active = false WHERE id = $1`, [id]);
        if (res.rowCount === 1) applied.count++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Recategorize candidates: ${Object.keys(MOVES).length}`);
    console.log(`Deactivate candidates: ${DEACTIVATE_IDS.length}`);
    console.log(`Total: ${Object.keys(MOVES).length + DEACTIVATE_IDS.length}`);
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
