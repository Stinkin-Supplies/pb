#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProgressBar } from './progress_bar.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const dbClient = new Client({
  connectionString: process.env.CATALOG_DATABASE_URL
});

// Common size patterns
const SIZES = {
  'XS': 'Extra Small',
  '2XS': '2X Small',
  '3XS': '3X Small',
  'SM': 'Small',
  'S': 'Small',
  'MD': 'Medium',
  'M': 'Medium',
  'LG': 'Large',
  'L': 'Large',
  'XL': 'Extra Large',
  '2X': '2X Large',
  '2XL': '2X Large',
  '3XL': '3X Large',
  '4XL': '4X Large',
};

// Common color patterns
const COLORS = [
  'BLACK', 'WHITE', 'RED', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'PURPLE', 'PINK', 'GRAY', 'GREY',
  'SILVER', 'GOLD', 'BROWN', 'BEIGE', 'NAVY', 'TEAL', 'CYAN', 'MAGENTA', 'LIME',
  'MATTE', 'GLOSS', 'PEARL', 'METAL', 'CHROME', 'CARBON'
];

function parseProductName(name, brand) {
  const attributes = {};
  const upper = name.toUpperCase();

  // Extract size
  for (const [sizeKey, sizeValue] of Object.entries(SIZES)) {
    if (upper.includes(sizeKey)) {
      attributes.size = sizeValue;
      break;
    }
  }

  // Extract color
  for (const color of COLORS) {
    if (upper.includes(color)) {
      attributes.color = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
      break;
    }
  }

  // Extract basic category from name patterns
  if (upper.includes('HELMET')) attributes.category = 'Helmet';
  if (upper.includes('JACKET')) attributes.category = 'Jacket';
  if (upper.includes('GLOVE')) attributes.category = 'Gloves';
  if (upper.includes('BOOT')) attributes.category = 'Boots';
  if (upper.includes('PANT')) attributes.category = 'Pants';
  if (upper.includes('SHIRT')) attributes.category = 'Shirt';
  if (upper.includes('GOGGLE')) attributes.category = 'Goggles';
  if (upper.includes('VISOR')) attributes.category = 'Visor';

  if (brand) {
    attributes.brand = brand;
  }

  return Object.keys(attributes).length > 0 ? attributes : null;
}

async function enrichPUProducts() {
  try {
    console.log('🚀 Starting PU product enrichment via name parsing...\n');
    
    await dbClient.connect();
    console.log('✅ Connected to database');

    // Get all PU products
    const { rows: products } = await dbClient.query(`
      SELECT sku, name, brand FROM pu_products
      ORDER BY sku
    `);

    console.log(`📂 Found ${products.length} PU products to enrich\n`);

    const progressBar = new ProgressBar(products.length, 'Enriching PU products');
    
    let enriched = 0;
    const batchSize = 500;
    let batch = [];

    for (let i = 0; i < products.length; i++) {
      const { sku, name, brand } = products[i];
      
      const attributes = parseProductName(name, brand);
      
      if (attributes) {
        batch.push([sku, JSON.stringify(attributes)]);
        enriched++;
      }

      if (batch.length >= batchSize) {
        // Batch insert
        const placeholders = batch.map((_, idx) => 
          `($${idx * 2 + 1}, $${idx * 2 + 2})`
        ).join(',');
        
        const values = batch.flat();
        
        await dbClient.query(`
          INSERT INTO catalog_product_enrichment (sku, attributes)
          VALUES ${placeholders}
          ON CONFLICT (sku) DO UPDATE SET
            attributes = COALESCE(catalog_product_enrichment.attributes, EXCLUDED.attributes) || EXCLUDED.attributes,
            updated_at = NOW()
        `, values);
        
        batch = [];
      }

      progressBar.update(i + 1, `${enriched} enriched`);
    }

    // Insert remaining batch
    if (batch.length > 0) {
      const placeholders = batch.map((_, idx) => 
        `($${idx * 2 + 1}, $${idx * 2 + 2})`
      ).join(',');
      
      const values = batch.flat();
      
      await dbClient.query(`
        INSERT INTO catalog_product_enrichment (sku, attributes)
        VALUES ${placeholders}
        ON CONFLICT (sku) DO UPDATE SET
          attributes = COALESCE(catalog_product_enrichment.attributes, EXCLUDED.attributes) || EXCLUDED.attributes,
          updated_at = NOW()
      `, values);
    }

    progressBar.finish(`${enriched} enriched`);
    console.log();

    const { rows: stats } = await dbClient.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN attributes IS NOT NULL THEN 1 END) as with_attributes
      FROM catalog_product_enrichment
    `);

    console.log('📊 Enrichment Summary:');
    console.log(`   Total enrichment records: ${stats[0].total.toLocaleString()}`);
    console.log(`   With attributes: ${stats[0].with_attributes.toLocaleString()}`);

    const { rows: sample } = await dbClient.query(`
      SELECT sku, attributes FROM catalog_product_enrichment 
      WHERE attributes IS NOT NULL 
      LIMIT 3
    `);

    console.log('\n📋 Sample Enriched Records:');
    sample.forEach((row, idx) => {
      console.log(`   ${idx + 1}. SKU: ${row.sku}`);
      console.log(`      Attributes: ${JSON.stringify(row.attributes, null, 2)}`);
    });

    console.log('\n✨ PU enrichment complete!');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

enrichPUProducts();
