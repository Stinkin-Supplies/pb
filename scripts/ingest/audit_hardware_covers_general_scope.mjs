#!/usr/bin/env node
/**
 * audit_hardware_covers_general_scope.mjs
 *
 * READ-ONLY, NO WRITES. Cross-catalog scoping audit for the
 * "Hardware, Covers & General" category build — Laken's explicit
 * catch-all for things without a home. Run BEFORE any
 * fix_hardware_covers_general_taxonomy.mjs classification logic
 * is written.
 *
 * UNLIKE Wheels & Tires (which turned out to need zero cross-category
 * pulls), this one is expected to be a real multi-source migration —
 * closer in shape to Cables (session 77/80) or Tanks & Body (session 79).
 * "Hardware, Covers" has never been audited before (confirmed via
 * HANDOFF_LOG: "Not started... No audit yet").
 *
 * Laken's spec, 9 candidate groupings (row counts TBD — Laken's
 * explicit instruction: combine small ones, don't let any single
 * subcategory balloon; decide AFTER seeing real numbers, not before):
 *   1. Bolt Kits, Hardware Assortments & Replenishment
 *   2. Timing Drain Plugs
 *   3. Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps
 *   4. Motorcycle Covers — Laken confirmed: full-bike WEATHER covers,
 *      likely sitting inside the existing `Security & Covers` category
 *      (249 rows) — that category's own name has "Covers" in it, so
 *      this is a real pull-out, not a false-positive risk to exclude.
 *      Security & Covers otherwise stays untouched (locks/alarms etc).
 *   5. Drink Holders & Coolers, Flags, Flagpoles & Accessories
 *   6. Clocks/Thermometers
 *   7. Decals, Guardian Bell
 *   8. Shop Manuals
 *   9. Merchandising
 *
 * Laken confirmed: brand NEW top-level display_category (same pattern
 * as Frames & Suspension, session 80) — not a rename of anything
 * existing.
 *
 * Usage:
 *   node scripts/ingest/audit_hardware_covers_general_scope.mjs
 *
 * Outputs (stdout only, nothing written to the DB):
 *   A. Row-count estimate for each of the 9 groupings, catalog-wide,
 *      grouped by their CURRENT display_category — tells us real
 *      source categories, same as the Wheels & Tires audit's section C.
 *   B. Targeted overlap check: Security & Covers's current subcategory
 *      breakdown, to isolate the motorcycle-cover slice specifically
 *      (not locks/alarms/other security products).
 *   C. Cross-system false-positive risk — bare HARDWARE/BOLT/PLUG
 *      patterns are exactly the kind of thing that swept in
 *      brake/engine/transmission fasteners during Frames & Suspension
 *      (session 80's "Hardware & Fasteners" cross-system bin problem).
 *      Flagged here, not excluded — decide after seeing real samples.
 *   D. Sample rows (15 each) for every grouping x source category
 *      combination found, so Laken can eyeball real names before any
 *      classification logic gets written.
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

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

// ---------------------------------------------------------------
// ⚠️ These patterns are sent DIRECTLY to Postgres's `~*` operator as
// plain strings — they are NOT JS RegExp objects. This is deliberate:
// JS \b and Postgres word-boundary syntax are NOT interchangeable,
// and translating between them at this cross-layer boundary is
// exactly the bug that hit both Dashes & Gauges (session 80, \y
// used inside a JS RegExp literal — JS silently ignores it) and this
// script's own first draft (used JS \b directly in Postgres ~*
// queries — Postgres doesn't support \b either, per the project's
// own documented rule: "Postgres word boundary: use (\s|$) not \b").
//
// Every pattern below uses (^|\s) on the left and (\s|$) on the right
// instead of \b. Plurals are written explicitly as S? rather than
// relying on any boundary token splitting the plural suffix — same
// "trailing-S family" bug documented after Fuel/Air JETS?, Engine
// CAMS?, and Electrical SWITCH(ES)? all failed the same way.
// ---------------------------------------------------------------

const GROUPS = {
  '1. Bolt Kits, Hardware Assortments & Replenishment': [
    '(^|\\s)BOLT\\s*KITS?(\\s|$)',
    '(^|\\s)HARDWARE\\s*ASSORTMENTS?(\\s|$)',
    '(^|\\s)HARDWARE\\s*KITS?(\\s|$)',
    '(^|\\s)NUT\\s*(AND|&)\\s*BOLT(\\s|$)',
    '(^|\\s)FASTENER\\s*ASSORTMENTS?(\\s|$)',
    '(^|\\s)REPLENISHMENT(\\s|$)',
  ],
  '2. Timing Drain Plugs': [
    '(^|\\s)TIMING\\s*(HOLE\\s*)?PLUGS?(\\s|$)',
    '(^|\\s)DRAIN\\s*PLUGS?(\\s|$)',
  ],
  '3. Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps': [
    '(^|\\s)BOLT\\s*CAPS?(\\s|$)',
    '(^|\\s)SHRINK\\s*TUBES?(\\s|$)',
    '(^|\\s)CABLE\\s*TIES?(\\s|$)',
    '(^|\\s)WIRE\\s*WRAPS?(\\s|$)',
    '(^|\\s)ZIP\\s*TIES?(\\s|$)',
  ],
  '4. Motorcycle Covers': [
    '(^|\\s)MOTORCYCLE\\s*COVERS?(\\s|$)',
    '(^|\\s)BIKE\\s*COVERS?(\\s|$)',
    '(^|\\s)DUST\\s*COVERS?(\\s|$)',
    '(^|\\s)STORAGE\\s*COVERS?(\\s|$)',
    '(^|\\s)WEATHER(PROOF)?\\s*COVERS?(\\s|$)',
    '(^|\\s)HALF\\s*COVERS?(\\s|$)', // partial/half bike covers, common product line
  ],
  '5. Drink Holders & Coolers, Flags, Flagpoles & Accessories': [
    '(^|\\s)DRINK\\s*HOLDERS?(\\s|$)',
    '(^|\\s)COOLERS?(\\s|$)',
    '(^|\\s)FLAGS?(\\s|$)',
    '(^|\\s)FLAGPOLES?(\\s|$)',
    '(^|\\s)FLAG\\s*MOUNTS?(\\s|$)',
    '(^|\\s)CUP\\s*HOLDERS?(\\s|$)',
  ],
  '6. Clocks/Thermometers': [
    '(^|\\s)CLOCKS?(\\s|$)',
    '(^|\\s)THERMOMETERS?(\\s|$)',
  ],
  '7. Decals, Guardian Bell': [
    '(^|\\s)DECALS?(\\s|$)',
    '(^|\\s)GUARDIAN\\s*BELLS?(\\s|$)',
  ],
  '8. Shop Manuals': [
    '(^|\\s)SHOP\\s*MANUALS?(\\s|$)',
    '(^|\\s)SERVICE\\s*MANUALS?(\\s|$)',
    '(^|\\s)OWNERS?\\s*MANUALS?(\\s|$)',
  ],
  '9. Merchandising': [
    '(^|\\s)MERCHANDISING(\\s|$)',
    '(^|\\s)DISPLAY\\s*(RACK|BOARD|STAND|SHELF)(\\s|$)',
    '(^|\\s)POP\\s*DISPLAY(\\s|$)',
    '(^|\\s)COUNTER\\s*DISPLAY(\\s|$)',
  ],
};

// Cross-system exclusion hints — same defensive pattern as Frames &
// Suspension (session 80): bare HARDWARE/BOLT/PLUG risk sweeping in
// engine/brake/transmission fasteners that happen to use these words.
const OTHER_SYSTEM_HINTS = [
  '(^|\\s)BRAKE(\\s|$)',
  '(^|\\s)ROTOR(\\s|$)',
  '(^|\\s)CALIPER(\\s|$)',
  '(^|\\s)ENGINE\\s*(CASE|MOUNT)(\\s|$)',
  '(^|\\s)CAM(\\s|$)',
  '(^|\\s)ROCKER\\s*BOX(\\s|$)',
  '(^|\\s)TAPPET(\\s|$)',
  '(^|\\s)PRIMARY(\\s|$)',
  '(^|\\s)SPROCKET(\\s|$)',
  '(^|\\s)TRANSMISSION(\\s|$)',
  '(^|\\s)CLUTCH(\\s|$)',
  '(^|\\s)INTAKE\\s*MANIFOLD(\\s|$)',
  '(^|\\s)CARBURETOR(\\s|$)',
  '(^|\\s)FORK(\\s|$)',
  '(^|\\s)SHOCK(\\s|$)',
  '(^|\\s)FRAME(\\s|$)',
  '(^|\\s)DRAIN\\s*PLUG(\\s|$)', // NOTE: this is one of OUR target terms (Group 2) —
                                 // included here only to catch it if it's an ENGINE
                                 // oil drain plug rather than a timing drain plug;

                       // review sample rows carefully, don't auto-exclude
];

function combinedPattern(list) {
  // list is an array of plain Postgres ARE pattern strings (see GROUPS /
  // OTHER_SYSTEM_HINTS above) — just OR them together, no JS RegExp
  // involved at any point, so there's no cross-layer escaping to lose.
  return list.join('|');
}

async function main() {
  console.log('='.repeat(78));
  console.log('HARDWARE, COVERS & GENERAL — SCOPING AUDIT (read-only, no writes)');
  console.log('='.repeat(78));

  // --- A. Row counts per grouping, catalog-wide, by source category ---
  console.log('\n--- A. Catalog-wide hits per grouping, by current display_category ---');

  const groupTotals = {};

  for (const [groupName, patterns] of Object.entries(GROUPS)) {
    console.log(`\n${groupName}`);
    const pattern = combinedPattern(patterns);

    const result = await pool.query(
      `SELECT display_category, count(*) AS n
       FROM catalog_unified
       WHERE is_active = true
         AND name ~* $1
       GROUP BY display_category
       ORDER BY n DESC`,
      [pattern]
    );

    let total = 0;
    if (result.rows.length === 0) {
      console.log('  (no hits catalog-wide)');
    } else {
      for (const row of result.rows) {
        console.log(`  ${(row.display_category ?? '(NULL category)').padEnd(28)} ${row.n}`);
        total += Number(row.n);
      }
    }
    groupTotals[groupName] = total;
  }

  console.log('\n--- Summary: total hits per grouping (all sources combined) ---');
  for (const [groupName, total] of Object.entries(groupTotals)) {
    console.log(`  ${groupName.padEnd(60)} ${total}`);
  }

  // --- B. Security & Covers breakdown (targeted overlap check) -----
  console.log('\n--- B. `Security & Covers` current subcategory breakdown -------------');
  console.log('(isolating the motorcycle-cover slice from locks/alarms/other security)');

  const secCoverBreakdown = await pool.query(
    `SELECT display_subcategory, count(*) AS n
     FROM catalog_unified
     WHERE display_category = 'Security & Covers'
       AND is_active = true
     GROUP BY display_subcategory
     ORDER BY n DESC`
  );
  for (const row of secCoverBreakdown.rows) {
    console.log(`  ${(row.display_subcategory ?? '(NULL)').padEnd(30)} ${row.n}`);
  }

  // --- C. Cross-system false-positive risk --------------------------
  console.log('\n--- C. Cross-system false-positive risk (bare HARDWARE/BOLT/PLUG etc) ---');
  console.log('(rows matching a target grouping that ALSO mention another system —');
  console.log(' same shape as Frame & Hardware\'s fastener-bin problem, session 80.');
  console.log(' Not excluded here, just surfaced for review.)');

  const hintPattern = combinedPattern(OTHER_SYSTEM_HINTS);

  for (const [groupName, patterns] of Object.entries(GROUPS)) {
    const pattern = combinedPattern(patterns);
    const crossHits = await pool.query(
      `SELECT display_category, count(*) AS n
       FROM catalog_unified
       WHERE is_active = true
         AND name ~* $1
         AND name ~* $2
       GROUP BY display_category
       ORDER BY n DESC`,
      [pattern, hintPattern]
    );
    if (crossHits.rows.length > 0) {
      console.log(`\n  ${groupName}`);
      for (const row of crossHits.rows) {
        console.log(`    ${(row.display_category ?? '(NULL)').padEnd(28)} ${row.n}`);
      }
    }
  }

  // --- D. Sample rows per grouping x source category ----------------
  console.log('\n--- D. Sample rows (10 per grouping, per source category) -------------');

  for (const [groupName, patterns] of Object.entries(GROUPS)) {
    const pattern = combinedPattern(patterns);
    const sources = await pool.query(
      `SELECT DISTINCT display_category
       FROM catalog_unified
       WHERE is_active = true
         AND name ~* $1`,
      [pattern]
    );

    for (const src of sources.rows) {
      console.log(`\n  ${groupName} <- "${src.display_category ?? '(NULL)'}"`);
      const samples = await pool.query(
        `SELECT id, name, display_subcategory
         FROM catalog_unified
         WHERE is_active = true
           AND display_category IS NOT DISTINCT FROM $2
           AND name ~* $1
         ORDER BY random()
         LIMIT 10`,
        [pattern, src.display_category]
      );
      for (const row of samples.rows) {
        console.log(`    [${row.id}] ${row.name}  (${row.display_subcategory ?? 'null'})`);
      }
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('AUDIT COMPLETE — no rows modified. Review output before writing');
  console.log('fix_hardware_covers_general_taxonomy.mjs classification logic.');
  console.log('Decide subcategory combinations (per Laken: combine small ones,');
  console.log('avoid a single bucket ballooning) using the Summary totals above.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
