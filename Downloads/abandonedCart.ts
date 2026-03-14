// functions/src/abandonedCart.ts
// ─── ABANDONED CART AUTOMATION ───────────────────────────────
// Runs every 30 minutes to detect and email abandoned carts.
// Three-email sequence with escalating urgency.
//
// Deploy: firebase deploy --only functions:checkAbandonedCarts

import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'

const db = admin.firestore()

// Time thresholds
const ONE_HOUR_MS = 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS
const SEVENTY_TWO_HOURS_MS = 72 * ONE_HOUR_MS

export const checkAbandonedCarts = onSchedule(
  {
    schedule: 'every 30 minutes',
    region: 'us-central1',
    timeoutSeconds: 300,
  },
  async () => {
    const now = Date.now()
    const cutoff1h = Timestamp.fromMillis(now - ONE_HOUR_MS)
    const cutoff24h = Timestamp.fromMillis(now - TWENTY_FOUR_HOURS_MS)
    const cutoff72h = Timestamp.fromMillis(now - SEVENTY_TWO_HOURS_MS)
    const cutoff96h = Timestamp.fromMillis(now - 96 * ONE_HOUR_MS)  // expire after 4 days

    // Find all active carts with items that haven't been updated in 1+ hour
    const cartsSnap = await db.collection('carts')
      .where('status', '==', 'active')
      .where('lastActivityAt', '<', cutoff1h)
      .where('abandonmentEmailsSent', '<', 3)
      .get()

    console.log(`Found ${cartsSnap.size} potentially abandoned carts`)

    const emailJobs: Promise<void>[] = []

    for (const cartDoc of cartsSnap.docs) {
      const cart = cartDoc.data()
      
      // Skip empty carts
      if (!cart.items || cart.items.length === 0) continue

      // Skip carts without an email address
      const email = cart.email ?? cart.guestEmail
      if (!email) continue

      const lastActivity = cart.lastActivityAt.toMillis()
      const emailsSent = cart.abandonmentEmailsSent ?? 0

      // Determine which email to send
      if (emailsSent === 0 && lastActivity < cutoff1h.toMillis()) {
        // Email 1: 1 hour after abandonment — "You left something behind"
        emailJobs.push(sendAbandonmentEmail(cartDoc.id, cart, email, 1))
      } else if (emailsSent === 1 && lastActivity < cutoff24h.toMillis()) {
        // Email 2: 24 hours — "Still thinking it over? Here's 5% off"
        emailJobs.push(sendAbandonmentEmail(cartDoc.id, cart, email, 2))
      } else if (emailsSent === 2 && lastActivity < cutoff72h.toMillis()) {
        // Email 3: 72 hours — "Last chance — your cart expires soon"
        emailJobs.push(sendAbandonmentEmail(cartDoc.id, cart, email, 3))
      }

      // Mark very old carts as abandoned (stop sending emails)
      if (lastActivity < cutoff96h.toMillis()) {
        emailJobs.push(
          cartDoc.ref.update({
            status: 'abandoned',
            abandonedAt: Timestamp.now(),
          })
        )
      }
    }

    await Promise.allSettled(emailJobs)
    console.log(`Processed ${emailJobs.length} cart email/update actions`)
  }
)

async function sendAbandonmentEmail(
  cartId: string,
  cart: admin.firestore.DocumentData,
  email: string,
  sequence: 1 | 2 | 3
): Promise<void> {
  try {
    // Generate a discount code for email 2 only
    // (Only for non-MAP items — handled by code generation logic)
    let discountCode: string | undefined
    if (sequence === 2) {
      discountCode = await generateCartDiscountCode(cartId, 5)  // 5% off
    }

    // Queue the email (processed by sendEmail function)
    await db.collection('emailQueue').add({
      type: `abandoned_cart_${sequence}`,
      to: email,
      uid: cart.uid ?? null,
      cartId,
      data: {
        cartItems: cart.items,
        cartTotal: cart.total,
        discountCode,
        sequence,
        recoveryUrl: `${process.env.SITE_URL}/cart?recover=${cartId}`,
      },
      scheduledFor: Timestamp.now(),
      status: 'pending',
      createdAt: Timestamp.now(),
    })

    // Increment the abandonment email counter
    await db.collection('carts').doc(cartId).update({
      abandonmentEmailsSent: admin.firestore.FieldValue.increment(1),
      lastAbandonmentEmailAt: Timestamp.now(),
    })

    console.log(`Queued abandonment email ${sequence} for cart ${cartId}`)
  } catch (error) {
    console.error(`Failed to send abandonment email for cart ${cartId}:`, error)
  }
}

async function generateCartDiscountCode(
  cartId: string,
  discountPct: number
): Promise<string> {
  const code = `CART-${cartId.slice(-6).toUpperCase()}-${discountPct}OFF`

  // Store the coupon code so it can be validated at checkout
  await db.collection('coupons').doc(code).set({
    code,
    type: 'percentage',
    value: discountPct,
    cartId,
    maxUses: 1,
    timesUsed: 0,
    // IMPORTANT: Discount cannot violate MAP — enforced at checkout
    respectMAP: true,
    expiresAt: Timestamp.fromMillis(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days
    createdAt: Timestamp.now(),
  })

  return code
}
