#!/usr/bin/env node
/**
 * promote_pu_fitment.cjs
 * pu_fitment_expanded → catalog_fitment_v2
 *
 * harley_model_years: id, model_id, year
 * harley_models:      id, model_code (assumed)
 * Join path: pfe.model_code → harley_models.model_code → harley_model_years.model_id
 */
'use strict';
const { Pool } = require('pg');

const DRY        = process.argv.includes('--dry');
const BATCH_SIZE = 10_000;

const pool = new Pool({
  host: '5.161.100.126', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
  ssl: false, max: 3,
});

async function main() {
  const db = await pool.connect();
  try {
    console.log('=================================================');
    console.log('  promote_pu_fitment.cjs');
    console.log(DRY ? '  [DRY RUN]' : '  [LIVE]');
    console.log('=================================================\n');

    // ── Introspect pu_fitment_expanded
    const { rows: colRows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pu_fitment_expanded' ORDER BY ordinal_position
    `);
    const cols = colRows.map(r => r.column_name);
    console.log('pu_fitment_expanded columns:', cols.join(', '));

    const skuCol = ['sku','vendor_sku','part_number','part_no'].find(c => cols.includes(c));
    if (!skuCol)               throw new Error('Cannot find SKU column. Cols: ' + cols.join(', '));
    if (!cols.includes('year'))        throw new Error("Need 'year' column");
    if (!cols.includes('model_code'))  throw new Error("Need 'model_code' column");

    // ── Verify harley_models has model_code
    const { rows: hmCols } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'harley_models' ORDER BY ordinal_position
    `);
    const hmColNames = hmCols.map(r => r.column_name);
    console.log('harley_models columns:', hmColNames.join(', '));

    const modelJoinCol = ['model_code','code','slug','name'].find(c => hmColNames.includes(c));
    if (!modelJoinCol) throw new Error('Cannot find join column on harley_models. Cols: ' + hmColNames.join(', '));
    console.log(`✅ Join path: pfe.model_code → harley_models.${modelJoinCol} → harley_model_years.model_id\n`);

    // ── Row counts
    const { rows: [src] } = await db.query('SELECT COUNT(*) AS cnt FROM pu_fitment_expanded');
    const { rows: [tot] } = await db.query('SELECT COUNT(*) AS cnt FROM catalog_fitment_v2');
    console.log(`pu_fitment_expanded rows:       ${parseInt(src.cnt).toLocaleString()}`);
    console.log(`catalog_fitment_v2 total (now): ${parseInt(tot.cnt).toLocaleString()}`);

    // ── Estimate matchable pairs
    const { rows: [mc] } = await db.query(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT DISTINCT cu.id AS product_id, hmy.id AS model_year_id
        FROM pu_fitment_expanded pfe
        JOIN harley_models hm  ON hm.${modelJoinCol} = pfe.model_code
        JOIN harley_model_years hmy ON hmy.model_id = hm.id AND hmy.year = pfe.year::int
        JOIN catalog_unified cu
          ON replace(cu.sku, '-', '') = replace(pfe.${skuCol}, '-', '')
         AND cu.source_vendor = 'PU'
      ) sub
    `);
    const matchable = parseInt(mc.cnt);
    console.log(`\nMatchable (product_id, model_year_id) pairs: ${matchable.toLocaleString()}`);

    // ── Sample
    const { rows: sample } = await db.query(`
      SELECT pfe.${skuCol} AS sku, pfe.year, pfe.model_code,
             hm.id AS model_id, hmy.id AS model_year_id, cu.id AS product_id
      FROM pu_fitment_expanded pfe
      JOIN harley_models hm  ON hm.${modelJoinCol} = pfe.model_code
      JOIN harley_model_years hmy ON hmy.model_id = hm.id AND hmy.year = pfe.year::int
      JOIN catalog_unified cu
        ON replace(cu.sku, '-', '') = replace(pfe.${skuCol}, '-', '')
       AND cu.source_vendor = 'PU'
      LIMIT 5
    `);
    console.log('\nSample matched rows:');
    sample.forEach(r => console.log(' ', JSON.stringify(r)));

    if (DRY) {
      console.log('\n[DRY RUN] No changes made. Re-run without --dry to promote.');
      return;
    }
    if (matchable === 0) {
      console.error('\n❌ 0 matchable pairs — aborting. Check sample output above.');
      process.exit(1);
    }

    // ── Delete existing PU fitment rows
    console.log('\nDeleting existing PU fitment rows...');
    const { rowCount: delCount } = await db.query(`
      DELETE FROM catalog_fitment_v2
      WHERE product_id IN (SELECT id FROM catalog_unified WHERE source_vendor = 'PU')
    `);
    console.log(`  Deleted: ${delCount.toLocaleString()}`);

    // ── Build temp table
    console.log('Building temp table...');
    await db.query(`
      CREATE TEMP TABLE _pu_promote AS
      SELECT DISTINCT cu.id AS product_id, hmy.id AS model_year_id
      FROM pu_fitment_expanded pfe
      JOIN harley_models hm  ON hm.${modelJoinCol} = pfe.model_code
      JOIN harley_model_years hmy ON hmy.model_id = hm.id AND hmy.year = pfe.year::int
      JOIN catalog_unified cu
        ON replace(cu.sku, '-', '') = replace(pfe.${skuCol}, '-', '')
       AND cu.source_vendor = 'PU'
    `);
    const { rows: [tmpCnt] } = await db.query('SELECT COUNT(*) AS cnt FROM _pu_promote');
    const total = parseInt(tmpCnt.cnt);
    console.log(`  ${total.toLocaleString()} pairs ready`);

    // ── Batch insert
    console.log('Inserting in batches...');
    let inserted = 0, offset = 0, batch = 0;
    while (offset < total) {
      batch++;
      const { rowCount } = await db.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
        SELECT product_id, model_year_id FROM _pu_promote
        ORDER BY product_id, model_year_id
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
        ON CONFLICT DO NOTHING
      `);
      inserted += rowCount;
      offset   += BATCH_SIZE;
      const pct = Math.min(100, Math.round((offset / total) * 100));
      process.stdout.write(`\r  Batch ${batch}: ${inserted.toLocaleString()} inserted (${pct}%)`);
    }
    console.log();

    // ── Final counts
    const { rows: [fp] } = await db.query(`
      SELECT COUNT(*) AS cnt FROM catalog_fitment_v2
      WHERE product_id IN (SELECT id FROM catalog_unified WHERE source_vendor = 'PU')
    `);
    const { rows: [ft] } = await db.query('SELECT COUNT(*) AS cnt FROM catalog_fitment_v2');
    console.log(`\ncatalog_fitment_v2 PU after:  ${parseInt(fp.cnt).toLocaleString()}`);
    console.log(`catalog_fitment_v2 total:     ${parseInt(ft.cnt).toLocaleString()}`);

    // ── Backfill is_harley_fitment
    console.log('\nBackfilling is_harley_fitment...');
    const { rowCount: bf } = await db.query(`
      UPDATE catalog_unified SET is_harley_fitment = true
      WHERE source_vendor = 'PU'
        AND (is_harley_fitment IS NULL OR is_harley_fitment = false)
        AND EXISTS (SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = id)
    `);
    console.log(`  Backfilled: ${bf.toLocaleString()} products`);

    console.log(`
=================================================
  ✅ DONE
=================================================
Next steps:
  1. node scripts/ingest/ingest_vtwin_fitment.cjs --dry
  2. node scripts/ingest/build_variant_groups.cjs
  3. Run ERA BACKFILL SQL (see MasterRef)
  4. node scripts/ingest/index_unified.js --recreate
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
