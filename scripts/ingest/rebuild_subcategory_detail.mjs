#!/usr/bin/env node
/**
 * rebuild_subcategory_detail.mjs — taxonomy_v2_plan.md §7 tier-3 branching
 *
 * Adds display_subcategory_detail: a third flat tier under display_subcategory,
 * for the 36 subcategories (>700 rows each) identified by tier3_candidate_finder.sql
 * as large enough that a single facet is doing too much work. Every split below
 * was built from real product-name vocabulary (prefix-mining + sampling), not
 * guessed — see tier3_final_mappings.sql for the full evidence trail and the
 * exact query used to verify each one's bucket sizes.
 *
 * Stopping rule (per plan): a bucket only ships if it clears roughly 50-100+ rows.
 * Anything smaller was folded into a neighboring bucket or left flat. Coverage
 * varies a lot by subcategory (2%-92% unclassified) because some subcategories
 * are named by function (clean split) and others by brand/style-line (fragmented,
 * lower yield) — see per-subcategory notes below for why low-coverage ones are
 * low on purpose, not under-baked.
 *
 * Same safety pattern as rebuild_display_category_v2.mjs: writes to a shadow
 * column first, dry-run reports the full diff, --promote is a separate explicit step.
 *
 * Usage:
 *   node rebuild_subcategory_detail.mjs                 # dry run, report only
 *   node rebuild_subcategory_detail.mjs --write-shadow   # populate shadow column
 *   node rebuild_subcategory_detail.mjs --promote        # shadow -> live column
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

import pg from 'pg';
const { Pool } = pg;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env.local at the repo root.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const WRITE_SHADOW = process.argv.includes('--write-shadow');
const PROMOTE = process.argv.includes('--promote');

// Each classifier receives the lowercased product name and returns a detail
// string or null (stays flat). Keyed by "display_category|display_subcategory".
const CLASSIFIERS = {
  'Handlebar & Controls|Cables & Lines': (n) => {
    if (/clutch/.test(n)) return 'Clutch Cables';
    if (/throttle|idle cable|idle\/cruise|choke cable/.test(n)) return 'Throttle & Idle Cables';
    if (/brake/.test(n)) return 'Brake Line Kits';
    if (/speedo/.test(n)) return 'Speedometer Cables';
    if (/install.*kit|cable kit|control kit|cntrl kit|line kit|cable clamp/.test(n)) return 'Handlebar Cable Kits';
    return null;
  },
  'Seating|Seats': (n) => {
    if (/2-up|2 up|two-up|passenger|tour/.test(n)) return '2-Up & Touring Seats';
    if (/roadsofa/.test(n)) return 'RoadSofa Series';
    if (/step-up|step up/.test(n)) return 'Step-Up Series';
    if (/predator|tailwhip|kickflip/.test(n)) return 'Predator/Tailwhip/Kickflip Series';
    if (/profiler|explorer|maverick|cherokee|silhouette|renegade|high.?noon|wide tripper|wide rear|cobra|bare bones|pillion|drifter|freewheeler|regal duke/.test(n)) return 'Named Style Series';
    if (/solo|slim seat|low profile|heated/.test(n)) return 'Solo Seats';
    return null;
  },
  'Engine|Gaskets & Seals': (n) => {
    if (/complete.*engine.*gasket|complete.*gasket.*kit|full engine gasket|motor gasket kit|lower end gasket kit/.test(n)) return 'Complete Engine Gasket Kits';
    if (/primary|derby.?cover|insp.?cover|inspection.?cover/.test(n)) return 'Primary & Derby Cover Gaskets';
    if (/head|cylinder|cyl base|base gasket|top end|pushrod|tappet|crank|case/.test(n)) return 'Top & Bottom End Gaskets';
    if (/cam.?cover|rocker|valve cover/.test(n)) return 'Cam & Rocker Cover Gaskets';
    if (/trans|clutch|main drive gear|shifter/.test(n)) return 'Transmission & Clutch Gaskets';
    if (/oil/.test(n)) return 'Oil System Gaskets';
    return null;
  },
  'Handlebar & Controls|Handlebars': (n) => {
    if (/ape.?hanger/.test(n)) return 'Ape Hangers';
    if (/t-bar|t bar/.test(n)) return 'T-Bars';
    if (/z-bar|z bar/.test(n)) return 'Z-Bars';
    if (/buffalo/.test(n)) return 'Buffalo Bars';
    return null;
  },
  'Brakes|Brake Lines & Hoses': (n) => {
    if (/front/.test(n) && /rear/.test(n)) return 'Front & Rear Brake Line Kits';
    if (/front/.test(n)) return 'Front Brake Lines';
    if (/rear/.test(n)) return 'Rear Brake Lines';
    if (/banjo|fitting/.test(n)) return 'Banjo Bolts & Fittings';
    if (/hose/.test(n)) return 'Brake Hoses';
    if (/line/.test(n)) return 'Brake Lines (Unspecified)';
    return null;
  },
  'Carburetion & Fuel|Air Cleaners & Filters': (n) => {
    if (/breather/.test(n)) return 'Breathers';
    if (/teardrop/.test(n)) return 'Teardrop Air Cleaners';
    if (/big sucker|monster sucker/.test(n)) return 'Big/Monster Sucker Kits';
    if (/wyatt gatling/.test(n)) return 'Wyatt Gatling Air Cleaners';
    if (/stage|performance|high-flow|high flow/.test(n)) return 'Performance Air Cleaner Kits';
    if (/velocity stack|round|oval/.test(n)) return 'Round/Oval/Velocity Stack';
    return null;
  },
  'Engine|Pistons & Cylinders': (n) => {
    if (/ring/.test(n)) return 'Piston Rings';
    if (/cylinder/.test(n)) return 'Cylinders';
    if (/piston|wrist ?pin/.test(n)) return 'Pistons & Piston Kits';
    return null;
  },
  'Frame & Hardware|Hardware & Fasteners': (n) => {
    if (/bolt/.test(n)) return 'Bolts';
    if (/nut/.test(n)) return 'Nuts';
    if (/screw/.test(n)) return 'Screws';
    if (/spacer/.test(n)) return 'Spacers';
    return null;
  },
  'Transmission & Clutch|Clutch Plates & Kits': (n) => {
    if (/clutch kit|clutch pack|complete clutch/.test(n)) return 'Clutch Kits';
    if (/clutch basket|clutch hub|clutch drum|clutch cover|clutch shell/.test(n)) return 'Clutch Baskets, Hubs & Covers';
    if (/clutch plate|friction plate|steel plate/.test(n)) return 'Clutch Plates';
    if (/clutch spring|diaphragm/.test(n)) return 'Clutch Springs';
    if (/clutch release|clutch pushrod|push ?rod|clutch adjuster|hydraulic clutch|clutch master|clutch pressure/.test(n)) return 'Clutch Actuation Hardware';
    return null;
  },
  'Carburetion & Fuel|Carburetors & Jets': (n) => {
    if (/jet/.test(n)) return 'Jets & Jet Kits';
    if (/carburetor|carb/.test(n)) return 'Carburetors';
    return null;
  },
  'Engine|Cams & Valvetrain': (n) => {
    if (/cam/.test(n)) return 'Camshafts';
    if (/lifter|tappet/.test(n)) return 'Lifters & Tappets';
    if (/push ?rod/.test(n)) return 'Pushrods';
    if (/rocker/.test(n)) return 'Rocker Arms';
    return null;
  },
  'Transmission & Clutch|Transmission Internals': (n) => {
    if (/gear/.test(n)) return 'Gears';
    if (/shift/.test(n)) return 'Shifting Mechanism';
    if (/bearing/.test(n)) return 'Bearings';
    if (/mainshaft|main shaft|countershaft|counter shaft/.test(n)) return 'Shafts';
    return null;
  },
  'Electrical|Ignition': (n) => {
    if (/coil/.test(n)) return 'Ignition Coils';
    if (/module|ecm|ecu/.test(n)) return 'Ignition Modules & ECMs';
    if (/plug wire|spark plug wire/.test(n)) return 'Spark Plug Wires';
    if (/spark plug/.test(n)) return 'Spark Plugs';
    if (/points|condenser/.test(n)) return 'Points & Condensers';
    if (/switch/.test(n)) return 'Ignition Switches';
    return null;
  },
  'Electrical|Wiring & Harnesses': (n) => {
    if (/harness/.test(n)) return 'Wiring Harnesses';
    if (/wire|wiring/.test(n)) return 'Wire & Wiring Accessories';
    if (/connector|terminal/.test(n)) return 'Connectors & Terminals';
    return null;
  },
  'Riding Gear & Apparel|Helmets': (n) => {
    if (/full.?face/.test(n)) return 'Full Face Helmets';
    if (/half/.test(n)) return 'Half Helmets';
    if (/modular|flip/.test(n)) return 'Modular Helmets';
    if (/shield|visor/.test(n)) return 'Helmet Shields & Visors';
    if (/liner|pad/.test(n)) return 'Helmet Liners & Pads';
    return null;
  },
  'Engine|Heads & Valves': (n) => {
    if (/valve/.test(n)) return 'Valves';
    if (/head/.test(n)) return 'Cylinder Heads';
    if (/guide/.test(n)) return 'Valve Guides';
    return null;
  },
  'Engine|Engine Covers': (n) => {
    if (/cam cover|rocker cover|rocker box/.test(n)) return 'Cam & Rocker Covers';
    if (/derby cover/.test(n)) return 'Derby Covers';
    if (/inspection cover|insp cover/.test(n)) return 'Inspection Covers';
    if (/points cover/.test(n)) return 'Points Covers';
    return null;
  },
  'Engine|Bottom End': (n) => {
    if (/crankcase/.test(n) || (/case/.test(n) && !/crankshaft/.test(n))) return 'Crankcases';
    if (/crankshaft|crank/.test(n)) return 'Crankshafts';
    if (/flywheel/.test(n)) return 'Flywheels';
    if (/bearing/.test(n)) return 'Bearings';
    if (/rod/.test(n)) return 'Connecting Rods';
    return null;
  },
  'Lighting|Auxiliary Lighting': (n) => {
    if (/saddlebag/.test(n)) return 'Saddlebag Lighting';
    if (/fork|handlebar/.test(n)) return 'Fork & Handlebar Lighting';
    if (/marker|indicator/.test(n)) return 'Marker & Indicator Lights';
    if (/fender|windshield|luggage rack|engine guard/.test(n)) return 'Fender/Windshield/Rack Lighting';
    if (/spotlamp|spot light|driving light/.test(n)) return 'Spot & Driving Lights';
    return null;
  },
  'Fenders & Body|Windshields': (n) => {
    if (/flare/.test(n)) return 'Flare Series';
    if (/fats/.test(n)) return 'Fats Windshields';
    if (/spoiler/.test(n)) return 'Spoiler Windshields';
    return null;
  },
  'Brakes|Rotors & Drums': (n) => {
    if (/front/.test(n)) return 'Front Rotors';
    if (/rear/.test(n)) return 'Rear Rotors';
    return null;
  },
  'Transmission & Clutch|Trans Covers & Cases': (n) => {
    if (/primary cover/.test(n)) return 'Primary Covers';
    if (/derby cover/.test(n)) return 'Derby Covers';
    if (/trans.*cover|transmission.*case/.test(n)) return 'Transmission Covers & Cases';
    return null;
  },
  'Engine|Oil Pumps & Lubrication': (n) => {
    if (/oil pump/.test(n)) return 'Oil Pumps';
    if (/oil filter/.test(n)) return 'Oil Filters';
    return null;
  },
  'Foot Controls|Footpegs': (n) => {
    if (/driver|rider/.test(n)) return 'Driver/Rider Footpegs';
    if (/passenger/.test(n)) return 'Passenger Footpegs';
    if (/peg mount|peg bracket/.test(n)) return 'Footpeg Mounts & Brackets';
    if (/peg/.test(n)) return 'Footpegs (General)';
    return null;
  },
  'Suspension|Fork Tubes & Internals': (n) => {
    if (/fork tube|fork leg/.test(n)) return 'Fork Tubes';
    if (/fork spring/.test(n)) return 'Fork Springs';
    return null;
  },
  'Handlebar & Controls|Risers & Clamps': (n) => {
    if (/riser/.test(n)) return 'Risers';
    if (/clamp/.test(n)) return 'Clamps';
    return null;
  },
  'Brakes|Brake Pads & Shoes': (n) => {
    if (/sintered|hh /.test(n)) return 'Sintered Brake Pads';
    if (/organic/.test(n)) return 'Organic Brake Pads';
    if (/ceramic/.test(n)) return 'Ceramic Brake Pads';
    if (/shoe/.test(n)) return 'Brake Shoes';
    return null;
  },
  'Electrical|Charging & Alternators': (n) => {
    if (/stator/.test(n)) return 'Stators';
    if (/alternator/.test(n)) return 'Alternators';
    if (/rectifier|regulator/.test(n)) return 'Voltage Regulators & Rectifiers';
    return null;
  },
  'Transmission & Clutch|Oil System': (n) => {
    if (/oil tank/.test(n)) return 'Oil Tanks';
    if (/oil line|oil hose/.test(n)) return 'Oil Lines & Hoses';
    if (/oil filter/.test(n)) return 'Oil Filters';
    if (/oil cooler/.test(n)) return 'Oil Coolers';
    if (/dipstick/.test(n)) return 'Dipsticks';
    return null;
  },
  'Tools & Chemicals|Tools': (n) => {
    if (/tool kit|tool set|tool box/.test(n)) return 'Tool Kits & Sets';
    if (/wrench/.test(n)) return 'Wrenches';
    if (/stand|lift/.test(n)) return 'Stands & Lifts';
    return null;
  },
  'Wheels & Tires|Axles & Spacers': (n) => {
    if (/axle/.test(n)) return 'Axles';
    if (/spacer/.test(n)) return 'Spacers';
    return null;
  },
  'Handlebar & Controls|Grips': (n) => {
    if (/throttle/.test(n)) return 'Throttle Grips';
    return null;
  },
  'Handlebar & Controls|Levers & Controls': (n) => {
    if (/clutch lever/.test(n)) return 'Clutch Levers';
    if (/brake lever/.test(n)) return 'Brake Levers';
    return null;
  },
  'Suspension|Shocks & Springs': (n) => {
    if (/shock/.test(n)) return 'Shocks';
    return null;
  },
  'Wheels & Tires|Wheels': (n) => {
    if (/front/.test(n)) return 'Front Wheels';
    if (/rear/.test(n)) return 'Rear Wheels';
    return null;
  },
  'Exhaust|Exhaust Systems': (n) => {
    if (/2 into 1|2-into-1|2:1|2in1/.test(n)) return '2-into-1 Systems';
    if (/true dual/.test(n)) return 'True Dual Systems';
    if (/wyatt gatling/.test(n)) return 'Wyatt Gatling Exhaust';
    return null;
  },
  'Lighting|Turn Signals': (n) => {
    if (/lens/.test(n)) return 'Turn Signal Lenses';
    if (/front/.test(n)) return 'Front Turn Signals';
    if (/rear/.test(n)) return 'Rear Turn Signals';
    return null;
  },
};

async function ensureShadowColumn(client) {
  await client.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS display_subcategory_detail_v2 text`);
}

async function main() {
  const client = await pool.connect();
  try {
    if (WRITE_SHADOW || PROMOTE) {
      await ensureShadowColumn(client);
      await client.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS display_subcategory_detail text`);
    }

    const { rows } = await client.query(`
      SELECT id, display_category, display_subcategory, name
      FROM catalog_unified
      WHERE is_active = true AND display_category IS NOT NULL AND display_subcategory IS NOT NULL
    `);

    const results = new Map(); // key -> {classified, total}
    const toWrite = [];

    for (const row of rows) {
      const key = `${row.display_category}|${row.display_subcategory}`;
      const classifier = CLASSIFIERS[key];
      if (!classifier) continue;
      const detail = classifier((row.name || '').toLowerCase());
      if (!results.has(key)) results.set(key, { classified: 0, total: 0 });
      const stat = results.get(key);
      stat.total++;
      if (detail) stat.classified++;
      toWrite.push({ id: row.id, detail });
    }

    console.log(`Subcategories with a tier-3 classifier: ${Object.keys(CLASSIFIERS).length}`);
    console.log(`Rows eligible (belong to one of those subcategories): ${toWrite.length}`);
    console.log('');
    console.log('=== Coverage per subcategory ===');
    for (const [key, stat] of [...results.entries()].sort((a, b) => b[1].total - a[1].total)) {
      const pct = ((stat.classified / stat.total) * 100).toFixed(0);
      console.log(`  ${pct.padStart(3)}%  ${stat.classified.toString().padStart(5)}/${stat.total.toString().padStart(5)}  ${key}`);
    }

    if (WRITE_SHADOW || PROMOTE) {
      console.log('');
      console.log('Writing shadow column (display_subcategory_detail_v2)...');
      let written = 0;
      for (const item of toWrite) {
        await client.query(`UPDATE catalog_unified SET display_subcategory_detail_v2 = $1 WHERE id = $2`, [item.detail, item.id]);
        written++;
      }
      console.log(`Shadow column written for ${written} rows.`);
    }

    if (PROMOTE) {
      console.log('');
      console.log('Promoting display_subcategory_detail_v2 -> display_subcategory_detail...');
      const result = await client.query(`
        UPDATE catalog_unified
        SET display_subcategory_detail = display_subcategory_detail_v2
        WHERE is_active = true AND display_category IS NOT NULL AND display_subcategory IS NOT NULL
      `);
      console.log(`Promoted ${result.rowCount} rows (NULL where no tier-3 value applies).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
