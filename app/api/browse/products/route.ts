/**
 * app/api/browse/products/route.ts
 * Supports multi-family, year range bounds, dbCategory arrays.
 */

import { NextRequest, NextResponse } from "next/server";
import { browseProducts, type BrowseFilters } from "@/lib/db/browse";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  try {
    const familiesRaw    = p.getAll("family");
    const dbCategoriesRaw = p.getAll("dbCategory");

    const filters: BrowseFilters = {
      families:     familiesRaw.length > 0 ? familiesRaw : undefined,
      family:       familiesRaw.length === 1 ? familiesRaw[0] : undefined,
      // Era year range — splits shared families (Ironhead vs Evo Sportster)
      yearMin:      p.get("year_min") ? parseInt(p.get("year_min")!) : undefined,
      yearMax:      p.get("year_max") ? parseInt(p.get("year_max")!) : undefined,
      universal:    p.get("universal") === "true",
      modelCode:    p.get("model")      || undefined,
      year:         p.get("year")       ? parseInt(p.get("year")!)       : undefined,
      dbCategories: dbCategoriesRaw.length > 0 ? dbCategoriesRaw : undefined,
      category:     dbCategoriesRaw.length === 0 ? (p.get("category") || undefined) : undefined,
      brand:        p.get("brand")      || undefined,
      inStock:      p.get("in_stock")   === "true",
      search:       p.get("q")          || undefined,
      minPrice:     p.get("min_price")  ? parseFloat(p.get("min_price")!) : undefined,
      maxPrice:     p.get("max_price")  ? parseFloat(p.get("max_price")!) : undefined,
      page:         p.get("page")       ? parseInt(p.get("page")!)        : 1,
      perPage:      p.get("per_page")   ? parseInt(p.get("per_page")!)    : 48,
      sort:         (p.get("sort") as BrowseFilters["sort"]) || "newest",
    };

    const result = await browseProducts(filters);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown browse error";
    console.error("Browse products error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}