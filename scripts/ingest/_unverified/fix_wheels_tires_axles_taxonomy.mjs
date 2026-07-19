#!/usr/bin/env node
/**
 * fix_wheels_tires_axles_taxonomy.mjs
 *
 * In-place taxonomy cleanup for `Wheels & Tires` (Laken's "Wheels,
 * Tires & Axles" spec). NOT a cross-category migration — the audit
 * script (audit_wheels_tires_axles_scope.mjs) found ZERO stragglers
 * in any other display_category and ZERO cross-system contamination
 * within Wheels & Tires. This is the cleanest category rebuild so
 * far: two subcategory renames + one NULL-bucket classification pass.
 *
 * Existing subcategories (3,089 total, 335 NULL going in):
 *   Wheels              721  — unchanged
 *   Hubs & Spokes       382  — unchanged
 *   Bearings & Seals    208  — unchanged (post Gaskets & Seals pull)
 *   Axles & Spacers     766  — unchanged (Laken's explicit call: NOT
 *                              renamed to spec wording "Axles, Spacers
 *                              & Accessories" — leave as-is)
 *   Tires & Tubes       538  — RENAMED to "Tires"
 *   Valves & Balancing  139  — RENAMED to "Rim Strips, Valve Stems,
 *                              Valve Stem Cap, Wheel Weights"
 *   (NULL)              335  — classified into one of the six above
 *
 * Two known naming collisions found in the audit sample review:
 *   1. "TUBE" is ambiguous — tire inner tubes (Tires) vs. bearing
 *      "crush tubes" (Bearings & Seals), e.g. [54545] "5.98" F/R
 *      CRUSH TUBE FOR 1" SEALED BEARINGS". CRUSH TUBE checked first,
 *      routes to Bearings & Seals, before the generic TUBE→Tires rule.
 *   2. [62782] "Tire Pressure and Temperature Monitor Tool" sits in
 *      Tires & Tubes but is a diagnostic tool, not a tire/tube part.
 *      Flagged for manual review — NOT auto-moved (out of scope for
 *      a rename-and-classify pass; no obvious better subcategory
 *      exists yet, and this is a single row, not a pattern).
 *
 * Dry-run 1 bug: bare singular patterns (\bWHEEL\b, \bTIRE\b, \bHUB\b,
 * etc.) don't match plurals — "WHEELS" has no word boundary between
 * "WHEEL" and the trailing "S", so \bWHEEL\b silently misses it. Same
 * trailing-S family of bug as Electrical's SWITCHES? case (session 77).
 * Fixed by making every bare noun pattern \bWORDS?\b. Also added
 * BALANC(E|ING) BEADS? (missed entirely, round 1 — wheel-balancing
 * beads, an alt product to stick-on wheel weights, same subcategory).
 *
 * Deliberately left unmatched (single rows, no clean subcategory fit,
 * not force-classified): [55187] "Pump With Jump Starter" (inflator/
 * jump-starter combo tool), [42726]/[42727] "Reamer Plugger Kit" (tire
 * repair tool, not a tire/tube product itself).
 *
 * Usage:
 *   node scripts/ingest/fix_wheels_tires_axles_taxonomy.mjs           (dry run, default)
 *   node scripts/ingest/fix_wheels_tires_axles_taxonomy.mjs --apply   (writes)
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
// Rename map — straight VALUE rename, same pattern as
// fix_foot_controls_taxonomy.mjs (session 80): map by existing
// display_subcategory value, not by re-parsing names.
// ---------------------------------------------------------------
const RENAME_MAP = {
  'Tires & Tubes': 'Tires',
  'Valves & Balancing': 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
};

// ---------------------------------------------------------------
// NULL-bucket classification rules, in priority order.
// \b used throughout (NOT \y — Postgres-only syntax, silently
// inert in JS RegExp; caused Dashes & Gauges' round-1 33.5% bug,
// session 80).
//
// Order matters: CRUSH TUBE must be checked before the generic
// TUBE rule, or bearing crush tubes get misfiled as tire tubes.
// ---------------------------------------------------------------
const RULES = [
  // --- Bearings & Seals (check crush-tube collision FIRST) -----
  {
    subcategory: 'Bearings & Seals',
    test: (n) =>
      /\bCRUSH\s*TUBES?\b/i.test(n) ||
      /\bBEARINGS?\b/i.test(n) ||
      /\bBEARING\s*(KIT|TOOL|ADAPTER|LOCK\s*NUT|SLEEVE|RACE)\b/i.test(n),
  },

  // --- Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights ---
  {
    subcategory: 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
    test: (n) =>
      /\bVALVE\s*STEMS?\b/i.test(n) ||
      /\bVALVE\s*CAPS?\b/i.test(n) ||
      /\bWHEEL\s*WEIGHTS?\b/i.test(n) ||
      /\bRIM\s*STRIPS?\b/i.test(n) ||
      /\bTR-?\d+\s*VALVE\s*STEMS?\b/i.test(n) || // vendor tube-spec naming, e.g. "TR-4 VALVE STEM"
      /\bBALANC(E|ING)\s*BEADS?\b/i.test(n), // wheel-balancing beads, alt to stick-on weights
  },

  // --- Tires (generic TUBE goes here, AFTER crush-tube check) ---
  {
    subcategory: 'Tires',
    test: (n) =>
      /\bTIRES?\b/i.test(n) ||
      /\bTUBES?\b/i.test(n) || // safe here — CRUSH TUBE already claimed above
      /WHITEWA/i.test(n) || // stem match, not \b-bounded whole word — vendor
      /BLACKWA/i.test(n) || // feed names are inconsistently truncated mid-
                            // word ("Whitewal", "Whitewa" both seen live);
                            // shortened stem catches both, confirmed real
                            // tire rows either way
      /\bBIAS\s*TL\b/i.test(n) ||
      /\bRADIAL\s*TL\b/i.test(n) ||
      // Tire-brand names — these rows often carry no generic "tire" word
      // at all, just Brand + size + tread name (e.g. "Firestone Replica
      // 5.00 X 16 inch Indian Script"). Laken's call: brand alone is
      // sufficient signal within this category (Wheels & Tires has no
      // other product type these brands would apply to).
      /\bMETZELER\b/i.test(n) ||
      /\bFIRESTONE\b/i.test(n) ||
      /\bCOKER\b/i.test(n) ||
      /\bDUNLOP\b/i.test(n) ||
      /\bMICHELIN\b/i.test(n) ||
      /\bSHINKO\b/i.test(n) ||
      /\bAVON\b/i.test(n) ||
      // Tire-repair CONSUMABLES (used up on/in the tire) — Laken's call:
      // route to Tires. Distinct from standalone repair TOOLS (reamer/
      // plugger kits, pumps, compressors), which stay unmatched below.
      /\bPLUG\s*PACK\b/i.test(n) ||
      /\bPATCH\s*KITS?\b/i.test(n) ||
      /\bTUBELESS\s*VALVES?\b/i.test(n),
  },

  // --- Hubs & Spokes ---------------------------------------------
  {
    subcategory: 'Hubs & Spokes',
    test: (n) => /\bHUBS?\b/i.test(n) || /\bSPOKES?\b/i.test(n) || /\bSPOKE\s*NIPPLES?\b/i.test(n),
  },

  // --- Axles & Spacers ---------------------------------------------
  {
    subcategory: 'Axles & Spacers',
    test: (n) =>
      /\bAXLES?\b/i.test(n) ||
      /\bAXLE\s*SPACERS?\b/i.test(n) ||
      /\bAXLE\s*(CAPS?|NUTS?|KITS?|LOCK\s*CLIPS?)\b/i.test(n),
  },

  // --- Wheels (checked after Hubs/Axles/Bearings so a compound ---
  // --- "Front Wheel Hub Bearing Kit" lands in Bearings & Seals, ---
  // --- not here — but a bare "Front Wheel Chrome" still lands ----
  // --- correctly since it fails all rules above it) ---------------
  {
    subcategory: 'Wheels',
    test: (n) => /\bWHEELS?\b/i.test(n) || /\bWM-\d/i.test(n) || /\bRIMS?\b/i.test(n),
  },
];

function classify(name) {
  for (const rule of RULES) {
    if (rule.test(name)) return rule.subcategory;
  }
  return null; // unmatched — left NULL, not force-classified
}

async function main() {
  console.log('='.repeat(78));
  console.log(`WHEELS & TIRES — TAXONOMY CLEANUP  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log('='.repeat(78));

  // --- Step 1: subcategory renames --------------------------------
  console.log('\n--- Step 1: Subcategory renames --------------------------------------');

  for (const [oldName, newName] of Object.entries(RENAME_MAP)) {
    const count = await pool.query(
      `SELECT count(*) AS n FROM catalog_unified
       WHERE display_category = 'Wheels & Tires' AND display_subcategory = $1 AND is_active = true`,
      [oldName]
    );
    console.log(`  "${oldName}" -> "${newName}"  (${count.rows[0].n} rows)`);

    if (APPLY) {
      const result = await pool.query(
        `UPDATE catalog_unified
         SET display_subcategory = $2
         WHERE display_category = 'Wheels & Tires' AND display_subcategory = $1 AND is_active = true`,
        [oldName, newName]
      );
      console.log(`    -> applied, ${result.rowCount} rows updated`);
    }
  }

  // --- Step 2: classify NULL rows ----------------------------------
  console.log('\n--- Step 2: Classify NULL-subcategory rows ----------------------------');

  const nullRows = await pool.query(
    `SELECT id, name FROM catalog_unified
     WHERE display_category = 'Wheels & Tires' AND display_subcategory IS NULL AND is_active = true`
  );

  const tally = {};
  const updates = [];
  const unmatched = [];

  for (const row of nullRows.rows) {
    const target = classify(row.name);
    if (target) {
      tally[target] = (tally[target] ?? 0) + 1;
      updates.push({ id: row.id, target });
    } else {
      unmatched.push(row);
    }
  }

  console.log(`\nTotal NULL rows: ${nullRows.rows.length}`);
  console.log('Classification tally:');
  for (const [subcat, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${subcat.padEnd(55)} ${n}`);
  }
  console.log(`  ${'(unmatched — held back, not force-classified)'.padEnd(55)} ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nSample of unmatched rows (up to 20):');
    for (const row of unmatched.slice(0, 20)) {
      console.log(`    [${row.id}] ${row.name}`);
    }
  }

  if (APPLY) {
    console.log('\nApplying NULL-row classifications...');
    let applied = 0;
    for (const u of updates) {
      await pool.query(
        `UPDATE catalog_unified SET display_subcategory = $2 WHERE id = $1`,
        [u.id, u.target]
      );
      applied++;
    }
    console.log(`Applied: ${applied} rows classified, ${unmatched.length} left NULL.`);
  } else {
    console.log('\n(dry run — no rows written. Re-run with --apply to commit.)');
  }

  // --- Step 3: known single-row flag (informational only) ----------
  console.log('\n--- Step 3: Known flag, not auto-moved ---------------------------------');
  const tpmsCheck = await pool.query(
    `SELECT id, name, display_subcategory FROM catalog_unified WHERE id = 62782`
  );
  if (tpmsCheck.rows.length > 0) {
    console.log('  [62782] Tire Pressure and Temperature Monitor Tool — currently in:');
    console.log(`    "${tpmsCheck.rows[0].display_subcategory}"`);
    console.log('  This is a diagnostic tool, not a tire/tube part. Left in place —');
    console.log('  single row, no clear better home in this category. Flagged for');
    console.log('  Laken review, same treatment as prior sessions\' held-back items.');
  }

  console.log('\n' + '='.repeat(78));
  console.log(APPLY ? 'APPLY COMPLETE.' : 'DRY RUN COMPLETE — review tallies above, then re-run with --apply.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
