#!/usr/bin/env node
/**
 * restore_display_category_full.mjs
 *
 * Phase 2 of CATALOG_RECOVERY_PLAN.md. catalog_unified was rebuilt from
 * scratch after the TRUNCATE incident (see HANDOFF_LOG.md) and only 2,268
 * of 97,122 rows have any display_category (the coarse fallback in
 * sync_catalog_unified.mjs only covers brand-new products, not a full
 * classification pass).
 *
 * The classification logic below is copied from
 * scripts/ingest/_retired/rebuild_display_category_v2.mjs, which contains a
 * complete, deterministic (source_vendor, raw category, name) -> broad
 * display_category classifier covering every raw category seen across
 * PU/WPS/VTwin plus a keyword fallback for grab-bag categories. That script
 * was written for *surgical* patching of a handful of already-classified
 * rows (its inSurgicalScope() filter deliberately left already-correct rows
 * untouched) -- this script removes that scope restriction and classifies
 * every row, because in this recovery scenario every row is unclassified.
 *
 * Usage:
 *   node restore_display_category_full.mjs            # dry run, crosstab report
 *   node restore_display_category_full.mjs --apply    # writes display_category
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Classification logic (verbatim from rebuild_display_category_v2.mjs) ───

const RAW_CATEGORY_MAP = {
  'BRAKING': 'Brakes', 'BRAKE - FRONT': 'Brakes', 'BRAKE LEVER, FRONT': 'Brakes',
  'CARBURETION-FUEL': 'Carburetion & Fuel', 'CARBURETOR': 'Carburetion & Fuel',
  'INTAKE/CARB/FUEL SYSTEM': 'Carburetion & Fuel', 'AIR FILTER, ENGINE': 'Carburetion & Fuel',
  'ELECTRICAL SYSTEM': 'Electrical', 'ELECTRONICS': 'Electrical', 'ELECTRICAL': 'Electrical',
  'BATTERY': 'Electrical', 'SWITCHES, SENSORS & ELECTRICAL CONNECTORS': 'Electrical',
  'SWITCHES': 'Electrical', 'SPARK PLUGS': 'Electrical', 'STARTER MOTOR': 'Electrical',
  'AUDIO & COMMUNICATION': 'Electrical', 'ELECTRONIC CONTROL MODULE (ECM) AND COIL': 'Electrical',
  'ENGINE': 'Engine', 'ENGINE MOUNTS': 'Engine', 'GASKET SETS': 'Engine', 'OIL FILTER': 'Engine',
  'PISTONS & PISTON RINGS': 'Engine', 'CONNECTING RODS': 'Engine',
  'EXHAUST': 'Exhaust', 'EXHAUST SYSTEM': 'Exhaust',
  'FENDER': 'Fenders & Body', 'WINDSHIELD-FAIRING': 'Fenders & Body', 'WINDSHIELD': 'Fenders & Body',
  'DECALS, FUEL TANK': 'Fenders & Body', 'FUEL CAP': 'Fenders & Body', 'FUEL TANK': 'Fenders & Body',
  'FOOTBOARDS, OPERATOR': 'Foot Controls', 'FOOT CONTROLS': 'Foot Controls',
  'FRAME AND BODY': 'Frame & Hardware', 'HARDWARE': 'Frame & Hardware', 'HARDWARE LISTING': 'Frame & Hardware',
  'HANDLEBAR-CONTROLS-MIRRORS': 'Handlebar & Controls', 'HANDLEBAR': 'Handlebar & Controls',
  'HANDLEBAR GRIPS': 'Handlebar & Controls', 'HANDLEBAR & THROTTLE CONTROL': 'Handlebar & Controls',
  'CABLE, CLUTCH CONTROL': 'Handlebar & Controls', 'CLAMPS, HANDLEBAR UPPER & LOWER': 'Handlebar & Controls',
  'RISER, HANDLEBAR': 'Handlebar & Controls', 'THROTTLE CONTROL': 'Handlebar & Controls',
  'MIRRORS': 'Handlebar & Controls', 'HAND CONTROLS': 'Handlebar & Controls',
  'INSTRUMENT': 'Instrumentation', 'GAUGES': 'Instrumentation',
  'HEADLAMP': 'Lighting', 'LIGHTING-LICENSE': 'Lighting',
  'LUGGAGE': 'Luggage & Racks', 'LUGGAGE RACK, TOUR-PAK': 'Luggage & Racks',
  'SISSY BAR-BACKREST-RACK': 'Luggage & Racks', 'SADDLEBAGS': 'Luggage & Racks',
  'HELMETS': 'Riding Gear & Apparel', 'HELMET AND SHIELD': 'Riding Gear & Apparel',
  'APPAREL': 'Riding Gear & Apparel', 'RIDING GEAR': 'Riding Gear & Apparel',
  'SEATING': 'Seating', 'SEATS': 'Seating',
  'SECURITY': 'Security & Covers', 'SECURITY-COVERS-SHELTERS': 'Security & Covers',
  'FORK, FRONT': 'Suspension', 'FORK FRONT': 'Suspension', 'SHOCK ABSORBERS': 'Suspension',
  'SUSPENSION': 'Suspension', 'SUSPENSION GROUP-FRONT': 'Suspension', 'SUSPENSION GROUP-REAR': 'Suspension',
  'TRIPLE CLAMP': 'Suspension',
  'BELT, CHAIN AND SPROCKETS': 'Transmission & Clutch', 'BELTS & SPROCKETS': 'Transmission & Clutch',
  'CHAINS': 'Transmission & Clutch', 'CLUTCH': 'Transmission & Clutch', 'DRIVE TRAIN': 'Transmission & Clutch',
  'SPROCKET, BELT': 'Transmission & Clutch', 'TRANSMISSION-CLUTCH': 'Transmission & Clutch',
  'TOOLS': 'Tools & Chemicals', 'CHEMICALS & MAINTENANCE': 'Tools & Chemicals',
  'TOOLS & SHOP EQUIPMENT': 'Tools & Chemicals',
  'TIRE AND TUBE': 'Wheels & Tires', 'TIRES & WHEELS': 'Wheels & Tires', 'WHEEL AND RIM': 'Wheels & Tires',
  'TRANSPORTATION': 'Accessories & Misc', 'PROMOTIONAL ITEMS': 'Accessories & Misc',
  'GRAPHICS': 'Accessories & Misc', 'MEDIA PRODUCTS': 'Accessories & Misc', 'RADIATOR': 'Accessories & Misc',
};

function keywordClassify(name) {
  const n = name.toLowerCase();
  if (/\b(gas cap|fuel cap|petcock|fuel door|fuel tank console)\b/.test(n)) return 'Fenders & Body';
  if (/\boil tank\b/.test(n)) return 'Transmission & Clutch';
  if (/\b(gas tank|fuel tank)\b/.test(n)) return 'Fenders & Body';
  if (/\b(sissy ?bars?|saddlebags?|backrests?|bckrst|tour ?pa[ck]ks?|luggage racks?|bag gu?a?rds?|racks?)\b/.test(n)) return 'Luggage & Racks';
  if (/\b(fenders?|windshields?|fairings?|dash inserts?|bobbed rear fenders?)\b/.test(n)) return 'Fenders & Body';
  if (/\b(crash ?bars?|engine gu?a?rds?|case guards?|linbar|multibar|unibar|magnumbar)\b/.test(n)) return 'Frame & Hardware';
  if (/\bfreeway bars?\b/.test(n)) return 'Foot Controls';
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

function classify(row) {
  const name = row.name || '';
  const nameLower = name.toLowerCase();
  const catUpper = (row.category || '').trim().toUpperCase();
  const key = normalizeRawCategory(row.category);

  if (/\b(gas caps?|fuel caps?|petcocks?)\b/.test(nameLower)) return 'Fenders & Body';
  if (/\b(kickstands?|jiffy[\s-]?stands?)\b/.test(nameLower)) return 'Foot Controls';
  if (catUpper.startsWith('FOOT CONTROLS') && /\b(exhausts?|mufflers?|headers?|drag pipes?|slip[\s-]?on)\b/.test(nameLower)) return 'Exhaust';
  if (catUpper.startsWith('ENGINE') && /\b(coils?|stators?|regulators?|ignition modules?|ecm)\b/.test(nameLower)) return 'Electrical';
  if (key === 'TANK' || key === 'TANK GROUP-GAS AND OIL') {
    return /\boil\b/.test(nameLower) ? 'Transmission & Clutch' : 'Fenders & Body';
  }
  if (RAW_CATEGORY_MAP[key]) return RAW_CATEGORY_MAP[key];
  // Full-scope difference from the original script: ANY unmapped raw
  // category (not just blank/COMMON MISC/WPS-COVERS) falls through to the
  // keyword classifier, since every row is unclassified in this recovery
  // scenario -- there's no "already correct, leave alone" case to protect.
  return keywordClassify(name) || 'Accessories & Misc';
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, source_vendor, category, name, display_category
      FROM catalog_unified
    `);

    const crosstab = new Map();
    const unmappedSample = [];
    let toUpdate = 0;

    for (const row of rows) {
      const newCat = classify(row);
      const from = row.display_category || '(null)';
      if (newCat !== row.display_category) toUpdate++;
      const key = `${from} -> ${newCat}`;
      crosstab.set(key, (crosstab.get(key) || 0) + 1);
      if (newCat === 'Accessories & Misc' && unmappedSample.length < 20) {
        unmappedSample.push({ vendor: row.source_vendor, category: row.category, name: row.name });
      }
    }

    console.log(`Total rows: ${rows.length}`);
    console.log(`Rows whose display_category would change: ${toUpdate}`);
    console.log('');
    console.log('=== Crosstab (from -> to), top 40 by volume ===');
    const sorted = [...crosstab.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    for (const [k, n] of sorted) console.log(`  ${n.toString().padStart(6)}  ${k}`);

    console.log('');
    console.log(`=== Sample of rows falling to 'Accessories & Misc' catch-all (${unmappedSample.length} shown) ===`);
    for (const s of unmappedSample) console.log(`  [${s.vendor}] "${s.category}" :: ${s.name}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    console.log('\nApplying (single transaction)...');
    await client.query('BEGIN');
    let done = 0, errors = 0;
    for (const row of rows) {
      const newCat = classify(row);
      if (newCat === row.display_category) continue;
      try {
        await client.query('SAVEPOINT row_sp');
        await client.query(`UPDATE catalog_unified SET display_category = $1 WHERE id = $2`, [newCat, row.id]);
        await client.query('RELEASE SAVEPOINT row_sp');
        done++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`  Error on id ${row.id}:`, e.message);
      }
      if ((done + errors) % 5000 === 0) process.stdout.write(`\r  ${done} updated, ${errors} errors`);
    }
    console.log(`\n  ${done} updated, ${errors} errors`);
    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Rolled back due to error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
