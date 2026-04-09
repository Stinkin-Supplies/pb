#!/usr/bin/env node

/**
 * Fetch ALL WPS Brands and Attributes
 * Fetches complete reference data from WPS API in bulk
 */

import dotenv from 'dotenv';
import pg from 'pg';
import axios from 'axios';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local' });
const { Pool } = pg;

const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_TOKEN;

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
    console.error(`API Error for ${endpoint}:`, error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

async function fetchAllBrands() {
  console.log('\n📦 Fetching all brands...');
  
  let allBrands = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const data = await wpsApiRequest('/brands', { page });
    const brands = data.data || [];
    
    if (brands.length === 0) {
      hasMore = false;
      break;
    }
    
    allBrands = allBrands.concat(brands);
    console.log(`   Fetched page ${page}: ${brands.length} brands (total: ${allBrands.length})`);
    
    // Check if there's more data
    // If we got less than a full page, we're done
    if (brands.length < 10) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  console.log(`\nFound ${allBrands.length} total brands\n`);
  
  const progress = new ProgressBar(allBrands.length, 'Importing brands');
  let inserted = 0;
  let updated = 0;
  
  for (let i = 0; i < allBrands.length; i++) {
    const brand = allBrands[i];
    
    try {
      const result = await pool.query(`
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
        RETURNING (xmax = 0) AS inserted
      `, [
        brand.id,
        brand.name,
        brand.description || null,
        brand.logo_url || null,
        brand.website || null,
        JSON.stringify(brand)
      ]);
      
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      progress.update(i + 1);
    } catch (err) {
      // Handle name conflict by updating
      if (err.code === '23505' && err.constraint === 'catalog_brands_name_key') {
        try {
          await pool.query(`
            UPDATE catalog_brands 
            SET brand_id = $1,
                description = $2,
                logo_url = $3,
                website = $4,
                metadata = $5,
                updated_at = NOW()
            WHERE name = $6
          `, [
            brand.id,
            brand.description || null,
            brand.logo_url || null,
            brand.website || null,
            JSON.stringify(brand),
            brand.name
          ]);
          updated++;
        } catch (updateErr) {
          console.error(`\nError updating brand ${brand.id}:`, updateErr.message);
        }
      } else {
        console.error(`\nError inserting brand ${brand.id}:`, err.message);
      }
      progress.update(i + 1);
    }
  }
  
  progress.finish('Complete');
  console.log(`✅ Brands: ${inserted} inserted, ${updated} updated`);
}

async function fetchAllAttributeKeys() {
  console.log('\n🔑 Fetching all attribute keys...');
  
  let allKeys = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const data = await wpsApiRequest('/attributekeys', { page });
    const keys = data.data || [];
    
    if (keys.length === 0) {
      hasMore = false;
      break;
    }
    
    allKeys = allKeys.concat(keys);
    console.log(`   Fetched page ${page}: ${keys.length} keys (total: ${allKeys.length})`);
    
    if (keys.length < 10) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  console.log(`\nFound ${allKeys.length} total attribute keys\n`);
  
  const progress = new ProgressBar(allKeys.length, 'Importing attribute keys');
  let inserted = 0;
  let updated = 0;
  
  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i];
    
    try {
      const result = await pool.query(`
        INSERT INTO catalog_attribute_keys (key_id, name, description, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key_id)
        DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        key.id,
        key.name,
        key.description || null,
        JSON.stringify(key)
      ]);
      
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      progress.update(i + 1);
    } catch (err) {
      console.error(`\nError inserting attribute key ${key.id}:`, err.message);
      progress.update(i + 1);
    }
  }
  
  progress.finish('Complete');
  console.log(`✅ Attribute keys: ${inserted} inserted, ${updated} updated`);
}

async function fetchAllAttributeValues() {
  console.log('\n🏷️  Fetching all attribute values...');
  console.log('   (This may take a few minutes - paginating through results)\n');
  
  let allValues = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const data = await wpsApiRequest('/attributevalues', { page });
    const values = data.data || [];
    
    if (values.length === 0) {
      hasMore = false;
      break;
    }
    
    allValues = allValues.concat(values);
    console.log(`   Fetched page ${page}: ${values.length} values (total: ${allValues.length})`);
    
    if (values.length < 10) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  console.log(`\nFound ${allValues.length} total attribute values\n`);
  
  const progress = new ProgressBar(allValues.length, 'Importing attribute values');
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  
  for (let i = 0; i < allValues.length; i++) {
    const val = allValues[i];
    
    // Skip if value is null or empty
    if (!val.value) {
      skipped++;
      progress.update(i + 1);
      continue;
    }
    
    try {
      const result = await pool.query(`
        INSERT INTO catalog_attribute_values (value_id, key_id, value, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (value_id)
        DO UPDATE SET 
          key_id = EXCLUDED.key_id,
          value = EXCLUDED.value,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        val.id,
        val.attributekey_id || null,
        val.value,
        JSON.stringify(val)
      ]);
      
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      progress.update(i + 1);
    } catch (err) {
      console.error(`\nError inserting attribute value ${val.id}:`, err.message);
      progress.update(i + 1);
    }
  }
  
  progress.finish('Complete');
  console.log(`✅ Attribute values: ${inserted} inserted, ${updated} updated, ${skipped} skipped (null)`);
}

async function showStats() {
  console.log('\n📊 Reference Data Summary:\n');
  
  const brands = await pool.query('SELECT COUNT(*) FROM catalog_brands WHERE brand_id IS NOT NULL');
  const keys = await pool.query('SELECT COUNT(*) FROM catalog_attribute_keys');
  const values = await pool.query('SELECT COUNT(*) FROM catalog_attribute_values');
  
  console.log(`   Brands: ${parseInt(brands.rows[0].count).toLocaleString()}`);
  console.log(`   Attribute keys: ${parseInt(keys.rows[0].count).toLocaleString()}`);
  console.log(`   Attribute values: ${parseInt(values.rows[0].count).toLocaleString()}`);
  
  // Show some example attributes
  console.log('\n📋 Sample attribute keys:');
  const sampleKeys = await pool.query(`
    SELECT name FROM catalog_attribute_keys 
    ORDER BY name 
    LIMIT 10
  `);
  sampleKeys.rows.forEach(r => console.log(`   • ${r.name}`));
}

async function main() {
  console.log('🚀 WPS Reference Data Fetcher\n');
  console.log('This will fetch ALL brands and attributes from WPS API\n');
  
  try {
    await fetchAllBrands();
    await fetchAllAttributeKeys();
    await fetchAllAttributeValues();
    await showStats();
    
    console.log('\n✅ All reference data fetched!\n');
    console.log('Next step: Enrich your HardDrive products with:');
    console.log('  node scripts/ingest/enrich_harddrive.js\n');
    
  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
