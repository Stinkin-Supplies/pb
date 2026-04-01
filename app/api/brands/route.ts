import getCatalogDb from "@/lib/db/catalog";
import { NextResponse } from "next/server";

export async function GET() {
  const catalogDb = getCatalogDb();

  try {
    const { rows } = await catalogDb.query(
      `SELECT id, name, slug, logo_url, is_featured, sort_order
       FROM public.brands
       ORDER BY sort_order ASC NULLS LAST, name ASC`
    );

    return NextResponse.json({ brands: rows ?? [] });
  } catch (error) {
    console.error("[brands] fetch error:", error);
    return NextResponse.json({ brands: [] }, { status: 500 });
  }
}
