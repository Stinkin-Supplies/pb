/**
 * app/api/browse/products/route.ts
 * Product search/filter — reads directly from catalog_unified.
 * Supports multi-family (era pages) and dbCategory arrays (category slug mapping).
 */

import { NextRequest, NextResponse } from "next/server";
import { browseProducts, type BrowseFilters } from "@/lib/db/browse";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  try {
    // families[] — repeatable param e.g. ?family=Touring&family=Dyna
    const familiesRaw = p.getAll("family");
    const dbCategoriesRaw = p.getAll("dbCategory");

    const filters: BrowseFilters = {
      // Multi-family support
      families:     familiesRaw.length > 0 ? familiesRaw : undefined,
      // Single family fallback (legacy)
      family:       familiesRaw.length === 1 ? familiesRaw[0] : undefined,
      // Universal/chopper
      universal:    p.get("universal") === "true",
      modelCode:    p.get("model")      || undefined,
      year:         p.get("year")       ? parseInt(p.get("year")!)       : undefined,
      // DB category array (mapped from era page category slug)
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