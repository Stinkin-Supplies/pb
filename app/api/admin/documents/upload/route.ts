export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

const BUCKET = process.env.SUPABASE_ADMIN_DOCS_BUCKET || "admin-documents";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const folderIdRaw = form.get("folderId");
  const folderId = folderIdRaw ? String(folderIdRaw) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF uploads supported" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const id = crypto.randomUUID();
  const ext = ".pdf";
  const safeName = (file.name || "document.pdf").replace(/[^\w.\- ]+/g, "_");
  const storagePath = `${id}${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}`, bucket: BUCKET },
      { status: 500 }
    );
  }

  const { data, error: insErr } = await supabase
    .from("admin_documents")
    .insert({
      id,
      folder_id: folderId,
      name: safeName,
      file_path: storagePath,
      mime_type: file.type,
      file_size: file.size,
    })
    .select("id,folder_id,name,file_path,mime_type,file_size,created_at")
    .single();

  if (insErr) {
    // Best-effort cleanup of orphaned storage object.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: data });
}
