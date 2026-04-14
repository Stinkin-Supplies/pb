#!/usr/bin/env node

/**
 * Import WPS Pricing - ULTRA FAST (Bulk Mode)
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

async function importPricingBulk(filePath) {
  console.log(`\n📁 Reading pricing JSON: ${filePath}\n`);
  
  const rawData = fs.readFileSync(filePath, 'utf8');
  const records = JSON.parse(rawData);
  
  console.log(`✅ Found ${records.length.toLocaleString()} pricing records\n`);
  
  const BATCH_SIZE = 5000;
  const progress = new ProgressBar(records.length, 'Importing pricing');
  const client = await pool.connect();
  
  let imported = 0;
  
  try {
    await client.query('BEGIN');
    
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      
      // Build VALUES clause
      const values = [];
      const placeholders = [];
      let paramCount = 1;
      
      for (const record of batch) {
        placeholders.push(`($${paramCount}, $${paramCount+1}, $${paramCount+2}, $${paramCount+3})`);
        values.push(
          record.sku,
          null, // punctuated_sku
          parseFloat(record.standard_dealer_price || record.actual_dealer_price),
          'WPS' // supplier
        );
        paramCount += 4;
      }
      
      // Single bulk INSERT
      await client.query(`
        INSERT INTO catalog_pricing (sku, punctuated_sku, dealer_price, supplier)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (sku, supplier)
        DO UPDATE SET
          dealer_price = EXCLUDED.dealer_price,
          updated_at = NOW()
      `, values);
      
      imported += batch.length;
      progress.update(Math.min(i + BATCH_SIZE, records.length));
    }
    
    await client.query('COMMIT');
    progress.finish('Complete');
    
    console.log(`\n✅ Imported ${imported.toLocaleString()} pricing records`);
    
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
  const filePath = process.argv[2] || 'pricing.json';
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  try {
    await importPricingBulk(filePath);
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
