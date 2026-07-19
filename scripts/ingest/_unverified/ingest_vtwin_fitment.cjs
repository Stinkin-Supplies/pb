#!/usr/bin/env node
/**
 * ingest_vtwin_fitment.cjs
 *
 * vtwin_oem_crossref: id, hd_oem_number, vt_part_number
 * catalog_oem_crossref: id, sku, oem_number, ...  (no product_id — joins via sku)
 *
 * Join chain:
 *   voc.vt_part_number → cu_vt.sku (VTWIN product)
 *   voc.hd_oem_number  → coc.oem_number → coc.sku → cu_src.sku → cu_src.id → catalog_fitment_v2
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
    console.log('  ingest_vtwin_fitment.cjs');
    console.log(DRY ? '  [DRY RUN]' : '  [LIVE]');
    console.log('=================================================\n');

    // ── Introspect
    const { rows: colRows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vtwin_oem_crossref' ORDER BY ordinal_position
    `);
    const cols = colRows.map(r => r.column_name);
    console.log('vtwin_oem_crossref columns:', cols.join(', '));

    const { rows: sample } = await db.query('SELECT * FROM vtwin_oem_crossref LIMIT 5');
    console.log('Sample rows:');
    sample.forEach(r => console.log(' ', JSON.stringify(r)));

    const { rows: [xref] } = await db.query('SELECT COUNT(*) AS cnt FROM vtwin_oem_crossref');
    console.log(`\nvtwin_oem_crossref total: ${parseInt(xref.cnt).toLocaleString()}`);

    const vtwinSkuCol = ['vt_part_number','vtwin_sku','part_number','sku'].find(c => cols.includes(c));
    const oemCol      = ['hd_oem_number','oem_number','hd_part_number','oem'].find(c => cols.includes(c));
    if (!vtwinSkuCol) throw new Error('Cannot find VTwin SKU column. Cols: ' + cols.join(', '));
    if (!oemCol)      throw new Error('Cannot find OEM column. Cols: ' + cols.join(', '));
    console.log(`\n✅ VTwin SKU col: "${vtwinSkuCol}", OEM col: "${oemCol}"`);

    // ── Existing counts
    const { rows: [exVT] } = await db.query(`
      SELECT COUNT(*) AS cnt FROM catalog_fitment_v2 cf
      JOIN catalog_unified cu ON cu.id = cf.product_id
      WHERE cu.source_vendor = 'VTWIN'
    `);
    const { rows: [tot] } = await db.query('SELECT COUNT(*) AS cnt FROM catalog_fitment_v2');
    console.log(`catalog_fitment_v2 VTWIN existing: ${parseInt(exVT.cnt).toLocaleString()}`);
    console.log(`catalog_fitment_v2 total (now):    ${parseInt(tot.cnt).toLocaleString()}`);

    // ── Estimate matchable pairs
    // vt_part_number → VTWIN product in catalog_unified
    // hd_oem_number  → catalog_oem_crossref.oem_number → .sku → catalog_unified → fitment
    console.log('\n── Strategy B: OEM cross-reference copy ──');
    const { rows: [mc] } = await db.query(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT DISTINCT cu_vt.id AS product_id, cf_src.model_year_id
        FROM vtwin_oem_crossref voc
        JOIN catalog_unified cu_vt
          ON replace(cu_vt.sku, '-', '') = replace('VT-' || voc.${vtwinSkuCol}, '-', '')
         AND cu_vt.source_vendor = 'VTWIN'
        JOIN catalog_oem_crossref coc
          ON coc.oem_number = voc.${oemCol}
        JOIN catalog_unified cu_src
          ON replace(cu_src.sku, '-', '') = replace(coc.sku, '-', '')
        JOIN catalog_fitment_v2 cf_src
          ON cf_src.product_id = cu_src.id
        WHERE voc.${oemCol} IS NOT NULL AND voc.${oemCol} != ''
          AND cu_vt.id != cu_src.id
      ) sub
    `);
    const matchable = parseInt(mc.cnt);
    console.log(`Matchable (vtwin_product_id, model_year_id) pairs: ${matchable.toLocaleString()}`);

    // ── Sample matched rows
    const { rows: sampleMatch } = await db.query(`
      SELECT voc.${vtwinSkuCol} AS vt_sku, voc.${oemCol} AS oem,
             cu_vt.id AS product_id, cu_src.sku AS src_sku, cf_src.model_year_id
      FROM vtwin_oem_crossref voc
      JOIN catalog_unified cu_vt
        ON replace(cu_vt.sku, '-', '') = replace('VT-' || voc.${vtwinSkuCol}, '-', '')
       AND cu_vt.source_vendor = 'VTWIN'
      JOIN catalog_oem_crossref coc
        ON coc.oem_number = voc.${oemCol}
      JOIN catalog_unified cu_src
        ON replace(cu_src.sku, '-', '') = replace(coc.sku, '-', '')
      JOIN catalog_fitment_v2 cf_src
        ON cf_src.product_id = cu_src.id
      WHERE voc.${oemCol} IS NOT NULL AND voc.${oemCol} != ''
        AND cu_vt.id != cu_src.id
      LIMIT 5
    `);
    console.log('\nSample matched rows:');
    if (sampleMatch.length === 0) {
      console.log('  (none)');
      // Diagnostics
      const { rows: d1 } = await db.query(`
        SELECT voc.${vtwinSkuCol}, voc.${oemCol}, cu_vt.id AS vtwin_id
        FROM vtwin_oem_crossref voc
        JOIN catalog_unified cu_vt
          ON replace(cu_vt.sku,'-','') = replace('VT-' || voc.${vtwinSkuCol},'-','')
         AND cu_vt.source_vendor = 'VTWIN'
        LIMIT 3
      `);
      console.log('\nVTwin SKU matches in catalog_unified:', d1.length ? '' : '(none)');
      d1.forEach(r => console.log(' ', JSON.stringify(r)));

      const { rows: d2 } = await db.query(`
        SELECT voc.${oemCol}, coc.sku AS coc_sku
        FROM vtwin_oem_crossref voc
        JOIN catalog_oem_crossref coc ON coc.oem_number = voc.${oemCol}
        LIMIT 3
      `);
      console.log('\nOEM number matches in catalog_oem_crossref:', d2.length ? '' : '(none)');
      d2.forEach(r => console.log(' ', JSON.stringify(r)));
    } else {
      sampleMatch.forEach(r => console.log(' ', JSON.stringify(r)));
    }

    if (DRY) {
      console.log('\n[DRY RUN] No changes made. Re-run without --dry to promote.');
      return;
    }
    if (matchable === 0) {
      console.error('\n❌ 0 matchable pairs — aborting. Check diagnostics above.');
      process.exit(1);
    }

    // ── Delete existing VTWIN fitment
    console.log('\nDeleting existing VTWIN fitment rows...');
    const { rowCount: delCount } = await db.query(`
      DELETE FROM catalog_fitment_v2
      WHERE product_id IN (SELECT id FROM catalog_unified WHERE source_vendor = 'VTWIN')
    `);
    console.log(`  Deleted: ${delCount.toLocaleString()}`);

    // ── Build temp table
    console.log('Building temp table...');
    await db.query(`
      CREATE TEMP TABLE _vt_promote AS
      SELECT DISTINCT cu_vt.id AS product_id, cf_src.model_year_id
      FROM vtwin_oem_crossref voc
      JOIN catalog_unified cu_vt
        ON replace(cu_vt.sku, '-', '') = replace('VT-' || voc.${vtwinSkuCol}, '-', '')
       AND cu_vt.source_vendor = 'VTWIN'
      JOIN catalog_oem_crossref coc
        ON coc.oem_number = voc.${oemCol}
      JOIN catalog_unified cu_src
        ON replace(cu_src.sku, '-', '') = replace(coc.sku, '-', '')
      JOIN catalog_fitment_v2 cf_src
        ON cf_src.product_id = cu_src.id
      WHERE voc.${oemCol} IS NOT NULL AND voc.${oemCol} != ''
        AND cu_vt.id != cu_src.id
    `);
    const { rows: [tmpCnt] } = await db.query('SELECT COUNT(*) AS cnt FROM _vt_promote');
    const total = parseInt(tmpCnt.cnt);
    console.log(`  ${total.toLocaleString()} pairs ready`);

    // ── Batch insert
    console.log('Inserting in batches...');
    let inserted = 0, offset = 0, batch = 0;
    while (offset < total) {
      batch++;
      const { rowCount } = await db.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
        SELECT product_id, model_year_id FROM _vt_promote
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
    const { rows: [fvt] } = await db.query(`
      SELECT COUNT(*) AS cnt FROM catalog_fitment_v2 cf
      JOIN catalog_unified cu ON cu.id = cf.product_id
      WHERE cu.source_vendor = 'VTWIN'
    `);
    const { rows: [ft2] } = await db.query('SELECT COUNT(*) AS cnt FROM catalog_fitment_v2');
    console.log(`\ncatalog_fitment_v2 VTWIN after: ${parseInt(fvt.cnt).toLocaleString()}`);
    console.log(`catalog_fitment_v2 total:       ${parseInt(ft2.cnt).toLocaleString()}`);

    // ── Backfill is_harley_fitment
    console.log('\nBackfilling is_harley_fitment on matched VTWIN products...');
    const { rowCount: bf } = await db.query(`
      UPDATE catalog_unified SET is_harley_fitment = true
      WHERE source_vendor = 'VTWIN'
        AND (is_harley_fitment IS NULL OR is_harley_fitment = false)
        AND EXISTS (SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = id)
    `);
    console.log(`  Backfilled: ${bf.toLocaleString()} products`);

    console.log(`
=================================================
  ✅ DONE
=================================================
Next steps:
  1. node scripts/ingest/build_variant_groups.cjs
  2. Run ERA BACKFILL SQL (see MasterRef)
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
