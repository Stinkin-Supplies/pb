/**
 * TYPESENSE INDEX ASSEMBLY - OPTIMIZED FORMAT
 * 
 * This script builds Typesense documents from your Hetzner Postgres database
 * with OEM cross-references, fitment data, and multi-vendor support.
 * 
 * Usage: npx dotenv -e .env.local -- node scripts/ingest/index_assembly_optimized.js
 */

const { Pool } = require('pg');
const Typesense = require('typesense');

// Database connection
const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Typesense client
const client = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST,
    port: '443',
    protocol: 'https'
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10
});

// Load OEM cross-reference data
const OEM_CROSSREF = require('./oem_crossref_data.json');

/**
 * Build a single Typesense document from database rows
 */
function buildDocument(product, specs, media, fitment, offers, oem_refs) {
  // Extract vendor codes
  const vendorCodes = {};
  offers.forEach(offer => {
    vendorCodes[offer.vendor] = offer.vendor_code;
  });

  // Calculate total quantity across all warehouses
  const totalQty = offers.reduce((sum, offer) => sum + (offer.total_qty || 0), 0);
  
  // Extract warehouse availability
  const warehouseAvailability = [];
  offers.forEach(offer => {
    if (offer.warehouse_json) {
      const warehouses = JSON.parse(offer.warehouse_json);
      warehouses.forEach(wh => {
        warehouseAvailability.push({
          code: wh.code,
          name: wh.name,
          qty: wh.qty
        });
      });
    }
  });

  // Build specs facets for filtering
  const specsFacets = specs
    .filter(s => s.attribute && s.value)
    .map(s => `${s.attribute}:${s.value}`);

  // Extract fitment data
  const fitmentMakes = [...new Set(fitment.map(f => f.make))];
  const fitmentModels = [...new Set(fitment.map(f => f.model))];
  const fitmentYears = [];
  
  fitment.forEach(f => {
    const startYear = f.year_start || f.year;
    const endYear = f.year_end || f.year;
    
    for (let year = startYear; year <= endYear; year++) {
      if (!fitmentYears.includes(year)) {
        fitmentYears.push(year);
      }
    }
  });
  fitmentYears.sort((a, b) => a - b);

  // Build fitment application strings
  const fitmentApplications = fitment.map(f => {
    const yearRange = f.year_end && f.year_end !== f.year_start
      ? `${f.year_start}-${f.year_end}`
      : `${f.year_start}`;
    return `${yearRange} ${f.make} ${f.model}`;
  });

  // Extract OEM cross-references
  const oemNumbers = [];
  const oemManufacturers = new Set();
  
  if (oem_refs && oem_refs.length > 0) {
    oem_refs.forEach(ref => {
      oemNumbers.push(ref.oem_number);
      oemManufacturers.add(ref.manufacturer);
    });
  }

  // Extract images
  const images = media
    .sort((a, b) => (a.priority || 999) - (b.priority || 999))
    .map(m => m.url);
  
  const primaryImage = images.length > 0 ? images[0] : null;

  // Build search blob (lowercased keywords for better matching)
  const searchBlob = [
    product.name,
    product.brand,
    product.category,
    product.sku,
    ...oemNumbers,
    ...specsFacets.map(s => s.split(':')[1]), // Just the values
    ...fitmentApplications
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Determine catalogs
  const catalogs = [];
  if (product.fatbook_catalog === '1') catalogs.push('fatbook');
  if (product.fatbook_midyear === '1') catalogs.push('fatbook_midyear');
  if (product.oldbook_catalog === '1') catalogs.push('oldbook');
  if (product.oldbook_midyear === '1') catalogs.push('oldbook_midyear');
  if (product.tire_catalog === '1') catalogs.push('tire');

  // Build Typesense document
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    brand: product.brand || 'Unknown',
    category: product.category,
    description: product.description,
    
    computed_price: product.computed_price,
    map_price: product.map_price,
    msrp: product.msrp,
    in_stock: totalQty > 0,
    total_qty: totalQty,
    
    // OEM cross-references
    oem_numbers: oemNumbers.length > 0 ? oemNumbers : undefined,
    oem_manufacturers: oemManufacturers.size > 0 
      ? Array.from(oemManufacturers) 
      : undefined,
    
    // Fitment data
    fitment_make: fitmentMakes.length > 0 ? fitmentMakes : undefined,
    fitment_model: fitmentModels.length > 0 ? fitmentModels : undefined,
    fitment_year: fitmentYears.length > 0 ? fitmentYears : undefined,
    fitment_applications: fitmentApplications.length > 0 
      ? fitmentApplications 
      : undefined,
    
    // Specs
    specs_facets: specsFacets.length > 0 ? specsFacets : undefined,
    
    // Media
    images: images.length > 0 ? images : undefined,
    primary_image: primaryImage,
    
    // Catalog metadata
    catalogs: catalogs.length > 0 ? catalogs : undefined,
    product_code: product.product_code,
    
    // Vendor data (stored as object, not indexed)
    vendor_codes: Object.keys(vendorCodes).length > 0 
      ? vendorCodes 
      : undefined,
    warehouse_availability: warehouseAvailability.length > 0
      ? warehouseAvailability
      : undefined,
    
    // Search optimization
    search_blob: searchBlob,
    
    // Status flags
    is_discontinued: product.is_discontinued || false,
    is_active: product.is_active !== false,
    
    // Timestamps (convert to Unix timestamp)
    created_at: product.created_at 
      ? Math.floor(new Date(product.created_at).getTime() / 1000) 
      : undefined,
    updated_at: product.updated_at 
      ? Math.floor(new Date(product.updated_at).getTime() / 1000)
      : undefined
  };
}

/**
 * Main indexing function
 */
async function indexProducts() {
  console.log('🚀 Starting Typesense indexing...\n');

  try {
    // Step 1: Fetch all products with allowlist filter
    console.log('📦 Fetching products from catalog_products...');
    
    const productQuery = `
      SELECT 
        cp.id,
        cp.sku,
        cp.slug,
        cp.name,
        cp.brand,
        cp.category,
        cp.description,
        cp.computed_price,
        cp.map_price,
        cp.msrp,
        cp.is_discontinued,
        cp.is_active,
        cp.product_code,
        cp.fatbook_catalog,
        cp.fatbook_midyear,
        cp.oldbook_catalog,
        cp.oldbook_midyear,
        cp.tire_catalog,
        cp.created_at,
        cp.updated_at
      FROM catalog_products cp
      WHERE cp.is_active = true
        AND cp.is_discontinued = false
        AND cp.computed_price IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM catalog_allowlist al WHERE al.sku = cp.sku
        )
      ORDER BY cp.id
    `;

    const { rows: products } = await pool.query(productQuery);
    console.log(`✓ Found ${products.length} products to index\n`);

    // Step 2: Batch fetch related data
    const productIds = products.map(p => p.id);
    
    console.log('📊 Fetching specs...');
    const { rows: specs } = await pool.query(`
      SELECT product_id, attribute, value
      FROM catalog_specs
      WHERE product_id = ANY($1)
    `, [productIds]);
    console.log(`✓ Found ${specs.length} spec entries`);

    console.log('🖼️  Fetching media...');
    const { rows: media } = await pool.query(`
      SELECT product_id, url, media_type, priority
      FROM catalog_media
      WHERE product_id = ANY($1)
      ORDER BY product_id, priority
    `, [productIds]);
    console.log(`✓ Found ${media.length} media entries`);

    console.log('🚗 Fetching fitment...');
    const { rows: fitment } = await pool.query(`
      SELECT product_id, make, model, year_start, year_end, year
      FROM catalog_fitment
      WHERE product_id = ANY($1)
    `, [productIds]);
    console.log(`✓ Found ${fitment.length} fitment entries`);

    console.log('💰 Fetching vendor offers...');
    const { rows: offers } = await pool.query(`
      SELECT 
        catalog_product_id as product_id,
        vendor,
        vendor_code,
        total_qty,
        warehouse_json
      FROM vendor_offers
      WHERE catalog_product_id = ANY($1)
    `, [productIds]);
    console.log(`✓ Found ${offers.length} vendor offers\n`);

    // Step 3: Group related data by product_id
    const specsMap = {};
    const mediaMap = {};
    const fitmentMap = {};
    const offersMap = {};
    
    specs.forEach(s => {
      if (!specsMap[s.product_id]) specsMap[s.product_id] = [];
      specsMap[s.product_id].push(s);
    });
    
    media.forEach(m => {
      if (!mediaMap[m.product_id]) mediaMap[m.product_id] = [];
      mediaMap[m.product_id].push(m);
    });
    
    fitment.forEach(f => {
      if (!fitmentMap[f.product_id]) fitmentMap[f.product_id] = [];
      fitmentMap[f.product_id].push(f);
    });
    
    offers.forEach(o => {
      if (!offersMap[o.product_id]) offersMap[o.product_id] = [];
      offersMap[o.product_id].push(o);
    });

    // Step 4: Build Typesense documents
    console.log('🔨 Building Typesense documents...');
    const documents = [];
    
    for (const product of products) {
      const productSpecs = specsMap[product.id] || [];
      const productMedia = mediaMap[product.id] || [];
      const productFitment = fitmentMap[product.id] || [];
      const productOffers = offersMap[product.id] || [];
      
      // Get OEM cross-references from loaded data
      const oemRefs = OEM_CROSSREF.ds_to_oem[product.sku] || [];
      
      const doc = buildDocument(
        product,
        productSpecs,
        productMedia,
        productFitment,
        productOffers,
        oemRefs
      );
      
      documents.push(doc);
    }
    
    console.log(`✓ Built ${documents.length} documents\n`);

    // Step 5: Import to Typesense in batches
    console.log('📤 Importing to Typesense...');
    const BATCH_SIZE = 1000;
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      
      try {
        const result = await client.collections('products')
          .documents()
          .import(batch, { action: 'upsert' });
        
        // Count successes and failures
        result.forEach(r => {
          if (r.success) {
            imported++;
          } else {
            failed++;
            console.error(`Failed to import ${r.document?.sku}: ${r.error}`);
          }
        });
        
        console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} docs`);
      } catch (error) {
        console.error(`Batch import error:`, error);
        failed += batch.length;
      }
    }

    console.log('\n✅ INDEXING COMPLETE');
    console.log(`   Imported: ${imported}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total: ${documents.length}\n`);

  } catch (error) {
    console.error('❌ Indexing failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the indexer
if (require.main === module) {
  indexProducts()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { buildDocument };
