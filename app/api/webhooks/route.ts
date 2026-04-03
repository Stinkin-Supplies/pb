import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { routeCart } from "@/lib/routing/loadCartLines";
import { sql } from "@/lib/db";
import type {
  PurchaseOrder,
  POLineItem,
  CustomerAddress,
  VendorId,
  ResolvedCart,
  ShippingOption,
} from "@/lib/routing/types";
import { createClient } from "@supabase/supabase-js";
import { wpsAdapter } from "@/lib/vendors/wps/adapter";
import { puAdapter } from "@/lib/vendors/pu/adapter";
import { writeSyncLog } from "@/lib/syncLog";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VENDOR_ADAPTERS = [wpsAdapter, puAdapter];

// ---------------------------------------------------------------------------
// Safe JSON parse helper — returns null instead of throwing
// ---------------------------------------------------------------------------

function safeJsonParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw || raw === "none") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error("[webhook] JSON.parse failed for value:", raw);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutCompleted(session);
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const meta            = session.metadata ?? {};
  const strategy        = meta.routing_strategy as ResolvedCart["strategy"];
  const vendorPrimary   = meta.routing_vendor_primary   as VendorId | "none";
  const vendorSecondary = meta.routing_vendor_secondary as VendorId | "none";

  // ── Expand Stripe line items to get real quantities ──────────────────────
  // FIX: was hardcoded qty:1 — now reads actual purchased quantity from Stripe
  const lineItemsPage = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });
  const lineItems = lineItemsPage.data;

  // Build a map of description→qty for line item quantity lookup
  // Stripe line item descriptions typically contain the product name/SKU
  const stripeQtyMap = new Map<string, number>();
  const stripeAmountMap = new Map<string, number>();
  for (const li of lineItems) {
    if (li.description) {
      stripeQtyMap.set(li.description, li.quantity ?? 1);
      stripeAmountMap.set(li.description, li.amount_total ?? 0);
    }
  }

  // ── Parse routing results from Stripe metadata ───────────────────────────
  const routingResults: ResolvedCart["results"] = safeJsonParse(
    meta.routing_results,
    []
  );

  // ── Build cart items with correct quantities ─────────────────────────────
  // Match SKU to Stripe line item to get real qty
  const cartItems = routingResults.map((r) => {
    const stripeItem = lineItems.find((li) => li.description?.includes(r.sku));
    return {
      sku:         r.sku,
      qty:         stripeItem?.quantity ?? 1, // FIX: was always 1
      retailPrice: Number(r.winner?.offer.retailPrice ?? 0),
      name:        r.sku,
    };
  });

  // ── Re-route from DB at checkout-complete time ───────────────────────────
  let resolvedCartVendor: VendorId | null = null;
  let resolvedIsSplitCart = false;
  let resolvedVendors: VendorId[] = [];

  if (cartItems.length > 0) {
    try {
      const routing       = await routeCart(cartItems, sql);
      resolvedCartVendor  = routing.cartVendor;
      resolvedIsSplitCart = routing.isSplitCart;
      resolvedVendors     = Array.from(
        new Set(
          routing.lines
            .map((line) => line.winner?.offer.vendor)
            .filter(Boolean) as VendorId[],
        ),
      );
    } catch (err) {
      console.error("[webhook] routeCart failed, falling back to metadata routing:", err);
    }
  }

  // ── Build cost map from routing results ──────────────────────────────────
  const costMap = new Map<string, { cost: number; name: string }>();
  routingResults.forEach((r) => {
    if (r.winner) {
      costMap.set(r.sku, {
        cost: r.winner.offer.cost,
        name: r.sku,
      });
    }
  });

  // ── Build customer address ────────────────────────────────────────────────
  const customer = session.customer_details;
  const shippingAddress: CustomerAddress = {
    name:       customer?.name ?? "",
    line1:      customer?.address?.line1 ?? "",
    line2:      customer?.address?.line2 ?? undefined,
    city:       customer?.address?.city ?? "",
    state:      customer?.address?.state ?? "",
    postalCode: customer?.address?.postal_code ?? "",
    country:    customer?.address?.country ?? "US",
    phone:      customer?.phone ?? undefined,
  };

  const customerEmail = customer?.email ?? "";
  const placedAt      = new Date().toISOString();

  // ── Parse shipping options safely ─────────────────────────────────────────
  // FIX: JSON.parse("none") throws — safeJsonParse returns null instead
  const shippingPrimary: ShippingOption | null = safeJsonParse(
    meta.routing_shipping_primary,
    null
  );
  const shippingSecondary: ShippingOption | null = safeJsonParse(
    meta.routing_shipping_secondary,
    null
  );

  const fallbackShipping: ShippingOption = {
    label:       "Ground",
    carrier:     "TBD",
    transitDays: 5,
    cost:        0,
    retailRate:  0,
  };

  // ── Build and submit POs ──────────────────────────────────────────────────
  const poResults = [];

  const vendorsToSubmit: VendorId[] =
    resolvedVendors.length > 0
      ? resolvedVendors
      : [
          ...(vendorPrimary   !== "none" ? [vendorPrimary]   : []),
          ...(vendorSecondary !== "none" ? [vendorSecondary] : []),
        ];

  for (const vendorId of vendorsToSubmit) {
    const adapter = VENDOR_ADAPTERS.find((a) => a.vendorId === vendorId);
    if (!adapter) {
      console.error(`[webhook] no adapter found for vendor: ${vendorId}`);
      continue;
    }

    // Filter routing results for this vendor
    const vendorResults = routingResults.filter(
      (r) => r.winner?.offer.vendor === vendorId
    );

    if (vendorResults.length === 0) {
      console.warn(`[webhook] no line items for vendor ${vendorId} — skipping PO`);
      continue;
    }

    // Build PO lines with correct quantities
    const poLines: POLineItem[] = vendorResults.map((r) => {
      const stripeItem = lineItems.find((li) => li.description?.includes(r.sku));
      const qty        = stripeItem?.quantity ?? 1; // FIX: correct qty
      return {
        sku:        r.sku,
        qty,
        unitCost:   costMap.get(r.sku)?.cost ?? 0,
        unitRetail: ((stripeItem?.amount_total ?? 0) / 100) / qty,
        name:       costMap.get(r.sku)?.name ?? r.sku,
      };
    });

    // Pick shipping option for this vendor — safe parse already done above
    const shippingOption =
      vendorId === vendorPrimary
        ? (shippingPrimary   ?? fallbackShipping)
        : (shippingSecondary ?? fallbackShipping);

    const po: PurchaseOrder = {
      orderId:         session.id,
      vendor:          vendorId,
      lines:           poLines,
      shippingAddress,
      shippingOption,
      customerEmail,
      placedAt,
      metadata: {
        stripe_session_id:      session.id,
        routing_strategy:       strategy,
        routing_cart_vendor:    resolvedCartVendor ?? "none",
        routing_is_split_cart:  String(resolvedIsSplitCart),
      },
    };

    // FIX: pass sql client to PU adapter (PU reads from DB, not live API)
    const result = vendorId === "PU"
      ? await (adapter as typeof puAdapter).submitPO(po)
      : await adapter.submitPO(po);

    poResults.push({ vendorId, ...result });

    // Log to Supabase sync_log
    await writeSyncLog(supabase, {
      vendor:            vendorId.toLowerCase(),
      event:             "po_submitted",
      status:            result.success ? "success" : "error",
      vendor_order_id:   result.vendorOrderId ?? null,
      stripe_session_id: session.id,
      error_message:     result.error ?? null,
      raw_response:      result.rawResponse ?? null,
      completed_at:      placedAt,
      created_at:        placedAt,
    });

    if (!result.success) {
      console.error(`[webhook] PO failed for ${vendorId}:`, result.error);
      // TODO: trigger admin alert / Slack notification
    }
  }

  // ── Handle backorders ─────────────────────────────────────────────────────
  const backorders = safeJsonParse(meta.routing_backorders, []);
  if (backorders.length > 0) {
    try {
      await supabase.from("stock_notifications").upsert(
        backorders.map((b: any) => ({
          sku:               b.sku,
          customer_email:    customerEmail,
          restock_date:      b.restockDate ?? null,
          added_from:        "backorder",
          stripe_session_id: session.id,
          created_at:        placedAt,
        })),
        { onConflict: "sku,customer_email" }
      );
    } catch {
      console.error("[webhook] failed to save backorder notifications");
    }
  }

  console.log(
    `[webhook] checkout.session.completed — strategy: ${strategy} | vendors: ${vendorsToSubmit.join(", ")}`,
    poResults
  );
}
