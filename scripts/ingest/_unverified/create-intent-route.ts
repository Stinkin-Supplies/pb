/**
 * app/api/stripe/create-intent/route.ts
 *
 * Creates a Stripe PaymentIntent for the current cart, using the exact same
 * pricing path as /api/checkout/prepare (lookupCanonicalProducts + resolveFulfillment)
 * so the amount charged can never drift from what the customer was quoted.
 *
 * REPLACES the previous version of this route, which was built against a dead
 * architecture (applyMapPricing / lib/map/engine, no canonical_products, no
 * fulfillment optimizer) — that predates the checkout/prepare + orders/create
 * rebuild and shares no dependencies with it, so it couldn't be patched forward.
 *
 * Flow:
 *   1. POST here with { items: [{canonicalSku, qty}] } → get back clientSecret
 *   2. Client confirms payment via Stripe Elements (PaymentElement) using that
 *      clientSecret
 *   3. Client calls /api/orders/create with paymentToken = the resulting
 *      PaymentIntent id — chargeGateway() there re-fetches the PaymentIntent
 *      from Stripe and verifies status + amount rather than charging again.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCatalogDb } from '@/lib/db/catalog';
import { resolveFulfillment, type OrderItemInput } from '@/lib/fulfillment/optimizer';

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}
const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });

type PrepareRequestItem = { canonicalSku: string; qty: number };
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
      orderItemId: idx,
      canonicalProductId: lookup.canonicalId,
      qty: reqItem.qty,
      unitPrice: lookup.unitPrice,
    };
  });

  const { groups, unfulfillable } = await resolveFulfillment(optimizerInput);

  if (unfulfillable.length > 0) {
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
  // Same placeholders as prepare/route.ts and orders/create/route.ts — CHASE_LIST item 17
  const shippingTotal = 0;
  const taxTotal = 0;
  const total = subtotal + shippingTotal + taxTotal;

  const amount = Math.round(total * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: {
      // Fine for typical cart sizes under Stripe's 500-char metadata value limit.
      // If that ever becomes a real constraint, switch to a cart hash + server-side
      // lookup instead of embedding the full item list.
      items: JSON.stringify(requestedItems),
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    total,
  });
}

/**
 * Identical to prepare/route.ts and orders/create/route.ts — same confirmed
 * schema (canonical_products.id, canonical_sku, display_name, our_price, is_active).
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
