/**
 * Build Catalog Allowlist for Typesense Indexing
 * Filters products to only include Tire, Oldbook, and Fatbook catalogs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Check .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Check if item has any target catalog
 */
function hasTargetCatalog(item) {
  const fatbook = item.fatbook_catalog?.trim();
  const fatbookMid = item.fatbook_midyear_catalog?.trim();
  const tire = item.tire_catalog?.trim();
  const oldbook = item.oldbook_catalog?.trim();
  const oldbookMid = item.oldbook_midyear_catalog?.trim();
  
  return fatbook || fatbookMid || tire || oldbook || oldbookMid;
}

/**
 * Get all catalog sources for an item
 */
function getCatalogSources(item) {
  const sources = [];
  
  if (item.fatbook_catalog?.trim()) {
    sources.push({ source: 'pu_fatbook', catalog: 'PU Fatbook' });
  }
  if (item.fatbook_midyear_catalog?.trim()) {
    sources.push({ source: 'pu_fatbook_midyear', catalog: 'PU Fatbook Mid-Year' });
  }
  if (item.tire_catalog?.trim()) {
    sources.push({ source: 'pu_tire', catalog: 'PU Tire/Service' });
  }
  if (item.oldbook_catalog?.trim()) {
    sources.push({ source: 'pu_oldbook', catalog: 'PU Oldbook' });
  }
  if (item.oldbook_midyear_catalog?.trim()) {
    sources.push({ source: 'pu_oldbook_midyear', catalog: 'PU Oldbook Mid-Year' });
  }
  
  return sources;
}

async function buildAllowlist() {
  console.log('🏗️  Building Catalog Allowlist...\n');
  console.log('Target catalogs: Fatbook, Fatbook Mid-Year, Tire, Oldbook, Oldbook Mid-Year\n');

  // Ensure catalog_allowlist table exists
  console.log('Creating catalog_allowlist table if not exists...');
  
  const { error: tableError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS catalog_allowlist (
        sku TEXT NOT NULL,
        source TEXT NOT NULL,
        catalog TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (sku, source)
      );
      CREATE INDEX IF NOT EXISTS idx_allowlist_sku ON catalog_allowlist(sku);
      CREATE INDEX IF NOT EXISTS idx_allowlist_source ON catalog_allowlist(source);
    `
  }).catch(() => {
    // Fallback: try direct SQL
    return supabase.from('catalog_allowlist').select('count(*)', { count: 'exact', head: true });
  });

  // Clear existing allowlist
  console.log('Clearing existing allowlist...');
  await supabase.from('catalog_allowlist').delete().neq('sku', '');

  // Get all dealer price batches
  console.log('Fetching dealer price data...');
  const { data: batches, error: batchError } = await supabase
    .from('raw_vendor_pu')
    .select('source_file, payload')
    .like('source_file', 'dealerprice_batch_%');

  if (batchError) {
    console.error('Failed to fetch batches:', batchError.message);
    process.exit(1);
  }

  console.log(`Found ${batches.length} batches to process\n`);

  const allowlistEntries = [];
  const skuSet = new Set();
  let processedRows = 0;
  let matchedRows = 0;

  for (const batch of batches) {
    const items = batch.payload || [];
    
    for (const item of items) {
      processedRows++;
      
      if (!hasTargetCatalog(item)) {
        continue;
      }

      const sku = item.part_number?.trim();
      if (!sku) continue;

      matchedRows++;
      skuSet.add(sku);

      const sources = getCatalogSources(item);
      for (const src of sources) {
        allowlistEntries.push({
          sku: sku,
          source: src.source,
          catalog: src.catalog
        });
      }
    }

    if (processedRows % 10000 === 0) {
      process.stdout.write(`\r  Processed: ${processedRows} | Matched: ${matchedRows} | Unique SKUs: ${skuSet.size}`);
    }
  }

  console.log('\n');
  console.log(`✓ Processing complete`);
  console.log(`  Total rows processed: ${processedRows}`);
  console.log(`  Rows in target catalogs: ${matchedRows}`);
  console.log(`  Unique SKUs: ${skuSet.size}`);
  console.log(`  Total allowlist entries: ${allowlistEntries.length}`);

  // Insert in batches
  console.log('\nInserting into catalog_allowlist...');
  
  const BATCH_SIZE = 1000;
  let inserted = 0;
  let insertErrors = 0;

  for (let i = 0; i < allowlistEntries.length; i += BATCH_SIZE) {
    const batch = allowlistEntries.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('catalog_allowlist')
      .upsert(batch, {
        onConflict: 'sku,source',
        ignoreDuplicates: false
      });

    if (error) {
      console.error(`Batch insert error:`, error.message);
      insertErrors++;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Inserted: ${inserted}/${allowlistEntries.length}`);
    }
  }

  console.log('\n');
  console.log('✅ Allowlist build complete!');
  console.log(`  Entries inserted: ${inserted}`);
  console.log(`  Errors: ${insertErrors}`);

  // Show catalog breakdown
  console.log('\n📊 Catalog Breakdown:');
  const { data: breakdown } = await supabase
    .from('catalog_allowlist')
    .select('catalog, sku', { count: 'exact' });

  if (breakdown) {
    const counts = {};
    breakdown.forEach(row => {
      counts[row.catalog] = (counts[row.catalog] || 0) + 1;
    });
    
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([catalog, count]) => {
        console.log(`  ${catalog}: ${count.toLocaleString()} entries`);
      });
  }

  // Show unique SKU count
  const { data: uniqueSkus } = await supabase
    .from('catalog_allowlist')
    .select('sku', { count: 'exact', head: true });

  console.log(`\n  Total unique SKUs in allowlist: ${uniqueSkus?.length || skuSet.size}`);
}

buildAllowlist().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
