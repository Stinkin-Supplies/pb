// app/api/admin/catalog/update-category/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, category } = await req.json();
  if (!id || !category) return NextResponse.json({ error: "Missing id or category" }, { status: 400 });

  const db = getCatalogDb();

  // Update both tables
  await db.query(
    `UPDATE catalog_unified SET category = $1, updated_at = NOW() WHERE id = $2`,
    [category, id]
  );

  // Also update catalog_products by SKU
  await db.query(
    `UPDATE catalog_products cp
     SET category = $1
     FROM catalog_unified cu
     WHERE cu.id = $2 AND cp.sku = cu.sku`,
    [category, id]
  );

  return NextResponse.json({ ok: true });
}
