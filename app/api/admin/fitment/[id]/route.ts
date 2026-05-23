/**
 * app/api/admin/fitment/[id]/route.ts
 * DELETE /api/admin/fitment/[id]  — remove a single catalog_fitment_v2 row
 */

import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rowId  = parseInt(id);
  if (!rowId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = getCatalogDb();
  const { rowCount } = await db.query(
    `DELETE FROM catalog_fitment_v2 WHERE id = $1`,
    [rowId]
  );

  if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
