// ============================================================
// app/api/admin/fitment/delete/route.ts
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getCatalogDb();
  await db.query(`DELETE FROM catalog_fitment_v2 WHERE id = $1`, [parseInt(id)]);
  return NextResponse.json({ ok: true });
}
