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

    const orderPayload = {
      customer_email: body.customer_email ?? null,
      customer_name: body.customer_name ?? null,
      shipping_address: body.shipping_address ?? null,
      billing_address: body.billing_address ?? null,
      subtotal: body.subtotal ?? 0,
      shipping: body.shipping ?? 0,
      tax: body.tax ?? 0,
      discount: body.discount ?? 0,
      points_redeemed: body.points_redeemed ?? 0,
      points_redeemed_value: body.points_redeemed_value ?? 0,
      total: body.total ?? 0,
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
      quantity: item.qty ?? 1,
      unit_price: item.price ?? 0,
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
