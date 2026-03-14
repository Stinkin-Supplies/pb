// functions/src/orderProcessor.ts
// ─── AUTOMATED ORDER FULFILLMENT ENGINE ──────────────────────
// Triggered when a Stripe payment succeeds.
// Splits orders by vendor, submits POs, tracks fulfillment.

import * as admin from 'firebase-admin'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'
import type { Order, VendorOrder, OrderLineItem } from '../../src/types'

const db = admin.firestore()

// ─── TRIGGER: New Order Created ───────────────────────────────

export const onOrderCreated = onDocumentCreated(
  {
    document: 'orders/{orderId}',
    region: 'us-central1',
  },
  async (event) => {
    const order = event.data?.data() as Order
    const orderId = event.params.orderId

    if (!order || order.status !== 'paid') {
      console.log(`Skipping order ${orderId} — status: ${order?.status}`)
      return
    }

    console.log(`Processing order ${orderId} for ${order.customerEmail}`)

    await addOrderTimeline(orderId, 'Order received — processing started', 'system')

    try {
      // Split order into vendor groups
      const vendorGroups = groupItemsByVendor(order.lineItems)
      console.log(`Order ${orderId} split into ${vendorGroups.size} vendor groups`)

      const vendorOrderIds: string[] = []

      for (const [vendorId, items] of vendorGroups) {
        const vendorOrderId = await submitVendorOrder(orderId, order, vendorId, items)
        if (vendorOrderId) {
          vendorOrderIds.push(vendorOrderId)
        }
      }

      // Update main order with vendor order references
      await db.collection('orders').doc(orderId).update({
        vendorOrderIds,
        status: 'processing',
        updatedAt: Timestamp.now(),
      })

      await addOrderTimeline(
        orderId,
        `${vendorOrderIds.length} vendor order(s) submitted`,
        'system',
        `Vendors: ${[...vendorGroups.keys()].join(', ')}`
      )

      // Send customer confirmation email
      await queueEmail('order_confirmation', order.customerEmail, orderId, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        lineItems: order.lineItems,
        total: order.total,
        pointsEarned: order.pointsEarned,
        shippingAddress: order.shippingAddress,
      })

    } catch (error) {
      console.error(`Failed to process order ${orderId}:`, error)
      await addOrderTimeline(orderId, 'Order processing error — manual review required', 'system', String(error))

      // Alert admins
      await queueEmail('order_error_alert', process.env.ADMIN_EMAIL ?? '', orderId, {
        error: String(error),
        orderId,
      })
    }
  }
)

// ─── SUBMIT VENDOR ORDER ─────────────────────────────────────

async function submitVendorOrder(
  orderId: string,
  order: Order,
  vendorId: string,
  items: OrderLineItem[]
): Promise<string | null> {
  // Get vendor config
  const vendorSnap = await db.collection('vendors').doc(vendorId).get()
  if (!vendorSnap.exists()) {
    console.error(`Vendor ${vendorId} not found`)
    return null
  }

  const vendor = vendorSnap.data()!

  // Create vendor order document
  const vendorOrderRef = db
    .collection('orders').doc(orderId)
    .collection('vendorOrders').doc()

  const vendorOrder: Omit<VendorOrder, 'id'> = {
    orderId,
    vendorId,
    vendorName: vendor.name,
    status: 'pending',
    lineItems: items,
    shippingAddress: order.shippingAddress,
    trackingNumbers: [],
    submittedAt: Timestamp.now(),
  }

  await vendorOrderRef.set(vendorOrder)

  // Get vendor credentials from Secret Manager
  const credentials = await getVendorCredentials(vendorId)

  try {
    let confirmation

    switch (vendor.integrationMethod) {
      case 'api':
        confirmation = await submitViaAPI(vendor, credentials, order, items, vendorOrderRef.id)
        break

      case 'ftp_csv':
      case 'ftp_xml':
        confirmation = await submitViaFTP(vendor, credentials, order, items, vendorOrderRef.id)
        break

      case 'email_po':
      default:
        confirmation = await submitViaEmail(vendor, order, items, vendorOrderRef.id)
        break
    }

    // Update vendor order with confirmation
    await vendorOrderRef.update({
      status: confirmation.status === 'confirmed' ? 'confirmed' : 'submitted',
      vendorOrderNumber: confirmation.vendorOrderNumber,
      confirmedAt: Timestamp.now(),
      rawResponse: confirmation.rawResponse,
    })

    await addOrderTimeline(
      orderId,
      `${vendor.name} order submitted`,
      'system',
      `PO: ${confirmation.vendorOrderNumber}`
    )

    return vendorOrderRef.id

  } catch (error) {
    await vendorOrderRef.update({
      status: 'exception',
      vendorNotes: String(error),
    })
    console.error(`Failed to submit vendor order to ${vendorId}:`, error)
    return vendorOrderRef.id  // Return ID even on error so we can track it
  }
}

// ─── TRACKING SYNC (runs every 30 min) ───────────────────────

export const syncOrderTracking = onSchedule(
  {
    schedule: 'every 30 minutes',
    region: 'us-central1',
    timeoutSeconds: 540,
  },
  async () => {
    // Find orders that are processing or partially shipped
    const ordersSnap = await db.collection('orders')
      .where('status', 'in', ['processing', 'partially_shipped'])
      .get()

    console.log(`Checking tracking for ${ordersSnap.size} active orders`)

    for (const orderDoc of ordersSnap.docs) {
      await syncOrderTrackingForOrder(orderDoc.id, orderDoc.data() as Order)
    }
  }
)

async function syncOrderTrackingForOrder(orderId: string, order: Order): Promise<void> {
  const vendorOrdersSnap = await db
    .collection('orders').doc(orderId)
    .collection('vendorOrders')
    .where('status', 'in', ['submitted', 'confirmed'])
    .get()

  for (const vendorOrderDoc of vendorOrdersSnap.docs) {
    const vendorOrder = vendorOrderDoc.data() as VendorOrder

    if (!vendorOrder.vendorOrderNumber) continue

    try {
      const vendorSnap = await db.collection('vendors').doc(vendorOrder.vendorId).get()
      if (!vendorSnap.exists()) continue

      const vendor = vendorSnap.data()!
      const credentials = await getVendorCredentials(vendorOrder.vendorId)
      const status = await getVendorOrderStatus(vendor, credentials, vendorOrder.vendorOrderNumber)

      if (status.trackingNumbers.length > 0) {
        // New tracking info!
        await vendorOrderDoc.ref.update({
          status: 'shipped',
          trackingNumbers: status.trackingNumbers,
          carrier: status.carrier,
          shippedAt: Timestamp.now(),
        })

        // Send tracking email to customer
        await queueEmail('order_shipped', order.customerEmail, orderId, {
          orderNumber: order.orderNumber,
          trackingNumbers: status.trackingNumbers,
          carrier: status.carrier,
          vendorName: vendorOrder.vendorName,
        })

        await addOrderTimeline(
          orderId,
          `${vendorOrder.vendorName} shipment tracking updated`,
          'system',
          `Tracking: ${status.trackingNumbers.join(', ')}`
        )

        // Check if all vendor orders are now shipped
        await checkAndUpdateMainOrderStatus(orderId)
      }
    } catch (error) {
      console.error(`Tracking sync failed for vendor order ${vendorOrderDoc.id}:`, error)
    }
  }
}

async function checkAndUpdateMainOrderStatus(orderId: string): Promise<void> {
  const vendorOrdersSnap = await db
    .collection('orders').doc(orderId)
    .collection('vendorOrders')
    .get()

  const statuses = vendorOrdersSnap.docs.map(d => d.data().status)
  const allShipped = statuses.every(s => s === 'shipped' || s === 'delivered')
  const someShipped = statuses.some(s => s === 'shipped' || s === 'delivered')

  let newStatus: string
  if (allShipped) {
    newStatus = 'shipped'
  } else if (someShipped) {
    newStatus = 'partially_shipped'
  } else {
    return  // No change
  }

  await db.collection('orders').doc(orderId).update({
    status: newStatus,
    updatedAt: Timestamp.now(),
  })
}

// ─── POINTS AWARD ON DELIVERY ────────────────────────────────

export const awardPointsOnDelivery = onSchedule(
  {
    schedule: 'every 2 hours',
    region: 'us-central1',
  },
  async () => {
    // Find shipped orders where points haven't been awarded yet
    const ordersSnap = await db.collection('orders')
      .where('status', '==', 'shipped')
      .where('pointsEarnedAt', '==', null)
      .get()

    for (const orderDoc of ordersSnap.docs) {
      const order = orderDoc.data() as Order
      if (!order.uid || !order.pointsEarned) continue

      try {
        // Award the points (using admin SDK, bypasses Firestore rules)
        await awardPointsViaAdmin(order.uid, order.pointsEarned, orderDoc.id)

        await orderDoc.ref.update({
          pointsEarnedAt: Timestamp.now(),
        })

        // Queue points notification email
        await queueEmail('points_earned', order.customerEmail, orderDoc.id, {
          pointsEarned: order.pointsEarned,
          orderNumber: order.orderNumber,
        })

      } catch (error) {
        console.error(`Failed to award points for order ${orderDoc.id}:`, error)
      }
    }
  }
)

// ─── HELPER FUNCTIONS ────────────────────────────────────────

function groupItemsByVendor(lineItems: OrderLineItem[]): Map<string, OrderLineItem[]> {
  const groups = new Map<string, OrderLineItem[]>()
  for (const item of lineItems) {
    const existing = groups.get(item.vendorId) ?? []
    existing.push(item)
    groups.set(item.vendorId, existing)
  }
  return groups
}

async function addOrderTimeline(
  orderId: string,
  event: string,
  actor: 'system' | 'customer' | 'admin',
  detail?: string
): Promise<void> {
  await db
    .collection('orders').doc(orderId)
    .collection('orderTimeline').add({
      event,
      detail,
      actor,
      timestamp: Timestamp.now(),
    })
}

async function queueEmail(
  type: string,
  to: string,
  orderId: string,
  data: Record<string, unknown>
): Promise<void> {
  await db.collection('emailQueue').add({
    type,
    to,
    orderId,
    data,
    scheduledFor: Timestamp.now(),
    status: 'pending',
    createdAt: Timestamp.now(),
  })
}

async function getVendorCredentials(vendorId: string): Promise<Record<string, string>> {
  // In production, retrieve from Firebase Secret Manager
  // const { SecretManagerServiceClient } = require('@google-cloud/secret-manager')
  // const client = new SecretManagerServiceClient()
  // const [version] = await client.accessSecretVersion({ name: `.../${vendorId}_credentials/latest` })
  // return JSON.parse(version.payload.data.toString())

  // For development, use environment variables
  return {
    apiKey: process.env[`${vendorId.toUpperCase()}_API_KEY`] ?? '',
    accountNumber: process.env[`${vendorId.toUpperCase()}_ACCOUNT_NUMBER`] ?? '',
  }
}

// Placeholder implementations — replace with actual adapter calls
async function submitViaAPI(
  vendor: admin.firestore.DocumentData,
  credentials: Record<string, string>,
  order: Order,
  items: OrderLineItem[],
  vendorOrderId: string
): Promise<{ vendorOrderNumber: string; status: string; rawResponse: unknown }> {
  // Import and use the appropriate VendorAdapter
  // const adapter = getVendorAdapter(vendor, credentials)
  // const po = buildPurchaseOrder(order, items, vendorOrderId)
  // return await adapter.submitOrder(po)
  throw new Error('submitViaAPI not yet implemented for vendor: ' + vendor.slug)
}

async function submitViaFTP(
  vendor: admin.firestore.DocumentData,
  credentials: Record<string, string>,
  order: Order,
  items: OrderLineItem[],
  vendorOrderId: string
): Promise<{ vendorOrderNumber: string; status: string; rawResponse: unknown }> {
  throw new Error('submitViaFTP not yet implemented for vendor: ' + vendor.slug)
}

async function submitViaEmail(
  vendor: admin.firestore.DocumentData,
  order: Order,
  items: OrderLineItem[],
  vendorOrderId: string
): Promise<{ vendorOrderNumber: string; status: string; rawResponse: unknown }> {
  // Generate PO number
  const poNumber = `PO-${order.orderNumber}-${vendorOrderId.slice(-4)}`

  // Queue PO email
  await db.collection('emailQueue').add({
    type: 'vendor_po',
    to: vendor.repEmail,
    data: {
      vendor: vendor.name,
      poNumber,
      shippingAddress: order.shippingAddress,
      lineItems: items,
      customerOrderId: order.id,
    },
    scheduledFor: Timestamp.now(),
    status: 'pending',
    createdAt: Timestamp.now(),
  })

  return {
    vendorOrderNumber: poNumber,
    status: 'pending',
    rawResponse: { method: 'email_po', poNumber },
  }
}

async function getVendorOrderStatus(
  vendor: admin.firestore.DocumentData,
  credentials: Record<string, string>,
  vendorOrderNumber: string
): Promise<{ trackingNumbers: string[]; carrier?: string }> {
  // Implement per-vendor status checking
  return { trackingNumbers: [] }
}

async function awardPointsViaAdmin(
  uid: string,
  points: number,
  orderId: string
): Promise<void> {
  const userRef = db.collection('users').doc(uid)
  const ledgerRef = db.collection('users').doc(uid).collection('pointsLedger').doc()

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists()) return

    const currentBalance = userSnap.data()!.pointsBalance ?? 0
    const newBalance = currentBalance + points

    tx.update(userRef, {
      pointsBalance: newBalance,
      lifetimePointsEarned: admin.firestore.FieldValue.increment(points),
    })

    tx.set(ledgerRef, {
      uid,
      type: 'earn_purchase',
      amount: points,
      balanceAfter: newBalance,
      orderId,
      reason: `Purchase points for order ${orderId}`,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + (18 * 30 * 24 * 60 * 60 * 1000)),
    })
  })
}
