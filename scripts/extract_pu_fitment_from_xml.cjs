#!/usr/bin/env node
/**
 * Extract Fitment from PU XML Files
 * Parses PIES and Catalog Content XML files to extract fitment data
 * from product descriptions and titles
 */

const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'
});

// Fitment patterns to extract
const FITMENT_PATTERNS = [
  // "FL '08-'23" or "FL '08-23" or "FL 08-23"
  /(?:FL|FX|XL)(?:[A-Z]{0,8})?\s*['']?(\d{2})[-–]['']?(\d{2})/gi,
  
  // "For 2008-2023 FL" or "For 08-23 FLHT"
  /(?:For|for|FOR)\s+(?:[''])?(\d{2,4})[-–](?:[''])?(\d{2,4})\s+((?:FL|FX|XL)[A-Z]*)/gi,
  
  // "2008-2023 Touring" or "'08-'23 Softail"
  /(?:[''])?(\d{2,4})[-–](?:[''])?(\d{2,4})\s+(Touring|Softail|Dyna|Sportster|Trike)/gi,
  
  // "Fits 2014-2020 Road Glide"
  /(?:Fits|fits|FITS)\s+(?:[''])?(\d{2,4})[-–](?:[''])?(\d{2,4})\s+(Road Glide|Street Glide|Electra Glide|Ultra Limited|Road King)/gi,
];

// Model code mappings
const MODEL_MAPPINGS = {
  'FL': 'Touring',
  'FLHT': 'Touring',
  'FLHR': 'Touring', 
  'FLHX': 'Touring',
  'FLTR': 'Touring',
  'FLTRU': 'Touring',
  'FLTRX': 'Touring',
  'FLHTK': 'Touring',
  'FX': 'Softail',
  'FXST': 'Softail',
  'FXBB': 'Softail',
  'FXLR': 'Softail',
  'FLDE': 'Softail',
  'FXD': 'Dyna',
  'FXDL': 'Dyna',
  'FXDB': 'Dyna',
  'XL': 'Sportster',
  'XL883': 'Sportster',
  'XL1200': 'Sportster',
};

function normalizeYear(year) {
  // Convert 2-digit to 4-digit year
  if (year.length === 2) {
    const num = parseInt(year);
    return num > 50 ? `19${year}` : `20${year}`;
  }
  return year;
}

function extractFitment(text) {
  if (!text) return [];
  
  const fitments = [];
  
  FITMENT_PATTERNS.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    
    matches.forEach(match => {
      let yearStart, yearEnd, model;
      
      if (pattern.source.includes('For|for')) {
        // Pattern: "For 2008-2023 FLHT"
        yearStart = normalizeYear(match[1]);
        yearEnd = normalizeYear(match[2]);
        model = match[3];
      } else if (pattern.source.includes('Fits|fits')) {
        // Pattern: "Fits 2014-2020 Road Glide"
        yearStart = normalizeYear(match[1]);
        yearEnd = normalizeYear(match[2]);
        model = match[3];
      } else if (pattern.source.includes('Touring|Softail')) {
        // Pattern: "2008-2023 Touring"
        yearStart = normalizeYear(match[1]);
        yearEnd = normalizeYear(match[2]);
        model = match[3];
      } else {
        // Pattern: "FL '08-'23"
        const modelCode = match[0].match(/^[A-Z]+/)[0];
        yearStart = normalizeYear(match[1]);
        yearEnd = normalizeYear(match[2]);
        model = MODEL_MAPPINGS[modelCode] || modelCode;
      }
      
      // Validate years
      const startYear = parseInt(yearStart);
      const endYear = parseInt(yearEnd);
      
      if (startYear >= 1980 && startYear <= 2030 && endYear >= startYear && endYear <= 2030) {
        fitments.push({
          year_start: startYear,
          year_end: endYear,
          model: model.trim(),
          original_text: match[0].trim()
        });
      }
    });
  });
  
  return fitments;
}

async function parsePIESFile(filePath) {
  console.log(`\n📄 Parsing PIES: ${path.basename(filePath)}`);
  
  const xml = fs.readFileSync(filePath, 'utf-8');
  const result = await parseStringPromise(xml);
  
  const products = [];
  const items = result?.PIES?.Items?.[0]?.Item || [];
  
  items.forEach(item => {
    const partNumber = item.PartNumber?.[0];
    const brand = item.BrandLabel?.[0];
    
    // Get descriptions
    const descriptions = item.Descriptions?.[0]?.Description || [];
    const allText = descriptions.map(d => d._).join(' ');
    
    const fitments = extractFitment(allText);
    
    if (fitments.length > 0) {
      products.push({
        sku: partNumber,
        brand,
        fitments
      });
    }
  });
  
  console.log(`   Found ${products.length} products with fitment`);
  return products;
}

async function parseCatalogContentFile(filePath) {
  console.log(`\n📄 Parsing Catalog Content: ${path.basename(filePath)}`);
  
  const xml = fs.readFileSync(filePath, 'utf-8');
  const result = await parseStringPromise(xml);
  
  const products = [];
  const parts = result?.root?.part || [];
  
  parts.forEach(part => {
    const partNumber = part.partNumber?.[0] || part.punctuatedPartNumber?.[0];
    const brand = part.brandName?.[0];
    const description = part.partDescription?.[0];
    
    // Get all bullets
    let allText = description || '';
    for (let i = 1; i <= 24; i++) {
      const bullet = part[`bullet${i}`]?.[0];
      if (bullet) allText += ' ' + bullet;
    }
    
    const fitments = extractFitment(allText);
    
    if (fitments.length > 0) {
      products.push({
        sku: partNumber,
        brand,
        fitments
      });
    }
  });
  
  console.log(`   Found ${products.length} products with fitment`);
  return products;
}

async function insertFitmentData(products) {
  let inserted = 0;
  let skipped = 0;
  
  for (const product of products) {
    // Find product in database
    const productResult = await pool.query(
      `SELECT id FROM catalog_products WHERE sku = $1 LIMIT 1`,
      [product.sku]
    );
    
    if (productResult.rows.length === 0) {
      skipped++;
      continue;
    }
    
    const productId = productResult.rows[0].id;
    
    // Insert fitment records
    for (const fitment of product.fitments) {
      try {
        await pool.query(
          `INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            productId,
            'Harley-Davidson',
            fitment.model,
            fitment.year_start,
            fitment.year_end,
            fitment.original_text
          ]
        );
        inserted++;
      } catch (err) {
        console.error(`Error inserting fitment for ${product.sku}:`, err.message);
      }
    }
  }
  
  return { inserted, skipped };
}

async function main() {
  console.log('🚀 Starting PU Fitment Extraction\n');
  
  // Find all XML files
  const uploadedFiles = [
    '/mnt/user-data/uploads/Thrashin-Supply_Catalog_Content_Export.xml',
    '/mnt/user-data/uploads/SS-Cycle_PIES_Export.xml',
    '/mnt/user-data/uploads/Pingel_PIES_Export.xml'
  ];
  
  let allProducts = [];
  
  // Parse uploaded files
  for (const file of uploadedFiles) {
    if (!fs.existsSync(file)) continue;
    
    if (file.includes('PIES')) {
      const products = await parsePIESFile(file);
      allProducts = allProducts.concat(products);
    } else if (file.includes('Catalog_Content')) {
      const products = await parseCatalogContentFile(file);
      allProducts = allProducts.concat(products);
    }
  }
  
  console.log(`\n📊 Total products with fitment: ${allProducts.length}`);
  console.log(`📊 Total fitment records: ${allProducts.reduce((sum, p) => sum + p.fitments.length, 0)}`);
  
  // Insert into database
  console.log('\n💾 Inserting fitment data into database...\n');
  const { inserted, skipped } = await insertFitmentData(allProducts);
  
  console.log('\n✅ Complete!');
  console.log(`   Inserted: ${inserted} fitment records`);
  console.log(`   Skipped: ${skipped} products (not found in catalog)`);
  
  // Show sample
  console.log('\n📋 Sample fitment data:');
  const sample = await pool.query(
    `SELECT p.sku, p.name, f.model, f.year_start, f.year_end, f.notes
     FROM catalog_fitment f
     JOIN catalog_products p ON p.id = f.product_id
     ORDER BY f.created_at DESC
     LIMIT 10`
  );
  console.table(sample.rows);
  
  await pool.end();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
