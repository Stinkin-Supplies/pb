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
 * Update catalog_products with stock_quantity + msrp derived from active vendor offers.
 * This is used by the storefront and also lets Stage 3 avoid aggregating vendor_offers.
 */
async function computeProductStockAndMsrp() {
  console.log('\n📦 Computing product stock + MSRP...');

  const updated = await sql`
    WITH agg AS (
      SELECT
        vo.catalog_product_id,
        SUM(COALESCE(vo.total_qty, 0))::int AS stock_qty,
        MAX(vo.msrp) AS msrp
      FROM vendor_offers vo
      WHERE vo.is_active = true
      GROUP BY vo.catalog_product_id
    )
    UPDATE catalog_products cp
    SET
      stock_quantity = COALESCE(agg.stock_qty, 0),
      msrp           = agg.msrp,
      updated_at     = NOW()
    FROM agg
    WHERE agg.catalog_product_id = cp.id
    RETURNING cp.id
  `;

  // Ensure products with no active offers don't retain stale stock.
  const cleared = await sql`
    UPDATE catalog_products cp
    SET stock_quantity = 0, updated_at = NOW()
    WHERE COALESCE(cp.stock_quantity, 0) <> 0
      AND NOT EXISTS (
        SELECT 1
        FROM vendor_offers vo
        WHERE vo.catalog_product_id = cp.id
          AND vo.is_active = true
      )
    RETURNING cp.id
  `;

  console.log(
    `✓ Stock/MSRP complete (${updated.length.toLocaleString()} updated, ${cleared.length.toLocaleString()} cleared)`
  );
}

function isTruthy(v) {
  return String(v ?? '').toLowerCase() === '1' || String(v ?? '').toLowerCase() === 'true';
}

async function regclassExists(name) {
  const rows = await sql`SELECT to_regclass(${name}) AS reg`;
  return Boolean(rows?.[0]?.reg);
}

/**
 * Optional: build a denormalized cache of expensive-to-aggregate fields for Stage 3 indexing.
 *
 * Enable with env:
 *   STAGE2_BUILD_SEARCH_CACHE=1
 *
 * Requires migration:
 *   catalog-migrations/113_catalog_product_search_cache.sql
 */
async function buildProductSearchCache() {
  if (!isTruthy(process.env.STAGE2_BUILD_SEARCH_CACHE)) return;

  const hasCache = await regclassExists('public.catalog_product_search_cache');
  if (!hasCache) {
    console.log('ℹ️  Search cache table not found (catalog_product_search_cache). Skipping.');
    return;
  }

  const hasAllowlist = await regclassExists('public.catalog_allowlist');

  console.log('\n🧱 Building catalog_product_search_cache (denormalized specs/fitment/media)...');

  // This is a single set-based upsert. If you have a very large catalog and this is slow,
  // we can switch this to incremental refresh keyed off cp.updated_at / vo.updated_at.
  await sql`
    WITH target_products AS (
      SELECT cp.id, cp.sku, cp.name, cp.brand, cp.category
      FROM catalog_products cp
      WHERE cp.is_active = true
        AND COALESCE(cp.is_discontinued, false) = false
        AND (
          ${hasAllowlist} = false OR EXISTS (
            SELECT 1 FROM catalog_allowlist al WHERE al.sku = cp.sku
          )
        )
    ),
    specs AS (
      SELECT
        s.product_id,
        ARRAY_AGG(s.attribute || ': ' || s.value ORDER BY s.attribute, s.value) AS specs
      FROM catalog_specs s
      JOIN target_products tp ON tp.id = s.product_id
      GROUP BY s.product_id
    ),
    fitment AS (
      SELECT
        f.product_id,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.make), NULL) AS makes,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.model), NULL) AS models,
        ARRAY_AGG(DISTINCT y.year)::int[] AS years
      FROM catalog_fitment f
      JOIN target_products tp ON tp.id = f.product_id
      LEFT JOIN LATERAL (
        SELECT generate_series(
          COALESCE(f.year_start, f.year_end),
          COALESCE(f.year_end, f.year_start)
        ) AS year
      ) y ON true
      GROUP BY f.product_id
    ),
    media AS (
      SELECT DISTINCT ON (m.product_id)
        m.product_id,
        m.url
      FROM catalog_media m
      JOIN target_products tp ON tp.id = m.product_id
      ORDER BY m.product_id, m.priority ASC
    )
    INSERT INTO catalog_product_search_cache (
      product_id,
      specs,
      fitment_make,
      fitment_model,
      fitment_year,
      image_url,
      search_blob,
      updated_at
    )
    SELECT
      tp.id AS product_id,
      COALESCE(s.specs, ARRAY[]::text[]) AS specs,
      COALESCE(f.makes, ARRAY[]::text[]) AS fitment_make,
      COALESCE(f.models, ARRAY[]::text[]) AS fitment_model,
      COALESCE(f.years, ARRAY[]::int[]) AS fitment_year,
      m.url AS image_url,
      TRIM(
        CONCAT_WS(
          ' ',
          tp.sku,
          tp.name,
          tp.brand,
          tp.category,
          ARRAY_TO_STRING(COALESCE(s.specs, ARRAY[]::text[]), ' '),
          ARRAY_TO_STRING(COALESCE(f.makes, ARRAY[]::text[]), ' '),
          ARRAY_TO_STRING(COALESCE(f.models, ARRAY[]::text[]), ' ')
        )
      ) AS search_blob,
      NOW() AS updated_at
    FROM target_products tp
    LEFT JOIN specs   s ON s.product_id = tp.id
    LEFT JOIN fitment f ON f.product_id = tp.id
    LEFT JOIN media   m ON m.product_id = tp.id
    ON CONFLICT (product_id) DO UPDATE
    SET
      specs        = EXCLUDED.specs,
      fitment_make = EXCLUDED.fitment_make,
      fitment_model= EXCLUDED.fitment_model,
      fitment_year = EXCLUDED.fitment_year,
      image_url    = EXCLUDED.image_url,
      search_blob  = EXCLUDED.search_blob,
      updated_at   = EXCLUDED.updated_at
  `;

  console.log('✓ Search cache refreshed');
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
  await computeProductStockAndMsrp();
  await markDiscontinued();
  await buildProductSearchCache();
  
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
