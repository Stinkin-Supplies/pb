#!/usr/bin/env node

/**
 * HardDrive Image List Importer (ULTRA FAST - BULK UPDATES)
 * Imports HardDrive catalog data with brands and image URLs
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

async function updateProductsBulk(products) {
  console.log(`💾 Updating ${products.length.toLocaleString()} products (BULK MODE)...\n`);
  
  const BATCH_SIZE = 1000;
  const progress = new ProgressBar(products.length, 'Importing data');
  const client = await pool.connect();
  
  let brandUpdates = 0;
  let imageInserts = 0;
  let enrichmentInserts = 0;
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      
      // BULK UPDATE BRANDS using temporary table
      const brandsToUpdate = batch.filter(p => p.brand);
      if (brandsToUpdate.length > 0) {
        // Drop temp table if exists, then create
        await client.query(`DROP TABLE IF EXISTS temp_brands`);
        await client.query(`
          CREATE TEMP TABLE temp_brands (
            sku TEXT,
            brand TEXT
          )
        `);
        
        // Insert into temp table
        const brandValues = [];
        const brandPlaceholders = [];
        for (let j = 0; j < brandsToUpdate.length; j++) {
          brandPlaceholders.push(`($${j*2+1}, $${j*2+2})`);
          brandValues.push(brandsToUpdate[j].sku, brandsToUpdate[j].brand);
        }
        
        await client.query(`
          INSERT INTO temp_brands (sku, brand)
          VALUES ${brandPlaceholders.join(', ')}
        `, brandValues);
        
        // Bulk update from temp table
        const result = await client.query(`
          UPDATE catalog_products cp
          SET brand = tb.brand, updated_at = NOW()
          FROM temp_brands tb
          WHERE cp.sku = tb.sku
        `);
        brandUpdates += result.rowCount;
      }
      
      // BULK INSERT IMAGES
      const productsWithImages = batch.filter(p => p.image_uri);
      if (productsWithImages.length > 0) {
        // Get product IDs
        const skuList = productsWithImages.map(p => p.sku);
        const skuPlaceholders = skuList.map((_, idx) => `$${idx + 1}`).join(',');
        const productIdMap = await client.query(`
          SELECT id, sku FROM catalog_products WHERE sku IN (${skuPlaceholders})
        `, skuList);
        
        const skuToId = {};
        productIdMap.rows.forEach(row => {
          skuToId[row.sku] = row.id;
        });
        
        // Bulk insert images
        const imageValues = [];
        const imagePlaceholders = [];
        let paramCount = 1;
        
        for (const p of productsWithImages) {
          if (skuToId[p.sku]) {
            imagePlaceholders.push(`($${paramCount}, $${paramCount+1}, $${paramCount+2}, $${paramCount+3})`);
            imageValues.push(skuToId[p.sku], p.image_uri, 'image', 1);
            paramCount += 4;
          }
        }
        
        if (imagePlaceholders.length > 0) {
          await client.query(`
            INSERT INTO catalog_media (product_id, url, media_type, priority)
            VALUES ${imagePlaceholders.join(', ')}
            ON CONFLICT (product_id, url) 
            DO UPDATE SET priority = EXCLUDED.priority
          `, imageValues);
          imageInserts += imagePlaceholders.length;
        }
      }
      
      // BULK INSERT ENRICHMENT
      // Deduplicate by SKU within batch
      const seenSkus = new Set();
      const uniqueProducts = [];
      for (let j = batch.length - 1; j >= 0; j--) {
        if (!seenSkus.has(batch[j].sku)) {
          seenSkus.add(batch[j].sku);
          uniqueProducts.unshift(batch[j]);
        }
      }
      
      const enrichValues = [];
      const enrichPlaceholders = [];
      let enrichParamCount = 1;
      
      for (const p of uniqueProducts) {
        enrichPlaceholders.push(`($${enrichParamCount}, $${enrichParamCount+1}, $${enrichParamCount+2})`);
        enrichValues.push(
          p.sku,
          JSON.stringify({
            supplier_item_id: p.supplier_item_id,
            image_width: p.image_width,
            image_height: p.image_height,
            brand: p.brand,
            image_url: p.image_uri,
            source: 'harddrive_image_list'
          }),
          p.name
        );
        enrichParamCount += 3;
      }
      
      if (enrichPlaceholders.length > 0) {
        await client.query(`
          INSERT INTO catalog_product_enrichment (sku, metadata, product_name)
          VALUES ${enrichPlaceholders.join(', ')}
          ON CONFLICT (sku)
          DO UPDATE SET
            metadata = EXCLUDED.metadata,
            product_name = COALESCE(EXCLUDED.product_name, catalog_product_enrichment.product_name),
            updated_at = NOW()
        `, enrichValues);
        enrichmentInserts += enrichPlaceholders.length;
      }
      
      progress.update(Math.min(i + BATCH_SIZE, products.length));
    }
    
    await client.query('COMMIT');
    progress.finish('Complete');
    
    console.log(`\n✅ Import complete:`);
    console.log(`   Brands updated: ${brandUpdates.toLocaleString()}`);
    console.log(`   Images added: ${imageInserts.toLocaleString()}`);
    console.log(`   Enrichment records: ${enrichmentInserts.toLocaleString()}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function analyzeResults() {
  console.log('\n📊 Analysis:\n');
  
  const brands = await pool.query(`
    SELECT brand, COUNT(*) as count
    FROM catalog_products
    WHERE brand IS NOT NULL
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 10
  `);
  
  console.log('Top 10 brands in catalog:');
  brands.rows.forEach(b => {
    console.log(`   ${b.brand}: ${parseInt(b.count).toLocaleString()} products`);
  });
  
  const coverage = await pool.query(`
    SELECT 
      COUNT(*) as total_products,
      COUNT(*) FILTER (WHERE brand IS NOT NULL) as with_brand,
      COUNT(DISTINCT cm.product_id) as with_images
    FROM catalog_products cp
    LEFT JOIN catalog_media cm ON cp.id = cm.product_id
  `);
  
  const c = coverage.rows[0];
  console.log(`\n  Total products: ${parseInt(c.total_products).toLocaleString()}`);
  console.log(`  With brand info: ${parseInt(c.with_brand).toLocaleString()}`);
  console.log(`  With images: ${parseInt(c.with_images).toLocaleString()}`);
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log(`
HardDrive Image List Importer (ULTRA FAST)

Usage:
  node import_harddrive_ultra_fast.js <path_to_csv>

Example:
  node import_harddrive_ultra_fast.js hdmstr_with_urls.csv
    `);
    process.exit(0);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    const products = await importHardDriveData(filePath);
    await updateProductsBulk(products);
    await analyzeResults();
    
    console.log('\n🎉 HardDrive data imported!');
    console.log('\n31K products now have brands and image URLs!\n');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
