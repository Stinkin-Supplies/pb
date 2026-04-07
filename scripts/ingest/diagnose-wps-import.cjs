/**
 * Diagnose WPS Master Import Issues
 * 
 * Checks why SKUs aren't matching between Excel files and database
 * 
 * Run: npx dotenv -e .env.local -- node scripts/diagnose-wps-import.cjs
 */

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data/wps');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function diagnose() {
  console.log('═══════════════════════════════════════════════════');
  console.log('WPS Master Import Diagnostic');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Read HD image file
    const hdImagePath = path.join(DATA_DIR, 'harddrive_master_image.xlsx');
    const workbook = XLSX.readFile(hdImagePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    console.log(`Read ${rows.length} rows from harddrive_master_image.xlsx\n`);

    // Show first row structure
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('First Row Column Names:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (rows.length > 0) {
      Object.keys(rows[0]).forEach((key, i) => {
        const value = rows[0][key];
        const preview = value ? String(value).substring(0, 50) : 'null';
        console.log(`${i + 1}. "${key}" = "${preview}"`);
      });
    }

    // Try to find SKU column
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SKU Detection:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const firstRow = rows[0];
    const skuCandidates = ['sku', 'item_id', 'part_number', 'SKU', 'Item ID', 'Part Number', 'ItemID', 'PartNumber'];
    let skuField = null;
    
    for (const candidate of skuCandidates) {
      if (firstRow[candidate] !== undefined) {
        skuField = candidate;
        console.log(`✓ Found SKU field: "${candidate}"`);
        console.log(`  Sample value: "${firstRow[candidate]}"`);
        break;
      }
    }

    if (!skuField) {
      console.log('✗ No SKU field found! Tried:', skuCandidates.join(', '));
      console.log('\nAvailable columns:', Object.keys(firstRow).join(', '));
      return;
    }

    // Get first 10 SKUs from Excel
    const excelSkus = rows.slice(0, 10).map(r => r[skuField]).filter(Boolean);
    console.log(`\nFirst 10 SKUs from Excel:`);
    excelSkus.forEach((sku, i) => console.log(`  ${i + 1}. ${sku}`));

    // Check if these SKUs exist in database
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Database SKU Check:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const sku of excelSkus) {
      const result = await pool.query(
        `SELECT sku, name, brand FROM catalog_products WHERE sku = $1`,
        [sku]
      );
      
      if (result.rows.length > 0) {
        console.log(`✓ FOUND: ${sku}`);
        console.log(`  → ${result.rows[0].brand} - ${result.rows[0].name}`);
      } else {
        console.log(`✗ NOT FOUND: ${sku}`);
      }
    }

    // Check for similar SKUs with variations
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Checking for SKU Pattern Matches:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const firstExcelSku = excelSkus[0];
    if (firstExcelSku) {
      // Try different variations
      const variations = [
        firstExcelSku,
        firstExcelSku.toUpperCase(),
        firstExcelSku.toLowerCase(),
        firstExcelSku.replace(/^0+/, ''), // Remove leading zeros
        firstExcelSku.replace(/-/g, ''), // Remove dashes
        firstExcelSku.replace(/ /g, ''), // Remove spaces
      ];

      for (const variant of variations) {
        const result = await pool.query(
          `SELECT sku, name FROM catalog_products WHERE sku ILIKE $1 LIMIT 1`,
          [variant]
        );
        if (result.rows.length > 0) {
          console.log(`✓ Match found with variation: "${variant}"`);
          console.log(`  DB SKU: "${result.rows[0].sku}"`);
          console.log(`  Product: ${result.rows[0].name}`);
          break;
        }
      }
    }

    // Show sample of actual SKUs in database
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Sample SKUs in Database (first 10):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const dbSkus = await pool.query(
      `SELECT sku, brand, name FROM catalog_products LIMIT 10`
    );

    dbSkus.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.sku}`);
      console.log(`   ${row.brand} - ${row.name}`);
    });

    // Check image URL column
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Image URL Detection:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const urlCandidates = ['image_url', 'primary_image_url', 'url', 'Image URL', 'Primary Image URL', 'ImageURL'];
    let urlField = null;

    for (const candidate of urlCandidates) {
      if (firstRow[candidate] !== undefined) {
        urlField = candidate;
        console.log(`✓ Found URL field: "${candidate}"`);
        console.log(`  Sample value: "${firstRow[candidate]}"`);
        break;
      }
    }

    if (!urlField) {
      console.log('✗ No URL field found!');
    }

    console.log('\n═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

diagnose();
