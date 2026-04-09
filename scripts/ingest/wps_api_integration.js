#!/usr/bin/env node

/**
 * WPS API Integration Script
 * Fetches product data from WPS API and enriches the catalog database
 * 
 * Usage:
 *   WPS_API_TOKEN=your_token_here node wps_api_integration.js [command] [options]
 * 
 * Commands:
 *   fetch-products       - Fetch products by item SKUs
 *   fetch-attributes     - Fetch all attribute keys/values
 *   fetch-brands         - Fetch all brands
 *   fetch-tags           - Fetch all tags
 *   fetch-blocks         - Fetch marketing blocks
 *   fetch-features       - Fetch product features
 *   fetch-images         - Fetch product images
 *   fetch-resources      - Fetch PDFs/manuals
 *   fetch-taxonomy       - Fetch category taxonomy
 *   fetch-inventory      - Fetch stock levels
 *   enrich-catalog       - Full enrichment (all of the above)
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const axios = require('axios');

// Configuration
const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_TOKEN;
const BATCH_SIZE = 100; // Items per API request
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

if (!WPS_API_TOKEN) {
  console.error('❌ WPS_API_TOKEN environment variable not set');
  process.exit(1);
}

// Database connection
const pool = new Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

// API helper
async function wpsApiRequest(endpoint, params = {}) {
  try {
    const response = await axios.get(`${WPS_API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${WPS_API_TOKEN}`,
        'Accept': 'application/json',
      },
      params,
    });
    return response.data;
  } catch (error) {
    console.error(`API Error for ${endpoint}:`, error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

// Rate limiting helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Fetch and store brands
async function fetchBrands() {
  console.log('\n📦 Fetching brands...');
  
  const data = await wpsApiRequest('/brands');
  const brands = data.data || [];
  
  console.log(`Found ${brands.length} brands`);
  
  // Create brands table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_brands (
      id SERIAL PRIMARY KEY,
      wps_brand_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      logo_url TEXT,
      website TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  
  let inserted = 0;
  for (const brand of brands) {
    try {
      await pool.query(`
        INSERT INTO catalog_brands (wps_brand_id, name, description, logo_url, website, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (wps_brand_id) 
        DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          logo_url = EXCLUDED.logo_url,
          website = EXCLUDED.website,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        brand.id,
        brand.name,
        brand.description || null,
        brand.logo_url || null,
        brand.website || null,
        JSON.stringify(brand)
      ]);
      inserted++;
    } catch (err) {
      console.error(`Error inserting brand ${brand.id}:`, err.message);
    }
  }
  
  console.log(`✅ Inserted/updated ${inserted} brands`);
}

// 2. Fetch and store attribute keys
async function fetchAttributeKeys() {
  console.log('\n🔑 Fetching attribute keys...');
  
  const data = await wpsApiRequest('/attributekeys');
  const keys = data.data || [];
  
  console.log(`Found ${keys.length} attribute keys`);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_attribute_keys (
      id SERIAL PRIMARY KEY,
      wps_key_id INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  
  let inserted = 0;
  for (const key of keys) {
    try {
      await pool.query(`
        INSERT INTO catalog_attribute_keys (wps_key_id, name, description, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (wps_key_id)
        DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        key.id,
        key.name,
        key.description || null,
        JSON.stringify(key)
      ]);
      inserted++;
    } catch (err) {
      console.error(`Error inserting attribute key ${key.id}:`, err.message);
    }
  }
  
  console.log(`✅ Inserted/updated ${inserted} attribute keys`);
}

// 3. Fetch and store attribute values
async function fetchAttributeValues() {
  console.log('\n🏷️  Fetching attribute values...');
  
  const data = await wpsApiRequest('/attributevalues', { limit: 10000 });
  const values = data.data || [];
  
  console.log(`Found ${values.length} attribute values`);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_attribute_values (
      id SERIAL PRIMARY KEY,
      wps_value_id INTEGER UNIQUE NOT NULL,
      wps_key_id INTEGER,
      value TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (wps_key_id) REFERENCES catalog_attribute_keys(wps_key_id)
    )
  `);
  
  let inserted = 0;
  for (const val of values) {
    try {
      await pool.query(`
        INSERT INTO catalog_attribute_values (wps_value_id, wps_key_id, value, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (wps_value_id)
        DO UPDATE SET 
          wps_key_id = EXCLUDED.wps_key_id,
          value = EXCLUDED.value,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        val.id,
        val.attributekey_id || null,
        val.value,
        JSON.stringify(val)
      ]);
      inserted++;
    } catch (err) {
      console.error(`Error inserting attribute value ${val.id}:`, err.message);
    }
  }
  
  console.log(`✅ Inserted/updated ${inserted} attribute values`);
}

// 4. Fetch product data for specific items
async function fetchProductsForItems(skus) {
  console.log(`\n🔍 Fetching product data for ${skus.length} items...`);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_product_enrichment (
      id SERIAL PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      wps_product_id INTEGER,
      wps_item_id INTEGER,
      product_name TEXT,
      product_description TEXT,
      attributes JSONB,
      features JSONB,
      tags JSONB,
      blocks JSONB,
      resources JSONB,
      taxonomy JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  
  let processed = 0;
  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const batch = skus.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`);
    
    for (const sku of batch) {
      try {
        // Search for item by SKU
        const itemData = await wpsApiRequest('/items', { 
          filter: `sku:${sku}`,
          include: 'product,attributevalues,features,tags,blocks,resources,taxonomyterms'
        });
        
        if (!itemData.data || itemData.data.length === 0) {
          console.log(`⚠️  Item not found: ${sku}`);
          continue;
        }
        
        const item = itemData.data[0];
        const product = item.product;
        
        // Extract enrichment data
        const enrichment = {
          sku: sku,
          wps_product_id: product?.id || null,
          wps_item_id: item.id,
          product_name: product?.name || item.name,
          product_description: product?.description || item.description,
          attributes: JSON.stringify(item.attributevalues || []),
          features: JSON.stringify(item.features || []),
          tags: JSON.stringify(item.tags || []),
          blocks: JSON.stringify(item.blocks || []),
          resources: JSON.stringify(item.resources || []),
          taxonomy: JSON.stringify(item.taxonomyterms || []),
          metadata: JSON.stringify(item)
        };
        
        await pool.query(`
          INSERT INTO catalog_product_enrichment 
            (sku, wps_product_id, wps_item_id, product_name, product_description, 
             attributes, features, tags, blocks, resources, taxonomy, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (sku)
          DO UPDATE SET
            wps_product_id = EXCLUDED.wps_product_id,
            wps_item_id = EXCLUDED.wps_item_id,
            product_name = EXCLUDED.product_name,
            product_description = EXCLUDED.product_description,
            attributes = EXCLUDED.attributes,
            features = EXCLUDED.features,
            tags = EXCLUDED.tags,
            blocks = EXCLUDED.blocks,
            resources = EXCLUDED.resources,
            taxonomy = EXCLUDED.taxonomy,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `, Object.values(enrichment));
        
        processed++;
        
      } catch (err) {
        console.error(`Error processing ${sku}:`, err.message);
      }
      
      // Rate limiting
      await sleep(RATE_LIMIT_DELAY);
    }
  }
  
  console.log(`✅ Processed ${processed} items`);
}

// 5. Get all SKUs from catalog that need enrichment
async function getAllCatalogSKUs() {
  const result = await pool.query(`
    SELECT DISTINCT sku 
    FROM catalog_products 
    WHERE sku IS NOT NULL 
      AND supplier = 'WPS'
    ORDER BY sku
  `);
  return result.rows.map(r => r.sku);
}

// Main orchestration
async function enrichCatalog() {
  console.log('🚀 Starting WPS API catalog enrichment...\n');
  
  try {
    // Step 1: Fetch reference data
    await fetchBrands();
    await fetchAttributeKeys();
    await fetchAttributeValues();
    
    // Step 2: Get all catalog SKUs
    const skus = await getAllCatalogSKUs();
    console.log(`\nFound ${skus.length} WPS SKUs in catalog`);
    
    // Step 3: Fetch product data for each SKU
    if (skus.length > 0) {
      await fetchProductsForItems(skus);
    }
    
    console.log('\n✅ Catalog enrichment complete!');
    
  } catch (error) {
    console.error('❌ Enrichment failed:', error);
    throw error;
  }
}

// CLI interface
const command = process.argv[2];

async function main() {
  try {
    switch (command) {
      case 'fetch-brands':
        await fetchBrands();
        break;
      case 'fetch-attributes':
        await fetchAttributeKeys();
        await fetchAttributeValues();
        break;
      case 'enrich-catalog':
        await enrichCatalog();
        break;
      case 'test':
        // Test with a few SKUs
        const testSkus = ['57-3173', '57-3174', '57-3175'];
        await fetchProductsForItems(testSkus);
        break;
      default:
        console.log(`
WPS API Integration Tool

Commands:
  fetch-brands         - Fetch and store all brands
  fetch-attributes     - Fetch and store attribute keys/values
  enrich-catalog       - Full catalog enrichment (recommended)
  test                 - Test with a few sample SKUs

Usage:
  WPS_API_TOKEN=your_token node wps_api_integration.js [command]

Example:
  WPS_API_TOKEN=abc123 node wps_api_integration.js enrich-catalog
        `);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
