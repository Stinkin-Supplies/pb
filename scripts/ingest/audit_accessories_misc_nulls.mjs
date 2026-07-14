#!/usr/bin/env node
/**
 * audit_accessories_misc_nulls.mjs
 *
 * READ-ONLY, NO WRITES. Discovery audit for the "Accessories & Misc"
 * category's 3,203 NULL-subcategory rows (80.6% of the category) —
 * the single largest classification gap in the catalog per the
 * session-81 full health check.
 *
 * This is a DISCOVERY pass, not a fix. Goal: understand the actual
 * shape of what's in this bucket before proposing any subcategory
 * structure or classifier — same "audit first" discipline as every
 * prior category build. Early signals from the health-check sample
 * suggest this NULL set is a genuine mixed bag:
 *   - generic hardware (bolts, washers, screws, cotter pins)
 *   - misc wheel/hub parts ("Spool Wheel")
 *   - branded merch/apparel (Oilzum T-Shirt)
 *   - genuine "doesn't fit anywhere else" accessories
 *
 * This script does NOT propose a fix. It profiles the NULL rows by:
 *   A. Common leading words / patterns (rough term frequency on the
 *      first 1-2 words of each name) to spot natural clusters.
 *   B. Hits against vocabulary already known to belong elsewhere
 *      (hardware/fastener terms, apparel terms, wheel/hub terms) so
 *      we can see how much of the 3,203 might already be coverable
 *      by extending existing classifiers (Hardware Covers & General,
 *      Wheels & Tires, Riding Gear & Apparel) vs. genuinely novel.
 *   C. Random raw sample (40 rows) for open-ended manual review.
 *
 * Usage:
 *   node scripts/ingest/audit_accessories_misc_nulls.mjs
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

// Vocabulary groups to check coverage against — NOT a classifier,
// just measuring how much of the NULL set might already be reachable
// by extending scripts we've already built this session.
const KNOWN_ELSEWHERE_GROUPS = {
  'Hardware/fastener terms (possible Hardware, Covers & General overlap)': [
    "(^|[\\s/'-])BOLTS?([\\s/'-]|$)",
    "(^|[\\s/'-])SCREWS?([\\s/'-]|$)",
    "(^|[\\s/'-])WASHERS?([\\s/'-]|$)",
    "(^|[\\s/'-])COTTER\\s*PINS?([\\s/'-]|$)",
    "(^|[\\s/'-])NUTS?([\\s/'-]|$)",
    "(^|[\\s/'-])RIVETS?([\\s/'-]|$)",
  ],
  'Wheel/hub terms (possible Wheels & Tires overlap)': [
    "(^|[\\s/'-])WHEELS?([\\s/'-]|$)",
    "(^|[\\s/'-])SPOOL([\\s/'-]|$)",
    "(^|[\\s/'-])HUBS?([\\s/'-]|$)",
    "(^|[\\s/'-])AXLES?([\\s/'-]|$)",
  ],
  'Apparel/wearable terms (possible Riding Gear & Apparel overlap)': [
    "(^|[\\s/'-])T.SHIRTS?([\\s/'-]|$)",
    "(^|[\\s/'-])HOODIE([\\s/'-]|$)",
    "(^|[\\s/'-])BEANIE([\\s/'-]|$)",
    "(^|[\\s/'-])HAT([\\s/'-]|$)",
  ],
  'Electronics/mount terms (existing subcategory already handles some)': [
    "(^|[\\s/'-])MOUNT([\\s/'-]|$)",
    "(^|[\\s/'-])PHONE([\\s/'-]|$)",
    "(^|[\\s/'-])GPS([\\s/'-]|$)",
  ],
};

function combinedPattern(list) {
  return list.join('|');
}

async function main() {
  console.log('='.repeat(78));
  console.log('ACCESSORIES & MISC — NULL DISCOVERY AUDIT (read-only, no writes)');
  console.log('='.repeat(78));

  // --- A. Leading-word frequency (rough clustering) -----------------
  console.log('\n--- A. Most common first word (rough clustering signal) ---------------');

  const firstWordFreq = await pool.query(
    `SELECT split_part(trim(name), ' ', 1) AS first_word, count(*) AS n
     FROM catalog_unified
     WHERE display_category = 'Accessories & Misc'
       AND display_subcategory IS NULL
       AND is_active = true
     GROUP BY first_word
     ORDER BY n DESC
     LIMIT 40`
  );
  for (const row of firstWordFreq.rows) {
    console.log(`  ${row.first_word.padEnd(30)} ${row.n}`);
  }

  // --- B. Coverage check against known-elsewhere vocabulary ---------
  console.log('\n--- B. Coverage vs. vocabulary already used in other categories --------');

  const groupTotals = {};
  for (const [groupName, patterns] of Object.entries(KNOWN_ELSEWHERE_GROUPS)) {
    const pattern = combinedPattern(patterns);
    const result = await pool.query(
      `SELECT count(*) AS n
       FROM catalog_unified
       WHERE display_category = 'Accessories & Misc'
         AND display_subcategory IS NULL
         AND is_active = true
         AND name ~* $1`,
      [pattern]
    );
    groupTotals[groupName] = Number(result.rows[0].n);
  }

  for (const [groupName, total] of Object.entries(groupTotals)) {
    console.log(`  ${groupName.padEnd(65)} ${total}`);
  }

  const totalNull = await pool.query(
    `SELECT count(*) AS n FROM catalog_unified
     WHERE display_category = 'Accessories & Misc' AND display_subcategory IS NULL AND is_active = true`
  );
  console.log(`\n  Total NULL rows in Accessories & Misc: ${totalNull.rows[0].n}`);

  // --- C. Random raw sample for open-ended review --------------------
  console.log('\n--- C. Random raw sample (40 rows, unfiltered) --------------------------');

  const rawSample = await pool.query(
    `SELECT id, name
     FROM catalog_unified
     WHERE display_category = 'Accessories & Misc'
       AND display_subcategory IS NULL
       AND is_active = true
     ORDER BY random()
     LIMIT 40`
  );
  for (const row of rawSample.rows) {
    console.log(`    [${row.id}] ${row.name}`);
  }

  console.log('\n' + '='.repeat(78));
  console.log('AUDIT COMPLETE — no rows modified. This is discovery-phase output —');
  console.log('review clustering/samples with Laken before proposing a subcategory');
  console.log('structure or writing any classification logic.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
