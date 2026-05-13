import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function POST(req: NextRequest) {
  const { id, fits_all_models } = await req.json();
  if (id === undefined) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const db = getCatalogDb();
  try {
    // Update catalog_unified directly (source of truth)
    await db.query(
      `UPDATE catalog_unified SET fits_all_models = $1, is_universal = $1 WHERE id = $2`,
      [fits_all_models, id]
    );
    // Also update catalog_products if row exists
    await db.query(
      `UPDATE catalog_products cp
       SET fits_all_models = $1
       FROM catalog_unified cu
       WHERE cu.id = $2 AND cp.sku = cu.sku`,
      [fits_all_models, id]
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[fitment/fits-all]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
