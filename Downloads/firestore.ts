// src/lib/firebase/firestore.ts
// ─── TYPED FIRESTORE COLLECTION REFERENCES ───────────────────
// Central place for all collection names and typed converters.
// Import from here instead of using raw strings everywhere.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  QueryConstraint,
  DocumentData,
  FirestoreDataConverter,
  WithFieldValue,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from 'firebase/firestore'
import { db } from './config'
import type {
  User,
  Product,
  Vehicle,
  FitmentData,
  Vendor,
  Order,
  VendorOrder,
  Cart,
  PointsTransaction,
  PointsRules,
  MAPEntry,
  MAPAlert,
  CompetitorPricingEntry,
  EmailJob,
  DashboardMetrics,
} from '@/types'

// ─── COLLECTION NAMES ────────────────────────────────────────
export const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  VEHICLES: 'vehicles',
  FITMENT: 'fitment',
  VENDORS: 'vendors',
  VENDOR_INVENTORY: 'vendorInventory',       // {vendorId}_{sku}
  ORDERS: 'orders',
  VENDOR_ORDERS: 'vendorOrders',             // subcollection of orders
  ORDER_TIMELINE: 'orderTimeline',           // subcollection of orders
  CARTS: 'carts',
  POINTS_LEDGER: 'pointsLedger',            // subcollection of users
  MAP_PRICING: 'mapPricing',
  MAP_ALERTS: 'mapAlerts',
  COMPETITOR_PRICING: 'competitorPricing',
  EMAIL_QUEUE: 'emailQueue',
  SITE_CONFIG: 'siteConfig',
  BACK_IN_STOCK: 'backInStockAlerts',
} as const

// ─── GENERIC CONVERTER FACTORY ───────────────────────────────
function createConverter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore(data: WithFieldValue<T>): DocumentData {
      return data as DocumentData
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options: SnapshotOptions): T {
      return { id: snapshot.id, ...snapshot.data(options) } as T
    },
  }
}

// ─── TYPED COLLECTION REFERENCES ─────────────────────────────
export const Collections = {
  users: () => collection(db, COLLECTIONS.USERS).withConverter(createConverter<User>()),
  products: () => collection(db, COLLECTIONS.PRODUCTS).withConverter(createConverter<Product>()),
  vehicles: () => collection(db, COLLECTIONS.VEHICLES).withConverter(createConverter<Vehicle>()),
  fitment: () => collection(db, COLLECTIONS.FITMENT).withConverter(createConverter<FitmentData>()),
  vendors: () => collection(db, COLLECTIONS.VENDORS).withConverter(createConverter<Vendor>()),
  orders: () => collection(db, COLLECTIONS.ORDERS).withConverter(createConverter<Order>()),
  carts: () => collection(db, COLLECTIONS.CARTS).withConverter(createConverter<Cart>()),
  mapPricing: () => collection(db, COLLECTIONS.MAP_PRICING).withConverter(createConverter<MAPEntry>()),
  mapAlerts: () => collection(db, COLLECTIONS.MAP_ALERTS).withConverter(createConverter<MAPAlert>()),
  competitorPricing: () => collection(db, COLLECTIONS.COMPETITOR_PRICING).withConverter(createConverter<CompetitorPricingEntry>()),
  emailQueue: () => collection(db, COLLECTIONS.EMAIL_QUEUE).withConverter(createConverter<EmailJob>()),

  // Subcollections
  vendorOrders: (orderId: string) =>
    collection(db, COLLECTIONS.ORDERS, orderId, COLLECTIONS.VENDOR_ORDERS)
      .withConverter(createConverter<VendorOrder>()),
  orderTimeline: (orderId: string) =>
    collection(db, COLLECTIONS.ORDERS, orderId, COLLECTIONS.ORDER_TIMELINE),
  pointsLedger: (uid: string) =>
    collection(db, COLLECTIONS.USERS, uid, COLLECTIONS.POINTS_LEDGER)
      .withConverter(createConverter<PointsTransaction>()),
}

// ─── COMMON FETCH HELPERS ────────────────────────────────────

export async function getUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(Collections.users(), uid))
  return snap.exists() ? snap.data() : null
}

export async function getProduct(sku: string): Promise<Product | null> {
  const snap = await getDoc(doc(Collections.products(), sku))
  return snap.exists() ? snap.data() : null
}

export async function getCart(cartId: string): Promise<Cart | null> {
  const snap = await getDoc(doc(Collections.carts(), cartId))
  return snap.exists() ? snap.data() : null
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const snap = await getDoc(doc(Collections.orders(), orderId))
  return snap.exists() ? snap.data() : null
}

// ─── SITE CONFIG ─────────────────────────────────────────────

export async function getPointsRules(): Promise<PointsRules> {
  const snap = await getDoc(doc(db, COLLECTIONS.SITE_CONFIG, 'pointsRules'))
  if (snap.exists()) return snap.data() as PointsRules

  // Default rules if not configured yet
  const defaults: PointsRules = {
    earnRatePerDollar: 10,           // $1 = 10 points
    redeemRate: 100,                 // 100 points = $1
    minRedemptionPoints: 500,        // must have at least $5 worth
    maxRedemptionPctPerOrder: 0.20,  // max 20% of order total
    reviewPoints: 250,
    garageAddPoints: 100,
    birthdayPoints: 200,
    referralPoints: 500,
    expirationMonths: 18,
  }
  return defaults
}

// Re-export Firestore utilities so components only import from this file
export {
  getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter,
  onSnapshot, writeBatch, runTransaction,
  serverTimestamp, increment, arrayUnion, arrayRemove,
  Timestamp, doc, collection,
  type QueryConstraint,
}
