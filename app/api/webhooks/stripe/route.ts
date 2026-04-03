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
} from "@/lib/routing/types";
import { createClient } from "@supabase/supabase-js";
import { wpsAdapter } from "@/lib/vendors/wps/adapter";
import { puAdapter } from "@/lib/vendors/pu/adapter";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VENDOR_ADAPTERS = [wpsAdapter, puAdapter];

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

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
  const meta = session.metadata ?? {};
  const strategy = meta.routing_strategy as ResolvedCart["strategy"];
  const vendorPrimary = meta.routing_vendor_primary as VendorId | "none";
  const vendorSecondary = meta.routing_vendor_secondary as VendorId | "none";

  // Parse line items from Stripe (expand in session creation if needed)
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });

  // Parse routing results to get per-SKU cost data
  let routingResults: ResolvedCart["results"] = [];
  try {
    routingResults = JSON.parse(meta.routing_results ?? "[]");
  } catch {
    console.error("[webhook] failed to parse routing_results");
  }

  // Re-route from DB offer data at checkout-complete time to pick vendor(s)
  // using latest inventory/pricing, independent of Stripe metadata staleness.
  const cartItems = routingResults.map((r) => ({
    sku: r.sku,
    qty: 1,
    retailPrice: Number(r.winner?.offer.retailPrice ?? 0),
    name: r.sku,
  }));

  let resolvedCartVendor: VendorId | null = null;
  let resolvedIsSplitCart = false;
  let resolvedVendors: VendorId[] = [];
  if (cartItems.length > 0) {
    try {
      const routing = await routeCart(cartItems, sql);
      resolvedCartVendor = routing.cartVendor;
      resolvedIsSplitCart = routing.isSplitCart;
      resolvedVendors = Array.from(
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

  // Build cost map from routing results
  const costMap = new Map<string, { cost: number; name: string }>();
  routingResults.forEach((r) => {
    if (r.winner) {
      costMap.set(r.sku, {
        cost: r.winner.offer.cost,
        name: r.sku, // fallback — enrich from your DB if needed
      });
    }
  });

  // Build customer address from Stripe customer details
  const customer = session.customer_details;
  const shippingAddress: CustomerAddress = {
    name: customer?.name ?? "",
    line1: customer?.address?.line1 ?? "",
    line2: customer?.address?.line2 ?? undefined,
    city: customer?.address?.city ?? "",
    state: customer?.address?.state ?? "",
    postalCode: customer?.address?.postal_code ?? "",
    country: customer?.address?.country ?? "US",
    phone: customer?.phone ?? undefined,
  };

  const customerEmail = customer?.email ?? "";
  const placedAt = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Build and submit POs
  // ---------------------------------------------------------------------------
  const poResults = [];

  const vendorsToSubmit: VendorId[] =
    resolvedVendors.length > 0
      ? resolvedVendors
      : [
          ...(vendorPrimary !== "none" ? [vendorPrimary] : []),
          ...(vendorSecondary !== "none" ? [vendorSecondary] : []),
        ];

  for (const vendorId of vendorsToSubmit) {
    const adapter = VENDOR_ADAPTERS.find((a) => a.vendorId === vendorId);
    if (!adapter) {
      console.error(`[webhook] no adapter found for vendor: ${vendorId}`);
      continue;
    }

    // Filter line items for this vendor
    const vendorResults = routingResults.filter(
      (r) => r.winner?.offer.vendor === vendorId
    );

    const poLines: POLineItem[] = vendorResults.map((r) => {
      const stripeItem = lineItems.data.find((li) =>
        li.description?.includes(r.sku)
      );
      return {
        sku: r.sku,
        qty: stripeItem?.quantity ?? 1,
        unitCost: costMap.get(r.sku)?.cost ?? 0,
        unitRetail: (stripeItem?.amount_total ?? 0) / 100,
        name: costMap.get(r.sku)?.name ?? r.sku,
      };
    });

    const shippingOption = JSON.parse(
      vendorId === vendorPrimary
        ? meta.routing_shipping_primary
        : meta.routing_shipping_secondary
    );

    const po: PurchaseOrder = {
      orderId: session.id,
      vendor: vendorId,
      lines: poLines,
      shippingAddress,
      shippingOption,
      customerEmail,
      placedAt,
      metadata: {
        stripe_session_id: session.id,
        routing_strategy: strategy,
        routing_cart_vendor: resolvedCartVendor ?? "none",
        routing_is_split_cart: String(resolvedIsSplitCart),
      },
    };

    const result = await adapter.submitPO(po);
    poResults.push({ vendorId, ...result });

    // Log to Supabase sync_log
    await supabase.from("sync_log").insert({
      vendor: vendorId,
      event: "po_submitted",
      success: result.success,
      vendor_order_id: result.vendorOrderId,
      stripe_session_id: session.id,
      error: result.error ?? null,
      raw_response: result.rawResponse ?? null,
      created_at: placedAt,
    });

    if (!result.success) {
      console.error(`[webhook] PO failed for ${vendorId}:`, result.error);
      // TODO: trigger alert / admin notification
    }
  }

  // Handle backorders — save notification requests
  try {
    const backorders = JSON.parse(meta.routing_backorders ?? "[]");
    if (backorders.length > 0) {
      await supabase.from("stock_notifications").upsert(
        backorders.map((b: any) => ({
          sku: b.sku,
          customer_email: customerEmail,
          restock_date: b.restockDate ?? null,
          added_from: "backorder",
          stripe_session_id: session.id,
          created_at: placedAt,
        })),
        { onConflict: "sku,customer_email" }
      );
    }
  } catch {
    console.error("[webhook] failed to save backorder notifications");
  }

  console.log(`[webhook] checkout.session.completed — strategy: ${strategy}`, poResults);
}
