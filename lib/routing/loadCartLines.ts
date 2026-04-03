/**
 * lib/routing/loadCartLines.ts
 *
 * Loads vendor offers from the DB for a given list of SKUs
 * and shapes them into CartLine[] ready for scoreOffers().
 *
 * Usage:
 *   const lines = await loadCartLines(cartItems, sql);
 *   const results = scoreOffers(lines);
 *   const vendor = resolveCartVendor(results);
 */

import type { CartLine, VendorOffer, VendorId, ShippingOption, CartItem } from './types';

// ─── Vendor code → VendorId mapping ──────────────────────────────────────────

const VENDOR_CODE_MAP: Record<string, VendorId> = {
  wps: 'WPS',
  pu:  'PU',
};

// ─── Default shipping options by vendor ──────────────────────────────────────
// Used when no shipping rules are in the DB yet.
// Replace with real DB lookup once vendor_shipping_rules is populated.

const DEFAULT_SHIPPING: Record<VendorId, ShippingOption[]> = {
  WPS: [
    { label: 'Ground',    carrier: 'UPS',   transitDays: 5, cost: 8.99,  retailRate: 0 },
    { label: '2-Day',     carrier: 'UPS',   transitDays: 2, cost: 18.99, retailRate: 0 },
    { label: 'Overnight', carrier: 'UPS',   transitDays: 1, cost: 34.99, retailRate: 0 },
  ],
  PU: [
    { label: 'Ground',    carrier: 'FedEx', transitDays: 5, cost: 7.99,  retailRate: 0 },
    { label: '2-Day',     carrier: 'FedEx', transitDays: 2, cost: 16.99, retailRate: 0 },
    { label: 'Overnight', carrier: 'FedEx', transitDays: 1, cost: 32.99, retailRate: 0 },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Main loader ──────────────────────────────────────────────────────────────

export async function loadCartLines(
  cartItems: CartItem[],
  sql: any,  // postgres-js or compatible tagged template literal client
): Promise<CartLine[]> {
  if (!cartItems.length) return [];

  const skus = cartItems.map(i => i.sku);

  // Fetch all vendor offers for these SKUs in one query
  const offerRows = await sql`
    SELECT
      vo.vendor_code,
      vo.wholesale_cost,
      vo.map_price,
      vo.our_price,
      vo.total_qty,
      vo.drop_ship_fee,
      vo.drop_ship_eligible,
      cp.sku,
      cp.computed_price,
      cp.name
    FROM vendor_offers vo
    JOIN catalog_products cp ON cp.id = vo.catalog_product_id
    WHERE cp.sku = ANY(${skus})
      AND vo.is_active = true
    ORDER BY cp.sku, vo.vendor_code
  `;

  // Group offers by SKU
  const offersBySku = new Map<string, VendorOffer[]>();

  for (const row of offerRows) {
    const vendorId = VENDOR_CODE_MAP[row.vendor_code?.toLowerCase()];
    if (!vendorId) continue;

    const retailPrice = Number(row.computed_price ?? row.our_price ?? 0);

    const offer: VendorOffer = {
      vendor:          vendorId,
      sku:             row.sku,
      cost:            Number(row.wholesale_cost ?? 0),
      mapPrice:        row.map_price ? Number(row.map_price) : null,
      retailPrice,
      stockQty:        Number(row.total_qty ?? 0),
      status:          Number(row.total_qty ?? 0) > 0 ? 'available' : 'backorder',
      restockDate:     null,
      shippingOptions: DEFAULT_SHIPPING[vendorId] ?? [],
    };

    if (!offersBySku.has(row.sku)) offersBySku.set(row.sku, []);
    offersBySku.get(row.sku)!.push(offer);
  }

  // Build CartLine[] — one per cart item, matching types.ts CartLine shape
  return cartItems.map(item => ({
    sku:         item.sku,
    qty:         item.qty,
    retailPrice: item.retailPrice,
    name:        item.name,
    offers:      offersBySku.get(item.sku) ?? [],
  }));
}

// ─── Convenience: full cart routing in one call ───────────────────────────────

export async function routeCart(
  cartItems: CartItem[],
  sql: any,
) {
  const { scoreOffers, resolveCartVendor } = await import('./scoreOffers');

  const lines   = await loadCartLines(cartItems, sql);
  const results = scoreOffers(lines);
  const vendor  = resolveCartVendor(results);

  const totalCost = results.reduce((sum, r) => {
    if (!r.winner) return sum;
    const item = cartItems.find(i => i.sku === r.sku);
    return sum + r.winner.offer.cost * (item?.qty ?? 1);
  }, 0);

  const totalMargin = results.reduce((sum, r) => {
    if (!r.winner) return sum;
    const item = cartItems.find(i => i.sku === r.sku);
    return sum + r.winner.marginDollars * (item?.qty ?? 1);
  }, 0);

  const totalShipping = results.reduce((sum, r) => {
    if (!r.winner) return sum;
    return sum + r.winner.selectedShipping.cost;
  }, 0);

  return {
    lines:         results,
    cartVendor:    vendor,
    isSplitCart:   vendor === null,
    totalCost:     Math.round(totalCost     * 100) / 100,
    totalMargin:   Math.round(totalMargin   * 100) / 100,
    totalShipping: Math.round(totalShipping * 100) / 100,
  };
}