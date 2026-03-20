export const runtime = "nodejs";

// ============================================================
// app/api/vendors/wps/inventory/route.ts
// ============================================================
// Live inventory check against the WPS API.
// Call this at add-to-cart time or on the product detail page
// to show accurate warehouse stock levels.
//
// POST  { skus: string[] }
//   → { results: { sku, total_qty, warehouses, in_stock }[] }
//
// GET   ?sku=370-640S,370-640M
//   → same shape (convenient for client-side use)
//
// WPS inventory is real-time — no caching on our end.
// For high-traffic PDPs, add a short Redis TTL (30–60s).
//
// Required env vars:
//   WPS_API_KEY
//   NEXT_PUBLIC_SUPABASE_URL  (not used here but kept for auth)
// ============================================================

import { NextResponse }  from "next/server";
import { WpsClient, WpsItem, WpsInventoryWarehouse } from "@/lib/vendors/wps";

// How many SKUs to request in one WPS API call (comma-list)
const CHUNK_SIZE = 50;

export interface InventoryResult {
  sku:         string;
  total_qty:   number;
  in_stock:    boolean;
  warehouses:  {
    name:         string;
    qty:          number;
    status:       string;
  }[];
}

// ── Shared logic ──────────────────────────────────────────────

async function fetchInventory(skus: string[]): Promise<InventoryResult[]> {
  const wps = new WpsClient();
  const results: InventoryResult[] = [];

  // Chunk the SKU list to stay within URL length limits
  for (let i = 0; i < skus.length; i += CHUNK_SIZE) {
    const chunk = skus.slice(i, i + CHUNK_SIZE);

    // WPS allows filtering items by SKU list
    const res = await wps.get<{ data: WpsItem[] }>("/items", {
      "filter[sku]": chunk.join(","),
      "include":     "inventory",
      "page[size]":  String(CHUNK_SIZE),
    });

    for (const item of res.data ?? []) {
      const warehouses = (item.inventory ?? []).map((w: WpsInventoryWarehouse) => ({
        name:   w.name,
        qty:    w.availability ?? 0,
        status: w.availability_status ?? "unknown",
      }));

      const total = warehouses.reduce((sum, w) => sum + w.qty, 0);

      results.push({
        sku:       item.sku,
        total_qty: total,
        in_stock:  total > 0,
        warehouses,
      });
    }
  }

  // For any SKU not returned by WPS (discontinued / not found), return zeroes
  const found = new Set(results.map((r) => r.sku));
  for (const sku of skus) {
    if (!found.has(sku)) {
      results.push({ sku, total_qty: 0, in_stock: false, warehouses: [] });
    }
  }

  return results;
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const skus: string[] = body?.skus ?? [];

    if (!Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json(
        { error: "Provide { skus: string[] }" },
        { status: 400 }
      );
    }

    if (skus.length > 200) {
      return NextResponse.json(
        { error: "Max 200 SKUs per request" },
        { status: 400 }
      );
    }

    const results = await fetchInventory(skus);
    return NextResponse.json({ results });

  } catch (err: any) {
    console.error("[WPS Inventory] Error:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

// ── GET ───────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const url  = new URL(req.url);
    const raw  = url.searchParams.get("sku") ?? "";
    const skus = raw.split(",").map((s) => s.trim()).filter(Boolean);

    if (skus.length === 0) {
      return NextResponse.json(
        { error: "Provide ?sku=SKU1,SKU2" },
        { status: 400 }
      );
    }

    const results = await fetchInventory(skus);
    return NextResponse.json({ results });

  } catch (err: any) {
    console.error("[WPS Inventory] Error:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}