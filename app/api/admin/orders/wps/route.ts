export const runtime = "nodejs";

// ============================================================
// app/api/admin/orders/wps/route.ts
// ============================================================
// Serves paginated order data + WPS stats to the admin
// orders dashboard. Filters, search, and stat aggregation
// all happen server-side to keep the page fast.
//
// GET ?filter=all|pending|submitted|shipped|po_failed|none
//     &search=<order id | wps order id | sku>
//     &page=0
//     &size=25
//
// Returns:
//   { orders: [], stats: {}, total: number }
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   SYNC_SECRET
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  // ── Auth ────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url    = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page   = parseInt(url.searchParams.get("page") ?? "0", 10);
  const size   = parseInt(url.searchParams.get("size") ?? "25", 10);
  const from   = page * size;
  const to     = from + size - 1;

  try {
    // ── Build base query ───────────────────────────────────
    let query = supabase
      .from("orders")
      .select(`
        id,
        created_at,
        total_amount,
        customer_email,
        stripe_payment_intent_id,
        shipping_name,
        shipping_address_line1,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        wps_order_id,
        wps_po_submitted_at,
        wps_estimated_ship_date,
        wps_status,
        wps_tracking_number,
        wps_carrier,
        wps_error_message,
        order_items (
          id,
          sku,
          quantity,
          unit_price,
          products ( name, wps_item_id, vendors ( slug ) )
        )
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    // ── Apply filter ───────────────────────────────────────
    if (filter === "pending") {
      // Has WPS items but no PO submitted yet
      query = query.is("wps_order_id", null).not("wps_status", "eq", "po_failed");
    } else if (filter === "none") {
      // No WPS items at all (wps_status never set)
      query = query.is("wps_status", null).is("wps_order_id", null);
    } else if (filter !== "all") {
      query = query.eq("wps_status", filter);
    }

    // ── Apply search ───────────────────────────────────────
    if (search) {
      // Supabase OR filter across order id, wps order id
      // For SKU search we do a second query (see below)
      query = query.or(
        `id.ilike.%${search}%,wps_order_id.ilike.%${search}%,customer_email.ilike.%${search}%`
      );
    }

    const { data: orders, error, count } = await query;

    if (error) {
      console.error("[Admin Orders] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Shape each order for the dashboard ────────────────
    const shaped = (orders ?? []).map((o: any) => {
      // Determine if order has any WPS line items
      const wpsItems = (o.order_items ?? []).filter((item: any) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products;
        const vendor  = Array.isArray(product?.vendors) ? product.vendors[0] : product?.vendors;
        return vendor?.slug === "wps";
      });

      return {
        id:                       o.id,
        created_at:               o.created_at,
        total_amount:             o.total_amount,
        customer_email:           o.customer_email,
        stripe_payment_intent_id: o.stripe_payment_intent_id,
        shipping_name:            o.shipping_name,
        shipping_address_line1:   o.shipping_address_line1,
        shipping_city:            o.shipping_city,
        shipping_state:           o.shipping_state,
        shipping_postal_code:     o.shipping_postal_code,
        wps_order_id:             o.wps_order_id,
        wps_po_submitted_at:      o.wps_po_submitted_at,
        wps_estimated_ship_date:  o.wps_estimated_ship_date,
        wps_status:               o.wps_status,
        wps_tracking_number:      o.wps_tracking_number,
        wps_carrier:              o.wps_carrier,
        wps_error_message:        o.wps_error_message,
        has_wps_items:            wpsItems.length > 0,
        wps_items:                wpsItems.map((item: any) => {
          const product = Array.isArray(item.products) ? item.products[0] : item.products;
          return {
            sku:        item.sku,
            quantity:   item.quantity,
            unit_price: item.unit_price,
            name:       product?.name ?? null,
          };
        }),
      };
    });

    // ── Stats aggregation (separate queries for accuracy) ──
    const [totalRes, pendingRes, submittedRes, processingRes, shippedRes, failedRes] =
      await Promise.all([
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase.from("orders").select("*", { count: "exact", head: true })
          .is("wps_order_id", null).not("wps_status", "eq", "po_failed"),
        supabase.from("orders").select("*", { count: "exact", head: true })
          .eq("wps_status", "submitted"),
        supabase.from("orders").select("*", { count: "exact", head: true })
          .eq("wps_status", "processing"),
        supabase.from("orders").select("*", { count: "exact", head: true })
          .eq("wps_status", "shipped"),
        supabase.from("orders").select("*", { count: "exact", head: true })
          .eq("wps_status", "po_failed"),
      ]);

    const stats = {
      total:      totalRes.count      ?? 0,
      pending:    pendingRes.count    ?? 0,
      submitted:  submittedRes.count  ?? 0,
      processing: processingRes.count ?? 0,
      shipped:    shippedRes.count    ?? 0,
      failed:     failedRes.count     ?? 0,
    };

    return NextResponse.json({
      orders: shaped,
      stats,
      total: count ?? 0,
      page,
      size,
    });

  } catch (err: any) {
    console.error("[Admin Orders] Fatal error:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch orders" },
      { status: 500 }
    );
  }
}