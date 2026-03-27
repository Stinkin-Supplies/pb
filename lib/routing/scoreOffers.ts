/**
 * lib/routing/scoreOffers.ts
 *
 * Scores and ranks vendor offers for a given cart, applying:
 *   - MAP guard (exclude below-MAP offers)
 *   - Minimum margin floor (exclude < 10%)
 *   - Weighted margin score (40% percent margin / 60% dollar margin)
 *   - Tiebreaker priority: 1. Single-box, 2. Margin, 3. Shipping, 4. Vendor preference
 */

import type {
  VendorId,
  VendorOffer,
  CartLine,
  ScoredOffer,
  RoutingResult,
  ShippingOption,
} from "./types";

// Re-export so callers that import these from scoreOffers.ts continue to work
export type { VendorId, VendorOffer, CartLine, ScoredOffer, RoutingResult };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_MARGIN_PCT = 0.10;          // exclude offers below 10% margin
const MARGIN_WEIGHT_PCT = 0.40;       // 40% of margin score = percent margin
const MARGIN_WEIGHT_DOLLAR = 0.60;    // 60% of margin score = dollar margin

// Final score weights across all dimensions
const SCORE_WEIGHTS = {
  singleBox: 0.35,
  margin: 0.40,
  shipping: 0.20,
  vendor: 0.05,
} as const;

// Vendor preference order (higher = preferred)
const VENDOR_PREFERENCE: Record<VendorId, number> = {
  WPS: 1,
  PU: 0,
};

// ---------------------------------------------------------------------------
// Shipping helpers
// ---------------------------------------------------------------------------

/**
 * Pick the best shipping option for scoring purposes.
 * Prefers lowest cost; breaks ties by fastest transit.
 * Falls back to a neutral placeholder if shippingOptions is empty.
 */
function pickBestShipping(offer: VendorOffer): ShippingOption {
  if (!offer.shippingOptions || offer.shippingOptions.length === 0) {
    return { label: "Standard", carrier: "TBD", transitDays: 5, cost: 0, retailRate: 0 };
  }
  return offer.shippingOptions.reduce((best, opt) =>
    opt.cost < best.cost || (opt.cost === best.cost && opt.transitDays < best.transitDays)
      ? opt
      : best
  );
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function calcMarginPct(retailPrice: number, cost: number, shippingCost: number): number {
  if (retailPrice <= 0) return 0;
  return (retailPrice - cost - shippingCost) / retailPrice;
}

function calcMarginDollars(retailPrice: number, cost: number, shippingCost: number): number {
  return retailPrice - cost - shippingCost;
}

/**
 * Normalize an array of raw values to 0–1 range.
 * If all values are equal, everyone gets 1.0 (no penalty for a single offer).
 */
function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 1);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * Check if a single vendor can fulfill ALL lines in the cart.
 */
function vendorCanFulfillCart(vendor: VendorId, lines: CartLine[]): boolean {
  return lines.every((line) => {
    const offer = line.offers.find((o) => o.vendor === vendor);
    return offer && offer.stockQty >= line.qty;
  });
}

// ---------------------------------------------------------------------------
// MAP guard
// ---------------------------------------------------------------------------

function isMapCompliant(offer: VendorOffer, retailPrice: number): boolean {
  if (offer.mapPrice === null) return true;
  return retailPrice >= offer.mapPrice;
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

export function scoreOffers(lines: CartLine[]): RoutingResult[] {
  // Pre-compute which vendors can fulfill the entire cart (single-box check)
  const allVendors: VendorId[] = ["WPS", "PU"];
  const singleBoxVendors = new Set<VendorId>(
    allVendors.filter((v) => vendorCanFulfillCart(v, lines))
  );

  return lines.map((line) => {
    const { sku, retailPrice, offers } = line;

    // --- Step 1: Score each offer, apply guards ---
    const scored: ScoredOffer[] = offers.map((offer) => {
      const selectedShipping = pickBestShipping(offer);
      const shippingCost = selectedShipping.cost;

      const marginPct = calcMarginPct(retailPrice, offer.cost, shippingCost);
      const marginDollars = calcMarginDollars(retailPrice, offer.cost, shippingCost);

      const base = {
        offer,
        selectedShipping,
        marginPct,
        marginDollars,
        marginScore: 0,
        singleBoxScore: 0,
        shippingScore: 0,
        vendorScore: 0,
        totalScore: 0,
      };

      // MAP guard
      if (!isMapCompliant(offer, retailPrice)) {
        return { ...base, excluded: true, excludeReason: "Below MAP price" };
      }

      // Minimum margin floor
      if (marginPct < MIN_MARGIN_PCT) {
        return {
          ...base,
          excluded: true,
          excludeReason: `Margin ${(marginPct * 100).toFixed(1)}% below minimum ${MIN_MARGIN_PCT * 100}%`,
        };
      }

      // Out of stock
      if (offer.stockQty < line.qty) {
        return {
          ...base,
          excluded: true,
          excludeReason: `Insufficient stock (need ${line.qty}, have ${offer.stockQty})`,
        };
      }

      return {
        ...base,
        singleBoxScore: singleBoxVendors.has(offer.vendor) ? 1 : 0,
        vendorScore: VENDOR_PREFERENCE[offer.vendor],
        excluded: false,
      };
    });

    const eligible = scored.filter((s) => !s.excluded);

    if (eligible.length === 0) {
      return { sku, winner: null, allOffers: scored, backorderInfo: null };
    }

    // --- Step 2: Normalize margin scores across eligible offers ---
    const rawMarginPcts = eligible.map((s) => s.marginPct);
    const rawMarginDollars = eligible.map((s) => s.marginDollars);
    const normPct = normalize(rawMarginPcts);
    const normDollar = normalize(rawMarginDollars);

    eligible.forEach((s, i) => {
      s.marginScore = MARGIN_WEIGHT_PCT * normPct[i] + MARGIN_WEIGHT_DOLLAR * normDollar[i];
    });

    // --- Step 3: Normalize shipping scores (lower days + cost = better) ---
    const rawShipping = eligible.map((s) =>
      s.selectedShipping.transitDays + s.selectedShipping.cost / 10
    );
    const normShippingRaw = normalize(rawShipping);
    const normShipping = normShippingRaw.map((v) => 1 - v); // invert: lower = better

    eligible.forEach((s, i) => {
      s.shippingScore = normShipping[i];
    });

    // --- Step 4: Compute total score ---
    eligible.forEach((s) => {
      s.totalScore =
        SCORE_WEIGHTS.singleBox * s.singleBoxScore +
        SCORE_WEIGHTS.margin * s.marginScore +
        SCORE_WEIGHTS.shipping * s.shippingScore +
        SCORE_WEIGHTS.vendor * s.vendorScore;
    });

    // --- Step 5: Sort by totalScore descending ---
    eligible.sort((a, b) => b.totalScore - a.totalScore);

    const winner = eligible[0];

    // Merge excluded back for full audit trail
    const allOffers = [
      ...eligible,
      ...scored.filter((s) => s.excluded),
    ];

    return { sku, winner, allOffers, backorderInfo: null };
  });
}

// ---------------------------------------------------------------------------
// Convenience: pick the best single vendor for the whole cart (single-box)
// ---------------------------------------------------------------------------

/**
 * After scoring all lines, check if the winning vendor is the same across
 * all lines. If so, return that vendor for a single-box shipment.
 * If split shipment is unavoidable, returns null (caller handles split logic).
 */
export function resolveCartVendor(results: RoutingResult[]): VendorId | null {
  const winners = results
    .map((r) => r.winner?.offer.vendor)
    .filter(Boolean) as VendorId[];

  if (winners.length === 0) return null;
  const unique = new Set(winners);
  return unique.size === 1 ? winners[0] : null;
}

// ---------------------------------------------------------------------------
// Debug helper
// ---------------------------------------------------------------------------

export function debugScoring(results: RoutingResult[]): void {
  for (const result of results) {
    console.log(`\nSKU: ${result.sku}`);
    if (!result.winner) {
      console.log("  ❌ No eligible offers");
      continue;
    }
    for (const s of result.allOffers) {
      const flag = s.excluded ? "❌" : s === result.winner ? "✅" : "  ";
      console.log(
        `  ${flag} ${s.offer.vendor.padEnd(4)} | ` +
        `margin: ${(s.marginPct * 100).toFixed(1)}% ($${s.marginDollars.toFixed(2)}) | ` +
        `shipping: ${s.selectedShipping.transitDays}d $${s.selectedShipping.cost.toFixed(2)} | ` +
        `score: ${s.totalScore.toFixed(3)}` +
        (s.excluded ? ` | EXCLUDED: ${s.excludeReason}` : "")
      );
    }
  }
}