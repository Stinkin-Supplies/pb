#!/usr/bin/env node

/**
 * WPS Database Setup
 * Creates all necessary tables for WPS API enrichment
 */

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
const { Pool } = pg;

const pool = new Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

async function setupTables() {
  console.log('🔧 Setting up WPS enrichment tables...\n');
  
  try {
    // 1. Pricing table
    console.log('📊 Creating catalog_pricing...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_pricing (
        id SERIAL PRIMARY KEY,
        sku TEXT NOT NULL,
        punctuated_sku TEXT,
        dealer_price DECIMAL(10, 2),
        supplier TEXT DEFAULT 'WPS',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(sku, supplier)
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_sku ON catalog_pricing(sku)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_supplier ON catalog_pricing(supplier)
    `);
    console.log('✅ catalog_pricing ready\n');
    
    // 2. Inventory table
    console.log('📦 Creating catalog_inventory...');
    
    // Check if table already exists with wrong schema
    const inventoryExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'catalog_inventory'
      );
    `);
    
    if (inventoryExists.rows[0].exists) {
      console.log('   Table already exists, checking schema...');
      
      // Check if sku column exists
      const skuExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'catalog_inventory'
          AND column_name = 'sku'
        );
      `);
      
      if (!skuExists.rows[0].exists) {
        console.log('   ⚠️  Table exists but missing sku column - dropping and recreating...');
        await pool.query(`DROP TABLE IF EXISTS catalog_inventory CASCADE`);
      }
    }
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_inventory (
        id SERIAL PRIMARY KEY,
        sku TEXT NOT NULL,
        quantity INTEGER DEFAULT 0,
        warehouse TEXT,
        supplier TEXT DEFAULT 'WPS',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(sku, supplier, warehouse)
      )
    `);
    
    // Create index separately
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_sku ON catalog_inventory(sku)
    `);
    console.log('✅ catalog_inventory ready\n');
    
    // 3. Brands table
    console.log('🏷️  Creating catalog_brands...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_brands (
        id SERIAL PRIMARY KEY,
        brand_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        website TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ catalog_brands ready\n');
    
    // 4. Attribute keys table
    console.log('🔑 Creating catalog_attribute_keys...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_attribute_keys (
        id SERIAL PRIMARY KEY,
        key_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ catalog_attribute_keys ready\n');
    
    // 5. Attribute values table
    console.log('🏷️  Creating catalog_attribute_values...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_attribute_values (
        id SERIAL PRIMARY KEY,
        value_id INTEGER UNIQUE NOT NULL,
        key_id INTEGER,
        value TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (key_id) REFERENCES catalog_attribute_keys(key_id)
      )
    `);
    console.log('✅ catalog_attribute_values ready\n');
    
    // 6. Product enrichment table
    console.log('📝 Creating catalog_product_enrichment...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_product_enrichment (
        id SERIAL PRIMARY KEY,
        sku TEXT UNIQUE NOT NULL,
        product_id INTEGER,
        item_id INTEGER,
        product_name TEXT,
        product_description TEXT,
        attributes JSONB,
        features JSONB,
        tags JSONB,
        blocks JSONB,
        resources JSONB,
        taxonomy JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_enrichment_sku ON catalog_product_enrichment(sku)
    `);
    console.log('✅ catalog_product_enrichment ready\n');
    
    // Summary
    console.log('🎉 All tables created successfully!\n');
    
    // Show table sizes
    const result = await pool.query(`
      SELECT 
        'catalog_pricing' as table_name,
        COUNT(*) as row_count
      FROM catalog_pricing
      UNION ALL
      SELECT 'catalog_inventory', COUNT(*) FROM catalog_inventory
      UNION ALL
      SELECT 'catalog_brands', COUNT(*) FROM catalog_brands
      UNION ALL
      SELECT 'catalog_attribute_keys', COUNT(*) FROM catalog_attribute_keys
      UNION ALL
      SELECT 'catalog_attribute_values', COUNT(*) FROM catalog_attribute_values
      UNION ALL
      SELECT 'catalog_product_enrichment', COUNT(*) FROM catalog_product_enrichment
      ORDER BY table_name
    `);
    
    console.log('📊 Current table sizes:');
    result.rows.forEach(row => {
      console.log(`   ${row.table_name}: ${row.row_count} rows`);
    });
    
  } catch (error) {
    console.error('❌ Error setting up tables:', error);
    throw error;
  }
}

async function main() {
  try {
    await setupTables();
    console.log('\n✅ Database setup complete!\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
