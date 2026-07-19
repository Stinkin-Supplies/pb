#!/usr/bin/env node
/**
 * audit_full_catalog_health.mjs
 *
 * READ-ONLY, NO WRITES. Full catalog-wide health check across every
 * display_category — requested by Laken (session 81) to get a
 * complete picture before continuing further category work.
 *
 * Two parts:
 *   A. Health table — for every display_category: total active rows,
 *      count of NULL display_subcategory rows, % NULL, and the full
 *      subcategory breakdown. One consolidated view of the whole
 *      catalog's classification state, not just the categories
 *      touched this session.
 *   B. Straggler dump — for every category with NULL rows, up to 25
 *      sample rows (name + id) so Laken can see exactly what's sitting
 *      unclassified, category by category. Straggler = NULL
 *      display_subcategory specifically (per Laken's definition,
 *      session 81) — not the separate "held-back/flagged exception"
 *      rows from prior sessions' classifiers (those are a different,
 *      smaller list and aren't reflected here).
 *
 * This script does not classify or fix anything — it's a snapshot for
 * Laken to review and decide what to tackle next.
 *
 * Usage:
 *   node scripts/ingest/audit_full_catalog_health.mjs
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
  console.log('FULL CATALOG HEALTH CHECK (read-only, no writes)');
  console.log('='.repeat(78));

  // --- A. Per-category health table ---------------------------------
  console.log('\n--- A. Category health table ------------------------------------------');

  const categories = await pool.query(
    `SELECT display_category,
            count(*) AS total,
            count(*) FILTER (WHERE display_subcategory IS NULL) AS null_count
     FROM catalog_unified
     WHERE is_active = true
     GROUP BY display_category
     ORDER BY total DESC`
  );

  let grandTotal = 0;
  let grandNull = 0;

  console.log(
    `\n  ${'Category'.padEnd(30)} ${'Total'.padStart(8)} ${'NULL'.padStart(8)} ${'% NULL'.padStart(8)}`
  );
  console.log('  ' + '-'.repeat(58));

  for (const row of categories.rows) {
    const total = Number(row.total);
    const nullCount = Number(row.null_count);
    const pct = total > 0 ? ((nullCount / total) * 100).toFixed(1) : '0.0';
    grandTotal += total;
    grandNull += nullCount;
    console.log(
      `  ${(row.display_category ?? '(NULL category)').padEnd(30)} ${String(total).padStart(8)} ${String(
        nullCount
      ).padStart(8)} ${(pct + '%').padStart(8)}`
    );
  }

  console.log('  ' + '-'.repeat(58));
  const grandPct = grandTotal > 0 ? ((grandNull / grandTotal) * 100).toFixed(1) : '0.0';
  console.log(
    `  ${'TOTAL'.padEnd(30)} ${String(grandTotal).padStart(8)} ${String(grandNull).padStart(8)} ${(
      grandPct + '%'
    ).padStart(8)}`
  );

  // --- Subcategory breakdown per category ---------------------------
  console.log('\n--- Subcategory breakdown per category ---------------------------------');

  for (const row of categories.rows) {
    const cat = row.display_category;
    console.log(`\n  ${cat ?? '(NULL category)'}`);
    const subcats = await pool.query(
      `SELECT display_subcategory, count(*) AS n
       FROM catalog_unified
       WHERE is_active = true
         AND display_category IS NOT DISTINCT FROM $1
       GROUP BY display_subcategory
       ORDER BY n DESC`,
      [cat]
    );
    for (const sub of subcats.rows) {
      console.log(`      ${(sub.display_subcategory ?? '(NULL)').padEnd(45)} ${sub.n}`);
    }
  }

  // --- B. Straggler dump: NULL rows per category ---------------------
  console.log('\n' + '='.repeat(78));
  console.log('--- B. Straggler dump — NULL display_subcategory rows, per category ---');
  console.log('='.repeat(78));

  for (const row of categories.rows) {
    const cat = row.display_category;
    const nullCount = Number(row.null_count);
    if (nullCount === 0) continue;

    console.log(`\n  ${cat ?? '(NULL category)'} — ${nullCount} NULL rows (showing up to 25)`);
    const stragglers = await pool.query(
      `SELECT id, name
       FROM catalog_unified
       WHERE is_active = true
         AND display_category IS NOT DISTINCT FROM $1
         AND display_subcategory IS NULL
       ORDER BY random()
       LIMIT 25`,
      [cat]
    );
    for (const s of stragglers.rows) {
      console.log(`      [${s.id}] ${s.name}`);
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('HEALTH CHECK COMPLETE — no rows modified.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Health check failed:', err);
  process.exit(1);
});
