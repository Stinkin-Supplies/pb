/**
 * lib/fulfillment/optimizer.ts
 *
 * Given a set of order line items, decide which vendor(s) fulfill the order.
 *
 * Priority order (per ROADMAP.md Phase 12):
 *   1. Minimize vendor count (fewer shipments / vendor_orders rows = better)
 *   2. Within that, maximize margin
 *   3. Stock check against the freshest row at resolution time (not a live vendor-API
 *      hit — both product_vendors and vendor_offers are synced by background jobs;
 *      "live" here means "don't trust a stale client cache, re-query now")
 *   4. VTwin is never auto-submitted — always routed to the manual queue
 *
 * DATA SOURCE — reads product_vendors, not vendor_offers. Per ROADMAP.md Phase 10,
 * vendor_offers is the *intended* eventual unified pricing table, but as of this
 * writing it only has 22,278 rows and all of them are WPS — PU and VTwin haven't
 * been backfilled into it. product_vendors already has one row per catalog_unified
 * row across all three vendors (our_cost, stock_qty, in_stock, source_vendor), so
 * it's the table that's actually correct today. Once the vendor_offers backfill
 * task is done, swap fetchLiveOffers to read from vendor_offers instead — same
 * shape, different table/column names.
 *
 * CONFIRMED against real schema (pasted June 18):
 *   - product_vendors: canonical_id (FK -> canonical_products.id), catalog_unified_id
 *     (FK -> catalog_unified.id, UNIQUE), source_vendor, vendor_sku, our_cost,
 *     stock_qty, in_stock.
 *   - order_items: canonical_product_id (FK -> canonical_products.id), resolved_vendor,
 *     vendor_sku, unit_price, unit_cost, margin_pct, is_manual_fulfillment — these last
 *     five are EXISTING columns this optimizer is meant to populate per item, not just
 *     return as a throwaway result.
 *
 * STILL UNCONFIRMED:
 *   - Exact source_vendor value for VTwin (guessing 'VTWIN' to match the uppercase
 *     source_vendor convention documented for catalog_unified — run
 *     `SELECT DISTINCT source_vendor FROM product_vendors;` to confirm before relying
 *     on the manual-queue routing below).
 *   - Whether our_cost is full landed cost or whether something else (shipping,
 *     drop-ship fees — product_vendors doesn't expose those columns at all, unlike
 *     vendor_offers which has drop_ship_fee/drop_ship_eligible) needs folding in
 *     separately. Left untouched; confirm before trusting totalMargin for anything
 *     money-real.
 */

import { getCatalogDb } from '@/lib/db/catalog'; // CONFIRM this import path

export type OrderItemInput = {
  orderItemId: number;
  canonicalProductId: number;
  qty: number;
  unitPrice: number; // matches order_items.unit_price — what the customer is charged
};

export type VendorOffer = {
  catalogUnifiedId: number;
  sourceVendor: string; // 'PU' | 'WPS' | 'VTWIN' (VTwin casing unconfirmed)
  ourCost: number;
  stockQty: number;
  vendorSku: string;
};

export type RoutedItem = {
  orderItemId: number;
  catalogUnifiedId: number;
  resolvedVendor: string;
  vendorSku: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  marginPct: number; // fraction, e.g. 0.25 — matches numeric(5,4) on order_items.margin_pct
};

export type RoutedGroup = {
  sourceVendor: string;
  isManual: boolean; // -> order_items.is_manual_fulfillment for every item in this group
  items: RoutedItem[];
  totalCost: number;
  totalMargin: number;
};

export type OptimizerResult = {
  groups: RoutedGroup[];
  unfulfillable: Array<{ orderItemId: number; reason: string }>;
};

const MANUAL_VENDORS = new Set(['VTWIN']); // CONFIRM exact source_vendor value

/**
 * Main entry point. Call at order-resolution time (checkout/prepare or orders/create).
 * Returns routing groups; caller is responsible for writing resolvedVendor/vendorSku/
 * unitCost/marginPct/isManualFulfillment back onto each order_items row and creating
 * one vendor_orders row per group.
 */
export async function resolveFulfillment(
  items: OrderItemInput[]
): Promise<OptimizerResult> {
  const db = getCatalogDb();

  const canonicalIds = items.map((i) => i.canonicalProductId);
  const offersByCanonical = await fetchLiveOffers(db, canonicalIds);

  const unfulfillable: OptimizerResult['unfulfillable'] = [];
  const viableItems: Array<{ item: OrderItemInput; offers: VendorOffer[] }> = [];

  for (const item of items) {
    const offers = (offersByCanonical.get(item.canonicalProductId) ?? []).filter(
      (o) => o.stockQty >= item.qty
    );
    if (offers.length === 0) {
      unfulfillable.push({
        orderItemId: item.orderItemId,
        reason: 'no vendor has sufficient stock as of last sync',
      });
    } else {
      viableItems.push({ item, offers });
    }
  }

  if (viableItems.length === 0) {
    return { groups: [], unfulfillable };
  }

  // Try single-vendor coverage first — minimizes vendor count trivially when possible.
  const vendorsPresent = new Set<string>();
  viableItems.forEach(({ offers }) => offers.forEach((o) => vendorsPresent.add(o.sourceVendor)));

  const singleVendorCandidates = [...vendorsPresent].filter((vendor) =>
    viableItems.every(({ offers }) => offers.some((o) => o.sourceVendor === vendor))
  );

  let chosenAssignment: Map<number, VendorOffer>; // orderItemId -> chosen offer

  if (singleVendorCandidates.length > 0) {
    let bestVendor = singleVendorCandidates[0];
    let bestMargin = -Infinity;
    for (const vendor of singleVendorCandidates) {
      const margin = viableItems.reduce((sum, { item, offers }) => {
        const offer = offers.find((o) => o.sourceVendor === vendor)!;
        return sum + (item.unitPrice - offer.ourCost) * item.qty;
      }, 0);
      if (margin > bestMargin) {
        bestMargin = margin;
        bestVendor = vendor;
      }
    }
    chosenAssignment = new Map(
      viableItems.map(({ item, offers }) => [
        item.orderItemId,
        offers.find((o) => o.sourceVendor === bestVendor)!,
      ])
    );
  } else {
    // No single vendor covers everything — greedy minimum-vendor-count cover,
    // tie-broken by margin. Heuristic, not exact set-cover; fine for the order
    // sizes this catalog actually sees.
    chosenAssignment = greedyMinVendorCover(viableItems);
  }

  const groupMap = new Map<string, RoutedGroup>();
  for (const { item } of viableItems) {
    const offer = chosenAssignment.get(item.orderItemId);
    if (!offer) continue;
    const key = offer.sourceVendor;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        sourceVendor: key,
        isManual: MANUAL_VENDORS.has(key),
        items: [],
        totalCost: 0,
        totalMargin: 0,
      });
    }
    const group = groupMap.get(key)!;
    const marginPct = item.unitPrice > 0 ? (item.unitPrice - offer.ourCost) / item.unitPrice : 0;
    group.items.push({
      orderItemId: item.orderItemId,
      catalogUnifiedId: offer.catalogUnifiedId,
      resolvedVendor: offer.sourceVendor,
      vendorSku: offer.vendorSku,
      qty: item.qty,
      unitCost: offer.ourCost,
      unitPrice: item.unitPrice,
      marginPct,
    });
    group.totalCost += offer.ourCost * item.qty;
    group.totalMargin += (item.unitPrice - offer.ourCost) * item.qty;
  }

  return { groups: [...groupMap.values()], unfulfillable };
}

function greedyMinVendorCover(
  viableItems: Array<{ item: OrderItemInput; offers: VendorOffer[] }>
): Map<number, VendorOffer> {
  const assignment = new Map<number, VendorOffer>();
  const remaining = new Set(viableItems.map(({ item }) => item.orderItemId));

  while (remaining.size > 0) {
    const vendorCoverage = new Map<string, { count: number; margin: number }>();

    for (const { item, offers } of viableItems) {
      if (!remaining.has(item.orderItemId)) continue;
      for (const offer of offers) {
        const stats = vendorCoverage.get(offer.sourceVendor) ?? { count: 0, margin: 0 };
        stats.count += 1;
        stats.margin += (item.unitPrice - offer.ourCost) * item.qty;
        vendorCoverage.set(offer.sourceVendor, stats);
      }
    }

    let bestVendor = '';
    let best = { count: -1, margin: -Infinity };
    for (const [vendor, stats] of vendorCoverage) {
      if (stats.count > best.count || (stats.count === best.count && stats.margin > best.margin)) {
        best = stats;
        bestVendor = vendor;
      }
    }

    for (const { item, offers } of viableItems) {
      if (!remaining.has(item.orderItemId)) continue;
      const offer = offers.find((o) => o.sourceVendor === bestVendor);
      if (offer) {
        assignment.set(item.orderItemId, offer);
        remaining.delete(item.orderItemId);
      }
    }
  }

  return assignment;
}

async function fetchLiveOffers(
  db: ReturnType<typeof getCatalogDb>,
  canonicalProductIds: number[]
): Promise<Map<number, VendorOffer[]>> {
  const result = await db.query(
    `SELECT canonical_id,
            catalog_unified_id,
            source_vendor,
            our_cost,
            stock_qty,
            vendor_sku
     FROM product_vendors
     WHERE canonical_id = ANY($1::int[])
       AND in_stock = true`,
    [canonicalProductIds]
  );

  const map = new Map<number, VendorOffer[]>();
  for (const row of result.rows) {
    const offer: VendorOffer = {
      catalogUnifiedId: row.catalog_unified_id,
      sourceVendor: row.source_vendor,
      ourCost: Number(row.our_cost),
      stockQty: Number(row.stock_qty),
      vendorSku: row.vendor_sku,
    };
    const list = map.get(row.canonical_id) ?? [];
    list.push(offer);
    map.set(row.canonical_id, list);
  }
  return map;
}
