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
 * All lookups (canonical_products, product_vendors) are now confirmed against real
 * schema — nothing left to guess here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogDb } from '@/lib/db/catalog'; // CONFIRM this import path
import { resolveFulfillment, type OrderItemInput } from '@/lib/fulfillment/optimizer';

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

  return NextResponse.json({
    lineItems,
    unfulfillableCount: unfulfillable.length,
    subtotal,
    shippingTotal,
    taxTotal,
    total: subtotal + shippingTotal + taxTotal,
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
