#!/usr/bin/env node
/**
 * delete_impossible_future_model_years.mjs
 *
 * Deletes harley_model_years rows for year >= 2027 (impossible — no Harley
 * model year can exist 4+ years ahead of today) and the catalog_fitment_v2
 * rows that reference them, then re-syncs catalog_unified's flat fitment
 * columns for the affected products (their fitment_year_end / etc. likely
 * currently show 2030, which needs correcting).
 *
 * Scope, confirmed via investigation: exactly 14 model codes have ANY
 * year >= 2027 row (FL, FLI, FLST, FLT, FXSB, FX, FLHXXX, XLH, XLS, XLC,
 * FLHTC, FLH, FLTRX, FLTRS) — 56 harley_model_years rows total, 3,536
 * catalog_fitment_v2 rows, 778 distinct products.
 *
 * NOTE: this does NOT address the separate, deeper question of whether
 * some of these same codes' 2024-2026 data is also artificially flat
 * (carry-forward placeholder rather than real data) — that needs manual
 * domain review per model code, not an automated year cutoff, since 2024-
 * 2026 are legitimately possible years for real production models.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node scripts/ingest/delete_impossible_future_model_years.mjs
 *   node scripts/ingest/delete_impossible_future_model_years.mjs --apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local/.env at the project root.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? 'MODE: APPLY (will delete)' : 'MODE: DRY RUN (no writes)');

    const { rows: yearRows } = await client.query(`
      SELECT hmy.id AS model_year_id, hmy.year, hm.model_code
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
      WHERE hmy.year >= 2027
      ORDER BY hm.model_code, hmy.year;
    `);
    console.log(`\nFound ${yearRows.length} harley_model_years rows with year >= 2027:`);
    for (const r of yearRows) console.log(`  ${r.model_code.padEnd(10)} ${r.year} (model_year_id=${r.model_year_id})`);

    const modelYearIds = yearRows.map((r) => r.model_year_id);

    const { rows: fitmentPreview } = await client.query(`
      SELECT count(*) AS fitment_rows, count(DISTINCT product_id) AS distinct_products
      FROM catalog_fitment_v2
      WHERE model_year_id = ANY($1::int[]);
    `, [modelYearIds]);
    console.log(`\ncatalog_fitment_v2: ${fitmentPreview[0].fitment_rows} rows across ${fitmentPreview[0].distinct_products} distinct products will lose this fitment association.`);

    // Grab the affected product_ids now, before deletion, so we can re-sync
    // their flat columns afterward regardless of dry-run/apply.
    const { rows: affectedProducts } = await client.query(`
      SELECT DISTINCT product_id FROM catalog_fitment_v2 WHERE model_year_id = ANY($1::int[]);
    `, [modelYearIds]);

    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `impossible_future_years_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const csvLines = ['model_year_id,model_code,year'];
    for (const r of yearRows) csvLines.push(`${r.model_year_id},${r.model_code},${r.year}`);
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`\nWritten: ${csvPath}`);

    const productIdsPath = path.join(outDir, `impossible_future_years_affected_products_${ts}.csv`);
    fs.writeFileSync(productIdsPath, ['product_id', ...affectedProducts.map((r) => r.product_id)].join('\n'));
    console.log(`Written: ${productIdsPath} (${affectedProducts.length} products — feed these into sync_fitment_flat_columns.mjs's scope if you want to verify just these afterward)`);

    if (!APPLY) {
      console.log('\nDry run only — no rows deleted. Review the CSV, then re-run with --apply.');
      return;
    }

    console.log('\nDeleting...');
    await client.query('BEGIN');
    const fitmentDel = await client.query(
      `DELETE FROM catalog_fitment_v2 WHERE model_year_id = ANY($1::int[])`,
      [modelYearIds]
    );
    const yearsDel = await client.query(
      `DELETE FROM harley_model_years WHERE id = ANY($1::int[])`,
      [modelYearIds]
    );
    await client.query('COMMIT');
    console.log(`✅ Deleted ${fitmentDel.rowCount} catalog_fitment_v2 rows and ${yearsDel.rowCount} harley_model_years rows.`);
    console.log('\nNext steps:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs --apply');
    console.log('     (the affected products\' flat columns currently show fitment_year_end=2030 — this corrects them)');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
    console.log('     (reindex, since real product fitment data changed)');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
