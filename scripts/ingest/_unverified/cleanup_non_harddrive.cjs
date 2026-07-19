#!/usr/bin/env node
/**
 * Delete WPS products that are NOT in harddrive_catalog
 * Only keeps products where harddrive_catalog = "yes"
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

async function cleanupNonHarddrive() {
  console.log('📖 Reading WPS master CSV...');
  
  const csvPath = 'scripts/data/wps/master_item_wps.csv';
  const csvData = fs.readFileSync(csvPath, 'utf8');
  
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`📊 Found ${records.length.toLocaleString()} WPS products in CSV\n`);
  
  // Build set of SKUs that SHOULD be kept (harddrive_catalog = yes)
  const validSkus = new Set();
  let harddriveCount = 0;
  
  for (const record of records) {
    const sku = record.sku?.trim();
    const harddriveCatalog = record.harddrive_catalog?.toLowerCase().trim();
    
    if (!sku) continue;
    
    if (harddriveCatalog === 'yes') {
      validSkus.add(sku);
      harddriveCount++;
    }
  }
  
  console.log(`✅ Valid harddrive catalog SKUs: ${harddriveCount.toLocaleString()}\n`);
  
  // Check how many WPS products are in the database
  const dbCount = await pool.query(`
    SELECT COUNT(*) as count
    FROM catalog_products
    WHERE sku LIKE '0%'
  `);
  
  console.log(`📦 WPS products in database: ${parseInt(dbCount.rows[0].count).toLocaleString()}`);
  
  // Find products to delete
  const toDelete = await pool.query(`
    SELECT sku, name, category
    FROM catalog_products
    WHERE sku LIKE '0%'
    ORDER BY sku
  `);
  
  const deleteList = [];
  for (const row of toDelete.rows) {
    if (!validSkus.has(row.sku)) {
      deleteList.push(row);
    }
  }
  
  console.log(`❌ Products to delete: ${deleteList.length.toLocaleString()}\n`);
  
  if (deleteList.length === 0) {
    console.log('✅ No cleanup needed - all products are valid!');
    await pool.end();
    return;
  }
  
  // Show sample
  console.log('Sample products to be deleted:');
  for (let i = 0; i < Math.min(10, deleteList.length); i++) {
    console.log(`  ${deleteList[i].sku} - ${deleteList[i].name} (${deleteList[i].category})`);
  }
  
  console.log('\n⚠️  WARNING: This will DELETE products from the database!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('🗑️  Deleting products and related data...');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get product IDs to delete
    const idsToDelete = await client.query(
      `SELECT id FROM catalog_products WHERE sku = ANY($1)`,
      [deleteList.map(p => p.sku)]
    );
    const productIds = idsToDelete.rows.map(r => r.id);
    
    console.log('\n  Deleting dependent records...');
    
    // Delete from dependent tables first
    await client.query(`DELETE FROM vendor_offers WHERE catalog_product_id = ANY($1)`, [productIds]);
    await client.query(`DELETE FROM catalog_media WHERE product_id = ANY($1)`, [productIds]);
    await client.query(`DELETE FROM catalog_specs WHERE product_id = ANY($1)`, [productIds]);
    await client.query(`DELETE FROM catalog_fitment WHERE product_id = ANY($1)`, [productIds]);
    await client.query(`DELETE FROM catalog_inventory WHERE product_id = ANY($1)`, [productIds]);
    await client.query(`DELETE FROM catalog_prices WHERE product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting products...\n');
    
    // Delete products in batches
    const batchSize = 1000;
    for (let i = 0; i < deleteList.length; i += batchSize) {
      const batch = deleteList.slice(i, i + batchSize);
      const skus = batch.map(p => p.sku);
      
      await client.query(
        `DELETE FROM catalog_products WHERE sku = ANY($1)`,
        [skus]
      );
      
      process.stdout.write(`\r  Deleted: ${Math.min(i + batchSize, deleteList.length).toLocaleString()} / ${deleteList.length.toLocaleString()}`);
    }
    
    await client.query('COMMIT');
    console.log('\n\n✅ Cleanup complete!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  
  // Show final stats
  const finalCount = await pool.query(`
    SELECT COUNT(*) as count
    FROM catalog_products
    WHERE sku LIKE '0%'
  `);
  
  console.log(`\n📊 Final WPS product count: ${parseInt(finalCount.rows[0].count).toLocaleString()}`);
  
  await pool.end();
}

cleanupNonHarddrive().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
