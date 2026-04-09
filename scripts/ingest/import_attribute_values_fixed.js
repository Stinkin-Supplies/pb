#!/usr/bin/env node

/**
 * Import WPS Attribute Values (FIXED)
 * Uses 'name' field instead of 'value'
 */

import dotenv from 'dotenv';
import pg from 'pg';
import axios from 'axios';
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

const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_TOKEN;

async function wpsApiRequest(endpoint, params = {}) {
  const url = new URL(endpoint, WPS_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
  
  const response = await axios.get(url.toString(), {
    headers: {
      'Authorization': `Bearer ${WPS_API_TOKEN}`,
      'Accept': 'application/json',
    },
  });
  
  return response.data;
}

async function fetchAllAttributeValues() {
  console.log('\n🏷️  Fetching all attribute values...\n');
  
  let allValues = [];
  let cursor = null;
  const pageSize = 100;
  
  do {
    const params = { 'page[size]': pageSize };
    if (cursor) {
      params['page[cursor]'] = cursor;
    }
    
    const data = await wpsApiRequest('/attributevalues', params);
    const values = data.data || [];
    
    if (values.length === 0) break;
    
    allValues = allValues.concat(values);
    console.log(`   Fetched: ${values.length} values (total: ${allValues.length})`);
    
    cursor = data.meta?.cursor?.next || null;
    
  } while (cursor !== null);
  
  console.log(`\nFound ${allValues.length} total attribute values\n`);
  return allValues;
}

async function importAttributeValues(values) {
  console.log(`💾 Importing ${values.length.toLocaleString()} attribute values...\n`);
  
  const progress = new ProgressBar(values.length, 'Importing values');
  
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    
    // WPS uses 'name' field for the actual value
    const attributeValue = val.name;
    
    // Skip if name is null or empty
    if (!attributeValue || attributeValue.trim() === '') {
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
        attributeValue, // Use 'name' as the value
        JSON.stringify(val)
      ]);
      
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
    } catch (err) {
      console.error(`\nError with value ID ${val.id}:`, err.message);
    }
    
    progress.update(i + 1);
  }
  
  progress.finish('Complete');
  
  console.log(`\n✅ Import complete:`);
  console.log(`   Inserted: ${inserted.toLocaleString()}`);
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Skipped (empty): ${skipped.toLocaleString()}`);
}

async function showSamples() {
  console.log('\n📊 Sample attribute values:\n');
  
  const samples = await pool.query(`
    SELECT 
      av.value,
      ak.name as attribute_key,
      COUNT(*) as count
    FROM catalog_attribute_values av
    JOIN catalog_attribute_keys ak ON av.key_id = ak.key_id
    GROUP BY av.value, ak.name
    ORDER BY count DESC
    LIMIT 20
  `);
  
  samples.rows.forEach(row => {
    console.log(`   ${row.attribute_key}: ${row.value} (${row.count} products)`);
  });
  
  const stats = await pool.query(`
    SELECT COUNT(*) as total_values,
           COUNT(DISTINCT key_id) as unique_keys
    FROM catalog_attribute_values
  `);
  
  console.log(`\n   Total values: ${parseInt(stats.rows[0].total_values).toLocaleString()}`);
  console.log(`   Unique attribute keys: ${stats.rows[0].unique_keys}`);
}

async function main() {
  try {
    const values = await fetchAllAttributeValues();
    await importAttributeValues(values);
    await showSamples();
    
    console.log('\n🎉 Attribute values imported!\n');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
