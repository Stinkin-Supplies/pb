/**
 * app/api/browse/products/route.ts
 * Supports era slug, multi-family, year range bounds, dbCategory arrays.
 *
 * Search flow:
 *   1. If ?q= is present, call Typesense (fast, relevance-ranked, fuzzy,
 *      knows model names via fitment_hd_models/families fields).
 *   2. If Typesense returns IDs → pass as tsIds to browseProducts (Postgres
 *      just applies the remaining filters on top of those IDs).
 *   3. If Typesense returns 0 or fails → fall through to the ILIKE fallback
 *      in browseProducts, which now uses a 2-word threshold so it never
 *      silently returns 0 for multi-word queries.
 */

import { NextRequest, NextResponse } from "next/server";
import { browseProducts, type BrowseFilters } from "@/lib/db/browse";

// ── Typesense search helper ───────────────────────────────────────────────────

const TS_HOST       = process.env.TYPESENSE_HOST       || 'localhost';
const TS_PORT       = process.env.TYPESENSE_PORT       || '8108';
const TS_PROTOCOL   = process.env.TYPESENSE_PROTOCOL   || 'http';
const TS_KEY        = process.env.TYPESENSE_SEARCH_KEY || process.env.TYPESENSE_API_KEY || '';
const TS_COLLECTION = process.env.TYPESENSE_COLLECTION || 'products';
const TS_BASE       = `${TS_PROTOCOL}://${TS_HOST}:${TS_PORT}/collections/${TS_COLLECTION}/documents/search`;

async function typesenseSearch(q: string): Promise<number[] | null> {
  try {
    const params = new URLSearchParams({
      q,
      // Fields to search — ordered by relevance weight.
      // fitment_hd_models + fitment_hd_families means "Street Glide",
      // "Touring", "FLHX" etc. actually match products that fit them.
      query_by: 'name,oem_numbers,fitment_text,fitment_hd_models,fitment_hd_families,fitment_hd_codes,brand,description',
      query_by_weights: '10,9,8,7,7,7,5,3',
      // If all tokens match fewer than 5 docs, start dropping tokens.
      // This is what prevents "brake rotor street glide" from returning 0
      // when "street" and "glide" don't appear in product content —
      // Typesense drops them and returns brake rotors that fit Street Glides
      // (via fitment_hd_models) or just the best brake rotor matches.
      drop_tokens_threshold: '5',
      num_typos: '1',
      typo_tokens_threshold: '1',
      // Return up to 500 IDs — enough for ~10 pages at 48/page.
      // For very broad searches the user should use filters.
      per_page: '250',
      page: '1',
      filter_by: 'is_active:true',
      // Only fetch the id field — we don't need the full document
      include_fields: 'id',
    });

    const res = await fetch(`${TS_BASE}?${params}`, {
      headers: { 'X-TYPESENSE-API-KEY': TS_KEY },
      // Hard timeout — if Typesense is down, fall through to ILIKE fast
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const ids = (data.hits ?? []).map((h: { document: { id: string } }) => parseInt(h.document.id));
    return ids.length ? ids : null; // null = fall through to ILIKE
  } catch {
    return null; // timeout or connection error — fall through to ILIKE
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  try {
    const familiesRaw     = p.getAll("family");
    const dbCategoriesRaw = p.getAll("dbCategory");
    const searchQuery     = p.get("q") || undefined;

    // Run Typesense search in parallel with param parsing
    const tsIdsPromise = searchQuery ? typesenseSearch(searchQuery) : Promise.resolve(null);

    const filters: BrowseFilters = {
      eraSlug:      p.get("era")         || undefined,
      families:     familiesRaw.length > 0 ? familiesRaw : undefined,
      family:       familiesRaw.length === 1 ? familiesRaw[0] : undefined,
      yearMin:      p.get("year_min")    ? parseInt(p.get("year_min")!)    : undefined,
      yearMax:      p.get("year_max")    ? parseInt(p.get("year_max")!)    : undefined,
      universal:    p.get("universal")   === "true",
      modelCode:    p.get("model")       || undefined,
      year:         p.get("year")        ? parseInt(p.get("year")!)        : undefined,
      dbCategories: dbCategoriesRaw.length > 0 ? dbCategoriesRaw : undefined,
      category:     dbCategoriesRaw.length === 0 ? (p.get("category") || undefined) : undefined,
      subcategory:  p.get("subcategory") || undefined,
      displayCategory:    p.get("display_category") || undefined,
      displaySubcategory: p.get("display_subcategory") || undefined,
      subcategoryDetail:  p.get("subcategory_detail") || undefined,
      modelCodes:   p.getAll("model_code").length > 0 ? p.getAll("model_code") : undefined,
      brand:        p.get("brand")       || undefined,
      inStock:      p.get("in_stock")    === "true",
      minPrice:     p.get("min_price")   ? parseFloat(p.get("min_price")!) : undefined,
      maxPrice:     p.get("max_price")   ? parseFloat(p.get("max_price")!) : undefined,
      page:         p.get("page")        ? parseInt(p.get("page")!)        : 1,
      perPage:      p.get("per_page")    ? parseInt(p.get("per_page")!)    : 48,
      sort:         (p.get("sort") as BrowseFilters["sort"]) || (searchQuery ? "relevance" : "newest"),
    };

    // Resolve Typesense IDs and decide which search mode to use:
    //   tsIds set  → Typesense mode (Postgres filters within those IDs)
    //   tsIds null → ILIKE fallback mode (browse.ts handles it with 2-word threshold)
    const tsIds = await tsIdsPromise;
    if (tsIds) {
      filters.tsIds  = tsIds;
    } else if (searchQuery) {
      filters.search = searchQuery;
    }

    const result = await browseProducts(filters);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown browse error";
    console.error("Browse products error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
