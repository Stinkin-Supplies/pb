#!/usr/bin/env node
/**
 * audit_suspension_nulls_scope.mjs
 *
 * Suspension's NULL-subcategory rows were only 27% classified by the
 * five-category subcat pass (fix_five_category_subcat_pass.mjs), which
 * borrowed vocabulary built for the Accessories & Misc move. The
 * remaining ~73 rows are a real vocabulary gap, not stragglers.
 *
 * KEY QUESTION this audit answers first: a lot of the unmatched sample
 * (Bishop forks, Dominator tree sets, cartridge kits, air pumps) looks
 * like it might belong in the FRAMES & SUSPENSION category (the new
 * top-level category built earlier this project — Forks, Rear Shocks &
 * Lowering Kits, Triple Trees & Covers subcats already exist there),
 * not in the legacy `Suspension` category at all. This audit checks
 * that hypothesis against existing Frames & Suspension subcategory
 * vocabulary before writing any classification rules.
 *
 * Read-only. No writes.
 *
 * Usage: node audit_suspension_nulls_scope.mjs
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

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  console.log('='.repeat(78));
  console.log('SUSPENSION NULL-SUBCATEGORY SCOPE AUDIT');
  console.log('='.repeat(78));

  // 1. Baseline: what's left in Suspension with NULL subcategory now
  const nullRowsRes = await pool.query(
    `SELECT id, sku, name FROM catalog_unified
     WHERE display_category = 'Suspension' AND display_subcategory IS NULL AND is_active = true
     ORDER BY name`
  );
  const nullRows = nullRowsRes.rows;
  console.log(`\nSuspension NULL-subcategory rows remaining: ${nullRows.length}\n`);

  // 2. Check Frames & Suspension's existing subcategories for reference vocabulary
  const fsSubcatsRes = await pool.query(
    `SELECT display_subcategory, COUNT(*) FROM catalog_unified
     WHERE display_category = 'Frames & Suspension' AND is_active = true
     GROUP BY display_subcategory ORDER BY COUNT(*) DESC`
  );
  console.log('Frames & Suspension existing subcategories (for cross-reference):');
  for (const r of fsSubcatsRes.rows) {
    console.log(`    ${String(r.display_subcategory).padEnd(35)} ${r.count}`);
  }

  // 3. Candidate vocabulary groups — tallied, not yet applied anywhere.
  const CANDIDATE_GROUPS = [
    { label: 'Fork/Tree/Triple Tree hardware', pattern: `(TREE|FORK|TRIPLE)` },
    { label: 'Cartridge/Emulator kits', pattern: `(CARTRIDGE|EMULATOR|GOLD VALVE)` },
    { label: 'Shock/Air ride', pattern: `(SHOCK|AIR RIDE|AIR PUMP)` },
    { label: 'Shifter Fork (transmission, NOT suspension fork)', pattern: `(SHIFTER FORK)` },
    { label: 'Spring (bare, ambiguous)', pattern: `(SPRING)` },
    { label: 'Brake-related (should be wrong-category)', pattern: `(BRAKE|CALIPER)` },
    { label: 'Clutch-related (should be wrong-category)', pattern: `(CLUTCH)` },
  ];

  console.log('\n' + '-'.repeat(78));
  console.log('Candidate vocabulary tally against remaining NULL rows:');
  console.log('-'.repeat(78));
  for (const g of CANDIDATE_GROUPS) {
    const re = new RegExp(g.pattern, 'i');
    const matches = nullRows.filter(r => re.test(r.name));
    console.log(`\n  ${g.label}: ${matches.length}`);
    for (const m of matches.slice(0, 8)) {
      console.log(`      [${m.id}] ${m.name}`);
    }
  }

  // 4. Full remaining list for manual review
  console.log('\n' + '='.repeat(78));
  console.log('FULL REMAINING LIST (for manual review):');
  console.log('='.repeat(78));
  for (const r of nullRows) {
    console.log(`    [${r.id}] ${r.name}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
