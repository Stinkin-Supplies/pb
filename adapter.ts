/**
 * lib/vendors/wps/adapter.ts
 *
 * WPS-Inc vendor adapter.
 * Implements VendorAdapter — fetches inventory and submits POs via WPS API.
 *
 * WPS PO flow (3 steps):
 *   1. POST /carts          — create cart with shipping details + po_number
 *   2. POST /carts/{po}/items — add each line item
 *   3. POST /orders         — submit cart as order
 *
 * Docs: https://developer.wps-inc.com
 * Auth: Bearer token via WPS_API_KEY env var
 */

import type {
  VendorAdapter,
  VendorOffer,
  PurchaseOrder,
  POResult,
  ShippingOption,
  OfferStatus,
} from '@/lib/routing/types';

// ---------------------------------------------------------------------------
// WPS API base + auth
// ---------------------------------------------------------------------------

const WPS_BASE = 'https://api.wps-inc.com';

function wpsHeaders() {
  return {
    Authorization:  `Bearer ${process.env.WPS_API_KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  };
}

// ---------------------------------------------------------------------------
// ship_via code map — WPS codes → our label
// ---------------------------------------------------------------------------

const SHIP_VIA_MAP: Record<string, string> = {
  'Ground':    'BEST',   // Best ground method
  'UPS':       'UPS',    // UPS Ground
  '2-Day':     'UP2D',   // UPS 2 Day Blue
  'Overnight': 'UP1D',   // UPS 1 Day Red
  'FedEx':     'FDXG',   // FedEx Ground
  'FedEx 2D':  'FE2D',   // FedEx 2 Day
  'FedEx 1D':  'FE1D',   // FedEx 1 Day
  'USPS':      'US1C',   // USPS Priority Mail
};

function resolveShipVia(label: string): string {
  return SHIP_VIA_MAP[label] ?? 'BEST';
}

// ---------------------------------------------------------------------------
// Raw WPS API shapes
// ---------------------------------------------------------------------------

interface WpsItem {
  id:            number;
  item_number:   string;
  list_price:    string;
  dealer_price:  string;
  map_price:     string | null;
  status:        string;   // "STK" | "DSC" | "N/A"
}

interface WpsInventory {
  item_number: string;
  total:       number;
  warehouses:  { warehouse: string; quantity: number }[];
}

interface WpsCartResponse {
  cart_number: string;
  po_number:   string;
}

interface WpsCartItemResponse {
  sku:                 string;
  name:                string;
  available_quantity:  number;
  backorder_quantity:  number;
  dealer_price:        number;
}

interface WpsOrderResponse {
  order_number: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wpsStatusToOfferStatus(wpsStatus: string, qty: number): OfferStatus {
  if (wpsStatus === 'DSC') return 'unavailable';
  if (qty > 0) return 'available';
  return 'backorder';
}

const WPS_DEFAULT_SHIPPING: ShippingOption[] = [
  { label: 'Ground',    carrier: 'UPS',   transitDays: 5, cost: 8.99,  retailRate: 0     },
  { label: '2-Day',     carrier: 'UPS',   transitDays: 2, cost: 18.99, retailRate: 12.99 },
  { label: 'Overnight', carrier: 'UPS',   transitDays: 1, cost: 34.99, retailRate: 24.99 },
];

// ---------------------------------------------------------------------------
// WPS Adapter
// ---------------------------------------------------------------------------

export const wpsAdapter: VendorAdapter = {
  vendorId: 'WPS',

  // -------------------------------------------------------------------------
  // fetchOffers — parallel items + inventory fetch
  // -------------------------------------------------------------------------
  async fetchOffers(skus, retailPrices) {
    if (skus.length === 0) return [];

    const itemNumbers = skus.join(',');

    const [itemsRes, inventoryRes] = await Promise.allSettled([
      fetch(`${WPS_BASE}/items?filter[item_number]=${itemNumbers}`, {
        headers: wpsHeaders(),
      }),
      fetch(`${WPS_BASE}/inventory?filter[item_number]=${itemNumbers}`, {
        headers: wpsHeaders(),
      }),
    ]);

    // Parse items
    let items: WpsItem[] = [];
    if (itemsRes.status === 'fulfilled' && itemsRes.value.ok) {
      const json = await itemsRes.value.json();
      items = json.data ?? [];
    } else {
      console.error('[WPS] items fetch failed:', itemsRes);
    }

    // Parse inventory
    const inventoryMap = new Map<string, number>();
    if (inventoryRes.status === 'fulfilled' && inventoryRes.value.ok) {
      const json = await inventoryRes.value.json();
      const inv: WpsInventory[] = json.data ?? [];
      inv.forEach(i => inventoryMap.set(i.item_number, i.total));
    } else {
      console.error('[WPS] inventory fetch failed:', inventoryRes);
    }

    return items.map(item => {
      const sku      = item.item_number;
      const stockQty = inventoryMap.get(sku) ?? 0;
      const cost     = parseFloat(item.dealer_price) || 0;
      const mapPrice = item.map_price ? parseFloat(item.map_price) : null;
      const retailPrice = retailPrices[sku] ?? parseFloat(item.list_price) ?? 0;

      return {
        vendor:          'WPS' as const,
        sku,
        cost,
        mapPrice,
        retailPrice,
        stockQty,
        status:          wpsStatusToOfferStatus(item.status, stockQty),
        restockDate:     null,
        shippingOptions: WPS_DEFAULT_SHIPPING,
      } satisfies VendorOffer;
    });
  },

  // -------------------------------------------------------------------------
  // submitPO — 3-step WPS cart flow
  // Step 1: Create cart with shipping details
  // Step 2: Add items to cart
  // Step 3: Submit cart as order
  // -------------------------------------------------------------------------
  async submitPO(order: PurchaseOrder): Promise<POResult> {
    const poNumber  = order.orderId;
    const shipVia   = resolveShipVia(order.shippingOption.label);
    const addr      = order.shippingAddress;

    // ── Step 1: Create cart ─────────────────────────────────────────────────
    let cartRes: Response;
    try {
      cartRes = await fetch(`${WPS_BASE}/carts`, {
        method:  'POST',
        headers: wpsHeaders(),
        body: JSON.stringify({
          po_number:          poNumber,
          ship_via:           shipVia,
          ship_name:          addr.name.slice(0, 30),
          ship_address1:      addr.line1.slice(0, 30),
          ship_address2:      (addr.line2 ?? '').slice(0, 30),
          ship_city:          addr.city.slice(0, 17),
          ship_state:         addr.state.slice(0, 2),
          ship_zip:           addr.postalCode.slice(0, 15),
          ship_phone:         (addr.phone ?? '').slice(0, 15),
          email:              order.customerEmail.slice(0, 50),
          allow_backorder:    false,
          multiple_warehouse: true,
          pay_type:           'OO',  // open order — dealer account
        }),
      });
    } catch (err) {
      return {
        success:           false,
        vendorOrderId:     null,
        estimatedShipDate: null,
        error:             `WPS cart create failed: ${err instanceof Error ? err.message : err}`,
      };
    }

    if (!cartRes.ok) {
      const data = await cartRes.json().catch(() => ({}));
      return {
        success:           false,
        vendorOrderId:     null,
        estimatedShipDate: null,
        error:             data?.message ?? `WPS cart create error ${cartRes.status}`,
        rawResponse:       data,
      };
    }

    const cartData: WpsCartResponse = await cartRes.json();
    console.log(`[WPS] Cart created: ${cartData.cart_number} (PO: ${poNumber})`);

    // ── Step 2: Add items to cart ───────────────────────────────────────────
    const itemErrors: string[] = [];

    for (const line of order.lines) {
      try {
        const itemRes = await fetch(`${WPS_BASE}/carts/${poNumber}/items`, {
          method:  'POST',
          headers: wpsHeaders(),
          body: JSON.stringify({
            item_sku: line.sku,
            quantity: line.qty,
          }),
        });

        if (!itemRes.ok) {
          const data = await itemRes.json().catch(() => ({}));
          const msg  = data?.message ?? `HTTP ${itemRes.status}`;
          console.error(`[WPS] Failed to add SKU ${line.sku}: ${msg}`);
          itemErrors.push(`${line.sku}: ${msg}`);
        } else {
          const itemData: WpsCartItemResponse = await itemRes.json();
          console.log(`[WPS] Added ${line.sku} — available: ${itemData.available_quantity} backorder: ${itemData.backorder_quantity}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[WPS] Exception adding SKU ${line.sku}: ${msg}`);
        itemErrors.push(`${line.sku}: ${msg}`);
      }
    }

    // If all items failed, abort
    if (itemErrors.length === order.lines.length) {
      return {
        success:           false,
        vendorOrderId:     null,
        estimatedShipDate: null,
        error:             `All items failed to add to WPS cart: ${itemErrors.join(', ')}`,
      };
    }

    // ── Step 3: Submit cart as order ────────────────────────────────────────
    let orderRes: Response;
    try {
      orderRes = await fetch(`${WPS_BASE}/orders`, {
        method:  'POST',
        headers: wpsHeaders(),
        body: JSON.stringify({ po_number: poNumber }),
      });
    } catch (err) {
      return {
        success:           false,
        vendorOrderId:     null,
        estimatedShipDate: null,
        error:             `WPS order submit failed: ${err instanceof Error ? err.message : err}`,
      };
    }

    const orderData = await orderRes.json().catch(() => ({}));

    if (!orderRes.ok) {
      return {
        success:           false,
        vendorOrderId:     null,
        estimatedShipDate: null,
        error:             orderData?.message ?? `WPS order submit error ${orderRes.status}`,
        rawResponse:       orderData,
      };
    }

    const wpsOrderData = orderData as WpsOrderResponse;

    return {
      success:           true,
      vendorOrderId:     wpsOrderData.order_number ?? null,
      estimatedShipDate: null,  // WPS doesn't return this at submit time
      rawResponse:       orderData,
      // Surface partial item errors as a warning in the metadata
      ...(itemErrors.length > 0 && {
        error: `Order submitted but ${itemErrors.length} item(s) had issues: ${itemErrors.join(', ')}`,
      }),
    };
  },

  // -------------------------------------------------------------------------
  // getRestockDate — WPS does not expose restock dates via API
  // -------------------------------------------------------------------------
  async getRestockDate(_sku: string): Promise<string | null> {
    return null;
  },
};

// ---------------------------------------------------------------------------
// WPS Dealer Pricing — async file generation with polling
// ---------------------------------------------------------------------------

/**
 * Fetch the full WPS dealer pricing file.
 * WPS generates this async — poll until 200, then download the file.
 *
 * Usage in nightly cron:
 *   const rows = await fetchWpsDealerPricing();
 *   // rows: [{ item_number, dealer_price, map_price, list_price }, ...]
 */
export async function fetchWpsDealerPricing(
  maxAttempts = 20,
  pollIntervalMs = 5000
): Promise<WpsPricingRow[]> {
  console.log('[WPS Pricing] Requesting dealer pricing file...');

  let fileUrl: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${WPS_BASE}/dealer-pricing`, {
      headers: wpsHeaders(),
    });

    if (res.status === 200) {
      const data = await res.json();
      fileUrl = data.location ?? data.url ?? null;
      if (fileUrl) {
        console.log(`[WPS Pricing] File ready on attempt ${attempt}: ${fileUrl}`);
        break;
      }
    } else if (res.status === 202) {
      console.log(`[WPS Pricing] Generating... attempt ${attempt}/${maxAttempts}`);
      await new Promise(r => setTimeout(r, pollIntervalMs));
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(`[WPS Pricing] Unexpected status ${res.status}: ${text}`);
    }
  }

  if (!fileUrl) {
    throw new Error(`[WPS Pricing] File not ready after ${maxAttempts} attempts`);
  }

  // Download the pricing file
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`[WPS Pricing] Failed to download file: ${fileRes.status}`);
  }

  const text = await fileRes.text();
  return parseWpsPricingFile(text);
}

/**
 * Fetch pricing for a single WPS item by item ID.
 * Use for real-time price checks at checkout.
 */
export async function fetchWpsItemPricing(itemId: string | number): Promise<WpsPricingRow | null> {
  const res = await fetch(`${WPS_BASE}/dealer-pricing/${itemId}`, {
    headers: wpsHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    item_number:  data.item_number  ?? String(itemId),
    dealer_price: parseFloat(data.dealer_price ?? data.price ?? '0'),
    map_price:    data.map_price    ? parseFloat(data.map_price) : null,
    list_price:   data.list_price   ? parseFloat(data.list_price) : null,
  };
}

export interface WpsPricingRow {
  item_number:  string;
  dealer_price: number;
  map_price:    number | null;
  list_price:   number | null;
}

/**
 * Parse the WPS dealer pricing CSV/JSON file.
 * WPS returns CSV — adjust if they return JSON.
 */
function parseWpsPricingFile(raw: string): WpsPricingRow[] {
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const rows: WpsPricingRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });

    const itemNum = row['item_number'] ?? row['item number'] ?? row['sku'] ?? '';
    if (!itemNum) continue;

    rows.push({
      item_number:  itemNum,
      dealer_price: parseFloat(row['dealer_price'] ?? row['dealer price'] ?? row['cost'] ?? '0') || 0,
      map_price:    row['map_price'] ? parseFloat(row['map_price']) : null,
      list_price:   row['list_price'] ? parseFloat(row['list_price']) : null,
    });
  }

  console.log(`[WPS Pricing] Parsed ${rows.length} pricing rows`);
  return rows;
}
