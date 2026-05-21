#!/usr/bin/env node
/**
 * promote_pu_fitment.cjs
 *
 * Promotes pu_fitment_expanded → catalog_fitment_v2
 *
 * Source pipeline:
 *   pu_fitment_scrape CSV → ingest_pu_fitment_scrape.cjs
 *     → pu_fitment         (13,913 SKU rows, raw)
 *     → pu_fitment_parsed  (393K rows, per-model)
 *     → pu_fitment_expanded (1.64M rows, per-model-year, has model_year_id FK)
 *
 * This script:
 *   1. Introspects pu_fitment_expanded columns (auto-detects SKU column name)
 *   2. Joins pu_fitment_expanded → catalog_unified on SKU
 *   3. Inserts (product_id, model_year_id) into catalog_fitment_v2 source='PU'
 *   4. Backfills is_harley_fitment on matched PU products
 *
 * Run:
 *   node scripts/ingest/promote_pu_fitment.cjs [--dry]
 *
 * After:
 *   node scripts/ingest/build_variant_groups.cjs
 *   [ERA BACKFILL SQL from MasterRef]
 *   node scripts/ingest/index_unified.js --recreate
 */

'use strict';
const { Pool } = require('pg');

const DRY        = process.argv.includes('--dry');
const BATCH_SIZE = 10000;

const pool = new Pool({
  host: '5.161.100.126',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: 'smelly',
  ssl: false,
  max: 3,
});

async function main() {
  const db = await pool.connect();
  try {
    console.log('=================================================');
    console.log('  promote_pu_fitment.cjs');
    console.log(DRY ? '  [DRY RUN]' : '  [LIVE]');
    console.log('=================================================\n');

    // 1. Introspect pu_fitment_expanded columns
    const { rows: cols } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pu_fitment_expanded'
      ORDER BY ordinal_position
    `);
    const colNames = cols.map(c => c.column_name);
    console.log('pu_fitment_expanded columns:', colNames.join(', '));

    const skuCol = colNames.includes('sku')         ? 'sku'
                 : colNames.includes('vendor_sku')   ? 'vendor_sku'
                 : colNames.includes('part_number')  ? 'part_number'
                 : null;
    if (!skuCol) throw new Error('Cannot find SKU column in pu_fitment_expanded. Cols: ' + colNames.join(', '));
    if (!colNames.includes('model_year_id')) throw new Error('pu_fitment_expanded has no model_year_id column. Re-run ingest_pu_fitment_scrape.cjs');

    console.log(`SKU column: ${skuCol}`);

    // 2. Row counts
    const { rows: [src] } = await db.query('SELECT COUNT(*) AS cnt FROM pu_fitment_expanded');
    console.log(`\npu_fitment_expanded:          ${parseInt(src.cnt).toLocaleString()}`);

    const { rows: [ex] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2 WHERE source = 'PU'`);
    console.log(`catalog_fitment_v2 PU (existing): ${parseInt(ex.cnt).toLocaleString()}`);

    const { rows: [tot] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2`);
    console.log(`catalog_fitment_v2 total:     ${parseInt(tot.cnt).toLocaleString()}`);

    // 3. Estimate match count
    const { rows: [mc] } = await db.query(`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT DISTINCT cu.id AS product_id, pfe.model_year_id
        FROM pu_fitment_expanded pfe
        JOIN catalog_unified cu
          ON (cu.vendor_sku = 'PU-' || UPPER(pfe.${skuCol})
           OR cu.vendor_sku = 'PU-' || pfe.${skuCol}
           OR cu.vendor_sku = pfe.${skuCol})
        WHERE cu.source_vendor = 'PU'
          AND pfe.model_year_id IS NOT NULL
      ) sub
    `);
    console.log(`\nMatchable (product_id, model_year_id) pairs: ${parseInt(mc.cnt).toLocaleString()}`);

    if (DRY) {
      console.log('\n[DRY] Would delete existing PU rows and re-insert. No changes made.');
      return;
    }

    // 4. Delete old PU rows
    console.log('\nDeleting existing PU rows...');
    const del = await db.query(`DELETE FROM catalog_fitment_v2 WHERE source = 'PU'`);
    console.log(`  Deleted: ${del.rowCount.toLocaleString()}`);

    // 5. Batch insert
    console.log('\nInserting...');
    let totalInserted = 0;
    let offset        = 0;
    let batchNum      = 0;
    const expected    = parseInt(mc.cnt);

    while (true) {
      batchNum++;
      const res = await db.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id, source)
        SELECT DISTINCT cu.id, pfe.model_year_id, 'PU'
        FROM pu_fitment_expanded pfe
        JOIN catalog_unified cu
          ON (cu.vendor_sku = 'PU-' || UPPER(pfe.${skuCol})
           OR cu.vendor_sku = 'PU-' || pfe.${skuCol}
           OR cu.vendor_sku = pfe.${skuCol})
        WHERE cu.source_vendor = 'PU'
          AND pfe.model_year_id IS NOT NULL
        ON CONFLICT (product_id, model_year_id) DO NOTHING
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `);

      if (res.rowCount === 0) break;
      totalInserted += res.rowCount;
      offset        += BATCH_SIZE;
      const pct      = expected > 0 ? Math.min(100, Math.round((totalInserted / expected) * 100)) : '?';
      process.stdout.write(`\r  Batch ${batchNum}: ${totalInserted.toLocaleString()} inserted (${pct}%)`);
      if (offset > expected * 2 + BATCH_SIZE) break; // safety
    }
    console.log();

    // 6. Final counts
    const { rows: [fp] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2 WHERE source = 'PU'`);
    const { rows: [ft] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2`);
    console.log(`\ncatalog_fitment_v2 PU after:  ${parseInt(fp.cnt).toLocaleString()}`);
    console.log(`catalog_fitment_v2 total:     ${parseInt(ft.cnt).toLocaleString()}`);

    // 7. Backfill is_harley_fitment
    console.log('\nBackfilling is_harley_fitment on matched PU products...');
    const bf = await db.query(`
      UPDATE catalog_unified cu
      SET is_harley_fitment = true
      WHERE source_vendor = 'PU'
        AND is_harley_fitment IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM catalog_fitment_v2 cfv
          WHERE cfv.product_id = cu.id AND cfv.source = 'PU'
        )
    `);
    console.log(`  Backfilled: ${bf.rowCount.toLocaleString()} products`);

    console.log(`
=================================================
  ✅ DONE
=================================================
Next steps:
  1. node scripts/ingest/build_variant_groups.cjs
  2. Run ERA BACKFILL SQL (see MasterRef ERA BACKFILL SQL section)
  3. node scripts/ingest/index_unified.js --recreate
`);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  } finally {
    db.release();
    await pool.end();
  }
}

main();
