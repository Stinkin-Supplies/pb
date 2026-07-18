#!/usr/bin/env node
/**
 * audit_fuel_air_carbs_general.mjs
 *
 * Full-read audit of the "General" leftover bucket in Fuel, Air &
 * Carburetors (136 rows) -- the original rebuild's regex sweep missed a
 * lot of naming variants (abbreviations, brand-only signals, typos) that
 * only show up on an actual read of every row, same lesson as every prior
 * "General bucket" audit this project has done.
 *
 * Usage:
 *   node scripts/ingest/audit_fuel_air_carbs_general.mjs            # dry run
 *   node scripts/ingest/audit_fuel_air_carbs_general.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Fuel, Air & Carburetors';

// Explicit, hand-verified moves for rows that are genuinely misfiled OUT of
// this category entirely (found while reading the full General list).
const EXPLICIT_OUT_OF_CATEGORY = {
  15954: ['Transmission & Clutch', 'Transmission Covers & Dipsticks'], // Trask CheckM8 Vented Transmission Top Cover - Black
  12494: ['Transmission & Clutch', 'Transmission Covers & Dipsticks'], // Trask CheckM8 Vented Transmission Top Cover - Chrome
  61234: ['Transmission & Clutch', 'Rear Belts & Chains'],             // Motorshop Rear Chain Oil Kit
  75383: ['Seating', 'Seating Hardware- Springs. Brackets, Mounts, Tabs, etc.'], // V-Twin Rear Seat Tab Fixx-It Insert Kit
  15005: ['Engine', 'Engine Accessories'],                             // Jims Staking Dowel Pins
  32406: ['Handlebars & Hand Controls', 'Hardware & Accessories'],     // LA Choppers Stop-N-Pop Bottle Opener Insert
  90265: ['Electrical', 'Relays'],                                     // Standard Motor Products EFI Relay
  29107: ['Engine', 'Engine Accessories'],                             // Drag Specialties Mini Crankcase Vent Filter (engine breather, not air-cleaner -- same family as the main rebuild's crankcase-breather moves)
  93314: ['Tanks & Body', 'Gas Tanks & Gas Caps'],                     // Wyatt Gatling Replica Eaton Style Gas Set Cap Vented
  91591: ['Tanks & Body', 'Oil & Fuel Lines'],                         // V-Twin Oil Feed Line Elbow
  91592: ['Tanks & Body', 'Oil & Fuel Lines'],                         // V-Twin Oil Feed Line Elbow
  77233: ['Tanks & Body', 'Oil Tank & Dipsticks'],                     // V-Twin Rubber Oil Drip Cap
  77370: ['Tools & Chemicals', 'Chemicals & Lubricants'],              // Ultima Neutra Fuel Stabilizer
  20022: ['Tools & Chemicals', 'Cleaners, Wash & Detailing'],          // RSD Wash Bag R/RSD A/C Kits
};

// In-category re-routes: brand-aware + broadened patterns for what the
// original 15-bucket rebuild's regex missed on this leftover pile.
const RULES = [
  // sensors (broadened well past the original o2/map/throttle-position-only match)
  [/sensor/i, 'Electrical', 'Sensors & Switches'],
  [/oxygen sensor/i, 'Electrical', 'Sensors & Switches'],
  // brand-only signals (typos/abbreviations defeat name-pattern matching)
  [/^Fi2000$/i, null, 'Modules', true], // brand match, handled specially below
  // HSR carb kits / gasket kits
  [/hsr .*gasket kit/i, null, 'Rebuild Kits'],
  [/hsr ?\d/i, null, 'Carburetor'],
  [/70mm induction kit/i, null, 'Carburetor'],
  [/complete stand-alone efi engine management system/i, null, 'Modules'],
  [/eliminator act/i, null, 'Modules'],
  // fuel-system items the original "fuel filter/line" regex missed
  [/fuel check valve/i, null, 'Fuel Filters'],
  [/fuel rod/i, null, 'Fuel Filters'],
  [/shut off rod/i, null, 'Fuel Filters'],
  [/gas filter/i, null, 'Fuel Filters'],
  [/fuel\/primer line|fuel injection hose/i, null, 'Fuel Filters'],
  [/\d+ micron element/i, null, 'Fuel Filters'],
  [/cleanable element/i, null, 'Fuel Filters'],
  // air cleaner covers -- "AIR CLNR" abbreviation has a space, missed by the
  // original no-space "aircln?r" pattern
  [/air clnr fin|air clnr rnd/i, null, 'Air Cleaner Inserts & Covers'],
  [/chrome cover$/i, null, 'Air Cleaner Inserts & Covers'],
  [/universal faceplate/i, null, 'Air Cleaner Inserts & Covers'],
  [/replacement glass/i, null, 'Air Cleaner Inserts & Covers'],
  // air cleaner kits / filters the original pattern missed
  [/street metal intake/i, null, 'Complete Air Cleaner Kits & Assemblies'],
  [/air scoop/i, null, 'Complete Air Cleaner Kits & Assemblies'],
  [/big power filter kit/i, null, 'Air Filter'],
  [/replacement filter$/i, null, 'Air Filter'],
  [/round .*foam element/i, null, 'Air Filter'],
  [/pre filter/i, null, 'Air Filter'],
  // air cleaner mount hardware abbreviation
  [/ac brkg assy/i, null, 'Air Cleaner Mounts, Brackets & Hardware'],
  [/external vent option kit/i, null, 'Air Cleaner'], // breather-adjacent accessory
  // small internal carb parts -> Jets, Needles, Screws, etc.
  [/emulsion tube/i, null, 'Jets, Needles, Screws, etc.'],
  [/nozzle/i, null, 'Jets, Needles, Screws, etc.'],
  [/air horn kit/i, null, 'Jets, Needles, Screws, etc.'],
  [/throttle disc/i, null, 'Jets, Needles, Screws, etc.'],
  [/idle air control/i, null, 'Jets, Needles, Screws, etc.'],
  [/packing kit/i, null, 'Jets, Needles, Screws, etc.'],
  [/idler stud spacer/i, null, 'Jets, Needles, Screws, etc.'],
  [/o-ring seal/i, null, 'Jets, Needles, Screws, etc.'],
  [/brass seal set/i, null, 'Jets, Needles, Screws, etc.'],
  [/keihin style .*kit/i, null, 'Jets, Needles, Screws, etc.'],
  [/lower plug|drain valve/i, null, 'Jets, Needles, Screws, etc.'],
  [/o-?rings?\b/i, null, 'Jets, Needles, Screws, etc.'],
  [/back plate gasket/i, null, 'Backing Plates'],
  [/vent seal|washers?\b/i, null, 'Jets, Needles, Screws, etc.'],
  [/vacuum piston/i, null, 'Jets, Needles, Screws, etc.'],
  [/tillotson|tickler/i, null, 'Jets, Needles, Screws, etc.'],
  [/seal airbox/i, null, 'Jets, Needles, Screws, etc.'],
  [/adjuster boot/i, null, 'Jets, Needles, Screws, etc.'],
  [/voes/i, 'Electrical', 'Sensors & Switches'],
  [/hose ends? with clamp|siphon|sight tube/i, null, 'Fuel Filters'],
  // throttle/choke components
  [/throttle arm kit/i, null, 'Carburetor'],
  [/pull wire/i, null, 'Carburetor'],
];

function matchExplicit(id) {
  return EXPLICIT_OUT_OF_CATEGORY[id] || null;
}

function matchRule(name, brand) {
  if (brand === 'Fi2000') return { cat: CAT, subcat: 'Modules' };
  for (const [re, catOverride, subcat] of RULES) {
    if (re.test(name)) {
      return { cat: catOverride || CAT, subcat };
    }
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name, brand FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = 'General'`,
      [CAT]
    );
    console.log(`Total General rows: ${res.rows.length}\n`);

    const updates = [];
    const tally = {};
    const stillGeneral = [];

    for (const row of res.rows) {
      const explicit = matchExplicit(row.id);
      if (explicit) {
        const [cat, subcat] = explicit;
        const label = `${cat} / ${subcat}`;
        tally[label] = (tally[label] || 0) + 1;
        updates.push({ id: row.id, cat, subcat, name: row.name });
        continue;
      }
      const m = matchRule(row.name, row.brand);
      if (m) {
        const label = m.cat === CAT ? m.subcat : `${m.cat} / ${m.subcat}`;
        tally[label] = (tally[label] || 0) + 1;
        updates.push({ id: row.id, cat: m.cat, subcat: m.subcat, name: row.name });
      } else {
        stillGeneral.push(row);
      }
    }

    if (process.argv.includes('--verbose')) {
      console.log('=== Full per-row assignment ===');
      for (const u of updates) {
        const label = u.cat === CAT ? u.subcat : `${u.cat} / ${u.subcat}`;
        console.log(`  [${label}] ${u.name}`);
      }
    }

    console.log('=== Reclassification plan ===');
    for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label}: ${count}`);
    }

    console.log(`\n=== Still General (genuine stragglers): ${stillGeneral.length} ===`);
    for (const r of stillGeneral) console.log(`  ${r.brand || ''} | ${r.name}`);

    console.log(`\nTotal moved: ${updates.length} / ${res.rows.length}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    for (const { id, cat, subcat } of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [cat, subcat, id]
      );
    }
    await client.query('COMMIT');
    console.log(`\nApplied ${updates.length} updates. Committed.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
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
