#!/usr/bin/env node

/**
 * HardDrive Image List Importer (OPTIMIZED with BATCHING)
 * Imports HardDrive catalog data with brands and image URLs - FAST VERSION
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

async function updateProductsBatched(products) {
  console.log(`💾 Updating ${products.length.toLocaleString()} products (BATCHED)...\n`);
  
  const BATCH_SIZE = 500;
  const progress = new ProgressBar(products.length, 'Updating products');
  const client = await pool.connect();
  
  let updated = 0;
  let brandUpdates = 0;
  let imageInserts = 0;
  let enrichmentInserts = 0;
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      
      // BATCH 1: Update brands
      for (const p of batch) {
        if (p.brand) {
          const result = await client.query(`
            UPDATE catalog_products
            SET brand = $2, updated_at = NOW()
            WHERE sku = $1
          `, [p.sku, p.brand]);
          
          if (result.rowCount > 0) {
            updated++;
            brandUpdates++;
          }
        }
      }
      
      // BATCH 2: Insert images (batched)
      // First get product IDs for these SKUs
      const skuList = batch.filter(p => p.image_uri).map(p => p.sku);
      
      if (skuList.length > 0) {
        const skuPlaceholders = skuList.map((_, i) => `$${i + 1}`).join(',');
        const productIdMap = await client.query(`
          SELECT id, sku FROM catalog_products WHERE sku IN (${skuPlaceholders})
        `, skuList);
        
        const skuToId = {};
        productIdMap.rows.forEach(row => {
          skuToId[row.sku] = row.id;
        });
        
        const imageValues = [];
        const imagePlaceholders = [];
        let paramCount = 1;
        
        for (const p of batch) {
          if (p.image_uri && skuToId[p.sku]) {
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
            DO UPDATE SET
              priority = EXCLUDED.priority
          `, imageValues);
          imageInserts += imagePlaceholders.length;
        }
      }
      
      // BATCH 3: Insert enrichment data (batched) - includes image dimensions
      const enrichValues = [];
      const enrichPlaceholders = [];
      let enrichParamCount = 1;
      
      // Deduplicate by SKU within this batch (keep last occurrence)
      const seenSkus = new Set();
      const uniqueProducts = [];
      for (let i = batch.length - 1; i >= 0; i--) {
        if (!seenSkus.has(batch[i].sku)) {
          seenSkus.add(batch[i].sku);
          uniqueProducts.unshift(batch[i]);
        }
      }
      
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
    console.log(`   Products updated: ${updated.toLocaleString()}`);
    console.log(`   Brands added: ${brandUpdates.toLocaleString()}`);
    console.log(`   Images added/updated: ${imageInserts.toLocaleString()}`);
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
  
  const coverage = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE harddrive_catalog = 'yes') as total_harddrive,
      COUNT(*) FILTER (WHERE harddrive_catalog = 'yes' AND brand IS NOT NULL) as with_brand,
      COUNT(DISTINCT cm.sku) as with_images
    FROM catalog_products cp
    LEFT JOIN catalog_media cm ON cp.sku = cm.sku
    WHERE cp.harddrive_catalog = 'yes'
  `);
  
  const c = coverage.rows[0];
  console.log(`\n  Total HardDrive products: ${parseInt(c.total_harddrive).toLocaleString()}`);
  console.log(`  With brand info: ${parseInt(c.with_brand).toLocaleString()}`);
  console.log(`  With images: ${parseInt(c.with_images).toLocaleString()}`);
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log(`
HardDrive Image List Importer (OPTIMIZED)

Usage:
  node import_harddrive_imagelist_fast.js <path_to_csv>

Example:
  node import_harddrive_imagelist_fast.js hdmstr_with_urls.csv
    `);
    process.exit(0);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    const products = await importHardDriveData(filePath);
    await updateProductsBatched(products);
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
