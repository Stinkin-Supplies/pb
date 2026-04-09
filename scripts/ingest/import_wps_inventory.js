#!/usr/bin/env node

/**
 * WPS Inventory Importer
 * Imports inventory/stock levels from WPS inventory file CSV into catalog database
 * 
 * Usage:
 *   node import_wps_inventory.js <path_to_inventory_file.csv>
 */

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import csv from 'csv-parser';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local' });
const { Pool } = pg;

const pool = new Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

async function importInventoryFile(filePath) {
  console.log(`\n📁 Reading inventory file: ${filePath}`);
  
  return new Promise((resolve, reject) => {
    const inventory = [];
    let rowCount = 0;
    let headers = null;
    let warehouseColumns = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        
        // Log headers on first row for debugging
        if (rowCount === 1) {
          headers = Object.keys(row);
          console.log(`\n📋 CSV Headers detected:`);
          console.log(`   ${headers.join(', ')}\n`);
          
          // Identify warehouse columns (all columns except 'sku')
          warehouseColumns = headers.filter(h => 
            h.toLowerCase() !== 'sku' && 
            h.toLowerCase() !== 'part number' &&
            h.toLowerCase() !== 'item'
          );
          
          if (warehouseColumns.length > 0) {
            console.log(`📦 Warehouse columns found: ${warehouseColumns.join(', ')}\n`);
          }
        }
        
        // Get SKU
        const sku = row['sku'] || row['SKU'] || row['Part Number'] || row['part_number'];
        
        if (!sku) {
          return; // Skip rows without SKU
        }
        
        // If we have warehouse columns, process each warehouse
        if (warehouseColumns.length > 0) {
          for (const warehouse of warehouseColumns) {
            const quantity = row[warehouse];
            if (quantity !== undefined && quantity !== null && quantity !== '') {
              const qtyValue = parseInt(quantity.toString().replace(/[^0-9]/g, '')) || 0;
              inventory.push({
                sku: sku.trim(),
                quantity: qtyValue,
                warehouse: warehouse.trim()
              });
            }
          }
        } else {
          // Fallback to original single quantity column format
          const quantity = row['Quantity'] || row['quantity'] || row['QTY'] || row['qty'];
          const warehouse = row['Warehouse'] || row['warehouse'] || 'WPS';
          
          if (quantity !== undefined) {
            const qtyValue = parseInt(quantity.toString().replace(/[^0-9]/g, '')) || 0;
            inventory.push({
              sku: sku.trim(),
              quantity: qtyValue,
              warehouse: warehouse.trim()
            });
          }
        }
        
        // Log progress every 10k rows
        if (rowCount % 10000 === 0) {
          console.log(`  Read ${rowCount.toLocaleString()} rows...`);
        }
      })
      .on('end', () => {
        console.log(`✅ Finished reading ${rowCount.toLocaleString()} rows`);
        console.log(`   Valid inventory records: ${inventory.length.toLocaleString()}`);
        if (inventory.length === 0) {
          console.log('\n⚠️  Warning: No inventory was parsed!');
          console.log('   CSV Headers found:', headers);
          console.log('   Please check the column names in your CSV file.');
        }
        resolve(inventory);
      })
      .on('error', reject);
  });
}

async function insertInventory(inventory) {
  console.log(`\n💾 Inserting ${inventory.length.toLocaleString()} inventory records into database...\n`);
  
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  const progress = new ProgressBar(inventory.length, 'Importing inventory');
  const BATCH_SIZE = 1000; // Insert 1000 at a time
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < inventory.length; i += BATCH_SIZE) {
      const batch = inventory.slice(i, i + BATCH_SIZE);
      
      // Build multi-row insert
      const values = [];
      const placeholders = [];
      
      batch.forEach((item, idx) => {
        const offset = idx * 4;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        values.push(item.sku, item.quantity, item.warehouse, 'WPS');
      });
      
      try {
        const query = `
          INSERT INTO catalog_inventory (sku, quantity, warehouse, supplier)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (sku, supplier, warehouse)
          DO UPDATE SET
            quantity = EXCLUDED.quantity,
            updated_at = NOW()
        `;
        
        await client.query(query, values);
        inserted += batch.length;
        
      } catch (err) {
        // If batch fails, fall back to individual inserts for this batch
        for (const item of batch) {
          try {
            await client.query(`
              INSERT INTO catalog_inventory (sku, quantity, warehouse, supplier)
              VALUES ($1, $2, $3, 'WPS')
              ON CONFLICT (sku, supplier, warehouse)
              DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()
            `, [item.sku, item.quantity, item.warehouse]);
            inserted++;
          } catch (itemErr) {
            errors++;
          }
        }
      }
      
      // Update progress bar
      progress.update(Math.min(i + BATCH_SIZE, inventory.length));
    }
    
    await client.query('COMMIT');
    
    progress.finish('Import complete');
    
    console.log(`\n✅ Database import complete:`);
    console.log(`   Inserted/Updated: ${inserted.toLocaleString()}`);
    if (errors > 0) {
      console.log(`   Errors: ${errors.toLocaleString()}`);
    }
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function analyzeInventory() {
  console.log('\n📊 Inventory Analysis:');
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_records,
      COUNT(DISTINCT sku) as unique_skus,
      SUM(quantity) as total_units,
      AVG(quantity)::INTEGER as avg_quantity,
      MAX(quantity) as max_quantity
    FROM catalog_inventory
    WHERE supplier = 'WPS'
  `);
  
  const s = stats.rows[0];
  console.log(`  Total records: ${parseInt(s.total_records).toLocaleString()}`);
  console.log(`  Unique SKUs: ${parseInt(s.unique_skus).toLocaleString()}`);
  console.log(`  Total units: ${parseInt(s.total_units).toLocaleString()}`);
  console.log(`  Average quantity: ${s.avg_quantity}`);
  console.log(`  Max quantity: ${s.max_quantity} (shows 25+ as 25)`);
  
  // Check overlap with catalog
  const overlap = await pool.query(`
    SELECT COUNT(DISTINCT inv.sku) as matched
    FROM catalog_inventory inv
    WHERE inv.supplier = 'WPS'
      AND EXISTS (
        SELECT 1 FROM catalog_products cp WHERE cp.sku = inv.sku
      )
  `);
  
  console.log(`  Matched with catalog: ${parseInt(overlap.rows[0].matched).toLocaleString()}`);
  
  // Count in-stock vs out-of-stock
  const stockStatus = await pool.query(`
    SELECT 
      COUNT(CASE WHEN quantity > 0 THEN 1 END) as in_stock,
      COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
      COUNT(CASE WHEN quantity >= 25 THEN 1 END) as high_stock
    FROM catalog_inventory
    WHERE supplier = 'WPS'
  `);
  
  const ss = stockStatus.rows[0];
  console.log(`  In stock: ${parseInt(ss.in_stock).toLocaleString()}`);
  console.log(`  Out of stock: ${parseInt(ss.out_of_stock).toLocaleString()}`);
  console.log(`  High stock (25+): ${parseInt(ss.high_stock).toLocaleString()}`);
}

async function main() {
  const inventoryFilePath = process.argv[2];
  
  if (!inventoryFilePath) {
    console.log(`
WPS Inventory Importer

Usage:
  node import_wps_inventory.js <path_to_inventory_file.csv>

Example:
  node import_wps_inventory.js ~/Downloads/WPS_Inventory.csv

This will:
  1. Read inventory CSV file
  2. Import stock levels into catalog_inventory table
  3. Show statistics
    `);
    process.exit(0);
  }
  
  if (!fs.existsSync(inventoryFilePath)) {
    console.error(`❌ File not found: ${inventoryFilePath}`);
    process.exit(1);
  }
  
  try {
    const inventory = await importInventoryFile(inventoryFilePath);
    
    if (inventory.length === 0) {
      console.log('\n⚠️  No inventory to import. Check CSV format.');
      process.exit(1);
    }
    
    await insertInventory(inventory);
    await analyzeInventory();
    
    console.log('\n🎉 Import complete!');
    console.log('\nNext steps:');
    console.log('  1. Wait for pricing CSV to finish downloading');
    console.log('  2. Import pricing with: node import_wps_pricing.js <pricing_file.csv>');
    console.log('  3. Start enriching products with inventory + pricing data');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
