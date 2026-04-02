/**
 * Stage 2 — Computed Values
 * Reads:  catalog_products, vendor_offers
 * Writes: catalog_products.computed_price, is_active, is_discontinued
 *         vendor_offers.our_price, computed_at
 *
 * Pricing rules (MAP-safe):
 *   1. If MAP exists: our_price = MAX(cost * markup, map_price)
 *   2. If no MAP:     our_price = cost * markup
 *   3. If no cost:    our_price = msrp * msrp_discount
 *   4. computed_price on catalog_products = best our_price across all vendors
 *
 * Stock merge:
 *   vendor_offers.total_qty already set by Stage 1.
 *   catalog_products gets a denormalized total_stock for fast Typesense indexing.
 *
 * Discontinued detection:
 *   Products with no vendor_offers OR all offers at 0 qty for > STALE_DAYS
 *   are flagged is_discontinued = true.
 */

import { sql } from '../lib/db.js';

// ─── config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  // Markup multipliers by vendor
  markup: {
    wps: 1.35,
    pu:  1.30,
    default: 1.35,
  },
  // MSRP fallback discount when no cost available
  msrpDiscount: {
    wps: 0.80,
    pu:  0.75,
    default: 0.80,
  },
  // Free shipping threshold
  freeShippingThreshold: 99,
  // Days since last update before marking discontinued
  staleDays: 60,
  // Batch size for DB updates
  batchSize: 1000,
};

// ─── pricing logic ────────────────────────────────────────────────────────────

function computeOurPrice(offer) {
  const markup      = CONFIG.markup[offer.vendor]      ?? CONFIG.markup.default;
  const msrpDisc    = CONFIG.msrpDiscount[offer.vendor] ?? CONFIG.msrpDiscount.default;
  const cost        = offer.cost    ? Number(offer.cost)     : null;
  const msrp        = offer.msrp    ? Number(offer.msrp)     : null;
  const mapPrice    = offer.map_price ? Number(offer.map_price) : null;

  let price = null;

  if (cost && cost > 0) {
    price = cost * markup;
  } else if (msrp && msrp > 0) {
    price = msrp * msrpDisc;
  }

  if (price === null) return null;

  // MAP enforcement — never go below MAP
  if (mapPrice && mapPrice > 0 && price < mapPrice) {
    price = mapPrice;
  }

  // Round to 2 decimal places
  return Math.round(price * 100) / 100;
}

/**
 * From multiple vendor offers, pick the best computed_price for the product.
 * Strategy: lowest price from an in-stock vendor first,
 *           then lowest price overall.
 */
function bestPrice(offers) {
  const priced      = offers.filter(o => o.our_price !== null);
  const inStock     = priced.filter(o => o.total_qty > 0);
  const pool        = inStock.length ? inStock : priced;
  if (!pool.length) return null;
  return Math.min(...pool.map(o => o.our_price));
}

// ─── stage 2 runner ───────────────────────────────────────────────────────────

export async function runComputedValues({ batchSize = CONFIG.batchSize } = {}) {
  console.log('[Stage2] Starting computed values pass...');

  // ── Step 1: compute our_price per vendor offer ────────────────────────────
  console.log('[Stage2] Step 1 — computing our_price per offer...');

  let offset = 0;
  let offersDone = 0;

  const [{ count: offerCount }] = await sql`SELECT COUNT(*) FROM vendor_offers`;
  const totalOffers = Number(offerCount);

  while (offset < totalOffers) {
    const offers = await sql`
      SELECT id, vendor, cost, msrp, map_price, total_qty
      FROM vendor_offers
      ORDER BY id
      LIMIT ${batchSize} OFFSET ${offset}
    `;

    for (const offer of offers) {
      const ourPrice = computeOurPrice(offer);
      await sql`
        UPDATE vendor_offers
        SET our_price = ${ourPrice}, computed_at = NOW()
        WHERE id = ${offer.id}
      `;
      offersDone++;
    }

    offset += batchSize;
    console.log(`[Stage2] Offers: ${Math.min(offset, totalOffers)} / ${totalOffers}`);
  }

  // ── Step 2: roll up computed_price + total_stock to catalog_products ──────
  console.log('[Stage2] Step 2 — rolling up computed_price + stock to catalog_products...');

  await sql`
    UPDATE catalog_products cp
    SET
      computed_price = sub.best_price,
      total_stock    = sub.total_stock,
      in_stock       = (sub.total_stock > 0),
      updated_at     = NOW()
    FROM (
      SELECT
        product_id,
        MIN(our_price) FILTER (WHERE total_qty > 0 AND our_price IS NOT NULL)
          AS best_price_in_stock,
        MIN(our_price) FILTER (WHERE our_price IS NOT NULL)
          AS best_price_any,
        SUM(total_qty) AS total_stock
      FROM vendor_offers
      GROUP BY product_id
    ) sub
    WHERE cp.id = sub.product_id
    AND (
      COALESCE(sub.best_price_in_stock, sub.best_price_any) IS NOT NULL
      OR sub.total_stock IS NOT NULL
    )
    -- Use in-stock price if available, else any price
    -- (SQL doesn't allow referencing aliases in SET, so inline COALESCE)
  `;

  // Separate update to resolve the alias issue above
  await sql`
    UPDATE catalog_products cp
    SET computed_price = COALESCE(
      (SELECT MIN(our_price) FROM vendor_offers WHERE product_id = cp.id AND total_qty > 0 AND our_price IS NOT NULL),
      (SELECT MIN(our_price) FROM vendor_offers WHERE product_id = cp.id AND our_price IS NOT NULL)
    )
    WHERE computed_price IS NULL
      AND EXISTS (SELECT 1 FROM vendor_offers WHERE product_id = cp.id AND our_price IS NOT NULL)
  `;

  const [{ count: priced }] = await sql`
    SELECT COUNT(*) FROM catalog_products WHERE computed_price IS NOT NULL
  `;
  console.log(`[Stage2] computed_price set on ${priced} products`);

  // ── Step 3: active/discontinued detection ─────────────────────────────────
  console.log('[Stage2] Step 3 — detecting discontinued products...');

  // Mark discontinued: no vendor offers at all
  const [{ count: noOffer }] = await sql`
    UPDATE catalog_products
    SET is_discontinued = true, is_active = false, updated_at = NOW()
    WHERE id NOT IN (SELECT DISTINCT product_id FROM vendor_offers)
    AND is_discontinued = false
    RETURNING id
  `;

  // Mark discontinued: offers exist but all zero qty and stale
  const [{ count: stale }] = await sql`
    UPDATE catalog_products cp
    SET is_discontinued = true, is_active = false, updated_at = NOW()
    WHERE is_discontinued = false
    AND EXISTS (
      SELECT 1 FROM vendor_offers vo
      WHERE vo.product_id = cp.id
      GROUP BY vo.product_id
      HAVING SUM(vo.total_qty) = 0
        AND MAX(vo.updated_at) < NOW() - INTERVAL '${CONFIG.staleDays} days'
    )
    AND NOT EXISTS (
      SELECT 1 FROM vendor_offers vo
      WHERE vo.product_id = cp.id AND vo.total_qty > 0
    )
    RETURNING id
  `;

  // Ensure is_active = true for everything with a price and stock
  await sql`
    UPDATE catalog_products
    SET is_active = true, is_discontinued = false, updated_at = NOW()
    WHERE computed_price IS NOT NULL
      AND total_stock > 0
      AND is_discontinued = false
  `;

  console.log(`[Stage2] Discontinued — no offer: ${noOffer ?? 0} | stale zero-stock: ${stale ?? 0}`);

  // ── Step 4: sport flags denorm (already on product from Stage 1 WPS) ──────
  // PU doesn't have flags — no-op for now.
  // When WPS catalog flags imported (Phase 2.6), they're already written in Stage 1.
  console.log('[Stage2] Step 4 — sport flags already set by Stage 1 (WPS). PU flags TBD.');

  // ── Step 5: MAP compliance violations log ────────────────────────────────
  console.log('[Stage2] Step 5 — MAP compliance check...');

  const violations = await sql`
    SELECT cp.sku, cp.name, cp.computed_price, vo.map_price, vo.vendor
    FROM catalog_products cp
    JOIN vendor_offers vo ON vo.product_id = cp.id
    WHERE vo.map_price IS NOT NULL
      AND cp.computed_price IS NOT NULL
      AND cp.computed_price < vo.map_price
    LIMIT 100
  `;

  if (violations.length) {
    console.warn(`[Stage2] ⚠️  ${violations.length} MAP violations detected:`);
    for (const v of violations.slice(0, 10)) {
      console.warn(`  SKU ${v.sku}: price $${v.computed_price} < MAP $${v.map_price} (${v.vendor})`);
    }
    if (violations.length > 10) console.warn(`  ... and ${violations.length - 10} more`);
  } else {
    console.log('[Stage2] ✓ No MAP violations.');
  }

  console.log('[Stage2] Done.');
  return {
    offersDone,
    pricedProducts: Number(priced),
    discontinued:   Number(noOffer ?? 0) + Number(stale ?? 0),
    mapViolations:  violations.length,
  };
}
