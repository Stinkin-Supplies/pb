// src/lib/map/engine.ts
// ─── MAP COMPLIANCE ENGINE ───────────────────────────────────
// This is the most business-critical module in the platform.
// ALL pricing decisions flow through this engine.
// Vendor accounts can be terminated for MAP violations.

import type { Product, VendorSource, User, MAPComplianceStatus } from '@/types'

// ─── TYPES ───────────────────────────────────────────────────

export interface PriceCalculationInput {
  product: Product
  user?: User | null
  pointsToRedeem?: number
  qty?: number
}

export interface PriceCalculationResult {
  basePrice: number          // before any adjustments
  salePrice: number          // after promotions, before points
  pointsDiscount: number     // dollar value of points being redeemed
  finalPrice: number         // customer pays this
  mapFloor: number           // enforced floor
  isAtMAP: boolean           // true if MAP is the limiting factor
  margin: number             // profit margin %
  marginDollar: number       // profit in dollars
  bestVendorCost: number     // lowest cost across vendors
  complianceStatus: MAPComplianceStatus
}

export interface MAPValidationResult {
  isCompliant: boolean
  status: MAPComplianceStatus
  violationAmount?: number   // how much below MAP
  mapFloor: number
  currentPrice: number
}

// ─── CORE MAP CALCULATION ────────────────────────────────────

/**
 * Calculate the effective MAP floor for a product.
 * Takes the HIGHEST MAP across all vendor sources (most restrictive).
 * If any vendor requires MAP $49.99, that's the floor regardless of others.
 */
export function getEffectiveMAPFloor(product: Product): number {
  if (!product.vendorSources || product.vendorSources.length === 0) {
    return 0
  }

  const mapPrices = product.vendorSources
    .filter(v => v.mapPrice > 0)
    .map(v => v.mapPrice)

  return mapPrices.length > 0 ? Math.max(...mapPrices) : 0
}

/**
 * Get the lowest cost across all in-stock vendor sources.
 */
export function getBestVendorCost(product: Product): { cost: number; vendorId: string } | null {
  const inStockSources = product.vendorSources.filter(v => v.inStock)
  if (inStockSources.length === 0) return null

  const sorted = [...inStockSources].sort((a, b) => a.cost - b.cost)
  return { cost: sorted[0].cost, vendorId: sorted[0].vendorId }
}

/**
 * Select the preferred vendor for order fulfillment.
 * Priority: 1) lowest cost, 2) fastest ship time, 3) vendor priority
 */
export function selectFulfillmentVendor(product: Product): VendorSource | null {
  const inStockSources = product.vendorSources.filter(v => v.inStock)
  if (inStockSources.length === 0) return null

  return [...inStockSources].sort((a, b) => {
    // Primary: lowest cost
    if (a.cost !== b.cost) return a.cost - b.cost
    // Secondary: fastest ship time
    const leadA = a.leadTimeDays ?? 999
    const leadB = b.leadTimeDays ?? 999
    return leadA - leadB
  })[0]
}

/**
 * THE CORE FUNCTION: Calculate the final price a customer will pay.
 * 
 * Pricing hierarchy:
 * 1. Start with our calculated sell price (vendor cost + markup)
 * 2. Apply any active promotions / sale prices
 * 3. Apply points redemption discount
 * 4. ENFORCE MAP FLOOR — price can never go below MAP
 * 5. Verify minimum margin floor (we never sell below cost + min margin)
 */
export function calculateFinalPrice(input: PriceCalculationInput): PriceCalculationResult {
  const { product, pointsToRedeem = 0 } = input

  const mapFloor = getEffectiveMAPFloor(product)
  const bestVendor = getBestVendorCost(product)
  const bestVendorCost = bestVendor?.cost ?? 0

  // Our listed sell price (already calculated when product was indexed)
  const basePrice = product.ourPrice

  // Apply sale price if set
  const salePrice = product.compareAtPrice && product.compareAtPrice > product.ourPrice
    ? product.ourPrice  // ourPrice IS the sale price when compareAtPrice is set
    : product.ourPrice

  // Calculate points discount (dollar value)
  // Points can't reduce price below MAP
  const maxPointsDiscount = Math.max(0, salePrice - mapFloor)
  const pointsDiscount = Math.min(
    pointsToRedeem / 100,   // 100 points = $1
    maxPointsDiscount
  )

  // Calculate price after points
  const priceAfterPoints = salePrice - pointsDiscount

  // ENFORCE MAP FLOOR — this is the critical rule
  const finalPrice = Math.max(priceAfterPoints, mapFloor)

  // Recalculate actual points discount (might have been limited by MAP)
  const actualPointsDiscount = salePrice - finalPrice

  // Compliance check
  let complianceStatus: MAPComplianceStatus = 'compliant'
  if (mapFloor === 0) {
    complianceStatus = 'no_map'
  } else if (finalPrice <= mapFloor + 0.001) {  // floating point tolerance
    complianceStatus = 'at_floor'
  } else {
    complianceStatus = 'compliant'
  }

  // Margin calculation
  const marginDollar = finalPrice - bestVendorCost
  const margin = bestVendorCost > 0 ? marginDollar / finalPrice : 0

  return {
    basePrice,
    salePrice,
    pointsDiscount: actualPointsDiscount,
    finalPrice,
    mapFloor,
    isAtMAP: mapFloor > 0 && finalPrice <= mapFloor + 0.001,
    margin,
    marginDollar,
    bestVendorCost,
    complianceStatus,
  }
}

/**
 * Validate whether a proposed price is MAP compliant.
 * Use this before saving any price change.
 */
export function validateMAPCompliance(
  proposedPrice: number,
  mapFloor: number
): MAPValidationResult {
  if (mapFloor === 0) {
    return {
      isCompliant: true,
      status: 'no_map',
      mapFloor,
      currentPrice: proposedPrice,
    }
  }

  const isCompliant = proposedPrice >= mapFloor - 0.001  // floating point tolerance

  return {
    isCompliant,
    status: isCompliant
      ? proposedPrice <= mapFloor + 0.001 ? 'at_floor' : 'compliant'
      : 'violation',
    violationAmount: isCompliant ? undefined : mapFloor - proposedPrice,
    mapFloor,
    currentPrice: proposedPrice,
  }
}

/**
 * Calculate the recommended price to beat a competitor while
 * staying MAP compliant and maintaining minimum margin.
 */
export function calculateCompetitorBeatPrice(
  competitorPrice: number,
  mapFloor: number,
  ourCost: number,
  minMarginPct: number = 0.15  // 15% minimum margin
): {
  recommendedPrice: number
  canBeat: boolean
  reason: string
} {
  const minMarginPrice = ourCost / (1 - minMarginPct)
  const absoluteFloor = Math.max(mapFloor, minMarginPrice)

  // Try to beat by $0.01
  const targetPrice = parseFloat((competitorPrice - 0.01).toFixed(2))

  if (targetPrice < absoluteFloor) {
    // Can't beat them while staying compliant + profitable
    return {
      recommendedPrice: absoluteFloor,
      canBeat: false,
      reason: mapFloor > minMarginPrice
        ? `MAP floor $${mapFloor.toFixed(2)} prevents beating $${competitorPrice.toFixed(2)}`
        : `Minimum margin floor $${minMarginPrice.toFixed(2)} prevents beating $${competitorPrice.toFixed(2)}`,
    }
  }

  return {
    recommendedPrice: targetPrice,
    canBeat: true,
    reason: `Beat by $0.01, margin: ${(((targetPrice - ourCost) / targetPrice) * 100).toFixed(1)}%`,
  }
}

/**
 * Calculate the price to display on the product page.
 * Handles the case where MAP requires a "click to see price" pattern
 * (some vendors require this for certain product categories — check your agreements).
 */
export function getDisplayPrice(product: Product): {
  price: number
  showPrice: boolean
  callForPrice: boolean
} {
  // For now, always show price (most vendors allow this)
  // Some vendors require "Add to cart to see price" — add a per-product flag if needed
  return {
    price: product.ourPrice,
    showPrice: true,
    callForPrice: false,
  }
}

// ─── BULK COMPLIANCE CHECKER ─────────────────────────────────
// Used by the admin dashboard and scheduled compliance functions

export interface ComplianceScanResult {
  totalChecked: number
  violations: number
  atFloor: number
  compliant: number
  noMAP: number
  violatingSkus: Array<{
    sku: string
    name: string
    ourPrice: number
    mapFloor: number
    violationAmount: number
  }>
}

export function runBulkComplianceCheck(products: Product[]): ComplianceScanResult {
  const result: ComplianceScanResult = {
    totalChecked: products.length,
    violations: 0,
    atFloor: 0,
    compliant: 0,
    noMAP: 0,
    violatingSkus: [],
  }

  for (const product of products) {
    const validation = validateMAPCompliance(product.ourPrice, product.mapFloor)

    switch (validation.status) {
      case 'violation':
        result.violations++
        result.violatingSkus.push({
          sku: product.sku,
          name: product.name,
          ourPrice: product.ourPrice,
          mapFloor: product.mapFloor,
          violationAmount: validation.violationAmount ?? 0,
        })
        break
      case 'at_floor':
        result.atFloor++
        break
      case 'compliant':
        result.compliant++
        break
      case 'no_map':
        result.noMAP++
        break
    }
  }

  return result
}

// ─── PRICING RULE CALCULATOR ─────────────────────────────────
// Used when importing vendor feeds to set our initial price

export interface PricingRuleInput {
  vendorCost: number
  mapPrice: number
  msrp: number
  markupPct: number        // e.g., 0.35 for 35% markup
  minMarginPct: number     // e.g., 0.10 for 10% minimum
  roundToNine: boolean     // price to $.99 endings
}

export function calculateInitialPrice(input: PricingRuleInput): number {
  const { vendorCost, mapPrice, msrp, markupPct, minMarginPct, roundToNine } = input

  // Start with cost + markup
  let price = vendorCost * (1 + markupPct)

  // Ensure minimum margin
  const minMarginPrice = vendorCost / (1 - minMarginPct)
  price = Math.max(price, minMarginPrice)

  // Never go below MAP
  price = Math.max(price, mapPrice)

  // Never go above MSRP (would look silly)
  if (msrp > 0) {
    price = Math.min(price, msrp)
  }

  // Round to .99 endings for psychological pricing
  if (roundToNine) {
    price = Math.floor(price) + 0.99
    // But recheck MAP after rounding down
    if (price < mapPrice) price = mapPrice
  }

  return parseFloat(price.toFixed(2))
}
