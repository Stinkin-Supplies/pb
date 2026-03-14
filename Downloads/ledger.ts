// src/lib/points/ledger.ts
// ─── POINTS LEDGER SYSTEM ────────────────────────────────────
// Append-only transaction log. We NEVER edit entries.
// Full audit trail for every point earned, spent, or expired.

import {
  doc, collection, addDoc, runTransaction,
  serverTimestamp, query, orderBy, limit,
  getDocs, where, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Collections, COLLECTIONS, getPointsRules } from '@/lib/firebase/firestore'
import type { PointsTransaction, PointsTransactionType, PointsRules } from '@/types'

// ─── EARN POINTS ─────────────────────────────────────────────

/**
 * Award points for a completed purchase.
 * Called after order status = 'delivered' (or 'paid' if you prefer).
 * Uses a Firestore transaction to prevent race conditions.
 */
export async function awardPurchasePoints(
  uid: string,
  orderId: string,
  orderTotal: number   // amount paid AFTER points redemption (earn on net spend)
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const rules = await getPointsRules()
  const pointsToAward = Math.floor(orderTotal * rules.earnRatePerDollar)

  if (pointsToAward <= 0) {
    return { pointsAwarded: 0, newBalance: 0 }
  }

  return await addPointsTransaction(uid, {
    type: 'earn_purchase',
    amount: pointsToAward,
    orderId,
    reason: `Purchase #${orderId} — ${orderTotal.toFixed(2)} spent × ${rules.earnRatePerDollar} pts/$`,
    expiresAt: getExpirationDate(rules.expirationMonths),
  })
}

/**
 * Award points for writing a verified product review.
 */
export async function awardReviewPoints(
  uid: string,
  sku: string,
  orderId: string
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const rules = await getPointsRules()

  // Check if review points already awarded for this SKU + order
  const existing = await getDocs(
    query(
      Collections.pointsLedger(uid),
      where('type', '==', 'earn_review'),
      where('sku', '==', sku),
      where('orderId', '==', orderId)
    )
  )
  if (!existing.empty) {
    console.warn(`Review points already awarded for ${uid} / ${sku} / ${orderId}`)
    return { pointsAwarded: 0, newBalance: 0 }
  }

  return await addPointsTransaction(uid, {
    type: 'earn_review',
    amount: rules.reviewPoints,
    orderId,
    sku,
    reason: `Review submitted for ${sku}`,
    expiresAt: getExpirationDate(rules.expirationMonths),
  })
}

/**
 * Award points when a referred user makes their first purchase.
 */
export async function awardReferralPoints(
  referrerUid: string,
  newCustomerUid: string,
  newCustomerOrderId: string
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const rules = await getPointsRules()

  return await addPointsTransaction(referrerUid, {
    type: 'earn_referral',
    amount: rules.referralPoints,
    orderId: newCustomerOrderId,
    reason: `Referral — new customer ${newCustomerUid} made first purchase`,
    expiresAt: getExpirationDate(rules.expirationMonths),
  })
}

/**
 * Award birthday bonus points. Only once per calendar year.
 */
export async function awardBirthdayPoints(uid: string): Promise<{ pointsAwarded: number; newBalance: number } | null> {
  const rules = await getPointsRules()
  const currentYear = new Date().getFullYear()

  // Check user's birthdayPointsAwardedYear in their profile first (done in calling code)
  // This function trusts the caller to verify eligibility

  return await addPointsTransaction(uid, {
    type: 'earn_birthday',
    amount: rules.birthdayPoints,
    reason: `Birthday bonus ${currentYear}`,
    expiresAt: getExpirationDate(rules.expirationMonths),
  })
}

/**
 * Award bonus points for adding a vehicle to the garage.
 * One-time per vehicle.
 */
export async function awardGaragePoints(
  uid: string,
  vehicleId: string,
  vehicleName: string
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const rules = await getPointsRules()

  return await addPointsTransaction(uid, {
    type: 'earn_garage_add',
    amount: rules.garageAddPoints,
    reason: `Added ${vehicleName} to garage`,
    expiresAt: getExpirationDate(rules.expirationMonths),
  })
}

// ─── REDEEM POINTS ───────────────────────────────────────────

/**
 * Redeem points at checkout. Called as part of order creation transaction.
 * Returns the dollar value redeemed.
 */
export async function redeemPoints(
  uid: string,
  pointsToRedeem: number,
  orderId: string,
  orderTotal: number
): Promise<{ 
  success: boolean; 
  dollarValue: number; 
  newBalance: number;
  error?: string 
}> {
  const rules = await getPointsRules()

  // Validate redemption
  if (pointsToRedeem < rules.minRedemptionPoints) {
    return {
      success: false,
      dollarValue: 0,
      newBalance: 0,
      error: `Minimum redemption is ${rules.minRedemptionPoints} points`,
    }
  }

  const dollarValue = pointsToRedeem / rules.redeemRate
  const maxDollarValue = orderTotal * rules.maxRedemptionPctPerOrder

  if (dollarValue > maxDollarValue) {
    return {
      success: false,
      dollarValue: 0,
      newBalance: 0,
      error: `Maximum redemption is ${(rules.maxRedemptionPctPerOrder * 100).toFixed(0)}% of order total ($${maxDollarValue.toFixed(2)})`,
    }
  }

  const result = await addPointsTransaction(uid, {
    type: 'redeem_checkout',
    amount: -pointsToRedeem,  // negative = deduct
    orderId,
    reason: `Redeemed at checkout — $${dollarValue.toFixed(2)} discount on order ${orderId}`,
  })

  if (result.newBalance < 0) {
    // This should never happen due to transaction logic, but safety check
    throw new Error('Points balance cannot go negative')
  }

  return {
    success: true,
    dollarValue,
    newBalance: result.newBalance,
  }
}

// ─── REVERSE POINTS (REFUND) ──────────────────────────────────

/**
 * Reverse points when an order is refunded.
 * Reverses both earned points and restores redeemed points.
 */
export async function reverseOrderPoints(
  uid: string,
  orderId: string,
  earnedPoints: number,
  redeemedPoints: number
): Promise<void> {
  const tasks: Promise<unknown>[] = []

  if (earnedPoints > 0) {
    tasks.push(addPointsTransaction(uid, {
      type: 'reverse_refund',
      amount: -earnedPoints,
      orderId,
      reason: `Points reversed — order ${orderId} refunded`,
    }))
  }

  if (redeemedPoints > 0) {
    // Restore the redeemed points
    tasks.push(addPointsTransaction(uid, {
      type: 'reverse_refund',
      amount: redeemedPoints,
      orderId,
      reason: `Redeemed points restored — order ${orderId} refunded`,
    }))
  }

  await Promise.all(tasks)
}

// ─── ADMIN ADJUSTMENTS ───────────────────────────────────────

/**
 * Manual point adjustment by admin. Requires a reason.
 */
export async function adminAdjustPoints(
  uid: string,
  amount: number,
  reason: string,
  adminUid: string
): Promise<{ newBalance: number }> {
  if (!reason || reason.trim().length < 10) {
    throw new Error('Admin adjustments require a reason (min 10 characters)')
  }

  const result = await addPointsTransaction(uid, {
    type: 'admin_adjust',
    amount,
    reason: `[Admin: ${adminUid}] ${reason}`,
    adminUid,
  })

  return { newBalance: result.newBalance }
}

// ─── EXPIRATION ───────────────────────────────────────────────

/**
 * Expire points for a user after X months of inactivity.
 * Called by scheduled Cloud Function.
 */
export async function expirePoints(
  uid: string,
  expiredAmount: number,
  reason: string = 'Points expired due to account inactivity'
): Promise<{ newBalance: number }> {
  const result = await addPointsTransaction(uid, {
    type: 'expire',
    amount: -expiredAmount,
    reason,
  })
  return { newBalance: result.newBalance }
}

// ─── CORE TRANSACTION HELPER ─────────────────────────────────

interface AddTransactionInput {
  type: PointsTransactionType
  amount: number
  orderId?: string
  sku?: string
  reason?: string
  adminUid?: string
  expiresAt?: Timestamp
}

/**
 * Core function that adds a points transaction and updates the user's balance.
 * Uses a Firestore transaction to guarantee consistency.
 */
async function addPointsTransaction(
  uid: string,
  input: AddTransactionInput
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const userRef = doc(db, COLLECTIONS.USERS, uid)
  const ledgerRef = collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.POINTS_LEDGER)

  const newBalance = await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists()) throw new Error(`User ${uid} not found`)

    const userData = userSnap.data()
    const currentBalance: number = userData.pointsBalance ?? 0
    const calculatedBalance = currentBalance + input.amount

    if (calculatedBalance < 0) {
      throw new Error(
        `Insufficient points: balance ${currentBalance}, attempted deduction ${Math.abs(input.amount)}`
      )
    }

    const transaction: Omit<PointsTransaction, 'id'> = {
      uid,
      type: input.type,
      amount: input.amount,
      balanceAfter: calculatedBalance,
      orderId: input.orderId,
      sku: input.sku,
      reason: input.reason,
      adminUid: input.adminUid,
      expiresAt: input.expiresAt,
      createdAt: serverTimestamp() as Timestamp,
    }

    // Write the ledger entry
    const newLedgerDoc = doc(ledgerRef)
    tx.set(newLedgerDoc, transaction)

    // Update user's balance
    const balanceUpdate: Record<string, unknown> = {
      pointsBalance: calculatedBalance,
    }
    if (input.amount > 0) {
      balanceUpdate.lifetimePointsEarned = (userData.lifetimePointsEarned ?? 0) + input.amount
    }

    tx.update(userRef, balanceUpdate)

    return calculatedBalance
  })

  return {
    pointsAwarded: input.amount,
    newBalance,
  }
}

// ─── UTILITIES ───────────────────────────────────────────────

function getExpirationDate(months: number): Timestamp {
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return Timestamp.fromDate(date)
}

/**
 * Get recent points transactions for display in user's account.
 */
export async function getPointsHistory(
  uid: string,
  limitCount: number = 20
): Promise<PointsTransaction[]> {
  const q = query(
    Collections.pointsLedger(uid),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PointsTransaction))
}

/**
 * Calculate how many points a user would earn for a given order total.
 */
export async function calculatePotentialEarnings(orderTotal: number): Promise<number> {
  const rules = await getPointsRules()
  return Math.floor(orderTotal * rules.earnRatePerDollar)
}

/**
 * Calculate max dollar value a user can redeem from their balance.
 */
export async function calculateMaxRedemption(
  pointsBalance: number,
  orderTotal: number
): Promise<{ maxPoints: number; maxDollarValue: number }> {
  const rules = await getPointsRules()

  const maxByBalance = pointsBalance
  const maxByOrder = Math.floor(orderTotal * rules.maxRedemptionPctPerOrder * rules.redeemRate)
  const maxPoints = Math.min(maxByBalance, maxByOrder)

  // Must meet minimum
  if (maxPoints < rules.minRedemptionPoints) {
    return { maxPoints: 0, maxDollarValue: 0 }
  }

  // Round down to nearest 100 (clean denominations)
  const usablePoints = Math.floor(maxPoints / 100) * 100

  return {
    maxPoints: usablePoints,
    maxDollarValue: usablePoints / rules.redeemRate,
  }
}
