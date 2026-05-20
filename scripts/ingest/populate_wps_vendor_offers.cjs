#!/usr/bin/env node
/**
 * populate_wps_vendor_offers.cjs
 * Rebuilds vendor_offers for WPS from wps_catalog.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

const DRY_RUN = process.argv.includes('--dry');

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

    const { rows: [stats] } = await client.query(`
      SELECT
        COUNT(*)                                      AS total_wps,
        COUNT(*) FILTER (WHERE harddrive_catalog)     AS harddrive,
        COUNT(*) FILTER (WHERE dealer_price > 0)      AS has_price,
        COUNT(*) FILTER (WHERE in_stock)              AS has_stock
      FROM wps_catalog
    `);
    console.log('wps_catalog stats:', stats);

    const { rows: [xref] } = await client.query(`
      SELECT COUNT(*) AS matchable
      FROM wps_catalog w
      JOIN catalog_unified cu ON cu.vendor_sku = w.sku AND cu.source_vendor = 'WPS'
    `);
    console.log('Matchable WPS rows (catalog_unified join):', xref.matchable);

    if (DRY_RUN) {
      const { rows: preview } = await client.query(`
        SELECT
          cu.id        AS catalog_product_id,
          w.sku        AS vendor_part_number,
          w.dealer_price,
          w.list_price,
          w.warehouse_boise          AS id_qty,
          w.warehouse_fresno         AS ca_qty,
          w.warehouse_elizabethtown  AS pa_qty,
          w.warehouse_ashley         AS in_qty,
          w.warehouse_midlothian     AS tx_qty,
          w.warehouse_jessup         AS ga_qty,
          w.warehouse_midway         AS nv_qty
        FROM wps_catalog w
        JOIN catalog_unified cu ON cu.vendor_sku = w.sku AND cu.source_vendor = 'WPS'
        LIMIT 10
      `);
      console.log('Preview rows:');
      console.table(preview);
      console.log('-- DRY RUN complete, no changes made --');
      return;
    }

    console.log('Truncating vendor_offers...');
    await client.query('TRUNCATE vendor_offers');

    console.log('Inserting WPS vendor_offers...');
    const { rowCount } = await client.query(`
      INSERT INTO vendor_offers (
        catalog_product_id,
        vendor_code,
        vendor_part_number,
        wholesale_cost,
        msrp,
        map_price,
        drop_ship_fee,
        drop_ship_eligible,
        id_qty, ca_qty, pa_qty, in_qty, tx_qty, ga_qty, nv_qty,
        nc_qty, wi_qty, ny_qty,
        total_qty,
        in_stock,
        is_active
      )
      SELECT
        cu.id,
        'WPS',
        w.sku,
        w.dealer_price,
        w.list_price,
        w.map_price,
        COALESCE(w.drop_ship_fee, 0),
        COALESCE(w.drop_ship_eligible, false),
        COALESCE(w.warehouse_boise, 0),
        COALESCE(w.warehouse_fresno, 0),
        COALESCE(w.warehouse_elizabethtown, 0),
        COALESCE(w.warehouse_ashley, 0),
        COALESCE(w.warehouse_midlothian, 0),
        COALESCE(w.warehouse_jessup, 0),
        COALESCE(w.warehouse_midway, 0),
        0, 0, 0,
        COALESCE(w.warehouse_boise, 0) + COALESCE(w.warehouse_fresno, 0) +
        COALESCE(w.warehouse_elizabethtown, 0) + COALESCE(w.warehouse_ashley, 0) +
        COALESCE(w.warehouse_midlothian, 0) + COALESCE(w.warehouse_jessup, 0) +
        COALESCE(w.warehouse_midway, 0),
        w.in_stock,
        true
      FROM wps_catalog w
      JOIN catalog_unified cu ON cu.vendor_sku = w.sku AND cu.source_vendor = 'WPS'
      ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
        vendor_part_number = EXCLUDED.vendor_part_number,
        wholesale_cost     = EXCLUDED.wholesale_cost,
        msrp               = EXCLUDED.msrp,
        map_price          = EXCLUDED.map_price,
        drop_ship_fee      = EXCLUDED.drop_ship_fee,
        drop_ship_eligible = EXCLUDED.drop_ship_eligible,
        id_qty             = EXCLUDED.id_qty,
        ca_qty             = EXCLUDED.ca_qty,
        pa_qty             = EXCLUDED.pa_qty,
        in_qty             = EXCLUDED.in_qty,
        tx_qty             = EXCLUDED.tx_qty,
        ga_qty             = EXCLUDED.ga_qty,
        nv_qty             = EXCLUDED.nv_qty,
        total_qty          = EXCLUDED.total_qty,
        in_stock           = EXCLUDED.in_stock,
        updated_at         = now()
    `);
    console.log(`Inserted ${rowCount} vendor_offers rows`);

    const { rows: [summary] } = await client.query(`
      SELECT
        COUNT(*)                                   AS total,
        COUNT(*) FILTER (WHERE wholesale_cost > 0) AS has_cost,
        COUNT(*) FILTER (WHERE msrp > 0)           AS has_msrp,
        COUNT(*) FILTER (WHERE total_qty > 0)      AS has_stock,
        SUM(total_qty)                             AS total_units
      FROM vendor_offers
      WHERE vendor_code = 'WPS'
    `);
    console.log('vendor_offers WPS summary:', summary);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
