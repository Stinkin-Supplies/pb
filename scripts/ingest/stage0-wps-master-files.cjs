/**
 * WPS Master Files Ingestion
 * 
 * Processes 4 WPS XLSX files:
 * - harddrive_master_image.xlsx → catalog_media
 * - harddrive_master_item.xlsx → catalog_products (descriptions/specs)
 * - tire_master_image.xlsx → catalog_media
 * - tire_master_item.xlsx → catalog_products (descriptions/specs)
 * 
 * Run: npx dotenv -e .env.local -- node scripts/ingest/stage0-wps-master-files.cjs
 */

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data/wps');

const FILES = {
  harddrive_image: 'harddrive_master_image.xlsx',
  harddrive_item: 'harddrive_master_item.xlsx',
  tire_image: 'tire_master_image.xlsx',
  tire_item: 'tire_master_item.xlsx',
};

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

/**
 * Read XLSX file and return rows as array of objects
 */
function readXlsx(filePath) {
  console.log(`Reading: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  console.log(`  → ${rows.length} rows`);
  return rows;
}

/**
 * Process master IMAGE files → catalog_media
 * 
 * Expected columns:
 * - sku / item_id / part_number (SKU to match)
 * - image_url / primary_image_url (image URL)
 * - additional fields may vary by catalog
 */
async function processMasterImages(catalog, rows) {
  console.log(`\n[${catalog.toUpperCase()}] Processing ${rows.length} master images...`);
  
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // Flexible field mapping - try multiple column names
      const sku = row.sku || row.item_id || row.part_number || row.SKU || row['Item ID'] || row['Part Number'];
      const imageUrl = row.image_url || row.primary_image_url || row.url || row['Image URL'] || row['Primary Image URL'];

      if (!sku) {
        skipped++;
        continue;
      }

      if (!imageUrl || imageUrl === 'null' || imageUrl === '') {
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

      // Check if image already exists
      const existingResult = await pool.query(
        `SELECT id FROM catalog_media 
         WHERE product_id = $1 AND url = $2 AND media_type = 'image'`,
        [productId, imageUrl]
      );

      if (existingResult.rows.length > 0) {
        skipped++;
        continue;
      }

      // Insert image
      await pool.query(
        `INSERT INTO catalog_media (product_id, url, media_type, priority, source)
         VALUES ($1, $2, 'image', 1, $3)
         ON CONFLICT DO NOTHING`,
        [productId, imageUrl, `wps_master_${catalog}`]
      );

      inserted++;

      if (inserted % 100 === 0) {
        process.stdout.write(`\r  → Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);
      }

    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`\n  ✗ Error processing row:`, err.message);
      }
    }
  }

  console.log(`\n  ✓ Complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
  return { inserted, skipped, errors };
}

/**
 * Process master ITEM files → catalog_products (descriptions/specs)
 * 
 * Expected columns:
 * - sku / item_id / part_number
 * - description / long_description / product_description
 * - features / product_features / bullet_points
 * - Additional spec fields (weight, dimensions, etc.)
 */
async function processMasterItems(catalog, rows) {
  console.log(`\n[${catalog.toUpperCase()}] Processing ${rows.length} master items...`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let specsInserted = 0;

  for (const row of rows) {
    try {
      // Flexible SKU mapping
      const sku = row.sku || row.item_id || row.part_number || row.SKU || row['Item ID'] || row['Part Number'];

      if (!sku) {
        skipped++;
        continue;
      }

      // Find product by SKU
      const productResult = await pool.query(
        `SELECT id, description FROM catalog_products WHERE sku = $1 LIMIT 1`,
        [sku]
      );

      if (productResult.rows.length === 0) {
        skipped++;
        continue;
      }

      const productId = productResult.rows[0].id;
      const existingDesc = productResult.rows[0].description;

      // Extract description (try multiple field names)
      const description = 
        row.description || 
        row.long_description || 
        row.product_description || 
        row.Description || 
        row['Long Description'] || 
        row['Product Description'] ||
        null;

      // Extract features (try multiple field names)
      const features = 
        row.features || 
        row.product_features || 
        row.bullet_points || 
        row.Features || 
        row['Product Features'] ||
        null;

      // Build combined description
      let finalDescription = existingDesc;

      if (description && (!existingDesc || existingDesc.length < description.length)) {
        finalDescription = description;
      }

      if (features && typeof features === 'string' && features.length > 0) {
        // Append features as bullet points if not already in description
        if (!finalDescription || !finalDescription.includes(features)) {
          finalDescription = finalDescription 
            ? `${finalDescription}\n\n${features}`
            : features;
        }
      }

      // Update product description if we have a better one
      if (finalDescription && finalDescription !== existingDesc) {
        await pool.query(
          `UPDATE catalog_products 
           SET description = $1, description_raw = $2
           WHERE id = $3`,
          [finalDescription, finalDescription, productId]
        );
        updated++;
      }

      // Extract and insert specs (any remaining columns)
      const specColumns = Object.keys(row).filter(key => 
        !['sku', 'item_id', 'part_number', 'SKU', 'Item ID', 'Part Number',
          'description', 'long_description', 'product_description', 'Description',
          'features', 'product_features', 'bullet_points', 'Features',
          'image_url', 'primary_image_url', 'url', 'Image URL'
        ].includes(key)
      );

      for (const column of specColumns) {
        const value = row[column];
        if (value !== null && value !== '' && value !== 'null') {
          // Insert spec (ignore if already exists)
          await pool.query(
            `INSERT INTO catalog_specs (product_id, attribute, value, source)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, attribute, value) DO NOTHING`,
            [productId, column, String(value), `wps_master_${catalog}`]
          );
          specsInserted++;
        }
      }

      if (updated % 100 === 0) {
        process.stdout.write(`\r  → Updated: ${updated}, Specs: ${specsInserted}, Skipped: ${skipped}`);
      }

    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`\n  ✗ Error processing row:`, err.message);
      }
    }
  }

  console.log(`\n  ✓ Complete: ${updated} updated, ${specsInserted} specs, ${skipped} skipped, ${errors} errors`);
  return { updated, skipped, errors, specsInserted };
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('WPS Master Files Ingestion');
  console.log('═══════════════════════════════════════════════════\n');

  // Check if data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`✗ Data directory not found: ${DATA_DIR}`);
    console.error(`  Please create the directory and place the 4 XLSX files there:`);
    console.error(`  - ${FILES.harddrive_image}`);
    console.error(`  - ${FILES.harddrive_item}`);
    console.error(`  - ${FILES.tire_image}`);
    console.error(`  - ${FILES.tire_item}`);
    process.exit(1);
  }

  const startTime = Date.now();
  const stats = {
    harddrive_images: { inserted: 0, skipped: 0, errors: 0 },
    harddrive_items: { updated: 0, specsInserted: 0, skipped: 0, errors: 0 },
    tire_images: { inserted: 0, skipped: 0, errors: 0 },
    tire_items: { updated: 0, specsInserted: 0, skipped: 0, errors: 0 },
  };

  try {
    // Test DB connection
    await pool.query('SELECT 1');
    console.log('✓ Database connected\n');

    // Process Hard Drive catalog
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('HARD DRIVE CATALOG');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Hard Drive Images
    const hdImagePath = path.join(DATA_DIR, FILES.harddrive_image);
    if (fs.existsSync(hdImagePath)) {
      const hdImages = readXlsx(hdImagePath);
      stats.harddrive_images = await processMasterImages('harddrive', hdImages);
    } else {
      console.log(`⚠ File not found: ${FILES.harddrive_image}`);
    }

    // Hard Drive Items
    const hdItemPath = path.join(DATA_DIR, FILES.harddrive_item);
    if (fs.existsSync(hdItemPath)) {
      const hdItems = readXlsx(hdItemPath);
      stats.harddrive_items = await processMasterItems('harddrive', hdItems);
    } else {
      console.log(`⚠ File not found: ${FILES.harddrive_item}`);
    }

    // Process Tire catalog
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TIRE CATALOG');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Tire Images
    const tireImagePath = path.join(DATA_DIR, FILES.tire_image);
    if (fs.existsSync(tireImagePath)) {
      const tireImages = readXlsx(tireImagePath);
      stats.tire_images = await processMasterImages('tire', tireImages);
    } else {
      console.log(`⚠ File not found: ${FILES.tire_image}`);
    }

    // Tire Items
    const tireItemPath = path.join(DATA_DIR, FILES.tire_item);
    if (fs.existsSync(tireItemPath)) {
      const tireItems = readXlsx(tireItemPath);
      stats.tire_items = await processMasterItems('tire', tireItems);
    } else {
      console.log(`⚠ File not found: ${FILES.tire_item}`);
    }

    // Final summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`\nHard Drive Catalog:`);
    console.log(`  Images:  ${stats.harddrive_images.inserted} inserted, ${stats.harddrive_images.skipped} skipped`);
    console.log(`  Items:   ${stats.harddrive_items.updated} updated, ${stats.harddrive_items.specsInserted} specs`);
    console.log(`\nTire Catalog:`);
    console.log(`  Images:  ${stats.tire_images.inserted} inserted, ${stats.tire_images.skipped} skipped`);
    console.log(`  Items:   ${stats.tire_items.updated} updated, ${stats.tire_items.specsInserted} specs`);
    console.log(`\nTotal Time: ${duration}s`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n✗ Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
