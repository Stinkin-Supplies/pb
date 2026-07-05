/**
 * app/api/orders/create/route.ts
 *
 * Validates the cart one more time (server-side, authoritative), charges the
 * payment gateway, then writes orders + order_items + vendor_orders inside a single
 * transaction, and triggers fulfillment per vendor group.
 *
 * GATEWAY: Stripe (interim — swap chargeGateway()'s body if/when a different
 * processor is chosen). paymentToken is a Stripe PaymentIntent id created by
 * /api/stripe/create-intent and confirmed client-side; chargeGateway() verifies
 * that PaymentIntent's status/amount rather than charging again.
 *
 * POINTS: this is the ONLY place a balance is actually debited/credited. The
 * balance check happens with `SELECT ... FOR UPDATE` inside the same
 * transaction as the order write, so two concurrent checkouts for the same
 * user can't both spend points that only exist once (prepare/create-intent's
 * balance reads are unlocked previews — this is the real check). Rules:
 *   - Redeem at $0.01/point, capped to available balance and order total
 *   - Earn 1 point per $1 of subtotal (pre-discount)
 *   - +500 bonus on a user's first order with payment_status = 'paid'
 *   - Guest checkout (no userId) — no points earned or redeemed, silently
 *
 * If points fully cover the order (total = 0), there's no PaymentIntent to
 * verify — chargeGateway() is skipped entirely for that case rather than
 * calling Stripe with a $0 charge, which it doesn't support.
 *
 * Schema is fully confirmed — canonical_products, product_vendors, orders,
 * order_items, vendor_orders, customer_points.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCatalogDb } from '@/lib/db/catalog'; // CONFIRM this import path
import { resolveFulfillment, type OrderItemInput } from '@/lib/fulfillment/optimizer';
import { triggerFulfillment } from '@/lib/fulfillment/triggerFulfillment';

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}
const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' });

const POINTS_REDEEM_RATE = 0.01; // $ value per point
const POINTS_EARN_RATE = 1; // points per $1 of subtotal
const FIRST_ORDER_BONUS = 500;

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
  const userId: string | null = body.userId ?? null;
  const pointsToRedeem: number = Number(body.pointsToRedeem ?? 0) || 0;

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
  const preDiscountTotal = subtotal + shippingTotal + taxTotal;

  const client = await db.connect();
  let orderId: number;
  let orderNumber: string;
  let pointsConsumed = 0;
  let pointsEarned = 0;
  let discountTotal = 0;

  try {
    await client.query('BEGIN');

    // ── Points: lock the balance row for the duration of this transaction ──
    // so a second concurrent checkout for the same user can't also spend
    // points that only exist once. Ensure the row exists first (new user).
    let pointsAvailable = 0;
    if (userId) {
      await client.query(
        `INSERT INTO customer_points (user_id, points_balance) VALUES ($1, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      const { rows: balRows } = await client.query(
        `SELECT points_balance FROM customer_points WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      pointsAvailable = balRows[0]?.points_balance ?? 0;

      const requested = Math.max(0, Math.min(pointsToRedeem, pointsAvailable));
      discountTotal = Math.min(requested * POINTS_REDEEM_RATE, preDiscountTotal);
      pointsConsumed = Math.round(discountTotal / POINTS_REDEEM_RATE);
    }

    const total = Math.max(preDiscountTotal - discountTotal, 0);

    // ── Charge, unless points covered the whole order ──
    let charge: ChargeResult;
    if (total === 0) {
      charge = { success: true, gatewayName: 'points_full_coverage' };
    } else {
      charge = await chargeGateway(paymentToken, total);
      if (!charge.success) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Payment failed', detail: charge.errorMessage },
          { status: 402 }
        );
      }
    }

    // ── Points: is this the user's first paid order? Check before inserting
    // the new one, so the count is accurate. ──
    if (userId) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1 AND payment_status = 'paid'`,
        [userId]
      );
      const isFirstOrder = (countRows[0]?.n ?? 0) === 0;
      pointsEarned = Math.floor(subtotal * POINTS_EARN_RATE) + (isFirstOrder ? FIRST_ORDER_BONUS : 0);
    }

    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id, customer_email, customer_name, shipping_address, billing_address,
         subtotal, shipping_total, tax_total, discount_total, total,
         payment_status, gateway_name, gateway_transaction_id, gateway_auth_code,
         gateway_response, status, points_earned, points_redeemed, points_redeemed_value
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id, order_number`,
      [
        userId,
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
        charge.transactionId ?? null,
        charge.authCode ?? null,
        JSON.stringify(charge.rawResponse ?? null),
        'pending', // order status — fulfillment not yet confirmed, just paid
        pointsEarned,
        pointsConsumed,
        discountTotal,
      ]
    );
    orderId = orderResult.rows[0].id;
    orderNumber = orderResult.rows[0].order_number;

    // ── Points: apply the net balance change now that the order committed
    // to this transaction (still inside BEGIN — rolls back together if
    // anything below fails). ──
    if (userId && (pointsConsumed > 0 || pointsEarned > 0)) {
      await client.query(
        `UPDATE customer_points
         SET points_balance = points_balance - $1 + $2, updated_at = NOW()
         WHERE user_id = $3`,
        [pointsConsumed, pointsEarned, userId]
      );
    }

    for (const group of groups) {
      for (const item of group.items) {
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

  return NextResponse.json({
    orderNumber,
    status: 'pending',
    pointsEarned,
    pointsRedeemed: pointsConsumed,
  });
}

/**
 * Stripe implementation. paymentToken is a PaymentIntent id created by
 * /api/stripe/create-intent and confirmed client-side — this function verifies
 * that PaymentIntent rather than charging a fresh amount, so a customer who
 * already completed payment through Stripe Elements can never be charged twice.
 * Not called at all when points fully cover the order — see POST() above.
 */
async function chargeGateway(paymentToken: unknown, amount: number): Promise<ChargeResult> {
  const paymentIntentId = typeof paymentToken === 'string' ? paymentToken : '';
  if (!paymentIntentId) {
    return { success: false, errorMessage: 'Missing paymentToken (Stripe PaymentIntent id)' };
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    return { success: false, errorMessage: `Could not retrieve payment: ${String(err)}` };
  }

  if (paymentIntent.status !== 'succeeded') {
    return { success: false, errorMessage: `Payment not completed (status: ${paymentIntent.status})` };
  }

  const expectedAmount = Math.round(amount * 100);
  if (paymentIntent.amount !== expectedAmount) {
    return {
      success: false,
      errorMessage: `Amount mismatch: charged ${paymentIntent.amount}, expected ${expectedAmount}`,
    };
  }

  return {
    success: true,
    gatewayName: 'stripe',
    transactionId: paymentIntent.id,
    authCode: typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : undefined,
    rawResponse: paymentIntent,
  };
}

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
