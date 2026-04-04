/**
 * Stage 2: Computed Values
 * Calculates pricing, stock totals, and flags for catalog products
 */

import dotenv from 'dotenv';
import { sql } from '../lib/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

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
  const t0 = Date.now();

  // Get all PU vendor offers
  const offers = await sql`
    SELECT id, wholesale_cost, msrp, map_price
    FROM vendor_offers
    WHERE vendor_code = ${'pu'}
  `;

  console.log(`Found ${offers.length} PU vendor offers`);

  let updated = 0;
  let errors = 0;

  for (const offer of offers) {
    const ourPrice = calculatePrice(offer.wholesale_cost, offer.msrp, offer.map_price);

    try {
      await sql`
        UPDATE vendor_offers
        SET our_price = ${ourPrice}, computed_at = NOW()
        WHERE id = ${offer.id}
      `;
      updated++;
    } catch {
      errors++;
    }

    if ((updated + errors) % 2000 === 0) {
      const done = updated + errors;
      const elapsed = (Date.now() - t0) / 1000;
      const rate = done / Math.max(1, elapsed);
      const pct = offers.length > 0 ? ((done / offers.length) * 100) : 0;
      const eta = rate > 0 ? (offers.length - done) / rate : Infinity;
      process.stdout.write(
        `\r  ${done.toLocaleString()}/${offers.length.toLocaleString()} (${pct.toFixed(1)}%)` +
        ` | Updated: ${updated.toLocaleString()} | Errors: ${errors.toLocaleString()}` +
        ` | ${rate.toFixed(0)}/s | ETA ${formatEta(eta)}`
      );
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
  const t0 = Date.now();

  // Get products with their offers
  const products = await sql`SELECT id, sku FROM catalog_products`;

  console.log(`Found ${products.length} products`);

  let updated = 0;
  let noPrice = 0;

  for (const product of products) {
    // Get best offer (lowest our_price with stock)
    const offers = await sql`
      SELECT our_price, total_qty
      FROM vendor_offers
      WHERE catalog_product_id = ${product.id}
      ORDER BY our_price ASC NULLS LAST
    `;

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
      try {
        await sql`
          UPDATE catalog_products
          SET computed_price = ${bestPrice}
          WHERE id = ${product.id}
        `;
        updated++;
      } catch {
        // ignore
      }
    } else {
      noPrice++;
    }

    if ((updated + noPrice) % 2000 === 0) {
      const done = updated + noPrice;
      const elapsed = (Date.now() - t0) / 1000;
      const rate = done / Math.max(1, elapsed);
      const pct = products.length > 0 ? ((done / products.length) * 100) : 0;
      const eta = rate > 0 ? (products.length - done) / rate : Infinity;
      process.stdout.write(
        `\r  ${done.toLocaleString()}/${products.length.toLocaleString()} (${pct.toFixed(1)}%)` +
        ` | Updated: ${updated.toLocaleString()} | No price: ${noPrice.toLocaleString()}` +
        ` | ${rate.toFixed(0)}/s | ETA ${formatEta(eta)}`
      );
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

  const rows = await sql`
    UPDATE catalog_products cp
    SET is_discontinued = true, is_active = false
    WHERE cp.is_discontinued = false
      AND NOT EXISTS (
        SELECT 1 FROM vendor_offers vo
        WHERE vo.catalog_product_id = cp.id
      )
    RETURNING cp.id
  `;

  console.log(`✓ Marked ${rows.length} products as discontinued`);
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
