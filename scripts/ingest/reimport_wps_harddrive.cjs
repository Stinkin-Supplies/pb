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
  
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('  Creating temporary staging table...');
    await client.query(`
      CREATE TEMP TABLE wps_import_staging (
        sku VARCHAR(50),
        name TEXT,
        brand VARCHAR(100),
        category VARCHAR(100),
        description TEXT,
        price NUMERIC,
        cost NUMERIC,
        map_price NUMERIC,
        weight NUMERIC,
        status TEXT,
        product_type TEXT
      )
    `);
    
    // Prepare batch insert values
    console.log('  Preparing batch data...');
    const values = harddriveProducts
      .filter(r => r.sku?.trim())
      .map(record => {
        const sku = record.sku.trim();
        const name = (record.product_name || record.name || 'Unknown Product').replace(/'/g, "''");
        const brand = (record.brand || 'Unknown').replace(/'/g, "''");
        const category = (record.product_type || 'General').replace(/'/g, "''");
        const description = record.product_description ? record.product_description.replace(/'/g, "''") : null;
        const price = parseFloat(record.list_price) || 0;
        const cost = parseFloat(record.standard_dealer_price) || 0;
        const map_price = parseFloat(record.mapp_price) || null;
        const weight = parseFloat(record.weight) || null;
        const status = (record.status || 'active').replace(/'/g, "''");
        const product_type = record.product_type ? record.product_type.replace(/'/g, "''") : null;
        
        return `('${sku}', '${name}', '${brand}', '${category}', ${description ? `'${description}'` : 'NULL'}, ${price}, ${cost}, ${map_price || 'NULL'}, ${weight || 'NULL'}, '${status}', ${product_type ? `'${product_type}'` : 'NULL'})`;
      });
    
    // Insert in chunks
    console.log('  Inserting into staging table...');
    const chunkSize = 1000;
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      await client.query(`
        INSERT INTO wps_import_staging (sku, name, brand, category, description, price, cost, map_price, weight, status, product_type)
        VALUES ${chunk.join(', ')}
      `);
      process.stdout.write(`\r  Staged: ${Math.min(i + chunkSize, values.length).toLocaleString()} / ${values.length.toLocaleString()}`);
    }
    console.log('\n');
    
    // Count existing vs new
    console.log('  Analyzing existing products...');
    const existing = await client.query(`
      SELECT COUNT(*) as count
      FROM catalog_products cp
      INNER JOIN wps_import_staging s ON s.sku = cp.sku
    `);
    
    const toUpdate = parseInt(existing.rows[0].count);
    const toInsert = values.length - toUpdate;
    
    console.log(`  Will update: ${toUpdate.toLocaleString()}`);
    console.log(`  Will insert: ${toInsert.toLocaleString()}\n`);
    
    // Update existing products
    console.log('  Updating existing products...');
    await client.query(`
      UPDATE catalog_products cp
      SET 
        name = s.name,
        brand = s.brand,
        category = s.category,
        description = s.description,
        price = s.price,
        cost = s.cost,
        map_price = s.map_price,
        weight = s.weight,
        status = s.status,
        product_type = s.product_type,
        updated_at = NOW()
      FROM wps_import_staging s
      WHERE cp.sku = s.sku
    `);
    
    // Insert new products
    console.log('  Inserting new products...');
    await client.query(`
      INSERT INTO catalog_products (
        sku, name, brand, category, description, price, cost,
        map_price, weight, status, product_type, is_active,
        created_at, updated_at
      )
      SELECT 
        s.sku, s.name, s.brand, s.category, s.description, s.price, s.cost,
        s.map_price, s.weight, s.status, s.product_type, true,
        NOW(), NOW()
      FROM wps_import_staging s
      WHERE NOT EXISTS (
        SELECT 1 FROM catalog_products cp WHERE cp.sku = s.sku
      )
    `);
    
    // Import images in batch
    console.log('  Importing product images...');
    
    // Build batch insert values
    const imageValues = [];
    for (const record of harddriveProducts) {
      const sku = record.sku?.trim();
      const imageUrl = record.primary_item_image?.trim();
      
      if (sku && imageUrl) {
        imageValues.push({ sku, imageUrl });
      }
    }
    
    console.log(`  Preparing ${imageValues.length} images for batch insert...`);
    
    // Create temp table for images
    await client.query(`
      CREATE TEMP TABLE images_staging (
        sku VARCHAR(50),
        image_url TEXT
      )
    `);
    
    // Insert in chunks
    const imageChunkSize = 1000;
    for (let i = 0; i < imageValues.length; i += imageChunkSize) {
      const chunk = imageValues.slice(i, i + imageChunkSize);
      const values = chunk.map(({ sku, imageUrl }) => 
        `('${sku.replace(/'/g, "''")}', '${imageUrl.replace(/'/g, "''")}')`
      );
      
      await client.query(`
        INSERT INTO images_staging (sku, image_url)
        VALUES ${values.join(', ')}
      `);
      
      process.stdout.write(`\r  Staged: ${Math.min(i + imageChunkSize, imageValues.length)} / ${imageValues.length}`);
    }
    console.log('\n');
    
    // Batch insert into catalog_media
    console.log('  Inserting images into catalog_media...');
    const result = await client.query(`
      INSERT INTO catalog_media (product_id, media_type, url, priority)
      SELECT cp.id, 'image', ist.image_url, 0
      FROM images_staging ist
      INNER JOIN catalog_products cp ON cp.sku = ist.sku
      ON CONFLICT (product_id, url) DO NOTHING
    `);
    
    console.log(`  Imported ${result.rowCount} images\n`);
    
    await client.query('COMMIT');
    console.log('\n');
    
    inserted = toInsert;
    updated = toUpdate;
    
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
