export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  let res: any = await supabase
    .from("admin_folders")
    .select("id,name,parent_id,created_at")
    .order("name", { ascending: true });

  // Back-compat if the DB hasn't been migrated yet (no `parent_id` column).
  if (res.error && /parent_id/i.test(res.error.message)) {
    res = await supabase
      .from("admin_folders")
      .select("id,name,created_at")
      .order("name", { ascending: true });
    if (!res.error) {
      res.data = (res.data ?? []).map((f: any) => ({ ...f, parent_id: null }));
    }
  }

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json(res.data ?? []);
}

export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const parentId = body?.parentId ? String(body.parentId) : null;
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let res: any = await supabase
    .from("admin_folders")
    .insert(parentId ? { name, parent_id: parentId } : { name })
    .select("id,name,parent_id,created_at")
    .single();

  // Back-compat if the DB hasn't been migrated yet (no `parent_id` column).
  if (res.error && /parent_id/i.test(res.error.message)) {
    res = await supabase
      .from("admin_folders")
      .insert({ name })
      .select("id,name,created_at")
      .single();
    if (!res.error && res.data) res.data = { ...res.data, parent_id: null };
  }

  if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  return NextResponse.json(res.data);
}
