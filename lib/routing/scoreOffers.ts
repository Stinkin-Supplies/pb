/**
 * lib/routing/scoreOffers.ts
 *
 * Vendor routing engine.
 * All types come from ./types.ts — do not redefine them here.
 *
 * Two exports consumed by the app:
 *   scoreOffers(lines)        → RoutingResult[]   (one per cart line)
 *   resolveCartVendor(results)→ VendorId | null   (single vendor or null = split)
 *
 * Fee rules:
 *   WPS Flat Rate Drop Ship Program (effective 10/14/2024)
 *   Parts Unlimited / LeMans Drop Ship Program (effective 1/1/2024)
 */

import type {
  VendorId,
  VendorOffer,
  CartLine,
  RoutingResult,
  ScoredOffer,
  ShippingOption,
  BackorderInfo,
} from './types';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Minimum acceptable margin — below this the offer is excluded. */
const MIN_MARGIN_PCT = 0.10;

/**
 * Composite score weights — must sum to 1.0.
 * Tuned to favour margin while still rewarding speed + single-vendor.
 */
const W = {
  margin:      0.40,   // profit margin % (highest priority)
  speed:       0.35,   // ground transit days (faster = higher score)
  singleBox:   0.20,   // single vendor = 1.0, can't fulfil all items = fraction
  vendorPref:  0.05,   // WPS: live API → slightly preferred over PU file-feed
} as const;

// ─── Fee calculator ───────────────────────────────────────────────────────────

/**
 * Per-order drop-ship fee for each vendor program.
 * Call once per item; divide by items-on-same-PO to allocate the shared fee.
 *
 * WPS: $9.75 flat per order (exceptions for tires, large items, etc.)
 * PU:  $9.75 flat per order (ebike and overweight items differ)
 */
export function calcDropShipFee(
  vendor: VendorId,
  _offer: VendorOffer,
): number {
  // $10 flat per order from both WPS and PU (confirmed April 2026).
  // This is a per-ORDER fee — divide by number of items on the same PO
  // to allocate correctly across line items (done in scoreOneOffer).
  void vendor; // both vendors same rate for now
  return 10.00;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the cheapest ground shipping option from the offer.
 * Falls back to a safe default if the vendor returned no options.
 */
function pickShipping(offer: VendorOffer): ShippingOption {
  if (offer.shippingOptions.length === 0) {
    return {
      label:       'Ground',
      carrier:     'UPS',
      transitDays: 5,
      cost:        10.00,
      retailRate:  0,
    };
  }
  return [...offer.shippingOptions].sort((a, b) => a.cost - b.cost)[0];
}

/**
 * Determine whether an offer is excluded from routing, and why.
 */
function checkExclusion(
  offer: VendorOffer,
  marginPct: number,
): { excluded: boolean; reason?: string } {
  if (offer.status === 'unavailable') {
    return { excluded: true, reason: 'unavailable — not carried or discontinued' };
  }
  if (offer.stockQty <= 0 && offer.status !== 'backorder') {
    return { excluded: true, reason: 'out of stock with no backorder ETA' };
  }
  if (marginPct < MIN_MARGIN_PCT) {
    return {
      excluded: true,
      reason: `margin ${(marginPct * 100).toFixed(1)}% below floor ${(MIN_MARGIN_PCT * 100).toFixed(0)}%`,
    };
  }
  return { excluded: false };
}

// ─── Single-offer scorer ──────────────────────────────────────────────────────

function scoreOneOffer(
  offer: VendorOffer,
  line: CartLine,
  allOffersForLine: VendorOffer[],
  /** How many cart lines each vendor can fulfil (for consolidation score) */
  vendorFillCount: Record<string, number>,
  totalLines: number,
): ScoredOffer {
  const shipping      = pickShipping(offer);
  const fee           = calcDropShipFee(offer.vendor, offer);
  // Drop-ship fee is per order — divide by items going to this vendor to share it
  const feePerUnit    = fee / Math.max(vendorFillCount[offer.vendor] ?? 1, 1);
  const trueCost      = offer.cost + feePerUnit;
  const marginDollars = (offer.retailPrice - trueCost) * line.qty;
  const marginPct     = offer.retailPrice > 0
    ? (offer.retailPrice - trueCost) / offer.retailPrice
    : 0;

  const { excluded, reason } = checkExclusion(offer, marginPct);

  if (excluded) {
    return {
      offer,
      selectedShipping: shipping,
      marginPct,
      marginDollars,
      marginScore:   0,
      singleBoxScore: 0,
      shippingScore: 0,
      vendorScore:   0,
      totalScore:    0,
      excluded:      true,
      excludeReason: reason,
    };
  }

  // --- Scoring sub-components (all normalised 0 → 1) ---

  // Margin: normalise to 50 % ceiling (above 50 % we treat as equally good)
  const marginScore = Math.min(Math.max(marginPct, 0) / 0.5, 1);

  // Speed: fastest offer on this line scores 1; slowest scores 0
  const maxTransit = Math.max(
    ...allOffersForLine.map(o => pickShipping(o).transitDays),
    1,
  );
  const shippingScore = maxTransit > 0
    ? 1 - (shipping.transitDays / maxTransit)
    : 1;

  // Consolidation: fraction of cart lines this vendor can handle
  const singleBoxScore = totalLines > 0
    ? (vendorFillCount[offer.vendor] ?? 0) / totalLines
    : 0;

  // Vendor preference: WPS has live API → slightly higher base score
  const vendorScore = offer.vendor === 'WPS' ? 1.0 : 0.6;

  const totalScore =
    marginScore    * W.margin +
    shippingScore  * W.speed  +
    singleBoxScore * W.singleBox +
    vendorScore    * W.vendorPref;

  return {
    offer,
    selectedShipping: shipping,
    marginPct,
    marginDollars,
    marginScore,
    singleBoxScore,
    shippingScore,
    vendorScore,
    totalScore,
    excluded: false,
  };
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * scoreOffers
 *
 * For each cart line, scores every available vendor offer, picks the best
 * (winner) and returns the full scored set for display in the checkout UI.
 *
 * Synchronous — no DB or API calls inside; callers fetch offers first.
 */
export function scoreOffers(lines: CartLine[]): RoutingResult[] {
  // Build fill-count: how many lines each vendor has at least one available offer for
  const vendorFillCount: Record<string, number> = {};
  for (const line of lines) {
    const seen = new Set<string>();
    for (const offer of line.offers) {
      if (offer.status !== 'unavailable' && !seen.has(offer.vendor)) {
        seen.add(offer.vendor);
        vendorFillCount[offer.vendor] = (vendorFillCount[offer.vendor] ?? 0) + 1;
      }
    }
  }
  const totalLines = lines.length;

  return lines.map((line): RoutingResult => {
    const allScored: ScoredOffer[] = line.offers.map(offer =>
      scoreOneOffer(offer, line, line.offers, vendorFillCount, totalLines),
    );

    // Sort: qualified first, then by score descending
    const sorted = [...allScored].sort((a, b) => {
      if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
      return b.totalScore - a.totalScore;
    });

    const winner  = sorted.find(s => !s.excluded) ?? null;

    const backorderInfo: BackorderInfo | null =
      winner?.offer.status === 'backorder'
        ? {
            sku:             line.sku,
            vendor:          winner.offer.vendor,
            restockDate:     winner.offer.restockDate,
            notifyCustomer:  true,
          }
        : null;

    return {
      sku: line.sku,
      winner,
      allOffers: sorted,
      backorderInfo,
    };
  });
}

/**
 * resolveCartVendor
 *
 * Returns the single VendorId if every winning offer in the cart goes to one
 * vendor (single-box fulfillment). Returns null when a split order is needed.
 */
export function resolveCartVendor(results: RoutingResult[]): VendorId | null {
  const vendors = new Set<VendorId>();
  for (const r of results) {
    if (r.winner) vendors.add(r.winner.offer.vendor);
  }
  if (vendors.size === 1) return Array.from(vendors)[0] as VendorId;
  return null;
}
