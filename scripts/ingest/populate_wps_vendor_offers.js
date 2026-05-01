#!/usr/bin/env node
/**
 * populate_wps_vendor_offers.js
 * Extracts WPS product data from raw_vendor_wps_products JSONB
 * and inserts into vendor_offers with vendor_code='wps'
 *
 * Run: node scripts/ingest/populate_wps_vendor_offers.js
 * Run (dry): node scripts/ingest/populate_wps_vendor_offers.js --dry
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local', override: true });

const pool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST     || '5.161.100.126',
  port:     parseInt(process.env.CATALOG_DB_PORT || '5432'),
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER     || 'deploy',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const DRY   = process.argv.includes('--dry');
const BATCH = 500;

async function main() {
  console.log('\n🔧 WPS vendor_offers population\n');
  console.log(`   Mode: ${DRY ? 'DRY RUN' : 'LIVE'}\n`);

  // Count WPS raw products that map to a catalog_unified row
  const { rows: [{ count }] } = await pool.query(`
    SELECT COUNT(*) FROM raw_vendor_wps_products r
    JOIN catalog_unified cu 
      ON cu.sku = (r.payload->>'sku')
      AND cu.source_vendor = 'WPS'
  `);
  const total = parseInt(count);
  console.log(`📦 ${total.toLocaleString()} WPS products to process\n`);

  if (DRY) {
    // Show sample of what would be inserted
    const { rows } = await pool.query(`
      SELECT 
        cu.id as catalog_product_id,
        'wps' as vendor_code,
        r.payload->>'sku' as vendor_part_number,
        r.payload->>'manufacturer_part_number' as manufacturer_part_number,
        (r.payload->>'cost')::numeric as wholesale_cost,
        (r.payload->>'map_price')::numeric as map_price,
        (r.payload->>'msrp')::numeric as msrp,
        (r.payload->>'computed_price')::numeric as computed_price,
        (r.payload->>'margin_percent')::numeric as margin_percent,
        COALESCE((r.payload->>'drop_ship_eligible')::boolean, true) as drop_ship_eligible,
        (r.payload->>'status') = 'STK' as in_stock,
        (r.payload->>'stock_quantity')::integer as total_qty,
        cu.warehouse_wi as wi_qty,
        cu.warehouse_ny as ny_qty,
        cu.warehouse_tx as tx_qty,
        cu.warehouse_nv as nv_qty,
        cu.warehouse_nc as nc_qty
      FROM raw_vendor_wps_products r
      JOIN catalog_unified cu 
        ON cu.sku = (r.payload->>'sku')
        AND cu.source_vendor = 'WPS'
      LIMIT 5
    `);
    console.log('Sample rows that would be inserted:');
    console.table(rows);
    console.log('\nRe-run without --dry to execute.');
    await pool.end();
    return;
  }

  // Remove existing WPS offers (full refresh)
  console.log('🗑️  Removing existing WPS offers...');
  const { rowCount: deleted } = await pool.query(
    `DELETE FROM vendor_offers WHERE vendor_code = 'wps'`
  );
  console.log(`   ✓ Removed ${deleted} existing rows\n`);

  const bar = new ProgressBar(total, 'Inserting WPS offers');
  let inserted = 0;
  let errors   = 0;
  let offset   = 0;

  while (offset < total) {
    const { rows } = await pool.query(`
      SELECT 
        cu.id as catalog_product_id,
        (r.payload->>'sku') as vendor_part_number,
        (r.payload->>'manufacturer_part_number') as manufacturer_part_number,
        COALESCE((r.payload->>'cost')::numeric, 0) as wholesale_cost,
        COALESCE((r.payload->>'map_price')::numeric, 0) as map_price,
        COALESCE((r.payload->>'msrp')::numeric, 0) as msrp,
        COALESCE((r.payload->>'computed_price')::numeric, 0) as computed_price,
        COALESCE((r.payload->>'margin_percent')::numeric, 0) as margin_percent,
        COALESCE((r.payload->>'drop_ship_eligible')::boolean, true) as drop_ship_eligible,
        0::numeric as drop_ship_fee,
        (r.payload->>'status') = 'STK' as in_stock,
        COALESCE((r.payload->>'stock_quantity')::integer, 0) as total_qty,
        -- WPS per-warehouse qtys: use catalog_unified warehouse cols
        -- (populated from WPS API; currently 0 pending inventory sync)
        COALESCE(cu.warehouse_wi, 0) as wi_qty,
        COALESCE(cu.warehouse_ny, 0) as ny_qty,
        COALESCE(cu.warehouse_tx, 0) as tx_qty,
        COALESCE(cu.warehouse_nv, 0) as nv_qty,
        COALESCE(cu.warehouse_nc, 0) as nc_qty,
        -- warehouse_json: store full payload for future enrichment
        jsonb_build_object(
          'wi', COALESCE(cu.warehouse_wi, 0),
          'ny', COALESCE(cu.warehouse_ny, 0),
          'tx', COALESCE(cu.warehouse_tx, 0),
          'nv', COALESCE(cu.warehouse_nv, 0),
          'nc', COALESCE(cu.warehouse_nc, 0),
          'total', COALESCE((r.payload->>'stock_quantity')::integer, 0)
        ) as warehouse_json,
        true as is_active,
        NOW() as last_stock_sync
      FROM raw_vendor_wps_products r
      JOIN catalog_unified cu 
        ON cu.sku = (r.payload->>'sku')
        AND cu.source_vendor = 'WPS'
      ORDER BY r.id
      LIMIT $1 OFFSET $2
    `, [BATCH, offset]);

    if (!rows.length) break;

    try {
      await pool.query(`
        INSERT INTO vendor_offers (
          catalog_product_id, vendor_code, vendor_part_number,
          manufacturer_part_number, wholesale_cost, map_price, msrp,
          computed_price, margin_percent, drop_ship_eligible, drop_ship_fee,
          in_stock, total_qty, wi_qty, ny_qty, tx_qty, nv_qty, nc_qty,
          warehouse_json, is_active, last_stock_sync
        )
        SELECT
          catalog_product_id, 'wps', vendor_part_number,
          manufacturer_part_number, wholesale_cost, map_price, msrp,
          computed_price, margin_percent, drop_ship_eligible, drop_ship_fee,
          in_stock, total_qty, wi_qty, ny_qty, tx_qty, nv_qty, nc_qty,
          warehouse_json, is_active, last_stock_sync
        FROM jsonb_to_recordset($1::jsonb) AS t(
          catalog_product_id int, vendor_part_number text,
          manufacturer_part_number text, wholesale_cost numeric,
          map_price numeric, msrp numeric, computed_price numeric,
          margin_percent numeric, drop_ship_eligible boolean,
          drop_ship_fee numeric, in_stock boolean, total_qty int,
          wi_qty int, ny_qty int, tx_qty int, nv_qty int, nc_qty int,
          warehouse_json jsonb, is_active boolean, last_stock_sync timestamptz
        )
        ON CONFLICT DO NOTHING
      `, [JSON.stringify(rows)]);

      inserted += rows.length;
    } catch (err) {
      console.error(`\nBatch error at offset ${offset}:`, err.message);
      errors += rows.length;
    }

    offset += rows.length;
    bar.update(offset);
  }

  bar.finish('WPS offers inserted');

  // Verify
  const { rows: [{ wps_count, in_stock_count }] } = await pool.query(`
    SELECT 
      COUNT(*) as wps_count,
      COUNT(*) FILTER (WHERE in_stock) as in_stock_count
    FROM vendor_offers WHERE vendor_code = 'wps'
  `);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  WPS vendor_offers populated!

  Inserted:    ${inserted.toLocaleString()}
  Errors:      ${errors.toLocaleString()}
  WPS offers:  ${parseInt(wps_count).toLocaleString()}
  In stock:    ${parseInt(in_stock_count).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next step: run populate_pu_crossref.js to link matching SKUs
`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
