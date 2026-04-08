#!/usr/bin/env node
/**
 * Extract Complete Product Data from PU XML Files
 * Handles both PIES and Catalog Content Export formats
 * Extracts: descriptions, dimensions, weight, UPC, country of origin, OEM numbers, images
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parseStringPromise } = require('xml2js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

const XML_DIR = 'scripts/data/pu_pricefile';

// Parse PIES format
function parsePIESProduct(item) {
  const data = {
    sku: item.PartNumber?.[0],
    brand: item.BrandLabel?.[0],
  };
  
  // Descriptions
  const descriptions = item.Descriptions?.[0]?.Description || [];
  const titleDesc = descriptions.find(d => d.$.DescriptionCode === 'TLE');
  const mainDesc = descriptions.find(d => d.$.DescriptionCode === 'DES');
  const features = descriptions.filter(d => d.$.DescriptionCode === 'FAB');
  
  if (titleDesc) data.description = titleDesc._;
  if (features.length > 0) {
    data.product_features = '<ul>' + features.map(f => `<li>${f._}</li>`).join('') + '</ul>';
  }
  
  // Extended info
  const extendedInfo = item.ExtendedInformation?.[0]?.ExtendedProductInformation || [];
  const ospInfo = extendedInfo.find(info => info.$.EXPICode === 'OSP');
  const ctoInfo = extendedInfo.find(info => info.$.EXPICode === 'CTO');
  
  if (ospInfo) data.oem_part_number = ospInfo._;
  if (ctoInfo) data.country_of_origin = ctoInfo._;
  
  // Package dimensions and weight
  const pkg = item.Packages?.[0]?.Package?.[0];
  if (pkg) {
    const dims = pkg.Dimensions?.[0];
    const weights = pkg.Weights?.[0];
    
    if (dims) {
      data.dimensions = {
        height: parseFloat(dims.MerchandisingHeight?.[0]) || null,
        width: parseFloat(dims.MerchandisingWidth?.[0]) || null,
        length: parseFloat(dims.MerchandisingLength?.[0]) || null,
        unit: dims.$.UOM || 'IN',
      };
    }
    
    if (weights) {
      data.weight = parseFloat(weights.Weight?.[0]) || null;
    }
  }
  
  // Images
  const digitalAssets = item.DigitalAssets?.[0]?.DigitalFileInformation || [];
  const imageAsset = digitalAssets.find(a => a.AssetType?.[0] === 'ZZ1');
  if (imageAsset) {
    data.image_url = imageAsset.URI?.[0];
  }
  
  return data;
}

// Parse Catalog Content format
function parseCatalogContentProduct(part) {
  const data = {
    sku: part.punctuatedPartNumber?.[0] || part.partNumber?.[0],
    brand: part.brandName?.[0],
    description: part.partDescription?.[0],
    oem_part_number: part.supplierNumber?.[0],
  };
  
  // Combine bullet points into product_features
  const bullets = [];
  for (let i = 1; i <= 24; i++) {
    const bullet = part[`bullet${i}`]?.[0];
    if (bullet && bullet.trim()) {
      bullets.push(bullet.trim());
    }
  }
  
  if (bullets.length > 0) {
    data.product_features = '<ul>' + bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
  }
  
  // Image
  if (part.partImage?.[0]) {
    data.image_url = part.partImage[0];
  }
  
  return data;
}

async function extractAllProductData() {
  console.log('📁 Finding XML files...\n');
  
  const files = fs.readdirSync(XML_DIR)
    .filter(f => f.endsWith('.xml') && f !== 'pu-price-file.csv')
    .map(f => path.join(XML_DIR, f));
  
  console.log(`Found ${files.length} XML files\n`);
  
  const piesFiles = files.filter(f => f.includes('PIES'));
  const catalogFiles = files.filter(f => f.includes('Catalog_Content'));
  
  console.log(`  PIES format: ${piesFiles.length}`);
  console.log(`  Catalog Content format: ${catalogFiles.length}\n`);
  
  const client = await pool.connect();
  
  try {
    let stats = {
      totalProducts: 0,
      updated: 0,
      notInCatalog: 0,
      descriptionAdded: 0,
      featuresAdded: 0,
      dimensionsAdded: 0,
      weightAdded: 0,
      oemAdded: 0,
      countryAdded: 0,
      imageAdded: 0,
    };
    
    console.log('⚙️  Processing PIES files...\n');
    
    for (const file of piesFiles) {
      const brandName = path.basename(file).replace('_PIES_Export.xml', '').replace(/_/g, ' ');
      console.log(`📦 ${brandName}`);
      
      const xml = fs.readFileSync(file, 'utf-8');
      const parsed = await parseStringPromise(xml);
      const items = parsed.PIES?.Items?.[0]?.Item || [];
      
      for (const item of items) {
        stats.totalProducts++;
        const data = parsePIESProduct(item);
        
        if (!data.sku) continue;
        
        await updateProduct(client, data, stats);
      }
    }
    
    console.log('\n⚙️  Processing Catalog Content files...\n');
    
    for (const file of catalogFiles) {
      const brandName = path.basename(file).replace('_Catalog_Content_Export.xml', '').replace(/_/g, ' ');
      console.log(`📦 ${brandName}`);
      
      const xml = fs.readFileSync(file, 'utf-8');
      const parsed = await parseStringPromise(xml);
      const parts = parsed.root?.part || [];
      
      for (const part of parts) {
        stats.totalProducts++;
        const data = parseCatalogContentProduct(part);
        
        if (!data.sku) continue;
        
        await updateProduct(client, data, stats);
      }
    }
    
    console.log('\n✅ Data extraction complete!\n');
    console.log(`   Total products processed: ${stats.totalProducts.toLocaleString()}`);
    console.log(`   Updated in catalog: ${stats.updated.toLocaleString()}`);
    console.log(`   Not in catalog: ${stats.notInCatalog.toLocaleString()}\n`);
    console.log('   Fields added:');
    console.log(`     Descriptions: ${stats.descriptionAdded.toLocaleString()}`);
    console.log(`     Product features: ${stats.featuresAdded.toLocaleString()}`);
    console.log(`     Dimensions: ${stats.dimensionsAdded.toLocaleString()}`);
    console.log(`     Weight: ${stats.weightAdded.toLocaleString()}`);
    console.log(`     OEM part numbers: ${stats.oemAdded.toLocaleString()}`);
    console.log(`     Country of origin: ${stats.countryAdded.toLocaleString()}`);
    console.log(`     Images: ${stats.imageAdded.toLocaleString()}\n`);
    
  } catch (err) {
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function updateProduct(client, data, stats) {
  // Check if product exists
  const existing = await client.query(`
    SELECT 
      id, description, product_features, dimensions, weight, 
      oem_part_number, country_of_origin
    FROM catalog_products
    WHERE sku = $1
    AND source_vendor LIKE '%pu%'
  `, [data.sku]);
  
  if (existing.rows.length === 0) {
    stats.notInCatalog++;
    return;
  }
  
  const product = existing.rows[0];
  const updates = [];
  const values = [];
  let paramCount = 1;
  
  // Only update if field is missing
  if (data.description && !product.description) {
    updates.push(`description = $${paramCount++}`);
    values.push(data.description);
    stats.descriptionAdded++;
  }
  
  if (data.product_features && !product.product_features) {
    updates.push(`product_features = $${paramCount++}`);
    values.push(data.product_features);
    stats.featuresAdded++;
  }
  
  if (data.dimensions && !product.dimensions) {
    updates.push(`dimensions = $${paramCount++}`);
    values.push(JSON.stringify(data.dimensions));
    stats.dimensionsAdded++;
  }
  
  if (data.weight && !product.weight) {
    updates.push(`weight = $${paramCount++}`);
    values.push(data.weight);
    stats.weightAdded++;
  }
  
  if (data.oem_part_number && !product.oem_part_number) {
    updates.push(`oem_part_number = $${paramCount++}`);
    values.push(data.oem_part_number);
    stats.oemAdded++;
  }
  
  if (data.country_of_origin && !product.country_of_origin) {
    updates.push(`country_of_origin = $${paramCount++}`);
    values.push(data.country_of_origin);
    stats.countryAdded++;
  }
  
  // Add image if missing
  if (data.image_url) {
    const hasImage = await client.query(`
      SELECT 1 FROM catalog_media WHERE product_id = $1 LIMIT 1
    `, [product.id]);
    
    if (hasImage.rows.length === 0) {
      await client.query(`
        INSERT INTO catalog_media (product_id, url, media_type, priority)
        VALUES ($1, $2, 'image', 1)
      `, [product.id, data.image_url]);
      stats.imageAdded++;
    }
  }
  
  if (updates.length > 0) {
    values.push(data.sku);
    await client.query(`
      UPDATE catalog_products
      SET ${updates.join(', ')}
      WHERE sku = $${paramCount}
      AND source_vendor LIKE '%pu%'
    `, values);
    
    stats.updated++;
  }
}

extractAllProductData().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
