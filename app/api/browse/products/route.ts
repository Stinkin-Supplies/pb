/**
 * app/api/browse/products/route.ts
 * Product search/filter — reads directly from catalog_unified.
 * No Typesense dependency.
 */

import { NextRequest, NextResponse } from "next/server";
import { browseProducts } from "@/lib/db/browse";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  try {
    const result = await browseProducts({
      family:    p.get("family")    || undefined,
      modelCode: p.get("model")     || undefined,
      year:      p.get("year")      ? parseInt(p.get("year")!) : undefined,
      category:  p.get("category")  || undefined,
      brand:     p.get("brand")     || undefined,
      inStock:   p.get("in_stock")  === "true",
      search:    p.get("q")         || undefined,
      minPrice:  p.get("min_price") ? parseFloat(p.get("min_price")!) : undefined,
      maxPrice:  p.get("max_price") ? parseFloat(p.get("max_price")!) : undefined,
      page:      p.get("page")      ? parseInt(p.get("page")!) : 1,
      perPage:   p.get("per_page")  ? parseInt(p.get("per_page")!) : 48,
      sort:      (p.get("sort") as any) || "newest",
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Browse products error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}