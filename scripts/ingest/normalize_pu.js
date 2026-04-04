/**
 * Stage 1: Normalize Parts Unlimited Data
 * Maps raw_vendor_pu JSONB to canonical catalog schema
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Check if product is in target catalogs (Tire, Oldbook, Fatbook)
 */
function isInTargetCatalogs(item) {
  const hasFatbook = item.fatbook_catalog && item.fatbook_catalog.trim() !== '';
  const hasFatbookMid = item.fatbook_midyear_catalog && item.fatbook_midyear_catalog.trim() !== '';
  const hasTire = item.tire_catalog && item.tire_catalog.trim() !== '';
  const hasOldbook = item.oldbook_catalog && item.oldbook_catalog.trim() !== '';
  const hasOldbookMid = item.oldbook_midyear_catalog && item.oldbook_midyear_catalog.trim() !== '';
  
  return hasFatbook || hasFatbookMid || hasTire || hasOldbook || hasOldbookMid;
}

/**
 * Get catalog sources for allowlist
 */
function getCatalogSources(item) {
  const sources = [];
  if (item.fatbook_catalog && item.fatbook_catalog.trim() !== '') sources.push('fatbook');
  if (item.fatbook_midyear_catalog && item.fatbook_midyear_catalog.trim() !== '') sources.push('fatbook_midyear');
  if (item.tire_catalog && item.tire_catalog.trim() !== '') sources.push('tire');
  if (item.oldbook_catalog && item.oldbook_catalog.trim() !== '') sources.push('oldbook');
  if (item.oldbook_midyear_catalog && item.oldbook_midyear_catalog.trim() !== '') sources.push('oldbook_midyear');
  return sources;
}

/**
 * Calculate total stock from warehouse availability
 */
function calculateStock(item) {
  const avail = item.availability || {};
  let total = 0;
  
  ['wi', 'ny', 'tx', 'ca', 'nv', 'nc'].forEach(loc => {
    const val = avail[loc];
    if (val && val !== 'N/A') {
      const num = parseInt(val, 10);
      if (!isNaN(num)) total += num;
    }
  });
  
  return total;
}

/**
 * Generate URL-friendly slug
 */
function generateSlug(name, sku) {
  const base = `${name || ''} ${sku || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.substring(0, 100);
}

/**
 * Pass 1: Normalize products from dealer price data
 */
async function normalizeProducts() {
  console.log('📦 Pass 1: Normalizing products from dealer price data...');

  // Get all raw batches
  const { data: batches, error: batchError } = await supabase
    .from('raw_vendor_pu')
    .select('source_file, payload')
    .like('source_file', 'dealerprice_batch_%');

  if (batchError) {
    throw new Error(`Failed to fetch batches: ${batchError.message}`);
  }

  console.log(`Found ${batches.length} batches`);

  let processed = 0;
  let inserted = 0;
  let skipped = 0;

  for (const batch of batches) {
    const items = batch.payload || [];
    
    for (const item of items) {
      processed++;
      
      // Skip if not in target catalogs
      if (!isInTargetCatalogs(item)) {
        skipped++;
        continue;
      }

      const sku = item.part_number?.trim();
      if (!sku) {
        skipped++;
        continue;
      }

      const name = item.part_description?.trim() || sku;
      const slug = generateSlug(name, sku);
      const brand = item.brand_name?.trim() || '';
      const mpn = item.vendor_part_number?.trim() || sku;

      // Upsert product
      const { error: prodError } = await supabase
        .from('catalog_products')
        .upsert({
          sku: sku,
          brand: brand,
          manufacturer_part_number: mpn,
          slug: slug,
          name: name,
          description: null, // Will be populated from PIES
          category: inferCategory(item),
          is_active: item.part_status === 'S',
          is_discontinued: item.part_status !== 'S',
          created_at: new Date().toISOString()
        }, {
          onConflict: 'sku'
        });

      if (prodError) {
        console.error(`Product error for ${sku}:`, prodError.message);
        continue;
      }

      inserted++;

      // Upsert vendor offer
      const stockQty = calculateStock(item);
      const cost = item.your_dealer_price || item.base_dealer_price;
      const msrp = item.current_suggested_retail;

      // Get product ID
      const { data: product } = await supabase
        .from('catalog_products')
        .select('id')
        .eq('sku', sku)
        .single();

      if (product) {
        await supabase
          .from('vendor_offers')
          .upsert({
            product_id: product.id,
            vendor: 'pu',
            warehouse_json: item.availability || {},
            cost: cost,
            msrp: msrp,
            total_qty: stockQty,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'product_id,vendor'
          });

        // Insert specs
        await insertSpecs(product.id, item);
      }

      if (processed % 1000 === 0) {
        process.stdout.write(`\r  Processed: ${processed} | Inserted: ${inserted} | Skipped: ${skipped}`);
      }
    }
  }

  console.log('\n✅ Pass 1 Complete!');
  console.log(`  Processed: ${processed}`);
  console.log(`  Inserted/Updated: ${inserted}`);
  console.log(`  Skipped: ${skipped}`);
}

/**
 * Infer category from product data
 */
function inferCategory(item) {
  const desc = (item.part_description || '').toLowerCase();
  const brand = (item.brand_name || '').toLowerCase();
  
  // Tire catalog products
  if (item.tire_catalog) {
    if (desc.includes('tire')) return 'Tires';
    if (desc.includes('tube')) return 'Tubes';
    if (desc.includes('wheel')) return 'Wheels';
    return 'Tire & Wheel';
  }
  
  // Fatbook (Harley/V-Twin)
  if (item.fatbook_catalog) {
    if (desc.includes('exhaust')) return 'Exhaust';
    if (desc.includes('seat')) return 'Seats';
    if (desc.includes('handlebar')) return 'Handlebars';
    if (desc.includes('air')) return 'Air Intake';
    if (desc.includes('brake')) return 'Brakes';
    if (desc.includes('suspension')) return 'Suspension';
    return 'V-Twin Parts';
  }
  
  // Oldbook (Vintage/Classic)
  if (item.oldbook_catalog) {
    return 'Vintage Parts';
  }
  
  return 'Parts';
}

/**
 * Insert product specs
 */
async function insertSpecs(productId, item) {
  const specs = [];
  
  if (item.weight) {
    specs.push({ product_id: productId, attribute: 'Weight', value: `${item.weight} lbs` });
  }
  
  if (item.upc_code) {
    specs.push({ product_id: productId, attribute: 'UPC', value: item.upc_code });
  }
  
  if (item.country_of_origin) {
    specs.push({ product_id: productId, attribute: 'Country of Origin', value: item.country_of_origin });
  }
  
  if (item.product_code) {
    specs.push({ product_id: productId, attribute: 'Product Code', value: item.product_code });
  }
  
  if (item.hazardous_code) {
    specs.push({ product_id: productId, attribute: 'Hazardous', value: 'Yes' });
  }
  
  if (item.dimensions?.height) {
    specs.push({ 
      product_id: productId, 
      attribute: 'Dimensions', 
      value: `${item.dimensions.height}"H x ${item.dimensions.length}"L x ${item.dimensions.width}"W` 
    });
  }

  // Catalog membership specs
  if (item.fatbook_catalog) {
    specs.push({ product_id: productId, attribute: 'Catalog', value: 'Fatbook' });
  }
  if (item.tire_catalog) {
    specs.push({ product_id: productId, attribute: 'Catalog', value: 'Tire' });
  }
  if (item.oldbook_catalog) {
    specs.push({ product_id: productId, attribute: 'Catalog', value: 'Oldbook' });
  }

  if (specs.length > 0) {
    // Delete existing specs first
    await supabase
      .from('catalog_specs')
      .delete()
      .eq('product_id', productId);
    
    // Insert new specs
    await supabase.from('catalog_specs').insert(specs);
  }
}

/**
 * Main normalization function
 */
export async function normalizePu() {
  console.log('🚀 Stage 1: Normalizing Parts Unlimited Data\n');
  
  const startTime = Date.now();
  
  await normalizeProducts();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${duration}s`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalizePu().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
