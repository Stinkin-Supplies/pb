#!/usr/bin/env node

/**
 * HardDrive Image List Importer
 * Imports HardDrive catalog data with brands and image dimensions
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

async function importHardDriveData(filePath) {
  console.log(`\n📁 Reading HardDrive Image List: ${filePath}\n`);
  
  return new Promise((resolve, reject) => {
    const products = [];
    let rowCount = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        
        if (row.sku) {
          products.push({
            sku: row.sku.trim(),
            name: row.name?.trim() || null,
            brand: row.brand?.trim() || null,
            supplier_item_id: row.supplier_item_id?.trim() || null,
            image_uri: row.image_uri?.trim() || null,
            image_width: parseInt(row.image_width) || null,
            image_height: parseInt(row.image_height) || null
          });
        }
        
        if (rowCount % 5000 === 0) {
          console.log(`  Read ${rowCount.toLocaleString()} rows...`);
        }
      })
      .on('end', () => {
        console.log(`✅ Finished reading ${rowCount.toLocaleString()} rows`);
        console.log(`   Valid products: ${products.length.toLocaleString()}\n`);
        resolve(products);
      })
      .on('error', reject);
  });
}

async function updateProducts(products) {
  console.log(`💾 Updating ${products.length.toLocaleString()} products...\n`);
  
  const progress = new ProgressBar(products.length, 'Updating products');
  const client = await pool.connect();
  
  let updated = 0;
  let notFound = 0;
  let brandUpdates = 0;
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      
      try {
        // Update catalog_products with brand info
        const result = await client.query(`
          UPDATE catalog_products
          SET 
            brand = COALESCE($2, brand),
            updated_at = NOW()
          WHERE sku = $1
          RETURNING id
        `, [p.sku, p.brand]);
        
        if (result.rowCount > 0) {
          updated++;
          if (p.brand) brandUpdates++;
        } else {
          notFound++;
        }
        
        // Store HardDrive-specific metadata
        if (p.supplier_item_id || p.image_width) {
          await client.query(`
            INSERT INTO catalog_product_enrichment 
              (sku, metadata, product_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (sku)
            DO UPDATE SET
              metadata = EXCLUDED.metadata,
              product_name = COALESCE(EXCLUDED.product_name, catalog_product_enrichment.product_name),
              updated_at = NOW()
          `, [
            p.sku,
            JSON.stringify({
              supplier_item_id: p.supplier_item_id,
              image_width: p.image_width,
              image_height: p.image_height,
              brand: p.brand,
              source: 'harddrive_image_list'
            }),
            p.name
          ]);
        }
        
      } catch (err) {
        console.error(`\nError with SKU ${p.sku}:`, err.message);
      }
      
      progress.update(i + 1);
    }
    
    await client.query('COMMIT');
    progress.finish('Complete');
    
    console.log(`\n✅ Import complete:`);
    console.log(`   Products updated: ${updated.toLocaleString()}`);
    console.log(`   Brands added: ${brandUpdates.toLocaleString()}`);
    console.log(`   Not found in catalog: ${notFound.toLocaleString()}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function analyzeResults() {
  console.log('\n📊 Analysis:\n');
  
  // Brand distribution
  const brands = await pool.query(`
    SELECT brand, COUNT(*) as count
    FROM catalog_products
    WHERE harddrive_catalog = 'yes'
      AND brand IS NOT NULL
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 10
  `);
  
  console.log('Top 10 brands in HardDrive catalog:');
  brands.rows.forEach(b => {
    console.log(`   ${b.brand}: ${parseInt(b.count).toLocaleString()} products`);
  });
  
  // Enrichment coverage
  const coverage = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE harddrive_catalog = 'yes') as total_harddrive,
      COUNT(*) FILTER (WHERE harddrive_catalog = 'yes' AND brand IS NOT NULL) as with_brand,
      COUNT(DISTINCT pe.sku) as enriched
    FROM catalog_products cp
    LEFT JOIN catalog_product_enrichment pe ON cp.sku = pe.sku
    WHERE cp.harddrive_catalog = 'yes'
  `);
  
  const c = coverage.rows[0];
  console.log(`\n  Total HardDrive products: ${parseInt(c.total_harddrive).toLocaleString()}`);
  console.log(`  With brand info: ${parseInt(c.with_brand).toLocaleString()}`);
  console.log(`  With enrichment data: ${parseInt(c.enriched).toLocaleString()}`);
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log(`
HardDrive Image List Importer

Usage:
  node import_harddrive_imagelist.js <path_to_csv>

Example:
  node import_harddrive_imagelist.js Harddrive-Image-List-0426.csv

This will:
  1. Read HardDrive product data from CSV
  2. Update catalog_products with brand info
  3. Store metadata in catalog_product_enrichment
    `);
    process.exit(0);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    const products = await importHardDriveData(filePath);
    await updateProducts(products);
    await analyzeResults();
    
    console.log('\n🎉 HardDrive data imported!');
    console.log('\nNext: You now have brand info for 31K products without needing API calls!\n');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
