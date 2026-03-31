// ============================================================
// app/api/products/route.ts
// ============================================================
// Server-side product filter endpoint.
// Called by ShopClient on every filter/sort/page change.
//
// GET /api/products
//   ?category=ATV
//   &brand=K%26L+SUPPLY
//   &minPrice=10
//   &maxPrice=500
//   &inStock=true
//   &sort=price_asc
//   &page=0
//   &pageSize=48
//
// Returns:
//   {
//     products:    NormalizedProduct[],
//     total:       number,
//     page:        number,
//     pageSize:    number,
//     facets: {
//       categories: { name, count }[],
//       brands:     { name, count }[],
//       priceRange: { min, max },
//     }
//   }
//
// Facet counts are accurate across ALL matching products,
// not just the current page — this is what makes sidebar
// counts correct at 146k products.
//
// Phase B: swap this for Typesense — zero DB load, sub-10ms.
// ============================================================

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

const PAGE_SIZE_DEFAULT = 48;
const PAGE_SIZE_MAX     = 96;

const ORDER_MAP: Record<string, { column: string; ascending: boolean }> = {
  newest:     { column: "created_at", ascending: false },
  price_asc:  { column: "our_price",  ascending: true  },
  price_desc: { column: "our_price",  ascending: false },
  name_asc:   { column: "name",       ascending: true  },
};

export async function GET(req: Request) {
  const url      = new URL(req.url);
  const category = url.searchParams.get("category")  || undefined;
  const brand    = url.searchParams.get("brand")      || undefined;
  const minPrice = url.searchParams.get("minPrice")   ? Number(url.searchParams.get("minPrice"))  : undefined;
  const maxPrice = url.searchParams.get("maxPrice")   ? Number(url.searchParams.get("maxPrice"))  : undefined;
  const inStock  = url.searchParams.get("inStock") === "true" ? true : undefined;
  const search   = url.searchParams.get("search")?.trim() || undefined;
  const sort     = url.searchParams.get("sort")       || "newest";
  const page     = Math.max(0, parseInt(url.searchParams.get("page")     || "0",  10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    parseInt(url.searchParams.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10)
  );

  const from = page * pageSize;

  type FacetCounts = { name: string; count: number };
  type FacetResponse = {
    categories: FacetCounts[];
    brands: FacetCounts[];
    price_range: { min: number; max: number };
  };

  try {
    // ── Run products query + facets in parallel ────────────
    const [productsResult, facetsResult] = await Promise.all([

      // Products page
      (async () => {
        const catalogDb = getCatalogDb();

        const conditions: string[] = ["cp.is_active = true"];
        const values: any[] = [];
        let paramIdx = 1;

        if (category) { conditions.push(`cp.category = $${paramIdx++}`); values.push(category); }
        if (brand)    { conditions.push(`cp.brand = $${paramIdx++}`);    values.push(brand); }
        if (minPrice) { conditions.push(`cp.price >= $${paramIdx++}`);    values.push(minPrice); }
        if (maxPrice) { conditions.push(`cp.price <= $${paramIdx++}`);    values.push(maxPrice); }
        if (inStock)  {
          conditions.push(`EXISTS (
            SELECT 1
            FROM public.vendor_offers vo
            WHERE vo.catalog_product_id = cp.id
              AND vo.is_active = true
              AND COALESCE(vo.total_qty, 0) > 0
          )`);
        }
        if (search)   {
          conditions.push(`(
            cp.name ILIKE $${paramIdx}
            OR cp.sku ILIKE $${paramIdx}
            OR cp.brand ILIKE $${paramIdx}
            OR cp.category ILIKE $${paramIdx}
          )`);
          values.push(`%${search}%`);
          paramIdx++;
        }

        const where = conditions.join(" AND ");

        const orderMap: Record<string, string> = {
          newest:     "cp.created_at DESC",
          price_asc:  "cp.price ASC",
          price_desc: "cp.price DESC",
          name_asc:   "cp.name ASC",
        };
        const orderClause = orderMap[sort] ?? orderMap.newest;

        const dataValues = [...values, pageSize, from];
        const { rows } = await catalogDb.query(
          `SELECT
                  cp.id,
                  cp.sku,
                  cp.slug,
                  cp.name,
                  cp.brand,
                  cp.category,
                  cp.price,
                  cp.msrp,
                  cp.map_price,
                  cp.weight,
                  cp.description,
                  cp.is_active,
                  cp.created_at,
                  COALESCE((
                    SELECT ci.url
                    FROM public.catalog_images ci
                    WHERE ci.catalog_product_id = cp.id
                      AND ci.is_primary = true
                    ORDER BY ci.position
                    LIMIT 1
                  ), NULL) AS image,
                  COALESCE((
                    SELECT ARRAY_AGG(ci.url ORDER BY ci.position)
                    FROM public.catalog_images ci
                    WHERE ci.catalog_product_id = cp.id
                  ), '{}'::text[]) AS images,
                  COALESCE((
                    SELECT SUM(COALESCE(vo.total_qty, 0))
                    FROM public.vendor_offers vo
                    WHERE vo.catalog_product_id = cp.id
                      AND vo.is_active = true
                  ), 0) AS stock_quantity,
                  COUNT(*) OVER() AS total_count
           FROM public.catalog_products cp
           WHERE ${where}
           ORDER BY ${orderClause}
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          dataValues
        );

        const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
        const products = rows.map(normalizeRow);

        return { products, total };
      })(),

      // Facet counts via Postgres function (single round-trip)
      getCatalogDb().query(
        'SELECT get_product_facets($1, $2, $3, $4, $5) AS data',
        [brand ?? null, category ?? null, minPrice ?? null, maxPrice ?? null, inStock ?? null]
      ).then(r => ({ data: r.rows[0].data })),

    ]);

    const products = productsResult.products ?? [];
    const total    = productsResult.total ?? 0;
    const facets   = (facetsResult.data as any) ?? { categories: [], brands: [], price_range: { min: 0, max: 0 } };

    return NextResponse.json({
      products,
      total,
      page,
      pageSize,
      facets: {
        categories: facets.categories ?? [],
        brands:     facets.brands     ?? [],
        priceRange: facets.price_range ?? { min: 0, max: 0 },
      },
    });

  } catch (err: any) {
    console.error("[/api/products] Error:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// ── Row normalizer ────────────────────────────────────────────
// Mirrors the normalizer in shop/page.jsx — single source of
// truth for DB → UI field mapping.
// TODO: extract to lib/normalizers/product.ts (Phase B cleanup)
function normalizeRow(row: any) {
  return {
    id:         row.id,
    slug:       row.slug,
    name:       row.name,
    brand:      row.brand ?? "Unknown",
    category:   row.category ?? "Uncategorized",
    price:      Number(row.price ?? 0),
    was:        Number(row.msrp ?? 0) > Number(row.price ?? 0) ? Number(row.msrp) : null,
    mapPrice:   row.map_price != null ? Number(row.map_price) : null,
    badge:      row.is_new ? "new" : null,
    inStock:    (row.stock_quantity ?? 0) > 0,
    fitmentIds: null, // populated after ACES import (Phase 5)
    image:      row.image
                  ?? (Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : null),
  };
}
