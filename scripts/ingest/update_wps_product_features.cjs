#!/usr/bin/env node
/**
 * Update WPS Products with product_features from CSV
 * Reads master_item_wps.csv and updates catalog_products
 */

const fs = require('fs');
const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

async function updateProductFeatures() {
  console.log('📖 Reading WPS master CSV...\n');
  
  const csvContent = fs.readFileSync('scripts/data/wps/master_item_wps.csv', 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  
  console.log(`Found ${records.length.toLocaleString()} total WPS products in CSV\n`);
  
  // Filter to harddrive catalog only
  const harddriveCatalog = records.filter(r => r.harddrive_catalog === 'yes');
  console.log(`Harddrive catalog products: ${harddriveCatalog.length.toLocaleString()}\n`);
  
  // Count how many have product_features
  const withFeatures = harddriveCatalog.filter(r => r.product_features && r.product_features.trim() !== '');
  console.log(`Products with product_features: ${withFeatures.length.toLocaleString()}\n`);
  
  const client = await pool.connect();
  
  try {
    console.log('⚙️  Updating product_features in batches...\n');
    
    let updated = 0;
    let notFound = 0;
    let batchSize = 100;
    
    for (let i = 0; i < withFeatures.length; i += batchSize) {
      const batch = withFeatures.slice(i, i + batchSize);
      
      for (const product of batch) {
        const result = await client.query(`
          UPDATE catalog_products
          SET product_features = $1
          WHERE sku = $2
          AND source_vendor = 'wps'
        `, [product.product_features, product.sku]);
        
        if (result.rowCount > 0) {
          updated++;
        } else {
          notFound++;
        }
      }
      
      if ((i + batchSize) % 1000 === 0) {
        console.log(`  Processed ${i + batchSize} / ${withFeatures.length}`);
      }
    }
    
    console.log('\n✅ Update complete!\n');
    console.log(`   Updated: ${updated.toLocaleString()} products`);
    console.log(`   Not found: ${notFound.toLocaleString()} products\n`);
    
    // Sample some updated products
    console.log('Sample products with fitment data:');
    const samples = await client.query(`
      SELECT sku, name, LEFT(product_features, 150) as features
      FROM catalog_products
      WHERE source_vendor = 'wps'
      AND product_features LIKE '%fit%'
      AND product_features LIKE '%20%'
      LIMIT 5
    `);
    
    samples.rows.forEach(row => {
      console.log(`\n  ${row.sku} - ${row.name}`);
      console.log(`  ${row.features}...`);
    });
    
  } catch (err) {
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

updateProductFeatures().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
