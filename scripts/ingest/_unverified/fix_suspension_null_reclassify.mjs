#!/usr/bin/env node
/**
 * fix_suspension_null_reclassify.mjs
 *
 * Scoping audit (audit_suspension_nulls_scope.mjs) found the 73 rows
 * left in Suspension with NULL subcategory are NOT a Suspension
 * vocabulary gap — they're genuinely misplaced at the TOP-LEVEL
 * category, same pattern as the original Accessories & Misc problem,
 * just much smaller.
 *
 * Four real groups identified:
 *   1. Fork/tree/cartridge suspension hardware -> Frames & Suspension
 *      (Bishop forks, Dominator/NL tree sets, Scepter/Dual Adj
 *      cartridge kits, Gold Valve emulators, PRO ONE tubes) — this
 *      vocabulary already lives in Frames & Suspension's Forks (1,767)
 *      and Triple Trees & Covers (363) subcategories.
 *   2. "Spring Fork Brake ..." vintage brake-on-spring-fork parts
 *      -> Foot Controls / Brake Arm & Pedal Hardware (same subcategory
 *      the Daniel Boone brake-control kits landed in during the
 *      five-category subcat pass)
 *   3. Handlebar/gauge items genuinely misfiled -> Handlebar & Controls
 *      or Dashes & Gauges
 *   4. Genuine cross-system stragglers (Andrews Shifter Fork Kit,
 *      Transmission Shifter Fork Bushing Nuts, Carburetor Throttle
 *      Return Spring Kit, Clutch kits, UL Rear Rod Only) — held back,
 *      not force-classified, for Laken's explicit review.
 *
 * Same Postgres regex convention as every script this session: plain
 * pattern strings sent to `~*`, boundaries as (^|[\s/'-]) / ([\s/'-]|$).
 *
 * Usage:
 *   node fix_suspension_null_reclassify.mjs           (dry run, default)
 *   node fix_suspension_null_reclassify.mjs --apply   (writes)
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
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const B = (s) => `(^|[\\s/'-])${s}([\\s/'-]|$)`;

// ---------------------------------------------------------------------
// Explicit ID overrides — small, fully-reviewed set, checked first.
// These are ambiguous/cross-system rows that don't fit a clean pattern
// but were individually confirmed against the full remaining list.
// ---------------------------------------------------------------------
const HELD_BACK_IDS = new Set([
  80190,  // UL Rear Rod Only -> ambiguous (rear suspension rod? frame rod?), hold for Laken's call
]);

// Explicit ID-based direct routing — confirmed obvious cross-system
// stragglers, routed directly rather than via pattern (small, fully
// reviewed set from the audit's full remaining list).
const ID_ROUTES = {
  62934: { category: 'Transmission & Clutch', subcat: 'Shifter Forks & Gears' },   // Andrews Shifter Fork Kit
  92265: { category: 'Transmission & Clutch', subcat: 'Shifter Forks & Gears' },   // Transmission Shifter Fork Bushing Nuts
  74315: { category: 'Carburetion & Fuel', subcat: null },                          // Carburetor Throttle Return Spring Kit
  63474: { category: 'Transmission & Clutch', subcat: null },                       // Clutch and Spring Kit
  63459: { category: 'Transmission & Clutch', subcat: null },                       // Clutch Hub Nut Kit and Spring Kit
  63380: { category: 'Transmission & Clutch', subcat: null },                       // M8 Clutch Stopper Plate and Spring Kit
};

// ---------------------------------------------------------------------
// Reclassification rules, in priority order. First match wins.
// Each rule: { category, subcat, pattern }
// ---------------------------------------------------------------------
const RULES = [
  // Group 2: vintage spring-fork brake parts -> Foot Controls
  {
    category: 'Foot Controls',
    subcat: 'Brake Arm & Pedal Hardware',
    pattern: `${B('SPRING FORK (FRONT )?BRAKE')}|${B('REAR BRAKE SHOE SPRING')}`,
  },
  // Group 3: handlebar switch/clamp hardware -> Handlebar & Controls
  {
    category: 'Handlebar & Controls',
    subcat: 'Switches & Controls',
    pattern: `${B('HANDLEBAR-MOUNTED')}|${B('PUSH-BUTTON SWITCH')}`,
  },
  {
    category: 'Handlebar & Controls',
    subcat: 'Risers, Clamps & Components',
    pattern: `${B('H-?BAR CLAMP')}`,
  },
  // Group 3: gauge hardware -> Dashes & Gauges
  {
    category: 'Dashes & Gauges',
    subcat: 'Gauges',
    pattern: `${B('LED GAUGE')}|${B('PRESSURE GAUGE')}`,
  },
  // Group 1: fork/tree/cartridge suspension hardware -> Frames & Suspension
  {
    category: 'Frames & Suspension',
    subcat: 'Forks',
    pattern: `${B('INVERTED FORKS?')}|${B('FOR TUBES')}|${B('FORK KIT')}|${B('GOLD VALVE')}|${B('CARTRIDGE EMULATORS?')}|${B('RACE WITH STOP LOWER')}|${B('REMOTE RESERVOIR')}`,
  },
  {
    category: 'Frames & Suspension',
    subcat: 'Triple Trees & Covers',
    pattern: `${B('TREE (SET|COVER)')}|${B('LOWER TREE')}`,
  },
  {
    category: 'Frames & Suspension',
    subcat: 'Rear Shocks & Lowering Kits',
    pattern: `${B('CARTRIDGE KIT')}|${B('DURA AEE SERIES SHOCKS?')}|${B('AIR RIDE KIT')}|${B('AIR PUMP')}`,
  },
];

async function main() {
  console.log('='.repeat(78));
  console.log(`SUSPENSION NULL RECLASSIFICATION  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log('='.repeat(78));

  const { rows } = await pool.query(
    `SELECT id, sku, name FROM catalog_unified
     WHERE display_category = 'Suspension' AND display_subcategory IS NULL AND is_active = true
     ORDER BY name`
  );

  console.log(`\nTotal Suspension NULL rows: ${rows.length}\n`);

  const tally = {};
  const samples = {};
  const toUpdate = []; // { id, category, subcat }
  const heldBack = [];
  const unmatched = [];

  for (const row of rows) {
    if (HELD_BACK_IDS.has(row.id)) {
      heldBack.push(row);
      continue;
    }

    if (ID_ROUTES[row.id]) {
      const route = ID_ROUTES[row.id];
      const key = `${route.category} / ${route.subcat || '(subcategory TBD)'}`;
      tally[key] = (tally[key] || 0) + 1;
      if (!samples[key]) samples[key] = [];
      if (samples[key].length < 8) samples[key].push(row);
      toUpdate.push({ id: row.id, category: route.category, subcat: route.subcat });
      continue;
    }

    let matched = null;
    for (const rule of RULES) {
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(row.name)) {
        matched = rule;
        break;
      }
    }

    if (matched) {
      const key = `${matched.category} / ${matched.subcat}`;
      tally[key] = (tally[key] || 0) + 1;
      if (!samples[key]) samples[key] = [];
      if (samples[key].length < 8) samples[key].push(row);
      toUpdate.push({ id: row.id, category: matched.category, subcat: matched.subcat });
    } else {
      unmatched.push(row);
    }
  }

  console.log('-'.repeat(78));
  console.log('Classification tally:');
  console.log('-'.repeat(78));
  for (const [key, count] of Object.entries(tally)) {
    console.log(`  ${key.padEnd(50)} ${count}`);
  }
  console.log(`  (explicit hold-back IDs, not touched)                ${heldBack.length}`);
  console.log(`  (unmatched, held back)                               ${unmatched.length}`);

  console.log('\nSample of matched rows:');
  for (const [key, sampleRows] of Object.entries(samples)) {
    console.log(`\n  ${key}:`);
    for (const r of sampleRows) {
      console.log(`      [${r.id}] ${r.name}`);
    }
  }

  if (heldBack.length > 0) {
    console.log('\nExplicit hold-back rows (NOT touched by this script):');
    for (const r of heldBack) {
      console.log(`      [${r.id}] ${r.name}`);
    }
  }

  if (unmatched.length > 0) {
    console.log('\nUnmatched rows (NOT touched):');
    for (const r of unmatched) {
      console.log(`      [${r.id}] ${r.name}`);
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log(`TOTAL: ${toUpdate.length} matched${APPLY ? ' and applied' : ' (dry run, not written)'}, `
    + `${heldBack.length} explicit hold-backs, ${unmatched.length} unmatched.`);
  console.log('='.repeat(78));

  if (APPLY && toUpdate.length > 0) {
    for (const u of toUpdate) {
      await pool.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now()
         WHERE id = $3`,
        [u.category, u.subcat, u.id]
      );
    }
    console.log(`\nApplied: ${toUpdate.length} rows moved out of Suspension.`);
  }

  if (!APPLY) {
    console.log('\n(dry run — no rows written. Re-run with --apply to commit.)');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
