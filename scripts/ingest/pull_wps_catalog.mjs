#!/usr/bin/env node
/**
 * pull_wps_catalog.mjs
 *
 * Replaces import_wps_catalog.js (same truncate-then-reload pattern that
 * caused catalog_unified's data loss -- see HANDOFF_LOG.md). The per-row
 * logic here is unchanged from the original (it already used
 * ON CONFLICT (sku) DO UPDATE correctly); the only structural change is
 * removing the unconditional full-table wipe that ran before the
 * loop, and adding the same dry-run-by-default / --apply / single-transaction
 * guards as every other script in this recovery pass.
 *
 * Sources (unchanged):
 *   scripts/data/wps/master_item_wps.csv                    — product + pricing + flags
 *   scripts/data/wps/Inventory-Files/WPS-inventory-04092026.csv — warehouse stock
 *   scripts/data/wps/Catalogs/hdmstr_with_urls.csv          — image URLs
 * Filter: harddrive_catalog=true
 *
 * Usage:
 *   node pull_wps_catalog.mjs            # dry run
 *   node pull_wps_catalog.mjs --apply    # writes rows
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');

const WPS_DIR   = path.resolve('scripts/data/wps');
const MASTER    = path.join(WPS_DIR, 'master_item_wps.csv');
const INVENTORY = path.join(WPS_DIR, 'Inventory-Files', 'WPS-inventory-04092026.csv');
const IMAGES    = path.join(WPS_DIR, 'Catalogs', 'hdmstr_with_urls.csv');

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function parseBool(val) {
  if (!val) return false;
  const s = val.toString().trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'y' || s === 'yes';
}

function parseDecimal(val) {
  if (!val || val.toString().trim() === '') return null;
  const n = parseFloat(val.toString().replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parseInt2(val) {
  if (!val || val.toString().trim() === '') return 0;
  const n = parseInt(val.toString().trim());
  return isNaN(n) ? 0 : n;
}

async function main() {
  for (const [label, p] of [['master item file', MASTER], ['inventory file', INVENTORY], ['images file', IMAGES]]) {
    if (!fs.existsSync(p)) {
      console.error(`Missing ${label}: ${p}`);
      process.exit(1);
    }
  }

  const client = await pool.connect();
  try {
    console.log('Loading inventory...');
    const invRows = parse(fs.readFileSync(INVENTORY, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
    const inventory = new Map();
    for (const row of invRows) {
      const total =
        parseInt2(row['boise']) + parseInt2(row['fresno']) + parseInt2(row['elizabethtown']) +
        parseInt2(row['ashley']) + parseInt2(row['midlothian']) + parseInt2(row['jessup']) + parseInt2(row['midway']);
      inventory.set(row['sku'], {
        boise: parseInt2(row['boise']), fresno: parseInt2(row['fresno']),
        elizabethtown: parseInt2(row['elizabethtown']), ashley: parseInt2(row['ashley']),
        midlothian: parseInt2(row['midlothian']), jessup: parseInt2(row['jessup']), midway: parseInt2(row['midway']),
        total, in_stock: total > 0,
      });
    }
    console.log(`Inventory loaded: ${inventory.size}`);

    console.log('Loading images...');
    const imgRows = parse(fs.readFileSync(IMAGES, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
    const images = new Map();
    for (const row of imgRows) {
      images.set(row['sku'], {
        image_uri: row['image_uri'] || null,
        image_width: parseInt2(row['image_width']) || null,
        image_height: parseInt2(row['image_height']) || null,
        supplier_item_id: row['supplier_item_id'] || null,
      });
    }
    console.log(`Images loaded: ${images.size}`);

    console.log('Loading master item file...');
    const masterRows = parse(fs.readFileSync(MASTER, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
    console.log(`Master rows: ${masterRows.length}`);

    const filtered = masterRows.filter((row) => parseBool(row['harddrive_catalog']));
    console.log(`HardDrive catalog rows: ${filtered.length}`);

    const existing = await client.query(`SELECT sku FROM wps_catalog`);
    const existingSkus = new Set(existing.rows.map((r) => r.sku));
    const newCount = filtered.filter((r) => !existingSkus.has(r['sku'])).length;

    console.log(`\n=== Sync plan ===`);
    console.log(`  wps_catalog currently has ${existingSkus.size} rows`);
    console.log(`  ${newCount} new inserts, ${filtered.length - newCount} existing rows refreshed`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    console.log('\nApplying (single transaction)...');
    await client.query('BEGIN');

    let inserted = 0, errors = 0;
    for (const row of filtered) {
      const sku = row['sku'];
      const invData = inventory.get(sku) || {
        boise: 0, fresno: 0, elizabethtown: 0, ashley: 0, midlothian: 0, jessup: 0, midway: 0, total: 0, in_stock: false,
      };
      const img = images.get(sku) || {};

      try {
        await client.query('SAVEPOINT row_sp');
        await client.query(`
          INSERT INTO wps_catalog (
            sku, vendor_number, superseded_sku, upc,
            name, product_name, brand, product_type, product_description, product_features, status,
            harddrive_catalog, street_catalog, offroad_catalog, snow_catalog, atv_catalog,
            watercraft_catalog, bicycle_catalog, flyracing_catalog, apparel_catalog,
            list_price, dealer_price, map_price, has_map_policy, drop_ship_eligible, drop_ship_fee,
            warehouse_boise, warehouse_fresno, warehouse_elizabethtown, warehouse_ashley,
            warehouse_midlothian, warehouse_jessup, warehouse_midway,
            in_stock, stock_quantity,
            weight, height_in, length_in, width_in,
            country_of_origin_code, country_of_origin_name,
            carb, prop_65_code, prop_65_detail,
            image_url, image_uri, image_width, image_height, supplier_item_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
            $41,$42,$43,$44,$45,$46,$47,$48,$49
          )
          ON CONFLICT (sku) DO UPDATE SET
            dealer_price = EXCLUDED.dealer_price,
            list_price = EXCLUDED.list_price,
            warehouse_boise = EXCLUDED.warehouse_boise,
            warehouse_fresno = EXCLUDED.warehouse_fresno,
            warehouse_elizabethtown = EXCLUDED.warehouse_elizabethtown,
            warehouse_ashley = EXCLUDED.warehouse_ashley,
            warehouse_midlothian = EXCLUDED.warehouse_midlothian,
            warehouse_jessup = EXCLUDED.warehouse_jessup,
            warehouse_midway = EXCLUDED.warehouse_midway,
            in_stock = EXCLUDED.in_stock,
            stock_quantity = EXCLUDED.stock_quantity,
            updated_at = now()
        `, [
          sku, row['vendor_number'] || null, row['superseded_sku'] || null, row['upc'] || null,
          row['name'], row['product_name'] || null, row['brand'] || null, row['product_type'] || null,
          row['product_description'] || null, row['product_features'] || null, row['status'] || null,
          parseBool(row['harddrive_catalog']), parseBool(row['street_catalog']), parseBool(row['offroad_catalog']),
          parseBool(row['snow_catalog']), parseBool(row['atv_catalog']), parseBool(row['watercraft_catalog']),
          parseBool(row['bicycle_catalog']), parseBool(row['flyracing_catalog']), parseBool(row['apparel_catalog']),
          parseDecimal(row['list_price']), parseDecimal(row['standard_dealer_price']), parseDecimal(row['mapp_price']),
          parseBool(row['has_map_policy']), parseBool(row['drop_ship_eligible']), parseDecimal(row['drop_ship_fee']),
          invData.boise, invData.fresno, invData.elizabethtown, invData.ashley,
          invData.midlothian, invData.jessup, invData.midway,
          invData.in_stock, invData.total,
          parseDecimal(row['weight']), parseDecimal(row['height']), parseDecimal(row['length']), parseDecimal(row['width']),
          row['country_of_origin_code'] || null, row['country_of_origin_name'] || null,
          row['carb'] || null, row['prop_65_code'] || null, row['prop_65_detail'] || null,
          row['primary_item_image'] || null, img.image_uri || null, img.image_width || null,
          img.image_height || null, img.supplier_item_id || null,
        ]);
        await client.query('RELEASE SAVEPOINT row_sp');
        inserted++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`\n  Error on SKU ${sku}:`, e.message);
      }
      if ((inserted + errors) % 500 === 0) process.stdout.write(`\r  ${inserted}/${filtered.length} synced, ${errors} errors`);
    }
    console.log(`\n  ${inserted}/${filtered.length} synced, ${errors} errors`);

    const finalCount = await client.query(`SELECT COUNT(*) FROM wps_catalog`);
    console.log(`\nCommitting. wps_catalog now has ${finalCount.rows[0].count} rows.`);
    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nRolled back due to error -- wps_catalog is unchanged from before this run:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
