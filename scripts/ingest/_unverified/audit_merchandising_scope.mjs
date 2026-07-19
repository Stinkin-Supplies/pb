#!/usr/bin/env node
/**
 * audit_merchandising_scope.mjs
 *
 * READ-ONLY, NO WRITES. Follow-up scoping audit for the
 * "Merchandising" subcategory of "Hardware, Covers & General" —
 * the original audit_hardware_covers_general_scope.mjs used
 * DISPLAY\s*(RACK|BOARD|STAND|SHELF) / POP\s*DISPLAY / COUNTER\s*
 * DISPLAY vocabulary (retail store-fixture sense of "merchandising")
 * and got ZERO hits catalog-wide.
 *
 * Laken's correction: "Merchandising" actually means novelty/branded
 * consumer items — patches, stickers, gift boxes — mostly V-Twin
 * brand product, NOT store display fixtures. Different sense of the
 * word entirely. This audit re-scopes with the corrected vocabulary
 * before any classification rule gets written.
 *
 * Same Postgres regex convention as every other script this session:
 * plain ARE pattern strings sent directly to `~*`, boundaries as
 * (^|[\s/'-]) / ([\s/'-]|$) — NOT JS \b, NOT JS RegExp .source.
 *
 * Usage:
 *   node scripts/ingest/audit_merchandising_scope.mjs
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

const GROUPS = {
  'Patches': ["(^|[\\s/'-])PATCHES?([\\s/'-]|$)"],
  'Stickers': ["(^|[\\s/'-])STICKERS?([\\s/'-]|$)"],
  'Gift Boxes / Gift Items': [
    "(^|[\\s/'-])GIFT\\s*BOX(ES)?([\\s/'-]|$)",
    "(^|[\\s/'-])GIFT\\s*SET([\\s/'-]|$)",
    "(^|[\\s/'-])GIFT\\s*CARDS?([\\s/'-]|$)",
  ],
  'Pins / Keychains / Novelty': [
    "(^|[\\s/'-])PINS?([\\s/'-]|$)",
    "(^|[\\s/'-])KEYCHAINS?([\\s/'-]|$)",
    "(^|[\\s/'-])KEY\\s*CHAINS?([\\s/'-]|$)",
    "(^|[\\s/'-])LAPEL\\s*PINS?([\\s/'-]|$)",
  ],
  'V-Twin brand (may indicate general novelty line)': [
    "(^|[\\s/'-])V.TWIN([\\s/'-]|$)",
  ],
};

function combinedPattern(list) {
  return list.join('|');
}

async function main() {
  console.log('='.repeat(78));
  console.log('MERCHANDISING — FOLLOW-UP SCOPING AUDIT (read-only, no writes)');
  console.log('='.repeat(78));
  console.log('\nCorrected vocabulary per Laken: patches, stickers, gift boxes, novelty');
  console.log('items — mostly V-Twin brand — NOT retail display fixtures.\n');

  const groupTotals = {};

  for (const [groupName, patterns] of Object.entries(GROUPS)) {
    console.log(`\n--- ${groupName} ---`);
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

  console.log('\n--- Summary ---');
  for (const [groupName, total] of Object.entries(groupTotals)) {
    console.log(`  ${groupName.padEnd(50)} ${total}`);
  }

  console.log('\n--- Sample rows (15 each) ---');
  for (const [groupName, patterns] of Object.entries(GROUPS)) {
    const pattern = combinedPattern(patterns);
    console.log(`\n  ${groupName}`);
    const samples = await pool.query(
      `SELECT id, name, display_category, display_subcategory
       FROM catalog_unified
       WHERE is_active = true
         AND name ~* $1
       ORDER BY random()
       LIMIT 15`,
      [pattern]
    );
    for (const row of samples.rows) {
      console.log(
        `    [${row.id}] ${row.name}  (${row.display_category ?? 'NULL'} / ${row.display_subcategory ?? 'null'})`
      );
    }
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
