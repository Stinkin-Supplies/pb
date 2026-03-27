import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { slug } = await params;

  const { data, error } = await supabase
    .from("brands")
    .select("id, name, slug, logo_url, is_featured, sort_order")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json({ brand: data });
}
