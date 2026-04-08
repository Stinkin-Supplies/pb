#!/usr/bin/env node
/**
 * Extract OEM Part Numbers from PU PIES XML Files
 * Reads all PIES files and updates catalog_products with OSP codes
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parseStringPromise } = require('xml2js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

const PIES_DIR = 'scripts/data/pu_pricefile';

async function extractOEMPartNumbers() {
  console.log('📁 Finding PIES XML files...\n');
  
  const files = fs.readdirSync(PIES_DIR)
    .filter(f => f.includes('PIES') && f.endsWith('.xml'))
    .map(f => path.join(PIES_DIR, f));
  
  console.log(`Found ${files.length} PIES files:\n`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));
  
  const client = await pool.connect();
  
  try {
    console.log('\n⚙️  Extracting OEM part numbers...\n');
    
    let totalProducts = 0;
    let productsWithOEM = 0;
    let updated = 0;
    let notInCatalog = 0;
    
    for (const file of files) {
      const brandName = path.basename(file).replace('_PIES_Export.xml', '').replace(/_/g, ' ');
      console.log(`\n📦 Processing: ${brandName}`);
      
      const xml = fs.readFileSync(file, 'utf-8');
      const parsed = await parseStringPromise(xml);
      
      const items = parsed.PIES?.Items?.[0]?.Item || [];
      console.log(`  Products in file: ${items.length}`);
      
      let brandUpdated = 0;
      let brandWithOEM = 0;
      
      for (const item of items) {
        totalProducts++;
        
        const partNumber = item.PartNumber?.[0];
        if (!partNumber) continue;
        
        // Extract OEM part number (OSP = Original Superseded Part)
        const extendedInfo = item.ExtendedInformation?.[0]?.ExtendedProductInformation || [];
        const ospInfo = extendedInfo.find(info => info.$.EXPICode === 'OSP');
        const oemPartNumber = ospInfo?._?.trim();
        
        if (!oemPartNumber) continue;
        
        brandWithOEM++;
        productsWithOEM++;
        
        // Update catalog_products if product exists
        const result = await client.query(`
          UPDATE catalog_products
          SET oem_part_number = $1
          WHERE sku = $2
          AND source_vendor LIKE '%pu%'
        `, [oemPartNumber, partNumber]);
        
        if (result.rowCount > 0) {
          brandUpdated++;
          updated++;
        } else {
          notInCatalog++;
        }
      }
      
      console.log(`  Products with OEM numbers: ${brandWithOEM}`);
      console.log(`  Updated in catalog: ${brandUpdated}`);
    }
    
    console.log('\n✅ OEM part number extraction complete!\n');
    console.log(`   Total products in PIES files: ${totalProducts.toLocaleString()}`);
    console.log(`   Products with OEM numbers: ${productsWithOEM.toLocaleString()}`);
    console.log(`   Updated in catalog: ${updated.toLocaleString()}`);
    console.log(`   Not in catalog: ${notInCatalog.toLocaleString()}\n`);
    
    // Show sample products with OEM numbers
    console.log('Sample products with OEM part numbers:');
    const samples = await client.query(`
      SELECT sku, name, brand, oem_part_number
      FROM catalog_products
      WHERE source_vendor LIKE '%pu%'
      AND oem_part_number IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);
    
    samples.rows.forEach(row => {
      console.log(`\n  ${row.sku} - ${row.name}`);
      console.log(`  Brand: ${row.brand}`);
      console.log(`  OEM Part #: ${row.oem_part_number}`);
    });
    
    // Count by brand
    console.log('\n\nOEM part numbers by brand (top 10):');
    const byBrand = await client.query(`
      SELECT brand, COUNT(*) as count
      FROM catalog_products
      WHERE source_vendor LIKE '%pu%'
      AND oem_part_number IS NOT NULL
      GROUP BY brand
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `);
    
    byBrand.rows.forEach(row => {
      console.log(`  ${row.brand?.padEnd(30)} ${row.count.toLocaleString()}`);
    });
    
  } catch (err) {
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

extractOEMPartNumbers().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
