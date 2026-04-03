/**
 * lib/vendors/wps/adapter.ts
 *
 * WPS-Inc vendor adapter.
 * Implements VendorAdapter — fetches inventory and submits POs via WPS API.
 *
 * Docs: https://developer.wps-inc.com
 * Auth: Bearer token via WPS_API_KEY env var
 *
 * PO Flow (3-step cart):
 *   1. POST /carts                          → create cart
 *   2. POST /carts/{po_number}/items        → add line items
 *   3. POST /orders                         → submit cart as order
 */

import type {
  VendorAdapter,
  VendorOffer,
  PurchaseOrder,
  POResult,
  ShippingOption,
  OfferStatus,
} from "@/lib/routing/types";

// ---------------------------------------------------------------------------
// WPS API base + auth
// ---------------------------------------------------------------------------

const WPS_BASE = "https://api.wps-inc.com";

function wpsHeaders() {
  return {
    Authorization: `Bearer ${process.env.WPS_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// Raw WPS API shapes
// ---------------------------------------------------------------------------

interface WpsItem {
  id: number;
  item_number: string;
  list_price: string;
  dealer_price: string;
  map_price: string | null;
  status: string; // "STK" | "DSC" | "NLA" | "NA"
}

interface WpsInventoryWarehouse {
  warehouse: string;
  quantity: number;
}

interface WpsInventory {
  item_number: string;
  total: number;
  warehouses: WpsInventoryWarehouse[];
}

interface WpsShipMethod {
  service: string;
  carrier: string;
  transit_days: number;
  rate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wpsStatusToOfferStatus(wpsStatus: string, qty: number): OfferStatus {
  if (["DSC", "NLA", "NA"].includes(wpsStatus)) return "unavailable";
  if (qty > 0) return "available";
  return "backorder";
}

function buildShippingOptions(methods: WpsShipMethod[]): ShippingOption[] {
  if (!methods || methods.length === 0) {
    return [
      { label: "Ground",    carrier: "UPS", transitDays: 5, cost: 8.99,  retailRate: 0 },
      { label: "2-Day",     carrier: "UPS", transitDays: 2, cost: 18.99, retailRate: 12.99 },
      { label: "Overnight", carrier: "UPS", transitDays: 1, cost: 34.99, retailRate: 24.99 },
    ];
  }
  return methods.map((m) => ({
    label:       m.service,
    carrier:     m.carrier,
    transitDays: m.transit_days,
    cost:        m.rate,
    retailRate:  m.rate > 15 ? m.rate - 5 : 0,
  }));
}

// ---------------------------------------------------------------------------
// WPS Adapter
// ---------------------------------------------------------------------------

export const wpsAdapter: VendorAdapter = {
  vendorId: "WPS",

  // -------------------------------------------------------------------------
  // fetchOffers — items + inventory in parallel
  // Correct endpoint: GET /items?filter[sku]={sku}&include=inventory
  // -------------------------------------------------------------------------
  async fetchOffers(skus, retailPrices) {
    if (skus.length === 0) return [];

    // WPS requires individual SKU filters — batch in chunks of 50
    const CHUNK = 50;
    const allOffers: VendorOffer[] = [];

    for (let i = 0; i < skus.length; i += CHUNK) {
      const chunk = skus.slice(i, i + CHUNK);
      const filterParam = chunk.map((s) => `filter[sku][]=${encodeURIComponent(s)}`).join("&");

      const [itemsRes, inventoryRes] = await Promise.allSettled([
        fetch(`${WPS_BASE}/items?${filterParam}&include=inventory`, {
          headers: wpsHeaders(),
        }),
        fetch(`${WPS_BASE}/items?${filterParam}&include=inventory`, {
          headers: wpsHeaders(),
        }),
      ]);

      let items: WpsItem[] = [];
      if (itemsRes.status === "fulfilled" && itemsRes.value.ok) {
        const json = await itemsRes.value.json();
        items = json.data ?? [];
      } else {
        console.error("[WPS] items fetch failed:", itemsRes);
      }

      // Inventory is included in the items response via ?include=inventory
      const inventoryMap = new Map<string, number>();
      if (inventoryRes.status === "fulfilled" && inventoryRes.value.ok) {
        const json = await inventoryRes.value.json();
        const inv: (WpsItem & { inventory?: { total: number } })[] = json.data ?? [];
        inv.forEach((item) => {
          if (item.inventory?.total !== undefined) {
            inventoryMap.set(item.item_number, item.inventory.total);
          }
        });
      }

      const chunkOffers: VendorOffer[] = items.map((item) => {
        const sku        = item.item_number;
        const stockQty   = inventoryMap.get(sku) ?? 0;
        const cost       = parseFloat(item.dealer_price) || 0;
        const mapPrice   = item.map_price ? parseFloat(item.map_price) : null;
        const retailPrice = retailPrices[sku] ?? parseFloat(item.list_price) ?? 0;
        const status     = wpsStatusToOfferStatus(item.status, stockQty);

        return {
          vendor:          "WPS",
          sku,
          cost,
          mapPrice,
          retailPrice,
          stockQty,
          status,
          restockDate:     null,
          shippingOptions: buildShippingOptions([]),
        };
      });

      allOffers.push(...chunkOffers);
    }

    return allOffers;
  },

  // -------------------------------------------------------------------------
  // submitPO — 3-step WPS cart flow
  //   Step 1: POST /carts              → create cart with PO number
  //   Step 2: POST /carts/{po}/items   → add each line item
  //   Step 3: POST /orders             → submit cart as order
  // -------------------------------------------------------------------------
  async submitPO(order: PurchaseOrder): Promise<POResult> {
    const poNumber = order.orderId;

    try {
      // ── Step 1: Create cart ──────────────────────────────────────────────
      const cartRes = await fetch(`${WPS_BASE}/carts`, {
        method: "POST",
        headers: wpsHeaders(),
        body: JSON.stringify({
          po_number:       poNumber,
          shipping_method: order.shippingOption.label,
          ship_to: {
            name:     order.shippingAddress.name,
            address1: order.shippingAddress.line1,
            address2: order.shippingAddress.line2 ?? "",
            city:     order.shippingAddress.city,
            state:    order.shippingAddress.state,
            zip:      order.shippingAddress.postalCode,
            country:  order.shippingAddress.country,
            phone:    order.shippingAddress.phone ?? "",
          },
        }),
      });

      if (!cartRes.ok) {
        const err = await cartRes.json().catch(() => ({}));
        return {
          success: false,
          vendorOrderId: null,
          estimatedShipDate: null,
          error: err?.message ?? `WPS cart creation failed: ${cartRes.status}`,
          rawResponse: err,
        };
      }

      // ── Step 2: Add line items ───────────────────────────────────────────
      for (const line of order.lines) {
        const itemRes = await fetch(`${WPS_BASE}/carts/${poNumber}/items`, {
          method: "POST",
          headers: wpsHeaders(),
          body: JSON.stringify({
            item_number: line.sku,
            quantity:    line.qty,
          }),
        });

        if (!itemRes.ok) {
          const err = await itemRes.json().catch(() => ({}));
          console.error(`[WPS] Failed to add item ${line.sku} to cart:`, err);
          // Continue adding other items — partial PO is better than no PO
        }
      }

      // ── Step 3: Submit order ─────────────────────────────────────────────
      const orderRes = await fetch(`${WPS_BASE}/orders`, {
        method: "POST",
        headers: wpsHeaders(),
        body: JSON.stringify({ po_number: poNumber }),
      });

      const orderData = await orderRes.json().catch(() => ({}));

      if (!orderRes.ok) {
        return {
          success: false,
          vendorOrderId: null,
          estimatedShipDate: null,
          error: orderData?.message ?? `WPS order submission failed: ${orderRes.status}`,
          rawResponse: orderData,
        };
      }

      return {
        success:            true,
        vendorOrderId:      orderData.data?.order_number ?? orderData.order_number ?? null,
        estimatedShipDate:  orderData.data?.estimated_ship_date ?? null,
        rawResponse:        orderData,
      };

    } catch (err) {
      return {
        success:           false,
        vendorOrderId:     null,
        estimatedShipDate: null,
        error:             err instanceof Error ? err.message : "Unknown WPS error",
      };
    }
  },

  // -------------------------------------------------------------------------
  // getRestockDate — WPS does not expose restock dates via API currently
  // -------------------------------------------------------------------------
  async getRestockDate(_sku: string): Promise<string | null> {
    return null;
  },
};
