/**
 * app/api/routing/offers/route.ts
 *
 * POST /api/routing/offers
 *
 * Accepts a cart, fetches live inventory from PU + WPS in parallel,
 * builds CartLine[] with offers, runs scoreOffers(), returns ranked results.
 *
 * Body:
 * {
 *   items: { sku: string; qty: number; retailPrice: number }[]
 * }
 *
 * Response:
 * {
 *   results: RoutingResult[]
 *   cartVendor: VendorId | null   // single-box vendor if possible
 *   splitRequired: boolean
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { scoreOffers, resolveCartVendor } from "@/lib/routing/scoreOffers";
import type { CartLine, VendorOffer, VendorId } from "@/lib/routing/types";

// ---------------------------------------------------------------------------
// Vendor inventory adapters
// Swap these out for real SDK / HTTP calls to PU + WPS APIs
// ---------------------------------------------------------------------------

interface RawVendorItem {
  sku: string;
  cost: number;
  mapPrice: number | null;
  stockQty: number;
  shippingDays: number;
  shippingCost: number;
}

async function fetchWpsInventory(skus: string[]): Promise<RawVendorItem[]> {
  // TODO: replace with real WPS API call
  // Example shape — WPS returns items keyed by item_number
  //
  // const res = await fetch(`https://api.wps-inc.com/items?itemNumbers=${skus.join(",")}`, {
  //   headers: { Authorization: `Bearer ${process.env.WPS_API_KEY}` },
  // });
  // const data = await res.json();
  // return data.data.map((item: any) => ({
  //   sku: item.item_number,
  //   cost: parseFloat(item.dealer_price),
  //   mapPrice: item.map_price ? parseFloat(item.map_price) : null,
  //   stockQty: item.inventory?.total ?? 0,
  //   shippingDays: 2,
  //   shippingCost: estimateShipping(item),
  // }));

  // Stub — returns empty until wired
  return skus.map((sku) => ({
    sku,
    cost: 0,
    mapPrice: null,
    stockQty: 0,
    shippingDays: 2,
    shippingCost: 8.99,
  }));
}

async function fetchPuInventory(skus: string[]): Promise<RawVendorItem[]> {
  // TODO: replace with real Parts Unlimited API call
  // PU uses a SOAP/REST endpoint — adjust as needed
  //
  // const res = await fetch(`${process.env.PU_API_BASE}/inventory`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/json",
  //     Authorization: `Bearer ${process.env.PU_API_KEY}`,
  //   },
  //   body: JSON.stringify({ partNumbers: skus }),
  // });
  // const data = await res.json();
  // return data.items.map((item: any) => ({
  //   sku: item.partNumber,
  //   cost: item.dealerPrice,
  //   mapPrice: item.mapPrice ?? null,
  //   stockQty: item.quantityAvailable,
  //   shippingDays: item.leadTimeDays ?? 3,
  //   shippingCost: estimateShipping(item),
  // }));

  // Stub — returns empty until wired
  return skus.map((sku) => ({
    sku,
    cost: 0,
    mapPrice: null,
    stockQty: 0,
    shippingDays: 3,
    shippingCost: 9.99,
  }));
}

// ---------------------------------------------------------------------------
// Build CartLine[] by merging retail cart + vendor inventory responses
// ---------------------------------------------------------------------------

function buildCartLines(
  items: { sku: string; qty: number; retailPrice: number; name?: string }[],
  wpsItems: RawVendorItem[],
  puItems: RawVendorItem[]
): CartLine[] {
  const wpsMap = new Map(wpsItems.map((i) => [i.sku, i]));
  const puMap  = new Map(puItems.map((i) => [i.sku, i]));

  return items.map(({ sku, qty, retailPrice, name }) => {
    const offers: VendorOffer[] = [];

    const wps = wpsMap.get(sku);
    if (wps) {
      offers.push({
        vendor:       "WPS" as VendorId,
        sku,
        cost:         wps.cost,
        mapPrice:     wps.mapPrice,
        retailPrice,
        stockQty:     wps.stockQty,
        status:       wps.stockQty > 0 ? "available" : "backorder",
        restockDate:  null,
        shippingOptions: wps.shippingDays != null ? [{
          label:       "Standard",
          carrier:     "UPS",
          transitDays: wps.shippingDays,
          cost:        wps.shippingCost ?? 0,
          retailRate:  0,
        }] : [],
      });
    }

    const pu = puMap.get(sku);
    if (pu) {
      offers.push({
        vendor:       "PU" as VendorId,
        sku,
        cost:         pu.cost,
        mapPrice:     pu.mapPrice,
        retailPrice,
        stockQty:     pu.stockQty,
        status:       pu.stockQty > 0 ? "available" : "backorder",
        restockDate:  null,
        shippingOptions: pu.shippingDays != null ? [{
          label:       "Standard",
          carrier:     "UPS",
          transitDays: pu.shippingDays,
          cost:        pu.shippingCost ?? 0,
          retailRate:  0,
        }] : [],
      });
    }
    const resolvedName = name ?? sku;
    
    return { sku, qty, retailPrice, name: resolvedName, offers };
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: { items: { sku: string; qty: number; retailPrice: number }[] };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items[] required" }, { status: 400 });
  }

  // Validate each item
  for (const item of items) {
    if (!item.sku || typeof item.qty !== "number" || typeof item.retailPrice !== "number") {
      return NextResponse.json(
        { error: "Each item needs sku (string), qty (number), retailPrice (number)" },
        { status: 400 }
      );
    }
  }

  const skus = items.map((i) => i.sku);

  // Fetch both vendors in parallel
  const [wpsItems, puItems] = await Promise.allSettled([
    fetchWpsInventory(skus),
    fetchPuInventory(skus),
  ]);

  const wpsData = wpsItems.status === "fulfilled" ? wpsItems.value : [];
  const puData = puItems.status === "fulfilled" ? puItems.value : [];

  // Log vendor fetch failures but don't hard-fail the route
  if (wpsItems.status === "rejected") {
    console.error("[routing/offers] WPS fetch failed:", wpsItems.reason);
  }
  if (puItems.status === "rejected") {
    console.error("[routing/offers] PU fetch failed:", puItems.reason);
  }

  // Build cart lines and score
  const lines = buildCartLines(items, wpsData, puData);
  const results = scoreOffers(lines);
  const cartVendor = resolveCartVendor(results);
  const splitRequired = cartVendor === null;

  // Summarize any unfulfillable SKUs
  const unroutable = results
    .filter((r) => r.winner === null)
    .map((r) => r.sku);

  return NextResponse.json({
    results,
    cartVendor,
    splitRequired,
    unroutable,
    vendorFetchStatus: {
      wps: wpsItems.status,
      pu: puItems.status,
    },
  });
}