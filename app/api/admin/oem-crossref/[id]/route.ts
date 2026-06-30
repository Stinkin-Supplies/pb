/**
 * app/api/admin/oem-crossref/[id]/route.ts
 *
 * PATCH /api/admin/oem-crossref/[id] — update a single catalog_oem_crossref row
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { oem_number, sku, oem_manufacturer, page_reference, source_file } = body;
  if (!oem_number || !sku || !oem_manufacturer) {
    return NextResponse.json(
      { error: "oem_number, sku, and oem_manufacturer are required" },
      { status: 400 }
    );
  }

  const db = getCatalogDb();
  try {
    const result = await db.query(
      `UPDATE catalog_oem_crossref
         SET oem_number       = $1,
             sku              = $2,
             oem_manufacturer = $3,
             page_reference   = $4,
             source_file      = $5
       WHERE id = $6
       RETURNING *`,
      [
        oem_number.trim(),
        sku.trim(),
        oem_manufacturer.trim(),
        page_reference?.trim() || null,
        source_file?.trim() || null,
        numId,
      ]
    );

    if (!result.rowCount) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    return NextResponse.json({ row: result.rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-crossref PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
