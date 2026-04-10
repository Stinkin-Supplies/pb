#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProgressBar } from './progress_bar.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const dbClient = new Client({
  connectionString: process.env.CATALOG_DATABASE_URL
});

async function createPUProductsTable() {
  await dbClient.query(`
    DROP TABLE IF EXISTS pu_products CASCADE;
    
    CREATE TABLE pu_products (
      id SERIAL PRIMARY KEY,
      sku VARCHAR(50) UNIQUE NOT NULL,
      uom VARCHAR(10),
      cost NUMERIC(10,2),
      msrp NUMERIC(10,2),
      name TEXT NOT NULL,
      brand VARCHAR(100),
      status VARCHAR(20),
      weight NUMERIC(8,2),
      notes TEXT,
      is_atv BOOLEAN DEFAULT false,
      is_snow BOOLEAN DEFAULT false,
      is_street BOOLEAN DEFAULT false,
      is_offroad BOOLEAN DEFAULT false,
      is_watercraft BOOLEAN DEFAULT false,
      map_price VARCHAR(1),
      truck_only BOOLEAN DEFAULT false,
      no_ship_ca BOOLEAN DEFAULT false,
      atv_catalog VARCHAR(10),
      snow_catalog VARCHAR(10),
      street_catalog VARCHAR(10),
      offroad_catalog VARCHAR(10),
      watercraft_catalog VARCHAR(10),
      warehouse_nc INTEGER DEFAULT 0,
      warehouse_nv INTEGER DEFAULT 0,
      warehouse_ny INTEGER DEFAULT 0,
      warehouse_tx INTEGER DEFAULT 0,
      warehouse_wi INTEGER DEFAULT 0,
      total_qty INTEGER DEFAULT 0,
      drop_ship_fee NUMERIC(10,2),
      original_retail NUMERIC(10,2),
      part_add_date VARCHAR(20),
      hazardous_code VARCHAR(20),
      vendor_part_number VARCHAR(100),
      price_changed_today BOOLEAN DEFAULT false,
      trademark VARCHAR(100),
      imported_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX idx_pu_products_sku ON pu_products(sku);
    CREATE INDEX idx_pu_products_brand ON pu_products(brand);
    CREATE INDEX idx_pu_products_status ON pu_products(status);
  `);
  console.log('✅ Created pu_products table\n');
}

async function insertBatch(batch) {
  if (batch.length === 0) return;
  
  const values = [];
  const placeholders = [];
  
  batch.forEach((product, idx) => {
    const paramStart = idx * 35 + 1;
    placeholders.push(
      `($${paramStart}, $${paramStart + 1}, $${paramStart + 2}, $${paramStart + 3}, $${paramStart + 4}, $${paramStart + 5}, $${paramStart + 6}, $${paramStart + 7}, $${paramStart + 8}, $${paramStart + 9}, $${paramStart + 10}, $${paramStart + 11}, $${paramStart + 12}, $${paramStart + 13}, $${paramStart + 14}, $${paramStart + 15}, $${paramStart + 16}, $${paramStart + 17}, $${paramStart + 18}, $${paramStart + 19}, $${paramStart + 20}, $${paramStart + 21}, $${paramStart + 22}, $${paramStart + 23}, $${paramStart + 24}, $${paramStart + 25}, $${paramStart + 26}, $${paramStart + 27}, $${paramStart + 28}, $${paramStart + 29}, $${paramStart + 30}, $${paramStart + 31}, $${paramStart + 32}, $${paramStart + 33}, $${paramStart + 34})`
    );

    values.push(
      product.sku || null,
      product.uom || null,
      product.cost !== undefined ? parseFloat(product.cost) : null,
      product.msrp !== undefined ? parseFloat(product.msrp) : null,
      product.name || null,
      product.brand || null,
      product.status || null,
      product.weight !== undefined ? parseFloat(product.weight) : null,
      product.notes || null,
      product.is_atv === true || product.is_atv === 'true' ? true : false,
      product.is_snow === true || product.is_snow === 'true' ? true : false,
      product.is_street === true || product.is_street === 'true' ? true : false,
      product.is_offroad === true || product.is_offroad === 'true' ? true : false,
      product.is_watercraft === true || product.is_watercraft === 'true' ? true : false,
      product.map_price || null,
      product.truck_only === true || product.truck_only === 'true' ? true : false,
      product.no_ship_ca === true || product.no_ship_ca === 'true' ? true : false,
      product.atv_catalog || null,
      product.snow_catalog || null,
      product.street_catalog || null,
      product.offroad_catalog || null,
      product.watercraft_catalog || null,
      product.warehouse_nc || 0,
      product.warehouse_nv || 0,
      product.warehouse_ny || 0,
      product.warehouse_tx || 0,
      product.warehouse_wi || 0,
      product.total_qty || 0,
      product.drop_ship_fee !== undefined ? parseFloat(product.drop_ship_fee) : null,
      product.original_retail !== undefined ? parseFloat(product.original_retail) : null,
      product.part_add_date || null,
      product.hazardous_code || null,
      product.vendor_part_number || null,
      product.price_changed_today === true || product.price_changed_today === 'true' ? true : false,
      product.trademark || null
    );
  });

  const query = `
    INSERT INTO pu_products (
      sku, uom, cost, msrp, name, brand, status, weight, notes,
      is_atv, is_snow, is_street, is_offroad, is_watercraft,
      map_price, truck_only, no_ship_ca,
      atv_catalog, snow_catalog, street_catalog, offroad_catalog, watercraft_catalog,
      warehouse_nc, warehouse_nv, warehouse_ny, warehouse_tx, warehouse_wi,
      total_qty, drop_ship_fee, original_retail,
      part_add_date, hazardous_code, vendor_part_number, price_changed_today, trademark
    ) VALUES ${placeholders.join(',')}
    ON CONFLICT (sku) DO UPDATE SET
      msrp = EXCLUDED.msrp,
      cost = EXCLUDED.cost,
      name = EXCLUDED.name
  `;
  
  await dbClient.query(query, values);
}

async function parseAndInsertPUData() {
  try {
    console.log('🚀 Starting PU data parsing (BATCH MODE)...\n');
    
    await dbClient.connect();
    console.log('✅ Connected to database');

    await createPUProductsTable();

    // Get all raw vendor PU data
    const { rows } = await dbClient.query(`
      SELECT id, payload FROM raw_vendor_pu
      WHERE payload IS NOT NULL
      ORDER BY id
    `);

    console.log(`📂 Found ${rows.length} raw_vendor_pu records\n`);

    const progressBar = new ProgressBar(rows.length, 'Processing records');
    
    let totalProducts = 0;
    const batchSize = 500;
    let batch = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const products = Array.isArray(row.payload) ? row.payload : [row.payload];
      
      for (const product of products) {
        // Skip products without SKU
        if (!product.sku) continue;
        
        batch.push(product);
        
        if (batch.length >= batchSize) {
          await insertBatch(batch);
          totalProducts += batch.length;
          batch = [];
        }
      }
      
      progressBar.update(i + 1, `${totalProducts.toLocaleString()} products`);
    }

    // Insert remaining batch
    if (batch.length > 0) {
      await insertBatch(batch);
      totalProducts += batch.length;
    }

    progressBar.finish(`${totalProducts.toLocaleString()} products inserted`);
    console.log();

    const { rows: stats } = await dbClient.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'S' THEN 1 END) as status_s,
        COUNT(CASE WHEN status = 'NEW' THEN 1 END) as status_new,
        COUNT(CASE WHEN cost > 0 THEN 1 END) as with_cost,
        COUNT(CASE WHEN msrp > 0 THEN 1 END) as with_msrp,
        COUNT(CASE WHEN brand IS NOT NULL THEN 1 END) as with_brand,
        SUM(total_qty) as total_inventory
      FROM pu_products
    `);

    console.log('📊 Import Summary:');
    console.log(`   Total products: ${stats[0].total.toLocaleString()}`);
    console.log(`   Status S: ${stats[0].status_s.toLocaleString()}`);
    console.log(`   Status NEW: ${stats[0].status_new.toLocaleString()}`);
    console.log(`   With cost: ${stats[0].with_cost.toLocaleString()} (${((stats[0].with_cost / stats[0].total) * 100).toFixed(1)}%)`);
    console.log(`   With MSRP: ${stats[0].with_msrp.toLocaleString()} (${((stats[0].with_msrp / stats[0].total) * 100).toFixed(1)}%)`);
    console.log(`   With brand: ${stats[0].with_brand.toLocaleString()} (${((stats[0].with_brand / stats[0].total) * 100).toFixed(1)}%)`);
    console.log(`   Total inventory: ${(stats[0].total_inventory || 0).toLocaleString()}`);

    const { rows: sample } = await dbClient.query(`
      SELECT sku, brand, name, cost, msrp FROM pu_products LIMIT 5
    `);

    console.log('\n📋 Sample Records:');
    sample.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.sku} | ${row.brand} | ${row.name} | $${row.cost}/$${row.msrp}`);
    });

    console.log('\n✨ PU data parsing complete!');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

parseAndInsertPUData();
