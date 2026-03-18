import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_SUPABASE_URL" },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const normalizeMoney = (value: unknown) => {
      const num = Number(value ?? 0);
      if (!Number.isFinite(num)) return 0;
      return Number.isInteger(num) ? num : Math.round(num * 100);
    };

    const orderPayload = {
      customer_email: body.customer_email ?? body.email ?? null,
      customer_name: body.customer_name ?? body.name ?? null,
      shipping_address: body.shipping_address ?? null,
      billing_address: body.billing_address ?? null,
      subtotal: normalizeMoney(body.subtotal),
      shipping: normalizeMoney(body.shipping),
      tax: normalizeMoney(body.tax),
      discount: normalizeMoney(body.discount),
      points_redeemed: Number(body.points_redeemed ?? 0) || 0,
      points_redeemed_value: normalizeMoney(body.points_redeemed_value),
      total: normalizeMoney(body.total),
      status: "pending_payment",
    };

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert(orderPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 500 }
      );
    }

    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: null, // 👈 ignore for now
      name: item.name ?? "Item",
      quantity: Number(item.qty ?? 1) || 1,
      price: normalizeMoney(item.price),
    }));

    console.log("ORDER PAYLOAD:", orderPayload);
    console.log("ITEMS:", orderItems);

    const { error: itemsError } = await supabaseAdmin
      .from("order_items") // ✅ FIXED
      .insert(orderItems);

    if (itemsError) {
      console.error("ITEM INSERT ERROR:", itemsError);
      return NextResponse.json(
        { error: itemsError.message, details: itemsError.details },
        { status: 500 }
      );
    }

    return NextResponse.json({ order_id: order.id });
  } catch (err) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
