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
  const inStock      = url.searchParams.get("inStock") === "true" ? true : undefined;
  const search       = url.searchParams.get("search")?.trim() || undefined;
  const fitmentMake  = url.searchParams.get("fitmentMake")?.trim()  || undefined;
  const fitmentModel = url.searchParams.get("fitmentModel")?.trim() || undefined;
  const fitmentYear  = url.searchParams.get("fitmentYear")
    ? parseInt(url.searchParams.get("fitmentYear")!, 10) : undefined;
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
        if (fitmentMake) {
          const makeIdx = paramIdx++;
          values.push(fitmentMake);
          let fitmentClauses = `AND LOWER(cf.make) = LOWER($${makeIdx})`;
          if (fitmentModel) {
            fitmentClauses += ` AND LOWER(cf.model) = LOWER($${paramIdx++})`;
            values.push(fitmentModel);
          }
          if (fitmentYear) {
            fitmentClauses += ` AND cf.year_start <= $${paramIdx} AND cf.year_end >= $${paramIdx}`;
            paramIdx++;
            values.push(fitmentYear);
          }
          conditions.push(
            `EXISTS (SELECT 1 FROM public.catalog_fitment cf WHERE cf.product_id = cp.id ${fitmentClauses})`
          );
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
                    SELECT cm.url
                    FROM public.catalog_media cm
                    WHERE cm.product_id = cp.id
                    ORDER BY cm.priority ASC
                    LIMIT 1
                  ), NULL) AS image,
                  COALESCE((
                    SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC)
                    FROM public.catalog_media cm
                    WHERE cm.product_id = cp.id
                  ), '{}'::text[]) AS images,
                  COALESCE((
                    SELECT SUM(vo.total_qty)
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

    if (!rows.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  }

  // Multiple products by IDs (for cart)
  if (ids?.length) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await pool.query(
      `SELECT * FROM catalog_unified WHERE id IN (${placeholders}) AND is_active = true`,
      ids
    );
    return NextResponse.json(rows);
  }

  // Paginated list with filters
  const page     = parseInt(p.get("page")     || "1");
  const limit    = parseInt(p.get("limit")    || "24");
  const offset   = (page - 1) * limit;
  const brand    = p.get("brand");
  const category = p.get("category");
  const vendor   = p.get("vendor");
  const inStock  = p.get("in_stock") === "true";
  const harley   = p.get("harley")   === "true";
  const dragPart = p.get("drag")     === "true";
  const oldbook  = p.get("oldbook")  === "true";

  const conditions: string[] = ["is_active = true"];
  const values: any[] = [];
  let idx = 1;

  if (brand)    { conditions.push(`brand = $${idx++}`);         values.push(brand); }
  if (category) { conditions.push(`category = $${idx++}`);      values.push(category); }
  if (vendor)   { conditions.push(`source_vendor = $${idx++}`); values.push(vendor); }
  if (inStock)  conditions.push("in_stock = true");
  if (harley)   conditions.push("is_harley_fitment = true");
  if (dragPart) conditions.push("drag_part = true");
  if (oldbook)  conditions.push("in_oldbook = true");

  const where = conditions.join(" AND ");

  const [{ rows }, { rows: [{ count }] }] = await Promise.all([
    pool.query(
      `SELECT id, sku, name, brand, category, msrp, cost, image_url,
              in_stock, stock_quantity, source_vendor, slug,
              is_harley_fitment, fitment_hd_families, fitment_year_start, fitment_year_end,
              drag_part, in_oldbook, in_fatbook, features
       FROM catalog_unified
       WHERE ${where}
       ORDER BY sort_priority DESC, name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM catalog_unified WHERE ${where}`, values),
  ]);

  return NextResponse.json({
    products:    rows,
    total:       parseInt(count),
    page,
    total_pages: Math.ceil(parseInt(count) / limit),
  });
}
