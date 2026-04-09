#!/usr/bin/env node

/**
 * Fetch WPS Data for HardDrive Catalog
 * Gets brands, attributes, and enrichment data for HardDrive products only
 */

import dotenv from 'dotenv';
import pg from 'pg';
import axios from 'axios';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local' });
const { Pool } = pg;

const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_TOKEN;
const RATE_LIMIT_DELAY = 1000; // 1 second between requests

if (!WPS_API_TOKEN) {
  console.error('❌ WPS_API_TOKEN environment variable not set');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

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
    console.error(`\nAPI Error for ${endpoint}:`, error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getHardDriveSKUs() {
  console.log('📋 Getting HardDrive catalog SKUs...\n');
  
  const result = await pool.query(`
    SELECT DISTINCT sku 
    FROM catalog_products 
    WHERE name ILIKE '%harddrive%' 
       OR name ILIKE '%hard drive%'
       OR description ILIKE '%harddrive%'
    ORDER BY sku
  `);
  
  const skus = result.rows.map(r => r.sku);
  console.log(`Found ${skus.length.toLocaleString()} HardDrive SKUs\n`);
  
  return skus;
}

async function enrichHardDriveProducts(skus) {
  console.log(`🔍 Enriching ${skus.length} HardDrive products...\n`);
  
  const progress = new ProgressBar(skus.length, 'Fetching product data');
  let processed = 0;
  let found = 0;
  let notFound = 0;
  
  const brands = new Set();
  const attributeKeys = new Set();
  const attributeValues = new Set();
  
  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    
    try {
      // Search for item by SKU using proper filter syntax
      // This returns a collection (array), not a single entity
      const itemData = await wpsApiRequest('/items', { 
        'filter[sku]': sku
      });
      
      if (!itemData?.data || !Array.isArray(itemData.data) || itemData.data.length === 0) {
        notFound++;
        progress.update(i + 1, `${found} found, ${notFound} not in WPS`);
        await sleep(RATE_LIMIT_DELAY);
        continue;
      }
      
      // Get first matching item (should only be one)
      const item = itemData.data[0];
      found++;
      
      // Collect brand
      if (item.brand_id) {
        brands.add(item.brand_id);
      }
      
      // Get full item details with includes
      const detailedItem = await wpsApiRequest(`/items/${item.id}`, {
        include: 'product,attributevalues,brand'
      });
      
      if (detailedItem?.data) {
        const fullItem = detailedItem.data;
        
        // Collect attribute keys and values
        if (fullItem.attributevalues && Array.isArray(fullItem.attributevalues)) {
          fullItem.attributevalues.forEach(attr => {
            if (attr.attributekey_id) {
              attributeKeys.add(attr.attributekey_id);
            }
            if (attr.id) {
              attributeValues.add(attr.id);
            }
          });
        }
        
        // Store enrichment data
        try {
          await pool.query(`
            INSERT INTO catalog_product_enrichment 
              (sku, product_id, item_id, product_name, product_description, 
               attributes, features, tags, blocks, resources, taxonomy, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (sku)
            DO UPDATE SET
              product_id = EXCLUDED.product_id,
              item_id = EXCLUDED.item_id,
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
          `, [
            sku,
            fullItem.product?.id || null,
            fullItem.id,
            fullItem.product?.name || fullItem.name,
            fullItem.product?.description || fullItem.description,
            JSON.stringify(fullItem.attributevalues || []),
            JSON.stringify(fullItem.features || []),
            JSON.stringify(fullItem.tags || []),
            JSON.stringify(fullItem.blocks || []),
            JSON.stringify(fullItem.resources || []),
            JSON.stringify(fullItem.taxonomyterms || []),
            JSON.stringify(fullItem)
          ]);
        } catch (err) {
          console.error(`\nError storing enrichment for ${sku}:`, err.message);
        }
      }
      
      processed++;
      progress.update(i + 1, `${found} found, ${notFound} not in WPS`);
      
    } catch (err) {
      console.error(`\nError processing ${sku}:`, err.message);
    }
    
    // Rate limiting
    await sleep(RATE_LIMIT_DELAY);
  }
  
  progress.finish('Product enrichment complete');
  
  console.log(`\n📊 Results:`);
  console.log(`   Processed: ${processed.toLocaleString()}`);
  console.log(`   Found in WPS: ${found.toLocaleString()}`);
  console.log(`   Not found: ${notFound.toLocaleString()}`);
  console.log(`   Unique brands: ${brands.size}`);
  console.log(`   Unique attribute keys: ${attributeKeys.size}`);
  console.log(`   Unique attribute values: ${attributeValues.size}`);
  
  return { brands, attributeKeys, attributeValues };
}

async function fetchBrandDetails(brandIds) {
  console.log(`\n🏷️  Fetching ${brandIds.size} brand details...\n`);
  
  let fetched = 0;
  for (const brandId of brandIds) {
    try {
      const brandData = await wpsApiRequest(`/brands/${brandId}`);
      
      if (brandData?.data) {
        const brand = brandData.data;
        
        await pool.query(`
          INSERT INTO catalog_brands (brand_id, name, description, logo_url, website, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (brand_id) 
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
        
        fetched++;
        console.log(`   ✓ ${brand.name}`);
      }
      
      await sleep(RATE_LIMIT_DELAY);
    } catch (err) {
      console.error(`Error fetching brand ${brandId}:`, err.message);
    }
  }
  
  console.log(`\n✅ Fetched ${fetched} brands`);
}

async function fetchAttributeDetails(keyIds, valueIds) {
  console.log(`\n🔑 Fetching ${keyIds.size} attribute keys...\n`);
  
  let fetchedKeys = 0;
  for (const keyId of keyIds) {
    try {
      const keyData = await wpsApiRequest(`/attributekeys/${keyId}`);
      
      if (keyData?.data) {
        const key = keyData.data;
        
        await pool.query(`
          INSERT INTO catalog_attribute_keys (key_id, name, description, metadata)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (key_id)
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
        
        fetchedKeys++;
        console.log(`   ✓ ${key.name}`);
      }
      
      await sleep(RATE_LIMIT_DELAY);
    } catch (err) {
      console.error(`Error fetching attribute key ${keyId}:`, err.message);
    }
  }
  
  console.log(`\n✅ Fetched ${fetchedKeys} attribute keys`);
  
  console.log(`\n🏷️  Fetching ${valueIds.size} attribute values...\n`);
  
  let fetchedValues = 0;
  for (const valueId of valueIds) {
    try {
      const valueData = await wpsApiRequest(`/attributevalues/${valueId}`);
      
      if (valueData?.data) {
        const val = valueData.data;
        
        // Skip if value is null
        if (!val.value) continue;
        
        await pool.query(`
          INSERT INTO catalog_attribute_values (value_id, key_id, value, metadata)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (value_id)
          DO UPDATE SET 
            key_id = EXCLUDED.key_id,
            value = EXCLUDED.value,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `, [
          val.id,
          val.attributekey_id || null,
          val.value,
          JSON.stringify(val)
        ]);
        
        fetchedValues++;
      }
      
      await sleep(RATE_LIMIT_DELAY);
    } catch (err) {
      // Silently skip errors for attribute values
    }
  }
  
  console.log(`✅ Fetched ${fetchedValues} attribute values`);
}

async function main() {
  console.log('🚀 HardDrive Catalog WPS Enrichment\n');
  
  try {
    // Get HardDrive SKUs
    const skus = await getHardDriveSKUs();
    
    if (skus.length === 0) {
      console.log('⚠️  No HardDrive products found in catalog');
      process.exit(0);
    }
    
    // Enrich products and collect brand/attribute IDs
    const { brands, attributeKeys, attributeValues } = await enrichHardDriveProducts(skus);
    
    // Fetch brand details
    if (brands.size > 0) {
      await fetchBrandDetails(brands);
    }
    
    // Fetch attribute details
    if (attributeKeys.size > 0 || attributeValues.size > 0) {
      await fetchAttributeDetails(attributeKeys, attributeValues);
    }
    
    console.log('\n✅ HardDrive enrichment complete!\n');
    
  } catch (error) {
    console.error('❌ Enrichment failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
