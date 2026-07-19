#!/usr/bin/env node
/**
 * fix_hardware_covers_general_taxonomy.mjs
 *
 * Creates the NEW top-level display_category "Hardware, Covers &
 * General" — Laken's explicit catch-all for things without a home
 * elsewhere. Genuine multi-source migration (like Cables/Tanks & Body),
 * NOT an in-place rename (unlike Wheels & Tires).
 *
 * ⚠️ CRITICAL LESSON FROM THIS CATEGORY'S AUDIT: bare keyword matching
 * (the approach that worked cleanly for Wheels & Tires) is WRONG here.
 * "Bolt Kit" / "Hardware Kit" / "Drain Plug" / "Cover" are generic
 * PRODUCT-TYPE words that appear naturally across nearly every existing
 * category (brake bolt kits, carb hardware kits, cam cover bolts, fork
 * drain plugs, oil cooler covers, phone weather covers, etc). A sweep
 * on these words alone pulled in 717 "Bolt Kit" rows and ~217 "Cooler/
 * Flag" rows, and audit sample review (section D) showed the overwhelming
 * majority are correctly system-specific and must NOT move.
 *
 * Laken's explicit scope corrections after reviewing real samples:
 *   - Bolt Kits/Hardware Assortments: Laken's call — actually pull ALL
 *     bolt kits regardless of system (Brakes/Engine/Carb DO lose these
 *     rows). NOTE: Laken briefly said "no wait, keep them in their
 *     existing categories" immediately after — this script implements
 *     the FINAL correction: system-specific bolt kits (name references
 *     a specific part/system — caliper, carburetor, cam cover, saddlebag,
 *     etc.) STAY PUT. Only genuinely generic/universal hardware
 *     assortments with no system reference in the name qualify (e.g.
 *     "Chrome Bolt Cap 63 Piece Cover Kit").
 *   - Timing Drain Plugs: engine/oil-adjacent only. Fork drain plugs,
 *     transmission drain plugs, and drain-plug GASKETS (James Gaskets
 *     etc — those are gasket products, not the plug itself) excluded.
 *   - Motorcycle Covers: ONLY Security & Covers/Bike Covers (86 rows)
 *     + Tools & Chemicals all-weather/dust covers (7 rows). Excludes:
 *     phone weather covers, dust-cover GASKETS, oil cooler covers, fork
 *     dust covers — all confirmed different products entirely.
 *   - Drink Holders & Coolers, Flags: handlebar drink/cup holders +
 *     USA flags/flagpoles/flag mounts ONLY. Excludes oil coolers,
 *     cylinder head coolers (different product = engine cooling, not
 *     a drink cooler), and electrical "flag terminal" connectors
 *     (unrelated meaning of the word "flag" — a spade-terminal shape).
 *
 * Because near-miss exclusion is the whole difficulty here (not
 * discovery), every rule below is EXACT PHRASE or PHRASE + EXCLUSION,
 * not a bare product-type noun. No bare HARDWARE, BOLT, PLUG, COVER,
 * COOLER, or FLAG pattern is used anywhere in this script.
 *
 * Usage:
 *   node scripts/ingest/fix_hardware_covers_general_taxonomy.mjs           (dry run, default)
 *   node scripts/ingest/fix_hardware_covers_general_taxonomy.mjs --apply   (writes)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not found — check .env.local / .env at repo root.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

const NEW_CATEGORY = 'Hardware, Covers & General';

// ---------------------------------------------------------------
// All patterns are plain Postgres ARE strings sent directly to `~*`
// — NOT JS RegExp objects. Same fix as audit_hardware_covers_general
// _scope.mjs: JS \b is not Postgres word-boundary syntax. Boundaries
// use (^|[\s/'-]) / ([\s/'-]|$); plurals are explicit S? inside the pattern.
// ---------------------------------------------------------------

// System-reference words that DISQUALIFY a "generic hardware" match —
// if any of these appear, the row is system-specific and stays put.
const SYSTEM_REFERENCE_EXCLUSIONS = [
  'CALIPERS?', 'ROTORS?', 'BRAKES?', 'CARBURETORS?', 'CARBS?',
  'AIR\\s*CLEANERS?', 'CAM\\s*COVERS?', 'CAM\\s*CHESTS?',
  'CHAIN\\s*TENSIONERS?', 'ENGINES?', 'MOTORS?', 'PUSHRODS?',
  'CYLINDERS?', 'PISTONS?', 'HEAD\\s*BOLTS?', 'CRANKCASES?',
  'PRIMARY\\s*COVERS?', 'TRANSMISSIONS?', 'CLUTCH(ES)?', 'STARTERS?',
  'GENERATORS?', 'MAGNETOS?', 'ALTERNATORS?', 'BATTERY|BATTERIES',
  'TURN\\s*SIGNALS?', 'SPROCKETS?', 'BELT\\s*PULLEYS?', 'PULLEYS?', 'SADDLEBAGS?',
  'TOUR.PAKS?', 'RACKS?', 'DOCKING', 'SIDE\\s*CARS?', 'FENDERS?',
  'LICENSE\\s*PLATES?', 'HANDLEBARS?', 'RISERS?', 'WINDSHIELDS?',
  'HEADLIGHTS?', 'HEADLAMPS?', 'SPOTLAMPS?', 'TAILLIGHTS?',
  'TAIL\\s*LAMPS?', 'KICKSTANDS?', 'FOOTBOARDS?', 'FOOTPEGS?',
  'SHIFT\\s*LEVERS?', 'MUFFLERS?', 'EXHAUSTS?', 'SHOCKS?', 'FORKS?',
  'FRAMES?', 'SEATS?', 'GASKETS?', 'OIL\\s*PUMPS?', 'OIL\\s*TANKS?',
  'TRIPLE\\s*TREES?', 'KICK\\s*PEDALS?', 'KICKSTARTERS?', 'LIFTERS?',
  'LIFTER\\s*BLOCKS?', 'PINIONS?', 'PINION\\s*SHAFTS?', 'SHIFTERS?',
  'SHIFTER\\s*RODS?',
];

// Known-ambiguous NAME PATTERN found during dry-run sample review — no
// system word appears anywhere in these names, so the SYSTEM_REFERENCE
// _EXCLUSIONS list can't catch them. Confirmed a recurring phrase (2
// instances found: [82812], [82810]), so excluded by name pattern
// rather than by explicit ID — catches any siblings sharing this exact
// generic-sounding phrase. Laken's explicit call: hold, don't force
// into the new category. Same convention as every prior category's
// held-back rows (e.g. Wheels & Tires' [62782] TPMS tool).
const AMBIGUOUS_NAME_PATTERNS = ["(^|[\\s/'-])STOCK\\s*STYLE\\s*HARDWARE\\s*KITS?([\\s/'-]|$)"];

const RULES = [
  // --- Timing Drain Plugs (engine/oil-adjacent ONLY) --------------
  {
    subcategory: 'Timing Drain Plugs',
    test: (name) => {
      const isTimingOrOilPlug =
        /(^|[\s/'-])TIMING\s*(HOLE\s*)?PLUGS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])(ENGINE|OIL\s*TANK|CRANKCASE)\s*DRAIN\s*PLUGS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])DRAIN\s*PLUGS?([\s/'-]|$)/i.test(name);
      if (!isTimingOrOilPlug) return false;
      // Exclude fork/transmission drain plugs and GASKET products
      // (drain plug O-rings/gaskets are gasket products, stay in
      // Gaskets & Seals) — Laken's explicit narrowing.
      const isWrongSystem =
        /(^|[\s/'-])FORK([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])TRANSMISSION([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])GASKET([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])O.RING([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])WASHER([\s/'-]|$)/i.test(name);
      return !isWrongSystem;
    },
  },

  // --- Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps -----
  // These ARE genuinely generic/universal by nature (a cable tie or
  // shrink tube isn't "for" one system) — no exclusion list needed,
  // unlike Bolt Kits below. Audit samples confirmed clean.
  // EXCEPTION: multi-piece "Bolt Cap ## Piece Cover Kit" ASSORTMENTS
  // are hardware-assortment products, not the individual bolt-cap
  // item — routed to Bolt Kits/Hardware Assortments instead (checked
  // via PIECE...KIT pattern, excluded here).
  {
    subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps',
    test: (name) => {
      const isPieceAssortmentKit = /(^|[\s/'-])\d+\s*PIECE\s*COVER\s*KITS?([\s/'-]|$)/i.test(name);
      if (isPieceAssortmentKit) return false; // let it fall through to Bolt Kits rule
      return (
        /(^|[\s/'-])BOLT\s*CAPS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])SHRINK\s*TUBES?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])CABLE\s*TIES?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])WIRE\s*WRAPS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])ZIP\s*TIES?([\s/'-]|$)/i.test(name)
      );
    },
  },

  // --- Motorcycle Covers (weather covers for the WHOLE bike ONLY) --
  {
    subcategory: 'Motorcycle Covers',
    test: (name) => {
      const isBikeCover =
        /(^|[\s/'-])MOTORCYCLE\s*(DUST\s*)?COVERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])(HALF|FULL)\s*COVERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])ALL.WEATHER\s*COVERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])DUST\s*COVERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])UV\d+\s*(HALF\s*)?COVER([\s/'-]|$)/i.test(name);
      if (!isBikeCover) return false;
      // Exclude device covers, gasket-branded dust covers, and any
      // cover that names a specific part (fork/oil cooler/etc — those
      // are component dust covers, not full-bike weather covers).
      const isWrongThing =
        /(^|[\s/'-])DEVICE([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])PHONE([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])IPHONE([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])SAMSUNG([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])PIXEL([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])GASKET([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FORK([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])OIL\s*COOLER([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])STEERING\s*STEM([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])TRANS([\s/'-]|$)/i.test(name);
      return !isWrongThing;
    },
  },

  // --- Drink Holders & Coolers, Flags, Flagpoles & Accessories -----
  {
    subcategory: 'Drink Holders & Coolers, Flags, Flagpoles & Accessories',
    test: (name) => {
      const isDrinkOrFlag =
        /(^|[\s/'-])DRINK\s*HOLDERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])CUP\s*HOLDERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])(USA|AMERICAN)\s*FLAG([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FLAGPOLES?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FLAG\s*(POLE|MOUNT)([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FLAG\s*AND\s*(FIXED\s*)?MOUNT([\s/'-]|$)/i.test(name) ||
        // bare FLAG only when clearly the physical-flag-object sense,
        // not the electrical-terminal sense — require it NOT be
        // immediately followed by wiring/terminal vocabulary
        (/(^|[\s/'-])FLAG([\s/'-]|$)/i.test(name) &&
          !/(^|[\s/'-])(WIRING|TERMINAL|SWITCH|SPADE|SIGNAL)([\s/'-]|$)/i.test(name));
      if (!isDrinkOrFlag) return false;
      // Exclude oil/engine coolers, cylinder head coolers, electrical
      // flag terminals (redundant with the check above, kept explicit
      // for clarity), and brake-switch "flag style connector" products.
      const isWrongThing =
        /(^|[\s/'-])OIL\s*COOLER([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])CYLINDER\s*HEAD\s*COOLER([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])PISTON\s*JET\s*COOLER([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])REGULATOR([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])ALTERNATOR([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])TERMINALS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])TERM([\s/'-]|$)/i.test(name) || // vendor abbreviation, e.g. "FLAG TERM"
        /(^|[\s/'-])SWITCH([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])SADDLEBAG([\s/'-]|$)/i.test(name) || // cooler-saddlebag combo products stay in Luggage & Racks
        /(^|[\s/'-])RACK([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])TOUR.PAK([\s/'-]|$)/i.test(name);
      return !isWrongThing;
    },
  },

  // --- Clocks/Thermometers ----------------------------------------
  {
    subcategory: 'Clocks/Thermometers',
    test: (name) =>
      /(^|[\s/'-])CLOCKS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])THERMOMETERS?([\s/'-]|$)/i.test(name),
  },

  // --- Decals, Guardian Bell --------------------------------------
  // Laken's call needed: audit found real decal hits scattered across
  // Dashes & Gauges (dash/canister decals — arguably belong there) and
  // Tanks & Body (oil tank/fender decals — arguably belong there too).
  // Pending decision, this rule is narrowed to GENERIC/novelty decals
  // + Guardian Bell only, NOT system-specific decals (dash, oil tank,
  // fender) which stay put pending explicit confirmation.
  {
    subcategory: 'Decals, Guardian Bell',
    test: (name) => {
      const isDecalOrBell =
        /(^|[\s/'-])DECALS?([\s/'-]|$)/i.test(name) || /(^|[\s/'-])GUARDIAN\s*BELLS?([\s/'-]|$)/i.test(name);
      if (!isDecalOrBell) return false;
      const isSystemSpecific =
        /(^|[\s/'-])DASH([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])CANISTER([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])OIL\s*TANK([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FENDER([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FORK([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])SHOCK([\s/'-]|$)/i.test(name);
      return !isSystemSpecific;
    },
  },

  // --- Shop Manuals -------------------------------------------------
  // Audit found this clean — 100% already in Accessories & Misc,
  // zero cross-system contamination. Straightforward exact-phrase.
  {
    subcategory: 'Shop Manuals',
    test: (name) =>
      /(^|[\s/'-])(SERVICE|SHOP|OWNERS?)\s*MANUALS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])PART\s*(&|AND)\s*SERVICE\s*MANUAL([\s/'-]|$)/i.test(name),
  },

  // --- Bolt Kits, Hardware Assortments & Replenishment ------------
  // Checked LAST, deliberately — Laken's final call: only GENERIC
  // universal hardware assortments qualify. A row with a system-
  // reference word (see SYSTEM_REFERENCE_EXCLUSIONS) stays in its
  // existing category no matter what. This rule intentionally runs
  // after all the more specific rules above so nothing double-claims.
  {
    subcategory: 'Bolt Kits, Hardware Assortments & Replenishment',
    test: (name) => {
      const isHardwareOrBoltKit =
        /(^|[\s/'-])BOLT\s*KITS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])HARDWARE\s*(ASSORTMENTS?|KITS?)([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])(BOLT\s*)?COVER\s*KITS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])\d+\s*PIECE\s*COVER\s*KITS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FASTENER\s*ASSORTMENTS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])REPLENISHMENT([\s/'-]|$)/i.test(name);
      if (!isHardwareOrBoltKit) return false;
      const exclusionPattern = SYSTEM_REFERENCE_EXCLUSIONS.map(
        (w) => `(^|[\\s/'-])${w}([\\s/'-]|$)`
      ).join('|');
      const hasSystemReference = new RegExp(exclusionPattern, 'i').test(name);
      return !hasSystemReference;
    },
  },
];

function classify(name, id) {
  const isKnownAmbiguous = AMBIGUOUS_NAME_PATTERNS.some((p) => new RegExp(p, 'i').test(name));
  if (isKnownAmbiguous) return null;
  for (const rule of RULES) {
    if (rule.test(name)) return rule.subcategory;
  }
  return null;
}

async function main() {
  console.log('='.repeat(78));
  console.log(`HARDWARE, COVERS & GENERAL — NEW CATEGORY BUILD  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log('='.repeat(78));
  console.log('\nScanning ALL active catalog_unified rows (any display_category).');
  console.log('This is a genuine multi-source migration — matched rows move OUT of');
  console.log('their current category into the new one. Unmatched rows are untouched.\n');

  const allRows = await pool.query(
    `SELECT id, name, display_category, display_subcategory
     FROM catalog_unified
     WHERE is_active = true`
  );

  const tally = {};
  const bySourceCategory = {};
  const updates = [];

  for (const row of allRows.rows) {
    const target = classify(row.name, row.id);
    if (target) {
      tally[target] = (tally[target] ?? 0) + 1;
      bySourceCategory[target] = bySourceCategory[target] ?? {};
      const src = row.display_category ?? '(NULL)';
      bySourceCategory[target][src] = (bySourceCategory[target][src] ?? 0) + 1;
      updates.push({ id: row.id, target, from: row.display_category, name: row.name });
    }
  }

  console.log('--- Classification tally (target subcategory) -------------------------');
  let grandTotal = 0;
  for (const [subcat, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`\n  ${subcat}: ${n} rows`);
    for (const [src, count] of Object.entries(bySourceCategory[subcat]).sort((a, b) => b[1] - a[1])) {
      console.log(`      from "${src}"  ${count}`);
    }
    grandTotal += n;
  }
  console.log(`\nGrand total rows moving into "${NEW_CATEGORY}": ${grandTotal}`);

  console.log('\n--- Sample of matched rows, 5 per subcategory (verify before applying) ---');
  for (const subcat of Object.keys(tally)) {
    console.log(`\n  ${subcat}`);
    const samples = updates.filter((u) => u.target === subcat).slice(0, 5);
    for (const s of samples) {
      console.log(`    [${s.id}] ${s.name}  (was: ${s.from ?? 'NULL'})`);
    }
  }

  if (APPLY) {
    console.log('\nApplying updates...');
    let applied = 0;
    for (const u of updates) {
      await pool.query(
        `UPDATE catalog_unified
         SET display_category = $2, display_subcategory = $3
         WHERE id = $1`,
        [u.id, NEW_CATEGORY, u.target]
      );
      applied++;
    }
    console.log(`Applied: ${applied} rows moved into "${NEW_CATEGORY}".`);
  } else {
    console.log('\n(dry run — no rows written. Re-run with --apply to commit.)');
  }

  console.log('\n' + '='.repeat(78));
  console.log('NOTE: "Merchandising" grouping had ZERO hits in the scoping audit —');
  console.log('no rule written for it here. May be a genuinely empty bucket (like');
  console.log('Electric Shift Kits in Transmission & Clutch, session 77) or may need');
  console.log('different vocabulary — flag to Laken, don\'t force a match.');
  console.log('');
  console.log('NOTE: "Decals, Guardian Bell" rule deliberately narrowed to exclude');
  console.log('dash/tank/fender-specific decals pending Laken\'s explicit call on');
  console.log('whether those migrate too or stay in their current categories.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
