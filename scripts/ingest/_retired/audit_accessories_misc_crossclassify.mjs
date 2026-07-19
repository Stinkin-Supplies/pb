#!/usr/bin/env node
/**
 * audit_accessories_misc_crossclassify.mjs
 *
 * READ-ONLY, NO WRITES. Two purposes:
 *
 *   A. Resolve the "Spool" ambiguity specifically for Accessories &
 *      Misc's NULL rows. The Chopper Supplies audit (this session)
 *      found "Spool" mostly meant spool-HUB wheels (dirt-track style,
 *      no brake rotor) catalog-wide. Laken flagged that within THIS
 *      specific bucket, "Spool" might actually mean wire spools
 *      instead — real samples needed before assuming either way.
 *
 *   B. Dry-run (no writes) the three classifiers already built and
 *      tested this session — Hardware/Covers Bolt Kits, Wheels &
 *      Tires vocabulary, Merchandising — against Accessories & Misc's
 *      3,203 NULL rows, to see how many are already coverable by
 *      extending existing, proven logic vs. needing something new.
 *
 * This script does NOT write anything. It's a decision aid: results
 * tell us whether "extend existing classifiers" (Laken's approved
 * plan) is enough, or whether a new classifier is still needed for
 * the remainder.
 *
 * Usage:
 *   node scripts/ingest/audit_accessories_misc_crossclassify.mjs
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

async function main() {
  console.log('='.repeat(78));
  console.log('ACCESSORIES & MISC — SPOOL CHECK + CROSS-CLASSIFY DRY RUN');
  console.log('='.repeat(78));

  // --- A. Every "Spool" row in this NULL bucket, full names ----------
  console.log('\n--- A. ALL "Spool" rows in Accessories & Misc NULL bucket --------------');

  const spoolRows = await pool.query(
    `SELECT id, name
     FROM catalog_unified
     WHERE display_category = 'Accessories & Misc'
       AND display_subcategory IS NULL
       AND is_active = true
       AND name ~* $1
     ORDER BY name`,
    ["(^|[\\s/'-])SPOOLS?([\\s/'-]|$)"]
  );

  console.log(`  Total "Spool" rows: ${spoolRows.rows.length}\n`);
  for (const row of spoolRows.rows) {
    console.log(`    [${row.id}] ${row.name}`);
  }

  // --- B. Cross-classify dry run against existing session classifiers --
  console.log('\n' + '='.repeat(78));
  console.log('--- B. Cross-classify dry run (Hardware/Covers, Wheels & Tires,---------');
  console.log('---    Merchandising vocabulary) against the FULL NULL bucket ----------');
  console.log('='.repeat(78));

  // Simplified versions of the confirmed, tested rules from this
  // session's classifiers — same boundary convention throughout.
  const HARDWARE_GENERIC = [
    "(^|[\\s/'-])BOLT\\s*KITS?([\\s/'-]|$)",
    "(^|[\\s/'-])HARDWARE\\s*(ASSORTMENTS?|KITS?)([\\s/'-]|$)",
    "(^|[\\s/'-])HEX\\s*CAP\\s*BOLTS?([\\s/'-]|$)",
    "(^|[\\s/'-])ALLEN\\s*SOCKET\\s*CAP\\s*BOLTS?([\\s/'-]|$)",
    "(^|[\\s/'-])(FLAT|LOCK)\\s*WASHERS?([\\s/'-]|$)",
    "(^|[\\s/'-])COTTER\\s*PINS?([\\s/'-]|$)",
    "(^|[\\s/'-])ROUND\\s*HEAD\\s*SCREWS?([\\s/'-]|$)",
    "(^|[\\s/'-])RIVETS?([\\s/'-]|$)",
  ];

  const WHEELS_TIRES = [
    "(^|[\\s/'-])WHEELS?([\\s/'-]|$)",
    "(^|[\\s/'-])HUBS?([\\s/'-]|$)",
    "(^|[\\s/'-])AXLES?([\\s/'-]|$)",
    "(^|[\\s/'-])RIMS?([\\s/'-]|$)",
  ];

  const MERCHANDISING = [
    "(^|[\\s/'-])PATCHES?([\\s/'-]|$)",
    "(^|[\\s/'-])T.SHIRTS?([\\s/'-]|$)",
    "(^|[\\s/'-])STICKERS?([\\s/'-]|$)",
    "(^|[\\s/'-])GIFT\\s*SET([\\s/'-]|$)",
    "(^|[\\s/'-])KEYCHAINS?([\\s/'-]|$)",
  ];

  const groups = {
    'Hardware/Covers (generic hardware vocabulary)': HARDWARE_GENERIC,
    'Wheels & Tires vocabulary': WHEELS_TIRES,
    'Merchandising vocabulary': MERCHANDISING,
  };

  let totalMatched = 0;
  const matchedIds = new Set();

  for (const [groupName, patterns] of Object.entries(groups)) {
    const pattern = patterns.join('|');
    const result = await pool.query(
      `SELECT id FROM catalog_unified
       WHERE display_category = 'Accessories & Misc'
         AND display_subcategory IS NULL
         AND is_active = true
         AND name ~* $1`,
      [pattern]
    );
    console.log(`\n  ${groupName}: ${result.rows.length} rows`);
    for (const row of result.rows) matchedIds.add(row.id);
  }

  totalMatched = matchedIds.size;

  const totalNull = await pool.query(
    `SELECT count(*) AS n FROM catalog_unified
     WHERE display_category = 'Accessories & Misc' AND display_subcategory IS NULL AND is_active = true`
  );

  console.log(`\n--- Summary ---`);
  console.log(`  Total NULL rows: ${totalNull.rows[0].n}`);
  console.log(`  Matched by at least one existing-classifier vocabulary: ${totalMatched}`);
  console.log(`  Remaining (would need new classification logic): ${totalNull.rows[0].n - totalMatched}`);

  console.log('\n--- Sample of UNMATCHED rows (would need new logic) — 25 rows ----------');
  const allPatterns = [...HARDWARE_GENERIC, ...WHEELS_TIRES, ...MERCHANDISING].join('|');
  const unmatched = await pool.query(
    `SELECT id, name FROM catalog_unified
     WHERE display_category = 'Accessories & Misc'
       AND display_subcategory IS NULL
       AND is_active = true
       AND name !~* $1
     ORDER BY random()
     LIMIT 25`,
    [allPatterns]
  );
  for (const row of unmatched.rows) {
    console.log(`    [${row.id}] ${row.name}`);
  }

  console.log('\n' + '='.repeat(78));
  console.log('AUDIT COMPLETE — no rows modified.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
