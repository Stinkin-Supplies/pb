import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const items = body?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: true, merged: 0 });
    }

    const { data: cartId, error: cartErr } = await supabase.rpc(
      "get_or_create_user_cart",
      { p_user_id: user.id }
    );
    if (cartErr) return new NextResponse(cartErr.message, { status: 500 });

    const { error: rpcErr } = await supabase.rpc("upsert_cart_items", {
      p_cart_id: cartId,
      p_items: items,
    });
    if (rpcErr) return new NextResponse(rpcErr.message, { status: 500 });

    const { data: cartItems, error: selErr } = await supabase
      .from("cart_items")
      .select("*")
      .eq("cart_id", cartId);
    if (selErr) return new NextResponse(selErr.message, { status: 500 });

    return NextResponse.json({ cartId, items: cartItems });
  } catch (err) {
    return new NextResponse("Server error", { status: 500 });
  }
}
