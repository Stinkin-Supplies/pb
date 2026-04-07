#!/usr/bin/env node
/**
 * Re-import WPS Harddrive Catalog Products
 * Imports products where harddrive_catalog = "yes" from master CSV
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

async function reimportWpsProducts() {
  console.log('📖 Reading WPS master CSV...');
  
  const csvPath = 'scripts/data/wps/master_item_wps.csv';
  const csvData = fs.readFileSync(csvPath, 'utf8');
  
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`📊 Total WPS products in CSV: ${records.length.toLocaleString()}\n`);
  
  // Filter for harddrive catalog only
  const harddriveProducts = records.filter(r => 
    r.harddrive_catalog?.toLowerCase().trim() === 'yes'
  );
  
  console.log(`✅ Harddrive catalog products: ${harddriveProducts.length.toLocaleString()}\n`);
  
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  
  try {
    await client.query('BEGIN');
    
    for (const record of harddriveProducts) {
      const sku = record.sku?.trim();
      if (!sku) {
        skipped++;
        continue;
      }
      
      // Map CSV columns to database columns
      const product = {
        sku: sku,
        name: record.product_name || record.name || 'Unknown Product',
        brand: record.brand || 'Unknown',
        category: record.product_type || 'General',
        description: record.product_description || null,
        price: parseFloat(record.list_price) || 0,
        cost: parseFloat(record.standard_dealer_price) || 0,
        map_price: parseFloat(record.mapp_price) || null,
        weight: parseFloat(record.weight) || null,
        status: record.status || 'active',
        product_type: record.product_type || null,
      };
      
      // Upsert (insert or update if exists)
      const result = await client.query(`
        INSERT INTO catalog_products (
          sku, name, brand, category, description, price, cost, 
          map_price, weight, status, product_type, is_active, 
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW()
        )
        ON CONFLICT (sku) DO UPDATE SET
          name = EXCLUDED.name,
          brand = EXCLUDED.brand,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          cost = EXCLUDED.cost,
          map_price = EXCLUDED.map_price,
          weight = EXCLUDED.weight,
          status = EXCLUDED.status,
          product_type = EXCLUDED.product_type,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [
        product.sku,
        product.name,
        product.brand,
        product.category,
        product.description,
        product.price,
        product.cost,
        product.map_price,
        product.weight,
        product.status,
        product.product_type,
      ]);
      
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      // Progress
      if ((inserted + updated) % 1000 === 0) {
        process.stdout.write(`\r  Progress: ${(inserted + updated).toLocaleString()} | Inserted: ${inserted.toLocaleString()} | Updated: ${updated.toLocaleString()}`);
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
  
  console.log('\n✅ Import complete!');
  console.log(`   Inserted: ${inserted.toLocaleString()}`);
  console.log(`   Updated: ${updated.toLocaleString()}`);
  console.log(`   Skipped: ${skipped.toLocaleString()}`);
  
  // Show final count
  const finalCount = await pool.query(`
    SELECT COUNT(*) as count
    FROM catalog_products
    WHERE sku LIKE '0%'
  `);
  
  console.log(`\n📊 Final WPS product count: ${parseInt(finalCount.rows[0].count).toLocaleString()}`);
  
  // Show category distribution
  console.log('\n📊 Category distribution:');
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

reimportWpsProducts().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
