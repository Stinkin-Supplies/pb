// app/api/notifications/restock/route.ts
// ─────────────────────────────────────
// Inserts a stock_notification for the logged-in user.
// Uses their account email — no guest flow needed.

import { NextResponse }          from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies }               from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // Verify session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { product_sku, product_name, vendor, source } = await req.json();

  if (!product_sku) {
    return NextResponse.json({ error: "product_sku required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("stock_notifications")
    .upsert({
      user_id:      session.user.id,
      email:        session.user.email,
      product_sku,
      product_name: product_name ?? null,
      vendor:       vendor       ?? null,
      source:       source       ?? "pdp",
      status:       "waiting",
    }, {
      onConflict:        "email,product_sku",
      ignoreDuplicates:  true,   // silently skip if already waiting
    });

  if (error) {
    console.error("[Restock API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
