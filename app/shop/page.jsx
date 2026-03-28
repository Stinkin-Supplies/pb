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
  price_asc:  { col: "our_price",  dir: "ASC"  },
  price_desc: { col: "our_price",  dir: "DESC" },
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
    const conditions = ["status = 'active'"];
    const params     = [];
    let   idx        = 1;

    if (category) { conditions.push(`category_name = $${idx++}`); params.push(category); }
    if (brand)    { conditions.push(`brand_name = $${idx++}`);    params.push(brand);    }

    const WHERE = `WHERE ${conditions.join(" AND ")}`;

    // ── Products + count ─────────────────────────────────
    const [rowsResult, countResult] = await Promise.all([
      catalogDb.query(
        `SELECT id, sku, slug, name, brand_name, category_name,
                our_price, msrp, compare_at_price, map_price,
                in_stock, stock_quantity, is_new, images
         FROM products
         ${WHERE}
         ORDER BY ${order.col} ${order.dir}
         LIMIT ${PAGE_SIZE} OFFSET 0`,
        params
      ),
      catalogDb.query(
        `SELECT COUNT(*) FROM products ${WHERE}`,
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
    brand:      row.brand_name    ?? "Unknown",
    category:   row.category_name ?? "Uncategorized",
    price:      Number(row.our_price ?? 0),
    was:        (row.compare_at_price > row.our_price) ? Number(row.compare_at_price)
              : (row.msrp > row.our_price)             ? Number(row.msrp)
              : null,
    mapPrice:   row.map_price ? Number(row.map_price) : null,
    badge:      row.is_new ? "new" : null,
    inStock:    row.in_stock ?? (row.stock_quantity > 0),
    fitmentIds: null,
    image:      row.images?.[0] ?? null,
  };
}

export const metadata = {
  title:       "Shop All Parts | Stinkin' Supplies",
  description: "Browse 500K+ powersports parts and accessories.",
};