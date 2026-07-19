#!/usr/bin/env node

/**
 * Import WPS Dealer Pricing from JSON
 * Handles both array and object formats
 */

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
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

async function importPricingJSON(filePath) {
  console.log(`\n📁 Reading pricing JSON: ${filePath}\n`);
  
  const rawData = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(rawData);
  
  // Handle different JSON structures
  let pricingRecords = [];
  
  if (Array.isArray(data)) {
    pricingRecords = data;
  } else if (data.data && Array.isArray(data.data)) {
    pricingRecords = data.data;
  } else if (typeof data === 'object') {
    // Might be key-value pairs
    pricingRecords = Object.entries(data).map(([sku, price]) => ({
      sku: sku,
      dealer_price: price
    }));
  }
  
  console.log(`✅ Found ${pricingRecords.length.toLocaleString()} pricing records\n`);
  
  // Show sample
  console.log('Sample records:');
  pricingRecords.slice(0, 3).forEach(record => {
    console.log(`  ${JSON.stringify(record)}`);
  });
  console.log('');
  
  return pricingRecords;
}

async function importToDatabase(records) {
  console.log(`💾 Importing ${records.length.toLocaleString()} pricing records...\n`);
  
  const BATCH_SIZE = 1000;
  const progress = new ProgressBar(records.length, 'Importing pricing');
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      
      for (const record of batch) {
        // Try different possible field names
        const sku = record.sku || record.item_number || record['Item Number'];
        const dealerPrice = record.dealer_price 
          || record.standard_dealer_price 
          || record['Dealer Price'] 
          || record.price
          || record['Your Dealer Price'];
        
        const punctuatedSku = record.punctuated_sku 
          || record['Punctuated Part Number'];
        
        if (!sku) {
          errors++;
          continue;
        }
        
        try {
          const result = await client.query(`
            INSERT INTO catalog_pricing (sku, punctuated_sku, dealer_price, supplier)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (sku, supplier)
            DO UPDATE SET
              dealer_price = EXCLUDED.dealer_price,
              punctuated_sku = EXCLUDED.punctuated_sku,
              updated_at = NOW()
            RETURNING (xmax = 0) AS inserted
          `, [
            sku,
            punctuatedSku || null,
            dealerPrice ? parseFloat(dealerPrice) : null,
            'WPS'
          ]);
          
          if (result.rows[0].inserted) {
            inserted++;
          } else {
            updated++;
          }
        } catch (err) {
          console.error(`\nError with SKU ${sku}:`, err.message);
          errors++;
        }
      }
      
      progress.update(Math.min(i + BATCH_SIZE, records.length));
    }
    
    await client.query('COMMIT');
    progress.finish('Complete');
    
    console.log(`\n✅ Import complete:`);
    console.log(`   Inserted: ${inserted.toLocaleString()}`);
    console.log(`   Updated: ${updated.toLocaleString()}`);
    console.log(`   Errors: ${errors.toLocaleString()}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function analyzeCoverage() {
  console.log('\n📊 Pricing Coverage:\n');
  
  const stats = await pool.query(`
    SELECT 
      COUNT(DISTINCT cp.sku) as products_total,
      COUNT(DISTINCT pricing.sku) as with_pricing,
      ROUND(COUNT(DISTINCT pricing.sku)::numeric / COUNT(DISTINCT cp.sku)::numeric * 100, 2) as coverage_percent
    FROM catalog_products cp
    LEFT JOIN catalog_pricing pricing ON cp.sku = pricing.sku
  `);
  
  const s = stats.rows[0];
  console.log(`   Total products: ${parseInt(s.products_total).toLocaleString()}`);
  console.log(`   With pricing: ${parseInt(s.with_pricing).toLocaleString()}`);
  console.log(`   Coverage: ${s.coverage_percent}%`);
  
  // Sample prices
  const samples = await pool.query(`
    SELECT sku, dealer_price
    FROM catalog_pricing
    ORDER BY RANDOM()
    LIMIT 5
  `);
  
  console.log('\n   Sample prices:');
  samples.rows.forEach(p => {
    console.log(`     ${p.sku}: $${p.dealer_price}`);
  });
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log(`
WPS Pricing JSON Importer

Usage:
  node import_pricing_json.js <pricing.json>

Example:
  node import_pricing_json.js pricing.json
    `);
    process.exit(0);
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    const records = await importPricingJSON(filePath);
    await importToDatabase(records);
    await analyzeCoverage();
    
    console.log('\n🎉 Pricing import complete!\n');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
