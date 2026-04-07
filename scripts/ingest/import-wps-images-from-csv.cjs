/**
 * Import WPS Images from Simple CSV
 * 
 * Expects CSV with: sku,image_url
 * 
 * Usage:
 * 1. In Google Sheets, create new sheet with columns: sku, image_url
 * 2. Copy SKUs from column A, paste into new sheet column A
 * 3. Copy image URLs (the actual URLs, not formulas) into column B
 * 4. Export as CSV: wps_hd_images.csv
 * 5. Place in scripts/data/wps/
 * 6. Run: npx dotenv -e .env.local -- node scripts/ingest/import-wps-images-from-csv.cjs
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('Import WPS Images from CSV');
  console.log('═══════════════════════════════════════════════════\n');

  const csvPath = path.join(__dirname, '../data/wps/wps_hd_images.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`✗ File not found: ${csvPath}`);
    console.error('\nCreate a CSV with columns: sku,image_url');
    console.error('Export from Google Sheets and place in scripts/data/wps/');
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  console.log(`✓ Found CSV with ${lines.length - 1} rows\n`);

  const progressBar = new cliProgress.SingleBar({
    format: 'Progress |{bar}| {percentage}% | {value}/{total} | Products: {products} | Images: {images}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  });

  progressBar.start(lines.length - 1, 0, { products: 0, images: 0 });

  let productsUpdated = 0;
  let imagesAdded = 0;
  let errors = 0;
  let skuNotFound = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const line = lines[i];
      if (!line || line.trim() === '') continue;
      
      const parts = line.split(',');
      const sku = parts[0]?.trim();
      let imageUrl = parts.slice(1).join(',').trim(); // Join back in case URL has commas

      // Extract URL from HYPERLINK formula if present
      if (imageUrl.includes('HYPERLINK')) {
        const match = imageUrl.match(/"(http[^"]+)"/);
        imageUrl = match ? match[1] : null;
      }

      if (!sku || !imageUrl || imageUrl === '#ERROR!' || !imageUrl.startsWith('http')) {
        continue;
      }

      // Find product
      const productResult = await pool.query(
        `SELECT id FROM catalog_products WHERE sku = $1 LIMIT 1`,
        [sku]
      );

      if (productResult.rows.length === 0) {
        skuNotFound++;
        continue;
      }

      const productId = productResult.rows[0].id;

      // Check if image already exists
      const existing = await pool.query(
        `SELECT id FROM catalog_media WHERE product_id = $1 AND url = $2`,
        [productId, imageUrl]
      );

      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO catalog_media (product_id, url, media_type, priority)
           VALUES ($1, $2, 'image', 1)`,
          [productId, imageUrl]
        );
        imagesAdded++;
        productsUpdated++;
      }

      progressBar.update(i, { products: productsUpdated, images: imagesAdded });

    } catch (err) {
      errors++;
      if (errors <= 10) {
        progressBar.stop();
        console.error(`\n✗ Error on row ${i}:`, err.message);
        progressBar.start(lines.length - 1, i, { products: productsUpdated, images: imagesAdded });
      }
    }
  }

  progressBar.stop();

  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total rows processed: ${lines.length - 1}`);
  console.log(`Products updated: ${productsUpdated}`);
  console.log(`Images added: ${imagesAdded}`);
  console.log(`SKUs not found in DB: ${skuNotFound}`);
  console.log(`Errors: ${errors}`);
  console.log('═══════════════════════════════════════════════════\n');

  await pool.end();
}

main();
