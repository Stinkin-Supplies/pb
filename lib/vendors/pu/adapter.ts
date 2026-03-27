/**
 * lib/vendors/pu/adapter.ts
 *
 * Parts Unlimited vendor adapter.
 * Implements VendorAdapter — fetches inventory and submits POs via PU API.
 *
 * Auth: API key via PU_API_KEY + PU_ACCOUNT_NUMBER env vars
 * Note: PU API details should be confirmed against your PU dealer portal docs.
 *       Endpoint shapes here are representative — adjust to match actual spec.
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
  // PU API base + auth
  // ---------------------------------------------------------------------------
  
  const PU_BASE = process.env.PU_API_BASE ?? "https://api.parts-unlimited.com";
  
  function puHeaders() {
    return {
      "X-API-Key": process.env.PU_API_KEY ?? "",
      "X-Account-Number": process.env.PU_ACCOUNT_NUMBER ?? "",
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }
  
  // ---------------------------------------------------------------------------
  // Raw PU API shapes (adjust to match your actual PU API spec)
  // ---------------------------------------------------------------------------
  
  interface PuProduct {
    partNumber: string;
    dealerPrice: number;
    mapPrice: number | null;
    listPrice: number;
    status: string;           // "ACTIVE" | "DISCONTINUED" | "INACTIVE"
  }
  
  interface PuInventoryItem {
    partNumber: string;
    quantityAvailable: number;
    restockDate: string | null; // ISO date or null
    warehouses?: { location: string; qty: number }[];
  }
  
  interface PuShipOption {
    method: string;
    carrier: string;
    transitDays: number;
    cost: number;
  }
  
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  
  function puStatusToOfferStatus(puStatus: string, qty: number): OfferStatus {
    if (puStatus === "DISCONTINUED" || puStatus === "INACTIVE") return "unavailable";
    if (qty > 0) return "available";
    return "backorder";
  }
  
  function buildShippingOptions(methods: PuShipOption[]): ShippingOption[] {
    if (!methods || methods.length === 0) {
      return [
        { label: "Ground", carrier: "FedEx", transitDays: 5, cost: 9.99, retailRate: 0 },
        { label: "Express", carrier: "FedEx", transitDays: 2, cost: 21.99, retailRate: 14.99 },
      ];
    }
  
    return methods.map((m) => ({
      label: m.method,
      carrier: m.carrier,
      transitDays: m.transitDays,
      cost: m.cost,
      retailRate: m.cost > 15 ? m.cost - 5 : 0,
    }));
  }
  
  // ---------------------------------------------------------------------------
  // PU Adapter
  // ---------------------------------------------------------------------------
  
  export const puAdapter: VendorAdapter = {
    vendorId: "PU",
  
    // -------------------------------------------------------------------------
    // fetchOffers — products + inventory in parallel
    // -------------------------------------------------------------------------
    async fetchOffers(skus, retailPrices) {
      if (skus.length === 0) return [];
  
      const [productsRes, inventoryRes] = await Promise.allSettled([
        fetch(`${PU_BASE}/products?partNumbers=${skus.join(",")}`, {
          headers: puHeaders(),
        }),
        fetch(`${PU_BASE}/inventory?partNumbers=${skus.join(",")}`, {
          headers: puHeaders(),
        }),
      ]);
  
      // Parse products
      let products: PuProduct[] = [];
      if (productsRes.status === "fulfilled" && productsRes.value.ok) {
        const json = await productsRes.value.json();
        products = json.items ?? json.data ?? [];
      } else {
        console.error("[PU] products fetch failed:", productsRes);
      }
  
      // Parse inventory
      const inventoryMap = new Map<string, PuInventoryItem>();
      if (inventoryRes.status === "fulfilled" && inventoryRes.value.ok) {
        const json = await inventoryRes.value.json();
        const inv: PuInventoryItem[] = json.items ?? json.data ?? [];
        inv.forEach((i) => inventoryMap.set(i.partNumber, i));
      } else {
        console.error("[PU] inventory fetch failed:", inventoryRes);
      }
  
      const offers: VendorOffer[] = products.map((product) => {
        const sku = product.partNumber;
        const inv = inventoryMap.get(sku);
        const stockQty = inv?.quantityAvailable ?? 0;
        const restockDate = inv?.restockDate ?? null;
        const cost = product.dealerPrice;
        const mapPrice = product.mapPrice ?? null;
        const retailPrice = retailPrices[sku] ?? product.listPrice ?? 0;
        const status = puStatusToOfferStatus(product.status, stockQty);
  
        return {
          vendor: "PU",
          sku,
          cost,
          mapPrice,
          retailPrice,
          stockQty,
          status,
          restockDate,
          shippingOptions: buildShippingOptions([]), // TODO: wire PU ship rate endpoint
        };
      });
  
      return offers;
    },
  
    // -------------------------------------------------------------------------
    // submitPO — place order with Parts Unlimited
    // -------------------------------------------------------------------------
    async submitPO(order: PurchaseOrder): Promise<POResult> {
      const payload = {
        poNumber: order.orderId,
        accountNumber: process.env.PU_ACCOUNT_NUMBER,
        shippingMethod: order.shippingOption.label,
        shipTo: {
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
          partNumber: line.sku,
          quantity: line.qty,
        })),
      };
  
      try {
        const res = await fetch(`${PU_BASE}/orders`, {
          method: "POST",
          headers: puHeaders(),
          body: JSON.stringify(payload),
        });
  
        const data = await res.json();
  
        if (!res.ok) {
          return {
            success: false,
            vendorOrderId: null,
            estimatedShipDate: null,
            error: data?.message ?? `PU error ${res.status}`,
            rawResponse: data,
          };
        }
  
        return {
          success: true,
          vendorOrderId: data.orderNumber ?? data.confirmationNumber ?? null,
          estimatedShipDate: data.estimatedShipDate ?? null,
          rawResponse: data,
        };
      } catch (err) {
        return {
          success: false,
          vendorOrderId: null,
          estimatedShipDate: null,
          error: err instanceof Error ? err.message : "Unknown PU error",
        };
      }
    },
  
    // -------------------------------------------------------------------------
    // getRestockDate — PU includes this in inventory response
    // -------------------------------------------------------------------------
    async getRestockDate(sku: string): Promise<string | null> {
      try {
        const res = await fetch(`${PU_BASE}/inventory?partNumbers=${sku}`, {
          headers: puHeaders(),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const item: PuInventoryItem = (json.items ?? json.data ?? [])[0];
        return item?.restockDate ?? null;
      } catch {
        return null;
      }
    },
  };