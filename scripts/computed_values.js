/**
 * Stage 2 — Computed Values
 * Reads:  catalog_products, vendor_offers
 * Writes: vendor_offers.our_price, vendor_offers.computed_at
 *         catalog_products.computed_price, stock_quantity, in_stock,
 *                          is_active, is_discontinued
 *
 * Column names match live DB schema:
 *   vendor_offers:     catalog_product_id, vendor_code, wholesale_cost,
 *                      our_price, map_price, msrp, total_qty, in_stock,
 *                      computed_at, updated_at
 *   catalog_products:  computed_price, stock_quantity, in_stock,
 *                      is_active, is_discontinued, updated_at
 *
 * Pricing rules (MAP-safe):
 *   1. cost exists  → our_price = cost * markup
 *   2. no cost      → our_price = msrp * msrp_discount
 *   3. MAP exists   → our_price = MAX(our_price, map_price)
 *
 * computed_price on catalog_products:
 *   = lowest our_price from an in-stock vendor offer
 *   fallback to lowest our_price from any offer if none in stock
 *
 * Timestamps:
 *   updated_at  → set by vendor ingest (normalize_pu / normalize_wps)
 *   computed_at → set here when our_price is written
 */

import { sql } from '../lib/db.js';

// ─── config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  markup: {
    pu:      1.30,
    wps:     1.35,
    default: 1.35,
  },
  msrpDiscount: {
    pu:      0.75,
    wps:     0.80,
    default: 0.80,
  },
  freeShippingThreshold: 99,
  staleDays:  60,
  batchSize: 1000,
};

// ─── pricing logic ────────────────────────────────────────────────────────────

function computeOurPrice(offer) {
  const markup   = CONFIG.markup[offer.vendor_code]      ?? CONFIG.markup.default;
  const msrpDisc = CONFIG.msrpDiscount[offer.vendor_code] ?? CONFIG.msrpDiscount.default;
  const cost     = offer.wholesale_cost ? Number(offer.wholesale_cost) : null;
  const msrp     = offer.msrp           ? Number(offer.msrp)           : null;
  const mapPrice = offer.map_price      ? Number(offer.map_price)      : null;

  let price = null;

  if (cost && cost > 0) {
    price = cost * markup;
  } else if (msrp && msrp > 0) {
    price = msrp * msrpDisc;
  }

  if (price === null) return null;

  // MAP enforcement — never price below MAP
  if (mapPrice && mapPrice > 0 && price < mapPrice) {
    price = mapPrice;
  }

  return Math.round(price * 100) / 100;
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function runComputedValues({ batchSize = CONFIG.batchSize } = {}) {
  console.log('[Stage2] Starting computed values pass...');

  // ── Step 1: compute our_price per vendor offer ────────────────────────────
  console.log('[Stage2] Step 1 — computing our_price per vendor offer...');

  const [{ count: offerCount }] = await sql`SELECT COUNT(*) FROM vendor_offers`;
  const totalOffers = Number(offerCount);
  console.log(`[Stage2] ${totalOffers} vendor offers to price`);

  let offset     = 0;
  let offersDone = 0;
  let offersNull = 0;

  while (offset < totalOffers) {
    const offers = await sql`
      SELECT id, vendor_code, wholesale_cost, msrp, map_price, total_qty
      FROM vendor_offers
      ORDER BY id
      LIMIT ${batchSize} OFFSET ${offset}
    `;

    for (const offer of offers) {
      const ourPrice = computeOurPrice(offer);
      await sql`
        UPDATE vendor_offers
        SET our_price   = ${ourPrice},
            computed_at = NOW()
        WHERE id = ${offer.id}
      `;
      if (ourPrice === null) offersNull++;
      offersDone++;
    }

    offset += batchSize;
    const pct2    = Math.min(offset, totalOffers) / totalOffers;
    const filled2 = Math.round(pct2 * 26);
    const bar2    = '█'.repeat(filled2) + '░'.repeat(26 - filled2);
    console.log(`[Stage2] Offers │${bar2}│ ${(pct2 * 100).toFixed(1).padStart(5)}% (${Math.min(offset, totalOffers)}/${totalOffers}) priced: ${offersDone - offersNull} no-price: ${offersNull}`);
  }

  // ── Step 2: roll up computed_price + stock to catalog_products ────────────
  console.log('[Stage2] Step 2 — rolling up computed_price + stock_quantity to catalog_products...');

  // In-stock price first, fallback to any price
  await sql`
    UPDATE catalog_products cp
    SET
      computed_price = COALESCE(
        (SELECT MIN(our_price)
         FROM vendor_offers
         WHERE catalog_product_id = cp.id
           AND total_qty > 0
           AND our_price IS NOT NULL),
        (SELECT MIN(our_price)
         FROM vendor_offers
         WHERE catalog_product_id = cp.id
           AND our_price IS NOT NULL)
      ),
      stock_quantity = COALESCE(
        (SELECT SUM(total_qty)
         FROM vendor_offers
         WHERE catalog_product_id = cp.id),
        0
      ),
      in_stock = (
        COALESCE(
          (SELECT SUM(total_qty)
           FROM vendor_offers
           WHERE catalog_product_id = cp.id),
          0
        ) > 0
      ),
      updated_at = NOW()
    WHERE EXISTS (
      SELECT 1 FROM vendor_offers WHERE catalog_product_id = cp.id
    )
  `;

  const [{ count: priced }] = await sql`
    SELECT COUNT(*) FROM catalog_products WHERE computed_price IS NOT NULL
  `;
  const [{ count: inStock }] = await sql`
    SELECT COUNT(*) FROM catalog_products WHERE in_stock = true
  `;
  console.log(`[Stage2] computed_price set: ${priced} | in_stock: ${inStock}`);

  // ── Step 3: discontinued detection ───────────────────────────────────────
  console.log('[Stage2] Step 3 — detecting discontinued products...');

  // No offers at all
  await sql`
    UPDATE catalog_products
    SET is_discontinued = true,
        is_active       = false,
        updated_at      = NOW()
    WHERE id NOT IN (SELECT DISTINCT catalog_product_id FROM vendor_offers)
      AND is_discontinued = false
  `;

  // Offers exist but all zero qty and not updated recently
  await sql`
    UPDATE catalog_products cp
    SET is_discontinued = true,
        is_active       = false,
        updated_at      = NOW()
    WHERE is_discontinued = false
      AND NOT EXISTS (
        SELECT 1 FROM vendor_offers
        WHERE catalog_product_id = cp.id AND total_qty > 0
      )
      AND EXISTS (
        SELECT 1 FROM vendor_offers
        WHERE catalog_product_id = cp.id
          AND updated_at < NOW() - INTERVAL '${String(CONFIG.staleDays)} days'
      )
  `;

  // Re-activate anything with a price and stock
  await sql`
    UPDATE catalog_products
    SET is_active       = true,
        is_discontinued = false,
        updated_at      = NOW()
    WHERE computed_price IS NOT NULL
      AND stock_quantity > 0
      AND is_discontinued = false
  `;

  const [{ count: discontinued }] = await sql`
    SELECT COUNT(*) FROM catalog_products WHERE is_discontinued = true
  `;
  console.log(`[Stage2] Discontinued: ${discontinued}`);

  // ── Step 4: MAP compliance check ─────────────────────────────────────────
  console.log('[Stage2] Step 4 — MAP compliance check...');

  const violations = await sql`
    SELECT cp.sku, cp.name, cp.computed_price, vo.map_price, vo.vendor_code
    FROM catalog_products cp
    JOIN vendor_offers vo ON vo.catalog_product_id = cp.id
    WHERE vo.map_price IS NOT NULL
      AND cp.computed_price IS NOT NULL
      AND cp.computed_price < vo.map_price
    LIMIT 100
  `;

  if (violations.length) {
    console.warn(`[Stage2] ⚠️  ${violations.length} MAP violations detected:`);
    violations.slice(0, 5).forEach(v =>
      console.warn(`  SKU ${v.sku}: $${v.computed_price} < MAP $${v.map_price} (${v.vendor_code})`)
    );
    if (violations.length > 5) console.warn(`  ... and ${violations.length - 5} more`);
  } else {
    console.log('[Stage2] ✓ No MAP violations');
  }

  console.log('[Stage2] Done.');
  return {
    offersDone,
    offersWithNoPrice: offersNull,
    pricedProducts:    Number(priced),
    inStockProducts:   Number(inStock),
    discontinued:      Number(discontinued),
    mapViolations:     violations.length,
  };
}
