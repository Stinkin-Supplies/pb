/**
 * app/api/checkout/prepare/route.ts
 *
 * Pre-payment quote/validation step. Takes the cart, checks live stock and computes
 * pricing via the optimizer, and returns a customer-safe summary — no DB writes here,
 * no gateway call. The actual order only gets created (and rows written) at
 * /api/orders/create, after payment succeeds.
 *
 * Deliberately does NOT echo resolvedVendor, unitCost, or marginPct back to the client
 * — those are internal to the optimizer's RoutedGroup/RoutedItem and have no business
 * being visible in a browser network tab.
 *
 * POINTS: accepts optional userId + pointsToRedeem. This is a QUOTE only — the
 * authoritative balance check + debit happens in orders/create inside a locked
 * transaction. Here we just read the balance (no lock needed for a read-only
 * preview) and compute what discount *would* apply, so the UI can show an
 * accurate total before the customer commits to paying.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogDb } from '@/lib/db/catalog'; // CONFIRM this import path
import { resolveFulfillment, type OrderItemInput } from '@/lib/fulfillment/optimizer';

const POINTS_REDEEM_RATE = 0.01; // $ value per point

type PrepareRequestItem = {
  canonicalSku: string;
  qty: number;
};

type CanonicalLookupRow = {
  canonicalId: number;
  canonicalSku: string;
  displayName: string;
  unitPrice: number;
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const requestedItems: PrepareRequestItem[] = body.items ?? [];
  const userId: string | null = body.userId ?? null;
  const pointsToRedeem: number = Number(body.pointsToRedeem ?? 0) || 0;

  if (requestedItems.length === 0) {
    return NextResponse.json({ error: 'No items in cart' }, { status: 400 });
  }

  const db = getCatalogDb();
  const skus = requestedItems.map((i) => i.canonicalSku);
  const lookups = await lookupCanonicalProducts(db, skus);
  const lookupBySku = new Map(lookups.map((l) => [l.canonicalSku, l]));

  const missingSkus = skus.filter((sku) => !lookupBySku.has(sku));
  if (missingSkus.length > 0) {
    return NextResponse.json(
      { error: 'Some items no longer exist', missingSkus },
      { status: 409 }
    );
  }

  const optimizerInput: OrderItemInput[] = requestedItems.map((reqItem, idx) => {
    const lookup = lookupBySku.get(reqItem.canonicalSku)!;
    return {
      orderItemId: idx, // synthetic — real order_items rows don't exist until /orders/create
      canonicalProductId: lookup.canonicalId,
      qty: reqItem.qty,
      unitPrice: lookup.unitPrice,
    };
  });

  const { groups, unfulfillable } = await resolveFulfillment(optimizerInput);

  // Re-flatten by synthetic orderItemId (== index into requestedItems) to build a
  // customer-facing line-item list, joined back to display name/price/qty — vendor,
  // cost, and margin are deliberately left out of this response.
  const fulfillableIndexes = new Set(
    groups.flatMap((g) => g.items.map((i) => i.orderItemId))
  );

  const lineItems = requestedItems.map((reqItem, idx) => {
    const lookup = lookupBySku.get(reqItem.canonicalSku)!;
    const isFulfillable = fulfillableIndexes.has(idx);
    return {
      canonicalSku: reqItem.canonicalSku,
      displayName: lookup.displayName,
      qty: reqItem.qty,
      unitPrice: lookup.unitPrice,
      lineTotal: lookup.unitPrice * reqItem.qty,
      fulfillable: isFulfillable,
    };
  });

  const subtotal = lineItems
    .filter((li) => li.fulfillable)
    .reduce((sum, li) => sum + li.lineTotal, 0);

  // Both placeholders per CHASE_LIST item 17 — wire real calculation when that's built.
  const shippingTotal = 0;
  const taxTotal = 0;
  const preDiscountTotal = subtotal + shippingTotal + taxTotal;

  let pointsAvailable = 0;
  let pointsApplied = 0;
  let discountTotal = 0;

  if (userId) {
    const { rows } = await db.query(
      `SELECT points_balance FROM customer_points WHERE user_id = $1`,
      [userId]
    );
    pointsAvailable = rows[0]?.points_balance ?? 0;

    const requested = Math.max(0, Math.min(pointsToRedeem, pointsAvailable));
    const rawValue = requested * POINTS_REDEEM_RATE;
    discountTotal = Math.min(rawValue, preDiscountTotal);
    // If capped by the order total, don't quote more points as "applied" than
    // the discount actually consumed.
    pointsApplied = Math.round(discountTotal / POINTS_REDEEM_RATE);
  }

  return NextResponse.json({
    lineItems,
    unfulfillableCount: unfulfillable.length,
    subtotal,
    shippingTotal,
    taxTotal,
    pointsAvailable,
    pointsApplied,
    discountTotal,
    total: Math.max(preDiscountTotal - discountTotal, 0),
  });
}

/**
 * CONFIRMED against real schema (pasted June 18): canonical_products.id,
 * canonical_sku, display_name, our_price, is_active.
 */
async function lookupCanonicalProducts(
  db: ReturnType<typeof getCatalogDb>,
  skus: string[]
): Promise<CanonicalLookupRow[]> {
  const result = await db.query(
    `SELECT id, canonical_sku, display_name, our_price
     FROM canonical_products
     WHERE canonical_sku = ANY($1::text[])
       AND is_active = true`,
    [skus]
  );
  return result.rows.map((row: any) => ({
    canonicalId: row.id,
    canonicalSku: row.canonical_sku,
    displayName: row.display_name,
    unitPrice: Number(row.our_price),
  }));
}
