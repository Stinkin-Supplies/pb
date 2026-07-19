#!/usr/bin/env node
/**
 * populate_wps_vendor_offers.js
 * Rebuilds vendor_offers for WPS from wps_catalog.
 * Source: wps_catalog (harddrive_catalog=true rows already filtered at ingest)
 * Target: vendor_offers
 *
 * Warehouse → qty column mapping:
 *   warehouse_boise        → id_qty
 *   warehouse_fresno       → ca_qty
 *   warehouse_elizabethtown→ pa_qty
 *   warehouse_ashley       → in_qty
 *   warehouse_midlothian   → tx_qty
 *   warehouse_jessup       → ga_qty
 *   warehouse_midway       → nv_qty
 *   nc_qty                 = 0 (no WPS warehouse)
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const DRY_RUN = process.argv.includes('--dry');

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

    // ── 1. Inspect what we have ──────────────────────────────────────────────
    const { rows: [stats] } = await client.query(`
      SELECT
        COUNT(*) AS total_wps,
        COUNT(*) FILTER (WHERE harddrive_catalog = true) AS harddrive,
        COUNT(*) FILTER (WHERE dealer_price > 0) AS has_price,
        COUNT(*) FILTER (
          WHERE warehouse_boise > 0
             OR warehouse_fresno > 0
             OR warehouse_elizabethtown > 0
             OR warehouse_ashley > 0
             OR warehouse_midlothian > 0
             OR warehouse_jessup > 0
             OR warehouse_midway > 0
        ) AS has_stock
      FROM wps_catalog
    `);
    console.log('wps_catalog stats:', stats);

    // ── 2. Count cross-matchable rows ────────────────────────────────────────
    const { rows: [xref] } = await client.query(`
      SELECT COUNT(*) AS matchable
      FROM wps_catalog w
      JOIN catalog_unified cu ON cu.sku = w.vendor_item_id
                              AND cu.source_vendor = 'WPS'
      WHERE w.harddrive_catalog = true
    `);
    console.log('Matchable WPS rows (catalog_unified join):', xref.matchable);

    if (DRY_RUN) {
      // Preview first 10
      const { rows: preview } = await client.query(`
        SELECT
          cu.id AS catalog_product_id,
          w.vendor_item_id AS vendor_sku,
          w.dealer_price,
          w.retail_price,
          w.warehouse_boise   AS id_qty,
          w.warehouse_fresno  AS ca_qty,
          w.warehouse_elizabethtown AS pa_qty,
          w.warehouse_ashley  AS in_qty,
          w.warehouse_midlothian AS tx_qty,
          w.warehouse_jessup  AS ga_qty,
          w.warehouse_midway  AS nv_qty
        FROM wps_catalog w
        JOIN catalog_unified cu ON cu.sku = w.vendor_item_id
                                AND cu.source_vendor = 'WPS'
        WHERE w.harddrive_catalog = true
        LIMIT 10
      `);
      console.log('Preview rows:');
      console.table(preview);
      console.log('-- DRY RUN complete, no changes made --');
      return;
    }

    // ── 3. Truncate and rebuild ──────────────────────────────────────────────
    console.log('Truncating vendor_offers...');
    await client.query(`TRUNCATE vendor_offers`);

    console.log('Inserting WPS vendor_offers...');
    const { rowCount } = await client.query(`
      INSERT INTO vendor_offers (
        catalog_product_id,
        vendor_code,
        vendor_sku,
        cost,
        msrp,
        id_qty,
        ca_qty,
        pa_qty,
        in_qty,
        tx_qty,
        ga_qty,
        nv_qty,
        nc_qty
      )
      SELECT
        cu.id                          AS catalog_product_id,
        'WPS'                          AS vendor_code,
        w.vendor_item_id               AS vendor_sku,
        w.dealer_price                 AS cost,
        w.retail_price                 AS msrp,
        COALESCE(w.warehouse_boise, 0)            AS id_qty,
        COALESCE(w.warehouse_fresno, 0)           AS ca_qty,
        COALESCE(w.warehouse_elizabethtown, 0)    AS pa_qty,
        COALESCE(w.warehouse_ashley, 0)           AS in_qty,
        COALESCE(w.warehouse_midlothian, 0)       AS tx_qty,
        COALESCE(w.warehouse_jessup, 0)           AS ga_qty,
        COALESCE(w.warehouse_midway, 0)           AS nv_qty,
        0                                         AS nc_qty
      FROM wps_catalog w
      JOIN catalog_unified cu ON cu.sku = w.vendor_item_id
                              AND cu.source_vendor = 'WPS'
      WHERE w.harddrive_catalog = true
      ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
        vendor_sku = EXCLUDED.vendor_sku,
        cost       = EXCLUDED.cost,
        msrp       = EXCLUDED.msrp,
        id_qty     = EXCLUDED.id_qty,
        ca_qty     = EXCLUDED.ca_qty,
        pa_qty     = EXCLUDED.pa_qty,
        in_qty     = EXCLUDED.in_qty,
        tx_qty     = EXCLUDED.tx_qty,
        ga_qty     = EXCLUDED.ga_qty,
        nv_qty     = EXCLUDED.nv_qty,
        nc_qty     = EXCLUDED.nc_qty
    `);
    console.log(`Inserted ${rowCount} vendor_offers rows`);

    // ── 4. Summary ────────────────────────────────────────────────────────────
    const { rows: [summary] } = await client.query(`
      SELECT
        COUNT(*)                                         AS total,
        COUNT(*) FILTER (WHERE cost > 0)                AS has_cost,
        COUNT(*) FILTER (WHERE msrp > 0)                AS has_msrp,
        COUNT(*) FILTER (
          WHERE id_qty > 0 OR ca_qty > 0 OR pa_qty > 0
             OR in_qty > 0 OR tx_qty > 0 OR ga_qty > 0
             OR nv_qty > 0
        )                                               AS has_stock,
        SUM(id_qty + ca_qty + pa_qty + in_qty + tx_qty + ga_qty + nv_qty) AS total_units
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
