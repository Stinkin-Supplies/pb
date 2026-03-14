// ============================================================
// POWERSPORTS PLATFORM — CORE TYPE DEFINITIONS
// ============================================================

import { Timestamp } from 'firebase/firestore'

// ─── VEHICLES & FITMENT ──────────────────────────────────────

export interface Vehicle {
  id: string
  year: number
  make: string
  model: string
  submodel: string
  type: 'motorcycle' | 'atv' | 'utv' | 'scooter' | 'snowmobile' | 'pwc'
  displacement?: number   // cc
  engineType?: string     // e.g. "V-Twin", "Parallel Twin"
  acesId?: string         // ACES standard vehicle ID
}

export interface UserGarageVehicle {
  vehicleId: string
  vehicle: Vehicle        // denormalized for quick reads
  nickname?: string       // e.g. "My Road King"
  mileage?: number
  color?: string
  purchaseDate?: string
  isPrimary: boolean
  addedAt: Timestamp
}

export interface FitmentData {
  sku: string
  vehicleIds: string[]    // array of Vehicle IDs this part fits
  universal: boolean
  fitmentNotes?: string   // e.g. "Requires hardware kit ABC-123"
  positionNotes?: string  // e.g. "Front only" | "Left side"
}

// ─── PRODUCTS ────────────────────────────────────────────────

export type ProductCondition = 'new' | 'remanufactured' | 'closeout'
export type ProductStatus = 'active' | 'inactive' | 'discontinued' | 'draft'

export interface ProductImage {
  url: string
  alt: string
  isPrimary: boolean
  sortOrder: number
}

export interface ProductAttribute {
  name: string    // e.g. "Color", "Material", "Finish"
  value: string   // e.g. "Chrome", "Aluminum", "Gloss Black"
}

export interface VendorSource {
  vendorId: string
  vendorName: string
  vendorSku: string         // vendor's part number
  cost: number              // our cost from this vendor
  mapPrice: number          // MAP floor from this vendor
  msrp: number
  inStock: boolean
  stockQty?: number
  leadTimeDays?: number     // days to ship from vendor
  lastSyncedAt: Timestamp
}

export interface Product {
  id: string                // your internal ID / primary SKU
  sku: string
  upc?: string
  partNumber: string        // manufacturer part number
  name: string
  slug: string              // URL-friendly
  brand: string
  brandId: string
  category: string          // top-level: "exhaust", "brakes", "lighting"
  subcategory: string       // "slip-ons", "full-systems"
  description: string
  shortDescription: string
  images: ProductImage[]
  attributes: ProductAttribute[]
  tags: string[]

  // Pricing
  ourPrice: number          // calculated final sell price
  mapFloor: number          // highest MAP across all vendors (most restrictive)
  msrp: number
  compareAtPrice?: number   // for "was $X" display

  // Inventory (aggregated across vendors)
  inStock: boolean
  totalAvailableQty: number
  vendorSources: VendorSource[]  // which vendors carry this
  preferredVendorId: string      // which vendor to order from first

  // Fitment
  isUniversal: boolean
  fitmentCount: number           // how many vehicles this fits (for display)

  // Meta
  status: ProductStatus
  condition: ProductCondition
  weight?: number                // lbs, for shipping calc
  dimensions?: { l: number; w: number; h: number }
  createdAt: Timestamp
  updatedAt: Timestamp

  // Search/SEO
  searchKeywords: string[]
  metaTitle?: string
  metaDescription?: string
}

// ─── USERS & ACCOUNTS ────────────────────────────────────────

export interface UserAddress {
  id: string
  label?: string            // "Home", "Work"
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  state: string             // 2-letter
  zip: string
  country: 'US'
  phone?: string
  isDefault: boolean
}

export interface User {
  uid: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  birthdate?: string        // MM-DD for birthday points (no year for privacy)
  avatarUrl?: string

  // Points
  pointsBalance: number
  lifetimePointsEarned: number

  // Account stats
  lifetimeSpend: number
  orderCount: number
  lastOrderAt?: Timestamp

  // Garage
  garage: UserGarageVehicle[]
  primaryVehicleId?: string

  // Addresses
  addresses: UserAddress[]
  defaultAddressId?: string

  // Preferences
  marketingEmailOptIn: boolean
  smsOptIn: boolean
  backInStockAlerts: string[]   // array of SKUs
  wishlist: string[]             // array of SKUs

  // Referral
  referralCode: string           // their unique code to share
  referredBy?: string            // uid of who referred them

  // Meta
  role: 'customer' | 'admin' | 'sales_rep' | 'viewer'
  createdAt: Timestamp
  lastLoginAt: Timestamp
  birthdayPointsAwardedYear?: number  // prevents double-awarding
}

// ─── POINTS ──────────────────────────────────────────────────

export type PointsTransactionType =
  | 'earn_purchase'
  | 'earn_review'
  | 'earn_referral'
  | 'earn_birthday'
  | 'earn_garage_add'
  | 'earn_bonus'
  | 'redeem_checkout'
  | 'reverse_refund'
  | 'expire'
  | 'admin_adjust'

export interface PointsTransaction {
  id: string
  uid: string
  type: PointsTransactionType
  amount: number             // positive = earn, negative = redeem/expire/reverse
  balanceAfter: number       // running balance
  orderId?: string
  sku?: string               // for review points
  reason?: string            // human-readable, especially for admin adjustments
  adminUid?: string          // if admin performed the adjustment
  expiresAt?: Timestamp      // when these points expire (for earned batches)
  createdAt: Timestamp
}

export interface PointsRules {
  earnRatePerDollar: number        // e.g., 10 = $1 = 10 pts
  redeemRate: number               // e.g., 100 = 100pts = $1
  minRedemptionPoints: number      // e.g., 500 = must have 500pts to redeem
  maxRedemptionPctPerOrder: number // e.g., 0.20 = max 20% of order total
  reviewPoints: number             // points for writing a review
  garageAddPoints: number
  birthdayPoints: number
  referralPoints: number           // awarded when referred friend makes first purchase
  expirationMonths: number         // months of inactivity before expiration
}

// ─── CART ────────────────────────────────────────────────────

export interface CartItem {
  sku: string
  product: Pick<Product, 'id' | 'sku' | 'name' | 'brand' | 'images' | 'ourPrice' | 'mapFloor' | 'inStock' | 'partNumber'>
  qty: number
  priceAtAdd: number         // snapshot price when added
  fitmentVehicleId?: string  // which garage vehicle this is for
}

export interface Cart {
  id: string                 // cartId = uid for logged in, sessionId for guest
  uid?: string               // null for guest
  sessionId?: string
  items: CartItem[]
  pointsToRedeem: number
  couponCode?: string
  couponDiscount: number
  subtotal: number
  shipping: number
  tax: number
  total: number
  status: 'active' | 'checkout' | 'converted' | 'abandoned'
  lastActivityAt: Timestamp
  createdAt: Timestamp

  // Abandonment tracking
  abandonmentEmailsSent: number  // 0, 1, 2, or 3
  lastAbandonmentEmailAt?: Timestamp
}

// ─── ORDERS ──────────────────────────────────────────────────

export type OrderStatus =
  | 'pending_payment'
  | 'payment_failed'
  | 'paid'
  | 'processing'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'

export type VendorOrderStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'backordered'
  | 'shipped'
  | 'delivered'
  | 'exception'
  | 'cancelled'

export interface OrderLineItem {
  sku: string
  partNumber: string
  name: string
  brand: string
  qty: number
  unitPrice: number
  unitCost: number
  totalPrice: number
  totalCost: number
  imageUrl: string
  vendorId: string           // which vendor fulfills this item
}

export interface VendorOrder {
  id: string
  orderId: string            // parent order
  vendorId: string
  vendorName: string
  vendorOrderNumber?: string // vendor's PO confirmation number
  status: VendorOrderStatus
  lineItems: OrderLineItem[]
  shippingAddress: UserAddress
  trackingNumbers: string[]
  carrier?: string
  submittedAt?: Timestamp
  confirmedAt?: Timestamp
  shippedAt?: Timestamp
  deliveredAt?: Timestamp
  vendorNotes?: string
  rawResponse?: Record<string, unknown>  // full vendor API response for debugging
}

export interface OrderTimeline {
  id: string
  event: string              // e.g. "Payment captured", "Vendor order submitted"
  detail?: string
  actor: 'system' | 'customer' | 'admin' | 'vendor'
  actorId?: string
  timestamp: Timestamp
}

export interface Order {
  id: string
  orderNumber: string        // human-readable: "PS-2024-00001"
  uid?: string               // null for guest
  customerEmail: string
  customerName: string
  customerPhone?: string

  status: OrderStatus
  lineItems: OrderLineItem[]

  shippingAddress: UserAddress
  billingAddress: UserAddress

  subtotal: number
  shipping: number
  tax: number
  pointsRedeemed: number
  pointsRedeemedValue: number  // dollar value of points applied
  discount: number              // coupon/other discounts
  total: number

  pointsEarned: number         // points awarded for this order
  pointsEarnedAt?: Timestamp

  // Payment
  stripePaymentIntentId: string
  stripeChargeId?: string
  paymentMethod?: string       // last 4 digits etc.

  // Fulfillment (split across vendors)
  vendorOrderIds: string[]

  // Review
  reviewRequested: boolean
  reviewRequestedAt?: Timestamp

  // Notes
  customerNote?: string
  internalNote?: string

  cartId?: string

  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── VENDORS ─────────────────────────────────────────────────

export type VendorIntegrationMethod = 'api' | 'ftp_csv' | 'ftp_xml' | 'edi' | 'email_po' | 'manual'

export interface Vendor {
  id: string
  name: string               // "Drag Specialties", "WPS"
  slug: string
  logoUrl?: string
  website?: string

  // Integration
  integrationMethod: VendorIntegrationMethod
  apiBaseUrl?: string
  ftpHost?: string
  ftpPath?: string
  accountNumber?: string     // your dealer account number
  // Credentials stored in Firebase Secret Manager, not here

  // Catalog settings
  defaultMarkupPct: number   // e.g., 0.35 = 35% markup over cost
  minMarginPct: number       // floor: never sell below cost + this margin
  freeShippingOnMapItems: boolean  // some vendors prohibit this

  // Sync settings
  syncFrequencyHours: number
  lastProductSyncAt?: Timestamp
  lastInventorySyncAt?: Timestamp
  lastMapSyncAt?: Timestamp
  lastSyncStatus: 'success' | 'error' | 'running' | 'never'
  lastSyncError?: string

  // Performance metrics
  avgShipTimeDays?: number
  fillRate?: number          // % of orders that ship complete
  totalSKUs: number
  activeSKUs: number

  // Contact
  repName?: string
  repEmail?: string
  repPhone?: string

  active: boolean
  createdAt: Timestamp
}

// ─── MAP COMPLIANCE ──────────────────────────────────────────

export interface MAPEntry {
  sku: string
  vendorId: string
  mapPrice: number
  effectiveDate: Timestamp
  expiresDate?: Timestamp
  source: 'feed' | 'manual'
  notes?: string
}

export type MAPComplianceStatus = 'compliant' | 'violation' | 'at_floor' | 'no_map'

export interface MAPComplianceCheck {
  sku: string
  ourPrice: number
  mapFloor: number
  status: MAPComplianceStatus
  violationAmount?: number   // how much below MAP (if violation)
  checkedAt: Timestamp
}

export interface MAPAlert {
  id: string
  sku: string
  productName: string
  vendorId: string
  previousMAP: number
  newMAP: number
  ourCurrentPrice: number
  isViolation: boolean
  autoFixed: boolean
  resolvedAt?: Timestamp
  createdAt: Timestamp
}

// ─── COMPETITOR PRICING ──────────────────────────────────────

export type PriceRecommendation = 'beat' | 'match' | 'at_map' | 'losing' | 'unchecked'

export interface CompetitorPrice {
  price: number
  url?: string
  inStock: boolean
  checkedAt: Timestamp
  checkFailed: boolean
}

export interface CompetitorPricingEntry {
  sku: string
  productName: string
  ourPrice: number
  ourCost: number
  mapFloor: number
  margin: number
  revzilla?: CompetitorPrice
  jpCycles?: CompetitorPrice
  lowestCompetitorPrice?: number
  recommendation: PriceRecommendation
  recommendedPrice?: number
  potentialRevenueLift?: number  // if we apply recommendation
  lastCheckedAt: Timestamp
}

// ─── MARKETING & EMAIL ───────────────────────────────────────

export type EmailType =
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_delivered'
  | 'abandoned_cart_1'
  | 'abandoned_cart_2'
  | 'abandoned_cart_3'
  | 'review_request'
  | 'back_in_stock'
  | 'points_earned'
  | 'points_expiring'
  | 'birthday'
  | 'win_back'
  | 'referral_success'
  | 'map_alert'              // admin only

export interface EmailJob {
  id: string
  type: EmailType
  to: string
  uid?: string
  orderId?: string
  cartId?: string
  sku?: string
  scheduledFor: Timestamp
  sentAt?: Timestamp
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  error?: string
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────

export interface DashboardMetrics {
  period: 'today' | 'week' | 'month' | 'year'
  revenue: number
  orders: number
  avgOrderValue: number
  conversionRate: number
  activeCarts: number
  abandonedCarts: number
  abandonedCartValue: number
  newCustomers: number
  returningCustomers: number
  mapViolations: number
  vendorErrors: number
  lowStockItems: number
  pointsAwarded: number
  pointsRedeemed: number
  updatedAt: Timestamp
}

export interface AdminUser {
  uid: string
  email: string
  name: string
  role: 'admin' | 'sales_rep' | 'viewer'
  lastLoginAt: Timestamp
}
