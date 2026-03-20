export const runtime = "nodejs";

// ============================================================
// app/api/vendors/wps/order/route.ts
// ============================================================
// Submits a dropship purchase order to WPS when a customer's
// Stripe payment succeeds.
//
// Flow:
//   1. Stripe webhook fires → your existing webhook handler
//      calls POST /api/vendors/wps/order
//   2. We create a WPS cart
//   3. Add each WPS-sourced line item
//   4. Submit cart as a PO
//   5. Write wps_order_id + expected_ship_date back to orders table
//   6. Return the WPS order for logging
//
// POST  { orderId: string }
//   → { success, wpsOrderId, estimatedShipDate, items }
//
// GET   ?orderId=xxx
//   → WPS order status (tracks shipping in real time)
//
// Required env vars:
//   WPS_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   SYNC_SECRET
//   WPS_SHIPPING_METHOD   (optional, default "UPS Ground")
// ============================================================

import { NextResponse }  from "next/server";
import { createClient }  from "@supabase/supabase-js";
import {
  WpsClient,
  WpsCart,
  WpsOrder,
  WpsCartSubmitPayload,
} from "@/lib/vendors/wps";

const DEFAULT_SHIPPING = process.env.WPS_SHIPPING_METHOD ?? "UPS Ground";

// ── POST: submit PO ───────────────────────────────────────────

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { orderId } = body as { orderId: string };

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Load order from Supabase ─────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      stripe_payment_intent_id,
      shipping_name,
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_state,
      shipping_postal_code,
      shipping_country,
      shipping_phone,
      order_items (
        id,
        sku,
        quantity,
        unit_price,
        vendor_id,
        products ( wps_item_id, vendor_id, vendors ( slug ) )
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: `Order ${orderId} not found: ${orderErr?.message}` },
      { status: 404 }
    );
  }

  // ── Filter to WPS line items only ────────────────────────
  // Supabase returns nested relations as arrays even for many-to-one joins.
  // Use [0] to get the single product/vendor object for each order item.
  const wpsItems = (order.order_items ?? []).filter(
    (item: any) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      const vendor  = Array.isArray(product?.vendors) ? product.vendors[0] : product?.vendors;
      return vendor?.slug === "wps";
    }
  );

  if (wpsItems.length === 0) {
    return NextResponse.json(
      { success: true, message: "No WPS items in this order — nothing to submit." }
    );
  }

  let wps: WpsClient;
  try {
    wps = new WpsClient();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  try {
    // ── Step 1: Create WPS cart ──────────────────────────
    console.log(`[WPS Order] Creating cart for order ${orderId}...`);
    const cartRes = await wps.post<{ data: WpsCart }>("/carts", {});
    const cartId  = cartRes.data.id;
    console.log(`[WPS Order] Cart created: ${cartId}`);

    // ── Step 2: Add WPS items to cart ────────────────────
    for (const item of wpsItems) {
      const product   = Array.isArray(item.products) ? item.products[0] : item.products;
      const wpsItemId = product?.wps_item_id;
      if (!wpsItemId) {
        console.warn(`[WPS Order] Skipping ${item.sku} — no wps_item_id stored`);
        continue;
      }

      await wps.post(`/carts/${cartId}/items`, {
        item_id:  wpsItemId,
        quantity: item.quantity,
      });

      console.log(`[WPS Order] Added ${item.sku} × ${item.quantity} to cart`);
    }

    // ── Step 3: Submit cart as PO ─────────────────────────
    const payload: WpsCartSubmitPayload = {
      po_number:       orderId,                          // your order ID as PO#
      shipping_method: DEFAULT_SHIPPING,
      notes:           `Stinkin' Supplies order #${orderId}`,
      ship_to: {
        name:     order.shipping_name ?? "",
        address1: order.shipping_address_line1 ?? "",
        address2: order.shipping_address_line2 ?? undefined,
        city:     order.shipping_city ?? "",
        state:    order.shipping_state ?? "",
        zip:      order.shipping_postal_code ?? "",
        country:  order.shipping_country ?? "US",
        phone:    order.shipping_phone ?? "",
      },
    };

    console.log(`[WPS Order] Submitting cart ${cartId}...`);
    const submitRes = await wps.post<{ data: WpsOrder }>(
      `/carts/${cartId}/submit`,
      payload
    );
    const wpsOrder = submitRes.data;
    console.log(`[WPS Order] WPS order created: ${wpsOrder.id}`);

    // ── Step 4: Write WPS order ID back to orders table ──
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        wps_order_id:          wpsOrder.id,
        wps_po_submitted_at:   new Date().toISOString(),
        wps_estimated_ship_date: wpsOrder.estimated_ship_date ?? null,
        wps_status:             wpsOrder.status ?? "submitted",
      })
      .eq("id", orderId);

    if (updateErr) {
      console.error("[WPS Order] Failed to update order row:", updateErr.message);
      // Non-fatal — PO was submitted, just metadata write failed
    }

    return NextResponse.json({
      success:           true,
      wpsOrderId:        wpsOrder.id,
      estimatedShipDate: wpsOrder.estimated_ship_date,
      status:            wpsOrder.status,
      itemCount:         wpsItems.length,
    });

  } catch (err: any) {
    console.error("[WPS Order] Fatal error:", err.message);

    // Mark order as PO failed so you can retry manually
    await supabase
      .from("orders")
      .update({
        wps_status:        "po_failed",
        wps_error_message: err.message,
      })
      .eq("id", orderId);

    return NextResponse.json(
      { error: err.message ?? "WPS PO submission failed" },
      { status: 500 }
    );
  }
}

// ── GET: check WPS order status ───────────────────────────────

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url      = new URL(req.url);
  const orderId  = url.searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "?orderId= required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the WPS order ID we stored
  const { data: order } = await supabase
    .from("orders")
    .select("wps_order_id, wps_status")
    .eq("id", orderId)
    .single();

  if (!order?.wps_order_id) {
    return NextResponse.json(
      { error: "No WPS order ID found for this order" },
      { status: 404 }
    );
  }

  try {
    const wps = new WpsClient();
    // WPS allows looking up by PO number (which we set to orderId)
    const res = await wps.get<{ data: WpsOrder }>(
      `/orders/${order.wps_order_id}`
    );
    const wpsOrder = res.data;

    // Update tracking in Supabase if it's now available
    if (wpsOrder.tracking_number) {
      await supabase
        .from("orders")
        .update({
          wps_status:          wpsOrder.status,
          wps_tracking_number: wpsOrder.tracking_number,
          wps_carrier:         wpsOrder.carrier,
        })
        .eq("id", orderId);
    }

    return NextResponse.json({
      wpsOrderId:      wpsOrder.id,
      status:          wpsOrder.status,
      trackingNumber:  wpsOrder.tracking_number,
      carrier:         wpsOrder.carrier,
      estimatedShipDate: wpsOrder.estimated_ship_date,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch WPS order status" },
      { status: 500 }
    );
  }
}