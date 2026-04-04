/**
 * Stage 2: Computed Values
 * Calculates pricing, stock totals, and flags for catalog products
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

// Pricing rules
const PRICING_RULES = {
  minMargin: 0.15,      // 15% minimum margin
  maxMargin: 0.50,      // 50% maximum margin
  mapBuffer: 0.01,      // $0.01 buffer below MAP
  defaultMultiplier: 1.25 // 1.25x cost if no MSRP
};

/**
 * Calculate our_price based on cost and MSRP with MAP compliance
 */
function calculatePrice(cost, msrp, mapPrice) {
  if (!cost) return null;

  // Start with cost + default margin
  let ourPrice = cost * PRICING_RULES.defaultMultiplier;

  // If MSRP exists, use it as ceiling
  if (msrp && msrp > 0) {
    // Price at 85% of MSRP (15% off retail)
    const retailBased = msrp * 0.85;
    ourPrice = Math.min(ourPrice, retailBased);
  }

  // Respect MAP (Minimum Advertised Price)
  if (mapPrice && mapPrice > 0) {
    // Stay just above MAP
    const mapFloor = mapPrice + PRICING_RULES.mapBuffer;
    ourPrice = Math.max(ourPrice, mapFloor);
  }

  // Ensure minimum margin
  const minPrice = cost * (1 + PRICING_RULES.minMargin);
  ourPrice = Math.max(ourPrice, minPrice);

  // Cap at maximum margin
  const maxPrice = cost * (1 + PRICING_RULES.maxMargin);
  ourPrice = Math.min(ourPrice, maxPrice);

  // Round to 2 decimal places
  return Math.round(ourPrice * 100) / 100;
}

/**
 * Calculate total stock from warehouse JSON
 */
function calculateTotalStock(warehouseJson) {
  if (!warehouseJson) return 0;
  
  let total = 0;
  const locations = ['wi', 'ny', 'tx', 'ca', 'nv', 'nc', 'national'];
  
  for (const loc of locations) {
    const val = warehouseJson[loc];
    if (val && val !== 'N/A') {
      const num = parseInt(val, 10);
      if (!isNaN(num)) total += num;
    }
  }
  
  return total;
}

/**
 * Update vendor offers with computed pricing
 */
async function computeVendorPricing() {
  console.log('💰 Computing vendor offer pricing...');

  // Get all PU vendor offers
  const { data: offers, error } = await supabase
    .from('vendor_offers')
    .select('*')
    .eq('vendor', 'pu');

  if (error) {
    throw new Error(`Failed to fetch offers: ${error.message}`);
  }

  console.log(`Found ${offers.length} PU vendor offers`);

  let updated = 0;
  let errors = 0;

  for (const offer of offers) {
    const ourPrice = calculatePrice(offer.cost, offer.msrp, offer.map_price);
    
    const { error: updateError } = await supabase
      .from('vendor_offers')
      .update({
        our_price: ourPrice,
        computed_at: new Date().toISOString()
      })
      .eq('id', offer.id);

    if (updateError) {
      errors++;
    } else {
      updated++;
    }

    if (updated % 1000 === 0) {
      process.stdout.write(`\r  Updated: ${updated}/${offers.length}`);
    }
  }

  console.log('\n✓ Vendor pricing complete');
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
}

/**
 * Update catalog_products with computed_price from best vendor offer
 */
async function computeProductPrices() {
  console.log('\n🏷️  Computing product prices...');

  // Get products with their offers
  const { data: products, error } = await supabase
    .from('catalog_products')
    .select('id, sku');

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  console.log(`Found ${products.length} products`);

  let updated = 0;
  let noPrice = 0;

  for (const product of products) {
    // Get best offer (lowest our_price with stock)
    const { data: offers } = await supabase
      .from('vendor_offers')
      .select('our_price, total_qty')
      .eq('product_id', product.id)
      .order('our_price', { ascending: true });

    let bestPrice = null;
    
    if (offers && offers.length > 0) {
      // Prefer in-stock, then lowest price
      const inStock = offers.filter(o => o.total_qty > 0 && o.our_price);
      if (inStock.length > 0) {
        bestPrice = inStock[0].our_price;
      } else if (offers[0].our_price) {
        bestPrice = offers[0].our_price;
      }
    }

    if (bestPrice) {
      const { error: updateError } = await supabase
        .from('catalog_products')
        .update({ computed_price: bestPrice })
        .eq('id', product.id);

      if (!updateError) {
        updated++;
      }
    } else {
      noPrice++;
    }

    if ((updated + noPrice) % 1000 === 0) {
      process.stdout.write(`\r  Updated: ${updated} | No price: ${noPrice}`);
    }
  }

  console.log('\n✓ Product pricing complete');
  console.log(`  Updated: ${updated}`);
  console.log(`  No price available: ${noPrice}`);
}

/**
 * Mark discontinued products (no vendor offers)
 */
async function markDiscontinued() {
  console.log('\n🗑️  Marking discontinued products...');

  // Find products with no active offers
  const { data: products, error } = await supabase
    .from('catalog_products')
    .select('id')
    .eq('is_discontinued', false);

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  let discontinued = 0;

  for (const product of products) {
    const { count } = await supabase
      .from('vendor_offers')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', product.id);

    if (count === 0) {
      await supabase
        .from('catalog_products')
        .update({ is_discontinued: true, is_active: false })
        .eq('id', product.id);
      discontinued++;
    }
  }

  console.log(`✓ Marked ${discontinued} products as discontinued`);
}

/**
 * Main computed values function
 */
export async function runComputedValues() {
  console.log('🚀 Stage 2: Computing Values\n');
  
  const startTime = Date.now();
  
  await computeVendorPricing();
  await computeProductPrices();
  await markDiscontinued();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${duration}s`);
  console.log('\n✅ Stage 2 Complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComputedValues().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
