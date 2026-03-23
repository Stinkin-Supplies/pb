import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug, logo_url, is_featured, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[brands] fetch error:", error);
    return NextResponse.json({ brands: [] }, { status: 500 });
  }

  return NextResponse.json({ brands: data ?? [] });
}