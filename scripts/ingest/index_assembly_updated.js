#!/usr/bin/env node

/**
 * Typesense Product Indexer - UPDATED
 * Indexes products with brands, images, inventory, and enrichment data
 */

import dotenv from 'dotenv';
import pg from 'pg';
import Typesense from 'typesense';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local' });
const { Pool } = pg;

const pool = new Pool({
  host: process.env.CATALOG_DB_HOST || '5.161.100.126',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const typesenseClient = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST || 'localhost',
    port: process.env.TYPESENSE_PORT || 8108,
    protocol: process.env.TYPESENSE_PROTOCOL || 'http',
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10,
});

const COLLECTION_NAME = 'products';

async function fetchProductsWithData() {
  console.log('\n📦 Fetching products with enrichment data...\n');
  
  const query = `
    SELECT 
      cp.id,
      cp.sku,
      cp.name,
      cp.description,
      cp.brand,
      cp.category,
      cp.price,
      cp.msrp,
      cp.cost,
      cp.weight,
      cp.upc,
      cp.manufacturer_part_number,
      cp.source_vendor,
      cp.is_active,
      cp.status,
      cp.slug,
      
      -- Images from catalog_media (array of URLs)
      COALESCE(
        array_agg(DISTINCT cm.url) FILTER (WHERE cm.url IS NOT NULL),
        ARRAY[]::text[]
      ) as images,
      
      -- Inventory data (total available across all warehouses)
      COALESCE(SUM(ci.quantity), 0)::int as inventory_total,
      
      -- Has inventory flag
      CASE 
        WHEN COALESCE(SUM(ci.quantity), 0) > 0 THEN true 
        ELSE false 
      END as in_stock,
      
      -- Enrichment data
      pe.product_name as enriched_name,
      pe.metadata as enrichment_metadata
      
    FROM catalog_products cp
    LEFT JOIN catalog_media cm ON cp.id = cm.product_id
    LEFT JOIN catalog_inventory ci ON cp.sku = ci.sku
    LEFT JOIN catalog_product_enrichment pe ON cp.sku = pe.sku
    
    WHERE cp.id IS NOT NULL
    
    GROUP BY 
      cp.id, cp.sku, cp.name, cp.description, cp.brand, 
      cp.category, cp.price, cp.msrp, cp.cost,
      cp.weight, cp.upc, cp.manufacturer_part_number,
      cp.source_vendor, cp.is_active, cp.status, cp.slug,
      pe.product_name, pe.metadata
    
    ORDER BY cp.id
  `;
  
  console.log('Executing query...');
  const result = await pool.query(query);
  console.log(`✅ Found ${result.rows.length.toLocaleString()} products\n`);
  
  return result.rows;
}

function transformProduct(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  const hasImage = images.length > 0 && images[0] !== null;
  
  // Use enriched name if available, otherwise original name
  const productName = row.enriched_name || row.name || 'Untitled Product';
  
  // Parse enrichment metadata if available
  let imageWidth = null;
  let imageHeight = null;
  let supplierItemId = null;
  
  if (row.enrichment_metadata) {
    try {
      const metadata = typeof row.enrichment_metadata === 'string' 
        ? JSON.parse(row.enrichment_metadata) 
        : row.enrichment_metadata;
      
      imageWidth = metadata.image_width || null;
      imageHeight = metadata.image_height || null;
      supplierItemId = metadata.supplier_item_id || null;
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  return {
    id: row.id.toString(),
    sku: row.sku,
    name: productName,
    description: row.description || '',
    brand: row.brand || '',
    category: row.category || '',
    price: parseFloat(row.price) || 0,
    msrp: parseFloat(row.msrp) || 0,
    cost: parseFloat(row.cost) || 0,
    source_vendor: row.source_vendor || '',
    manufacturer_part_number: row.manufacturer_part_number || '',
    supplier_item_id: supplierItemId || '',
    weight: parseFloat(row.weight) || 0,
    upc: row.upc || '',
    is_active: row.is_active || false,
    status: row.status || '',
    slug: row.slug || '',
    
    // Images
    images: images.filter(url => url !== null),
    image_url: hasImage ? images[0] : '',
    has_image: hasImage,
    image_width: imageWidth,
    image_height: imageHeight,
    
    // Inventory
    inventory_total: row.inventory_total || 0,
    in_stock: row.in_stock || false,
    
    // Sorting fields
    sort_priority: hasImage ? 1 : 0,
    name_sort: productName.toLowerCase(),
  };
}

async function recreateCollection() {
  console.log('🗑️  Deleting existing collection...\n');
  
  try {
    await typesenseClient.collections(COLLECTION_NAME).delete();
    console.log('   ✓ Deleted old collection\n');
  } catch (error) {
    if (error.httpStatus === 404) {
      console.log('   ℹ️  Collection does not exist, creating new one\n');
    } else {
      throw error;
    }
  }
  
  console.log('📋 Creating new collection schema...\n');
  
  const schema = {
    name: COLLECTION_NAME,
    fields: [
      { name: 'sku', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'brand', type: 'string', facet: true, optional: true },
      { name: 'category', type: 'string', facet: true, optional: true },
      { name: 'price', type: 'float', facet: true },
      { name: 'msrp', type: 'float', optional: true },
      { name: 'cost', type: 'float', optional: true },
      { name: 'source_vendor', type: 'string', facet: true, optional: true },
      { name: 'manufacturer_part_number', type: 'string', optional: true },
      { name: 'supplier_item_id', type: 'string', optional: true },
      { name: 'weight', type: 'float', optional: true },
      { name: 'upc', type: 'string', optional: true },
      { name: 'is_active', type: 'bool', facet: true },
      { name: 'status', type: 'string', facet: true, optional: true },
      { name: 'slug', type: 'string', optional: true },
      
      // Images
      { name: 'images', type: 'string[]', optional: true },
      { name: 'image_url', type: 'string', optional: true },
      { name: 'has_image', type: 'bool', facet: true },
      { name: 'image_width', type: 'int32', optional: true },
      { name: 'image_height', type: 'int32', optional: true },
      
      // Inventory
      { name: 'inventory_total', type: 'int32', facet: true },
      { name: 'in_stock', type: 'bool', facet: true },
      
      // Sorting
      { name: 'sort_priority', type: 'int32' },
      { name: 'name_sort', type: 'string', optional: true },
    ],
    default_sorting_field: 'sort_priority',
  };
  
  await typesenseClient.collections().create(schema);
  console.log('   ✓ Collection created successfully\n');
}

async function indexProducts(products) {
  console.log(`📝 Indexing ${products.length.toLocaleString()} products...\n`);
  
  const BATCH_SIZE = 100;
  const progress = new ProgressBar(products.length, 'Indexing products');
  
  let indexed = 0;
  let errors = 0;
  
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const documents = batch.map(transformProduct);
    
    try {
      const result = await typesenseClient
        .collections(COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'upsert' });
      
      // Count successes and errors
      result.forEach(item => {
        if (item.success) {
          indexed++;
        } else {
          errors++;
        }
      });
      
    } catch (error) {
      console.error(`\nBatch error:`, error.message);
      errors += batch.length;
    }
    
    progress.update(Math.min(i + BATCH_SIZE, products.length));
  }
  
  progress.finish('Complete');
  
  console.log(`\n✅ Indexing complete:`);
  console.log(`   Indexed: ${indexed.toLocaleString()}`);
  console.log(`   Errors: ${errors.toLocaleString()}`);
}

async function showStats() {
  console.log('\n📊 Index Statistics:\n');
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE brand IS NOT NULL) as with_brand,
      COUNT(DISTINCT cm.product_id) as with_images,
      COUNT(DISTINCT ci.sku) FILTER (WHERE ci.quantity > 0) as in_stock
    FROM catalog_products cp
    LEFT JOIN catalog_media cm ON cp.id = cm.product_id
    LEFT JOIN catalog_inventory ci ON cp.sku = ci.sku
  `);
  
  const s = stats.rows[0];
  console.log(`   Total products: ${parseInt(s.total).toLocaleString()}`);
  console.log(`   With brands: ${parseInt(s.with_brand).toLocaleString()}`);
  console.log(`   With images: ${parseInt(s.with_images).toLocaleString()}`);
  console.log(`   In stock: ${parseInt(s.in_stock).toLocaleString()}`);
  
  // Typesense collection stats
  const collection = await typesenseClient.collections(COLLECTION_NAME).retrieve();
  console.log(`\n   Typesense documents: ${collection.num_documents.toLocaleString()}`);
}

async function main() {
  try {
    console.log('\n🚀 Typesense Product Indexer - FULL DATA\n');
    console.log('This will index:');
    console.log('  ✓ Product details (name, description, price)');
    console.log('  ✓ Brands');
    console.log('  ✓ Images from catalog_media');
    console.log('  ✓ Inventory from catalog_inventory');
    console.log('  ✓ Enrichment data (supplier IDs, dimensions)\n');
    
    await recreateCollection();
    const products = await fetchProductsWithData();
    await indexProducts(products);
    await showStats();
    
    console.log('\n🎉 Indexing complete!\n');
    console.log('Test search:');
    console.log(`  curl "http://localhost:8108/collections/${COLLECTION_NAME}/documents/search?q=harley&query_by=name,brand&filter_by=has_image:true"\n`);
    
  } catch (error) {
    console.error('❌ Indexing failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
