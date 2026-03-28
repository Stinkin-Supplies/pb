// app/api/admin/sync-log/route.ts
// Serves paginated sync_log entries from Supabase
// Supports vendor + status filter + pagination

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vendor = searchParams.get("vendor") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const page   = parseInt(searchParams.get("page") ?? "0", 10);
  const limit  = parseInt(searchParams.get("limit") ?? String(PAGE_SIZE), 10);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let q = supabase
    .from("sync_log")
    .select("*", { count: "exact" })
    .order("completed_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (vendor !== "all") q = q.eq("vendor", vendor);
  if (status !== "all") q = q.eq("status", status);

  const { data, count, error } = await q;

  if (error) {
    console.error("[SyncLog API]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    logs:  data  ?? [],
    total: count ?? 0,
  });
}