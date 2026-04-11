/**
 * lib/routing/scoreOffers.ts
 *
 * Scores and ranks vendor fulfillment options for a customer cart.
 *
 * Fee rules sourced from:
 *   - WPS Flat Rate Drop Ship Program (effective 10/14/2024)
 *   - Parts Unlimited / LeMans Drop Ship Program (effective 1/1/2024)
 *
 * MIN_MARGIN_PCT is loaded from the DB (routing_config table) so it can
 * be changed from the admin dashboard without a code deploy.
 */

import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VendorId = 'WPS' | 'PU';

/** Raw freight category flags — populated from catalog_products at load time */
export interface FreightFlags {
  isTruckOnly: boolean;
  isMotoTire: boolean;
  isAtvTireUnder50lbs: boolean;
  isAtvTireOver50lbs: boolean;
  isAtvWheelKit: boolean;       // WPS only: 1 tire + 1 wheel
  isLargeItem: boolean;         // WPS large-item list
  isEbike: boolean;             // PU only
  dimensionalWeightLbs: number; // used for PU 40-lb overweight check
}

/** One vendor's offer for a single product */
export interface VendorOffer {
  vendor: VendorId;
  vendorSku: string;
  dealerCost: number;           // your cost from this vendor
  sellPrice: number;            // computed_price shown to customer
  mapPrice: number | null;
  inStock: boolean;
  qtyAvailable: number;
  warehouseCode: string;        // e.g. 'Boise', 'Wisconsin'
  warehouseState: string;       // 2-letter state code
  estimatedTransitDays: number; // ground transit days to customer zip
  backorderDays: number;        // 0 = in stock, >0 = estimated wait
  freight: FreightFlags;
}

/** One line in the customer's cart */
export interface CartLine {
  productId: number;
  ourSku: string;               // internal SKU e.g. "ENG-100142"
  quantity: number;
  sellPrice: number;
  offers: VendorOffer[];
}

/** Result of scoring a single offer after fees */
export interface ScoredOffer extends VendorOffer {
  dropShipFee: number;          // fee charged by vendor for this item
  feeShare: number;             // allocated share (fee / items on same PO)
  trueCost: number;             // dealerCost + feeShare
  profit: number;               // sellPrice - trueCost
  marginPct: number;            // profit / sellPrice
  score: number;                // composite routing score (higher = better)
  disqualified: boolean;
  disqualifyReason?: string;
}

/** Best option selected per cart line */
export interface RoutingDecision {
  cartLine: CartLine;
  standard: ScoredOffer;        // highest score — pre-selected default
  fastest: ScoredOffer | null;  // lowest transit days (may equal standard)
  allScored: ScoredOffer[];
}

/** Final cart-level routing result */
export interface RoutingResult {
  decisions: RoutingDecision[];
  vendorCount: number;
  isSplitOrder: boolean;
  totalDropShipFees: number;
  totalProfit: number;
  totalMarginPct: number;
  expressAvailable: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Fallback if DB config is unavailable */
const DEFAULT_MIN_MARGIN_PCT = 0.10;

/** Backorder threshold — offers with longer wait are deprioritized */
const BACKORDER_DEPRIORITIZE_DAYS = 14;

/**
 * WPS warehouse → US state mapping.
 * Used for zone-based transit day estimation.
 */
const WPS_WAREHOUSES: Record<string, string> = {
  Boise: 'ID',
  Fresno: 'CA',
  Ashley: 'IN',
  Elizabethtown: 'PA',
  Midlothian: 'TX',
  Midway: 'GA',
};

/**
 * PU / LeMans warehouse → US state mapping.
 */
const PU_WAREHOUSES: Record<string, string> = {
  Wisconsin: 'WI',
  'New York': 'NY',
  Texas: 'TX',
  Nevada: 'NV',
  'North Carolina': 'NC',
};

// ─── Fee Calculator ───────────────────────────────────────────────────────────

/**
 * Returns the drop-ship fee WPS or PU charges for a single item.
 *
 * Both vendors charge per ORDER (not per carton / per SKU count).
 * Special categories override the flat $9.75 with per-ITEM rates.
 *
 * The caller divides this by the number of items routed to the same vendor
 * to allocate the shared fee correctly across line items.
 */
export function calcDropShipFee(vendor: VendorId, flags: FreightFlags): number {
  if (vendor === 'WPS') {
    if (flags.isEbike)              return 0;     // WPS doesn't list ebike rate
    if (flags.isLargeItem)          return 35.00; // per item, replaces flat rate
    if (flags.isAtvWheelKit)        return 22.00; // per kit
    if (flags.isAtvTireOver50lbs)   return 35.00; // per item
    if (flags.isAtvTireUnder50lbs)  return 18.00; // per item
    if (flags.isMotoTire)           return 9.75;  // per tire
    return 9.75;                                  // standard: per order
  }

  if (vendor === 'PU') {
    if (flags.isEbike)              return 249.95; // all-in: freight+insurance+sig
    if (flags.isAtvTireOver50lbs)   return 18.00 + 33.00; // $18 + overweight
    if (flags.isAtvTireUnder50lbs)  return 18.00;
    if (flags.dimensionalWeightLbs >= 40) return 9.75 + 33.00; // overweight surcharge
    return 9.75;                                  // standard: per order
  }

  return 9.75; // safe fallback
}

// ─── Config Loader ────────────────────────────────────────────────────────────

/**
 * Loads MIN_MARGIN_PCT from the routing_config table in Supabase.
 * Admin dashboard writes to this table — no code deploy needed to adjust.
 *
 * Schema (run this migration if not yet created):
 *
 *   CREATE TABLE routing_config (
 *     key   TEXT PRIMARY KEY,
 *     value TEXT NOT NULL,
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   INSERT INTO routing_config (key, value)
 *   VALUES ('min_margin_pct', '0.10');
 */
async function loadMinMarginPct(supabase: ReturnType<typeof createClient>): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('routing_config')
      .select('value')
      .eq('key', 'min_margin_pct')
      .single();

    if (error || !data) return DEFAULT_MIN_MARGIN_PCT;

    const parsed = parseFloat(data.value);
    return isNaN(parsed) ? DEFAULT_MIN_MARGIN_PCT : parsed;
  } catch {
    return DEFAULT_MIN_MARGIN_PCT;
  }
}

// ─── Disqualification Checks ──────────────────────────────────────────────────

function disqualifyOffer(
  offer: VendorOffer,
  customerState: string,
  minMarginPct: number,
  preliminaryMargin: number
): { disqualified: boolean; reason?: string } {
  // Truck Only — neither vendor ships these
  if (offer.freight.isTruckOnly) {
    return { disqualified: true, reason: 'Truck Only — not eligible for drop ship' };
  }

  // Geographic restrictions — no AK, HI, PR, APO/FPO
  const blocked = ['AK', 'HI', 'PR', 'VI', 'GU', 'AS', 'MP'];
  if (blocked.includes(customerState)) {
    return { disqualified: true, reason: `${customerState} not eligible for drop ship` };
  }

  // Out of stock with no backorder ETA
  if (!offer.inStock && offer.backorderDays === 0) {
    return { disqualified: true, reason: 'Out of stock, no ETA' };
  }

  // Below margin floor
  if (preliminaryMargin < minMarginPct) {
    return {
      disqualified: true,
      reason: `Margin ${(preliminaryMargin * 100).toFixed(1)}% below floor ${(minMarginPct * 100).toFixed(0)}%`,
    };
  }

  return { disqualified: false };
}

// ─── Composite Score ──────────────────────────────────────────────────────────

/**
 * Composite score weights — tuned to favor profit while ensuring
 * reasonable speed and single-vendor consolidation.
 *
 * Weights must sum to 1.0.
 */
const WEIGHTS = {
  margin:          0.40,  // your profit margin % (highest priority)
  speed:           0.35,  // transit days (faster = better)
  consolidation:   0.20,  // single vendor = 1.0, split = 0.5
  vendorPreferred: 0.05,  // WPS preferred (live API for inventory checks)
};

function compositeScore(params: {
  marginPct: number;
  estimatedTransitDays: number;
  isConsolidated: boolean;
  vendor: VendorId;
  backorderDays: number;
  maxDaysAcrossCart: number;
  maxMarginAcrossCart: number;
}): number {
  const {
    marginPct, estimatedTransitDays, isConsolidated,
    vendor, backorderDays, maxDaysAcrossCart, maxMarginAcrossCart,
  } = params;

  // Normalize margin 0–1 relative to best available option
  const marginScore = maxMarginAcrossCart > 0
    ? Math.min(marginPct / maxMarginAcrossCart, 1)
    : 0;

  // Normalize speed 0–1 (fastest = 1)
  const speedScore = maxDaysAcrossCart > 0
    ? 1 - (estimatedTransitDays / maxDaysAcrossCart)
    : 1;

  // Consolidation bonus
  const consolidationScore = isConsolidated ? 1.0 : 0.5;

  // Vendor preference: WPS has live API, PU is file-based
  const vendorScore = vendor === 'WPS' ? 1.0 : 0.0;

  // Heavy backorder penalty
  const backorderMultiplier = backorderDays > BACKORDER_DEPRIORITIZE_DAYS ? 0.1 : 1.0;

  const raw = (marginScore          * WEIGHTS.margin)
            + (speedScore           * WEIGHTS.speed)
            + (consolidationScore   * WEIGHTS.consolidation)
            + (vendorScore          * WEIGHTS.vendorPreferred);

  return raw * backorderMultiplier;
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

/**
 * scoreOffers()
 *
 * For each line in the cart, scores every available vendor offer.
 * Selects the "standard" option (highest composite score = best for you)
 * and the "fastest" option (lowest transit days, still above margin floor).
 *
 * @param cartLines   - loaded from loadCartLines.ts
 * @param customerState - 2-letter US state code from shipping address
 * @param supabase    - Supabase client for config + nexus checks
 */
export async function scoreOffers(
  cartLines: CartLine[],
  customerState: string,
  supabase: ReturnType<typeof createClient>
): Promise<RoutingResult> {
  const minMarginPct = await loadMinMarginPct(supabase);

  // Build a map of vendor → item count for fee sharing
  // We'll compute this per combo, but initialize with all offers first
  const vendorItemCount: Record<VendorId, number> = { WPS: 0, PU: 0 };

  // First pass: figure out which vendors have all items
  // (optimistic: try to consolidate on one vendor)
  for (const line of cartLines) {
    for (const offer of line.offers) {
      if (offer.inStock) vendorItemCount[offer.vendor]++;
    }
  }

  const decisions: RoutingDecision[] = [];
  const selectedVendors = new Set<VendorId>();

  for (const line of cartLines) {
    const allScored: ScoredOffer[] = [];

    // Collect max values for normalization
    let maxTransitDays = 0;
    let maxMarginPct   = 0;

    // Pre-compute margins for normalization
    const premargins: { offer: VendorOffer; margin: number }[] = [];

    for (const offer of line.offers) {
      const rawFee = calcDropShipFee(offer.vendor, offer.freight);
      // Fee is per order — if multiple items on same PO, it's shared
      // Use 1 as conservative estimate here; recalculated after routing
      const feeShare = rawFee;
      const trueCost = offer.dealerCost + feeShare;
      const profit   = (offer.sellPrice * line.quantity) - (trueCost * line.quantity);
      const margin   = (offer.sellPrice - trueCost) / offer.sellPrice;

      premargins.push({ offer, margin });
      maxTransitDays = Math.max(maxTransitDays, offer.estimatedTransitDays);
      maxMarginPct   = Math.max(maxMarginPct, margin);
    }

    for (const { offer, margin: prelimMargin } of premargins) {
      const rawFee  = calcDropShipFee(offer.vendor, offer.freight);
      const feeShare = rawFee;
      const trueCost = offer.dealerCost + feeShare;
      const profit   = (offer.sellPrice - trueCost) * line.quantity;
      const marginPct = (offer.sellPrice - trueCost) / offer.sellPrice;

      const { disqualified, reason } = disqualifyOffer(
        offer, customerState, minMarginPct, prelimMargin
      );

      const score = disqualified ? -1 : compositeScore({
        marginPct,
        estimatedTransitDays: offer.estimatedTransitDays,
        isConsolidated: true, // simplified — full combo scoring below
        vendor: offer.vendor,
        backorderDays: offer.backorderDays,
        maxDaysAcrossCart: maxTransitDays,
        maxMarginAcrossCart: maxMarginPct,
      });

      allScored.push({
        ...offer,
        dropShipFee: rawFee,
        feeShare,
        trueCost,
        profit,
        marginPct,
        score,
        disqualified,
        disqualifyReason: reason,
      });
    }

    // Sort: qualified first, by score descending
    allScored.sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      return b.score - a.score;
    });

    const qualified = allScored.filter(o => !o.disqualified);

    // "Standard" = highest score (best margin + reasonable speed)
    const standard = qualified[0] ?? allScored[0];

    // "Fastest" = lowest transit days among qualified, if different from standard
    const fastestCandidate = qualified
      .slice()
      .sort((a, b) => a.estimatedTransitDays - b.estimatedTransitDays)[0] ?? null;

    const fastest = (
      fastestCandidate &&
      fastestCandidate.vendorSku !== standard.vendorSku
    ) ? fastestCandidate : null;

    if (standard) selectedVendors.add(standard.vendor);

    decisions.push({ cartLine: line, standard, fastest, allScored });
  }

  // Cart-level aggregates
  const isSplitOrder   = selectedVendors.size > 1;
  const totalFees      = decisions.reduce((s, d) => s + (d.standard?.feeShare ?? 0), 0);
  const totalProfit    = decisions.reduce((s, d) => s + (d.standard?.profit ?? 0), 0);
  const totalRevenue   = cartLines.reduce((s, l) => s + l.sellPrice * l.quantity, 0);
  const totalMarginPct = totalRevenue > 0 ? totalProfit / totalRevenue : 0;

  // Express is available if any standard option has a non-backorder in-stock offer
  const expressAvailable = decisions.every(d => d.standard?.inStock);

  return {
    decisions,
    vendorCount: selectedVendors.size,
    isSplitOrder,
    totalDropShipFees: totalFees,
    totalProfit,
    totalMarginPct,
    expressAvailable,
  };
}

// ─── Admin Config Helpers ─────────────────────────────────────────────────────

/**
 * Update the margin floor from the admin dashboard.
 * Persists to routing_config — takes effect immediately on next order.
 *
 * @param pct - decimal e.g. 0.12 for 12%
 */
export async function setMinMarginPct(
  supabase: ReturnType<typeof createClient>,
  pct: number
): Promise<void> {
  if (pct < 0 || pct > 1) throw new Error('Margin must be between 0 and 1');

  const { error } = await supabase
    .from('routing_config')
    .upsert({ key: 'min_margin_pct', value: pct.toString(), updated_at: new Date().toISOString() });

  if (error) throw error;
}

/**
 * Read the current margin floor — used by admin dashboard display.
 */
export async function getMinMarginPct(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  return loadMinMarginPct(supabase);
}

// ─── DB Migration (run once) ──────────────────────────────────────────────────

/**
 * SQL to run in Supabase SQL editor to create the config table:
 *
 * CREATE TABLE IF NOT EXISTS routing_config (
 *   key        TEXT PRIMARY KEY,
 *   value      TEXT NOT NULL,
 *   label      TEXT,
 *   updated_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * INSERT INTO routing_config (key, value, label) VALUES
 *   ('min_margin_pct',         '0.10',  'Minimum margin floor (decimal, e.g. 0.10 = 10%)'),
 *   ('express_markup_min',     '3.00',  'Minimum markup added to actual Express freight cost'),
 *   ('express_markup_pct',     '0.10',  'Percentage markup on Express freight (whichever is higher)'),
 *   ('backorder_cutoff_days',  '14',    'Deprioritize offers with backorder longer than this many days'),
 *   ('consolidation_weight',   '0.20',  'Routing score weight for single-vendor consolidation (0–1)'),
 *   ('margin_weight',          '0.40',  'Routing score weight for margin (0–1)'),
 *   ('speed_weight',           '0.35',  'Routing score weight for transit speed (0–1)')
 * ON CONFLICT (key) DO NOTHING;
 */
