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

  // One set-based update is dramatically faster than per-row updates over a network DB.
  const rows = await sql`
    UPDATE vendor_offers vo
    SET
      our_price = CASE
        WHEN vo.wholesale_cost IS NULL THEN NULL
        ELSE (
          -- Start with cost * defaultMultiplier, cap at 85% MSRP if present,
          -- respect MAP + buffer, enforce min/max margin, then round to cents.
          ROUND(
            LEAST(
              GREATEST(
                CASE
                  WHEN vo.map_price IS NOT NULL AND vo.map_price > 0
                    THEN GREATEST(
                      CASE
                        WHEN vo.msrp IS NOT NULL AND vo.msrp > 0
                          THEN LEAST(vo.wholesale_cost * ${PRICING_RULES.defaultMultiplier}, vo.msrp * 0.85)
                          ELSE vo.wholesale_cost * ${PRICING_RULES.defaultMultiplier}
                      END,
                      vo.map_price + ${PRICING_RULES.mapBuffer}
                    )
                  ELSE (
                    CASE
                      WHEN vo.msrp IS NOT NULL AND vo.msrp > 0
                        THEN LEAST(vo.wholesale_cost * ${PRICING_RULES.defaultMultiplier}, vo.msrp * 0.85)
                        ELSE vo.wholesale_cost * ${PRICING_RULES.defaultMultiplier}
                    END
                  )
                END,
                vo.wholesale_cost * ${(1 + PRICING_RULES.minMargin)}
              ),
              vo.wholesale_cost * ${(1 + PRICING_RULES.maxMargin)}
            ),
            2
          )
        )
      END,
      computed_at = NOW()
    WHERE vo.vendor_code = ${'pu'}
    RETURNING vo.id
  `;

  console.log(`✓ Vendor pricing complete (${rows.length.toLocaleString()} offers updated)`);
}

/**
 * Update catalog_products with computed_price from best vendor offer
 */
async function computeProductPrices() {
  console.log('\n🏷️  Computing product prices...');

  // Choose best offer per product:
  // 1) Prefer in-stock (total_qty > 0) when an our_price exists
  // 2) Then lowest our_price
  const updated = await sql`
    WITH ranked AS (
      SELECT
        vo.catalog_product_id,
        vo.our_price,
        ROW_NUMBER() OVER (
          PARTITION BY vo.catalog_product_id
          ORDER BY
            CASE WHEN vo.total_qty > 0 THEN 0 ELSE 1 END,
            vo.our_price ASC NULLS LAST
        ) AS rn
      FROM vendor_offers vo
      WHERE vo.our_price IS NOT NULL
    )
    UPDATE catalog_products cp
    SET computed_price = r.our_price
    FROM ranked r
    WHERE r.catalog_product_id = cp.id
      AND r.rn = 1
    RETURNING cp.id
  `;

  console.log(`✓ Product pricing complete (${updated.length.toLocaleString()} products updated)`);
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
