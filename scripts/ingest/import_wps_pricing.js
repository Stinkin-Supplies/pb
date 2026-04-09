#!/usr/bin/env node

/**
 * WPS Price File Importer
 * Imports dealer pricing from WPS price file CSV into catalog database
 * 
 * Usage:
 *   node import_wps_pricing.js <path_to_price_file.csv>
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const csv = require('csv-parser');

const pool = new Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

async function setupPricingTable() {
  console.log('📋 Setting up pricing table...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_pricing (
      id SERIAL PRIMARY KEY,
      sku TEXT NOT NULL,
      punctuated_sku TEXT,
      dealer_price DECIMAL(10, 2),
      supplier TEXT DEFAULT 'WPS',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(sku, supplier)
    )
  `);
  
  // Add index for faster lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pricing_sku ON catalog_pricing(sku);
  `);
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pricing_supplier ON catalog_pricing(supplier);
  `);
  
  console.log('✅ Pricing table ready');
}

async function importPriceFile(filePath) {
  console.log(`\n📁 Reading price file: ${filePath}`);
  
  return new Promise((resolve, reject) => {
    const prices = [];
    let rowCount = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        
        // Handle both possible column name formats
        const partNumber = row['Part Number'] || row['part_number'] || row['PartNumber'];
        const punctuatedPartNumber = row['Punctuated Part Number'] || row['punctuated_part_number'];
        const dealerPrice = row['Your Dealer Price'] || row['dealer_price'] || row['price'];
        
        if (partNumber && dealerPrice) {
          prices.push({
            sku: partNumber.trim(),
            punctuatedSku: punctuatedPartNumber?.trim() || null,
            price: parseFloat(dealerPrice)
          });
        }
        
        // Log progress every 10k rows
        if (rowCount % 10000 === 0) {
          console.log(`  Read ${rowCount.toLocaleString()} rows...`);
        }
      })
      .on('end', () => {
        console.log(`✅ Finished reading ${rowCount.toLocaleString()} rows`);
        console.log(`   Valid price records: ${prices.length.toLocaleString()}`);
        resolve(prices);
      })
      .on('error', reject);
  });
}

async function insertPrices(prices) {
  console.log(`\n💾 Inserting ${prices.length.toLocaleString()} prices into database...`);
  
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < prices.length; i++) {
      const { sku, punctuatedSku, price } = prices[i];
      
      try {
        const result = await client.query(`
          INSERT INTO catalog_pricing (sku, punctuated_sku, dealer_price, supplier)
          VALUES ($1, $2, $3, 'WPS')
          ON CONFLICT (sku, supplier)
          DO UPDATE SET
            punctuated_sku = EXCLUDED.punctuated_sku,
            dealer_price = EXCLUDED.dealer_price,
            updated_at = NOW()
          RETURNING (xmax = 0) AS inserted
        `, [sku, punctuatedSku, price]);
        
        if (result.rows[0].inserted) {
          inserted++;
        } else {
          updated++;
        }
        
      } catch (err) {
        errors++;
        if (errors < 10) {
          console.error(`Error with SKU ${sku}:`, err.message);
        }
      }
      
      // Progress indicator
      if ((i + 1) % 5000 === 0) {
        console.log(`  Processed ${(i + 1).toLocaleString()} / ${prices.length.toLocaleString()}`);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Database import complete:`);
    console.log(`   Inserted: ${inserted.toLocaleString()}`);
    console.log(`   Updated: ${updated.toLocaleString()}`);
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

async function analyzePricing() {
  console.log('\n📊 Pricing Analysis:');
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_prices,
      MIN(dealer_price) as min_price,
      MAX(dealer_price) as max_price,
      AVG(dealer_price)::DECIMAL(10,2) as avg_price,
      COUNT(DISTINCT sku) as unique_skus
    FROM catalog_pricing
    WHERE supplier = 'WPS'
  `);
  
  const s = stats.rows[0];
  console.log(`  Total prices: ${parseInt(s.total_prices).toLocaleString()}`);
  console.log(`  Unique SKUs: ${parseInt(s.unique_skus).toLocaleString()}`);
  console.log(`  Price range: $${s.min_price} - $${s.max_price}`);
  console.log(`  Average price: $${s.avg_price}`);
  
  // Check overlap with catalog
  const overlap = await pool.query(`
    SELECT COUNT(*) as matched
    FROM catalog_products cp
    INNER JOIN catalog_pricing pr ON cp.sku = pr.sku
    WHERE cp.supplier = 'WPS' AND pr.supplier = 'WPS'
  `);
  
  console.log(`  Matched with catalog: ${parseInt(overlap.rows[0].matched).toLocaleString()}`);
}

async function main() {
  const priceFilePath = process.argv[2];
  
  if (!priceFilePath) {
    console.log(`
WPS Price File Importer

Usage:
  node import_wps_pricing.js <path_to_price_file.csv>

Example:
  node import_wps_pricing.js ./D00108_PriceFile.csv

This will:
  1. Create catalog_pricing table
  2. Import all prices from CSV
  3. Show statistics
    `);
    process.exit(0);
  }
  
  if (!fs.existsSync(priceFilePath)) {
    console.error(`❌ File not found: ${priceFilePath}`);
    process.exit(1);
  }
  
  try {
    await setupPricingTable();
    const prices = await importPriceFile(priceFilePath);
    await insertPrices(prices);
    await analyzePricing();
    
    console.log('\n🎉 Import complete!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
