// src/lib/vendors/adapters.ts
// ─── VENDOR ADAPTER SYSTEM ───────────────────────────────────
// Each vendor has its own adapter that normalizes their data format
// into your internal Product schema. Add new vendors by implementing
// the VendorAdapter interface.

import type { Product, VendorSource, Vendor } from '@/types'
import { Timestamp } from 'firebase/firestore'
import { calculateInitialPrice } from '@/lib/map/engine'

// ─── BASE ADAPTER INTERFACE ───────────────────────────────────

export interface RawVendorProduct {
  vendorSku: string
  partNumber: string
  name: string
  brand: string
  description?: string
  cost: number
  mapPrice: number
  msrp: number
  upc?: string
  weight?: number
  inStock: boolean
  stockQty?: number
  images?: string[]
  categories?: string[]
  attributes?: Record<string, string>
  acesData?: AcesVehicleApplication[]  // fitment data
  piesPkg?: PiesPackage
}

export interface AcesVehicleApplication {
  year: number
  make: string
  model: string
  submodel?: string
  notes?: string
}

export interface PiesPackage {
  length?: number
  width?: number
  height?: number
  weight?: number
  weightUnit?: 'LB' | 'KG'
  dimUnit?: 'IN' | 'CM'
}

export interface VendorSyncResult {
  vendorId: string
  productsProcessed: number
  productsCreated: number
  productsUpdated: number
  errors: string[]
  startedAt: Date
  completedAt: Date
}

export abstract class VendorAdapter {
  constructor(
    protected vendor: Vendor,
    protected credentials: VendorCredentials
  ) {}

  abstract fetchProducts(lastSyncAt?: Date): Promise<RawVendorProduct[]>
  abstract fetchInventory(): Promise<Map<string, { inStock: boolean; qty: number }>>
  abstract submitOrder(po: PurchaseOrder): Promise<VendorOrderConfirmation>
  abstract getOrderStatus(vendorOrderNumber: string): Promise<VendorOrderStatus>

  /**
   * Normalize vendor product to internal schema.
   * Each adapter can override this if needed.
   */
  normalizeProduct(raw: RawVendorProduct): Partial<Product> {
    const vendorSource: VendorSource = {
      vendorId: this.vendor.id,
      vendorName: this.vendor.name,
      vendorSku: raw.vendorSku,
      cost: raw.cost,
      mapPrice: raw.mapPrice,
      msrp: raw.msrp,
      inStock: raw.inStock,
      stockQty: raw.stockQty,
      lastSyncedAt: Timestamp.now(),
    }

    const ourPrice = calculateInitialPrice({
      vendorCost: raw.cost,
      mapPrice: raw.mapPrice,
      msrp: raw.msrp,
      markupPct: this.vendor.defaultMarkupPct,
      minMarginPct: this.vendor.minMarginPct,
      roundToNine: true,
    })

    const slug = this.generateSlug(raw.name, raw.partNumber)

    return {
      sku: raw.partNumber,   // use manufacturer part number as primary SKU
      partNumber: raw.partNumber,
      upc: raw.upc,
      name: raw.name,
      slug,
      brand: raw.brand,
      description: raw.description ?? '',
      shortDescription: raw.description?.substring(0, 160) ?? '',
      images: raw.images?.map((url, i) => ({
        url,
        alt: raw.name,
        isPrimary: i === 0,
        sortOrder: i,
      })) ?? [],
      attributes: Object.entries(raw.attributes ?? {}).map(([name, value]) => ({
        name,
        value,
      })),
      ourPrice,
      mapFloor: raw.mapPrice,
      msrp: raw.msrp,
      vendorSources: [vendorSource],
      preferredVendorId: this.vendor.id,
      inStock: raw.inStock,
      totalAvailableQty: raw.stockQty ?? 0,
      isUniversal: false,
      fitmentCount: 0,
      weight: raw.piesPkg?.weight,
      dimensions: raw.piesPkg ? {
        l: raw.piesPkg.length ?? 0,
        w: raw.piesPkg.width ?? 0,
        h: raw.piesPkg.height ?? 0,
      } : undefined,
      status: 'active',
      condition: 'new',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      searchKeywords: this.generateSearchKeywords(raw),
    }
  }

  protected generateSlug(name: string, partNumber: string): string {
    const slugified = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return `${slugified}-${partNumber.toLowerCase()}`
  }

  protected generateSearchKeywords(raw: RawVendorProduct): string[] {
    const keywords = [
      raw.name.toLowerCase(),
      raw.partNumber.toLowerCase(),
      raw.brand.toLowerCase(),
      raw.vendorSku.toLowerCase(),
    ]
    if (raw.upc) keywords.push(raw.upc)
    return [...new Set(keywords)]
  }
}

// ─── WPS ADAPTER ─────────────────────────────────────────────
// WPS (Western Power Sports) REST API integration
// Docs: request from your WPS rep after account setup

export class WPSAdapter extends VendorAdapter {
  private baseUrl = 'https://api.wps-inc.com/api'

  async fetchProducts(lastSyncAt?: Date): Promise<RawVendorProduct[]> {
    const products: RawVendorProduct[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: '250',
        include: 'images,fitment,pricing',
      })

      if (lastSyncAt) {
        params.set('updated_after', lastSyncAt.toISOString())
      }

      const response = await fetch(`${this.baseUrl}/products?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}`,
          'Account-Number': this.credentials.accountNumber,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`WPS API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      for (const item of data.data ?? []) {
        products.push(this.parseWPSProduct(item))
      }

      hasMore = data.meta?.current_page < data.meta?.last_page
      page++
    }

    return products
  }

  async fetchInventory(): Promise<Map<string, { inStock: boolean; qty: number }>> {
    const inventory = new Map<string, { inStock: boolean; qty: number }>()

    const response = await fetch(`${this.baseUrl}/inventory`, {
      headers: {
        'Authorization': `Bearer ${this.credentials.apiKey}`,
        'Account-Number': this.credentials.accountNumber,
      },
    })

    const data = await response.json()

    for (const item of data.data ?? []) {
      inventory.set(item.part_number, {
        inStock: item.quantity_available > 0,
        qty: item.quantity_available,
      })
    }

    return inventory
  }

  async submitOrder(po: PurchaseOrder): Promise<VendorOrderConfirmation> {
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.credentials.apiKey}`,
        'Account-Number': this.credentials.accountNumber,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purchase_order_number: po.poNumber,
        ship_to: {
          name: `${po.shippingAddress.firstName} ${po.shippingAddress.lastName}`,
          address1: po.shippingAddress.address1,
          address2: po.shippingAddress.address2,
          city: po.shippingAddress.city,
          state: po.shippingAddress.state,
          zip: po.shippingAddress.zip,
          phone: po.shippingAddress.phone,
        },
        shipping_method: po.shippingMethod ?? 'GROUND',
        line_items: po.lineItems.map(item => ({
          part_number: item.vendorSku,
          quantity: item.qty,
        })),
        notes: po.notes,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`WPS order submission failed: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return {
      vendorOrderNumber: data.order_number,
      status: 'confirmed',
      estimatedShipDate: data.estimated_ship_date ? new Date(data.estimated_ship_date) : undefined,
      rawResponse: data,
    }
  }

  async getOrderStatus(vendorOrderNumber: string): Promise<VendorOrderStatus> {
    const response = await fetch(`${this.baseUrl}/orders/${vendorOrderNumber}`, {
      headers: {
        'Authorization': `Bearer ${this.credentials.apiKey}`,
        'Account-Number': this.credentials.accountNumber,
      },
    })

    const data = await response.json()
    return this.parseWPSOrderStatus(data)
  }

  private parseWPSProduct(item: Record<string, unknown>): RawVendorProduct {
    // Parse WPS API response format into normalized RawVendorProduct
    // Field names based on WPS API documentation — verify with actual API response
    return {
      vendorSku: item.sku as string,
      partNumber: item.part_number as string ?? item.sku as string,
      name: item.name as string,
      brand: (item.brand as Record<string, unknown>)?.name as string ?? '',
      description: item.description as string,
      cost: parseFloat(item.dealer_price as string ?? '0'),
      mapPrice: parseFloat(item.map_price as string ?? '0'),
      msrp: parseFloat(item.msrp as string ?? '0'),
      upc: item.upc as string,
      inStock: (item.availability as string) === 'in_stock',
      stockQty: parseInt(item.quantity_available as string ?? '0'),
      images: Array.isArray(item.images)
        ? (item.images as Record<string, unknown>[]).map(img => img.url as string)
        : [],
      attributes: {},
    }
  }

  private parseWPSOrderStatus(data: Record<string, unknown>): VendorOrderStatus {
    const trackingNumbers: string[] = []
    if (Array.isArray(data.shipments)) {
      for (const shipment of data.shipments as Record<string, unknown>[]) {
        if (shipment.tracking_number) {
          trackingNumbers.push(shipment.tracking_number as string)
        }
      }
    }

    return {
      status: this.mapWPSStatus(data.status as string),
      trackingNumbers,
      carrier: data.carrier as string,
      shippedAt: data.shipped_date ? new Date(data.shipped_date as string) : undefined,
      estimatedDelivery: data.estimated_delivery ? new Date(data.estimated_delivery as string) : undefined,
    }
  }

  private mapWPSStatus(wpsStatus: string): 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' {
    const map: Record<string, 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'> = {
      'pending': 'pending',
      'processing': 'confirmed',
      'shipped': 'shipped',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
    }
    return map[wpsStatus?.toLowerCase()] ?? 'pending'
  }
}

// ─── DRAG SPECIALTIES ADAPTER ─────────────────────────────────
// DS uses FTP file feeds + their B2B portal for orders
// Contact: dealer.dragspecialties.com for feed access

export class DragSpecialtiesAdapter extends VendorAdapter {
  private ftpHost: string
  private ftpPath: string

  constructor(vendor: Vendor, credentials: VendorCredentials) {
    super(vendor, credentials)
    this.ftpHost = vendor.ftpHost ?? 'ftp.dragspecialties.com'
    this.ftpPath = vendor.ftpPath ?? '/feeds/'
  }

  async fetchProducts(lastSyncAt?: Date): Promise<RawVendorProduct[]> {
    // DS delivers CSV/XML product files via FTP
    // In Cloud Functions environment, use sftp or ftp npm package
    // Files: products.csv, pricing.csv, inventory.csv, fitment.xml (ACES)

    // This runs in Firebase Cloud Functions where you have full Node.js access
    // Implementation depends on whether DS grants API or FTP access to your account

    // Placeholder - implement based on DS feed format you receive
    console.log(`Fetching DS feed from ${this.ftpHost}${this.ftpPath}`)

    // TODO: Implement FTP download and CSV parsing
    // 1. Connect to FTP with credentials from Secret Manager
    // 2. Download latest product CSV
    // 3. Parse CSV rows into RawVendorProduct[]
    // 4. Download and parse ACES XML for fitment
    // 5. Merge fitment into products

    return []
  }

  async fetchInventory(): Promise<Map<string, { inStock: boolean; qty: number }>> {
    // DS has a real-time inventory check endpoint or daily inventory file
    // Check with your DS rep for current availability method
    return new Map()
  }

  async submitOrder(po: PurchaseOrder): Promise<VendorOrderConfirmation> {
    // Option 1: DS EDI 850 (Electronic Data Interchange) - for high volume
    // Option 2: DS B2B portal API (if available to your account)
    // Option 3: Automated browser submission to dealer.dragspecialties.com
    // Option 4: Email PO (fallback) - generates formatted email

    // For now, implement email PO as fallback while you get API access
    await this.sendPurchaseOrderEmail(po)

    return {
      vendorOrderNumber: `DS-PO-${po.poNumber}`,
      status: 'pending',  // Email PO requires manual confirmation
      rawResponse: { method: 'email', sent: true },
    }
  }

  async getOrderStatus(vendorOrderNumber: string): Promise<VendorOrderStatus> {
    // Without API access, this requires manual checking or web scraping
    // Set up webhook endpoint on your side and ask DS rep about tracking feeds
    return {
      status: 'pending',
      trackingNumbers: [],
    }
  }

  private async sendPurchaseOrderEmail(po: PurchaseOrder): Promise<void> {
    // Format PO as email to DS
    // This is the fallback method - replace with API when available
    const lines = po.lineItems.map(item =>
      `${item.vendorSku} | ${item.description} | Qty: ${item.qty}`
    ).join('\n')

    console.log(`
      TO: orders@dragspecialties.com
      SUBJECT: Purchase Order ${po.poNumber} - ${po.dealerAccountNumber}
      
      SHIP TO:
      ${po.shippingAddress.firstName} ${po.shippingAddress.lastName}
      ${po.shippingAddress.address1}
      ${po.shippingAddress.city}, ${po.shippingAddress.state} ${po.shippingAddress.zip}
      
      LINE ITEMS:
      ${lines}
      
      Customer Order: ${po.customerOrderId}
    `)

    // TODO: Implement with Resend or your email service
  }
}

// ─── VENDOR REGISTRY ─────────────────────────────────────────
// Map vendor IDs to their adapter classes

const ADAPTER_MAP = {
  'wps': WPSAdapter,
  'drag_specialties': DragSpecialtiesAdapter,
  // Add new vendors here:
  // 'tucker_rocky': TuckerRockyAdapter,
  // 'parts_unlimited': PartsUnlimitedAdapter,
  // 'klim': KLIMAdapter,
} as const

export function getVendorAdapter(
  vendor: Vendor,
  credentials: VendorCredentials
): VendorAdapter {
  const AdapterClass = ADAPTER_MAP[vendor.slug as keyof typeof ADAPTER_MAP]
  if (!AdapterClass) {
    throw new Error(`No adapter found for vendor: ${vendor.slug}`)
  }
  return new AdapterClass(vendor, credentials)
}

// ─── SHARED TYPES ─────────────────────────────────────────────

export interface VendorCredentials {
  apiKey?: string
  apiSecret?: string
  accountNumber: string
  username?: string
  password?: string
  ftpUser?: string
  ftpPassword?: string
}

export interface PurchaseOrder {
  poNumber: string           // your internal PO number
  customerOrderId: string    // customer's order in your system
  dealerAccountNumber: string
  lineItems: Array<{
    vendorSku: string
    partNumber: string
    description: string
    qty: number
    unitCost: number
  }>
  shippingAddress: {
    firstName: string
    lastName: string
    company?: string
    address1: string
    address2?: string
    city: string
    state: string
    zip: string
    phone?: string
  }
  shippingMethod?: string
  notes?: string
}

export interface VendorOrderConfirmation {
  vendorOrderNumber: string
  status: 'confirmed' | 'pending' | 'error'
  estimatedShipDate?: Date
  rawResponse: unknown
  errorMessage?: string
}

export interface VendorOrderStatus {
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  trackingNumbers: string[]
  carrier?: string
  shippedAt?: Date
  estimatedDelivery?: Date
}
