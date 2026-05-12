// app/api/admin/catalog/bulk-update-category/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ids, category } = await req.json();
  if (!ids?.length || !category) return NextResponse.json({ error: "Missing ids or category" }, { status: 400 });

  const db = getCatalogDb();

  await db.query(
    `UPDATE catalog_unified SET category = $1, updated_at = NOW() WHERE id = ANY($2)`,
    [category, ids]
  );

  await db.query(
    `UPDATE catalog_products cp
     SET category = $1
     FROM catalog_unified cu
     WHERE cu.id = ANY($2) AND cp.sku = cu.sku`,
    [category, ids]
  );

  return NextResponse.json({ ok: true, updated: ids.length });
}
