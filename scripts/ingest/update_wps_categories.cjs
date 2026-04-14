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
  
  // Update database using FAST batch method with temp table
  console.log('🔄 Updating database with batch operation...\n');
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create temp table
    console.log('  Creating temporary mapping table...');
    await client.query(`
      CREATE TEMP TABLE wps_category_updates (
        sku VARCHAR(50),
        category VARCHAR(100)
      )
    `);
    
    // Insert all mappings in one go
    console.log('  Inserting category mappings...');
    const values = Array.from(categoryMap.entries())
      .map(([sku, category]) => `('${sku.replace(/'/g, "''")}', '${category.replace(/'/g, "''")}')`);
    
    // Insert in chunks of 1000
    const chunkSize = 1000;
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      await client.query(`
        INSERT INTO wps_category_updates (sku, category)
        VALUES ${chunk.join(', ')}
      `);
      process.stdout.write(`\r  Inserted ${Math.min(i + chunkSize, values.length).toLocaleString()} / ${values.length.toLocaleString()}`);
    }
    console.log('\n');
    
    // Single UPDATE using JOIN
    console.log('  Updating catalog_products...');
    const result = await client.query(`
      UPDATE catalog_products cp
      SET category = wcu.category
      FROM wps_category_updates wcu
      WHERE cp.sku = wcu.sku
        AND (cp.category IS DISTINCT FROM wcu.category)
    `);
    
    const updated = result.rowCount;
    
    await client.query('COMMIT');
    console.log(`  ✅ Updated ${updated.toLocaleString()} products\n`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  
  const updated = 0; // Will be set by the query above
  const notFound = 0;
  const alreadyCorrect = 0;
  
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
