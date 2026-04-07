#!/usr/bin/env node
/**
 * Update WPS Product Categories from Master CSV
 * Reads master_item_wps.csv and updates catalog_products with correct product_type → category
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

async function updateWpsCategories() {
  console.log('📖 Reading WPS master CSV...');
  
  const csvPath = 'scripts/data/wps/master_item_wps.csv';
  const csvData = fs.readFileSync(csvPath, 'utf8');
  
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`📊 Found ${records.length.toLocaleString()} WPS products in CSV\n`);
  
  // Build SKU → category map (only harddrive_catalog products)
  const categoryMap = new Map();
  let hasCategory = 0;
  let noCategory = 0;
  let skippedNotHarddrive = 0;
  
  for (const record of records) {
    const sku = record.sku?.trim();
    const productType = record.product_type?.trim();
    const harddriveCatalog = record.harddrive_catalog?.toLowerCase().trim();
    
    if (!sku) continue;
    
    // ONLY process products with harddrive_catalog = "yes"
    if (harddriveCatalog !== 'yes') {
      skippedNotHarddrive++;
      continue;
    }
    
    if (productType && productType !== '') {
      categoryMap.set(sku, productType);
      hasCategory++;
    } else {
      noCategory++;
    }
  }
  
  console.log(`✅ Harddrive catalog products with category: ${hasCategory.toLocaleString()}`);
  console.log(`⚠️  Harddrive catalog products without category: ${noCategory.toLocaleString()}`);
  console.log(`⏭️  Skipped (not in harddrive catalog): ${skippedNotHarddrive.toLocaleString()}\n`);
  
  console.log(`✅ Products with category: ${hasCategory.toLocaleString()}`);
  console.log(`⚠️  Products without category: ${noCategory.toLocaleString()}\n`);
  
  // Update database in batches
  console.log('🔄 Updating database...');
  
  const client = await pool.connect();
  let updated = 0;
  let notFound = 0;
  let alreadyCorrect = 0;
  
  try {
    await client.query('BEGIN');
    
    for (const [sku, category] of categoryMap.entries()) {
      const result = await client.query(
        `UPDATE catalog_products 
         SET category = $1
         WHERE sku = $2 
         AND (category IS DISTINCT FROM $1)
         RETURNING id`,
        [category, sku]
      );
      
      if (result.rowCount > 0) {
        updated++;
      } else {
        // Check if product exists
        const exists = await client.query(
          'SELECT category FROM catalog_products WHERE sku = $1',
          [sku]
        );
        
        if (exists.rows.length === 0) {
          notFound++;
        } else {
          alreadyCorrect++;
        }
      }
      
      // Progress indicator
      if ((updated + notFound + alreadyCorrect) % 1000 === 0) {
        process.stdout.write(`\r  Progress: ${(updated + notFound + alreadyCorrect).toLocaleString()} | Updated: ${updated.toLocaleString()}`);
      }
    }
    
    await client.query('COMMIT');
    console.log('\n');
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  
  console.log('\n✅ Update complete!');
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Already correct: ${alreadyCorrect.toLocaleString()}`);
  console.log(`   Not found in DB: ${notFound.toLocaleString()}`);
  
  // Show category distribution after update
  console.log('\n📊 Category distribution (WPS products only):');
  const stats = await pool.query(`
    SELECT category, COUNT(*) as count
    FROM catalog_products
    WHERE sku LIKE '0%'
    AND is_active = true
    GROUP BY category
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);
  
  for (const row of stats.rows) {
    console.log(`   ${row.category?.padEnd(35)} ${row.count.toLocaleString()}`);
  }
  
  await pool.end();
}

updateWpsCategories().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
