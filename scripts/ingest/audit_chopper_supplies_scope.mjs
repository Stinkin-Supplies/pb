#!/usr/bin/env node
/**
 * audit_chopper_supplies_scope.mjs
 *
 * READ-ONLY, NO WRITES. Cross-catalog scoping audit for the new
 * "Chopper Supplies" top-level category — Laken's third and final
 * named catch-all (session 80/81), never audited before ("no audit
 * yet" per HANDOFF_LOG).
 *
 * Laken's framing (session 81): a home for BULK products — spools of
 * wire, paints — AND chopper-specific parts, all under one category
 * with subcategories. No subcategory list given yet — Laken wants to
 * see real data first before naming subcategories, same approach as
 * every prior category build.
 *
 * This audit casts a WIDE net across distinct vocabulary groups since
 * we don't yet know the real shape of what's out there. Unlike
 * Wheels & Tires (in-place rename) or Hardware/Covers (targeted
 * migration), this is pure discovery — expect to iterate the group
 * list itself after seeing what these searches turn up.
 *
 * Same Postgres regex convention as every script this session: plain
 * ARE pattern strings sent directly to `~*`, boundaries as
 * (^|[\s/'-]) / ([\s/'-]|$) — NOT JS \b, NOT JS RegExp .source.
 *
 * Usage:
 *   node scripts/ingest/audit_chopper_supplies_scope.mjs
 *
 * Outputs (stdout only, nothing written to the DB):
 *   A. Catalog-wide hits per vocabulary group, grouped by current
 *      display_category — same shape as the Hardware/Covers audit.
 *   B. Sample rows per group x source category, so Laken can eyeball
 *      real names before any subcategory list or classifier gets
 *      written.
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
// Discovery-phase vocabulary groups. Deliberately broad — this is
// the FIRST pass, expect false positives (same as Hardware/Covers'
// bare "Bolt Kit" sweep), sample review will narrow these before any
// classifier gets written.
// ---------------------------------------------------------------

const GROUPS = {
  '1. Bulk Wire / Spools': [
    "(^|[\\s/'-])SPOOLS?([\\s/'-]|$)",
    "(^|[\\s/'-])BULK\\s*WIRE([\\s/'-]|$)",
    "(^|[\\s/'-])WIRE\\s*SPOOLS?([\\s/'-]|$)",
    "(^|[\\s/'-])\\d+\\s*(FT|FOOT|FEET)\\s*(ROLL|SPOOL)([\\s/'-]|$)",
  ],
  '2. Paint / Bulk Chemicals': [
    "(^|[\\s/'-])PAINTS?([\\s/'-]|$)",
    "(^|[\\s/'-])PRIMER([\\s/'-]|$)",
    "(^|[\\s/'-])CLEAR\\s*COAT([\\s/'-]|$)",
    "(^|[\\s/'-])LACQUER([\\s/'-]|$)",
    "(^|[\\s/'-])(GALLON|QUART|PINT)([\\s/'-]|$)",
  ],
  '3. Chopper-specific parts/style': [
    "(^|[\\s/'-])CHOPPER([\\s/'-]|$)",
    "(^|[\\s/'-])HARDTAIL([\\s/'-]|$)",
    "(^|[\\s/'-])SPRINGER([\\s/'-]|$)",
    "(^|[\\s/'-])RIGID\\s*FRAME([\\s/'-]|$)",
    "(^|[\\s/'-])APE\\s*HANGERS?([\\s/'-]|$)",
    "(^|[\\s/'-])SISSY\\s*BAR([\\s/'-]|$)",
  ],
  '4. Bulk hardware / raw stock': [
    "(^|[\\s/'-])BULK\\s*PACK([\\s/'-]|$)",
    "(^|[\\s/'-])BAR\\s*STOCK([\\s/'-]|$)",
    "(^|[\\s/'-])SHEET\\s*STOCK([\\s/'-]|$)",
    "(^|[\\s/'-])ROD\\s*STOCK([\\s/'-]|$)",
    "(^|[\\s/'-])RAW\\s*MATERIAL([\\s/'-]|$)",
  ],
};

function combinedPattern(list) {
  return list.join('|');
}

async function main() {
  console.log('='.repeat(78));
  console.log('CHOPPER SUPPLIES — SCOPING AUDIT (read-only, no writes)');
  console.log('='.repeat(78));
  console.log('\nDiscovery phase — no subcategory list yet. Casting a wide net across');
  console.log('bulk wire/spools, paint/bulk chemicals, chopper-specific parts, and');
  console.log('bulk hardware/raw stock. Expect false positives at this stage.\n');

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
    console.log(`  ${groupName.padEnd(40)} ${total}`);
  }

  console.log('\n--- Sample rows (10 per grouping, per source category) -----------------');

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
  console.log('AUDIT COMPLETE — no rows modified. This is discovery-phase output —');
  console.log('review real hits/samples with Laken before proposing a subcategory');
  console.log('list or writing any classification logic.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
