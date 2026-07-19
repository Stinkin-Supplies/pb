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

const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_KEY;

// Rate limiter - 1 request per second
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchProductAttributes(sku) {
  try {
    const response = await fetch(
      `${WPS_API_BASE}/items?filter[sku]=${sku}&include=attributevalues`,
      { headers: { Authorization: `Bearer ${WPS_API_TOKEN}` } }
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) return null;
    
    const item = data.data[0];
    const attributes = {};
    
    // Extract attribute values
    if (item.attributevalues && Array.isArray(item.attributevalues)) {
      for (const attr of item.attributevalues) {
        // Use 'name' field, not 'value' (value is always null in WPS API)
        if (attr.name && attr.attributekey_id) {
          attributes[`attr_${attr.attributekey_id}`] = attr.name;
        }
      }
    }
    
    return Object.keys(attributes).length > 0 ? attributes : null;
  } catch (err) {
    console.error(`Error fetching attributes for SKU ${sku}:`, err.message);
    return null;
  }
}

async function enrichWPSProducts() {
  try {
    console.log('🚀 Starting WPS product enrichment...\n');
    
    await dbClient.connect();
    console.log('✅ Connected to database');

    // Get all WPS products that need enrichment
    const { rows: products } = await dbClient.query(`
      SELECT DISTINCT cp.sku 
      FROM catalog_products cp
      WHERE cp.source_vendor = 'wps'
      AND NOT EXISTS (
        SELECT 1 FROM catalog_product_enrichment cpe 
        WHERE cpe.sku = cp.sku AND cpe.attributes IS NOT NULL
      )
      ORDER BY cp.sku
      LIMIT 50
    `);

    console.log(`📂 Found ${products.length} WPS products to enrich\n`);

    const progressBar = new ProgressBar(products.length, 'Enriching WPS products');
    
    let enriched = 0;
    let failed = 0;

    for (let i = 0; i < products.length; i++) {
      const { sku } = products[i];
      
      try {
        const attributes = await fetchProductAttributes(sku);
        
        if (attributes) {
          await dbClient.query(`
            INSERT INTO catalog_product_enrichment (sku, attributes)
            VALUES ($1, $2)
            ON CONFLICT (sku) DO UPDATE SET
              attributes = COALESCE(catalog_product_enrichment.attributes, $2::jsonb) || $2::jsonb,
              updated_at = NOW()
          `, [sku, JSON.stringify(attributes)]);
          
          enriched++;
        }
      } catch (err) {
        console.error(`\n❌ Error enriching ${sku}:`, err.message);
        failed++;
      }
      
      progressBar.update(i + 1, `${enriched} enriched, ${failed} failed`);
      
      // Rate limit: 1 request per second
      await sleep(1000);
    }

    progressBar.finish(`${enriched} enriched, ${failed} failed`);
    console.log();

    const { rows: stats } = await dbClient.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN attributes IS NOT NULL THEN 1 END) as with_attributes
      FROM catalog_product_enrichment
    `);

    console.log('📊 Enrichment Summary:');
    console.log(`   Total enrichment records: ${stats[0].total.toLocaleString()}`);
    console.log(`   With attributes: ${stats[0].with_attributes.toLocaleString()}`);

    const { rows: sample } = await dbClient.query(`
      SELECT sku, attributes FROM catalog_product_enrichment 
      WHERE attributes IS NOT NULL 
      LIMIT 3
    `);

    console.log('\n📋 Sample Enriched Records:');
    sample.forEach((row, idx) => {
      const attrs = Object.keys(row.attributes).slice(0, 3);
      console.log(`   ${idx + 1}. SKU: ${row.sku} | ${attrs.join(', ')}`);
    });

    console.log('\n✨ WPS enrichment batch complete!');
    console.log('\n⏱️  Next: Run this again to enrich more products');
    console.log('   (Currently limited to 50 per run to avoid API throttling)');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

enrichWPSProducts();
