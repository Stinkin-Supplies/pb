#!/usr/bin/env node
/**
 * audit_wheels_tires_axles_scope.mjs
 *
 * READ-ONLY, NO WRITES. Cross-catalog scoping audit for the
 * "Wheels, Tires & Axles" category rebuild — run BEFORE any
 * fix_wheels_tires_axles_taxonomy.mjs classification logic is written.
 *
 * Same purpose as audit_gaskets_seals_scope.mjs (session 77) and the
 * Frames & Suspension pre-checks (session 80): find out what's
 * actually in scope before writing regex, so we don't discover a
 * "34 rows" vs "238 rows" surprise (Wheels & Tires / Bearings & Seals,
 * session 77) after the fact.
 *
 * Laken's spec, 3 groupings under Wheels, Tires & Axles:
 *   1. Wheel Components, Hubs, Bearings & Hardware
 *   2. Axles, Spacers & Accessories
 *   3. Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights
 *
 * Usage:
 *   node scripts/ingest/audit_wheels_tires_axles_scope.mjs
 *
 * Outputs (stdout only, nothing written to the DB):
 *   A. Current state of the existing `Wheels & Tires` category —
 *      row count, is it already display_category="Wheels & Tires",
 *      current subcategory breakdown, null-subcategory count.
 *   B. Overlap check against Gaskets & Seals — confirm the 34-row
 *      seal-named slice already pulled out of Bearings & Seals
 *      (session 77) so we don't try to re-claim it.
 *   C. Straggler scan — keyword hits for wheel/axle/valve-stem/
 *      wheel-weight vocabulary sitting OUTSIDE Wheels & Tires,
 *      grouped by their current display_category, so we know which
 *      other categories are actual migration sources vs noise.
 *   D. Sample rows for every straggler source category found, so
 *      Laken can eyeball before any migration script is written.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Script-location-relative, NOT cwd-relative (the cwd-dependent
// `dotenv.config({ path: ".env.local" })` pattern in
// sync_fitment_flat_columns.mjs is a known-fragile anti-pattern,
// per MasterRef Known Bugs — this resolves off __dirname instead,
// so it works regardless of where `node ...` is invoked from).
// Root .env.local AND .env both checked — dotenv.config() does not
// override a key already present in process.env, so load whichever
// should win FIRST.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

const envLocalPath = path.join(repoRoot, '.env.local');
const envPath = path.join(repoRoot, '.env');

const localResult = dotenv.config({ path: envLocalPath });
const baseResult = dotenv.config({ path: envPath });

// Confirmed working: .env.local resolves via repo-root-relative path
// regardless of invocation cwd (51 keys loaded on first successful run).
void localResult;
void baseResult;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error(
    'CATALOG_DATABASE_URL not found in process.env after loading ' +
      `${repoRoot}/.env.local and ${repoRoot}/.env — check the var name/path.`
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

// ---------------------------------------------------------------
// Keyword groups mirroring Laken's 3-part spec. Bare words are
// word-bounded with \b (NOT \y — that's Postgres word-boundary
// syntax and is silently ignored inside a JS RegExp; this exact
// bug caused Dashes & Gauges' round-1 33.5% coverage, session 80).
// ---------------------------------------------------------------

const GROUP_1_WHEEL_HUB_BEARING = [
  /\bWHEEL\b/i,
  /\bHUB\b/i,
  /\bBEARING\b/i,
  /\bSPOKE\b/i,
  /\bRIM\b/i,
  /\bWHEEL\s*BOLT/i,
  /\bLUG\s*NUT/i,
  /\bWHEEL\s*STUD/i,
  /\bBRAKE\s*DRUM/i, // present in some wheel/hub bundles — flagged for review, not assumed
];

const GROUP_2_AXLE = [
  /\bAXLE\b/i,
  /\bAXLE\s*SPACER/i,
  /\bAXLE\s*NUT/i,
  /\bAXLE\s*COVER/i,
  /\bAXLE\s*ADJUSTER/i,
  /\bAXLE\s*BLOCK/i,
];

const GROUP_3_VALVE_WEIGHT = [
  /\bRIM\s*STRIP/i,
  /\bVALVE\s*STEM/i,
  /\bVALVE\s*STEM\s*CAP/i,
  /\bWHEEL\s*WEIGHT/i,
  /\bTIRE\s*VALVE/i,
];

const ALL_GROUPS = {
  'Group 1 — Wheel Components, Hubs, Bearings & Hardware': GROUP_1_WHEEL_HUB_BEARING,
  'Group 2 — Axles, Spacers & Accessories': GROUP_2_AXLE,
  'Group 3 — Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights': GROUP_3_VALVE_WEIGHT,
};

// Cross-system exclusion nouns — same pattern as Frames & Suspension
// (session 80): bare WHEEL/BEARING/RIM will false-positive against
// unrelated systems. Flag, don't auto-exclude yet — this audit is
// read-only, exclusions get decided when the real classifier is written.
const OTHER_SYSTEM_HINTS = [
  /\bBRAKE\b/i,
  /\bROTOR\b/i,
  /\bCALIPER\b/i,
  /\bENGINE\b/i,
  /\bCAM\b/i,
  /\bSPROCKET\b/i,
  /\bBELT\b/i,
  /\bCHAIN\b/i,
  /\bTRANSMISSION\b/i,
  /\bCLUTCH\b/i,
  /\bSTEERING\s*HEAD\s*BEARING/i, // steering-head bearings live in Frames & Suspension, not Wheels
  /\bGASKET\b/i,
  /\bSEAL\b/i, // Gaskets & Seals already claimed the seal-named slice of Bearings & Seals, session 77
];

function combinedRegex(list) {
  return new RegExp(list.map((r) => r.source).join('|'), 'i');
}

async function main() {
  console.log('='.repeat(78));
  console.log('WHEELS, TIRES & AXLES — SCOPING AUDIT (read-only, no writes)');
  console.log('='.repeat(78));

  // --- A. Existing Wheels & Tires category state -----------------
  console.log('\n--- A. Current state of `Wheels & Tires` -----------------------------');

  const catState = await pool.query(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE display_subcategory IS NULL) AS null_subcat
     FROM catalog_unified
     WHERE display_category = 'Wheels & Tires'
       AND is_active = true`
  );
  console.log(catState.rows[0]);

  const subcatBreakdown = await pool.query(
    `SELECT display_subcategory, count(*) AS n
     FROM catalog_unified
     WHERE display_category = 'Wheels & Tires'
       AND is_active = true
     GROUP BY display_subcategory
     ORDER BY n DESC`
  );
  console.log('\nSubcategory breakdown:');
  for (const row of subcatBreakdown.rows) {
    console.log(`  ${(row.display_subcategory ?? '(NULL)').padEnd(30)} ${row.n}`);
  }

  // --- B. Gaskets & Seals overlap check ---------------------------
  console.log('\n--- B. Overlap check vs Gaskets & Seals (session 77 migration) -------');

  const bearingsSealsNow = await pool.query(
    `SELECT count(*) AS n
     FROM catalog_unified
     WHERE display_category = 'Wheels & Tires'
       AND display_subcategory = 'Bearings & Seals'
       AND is_active = true`
  );
  console.log(
    `Wheels & Tires / Bearings & Seals remaining (post Gaskets & Seals pull): ${bearingsSealsNow.rows[0].n} rows`
  );
  console.log('(Session 77 pulled ~34 seal-named rows out of this 238-row subcategory —');
  console.log(' this number should be roughly 238 minus that slice. If it is still ~238,');
  console.log(' the session-77 migration did not actually touch Wheels & Tires and this');
  console.log(' subcategory is fully in scope for bearings. Verify before assuming either way.)');

  // --- C. Straggler scan across ALL categories --------------------
  console.log('\n--- C. Straggler scan — wheel/axle/valve-stem vocabulary OUTSIDE Wheels & Tires ---');

  for (const [groupName, patterns] of Object.entries(ALL_GROUPS)) {
    console.log(`\n${groupName}`);
    const rx = combinedRegex(patterns);

    const result = await pool.query(
      `SELECT display_category, count(*) AS n
       FROM catalog_unified
       WHERE is_active = true
         AND display_category IS DISTINCT FROM 'Wheels & Tires'
         AND name ~* $1
       GROUP BY display_category
       ORDER BY n DESC`,
      [rx.source]
    );

    if (result.rows.length === 0) {
      console.log('  (no stragglers found outside Wheels & Tires)');
    } else {
      for (const row of result.rows) {
        console.log(`  ${(row.display_category ?? '(NULL category)').padEnd(28)} ${row.n}`);
      }
    }
  }

  // --- D. Cross-system hint check on IN-SCOPE Wheels & Tires rows ---
  console.log('\n--- D. Cross-system false-positive risk WITHIN Wheels & Tires ---------');
  console.log('(rows already in Wheels & Tires that also mention another system —');
  console.log(' same shape as the Frame & Hardware fastener-bin problem, session 80.');
  console.log(' Not excluded here, just surfaced for review.)');

  const hintRx = combinedRegex(OTHER_SYSTEM_HINTS);
  const crossSystemInScope = await pool.query(
    `SELECT display_subcategory, count(*) AS n
     FROM catalog_unified
     WHERE display_category = 'Wheels & Tires'
       AND is_active = true
       AND name ~* $1
     GROUP BY display_subcategory
     ORDER BY n DESC`,
    [hintRx.source]
  );
  for (const row of crossSystemInScope.rows) {
    console.log(`  ${(row.display_subcategory ?? '(NULL)').padEnd(30)} ${row.n}`);
  }

  // --- E. Sample rows for every straggler source found -------------
  console.log('\n--- E. Sample rows (10 per group, per source category) ----------------');

  for (const [groupName, patterns] of Object.entries(ALL_GROUPS)) {
    const rx = combinedRegex(patterns);
    const sources = await pool.query(
      `SELECT DISTINCT display_category
       FROM catalog_unified
       WHERE is_active = true
         AND display_category IS DISTINCT FROM 'Wheels & Tires'
         AND name ~* $1`,
      [rx.source]
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
        [rx.source, src.display_category]
      );
      for (const row of samples.rows) {
        console.log(`    [${row.id}] ${row.name}  (${row.display_subcategory ?? 'null'})`);
      }
    }
  }

  // --- F. Sample rows per EXISTING subcategory, including NULL -----
  console.log('\n--- F. Sample rows per existing subcategory (15 each, for classifier drafting) ---');

  const existingSubcats = await pool.query(
    `SELECT DISTINCT display_subcategory
     FROM catalog_unified
     WHERE display_category = 'Wheels & Tires'
       AND is_active = true`
  );

  for (const row of existingSubcats.rows) {
    const subcat = row.display_subcategory;
    console.log(`\n  Subcategory: ${subcat ?? '(NULL)'}`);
    const samples = await pool.query(
      subcat === null
        ? `SELECT id, name FROM catalog_unified
           WHERE display_category = 'Wheels & Tires' AND is_active = true
             AND display_subcategory IS NULL
           ORDER BY random() LIMIT 15`
        : `SELECT id, name FROM catalog_unified
           WHERE display_category = 'Wheels & Tires' AND is_active = true
             AND display_subcategory = $1
           ORDER BY random() LIMIT 15`,
      subcat === null ? [] : [subcat]
    );
    for (const r of samples.rows) {
      console.log(`    [${r.id}] ${r.name}`);
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('AUDIT COMPLETE — no rows modified. Review output before writing');
  console.log('fix_wheels_tires_axles_taxonomy.mjs classification logic.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
