/**
 * lib/routing/types.ts
 *
 * Shared types for the vendor-agnostic routing + PO system.
 * All vendor adapters, the routing engine, checkout, and webhook
 * communicate through these interfaces.
 */

// ---------------------------------------------------------------------------
// Vendor registry
// ---------------------------------------------------------------------------

export type VendorId = "WPS" | "PU"; // extend as new vendors onboard

// ---------------------------------------------------------------------------
// Offer & inventory
// ---------------------------------------------------------------------------

export type OfferStatus =
  | "available"       // in stock, ready to route
  | "split"           // available but requires multi-vendor fulfillment
  | "backorder"       // out of stock, restock date known or unknown
  | "unavailable";    // not carried / discontinued

export interface VendorOffer {
  vendor: VendorId;
  sku: string;
  cost: number;             // dealer cost (what we pay)
  mapPrice: number | null;  // MAP restriction, null = unrestricted
  retailPrice: number;      // what customer pays
  stockQty: number;
  status: OfferStatus;
  restockDate: string | null; // ISO date string if vendor provides it, else null
  shippingOptions: ShippingOption[];
}

export interface ShippingOption {
  label: string;            // e.g. "Ground", "2-Day", "Overnight"
  carrier: string;          // e.g. "UPS", "FedEx"
  transitDays: number;
  cost: number;             // our cost
  retailRate: number;       // what we charge customer (0 = free shipping)
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  sku: string;
  qty: number;
  retailPrice: number;
  name: string;
}

export interface CartLine extends CartItem {
  offers: VendorOffer[];
}

// ---------------------------------------------------------------------------
// Routing strategy
// ---------------------------------------------------------------------------

export type RoutingStrategy =
  | "single_box"   // one vendor fulfills everything
  | "split"        // multiple vendors, customer aware
  | "backorder"    // one or more items backordered, customer notified
  | "partial";     // some items unroutable, order incomplete

export interface RoutingResult {
  sku: string;
  winner: ScoredOffer | null;
  allOffers: ScoredOffer[];
  backorderInfo: BackorderInfo | null;
}

export interface ScoredOffer {
  offer: VendorOffer;
  selectedShipping: ShippingOption;
  marginPct: number;
  marginDollars: number;
  marginScore: number;
  singleBoxScore: number;
  shippingScore: number;
  vendorScore: number;
  totalScore: number;
  excluded: boolean;
  excludeReason?: string;
}

export interface BackorderInfo {
  sku: string;
  vendor: VendorId;
  restockDate: string | null; // null = unknown
  notifyCustomer: boolean;
}

// ---------------------------------------------------------------------------
// Resolved cart routing
// ---------------------------------------------------------------------------

export interface ResolvedCart {
  strategy: RoutingStrategy;
  vendorPrimary: VendorId | null;
  vendorSecondary: VendorId | null;   // non-null when split
  results: RoutingResult[];
  backorders: BackorderInfo[];
  unroutable: string[];               // SKUs with no eligible offer
  selectedShippingByVendor: Record<VendorId, ShippingOption | null>;
}

// ---------------------------------------------------------------------------
// Purchase order
// ---------------------------------------------------------------------------

export interface POLineItem {
  sku: string;
  qty: number;
  unitCost: number;       // our cost
  unitRetail: number;     // customer paid
  name: string;
}

export interface CustomerAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface PurchaseOrder {
  orderId: string;          // our internal order ID (Stripe session ID or DB id)
  vendor: VendorId;
  lines: POLineItem[];
  shippingAddress: CustomerAddress;
  shippingOption: ShippingOption;
  customerEmail: string;
  placedAt: string;         // ISO timestamp
  metadata: Record<string, string>; // vendor-specific extras
}

export interface POResult {
  success: boolean;
  vendorOrderId: string | null;   // vendor's confirmation number
  estimatedShipDate: string | null;
  error?: string;
  rawResponse?: unknown;          // full vendor response for audit log
}

// ---------------------------------------------------------------------------
// Vendor adapter interface
// Every vendor implements this — adding vendor #3 = new adapter only
// ---------------------------------------------------------------------------

export interface VendorAdapter {
  vendorId: VendorId;

  /** Fetch live inventory + pricing for a list of SKUs */
  fetchOffers(skus: string[], retailPrices: Record<string, number>): Promise<VendorOffer[]>;

  /** Submit a purchase order to the vendor */
  submitPO(order: PurchaseOrder): Promise<POResult>;

  /** Optional: get restock date for an out-of-stock SKU */
  getRestockDate?(sku: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Stripe checkout metadata contract
// Stored as flat strings in Stripe session metadata (max 500 chars per value)
// ---------------------------------------------------------------------------

export interface StripeRoutingMetadata {
  routing_strategy: RoutingStrategy;
  routing_vendor_primary: VendorId | string;
  routing_vendor_secondary: VendorId | "none";
  routing_shipping_primary: string;   // JSON ShippingOption
  routing_shipping_secondary: string; // JSON ShippingOption | "none"
  routing_results: string;            // JSON RoutingResult[] (truncated if needed)
  routing_backorders: string;         // JSON BackorderInfo[]
  routing_unroutable: string;         // JSON string[]
}

// ---------------------------------------------------------------------------
// Notification — out of stock / backorder
// ---------------------------------------------------------------------------

export type NotificationTrigger =
  | "back_in_stock"
  | "restock_date_updated"
  | "order_shipped"
  | "backorder_confirmed";

export interface StockNotificationRequest {
  sku: string;
  customerEmail: string;
  customerId?: string;
  trigger: NotificationTrigger;
  restockDate: string | null;
  addedFrom: "cart" | "wishlist" | "backorder";
}
