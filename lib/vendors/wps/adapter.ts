/**
 * lib/vendors/wps/adapter.ts
 *
 * WPS-Inc vendor adapter.
 * Implements VendorAdapter — fetches inventory and submits POs via WPS API.
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
  // Raw WPS API shapes (subset — extend as needed)
  // ---------------------------------------------------------------------------
  
  interface WpsItem {
    id: number;
    item_number: string;        // SKU
    list_price: string;
    dealer_price: string;
    map_price: string | null;
    status: string;             // "STK" | "DSC" | "N/A"
    supplier_product_id?: string;
  }
  
  interface WpsInventory {
    item_number: string;
    total: number;
    warehouses: { warehouse: string; quantity: number }[];
  }
  
  interface WpsShipMethod {
    service: string;            // "UPS Ground", "UPS 2nd Day Air", etc.
    carrier: string;
    transit_days: number;
    rate: number;
  }
  
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  
  function wpsStatusToOfferStatus(wpsStatus: string, qty: number): OfferStatus {
    if (wpsStatus === "DSC") return "unavailable";
    if (qty > 0) return "available";
    return "backorder";
  }
  
  function buildShippingOptions(methods: WpsShipMethod[]): ShippingOption[] {
    if (!methods || methods.length === 0) {
      // Fallback defaults if WPS doesn't return ship methods
      return [
        { label: "Ground", carrier: "UPS", transitDays: 5, cost: 8.99, retailRate: 0 },
        { label: "2-Day", carrier: "UPS", transitDays: 2, cost: 18.99, retailRate: 12.99 },
      ];
    }
  
    return methods.map((m) => ({
      label: m.service,
      carrier: m.carrier,
      transitDays: m.transit_days,
      cost: m.rate,
      retailRate: m.rate > 15 ? m.rate - 5 : 0, // example markup logic — adjust
    }));
  }
  
  // ---------------------------------------------------------------------------
  // WPS Adapter
  // ---------------------------------------------------------------------------
  
  export const wpsAdapter: VendorAdapter = {
    vendorId: "WPS",
  
    // -------------------------------------------------------------------------
    // fetchOffers — parallel items + inventory fetch
    // -------------------------------------------------------------------------
    async fetchOffers(skus, retailPrices) {
      if (skus.length === 0) return [];
  
      const itemNumbers = skus.join(",");
  
      // Fetch item details + inventory in parallel
      const [itemsRes, inventoryRes] = await Promise.allSettled([
        fetch(`${WPS_BASE}/v1/items?itemNumbers=${itemNumbers}&include=images`, {
          headers: wpsHeaders(),
        }),
        fetch(`${WPS_BASE}/v1/inventory?itemNumbers=${itemNumbers}`, {
          headers: wpsHeaders(),
        }),
      ]);
  
      // Parse items
      let items: WpsItem[] = [];
      if (itemsRes.status === "fulfilled" && itemsRes.value.ok) {
        const json = await itemsRes.value.json();
        items = json.data ?? [];
      } else {
        console.error("[WPS] items fetch failed:", itemsRes);
      }
  
      // Parse inventory
      const inventoryMap = new Map<string, number>();
      if (inventoryRes.status === "fulfilled" && inventoryRes.value.ok) {
        const json = await inventoryRes.value.json();
        const inv: WpsInventory[] = json.data ?? [];
        inv.forEach((i) => inventoryMap.set(i.item_number, i.total));
      } else {
        console.error("[WPS] inventory fetch failed:", inventoryRes);
      }
  
      // Build VendorOffer[]
      const offers: VendorOffer[] = items.map((item) => {
        const sku = item.item_number;
        const stockQty = inventoryMap.get(sku) ?? 0;
        const cost = parseFloat(item.dealer_price) || 0;
        const mapPrice = item.map_price ? parseFloat(item.map_price) : null;
        const retailPrice = retailPrices[sku] ?? parseFloat(item.list_price) ?? 0;
        const status = wpsStatusToOfferStatus(item.status, stockQty);
  
        return {
          vendor: "WPS",
          sku,
          cost,
          mapPrice,
          retailPrice,
          stockQty,
          status,
          restockDate: null, // WPS does not currently expose restock dates via API
          shippingOptions: buildShippingOptions([]), // TODO: wire WPS ship rate API
        };
      });
  
      return offers;
    },
  
    // -------------------------------------------------------------------------
    // submitPO — place order with WPS
    // -------------------------------------------------------------------------
    async submitPO(order: PurchaseOrder): Promise<POResult> {
      // WPS order submission endpoint
      // Ref: https://developer.wps-inc.com/#orders
      const payload = {
        purchase_order_number: order.orderId,
        shipping_method: order.shippingOption.label,
        ship_to: {
          name: order.shippingAddress.name,
          address1: order.shippingAddress.line1,
          address2: order.shippingAddress.line2 ?? "",
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          zip: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
          phone: order.shippingAddress.phone ?? "",
        },
        lines: order.lines.map((line) => ({
          item_number: line.sku,
          quantity: line.qty,
        })),
      };
  
      try {
        const res = await fetch(`${WPS_BASE}/v1/orders`, {
          method: "POST",
          headers: wpsHeaders(),
          body: JSON.stringify(payload),
        });
  
        const data = await res.json();
  
        if (!res.ok) {
          return {
            success: false,
            vendorOrderId: null,
            estimatedShipDate: null,
            error: data?.message ?? `WPS error ${res.status}`,
            rawResponse: data,
          };
        }
  
        return {
          success: true,
          vendorOrderId: data.data?.order_number ?? null,
          estimatedShipDate: data.data?.estimated_ship_date ?? null,
          rawResponse: data,
        };
      } catch (err) {
        return {
          success: false,
          vendorOrderId: null,
          estimatedShipDate: null,
          error: err instanceof Error ? err.message : "Unknown WPS error",
        };
      }
    },
  
    // -------------------------------------------------------------------------
    // getRestockDate — WPS doesn't expose this yet, reserved for future
    // -------------------------------------------------------------------------
    async getRestockDate(_sku: string): Promise<string | null> {
      // TODO: check WPS API updates — may be added to inventory endpoint
      return null;
    },
  };
  