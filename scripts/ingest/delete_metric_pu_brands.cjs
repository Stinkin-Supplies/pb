#!/usr/bin/env node
/**
 * Delete Metric/Dirt Bike PU Products
 * Keeps only Harley-focused brands
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// Brands to DELETE (metric/dirt bike/MX)
const BRANDS_TO_DELETE = [
  'MOOSE OFFROAD',
  'ALPINESTARS',
  'FACTORY EFFEX',
  'SW-MOTECH',
  'THOR',
  'FMF',
  'ICON',
  'Z1R',
  'UFO',
  'D\'COR VISUALS',
  '100%',
  'WOODY\'S',
  'KFI PRODUCTS',
  'GIVI',
  'PUIG HI-TECH PARTS',
  'ZERO GRAVITY',
  'DYNOJET',
  'UNI FILTER',
  'JT SPROCKETS',
  'RICK\'S MOTORSPORT ELECTRIC',
];

async function deleteMetricBrands() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get product IDs to delete
    console.log('📊 Finding products to delete...\n');
    const productsToDelete = await client.query(`
      SELECT id, sku, name, brand
      FROM catalog_products
      WHERE source_vendor LIKE '%pu%'
      AND brand = ANY($1)
    `, [BRANDS_TO_DELETE]);
    
    const productIds = productsToDelete.rows.map(p => p.id);
    
    console.log(`Found ${productIds.length.toLocaleString()} products to delete`);
    console.log('\nTop brands being removed:');
    
    // Show brand counts
    const brandCounts = {};
    productsToDelete.rows.forEach(p => {
      brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
    });
    
    Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([brand, count]) => {
        console.log(`  ${brand}: ${count.toLocaleString()}`);
      });
    
    console.log('\n⚠️  WARNING: This will DELETE products from the database!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🗑️  Deleting products and dependencies...\n');
    
    // Delete dependencies
    console.log('  Deleting vendor_offers...');
    await client.query(`DELETE FROM vendor_offers WHERE catalog_product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting catalog_media...');
    await client.query(`DELETE FROM catalog_media WHERE product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting catalog_specs...');
    await client.query(`DELETE FROM catalog_specs WHERE product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting catalog_fitment...');
    await client.query(`DELETE FROM catalog_fitment WHERE product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting catalog_inventory...');
    await client.query(`DELETE FROM catalog_inventory WHERE product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting catalog_prices...');
    await client.query(`DELETE FROM catalog_prices WHERE product_id = ANY($1)`, [productIds]);
    
    console.log('  Deleting products...\n');
    const result = await client.query(`
      DELETE FROM catalog_products WHERE id = ANY($1)
    `, [productIds]);
    
    await client.query('COMMIT');
    
    console.log('✅ Delete complete!\n');
    console.log(`   Deleted: ${result.rowCount.toLocaleString()} products\n`);
    
    // Show final counts
    const finalCount = await pool.query(`
      SELECT COUNT(*) as count FROM catalog_products WHERE source_vendor LIKE '%pu%'
    `);
    
    console.log(`📊 Final PU product count: ${parseInt(finalCount.rows[0].count).toLocaleString()}\n`);
    
    // Show remaining brands
    console.log('Remaining PU brands (top 20):');
    const remainingBrands = await pool.query(`
      SELECT brand, COUNT(*) as count
      FROM catalog_products
      WHERE source_vendor LIKE '%pu%'
      GROUP BY brand
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);
    
    remainingBrands.rows.forEach(row => {
      console.log(`  ${row.brand?.padEnd(30)} ${row.count.toLocaleString()}`);
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

deleteMetricBrands().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
