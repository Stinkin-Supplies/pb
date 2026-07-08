#!/usr/bin/env node
/**
 * rebuild_display_category_v2.mjs — taxonomy_v2_plan.md category rebuild
 *
 * Recomputes display_category for every active catalog_unified row from
 * (source_vendor, category, name) and writes the result into a shadow
 * column (display_category_v2) — never touches the live display_category
 * column. See taxonomy_v2_plan.md §6 for why: a prior unfiltered rebuild
 * step in a different script wiped 6 ADMIN-curated rows this same session
 * cycle, so nothing here writes live until a human has spot-checked the
 * diff report and run this with --promote.
 *
 * Scope (see taxonomy_v2_plan.md for the full plan; this script covers §2 + §3 + §4):
 *   - Deterministic raw-category -> display_category map (~95% of volume)
 *   - Structural fixes: SADDLEBAGS -> Luggage & Racks, TANK* gas/oil split
 *   - Decisions (session 74): Kickstands -> Foot Controls (single home),
 *     Gas Caps & Petcocks -> Fenders & Body (single home)
 *   - Keyword classifiers for grab-bag raw categories that carry no
 *     reliable signal on their own: blank/"" category, VTWIN COMMON MISC
 *     (+ GROUP), WPS "Covers," WPS Accessories
 *   - Keyword overrides that must win over the raw-category default:
 *     ENGINE->Electrical spillover (coil/stator/regulator/ignition module),
 *     FOOT CONTROLS->Exhaust (Wyatt Gatling mislabeled-at-vendor exhaust
 *     parts filed under FOOT CONTROLS in VTwin's own feed — confirmed by
 *     name inspection, not a guess)
 *
 * display_subcategory_v2 is only populated when display_category_v2 matches
 * the current live display_category (i.e. the row's category didn't change,
 * so the existing subcategory assignment still applies). Rows whose category
 * changed are left with a NULL display_subcategory_v2 — subcategory for
 * those needs a follow-up pass using the proven per-category mapping
 * approach documented in filter_roadmap.md, not a guess made here.
 *
 * Usage:
 *   node rebuild_display_category_v2.mjs                 # dry run, report only
 *   node rebuild_display_category_v2.mjs --write-shadow   # populate shadow columns
 *   node rebuild_display_category_v2.mjs --promote        # v2 -> live (after spot check)
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

// ─────────────────────────────────────────────────────────────────────────
// Deterministic raw-category -> display_category map.
// Keys are normalized: uppercased, trailing comma/space stripped, and a
// trailing " GROUP" suffix stripped (VTwin uses *_GROUP variants of the
// same raw categories throughout).
// ─────────────────────────────────────────────────────────────────────────
const RAW_CATEGORY_MAP = {
  // Brakes
  'BRAKING': 'Brakes',
  'BRAKE - FRONT': 'Brakes',
  'BRAKE LEVER, FRONT': 'Brakes',

  // Carburetion & Fuel
  'CARBURETION-FUEL': 'Carburetion & Fuel',
  'CARBURETOR': 'Carburetion & Fuel',
  'INTAKE/CARB/FUEL SYSTEM': 'Carburetion & Fuel',
  'AIR FILTER, ENGINE': 'Carburetion & Fuel',

  // Electrical
  'ELECTRICAL SYSTEM': 'Electrical',
  'ELECTRONICS': 'Electrical',
  'ELECTRICAL': 'Electrical',
  'BATTERY': 'Electrical',
  'SWITCHES, SENSORS & ELECTRICAL CONNECTORS': 'Electrical',
  'SWITCHES': 'Electrical',
  'SPARK PLUGS': 'Electrical',
  'STARTER MOTOR': 'Electrical',
  'AUDIO & COMMUNICATION': 'Electrical',
  'ELECTRONIC CONTROL MODULE (ECM) AND COIL': 'Electrical',

  // Engine
  'ENGINE': 'Engine',
  'ENGINE MOUNTS': 'Engine',
  'GASKET SETS': 'Engine',
  'OIL FILTER': 'Engine',
  'PISTONS & PISTON RINGS': 'Engine',
  'CONNECTING RODS': 'Engine',

  // Exhaust
  'EXHAUST': 'Exhaust',
  'EXHAUST SYSTEM': 'Exhaust',

  // Fenders & Body
  'FENDER': 'Fenders & Body',
  'WINDSHIELD-FAIRING': 'Fenders & Body',
  'WINDSHIELD': 'Fenders & Body',
  'DECALS, FUEL TANK': 'Fenders & Body',
  'FUEL CAP': 'Fenders & Body',
  'FUEL TANK': 'Fenders & Body',

  // Foot Controls
  'FOOTBOARDS, OPERATOR': 'Foot Controls',
  'FOOT CONTROLS': 'Foot Controls',

  // Frame & Hardware
  'FRAME AND BODY': 'Frame & Hardware',
  'HARDWARE': 'Frame & Hardware',
  'HARDWARE LISTING': 'Frame & Hardware',

  // Handlebar & Controls
  'HANDLEBAR-CONTROLS-MIRRORS': 'Handlebar & Controls',
  'HANDLEBAR': 'Handlebar & Controls',
  'HANDLEBAR GRIPS': 'Handlebar & Controls',
  'HANDLEBAR & THROTTLE CONTROL': 'Handlebar & Controls',
  'CABLE, CLUTCH CONTROL': 'Handlebar & Controls',
  'CLAMPS, HANDLEBAR UPPER & LOWER': 'Handlebar & Controls',
  'RISER, HANDLEBAR': 'Handlebar & Controls',
  'THROTTLE CONTROL': 'Handlebar & Controls',
  'MIRRORS': 'Handlebar & Controls',
  'HAND CONTROLS': 'Handlebar & Controls',

  // Instrumentation
  'INSTRUMENT': 'Instrumentation',
  'GAUGES': 'Instrumentation',

  // Lighting
  'HEADLAMP': 'Lighting',
  'LIGHTING-LICENSE': 'Lighting',

  // Luggage & Racks
  'LUGGAGE': 'Luggage & Racks',
  'LUGGAGE RACK, TOUR-PAK': 'Luggage & Racks',
  'SISSY BAR-BACKREST-RACK': 'Luggage & Racks',
  'SADDLEBAGS': 'Luggage & Racks', // structural fix — was bleeding into Seating

  // Riding Gear & Apparel
  'HELMETS': 'Riding Gear & Apparel',
  'HELMET AND SHIELD': 'Riding Gear & Apparel',
  'APPAREL': 'Riding Gear & Apparel',
  'RIDING GEAR': 'Riding Gear & Apparel',

  // Seating
  'SEATING': 'Seating',
  'SEATS': 'Seating',

  // Security & Covers
  'SECURITY': 'Security & Covers',
  'SECURITY-COVERS-SHELTERS': 'Security & Covers',

  // Suspension
  'FORK, FRONT': 'Suspension',
  'FORK FRONT': 'Suspension',
  'SHOCK ABSORBERS': 'Suspension',
  'SUSPENSION': 'Suspension',
  'SUSPENSION GROUP-FRONT': 'Suspension',
  'SUSPENSION GROUP-REAR': 'Suspension',
  'TRIPLE CLAMP': 'Suspension',

  // Transmission & Clutch
  'BELT, CHAIN AND SPROCKETS': 'Transmission & Clutch',
  'BELTS & SPROCKETS': 'Transmission & Clutch',
  'CHAINS': 'Transmission & Clutch',
  'CLUTCH': 'Transmission & Clutch',
  'DRIVE TRAIN': 'Transmission & Clutch',
  'SPROCKET, BELT': 'Transmission & Clutch',
  'TRANSMISSION-CLUTCH': 'Transmission & Clutch',

  // Tools & Chemicals
  'TOOLS': 'Tools & Chemicals',
  'CHEMICALS & MAINTENANCE': 'Tools & Chemicals',
  'TOOLS & SHOP EQUIPMENT': 'Tools & Chemicals',

  // Wheels & Tires
  'TIRE AND TUBE': 'Wheels & Tires',
  'TIRES & WHEELS': 'Wheels & Tires',
  'WHEEL AND RIM': 'Wheels & Tires',

  // Accessories & Misc
  'TRANSPORTATION': 'Accessories & Misc',
  'PROMOTIONAL ITEMS': 'Accessories & Misc',
  'GRAPHICS': 'Accessories & Misc',
  'MEDIA PRODUCTS': 'Accessories & Misc',
  'RADIATOR': 'Accessories & Misc', // matches current placement (Cooling Systems lives under Accessories & Misc)
};

// ─────────────────────────────────────────────────────────────────────────
// Broad keyword classifier — used only for raw categories that carry no
// reliable signal of their own (blank, VTWIN COMMON MISC, WPS "Covers,",
// WPS Accessories). Ordered most-specific first. Returns null if nothing
// matches so the caller can decide the catch-all.
// ─────────────────────────────────────────────────────────────────────────
function keywordClassify(name) {
  const n = name.toLowerCase();

  // Gas cap / petcock already handled by a higher-priority check before
  // this runs, but keep a fallback here too for defense in depth.
  if (/\b(gas cap|fuel cap|petcock|fuel door|fuel tank console)\b/.test(n)) return 'Fenders & Body';
  // Same gas/oil tank split as the dedicated TANK raw-category rule, for
  // tank products that show up under an unrelated raw category (e.g. WPS
  // "Covers," bucket) instead of TANK/TANK GROUP-GAS AND OIL.
  if (/\boil tank\b/.test(n)) return 'Transmission & Clutch';
  if (/\b(gas tank|fuel tank)\b/.test(n)) return 'Fenders & Body';

  if (/\b(sissy ?bars?|saddlebags?|backrests?|bckrst|tour ?pa[ck]ks?|luggage racks?|bag gu?a?rds?|racks?)\b/.test(n)) return 'Luggage & Racks';
  if (/\b(fenders?|windshields?|fairings?|dash inserts?|bobbed rear fenders?)\b/.test(n)) return 'Fenders & Body';
  if (/\b(crash ?bars?|engine gu?a?rds?|case guards?|linbar|multibar|unibar|magnumbar)\b/.test(n)) return 'Frame & Hardware';
  if (/\bfreeway bars?\b/.test(n)) return 'Foot Controls'; // highway bars & pegs live here
  if (/\b(exhausts?|mufflers?|headers?|drag pipes?|slip[\s-]?on pipes?|heat ?shields?)\b/.test(n)) return 'Exhaust';
  if (/\b(master cyl(inder)? covers?|brake rotors?|brake pads?|brake calipers?|brake rods?|brake sensors?|brake controls?)\b/.test(n)) return 'Brakes';
  if (/\b(wheels?|rims?|spokes?|axles?|hub ?caps?|spool wheels?)\b/.test(n)) return 'Wheels & Tires';
  if (/\b(forks?|shocks?|swingarms?|triple trees?|neck cups?)\b/.test(n)) return 'Suspension';
  if (/\b(clutch(es)?|primary covers?|sprockets?|shifters?|kickstarts?|transmissions?)\b/.test(n)) return 'Transmission & Clutch';
  if (/\b(pistons?|cylinders?|valves?|cams?|cranks?|gaskets?|rockers?|cooling|radiators?)\b/.test(n)) return 'Engine';
  if (/\b(coils?|stators?|regulators?|ignition\w*|wiring|harness(es)?|starters?|batter(y|ies)|horns?|flashers?|ecm)\b/.test(n)) return 'Electrical';
  if (/\b(headlights?|headlamps?|taillights?|turn signals?|fog lamps?|license plate (frames?|lights?))\b/.test(n)) return 'Lighting';
  if (/\b(handlebars?|grips?|risers?|clamps?|throttles?|levers?|mirrors?)\b/.test(n)) return 'Handlebar & Controls';
  if (/\b(footpegs?|floorboards?|footboards?|shifter pegs?|forward controls?|kickstands?|jiffy ?stands?|pegs?)\b/.test(n)) return 'Foot Controls';
  if (/\b(gauges?|speedometers?|tachometers?|dash\w*)\b/.test(n)) return 'Instrumentation';
  if (/\b(seats?)\b/.test(n)) return 'Seating';
  if (/\b(covers?|alarms?|locks?)\b/.test(n)) return 'Security & Covers';
  if (/\b(helmets?|jackets?|gloves?|boots?|pants?|apparel)\b/.test(n)) return 'Riding Gear & Apparel';
  if (/\b(bolts?|nuts?|washers?|screws?|clips?|spacers?|pins?|brackets?)\b/.test(n)) return 'Frame & Hardware';

  return null;
}

function normalizeRawCategory(cat) {
  return (cat || '').trim().toUpperCase().replace(/,$/, '').replace(/\s+GROUP$/, '');
}

// Full classification, used only for rows in the surgical scope below
// (currently-null, or a confirmed-bug / decided-on raw category). This is
// NOT run against already-classified rows outside that scope — see the
// top-of-file note on why a blind full recompute was rejected after the
// first dry run showed it silently overwriting thousands of already-correct
// rows whose existing classification logic isn't visible to this script.
function classify(row) {
  const name = row.name || '';
  const nameLower = name.toLowerCase();
  const catUpper = (row.category || '').trim().toUpperCase();
  const key = normalizeRawCategory(row.category);

  // ---- Highest-priority overrides (win regardless of raw category) ----
  if (/\b(gas caps?|fuel caps?|petcocks?)\b/.test(nameLower)) return 'Fenders & Body';
  if (/\b(kickstands?|jiffy[\s-]?stands?)\b/.test(nameLower)) return 'Foot Controls';
  if (catUpper.startsWith('FOOT CONTROLS') && /\b(exhausts?|mufflers?|headers?|drag pipes?|slip[\s-]?on)\b/.test(nameLower)) return 'Exhaust';
  if (catUpper.startsWith('ENGINE') && /\b(coils?|stators?|regulators?|ignition modules?|ecm)\b/.test(nameLower)) return 'Electrical';
  if (key === 'TANK' || key === 'TANK GROUP-GAS AND OIL') {
    return /\boil\b/.test(nameLower) ? 'Transmission & Clutch' : 'Fenders & Body';
  }

  // ---- Deterministic map ----
  if (RAW_CATEGORY_MAP[key]) return RAW_CATEGORY_MAP[key];

  // ---- Grab-bag raw categories needing name-based classification ----
  if (key === '' || key === 'COMMON MISC') {
    return keywordClassify(name) || 'Accessories & Misc';
  }
  if (row.source_vendor === 'WPS' && key === 'COVERS') {
    return keywordClassify(name) || 'Accessories & Misc';
  }

  // Any other raw category that's currently null gets the same name-based
  // fallback rather than being left unmapped — there's nothing to regress
  // on a null row, so this is always safe. Currently non-null rows outside
  // the surgical scope never reach this branch (filtered out earlier).
  if (row.display_category === null) {
    return keywordClassify(name) || 'Accessories & Misc';
  }

  return null; // genuinely unmapped raw category on an in-scope non-null row — reported separately
}

// Surgical scope: only rows that are provably broken today. Everything else
// keeps its current display_category untouched, even if this script's
// classifier would compute something different for it — see note above.
// This deliberately EXCLUDES VTWIN COMMON MISC rows that are already
// non-null (they keep today's value) and WPS "Accessories" entirely
// (already non-null, no confirmed bug identified) — both flagged as
// follow-up candidates in the summary report rather than touched blind.
function inSurgicalScope(row) {
  if (row.display_category === null) return true;
  const key = normalizeRawCategory(row.category);
  if (key === 'SADDLEBAGS') return true;
  if (key === 'TANK' || key === 'TANK GROUP-GAS AND OIL') return true;
  const nameLower = (row.name || '').toLowerCase();
  if (/\b(kickstands?|jiffy[\s-]?stands?)\b/.test(nameLower)) return true;
  if (/\b(gas caps?|fuel caps?|petcocks?)\b/.test(nameLower)) return true;
  return false;
}

async function ensureShadowColumns(client) {
  await client.query(`
    ALTER TABLE catalog_unified
      ADD COLUMN IF NOT EXISTS display_category_v2 text,
      ADD COLUMN IF NOT EXISTS display_subcategory_v2 text
  `);
}

async function main() {
  const client = await pool.connect();
  try {
    if (WRITE_SHADOW || PROMOTE) {
      await ensureShadowColumns(client);
    }

    const { rows } = await client.query(`
      SELECT id, source_vendor, category, name, display_category, display_subcategory
      FROM catalog_unified
      WHERE is_active = true
    `);

    const unmapped = [];
    const changes = []; // { id, from, to }
    const crosstab = new Map(); // "from -> to" => count
    let outOfScope = 0;

    for (const row of rows) {
      if (!inSurgicalScope(row)) {
        outOfScope++;
        continue;
      }
      const newCat = classify(row);
      if (newCat === null) {
        unmapped.push(row);
        continue;
      }
      const from = row.display_category || '(null)';
      if (newCat !== row.display_category) {
        changes.push({ id: row.id, from, to: newCat, name: row.name, source_vendor: row.source_vendor, category: row.category });
      }
      const ctKey = `${from} -> ${newCat}`;
      crosstab.set(ctKey, (crosstab.get(ctKey) || 0) + 1);
    }

    console.log(`Active rows scanned: ${rows.length}`);
    console.log(`Out of surgical scope (left untouched): ${outOfScope}`);
    console.log(`Unmapped (no raw-category rule, no keyword match): ${unmapped.length}`);
    console.log(`Rows whose display_category would change: ${changes.length}`);
    console.log('');
    console.log('=== Crosstab of changes (from -> to), sorted by volume ===');
    const sorted = [...crosstab.entries()]
      .filter(([k]) => !k.match(/^(.+) -> \1$/))
      .sort((a, b) => b[1] - a[1]);
    for (const [k, n] of sorted) {
      console.log(`  ${n.toString().padStart(6)}  ${k}`);
    }

    if (unmapped.length > 0) {
      console.log('');
      console.log('=== Unmapped raw categories (need a rule added before promoting) ===');
      const byCat = new Map();
      for (const r of unmapped) {
        const k = `${r.source_vendor} | ${r.category}`;
        byCat.set(k, (byCat.get(k) || 0) + 1);
      }
      for (const [k, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(6)}  ${k}`);
      }
    }

    if (WRITE_SHADOW || PROMOTE) {
      console.log('');
      console.log('Writing shadow columns (display_category_v2 / display_subcategory_v2)...');
      let written = 0;
      for (const row of rows) {
        // Out-of-scope rows: v2 mirrors the current live value exactly (no
        // reclassification attempted), so the shadow columns are always a
        // complete, promotable snapshot of the full active catalog.
        if (!inSurgicalScope(row)) {
          await client.query(
            `UPDATE catalog_unified SET display_category_v2 = $1, display_subcategory_v2 = $2 WHERE id = $3`,
            [row.display_category, row.display_subcategory, row.id]
          );
          written++;
          continue;
        }
        const newCat = classify(row);
        if (newCat === null) continue; // leave shadow null, surfaced above as unmapped
        const subcatV2 = newCat === row.display_category ? row.display_subcategory : null;
        await client.query(
          `UPDATE catalog_unified SET display_category_v2 = $1, display_subcategory_v2 = $2 WHERE id = $3`,
          [newCat, subcatV2, row.id]
        );
        written++;
      }
      console.log(`Shadow columns written for ${written} rows.`);
    }

    if (PROMOTE) {
      console.log('');
      console.log('Promoting display_category_v2 -> display_category (only where v2 is non-null)...');
      const result = await client.query(`
        UPDATE catalog_unified
        SET display_category = display_category_v2,
            display_subcategory = display_subcategory_v2
        WHERE is_active = true AND display_category_v2 IS NOT NULL
      `);
      console.log(`Promoted ${result.rowCount} rows.`);
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
