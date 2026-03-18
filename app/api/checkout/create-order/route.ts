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

    const normalizeMoney = (value: unknown) => {
      const num = Number(value ?? 0);
      if (!Number.isFinite(num)) return 0;
      return Number.isInteger(num) ? num : Math.round(num * 100);
    };

    const orderPayload = {
      customer_email: body.customer_email ?? null,
      customer_name: body.customer_name ?? null,
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
        { error: error.message },
        { status: 500 }
      );
    }

    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: item.product_id ?? null,
      name: item.name ?? "Item",
      quantity: Number(item.qty ?? 1) || 1,
      unit_price: normalizeMoney(item.price),
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("order_line_items")
      .insert(orderItems);

    if (itemsError) {
      return NextResponse.json(
        { error: itemsError.message },
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
