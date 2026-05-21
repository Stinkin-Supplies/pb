#!/usr/bin/env node
/**
 * ingest_vtwin_fitment.cjs
 *
 * Promotes vtwin_oem_crossref (12,278 pairs) → catalog_fitment_v2
 *
 * vtwin_oem_crossref schema (introspected at runtime):
 *   Likely: vtwin_sku / part_number / sku, oem_number / hd_part_number, model_code / model, year / year_start / year_end
 *   If it only has OEM cross-references (no direct year/model data), we join through
 *   catalog_oem_crossref → catalog_fitment_v2 to find existing fitment and copy it.
 *
 * Strategy A (if vtwin_oem_crossref has year + model):
 *   vtwin_oem_crossref → harley_model_years → catalog_fitment_v2
 *
 * Strategy B (if vtwin_oem_crossref is SKU ↔ OEM number mapping):
 *   vtwin product → catalog_unified → catalog_oem_crossref → find PU/JWBoon product with same OEM
 *   → copy that product's fitment rows into VTwin product's fitment
 *
 * This script auto-detects which strategy applies.
 *
 * Run:
 *   node scripts/ingest/ingest_vtwin_fitment.cjs [--dry]
 *
 * After:
 *   node scripts/ingest/build_variant_groups.cjs
 *   [ERA BACKFILL SQL from MasterRef]
 *   node scripts/ingest/index_unified.js --recreate
 */

'use strict';
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry');

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
    console.log('  ingest_vtwin_fitment.cjs');
    console.log(DRY ? '  [DRY RUN]' : '  [LIVE]');
    console.log('=================================================\n');

    // 1. Introspect vtwin_oem_crossref
    const { rows: cols } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vtwin_oem_crossref'
      ORDER BY ordinal_position
    `);
    const colNames = cols.map(c => c.column_name);
    console.log('vtwin_oem_crossref columns:', colNames.join(', '));

    const { rows: sample } = await db.query(`SELECT * FROM vtwin_oem_crossref LIMIT 5`);
    console.log('Sample rows:');
    sample.forEach(r => console.log(' ', JSON.stringify(r)));

    // Row counts
    const { rows: [crossref] } = await db.query('SELECT COUNT(*) AS cnt FROM vtwin_oem_crossref');
    console.log(`\nvtwin_oem_crossref total: ${parseInt(crossref.cnt).toLocaleString()}`);

    const { rows: [ex] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2 WHERE source = 'VTWIN'`);
    console.log(`catalog_fitment_v2 VTWIN existing: ${parseInt(ex.cnt).toLocaleString()}`);

    // Detect strategy
    const hasYear     = colNames.some(c => ['year','year_start','year_end'].includes(c));
    const hasModel    = colNames.some(c => ['model','model_code','hd_model'].includes(c));
    const hasOem      = colNames.some(c => ['oem_number','oem','hd_part_number','oem_part'].includes(c));
    const hasVtwinSku = colNames.some(c => ['vtwin_sku','sku','part_number','vtwin_part'].includes(c));

    console.log(`\nDetected: hasYear=${hasYear} hasModel=${hasModel} hasOem=${hasOem} hasVtwinSku=${hasVtwinSku}`);

    if (hasYear && hasModel) {
      await strategyA(db, colNames, DRY);
    } else if (hasOem && hasVtwinSku) {
      await strategyB(db, colNames, DRY);
    } else {
      // Try OEM cross-join even if column names don't match exactly
      console.log('\n⚠ Column names unclear — attempting OEM cross-reference strategy (B)...');
      await strategyB(db, colNames, DRY);
    }

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    db.release();
    await pool.end();
  }
}

// ── Strategy A: direct year+model fitment ────────────────────
async function strategyA(db, colNames, dry) {
  console.log('\n── Strategy A: direct year+model mapping ──');

  const yearCol  = colNames.includes('year')        ? 'year'
                 : colNames.includes('year_start')   ? 'year_start'
                 : 'year';
  const modelCol = colNames.includes('model_code')  ? 'model_code'
                 : colNames.includes('model')        ? 'model'
                 : colNames.includes('hd_model')     ? 'hd_model'
                 : 'model';
  const skuCol   = colNames.includes('vtwin_sku')   ? 'vtwin_sku'
                 : colNames.includes('part_number')  ? 'part_number'
                 : colNames.includes('sku')          ? 'sku'
                 : 'sku';

  const { rows: [mc] } = await db.query(`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT DISTINCT cu.id AS product_id, hmy.id AS model_year_id
      FROM vtwin_oem_crossref voc
      JOIN catalog_unified cu
        ON cu.vendor_sku = 'VTWIN-' || voc.${skuCol}
        OR cu.vendor_sku = voc.${skuCol}
      JOIN harley_model_years hmy
        ON hmy.year::text = voc.${yearCol}::text
      JOIN harley_models hm ON hm.id = hmy.model_id
      WHERE cu.source_vendor = 'VTWIN'
        AND voc.${yearCol} IS NOT NULL
    ) sub
  `);
  console.log(`Matchable pairs: ${parseInt(mc.cnt).toLocaleString()}`);

  if (dry) { console.log('[DRY] No changes.'); return; }

  // Delete old
  const del = await db.query(`DELETE FROM catalog_fitment_v2 WHERE source = 'VTWIN'`);
  console.log(`Deleted existing: ${del.rowCount}`);

  // Insert
  const res = await db.query(`
    INSERT INTO catalog_fitment_v2 (product_id, model_year_id, source)
    SELECT DISTINCT cu.id, hmy.id, 'VTWIN'
    FROM vtwin_oem_crossref voc
    JOIN catalog_unified cu
      ON cu.vendor_sku = 'VTWIN-' || voc.${skuCol}
      OR cu.vendor_sku = voc.${skuCol}
    JOIN harley_model_years hmy
      ON hmy.year::text = voc.${yearCol}::text
    WHERE cu.source_vendor = 'VTWIN'
      AND voc.${yearCol} IS NOT NULL
    ON CONFLICT (product_id, model_year_id) DO NOTHING
  `);
  console.log(`✅ Inserted: ${res.rowCount.toLocaleString()}`);
  await printFinal(db);
}

// ── Strategy B: OEM cross-reference ─────────────────────────
// vtwin_oem_crossref is SKU ↔ OEM number pairs.
// Find VTWIN products in catalog_unified, look up their OEM numbers,
// find other products with the same OEM numbers that already have fitment,
// and copy that fitment to the VTWIN product.
async function strategyB(db, colNames, dry) {
  console.log('\n── Strategy B: OEM cross-reference copy ──');

  // Detect column names
  const vtwinSkuCol = colNames.includes('vtwin_sku')   ? 'vtwin_sku'
                    : colNames.includes('part_number')  ? 'part_number'
                    : colNames.includes('sku')          ? 'sku'
                    : colNames[0];

  const oemCol      = colNames.includes('oem_number')     ? 'oem_number'
                    : colNames.includes('hd_part_number') ? 'hd_part_number'
                    : colNames.includes('oem')            ? 'oem'
                    : colNames.includes('oem_part')       ? 'oem_part'
                    : colNames[1];

  console.log(`  VTwin SKU column: ${vtwinSkuCol}`);
  console.log(`  OEM column: ${oemCol}`);

  // Count how many VTWIN products we can cross-ref
  const { rows: [mc] } = await db.query(`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT DISTINCT cu_vtwin.id AS vtwin_product_id, cfv.model_year_id
      FROM vtwin_oem_crossref voc
      -- Find the VTwin product in catalog_unified
      JOIN catalog_unified cu_vtwin
        ON cu_vtwin.vendor_sku = 'VTWIN-' || UPPER(voc.${vtwinSkuCol})
        OR cu_vtwin.vendor_sku = 'VT-'    || UPPER(voc.${vtwinSkuCol})
        OR cu_vtwin.vendor_sku = voc.${vtwinSkuCol}
      -- Find the OEM number cross-ref in catalog_oem_crossref
      JOIN catalog_oem_crossref coc
        ON coc.oem_number = voc.${oemCol}
      -- Get fitment from the matched product
      JOIN catalog_fitment_v2 cfv
        ON cfv.product_id = coc.product_id
      WHERE cu_vtwin.source_vendor = 'VTWIN'
        AND voc.${oemCol} IS NOT NULL
        AND voc.${oemCol} != ''
    ) sub
  `);
  console.log(`Matchable (vtwin_product_id, model_year_id) pairs: ${parseInt(mc.cnt).toLocaleString()}`);

  if (parseInt(mc.cnt) === 0) {
    console.log('\n⚠ Zero matches via OEM cross-ref. Check vtwin_oem_crossref structure.');
    console.log('   Inspect with: SELECT * FROM vtwin_oem_crossref LIMIT 20');
    console.log('   Then update this script with the correct column strategy.');
    return;
  }

  if (dry) { console.log('[DRY] No changes.'); return; }

  // Delete old
  const del = await db.query(`DELETE FROM catalog_fitment_v2 WHERE source = 'VTWIN'`);
  console.log(`\nDeleted existing VTWIN rows: ${del.rowCount}`);

  // Insert
  const res = await db.query(`
    INSERT INTO catalog_fitment_v2 (product_id, model_year_id, source)
    SELECT DISTINCT cu_vtwin.id, cfv.model_year_id, 'VTWIN'
    FROM vtwin_oem_crossref voc
    JOIN catalog_unified cu_vtwin
      ON cu_vtwin.vendor_sku = 'VTWIN-' || UPPER(voc.${vtwinSkuCol})
      OR cu_vtwin.vendor_sku = 'VT-'    || UPPER(voc.${vtwinSkuCol})
      OR cu_vtwin.vendor_sku = voc.${vtwinSkuCol}
    JOIN catalog_oem_crossref coc
      ON coc.oem_number = voc.${oemCol}
    JOIN catalog_fitment_v2 cfv
      ON cfv.product_id = coc.product_id
    WHERE cu_vtwin.source_vendor = 'VTWIN'
      AND voc.${oemCol} IS NOT NULL
      AND voc.${oemCol} != ''
    ON CONFLICT (product_id, model_year_id) DO NOTHING
  `);
  console.log(`✅ Inserted: ${res.rowCount.toLocaleString()}`);

  await printFinal(db);
}

async function printFinal(db) {
  const { rows: [fv] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2 WHERE source = 'VTWIN'`);
  const { rows: [ft] } = await db.query(`SELECT COUNT(*) AS cnt FROM catalog_fitment_v2`);
  console.log(`\ncatalog_fitment_v2 VTWIN after: ${parseInt(fv.cnt).toLocaleString()}`);
  console.log(`catalog_fitment_v2 total:       ${parseInt(ft.cnt).toLocaleString()}`);

  // Backfill is_harley_fitment
  console.log('\nBackfilling is_harley_fitment on matched VTWIN products...');
  const bf = await db.query(`
    UPDATE catalog_unified cu
    SET is_harley_fitment = true
    WHERE source_vendor = 'VTWIN'
      AND is_harley_fitment IS NOT TRUE
      AND EXISTS (
        SELECT 1 FROM catalog_fitment_v2 cfv
        WHERE cfv.product_id = cu.id AND cfv.source = 'VTWIN'
      )
  `);
  console.log(`  Backfilled: ${bf.rowCount.toLocaleString()} products`);

  console.log(`
=================================================
  ✅ DONE
=================================================
Next steps:
  1. node scripts/ingest/build_variant_groups.cjs
  2. Run ERA BACKFILL SQL (see MasterRef)
  3. node scripts/ingest/index_unified.js --recreate
`);
}

main();
