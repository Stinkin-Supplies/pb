import getCatalogDb from "@/lib/db/catalog";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const catalogDb = getCatalogDb();

  try {
    const { rows } = await catalogDb.query(
      `SELECT id, name, slug, logo_url, is_featured, sort_order
       FROM public.catalog_brands
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );

    if (!rows[0]) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    return NextResponse.json({ brand: rows[0] });
  } catch (error) {
    console.error("[brands] fetch error:", error);
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
}
