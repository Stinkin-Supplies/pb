/**
 * WPS Master Image Import - Auto-detect columns
 * 
 * Automatically detects image URL columns regardless of name
 * 
 * Run: npx dotenv -e .env.local -- node scripts/ingest/import-wps-images-flexible.cjs
 */

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data/wps');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

function findColumn(row, candidates) {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined && row[candidate] !== null && row[candidate] !== 'null') {
      return candidate;
    }
  }
  return null;
}

function readXlsx(filePath) {
  console.log(`\nReading: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  console.log(`  → ${rows.length} rows`);
  return rows;
}

async function processImages(catalog, filePath) {
  const rows = readXlsx(filePath);
  
  if (rows.length === 0) {
    console.log('  ⚠ No rows found');
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  console.log(`\n[${catalog.toUpperCase()}] Analyzing columns...`);
  
  // Show all columns
  const firstRow = rows[0];
  console.log('  Available columns:');
  Object.keys(firstRow).forEach((key, i) => {
    const val = firstRow[key];
    const preview = val === null || val === 'null' ? 'null' : String(val).substring(0, 40);
    console.log(`    ${i + 1}. ${key} = ${preview}`);
  });

  // Auto-detect SKU column
  const skuCandidates = ['sku', 'SKU', 'item_id', 'Item ID', 'ItemID', 'part_number', 'PartNumber', 'Part Number'];
  const skuColumn = findColumn(firstRow, skuCandidates);
  
  if (!skuColumn) {
    console.log('  ✗ No SKU column found');
    return { inserted: 0, skipped: 0, errors: 0 };
  }
  console.log(`  ✓ SKU column: "${skuColumn}"`);

  // Auto-detect image URL column - try ALL columns that might contain URLs
  console.log('\n  Looking for image URL columns...');
  const imageColumns = [];
  
  for (const [colName, colValue] of Object.entries(firstRow)) {
    // Skip obvious non-URL columns
    if (skuCandidates.includes(colName)) continue;
    if (['name', 'description', 'brand', 'price', 'status'].includes(colName.toLowerCase())) continue;
    
    // Check if value looks like a URL or image reference
    const val = String(colValue || '');
    if (val.includes('http') || val.includes('.jpg') || val.includes('.png') || 
        val.includes('image') || val.includes('cdn') || val.includes('asset')) {
      imageColumns.push({ name: colName, sample: val.substring(0, 60) });
      console.log(`    ✓ Found: "${colName}" = ${val.substring(0, 60)}`);
    }
  }

  if (imageColumns.length === 0) {
    console.log('  ✗ No image URL columns found');
    console.log('  Checking if any column has non-null values...');
    
    // Show all non-null columns
    for (const [colName, colValue] of Object.entries(firstRow)) {
      if (colValue !== null && colValue !== 'null' && colValue !== '') {
        console.log(`    ${colName}: ${String(colValue).substring(0, 50)}`);
      }
    }
    
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  console.log(`\n  Processing images from ${imageColumns.length} column(s)...`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const sku = row[skuColumn];
      if (!sku || sku === 'null' || sku === '') {
        skipped++;
        continue;
      }

      // Find product by SKU
      const productResult = await pool.query(
        `SELECT id FROM catalog_products WHERE sku = $1 LIMIT 1`,
        [sku]
      );

      if (productResult.rows.length === 0) {
        skipped++;
        continue;
      }

      const productId = productResult.rows[0].id;

      // Insert images from all detected columns
      for (let i = 0; i < imageColumns.length; i++) {
        const imageUrl = row[imageColumns[i].name];
        
        if (!imageUrl || imageUrl === 'null' || imageUrl === '') {
          continue;
        }

        // Check if already exists
        const existing = await pool.query(
          `SELECT id FROM catalog_media 
           WHERE product_id = $1 AND url = $2 AND media_type = 'image'`,
          [productId, imageUrl]
        );

        if (existing.rows.length === 0) {
          await pool.query(
            `INSERT INTO catalog_media (product_id, url, media_type, priority)
             VALUES ($1, $2, 'image', $3)`,
            [productId, imageUrl, i + 1]
          );
          inserted++;
        }
      }

      if ((inserted + skipped) % 100 === 0) {
        process.stdout.write(`\r  → Inserted: ${inserted}, Skipped: ${skipped}`);
      }

    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`\n  ✗ Error:`, err.message);
      }
    }
  }

  console.log(`\n  ✓ Complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
  return { inserted, skipped, errors };
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('WPS Master Image Import (Flexible)');
  console.log('═══════════════════════════════════════════════════');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`\n✗ Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    await pool.query('SELECT 1');
    console.log('✓ Database connected');

    const stats = {};

    // Process Hard Drive images
    const hdImagePath = path.join(DATA_DIR, 'harddrive_master_image.xlsx');
    if (fs.existsSync(hdImagePath)) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('HARD DRIVE IMAGES');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      stats.harddrive = await processImages('harddrive', hdImagePath);
    } else {
      console.log('\n⚠ Hard Drive image file not found');
    }

    // Process Tire images
    const tireImagePath = path.join(DATA_DIR, 'tire_master_image.xlsx');
    if (fs.existsSync(tireImagePath)) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('TIRE IMAGES');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      stats.tire = await processImages('tire', tireImagePath);
    } else {
      console.log('\n⚠ Tire image file not found');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    
    if (stats.harddrive) {
      console.log(`\nHard Drive: ${stats.harddrive.inserted} images inserted, ${stats.harddrive.skipped} skipped`);
    }
    if (stats.tire) {
      console.log(`Tire: ${stats.tire.inserted} images inserted, ${stats.tire.skipped} skipped`);
    }
    
    console.log(`\nTotal Time: ${duration}s`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n✗ Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
