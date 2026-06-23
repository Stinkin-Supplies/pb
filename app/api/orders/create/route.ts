/**
 * app/api/orders/create/route.ts
 *
 * Validates the cart one more time (server-side, authoritative), charges the
 * payment gateway, then writes orders + order_items + vendor_orders inside a single
 * transaction, and triggers fulfillment per vendor group.
 *
 * GATEWAY CHARGE IS AN EXPLICIT STUB — CHASE_LIST item 1 (gateway decision) is on
 * hold pending the merchant-account meeting. chargeGateway() below always returns a
 * failure right now, on purpose: this route is structurally ready to wire to whichever
 * gateway gets picked, but won't let an order through as "paid" while there's nothing
 * actually processing payment. Swap chargeGateway()'s body for the real SDK call once
 * Authorize.net/NMI/Braintree/Heartland is decided — nothing else in this file should
 * need to change.
 *
 * Schema is fully confirmed now — canonical_products, product_vendors, orders,
 * order_items, vendor_orders. The only remaining stub is the gateway charge itself.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogDb } from '@/lib/db/catalog'; // CONFIRM this import path
import { resolveFulfillment, type OrderItemInput } from '@/lib/fulfillment/optimizer';
import { triggerFulfillment } from '@/lib/fulfillment/triggerFulfillment';

type CreateRequestItem = {
  canonicalSku: string;
  qty: number;
};

type CanonicalLookupRow = {
  canonicalId: number;
  canonicalSku: string;
  displayName: string;
  unitPrice: number;
};

type ChargeResult = {
  success: boolean;
  gatewayName?: string;
  transactionId?: string;
  authCode?: string;
  rawResponse?: unknown;
  errorMessage?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const requestedItems: CreateRequestItem[] = body.items ?? [];
  const { customerEmail, customerName, shippingAddress, billingAddress, paymentToken } = body;

  if (requestedItems.length === 0) {
    return NextResponse.json({ error: 'No items in cart' }, { status: 400 });
  }
  if (!customerEmail || !customerName || !shippingAddress) {
    return NextResponse.json(
      { error: 'customerEmail, customerName, and shippingAddress are required' },
      { status: 400 }
    );
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
      orderItemId: idx,
      canonicalProductId: lookup.canonicalId,
      qty: reqItem.qty,
      unitPrice: lookup.unitPrice,
    };
  });

  const { groups, unfulfillable } = await resolveFulfillment(optimizerInput);

  if (unfulfillable.length > 0) {
    // Refuse to create a partially-fulfillable order silently — surface exactly which
    // cart lines dropped out so the client can re-prompt before charging anything.
    return NextResponse.json(
      {
        error: 'Some items are no longer in stock',
        unfulfillableIndexes: unfulfillable.map((u) => u.orderItemId),
      },
      { status: 409 }
    );
  }

  const subtotal = groups.reduce(
    (sum, g) => sum + g.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
    0
  );
  const shippingTotal = 0; // CHASE_LIST item 17 — placeholder
  const taxTotal = 0; // CHASE_LIST item 17 — placeholder
  const discountTotal = 0;
  const total = subtotal + shippingTotal + taxTotal - discountTotal;

  const charge = await chargeGateway(paymentToken, total);
  if (!charge.success) {
    return NextResponse.json(
      { error: 'Payment failed', detail: charge.errorMessage },
      { status: 402 }
    );
  }

  const client = await db.connect();
  let orderId: number;
  let orderNumber: string;
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (
         customer_email, customer_name, shipping_address, billing_address,
         subtotal, shipping_total, tax_total, discount_total, total,
         payment_status, gateway_name, gateway_transaction_id, gateway_auth_code,
         gateway_response, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, order_number`,
      [
        customerEmail,
        customerName,
        JSON.stringify(shippingAddress),
        billingAddress ? JSON.stringify(billingAddress) : null,
        subtotal,
        shippingTotal,
        taxTotal,
        discountTotal,
        total,
        'paid',
        charge.gatewayName,
        charge.transactionId,
        charge.authCode,
        JSON.stringify(charge.rawResponse ?? null),
        'pending', // order status — fulfillment not yet confirmed, just paid
      ]
    );
    orderId = orderResult.rows[0].id;
    orderNumber = orderResult.rows[0].order_number;

    for (const group of groups) {
      for (const item of group.items) {
        // item.orderItemId is the synthetic index assigned above, so it maps straight
        // back to requestedItems/lookupBySku — no need to search by catalogUnifiedId
        // (that's catalog_unified.id, a different keyspace from canonical_products.id).
        const reqItem = requestedItems[item.orderItemId];
        const displayName = lookupBySku.get(reqItem.canonicalSku)?.displayName ?? '';

        await client.query(
          `INSERT INTO order_items (
             order_id, canonical_product_id, resolved_vendor, vendor_sku, display_name,
             qty, unit_price, unit_cost, margin_pct, fulfillment_status, is_manual_fulfillment
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            orderId,
            lookupBySku.get(reqItem.canonicalSku)!.canonicalId,
            item.resolvedVendor,
            item.vendorSku,
            displayName,
            item.qty,
            item.unitPrice,
            item.unitCost,
            item.marginPct,
            'pending',
            group.isManual,
          ]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // release back to pool — never .end() the shared pool itself
  }

  // Fulfillment dispatch happens after commit, outside the DB transaction — an adapter
  // call failing shouldn't roll back an already-paid order. Each group's failure mode
  // (see triggerFulfillment.ts) degrades to "manual_required" rather than throwing.
  for (const group of groups) {
    await triggerFulfillment(orderId, group);
  }

  return NextResponse.json({ orderNumber, status: 'pending' });
}

/**
 * STUB. Always fails on purpose until a gateway is chosen (CHASE_LIST item 1).
 * Replace the body with the real SDK call for whichever gateway wins — keep the
 * ChargeResult shape so the rest of this route doesn't need to change.
 */
async function chargeGateway(paymentToken: unknown, amount: number): Promise<ChargeResult> {
  return {
    success: false,
    errorMessage: 'No payment gateway configured yet — see CHASE_LIST item 1',
  };
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
