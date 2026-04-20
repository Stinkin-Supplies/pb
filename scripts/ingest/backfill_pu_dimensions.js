/**
 * backfill_pu_dimensions.js
 *
 * Copies physical dimensions (weight, height, width, length) from
 * pu_brand_enrichment into:
 *   1. catalog_unified  (weight, height_in, length_in, width_in)
 *   2. catalog_products (weight, height, length, width — if columns exist)
 *
 * pu_brand_enrichment has:
 *   merch_h, merch_w, merch_l   — merchandising (shelf) dims
 *   ship_h,  ship_w,  ship_l    — shipping box dims
 *   weight, weight_uom
 *   dimension_uom
 *
 * We use merch dims as primary (what customers care about), fall back to ship.
 * All values assumed inches unless dimension_uom says otherwise — we store as-is
 * since catalog_unified columns are already named height_in / length_in / width_in.
 *
 * Safe to re-run — uses UPDATE WHERE NULL so existing data is not overwritten.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/backfill_pu_dimensions.js [--dry-run] [--overwrite]
 */

import pg from 'pg';
import { ProgressBar } from './progress_bar.js';

const DRY_RUN   = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite'); // force-update even if already set
const BATCH_SIZE = 1000;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n📦 backfill_pu_dimensions.js${DRY_RUN ? ' [DRY RUN]' : ''}${OVERWRITE ? ' [OVERWRITE]' : ''}\n`);

    // ── 1. catalog_unified ──────────────────────────────────────────────────────
    console.log('Step 1: Backfilling catalog_unified dimensions from pu_brand_enrichment...');

    const nullFilter = OVERWRITE ? '' : `
      AND (
        cu.weight IS NULL OR cu.weight = 0
        OR cu.height_in IS NULL OR cu.height_in = 0
        OR cu.length_in IS NULL OR cu.length_in = 0
        OR cu.width_in IS NULL OR cu.width_in = 0
      )`;

    // Count affected rows first
    const { rows: [{ count: affectedCount }] } = await client.query(`
      SELECT COUNT(*) AS count
      FROM catalog_unified cu
      JOIN pu_brand_enrichment pbe ON (
        cu.sku = pbe.sku
        OR cu.sku = REPLACE(pbe.sku, '-', '')
        OR REPLACE(cu.sku, '-', '') = REPLACE(pbe.sku, '-', '')
      )
      WHERE cu.source_vendor = 'PU'
      ${nullFilter}
      AND (
        pbe.weight > 0
        OR COALESCE(pbe.merch_h, pbe.ship_h) > 0
        OR COALESCE(pbe.merch_l, pbe.ship_l) > 0
        OR COALESCE(pbe.merch_w, pbe.ship_w) > 0
      )
    `);

    console.log(`  Products needing dimension update: ${affectedCount}`);

    if (DRY_RUN) {
      // Show a sample
      const { rows: sample } = await client.query(`
        SELECT cu.sku, cu.name,
               pbe.weight, pbe.weight_uom,
               COALESCE(pbe.merch_h, pbe.ship_h) AS height,
               COALESCE(pbe.merch_l, pbe.ship_l) AS length,
               COALESCE(pbe.merch_w, pbe.ship_w) AS width,
               pbe.dimension_uom
        FROM catalog_unified cu
        JOIN pu_brand_enrichment pbe ON (
          cu.sku = pbe.sku
          OR cu.sku = REPLACE(pbe.sku, '-', '')
          OR REPLACE(cu.sku, '-', '') = REPLACE(pbe.sku, '-', '')
        )
        WHERE cu.source_vendor = 'PU'
          AND pbe.weight > 0
        LIMIT 15
      `);
      console.log('\nDRY RUN — sample rows:');
      console.table(sample);
      console.log('\nSkipping actual updates in dry-run mode.');
      return;
    }

    // Perform the update
    const cuResult = await client.query(`
      UPDATE catalog_unified cu
      SET
        weight    = CASE WHEN ${OVERWRITE ? 'true' : 'cu.weight IS NULL OR cu.weight = 0'}
                    THEN pbe.weight ELSE cu.weight END,
        height_in = CASE WHEN ${OVERWRITE ? 'true' : 'cu.height_in IS NULL OR cu.height_in = 0'}
                    THEN COALESCE(pbe.merch_h, pbe.ship_h) ELSE cu.height_in END,
        length_in = CASE WHEN ${OVERWRITE ? 'true' : 'cu.length_in IS NULL OR cu.length_in = 0'}
                    THEN COALESCE(pbe.merch_l, pbe.ship_l) ELSE cu.length_in END,
        width_in  = CASE WHEN ${OVERWRITE ? 'true' : 'cu.width_in IS NULL OR cu.width_in = 0'}
                    THEN COALESCE(pbe.merch_w, pbe.ship_w) ELSE cu.width_in END,
        updated_at = NOW()
      FROM pu_brand_enrichment pbe
      WHERE (
        cu.sku = pbe.sku
        OR cu.sku = REPLACE(pbe.sku, '-', '')
        OR REPLACE(cu.sku, '-', '') = REPLACE(pbe.sku, '-', '')
      )
      AND cu.source_vendor = 'PU'
      AND (
        pbe.weight > 0
        OR COALESCE(pbe.merch_h, pbe.ship_h) > 0
        OR COALESCE(pbe.merch_l, pbe.ship_l) > 0
        OR COALESCE(pbe.merch_w, pbe.ship_w) > 0
      )
    `);
    console.log(`  ✅ catalog_unified updated: ${cuResult.rowCount} rows`);

    // ── 2. catalog_products ─────────────────────────────────────────────────────
    // catalog_products may or may not have weight/dimension columns depending on
    // your schema version. We check for the columns first.
    console.log('\nStep 2: Checking catalog_products for dimension columns...');

    const { rows: colCheck } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_products'
        AND column_name IN ('weight', 'height', 'length', 'width',
                            'height_in', 'length_in', 'width_in')
    `);
    const existingCols = new Set(colCheck.map(r => r.column_name));
    console.log(`  Dimension columns present: ${[...existingCols].join(', ') || 'none'}`);

    if (existingCols.size > 0) {
      const weightCol  = existingCols.has('weight')    ? 'weight'    : null;
      const heightCol  = existingCols.has('height_in') ? 'height_in' : existingCols.has('height') ? 'height' : null;
      const lengthCol  = existingCols.has('length_in') ? 'length_in' : existingCols.has('length') ? 'length' : null;
      const widthCol   = existingCols.has('width_in')  ? 'width_in'  : existingCols.has('width')  ? 'width'  : null;

      const setClauses = [];
      if (weightCol) setClauses.push(`${weightCol} = COALESCE(${OVERWRITE ? '' : `NULLIF(cp.${weightCol}, 0), `}pbe.weight)`);
      if (heightCol) setClauses.push(`${heightCol} = COALESCE(${OVERWRITE ? '' : `NULLIF(cp.${heightCol}, 0), `}pbe.merch_h, pbe.ship_h)`);
      if (lengthCol) setClauses.push(`${lengthCol} = COALESCE(${OVERWRITE ? '' : `NULLIF(cp.${lengthCol}, 0), `}pbe.merch_l, pbe.ship_l)`);
      if (widthCol)  setClauses.push(`${widthCol}  = COALESCE(${OVERWRITE ? '' : `NULLIF(cp.${widthCol},  0), `}pbe.merch_w, pbe.ship_w)`);

      if (setClauses.length > 0) {
        const cpResult = await client.query(`
          UPDATE catalog_products cp
          SET ${setClauses.join(',\n        ')}
          FROM pu_brand_enrichment pbe
          WHERE (
            cp.sku = pbe.sku
            OR cp.sku = REPLACE(pbe.sku, '-', '')
            OR REPLACE(cp.sku, '-', '') = REPLACE(pbe.sku, '-', '')
          )
          AND cp.source_vendor = 'pu'
          AND (
            pbe.weight > 0
            OR COALESCE(pbe.merch_h, pbe.ship_h) > 0
          )
        `);
        console.log(`  ✅ catalog_products updated: ${cpResult.rowCount} rows`);
      }
    } else {
      console.log('  ⚠️  No dimension columns in catalog_products — skipping (catalog_unified already updated)');
    }

    // ── 3. Also backfill UPC + country_of_origin ────────────────────────────────
    console.log('\nStep 3: Backfilling UPC and country_of_origin from pu_products_filtered...');

    // catalog_unified.upc — from pu_products_filtered (pu_brand_enrichment doesn't carry UPC)
    const upcResult2 = await client.query(`
      UPDATE catalog_unified cu
      SET upc = puf.upc_code
      FROM pu_products_filtered puf
      WHERE (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
        AND cu.source_vendor = 'PU'
        AND (cu.upc IS NULL OR cu.upc = '')
        AND puf.upc_code IS NOT NULL
        AND puf.upc_code != ''
    `);
    console.log(`  ✅ catalog_unified UPC backfilled: ${upcResult2.rowCount} rows`);

    const coResult = await client.query(`
      UPDATE catalog_unified cu
      SET country_of_origin = pbe.country_of_origin
      FROM pu_brand_enrichment pbe
      WHERE (
        cu.sku = pbe.sku
        OR REPLACE(cu.sku, '-', '') = REPLACE(pbe.sku, '-', '')
      )
      AND cu.source_vendor = 'PU'
      AND (cu.country_of_origin IS NULL OR cu.country_of_origin = '')
      AND pbe.country_of_origin IS NOT NULL
      AND pbe.country_of_origin != ''
    `);
    console.log(`  ✅ catalog_unified country_of_origin backfilled: ${coResult.rowCount} rows`);

    // ── 4. Summary ──────────────────────────────────────────────────────────────
    console.log('\n📊 Coverage summary for PU products in catalog_unified:');
    const { rows: summary } = await client.query(`
      SELECT
        COUNT(*) AS total_pu,
        COUNT(CASE WHEN weight > 0 THEN 1 END) AS has_weight,
        COUNT(CASE WHEN height_in > 0 THEN 1 END) AS has_height,
        COUNT(CASE WHEN length_in > 0 THEN 1 END) AS has_length,
        COUNT(CASE WHEN width_in  > 0 THEN 1 END) AS has_width,
        COUNT(CASE WHEN upc IS NOT NULL AND upc != '' THEN 1 END) AS has_upc,
        COUNT(CASE WHEN country_of_origin IS NOT NULL AND country_of_origin != '' THEN 1 END) AS has_country
      FROM catalog_unified
      WHERE source_vendor = 'PU'
    `);
    console.table(summary);

    console.log('\n✅ backfill_pu_dimensions complete');
    console.log('\n⚠️  Remember to reindex Typesense after running this:');
    console.log('   TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
