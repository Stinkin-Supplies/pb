#!/usr/bin/env node
/**
 * fix_accessories_misc_taxonomy.mjs
 *
 * Reclassifies "Accessories & Misc" NULL-subcategory rows (3,203
 * total, 80.6% of the category — the largest single gap found in
 * the session-81 full catalog health check).
 *
 * UNLIKE every prior category script this session, this one moves
 * rows across TOP-LEVEL display_category boundaries, not just within
 * one category's subcategories. Confirmed by discovery audits
 * (audit_accessories_misc_nulls.mjs, audit_accessories_misc_
 * crossclassify.mjs): this bucket is a genuine mixed bag of rows
 * that are misplaced at the CATEGORY level, not just missing a
 * subcategory — a "Starter Relay" belongs in Electrical entirely,
 * not "Accessories & Misc / some subcategory".
 *
 * Structure, in priority order:
 *   1. SPOOL rows (43 total, individually confirmed via targeted
 *      audit) — 42 are dirt-track spool-hub wheels/hubs/axles (WR,
 *      XR 750, KR designations, wheel/hub/axle sizing) -> Wheels &
 *      Tires. ONE is different: [64501] "Parkerized Spool Shifter
 *      Peg" — Laken's catch: "Spool" here describes the peg's shape,
 *      not a wheel -> Foot Controls. Handled by explicit ID, not
 *      pattern, since this is a small, fully-verified set.
 *   2. Extended generic-hardware vocabulary -> Hardware, Covers &
 *      General / Bolt Kits (adds Fillister/Oval/Flange head-screw
 *      terms the original classifier didn't have).
 *   3. Extended Merchandising vocabulary -> Hardware, Covers &
 *      General / Merchandising (brand-name patch variants, hoodies,
 *      catalogs).
 *   4. NEW: top-level category reassignment rules for rows that are
 *      genuinely misplaced entirely (Electrical, Handlebar & Controls,
 *      Foot Controls, Transmission & Clutch, Suspension, Wheels &
 *      Tires) — built from the unmatched sample's real signal:
 *      Starter Relay/Ignition Coil -> Electrical; Grip Set/Twist Grip
 *      -> Handlebar & Controls; Shifter Peg/Shifter Gear/Shifter Fork
 *      -> Foot Controls or Transmission & Clutch depending on part;
 *      Valve Stem Cover -> Wheels & Tires; Damper Washer -> Suspension.
 *
 * Same Postgres regex convention as every script this session: plain
 * ARE pattern strings sent directly to `~*`, boundaries as
 * (^|[\s/'-]) / ([\s/'-]|$) — NOT JS \b, NOT JS RegExp .source.
 *
 * Usage:
 *   node scripts/ingest/fix_accessories_misc_taxonomy.mjs           (dry run, default)
 *   node scripts/ingest/fix_accessories_misc_taxonomy.mjs --apply   (writes)
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

// ---------------------------------------------------------------
// 1. Explicit ID overrides — the one Spool row that ISN'T a wheel.
// Checked FIRST, before any pattern rule, so it can't be swept up
// by the SPOOL->Wheels & Tires rule below.
// ---------------------------------------------------------------
const EXPLICIT_ID_OVERRIDES = {
  64501: { category: 'Foot Controls', subcategory: null }, // "Parkerized Spool Shifter Peg" — Laken's call: shape descriptor, not a wheel
};

// ---------------------------------------------------------------
// 2. Rules, in priority order. Each rule declares target category +
// subcategory (or null to leave subcategory for a later pass).
// ---------------------------------------------------------------
const RULES = [
  // --- Spool-hub wheels/hubs/axles -> Wheels & Tires --------------
  {
    category: 'Wheels & Tires',
    subcategory: (name) => {
      if (/(^|[\s/'-])HUBS?([\s/'-]|$)/i.test(name)) return 'Hubs & Spokes';
      if (/(^|[\s/'-])AXLES?([\s/'-]|$)/i.test(name)) return 'Axles & Spacers';
      return 'Wheels';
    },
    test: (name) => /(^|[\s/'-])SPOOL([\s/'-]|$)/i.test(name),
  },

  // --- Generic hardware (extended vocabulary) ---------------------
  {
    category: 'Hardware, Covers & General',
    subcategory: 'Bolt Kits, Hardware Assortments & Replenishment',
    test: (name) => {
      const isGenericHardware =
        /(^|[\s/'-])HEX\s*CAP\s*BOLTS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])ALLEN\s*SOCKET\s*CAP\s*BOLTS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])ALLEN\s*FLAT\s*HEAD\s*SCREWS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])FILLISTER\s*HEAD\s*SCREWS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])OVAL\s*HEAD\s*(MACHINE\s*)?SCREWS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])HEX\s*FLANGE\s*SCREWS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])ROUND\s*HEAD\s*SCREWS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])HEX\s*BOLTS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])(FLAT|LOCK)\s*WASHERS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])COTTER\s*PINS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])RIVETS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])BOLT\s*(AND|&)\s*WASHER\s*KITS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])SCREW\s*(AND|&)\s*WASHER([\s/'-]|$)/i.test(name);
      if (!isGenericHardware) return false;
      // Exclude ignition/electrical-specific hardware that happens to
      // use generic screw/washer wording — Laken's call: Breaker Arm
      // Screw and Washer is an ignition-system part, goes to Electrical.
      const isElectricalSpecific = /(^|[\s/'-])BREAKER\s*ARM([\s/'-]|$)/i.test(name);
      return !isElectricalSpecific;
    },
  },

  // --- Merchandising (extended vocabulary) ------------------------
  {
    category: 'Hardware, Covers & General',
    subcategory: 'Merchandising',
    test: (name) =>
      /(^|[\s/'-])PATCH(ES)?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])T.SHIRTS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])HOODIES?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])PULL\s*OVER\s*HOODIE([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])CATALOG([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])GIFT\s*SET([\s/'-]|$)/i.test(name),
  },

  // --- Electrical (genuinely misplaced parts) ---------------------
  {
    category: 'Electrical',
    subcategory: null,
    test: (name) =>
      /(^|[\s/'-])STARTER\s*RELAYS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])IGNITION\s*COILS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])LED\s*(WEDGE|BULB)([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])(6|12)\s*VOLT\s*HORN([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])COW\s*BELL\s*HORN([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])BREAKER\s*ARM([\s/'-]|$)/i.test(name),
  },

  // --- Handlebar & Controls ----------------------------------------
  {
    category: 'Handlebar & Controls',
    subcategory: null,
    test: (name) =>
      /(^|[\s/'-])GRIP\s*SET([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])TWIST\s*GRIP([\s/'-]|$)/i.test(name),
  },

  // --- Foot Controls (shifter pegs specifically, NOT shifter forks/gears) --
  {
    category: 'Foot Controls',
    subcategory: null,
    test: (name) =>
      /(^|[\s/'-])SHIFTER\s*PEGS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])SHIFT\s*PEGS?([\s/'-]|$)/i.test(name),
  },

  // --- Transmission & Clutch (shifter forks/gears — drivetrain, not pegs) --
  {
    category: 'Transmission & Clutch',
    subcategory: null,
    test: (name) =>
      /(^|[\s/'-])SHIFTER\s*FORKS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])SHIFTER\s*GEARS?([\s/'-]|$)/i.test(name),
  },

  // --- Wheels & Tires (valve stem covers) --------------------------
  {
    category: 'Wheels & Tires',
    subcategory: 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
    test: (name) =>
      /(^|[\s/'-])VALVE\s*STEM\s*COVERS?([\s/'-]|$)/i.test(name) ||
      /(^|[\s/'-])TUBE\s*CENTER\s*VALVE([\s/'-]|$)/i.test(name),
  },

  // --- Suspension (damper components) ------------------------------
  {
    category: 'Suspension',
    subcategory: null,
    test: (name) => /(^|[\s/'-])DAMPER\s*(ADJUSTABLE\s*)?WASHERS?([\s/'-]|$)/i.test(name),
  },
];

function classify(name, id) {
  if (EXPLICIT_ID_OVERRIDES[id]) return EXPLICIT_ID_OVERRIDES[id];
  for (const rule of RULES) {
    if (rule.test(name)) {
      const subcategory = typeof rule.subcategory === 'function' ? rule.subcategory(name) : rule.subcategory;
      return { category: rule.category, subcategory };
    }
  }
  return null;
}

async function main() {
  console.log('='.repeat(78));
  console.log(`ACCESSORIES & MISC — NULL REASSIGNMENT  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log('='.repeat(78));
  console.log('\nReclassifying across TOP-LEVEL categories, not just subcategories —');
  console.log('this bucket has rows genuinely misplaced at the category level.\n');

  const nullRows = await pool.query(
    `SELECT id, name FROM catalog_unified
     WHERE display_category = 'Accessories & Misc'
       AND display_subcategory IS NULL
       AND is_active = true`
  );

  const tally = {};
  const updates = [];
  const unmatched = [];

  for (const row of nullRows.rows) {
    const target = classify(row.name, row.id);
    if (target) {
      const key = `${target.category} / ${target.subcategory ?? '(subcategory TBD)'}`;
      tally[key] = (tally[key] ?? 0) + 1;
      updates.push({ id: row.id, name: row.name, ...target });
    } else {
      unmatched.push(row);
    }
  }

  console.log(`Total NULL rows: ${nullRows.rows.length}`);
  console.log('\n--- Classification tally --------------------------------------------');
  for (const [key, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(65)} ${n}`);
  }
  console.log(`  ${'(unmatched — held back, not force-classified)'.padEnd(65)} ${unmatched.length}`);

  console.log('\n--- Sample of matched rows, 5 per target (verify before applying) ----');
  for (const key of Object.keys(tally)) {
    console.log(`\n  ${key}`);
    const samples = updates.filter((u) => `${u.category} / ${u.subcategory ?? '(subcategory TBD)'}` === key).slice(0, 5);
    for (const s of samples) {
      console.log(`    [${s.id}] ${s.name}`);
    }
  }

  console.log('\n--- Sample of unmatched rows (up to 20) -------------------------------');
  for (const row of unmatched.slice(0, 20)) {
    console.log(`    [${row.id}] ${row.name}`);
  }

  if (APPLY) {
    console.log('\nApplying updates...');
    let applied = 0;
    for (const u of updates) {
      await pool.query(
        `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = $1`,
        [u.id, u.category, u.subcategory]
      );
      applied++;
    }
    console.log(`Applied: ${applied} rows reclassified, ${unmatched.length} left in Accessories & Misc (NULL).`);
  } else {
    console.log('\n(dry run — no rows written. Re-run with --apply to commit.)');
  }

  console.log('\n' + '='.repeat(78));
  console.log(APPLY ? 'APPLY COMPLETE.' : 'DRY RUN COMPLETE.');
  console.log('NOTE: rows moved with subcategory=null still need a subcategory pass');
  console.log('within their new category — this script only fixes the top-level');
  console.log('category assignment for those. Flagged, not silently decided.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
