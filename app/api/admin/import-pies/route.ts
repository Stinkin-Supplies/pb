// app/api/admin/import-pies/route.ts
// ============================================================
// Triggers the PU PIES XML import from the admin panel.
// Reads Brand_Catalog_Content_Export.xml + Brand_PIES_Export.xml
// from data/pu/ and upserts descriptions + images to self-hosted DB.
//
// POST — run the import
// ============================================================

export const runtime = "nodejs";

import { NextResponse }    from "next/server";
import { importPuPies }    from "@/scripts/importPuPies";

export async function POST(req: Request) {
  // Basic auth check
  const authHeader = req.headers.get("authorization") ?? "";
  const secret     = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await importPuPies();
    return NextResponse.json({ success: true, summary: result });
  } catch (err: any) {
    console.error("[Import PIES API]", err.message);
    return NextResponse.json(
      { error: err.message ?? "Import failed" },
      { status: 500 }
    );
  }
}