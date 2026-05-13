#!/usr/bin/env node
// import_wps_catalog.js
// Ingests WPS HardDrive data into wps_catalog
// Sources:
//   scripts/data/wps/master_item_wps.csv                    — product + pricing + flags
//   scripts/data/wps/Inventory-Files/WPS-inventory-04092026.csv — warehouse stock
//   scripts/data/wps/Catalogs/hdmstr_with_urls.csv          — image URLs
// Filter: harddrive_catalog=true

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const { Pool } = pg;

const WPS_DIR   = path.resolve('scripts/data/wps');
const MASTER    = path.join(WPS_DIR, 'master_item_wps.csv');
const INVENTORY = path.join(WPS_DIR, 'Inventory-Files', 'WPS-inventory-04092026.csv');
const IMAGES    = path.join(WPS_DIR, 'Catalogs', 'hdmstr_with_urls.csv');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// --- Helpers ---

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

// --- Main ---

async function main() {
  const client = await pool.connect();

  try {
    // Load inventory
    console.log('Loading inventory...');
    const invRaw = fs.readFileSync(INVENTORY, 'utf8');
    const invRows = parse(invRaw, { columns: true, skip_empty_lines: true, trim: true });
    const inventory = new Map();
    for (const row of invRows) {
      const total =
        parseInt2(row['boise']) +
        parseInt2(row['fresno']) +
        parseInt2(row['elizabethtown']) +
        parseInt2(row['ashley']) +
        parseInt2(row['midlothian']) +
        parseInt2(row['jessup']) +
        parseInt2(row['midway']);
      inventory.set(row['sku'], {
        boise:           parseInt2(row['boise']),
        fresno:          parseInt2(row['fresno']),
        elizabethtown:   parseInt2(row['elizabethtown']),
        ashley:          parseInt2(row['ashley']),
        midlothian:      parseInt2(row['midlothian']),
        jessup:          parseInt2(row['jessup']),
        midway:          parseInt2(row['midway']),
        total,
        in_stock: total > 0,
      });
    }
    console.log(`Inventory loaded: ${inventory.size}`);

    // Load images
    console.log('Loading images...');
    const imgRaw = fs.readFileSync(IMAGES, 'utf8');
    const imgRows = parse(imgRaw, { columns: true, skip_empty_lines: true, trim: true });
    const images = new Map();
    for (const row of imgRows) {
      images.set(row['sku'], {
        image_uri:        row['image_uri'] || null,
        image_width:      parseInt2(row['image_width']) || null,
        image_height:     parseInt2(row['image_height']) || null,
        supplier_item_id: row['supplier_item_id'] || null,
      });
    }
    console.log(`Images loaded: ${images.size}`);

    // Load master item file
    console.log('Loading master item file...');
    const masterRaw = fs.readFileSync(MASTER, 'utf8');
    const masterRows = parse(masterRaw, { columns: true, skip_empty_lines: true, trim: true });
    console.log(`Master rows: ${masterRows.length}`);

    // Filter to harddrive_catalog=true
    const filtered = masterRows.filter(row => parseBool(row['harddrive_catalog']));
    console.log(`HardDrive catalog rows: ${filtered.length}`);

    // Truncate and reload
    await client.query('TRUNCATE wps_catalog RESTART IDENTITY');
    console.log('wps_catalog truncated');

    let inserted = 0;
    let errors = 0;

    for (const row of filtered) {
      const sku = row['sku'];
      const inv = inventory.get(sku) || {
        boise: 0, fresno: 0, elizabethtown: 0, ashley: 0,
        midlothian: 0, jessup: 0, midway: 0, total: 0, in_stock: false
      };
      const img = images.get(sku) || {};

      try {
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
          sku,                                              // $1
          row['vendor_number'] || null,                     // $2
          row['superseded_sku'] || null,                    // $3
          row['upc'] || null,                               // $4
          row['name'],                                      // $5
          row['product_name'] || null,                      // $6
          row['brand'] || null,                             // $7
          row['product_type'] || null,                      // $8
          row['product_description'] || null,               // $9
          row['product_features'] || null,                  // $10
          row['status'] || null,                            // $11
          parseBool(row['harddrive_catalog']),               // $12
          parseBool(row['street_catalog']),                  // $13
          parseBool(row['offroad_catalog']),                 // $14
          parseBool(row['snow_catalog']),                    // $15
          parseBool(row['atv_catalog']),                     // $16
          parseBool(row['watercraft_catalog']),              // $17
          parseBool(row['bicycle_catalog']),                 // $18
          parseBool(row['flyracing_catalog']),               // $19
          parseBool(row['apparel_catalog']),                 // $20
          parseDecimal(row['list_price']),                   // $21
          parseDecimal(row['standard_dealer_price']),        // $22
          parseDecimal(row['mapp_price']),                   // $23
          parseBool(row['has_map_policy']),                  // $24
          parseBool(row['drop_ship_eligible']),              // $25
          parseDecimal(row['drop_ship_fee']),                // $26
          inv.boise,                                        // $27
          inv.fresno,                                       // $28
          inv.elizabethtown,                                // $29
          inv.ashley,                                       // $30
          inv.midlothian,                                   // $31
          inv.jessup,                                       // $32
          inv.midway,                                       // $33
          inv.in_stock,                                     // $34
          inv.total,                                        // $35
          parseDecimal(row['weight']),                      // $36
          parseDecimal(row['height']),                      // $37
          parseDecimal(row['length']),                      // $38
          parseDecimal(row['width']),                       // $39
          row['country_of_origin_code'] || null,            // $40
          row['country_of_origin_name'] || null,            // $41
          row['carb'] || null,                              // $42
          row['prop_65_code'] || null,                      // $43
          row['prop_65_detail'] || null,                    // $44
          row['primary_item_image'] || null,                // $45
          img.image_uri || null,                            // $46
          img.image_width || null,                          // $47
          img.image_height || null,                         // $48
          img.supplier_item_id || null,                     // $49
        ]);
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 5) console.error(`Error on SKU ${sku}:`, e.message);
      }

      if (inserted % 500 === 0) {
        process.stdout.write(`\r  ${inserted} inserted, ${errors} errors...`);
      }
    }

    console.log(`\n✅ Done — ${inserted} rows inserted into wps_catalog, ${errors} errors`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
