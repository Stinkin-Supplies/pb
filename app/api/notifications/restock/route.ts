// app/api/notifications/restock/route.ts
// ─────────────────────────────────────
// Inserts a stock_notification for the logged-in user.
// Uses their account email — no guest flow needed.

import { NextResponse }          from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies }               from "next/headers";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route handlers should not mutate cookies here.
        },
      },
    }
  );

  // Verify session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { product_sku, product_name, vendor, source } = await req.json();

  if (!product_sku) {
    return NextResponse.json({ error: "product_sku required" }, { status: 400 });
  }

  // Check if already waiting — avoid duplicate
  const { data: existing } = await supabase
    .from("stock_notifications")
    .select("id, status")
    .eq("email", session.user.email)
    .eq("product_sku", product_sku)
    .maybeSingle();

  if (existing) {
    // Already registered — return success silently
    return NextResponse.json({ success: true, alreadyExists: true });
  }

  const { error } = await supabase
    .from("stock_notifications")
    .insert({
      user_id:      session.user.id,
      email:        session.user.email,
      product_sku,
      product_name: product_name ?? null,
      vendor:       vendor       ?? null,
      source:       source       ?? "pdp",
      status:       "waiting",
    });

  if (error) {
    console.error("[Restock API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}