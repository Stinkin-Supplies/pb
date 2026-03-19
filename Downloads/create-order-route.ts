import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "No items" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    // ── Get authenticated user so we can attach user_id to the order ──
    let userId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch (e) {
      console.warn("[create-order] Could not resolve user session:", e);
    }

    const normalizeMoney = (value: unknown) => {
      const num = Number(value ?? 0);
      if (!Number.isFinite(num)) return 0;
      return Number.isInteger(num) ? num : Math.round(num * 100);
    };

    const orderPayload = {
      // ✅ user_id now included — required for order history to work
      user_id:               userId,
      customer_email:        body.customer_email ?? body.email ?? null,
      customer_name:         body.customer_name  ?? body.name  ?? null,
      shipping_address:      body.shipping_address ?? null,
      billing_address:       body.billing_address  ?? null,
      subtotal:              normalizeMoney(body.subtotal),
      shipping:              normalizeMoney(body.shipping),
      tax:                   normalizeMoney(body.tax),
      discount:              normalizeMoney(body.discount),
      points_redeemed:       Number(body.points_redeemed ?? 0) || 0,
      points_redeemed_value: normalizeMoney(body.points_redeemed_value),
      total:                 normalizeMoney(body.total),
      status:                "pending_payment",
    };

    console.log("[create-order] inserting order:", { ...orderPayload, user_id: userId ? "***" : null });

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert(orderPayload)
      .select()
      .single();

    if (error) {
      console.error("[create-order] order insert failed:", error);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 500 }
      );
    }

    const orderItems = items.map((item: any) => ({
      order_id:   order.id,
      product_id: null,
      name:       item.name ?? "Item",
      quantity:   Number(item.qty ?? 1) || 1,
      price:      normalizeMoney(item.price),
    }));

    console.log("[create-order] inserting items:", orderItems.length);

    const { error: itemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("[create-order] items insert failed:", itemsError);
      return NextResponse.json(
        { error: itemsError.message, details: itemsError.details },
        { status: 500 }
      );
    }

    console.log("[create-order] success, order id:", order.id);
    return NextResponse.json({ order_id: order.id });

  } catch (err) {
    console.error("[create-order] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
