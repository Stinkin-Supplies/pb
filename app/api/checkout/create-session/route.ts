import { NextResponse } from "next/server";
import Stripe from "stripe";
import { scoreOffers, resolveCartVendor } from "@/lib/routing/scoreOffers";
import { wpsAdapter } from "@/lib/vendors/wps/adapter";
import { puAdapter } from "@/lib/vendors/pu/adapter";
import type {
  CartItem,
  CartLine,
  ResolvedCart,
  StripeRoutingMetadata,
  BackorderInfo,
  ShippingOption,
} from "@/lib/routing/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ---------------------------------------------------------------------------
// Vendor registry — add new vendors here only
// ---------------------------------------------------------------------------

const VENDOR_ADAPTERS = [wpsAdapter, puAdapter];

// ---------------------------------------------------------------------------
// resolveCart — call before stripe.checkout.sessions.create()
// ---------------------------------------------------------------------------

export async function resolveCart(items: CartItem[]): Promise<ResolvedCart> {
  const skus = items.map((i) => i.sku);
  const retailPrices = Object.fromEntries(items.map((i) => [i.sku, i.retailPrice]));

  // Fetch all vendors in parallel
  const allOfferArrays = await Promise.allSettled(
    VENDOR_ADAPTERS.map((adapter) => adapter.fetchOffers(skus, retailPrices))
  );

  // Build CartLine[] — one per SKU, with all vendor offers attached
  const offersByVendor = VENDOR_ADAPTERS.map((adapter, i) => ({
    vendorId: adapter.vendorId,
    offers:
      allOfferArrays[i].status === "fulfilled" ? allOfferArrays[i].value : [],
  }));

  const lines: CartLine[] = items.map((item) => {
    const offers = offersByVendor.flatMap(({ offers }) =>
      offers.filter((o) => o.sku === item.sku)
    );
    return { ...item, offers };
  });

  // Score
  const results = scoreOffers(lines);
  const cartVendor = resolveCartVendor(results);
  const splitRequired = cartVendor === null;

  // Collect backorders
  const backorders: BackorderInfo[] = results
    .filter((r) => r.winner === null)
    .flatMap((r) =>
      r.allOffers
        .filter((s) => s.offer.status === "backorder")
        .map((s) => ({
          sku: r.sku,
          vendor: s.offer.vendor,
          restockDate: s.offer.restockDate,
          notifyCustomer: true,
        }))
    );

  const unroutable = results
    .filter((r) => r.winner === null && backorders.every((b) => b.sku !== r.sku))
    .map((r) => r.sku);

  // Determine strategy
  const strategy = unroutable.length > 0
    ? "partial"
    : backorders.length > 0
    ? "backorder"
    : splitRequired
    ? "split"
    : "single_box";

  // Best shipping per vendor (cheapest ground by default — customer can upgrade in CartDrawer)
  const vendorPrimary = cartVendor ?? (results[0]?.winner?.offer.vendor ?? null);
  const vendorSecondary = splitRequired
    ? (results.find((r) => r.winner?.offer.vendor !== vendorPrimary)?.winner?.offer.vendor ?? null)
    : null;

  const defaultShipping = (vendorId: string | null): ShippingOption | null => {
    if (!vendorId) return null;
    const firstWinner = results.find((r) => r.winner?.offer.vendor === vendorId);
    const opts = firstWinner?.winner?.offer.shippingOptions ?? [];
    return opts.sort((a, b) => a.cost - b.cost)[0] ?? null;
  };

  const selectedShippingByVendor: Record<string, ShippingOption | null> = {};
  if (vendorPrimary) selectedShippingByVendor[vendorPrimary] = defaultShipping(vendorPrimary);
  if (vendorSecondary) selectedShippingByVendor[vendorSecondary] = defaultShipping(vendorSecondary);

  return {
    strategy,
    vendorPrimary,
    vendorSecondary,
    results,
    backorders,
    unroutable,
    selectedShippingByVendor,
  };
}

// ---------------------------------------------------------------------------
// buildStripeMetadata — call with resolvedCart before session.create()
// ---------------------------------------------------------------------------

export function buildStripeMetadata(cart: ResolvedCart): StripeRoutingMetadata {
  // Stripe metadata values max 500 chars — truncate results if large cart
  const resultsJson = JSON.stringify(cart.results);
  const truncated = resultsJson.length > 450
    ? JSON.stringify(cart.results.map((r) => ({ sku: r.sku, vendor: r.winner?.offer.vendor })))
    : resultsJson;

  return {
    routing_strategy: cart.strategy,
    routing_vendor_primary: cart.vendorPrimary ?? "none",
    routing_vendor_secondary: cart.vendorSecondary ?? "none",
    routing_shipping_primary: JSON.stringify(
      cart.vendorPrimary ? cart.selectedShippingByVendor[cart.vendorPrimary] ?? {} : {}
    ),
    routing_shipping_secondary: cart.vendorSecondary
      ? JSON.stringify(cart.selectedShippingByVendor[cart.vendorSecondary] ?? {})
      : "none",
    routing_results: truncated,
    routing_backorders: JSON.stringify(cart.backorders),
    routing_unroutable: JSON.stringify(cart.unroutable),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = body?.order_id;
    const amountCents = Number(body?.amount_cents ?? 0);
    const amountDollars = Number(body?.amount ?? 0);
    const resolvedAmountCents =
      Number.isFinite(amountCents) && amountCents > 0
        ? amountCents
        : Math.round(amountDollars * 100);

    if (
      !orderId ||
      !Number.isFinite(resolvedAmountCents) ||
      resolvedAmountCents <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    const items: CartItem[] = Array.isArray(body?.items) ? body.items : [];
    const routingMeta = items.length > 0
      ? buildStripeMetadata(await resolveCart(items))
      : ({} as StripeRoutingMetadata);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Order",
            },
            unit_amount: Math.round(resolvedAmountCents),
          },
          quantity: 1,
        },
      ],
      success_url: `${
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
      }/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${
        process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"
      }/checkout`,
      metadata: {
        order_id: String(orderId),
        ...routingMeta,
      },
      payment_intent_data: {
        metadata: {
          order_id: String(orderId),
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
