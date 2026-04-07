/**
 * Fetch WPS Images - Hard Drive & Tire Catalogs Only
 * 
 * Fetches images only for products in your catalog allowlist
 * (wps_hard_drive and wps_tire_brands)
 * 
 * Run: npx dotenv -e .env.local -- node scripts/ingest/fetch-wps-hd-tire-images.cjs
 */

const { Pool } = require('pg');
const https = require('https');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const WPS_API_KEY = process.env.WPS_API_KEY;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.wps-inc.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WPS_API_KEY}`,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('Fetch WPS Images - HD & Tire Catalogs Only');
  console.log('═══════════════════════════════════════════════════\n');

  if (!WPS_API_KEY) {
    console.error('✗ WPS_API_KEY not set in environment');
    process.exit(1);
  }

  try {
    await pool.query('SELECT 1');
    console.log('✓ Database connected');
    console.log('✓ WPS API key configured\n');

    // Get SKUs from allowlist for HD and Tire catalogs only
    const allowlistResult = await pool.query(
      `SELECT DISTINCT al.sku, al.catalog
       FROM catalog_allowlist al
       WHERE al.source IN ('wps_hard_drive', 'wps_tire_brands')
       ORDER BY al.sku`
    );

    console.log(`Found ${allowlistResult.rows.length} SKUs in HD + Tire allowlist\n`);
    console.log('Starting image fetch...\n');

    const startTime = Date.now();
    let totalFetched = 0;
    let imagesAdded = 0;
    let productsUpdated = 0;
    let errors = 0;
    let notFound = 0;

    for (let i = 0; i < allowlistResult.rows.length; i++) {
      const { sku, catalog } = allowlistResult.rows[i];
      
      try {
        // Fetch item with images from WPS API
        const response = await makeRequest(`/items?filter[sku]=${encodeURIComponent(sku)}&include=images`);
        
        if (!response.data || response.data.length === 0) {
          notFound++;
          continue;
        }

        totalFetched++;

        // Extract images
        const images = [];
        if (response.included) {
          for (const included of response.included) {
            if (included.type === 'images') {
              images.push(included.attributes.url);
            }
          }
        }

        if (images.length === 0) {
          continue;
        }

        // Find product in database
        const productResult = await pool.query(
          `SELECT id FROM catalog_products WHERE sku = $1 LIMIT 1`,
          [sku]
        );

        if (productResult.rows.length === 0) {
          continue;
        }

        const productId = productResult.rows[0].id;
        let imagesAddedForProduct = 0;

        // Insert images
        for (let j = 0; j < images.length; j++) {
          const imageUrl = images[j];
          
          const existing = await pool.query(
            `SELECT id FROM catalog_media WHERE product_id = $1 AND url = $2`,
            [productId, imageUrl]
          );

          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO catalog_media (product_id, url, media_type, priority)
               VALUES ($1, $2, 'image', $3)`,
              [productId, imageUrl, j + 1]
            );
            imagesAdded++;
            imagesAddedForProduct++;
          }
        }

        if (imagesAddedForProduct > 0) {
          productsUpdated++;
        }

        // Show progress every 10 items instead of 50
        if ((i + 1) % 10 === 0 || productsUpdated > 0) {
          const pct = ((i + 1) / allowlistResult.rows.length * 100).toFixed(1);
          process.stdout.write(`\r  → ${i + 1}/${allowlistResult.rows.length} (${pct}%) | Products: ${productsUpdated} | Images: ${imagesAdded}    `);
        }

        // Rate limit: 10 requests per second
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.error(`\n  ✗ Error on ${sku}:`, err.message);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`\nAllowlist SKUs Checked: ${allowlistResult.rows.length}`);
    console.log(`Items Found in WPS: ${totalFetched}`);
    console.log(`Items Not Found: ${notFound}`);
    console.log(`Products Updated: ${productsUpdated}`);
    console.log(`Images Added: ${imagesAdded}`);
    console.log(`Errors: ${errors}`);
    console.log(`\nTotal Time: ${duration}s`);
    console.log(`Average: ${(allowlistResult.rows.length / parseFloat(duration)).toFixed(1)} SKUs/sec`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n✗ Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
