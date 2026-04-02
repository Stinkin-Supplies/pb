// ============================================================
// app/shop/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches first page + facets server-side so the initial render
// is instant with no loading state. ShopClient takes over for
// all subsequent filter/sort/page changes via /api/products.
// ============================================================

import getCatalogDb from "@/lib/db/catalog";
import ShopClient from "./ShopClient";

const PAGE_SIZE = 48;

const ORDER_MAP = {
  newest:     { col: "created_at", dir: "DESC" },
  price_asc:  { col: "price",      dir: "ASC"  },
  price_desc: { col: "price",      dir: "DESC" },
  name_asc:   { col: "name",       dir: "ASC"  },
};

export default async function ShopPage({ searchParams }) {
  const p        = await searchParams;
  const category = p?.category ?? null;
  const brand    = p?.brand    ?? null;
  const sort     = p?.sort     ?? "newest";

  let products   = [];
  let total      = 0;
  let facets     = { categories: [], brands: [], priceRange: { min: 0, max: 0 } };

  const order  = ORDER_MAP[sort] ?? ORDER_MAP.newest;

  try {
    const catalogDb = getCatalogDb();

    // ── Build WHERE clause ───────────────────────────────
    const conditions = ["cp.is_active = true"];
    const params     = [];
    let   idx        = 1;

    if (category) { conditions.push(`cp.category = $${idx++}`); params.push(category); }
    if (brand)    { conditions.push(`cp.brand = $${idx++}`);    params.push(brand);    }

    const WHERE = `WHERE ${conditions.join(" AND ")}`;

    // ── Products + count ─────────────────────────────────
    const [rowsResult, countResult] = await Promise.all([
      catalogDb.query(
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
                  SELECT SUM(vo.total_qty)
                  FROM public.vendor_offers vo
                  WHERE vo.catalog_product_id = cp.id
                    AND vo.is_active = true
                ), 0) AS stock_quantity
         FROM public.catalog_products cp
         ${WHERE}
         ORDER BY cp.${order.col} ${order.dir}
         LIMIT ${PAGE_SIZE} OFFSET 0`,
        params
      ),
      catalogDb.query(
        `SELECT COUNT(*) FROM public.catalog_products cp ${WHERE}`,
        params
      ),
    ]);

    products = (rowsResult.rows ?? []).map(normalizeRow);
    total    = parseInt(countResult.rows[0]?.count ?? "0", 10);

    // ── Facets (non-fatal) ───────────────────────────────
    try {
      const facetResult = await catalogDb.query(
        `SELECT get_product_facets($1, $2, $3, $4, $5) AS data`,
        [brand ?? null, category ?? null, null, null, null]
      );
      const raw = facetResult.rows[0]?.data ?? {};
      facets = {
        categories: raw.categories ?? [],
        brands:     raw.brands     ?? [],
        priceRange: raw.price_range ?? { min: 0, max: 0 },
      };
    } catch (facetErr) {
      console.warn("[ShopPage] facets error:", facetErr.message);
    }

  } catch (err) {
    console.error("[ShopPage]", err.message);
  }

  return (
    <ShopClient
      initialProducts={products}
      initialFacets={facets}
      initialTotal={total}
      initialCategory={category}
      initialBrand={brand}
    />
  );
}

function normalizeRow(row) {
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
    inStock:    Number(row.stock_quantity ?? 0) > 0,
    fitmentIds: null,
    image:      row.image ?? row.images?.[0] ?? null,
  };
}

export const metadata = {
  title:       "Shop All Parts | Stinkin' Supplies",
  description: "Browse 500K+ powersports parts and accessories.",
};
