import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const { data: cartId, error: cartErr } = await supabase.rpc(
      "get_or_create_user_cart",
      { p_user_id: user.id }
    );
    if (cartErr) return new NextResponse(cartErr.message, { status: 500 });

    return NextResponse.json({ cartId });
  } catch (err) {
    return new NextResponse("Server error", { status: 500 });
  }
}
