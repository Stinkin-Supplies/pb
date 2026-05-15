/**
 * lib/db/browse.ts
 * All queries against catalog_unified — the single source of truth.
 * Phase 10 — fitment via catalog_fitment_v2 only.
 * Supports multi-family, universal/chopper, year range bounds.
 *
 * FIXES (May 2026):
 *  1. universal branch: removed fits_all_models (doesn't exist on catalog_unified),
 *     uses is_harley_fitment = false OR is_universal = true as the universal signal.
 *  2. yearMin/yearMax moved from WHERE familyConditions into the LEFT JOIN ON clause.
 *     Previously they were in the WHERE which broke the is_harley_fitment fallback —
 *     the fallback arm (cfv_yr.id IS NULL) would ignore year bounds and dump all
 *     non-fitment products into every era page. With them on the JOIN, the LEFT JOIN
 *     itself only matches rows in the correct year range, so cfv_yr.id IS NULL means
 *     "no fitment in this year range" which is the correct fallback signal.
 *  3. Added cu.is_active = true to every query path.
 *  4. relevance sort: removed the vendor_rank CTE — it was re-introducing duplicates
 *     and producing counts that didn't match the COUNT(DISTINCT) total.
 *  5. facetParams slice is now derived before LIMIT/OFFSET are pushed, so it's
 *     always safe regardless of sort branch.
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
  max: 10,
  idleTimeoutMillis: 30000,
});

export { pool };

export interface CatalogProduct {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string | null;
  source_vendor: string;
  computed_price: number | null;
  msrp: number | null;
  map_price: number | null;
  image_url: string | null;
  image_urls?: string[] | null;
  in_stock: boolean;
  stock_quantity: number;
  is_harley_fitment: boolean;
  features: string[];
  oem_numbers: string[];
}

export interface ProductDetail extends CatalogProduct {
  description: string | null;
  weight: number | null;
  upc: string | null;
  country_of_origin: string | null;
  manufacturer_part_number: string | null;
  fitment: FitmentSummary[];
}

export interface FitmentSummary {
  family: string;
  model: string;
  model_code: string;
  year_start: number;
  year_end: number;
}

export interface HarleyFamily {
  id: number;
  name: string;
  start_year: number | null;
  end_year: number | null;
}

export interface HarleyModel {
  id: number;
  name: string;
  model_code: string;
  family_id: number;
}

export interface BrowseFilters {
  family?: string;
  families?: string[];
  // Era year range bounds — splits shared families (e.g. Ironhead vs Evo Sportster)
  yearMin?: number;
  yearMax?: number;
  universal?: boolean;
  modelCode?: string;
  year?: number;
  category?: string;
  dbCategories?: string[];
  brand?: string;
  inStock?: boolean;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  perPage?: number;
  sort?: "relevance" | "price_asc" | "price_desc" | "name_asc" | "newest";
}

export interface BrowseResult {
  products: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
  facets: {
    categories: { name: string; count: number }[];
    brands: { name: string; count: number }[];
    priceRange: { min: number; max: number };
  };
}

export async function getFamilies(): Promise<HarleyFamily[]> {
  const { rows } = await pool.query(
    `SELECT id, name, start_year, end_year FROM harley_families ORDER BY name`
  );
  return rows;
}

export async function getModels(familyId: number): Promise<HarleyModel[]> {
  const { rows } = await pool.query(
    `SELECT id, name, model_code, family_id FROM harley_models WHERE family_id = $1 ORDER BY name`,
    [familyId]
  );
  return rows;
}

export async function getYears(modelId: number): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT year FROM harley_model_years WHERE model_id = $1 ORDER BY year DESC`,
    [modelId]
  );
  return rows.map((r) => r.year);
}

export async function getFamilyProductCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query(
    `SELECT hf.name AS family, COUNT(DISTINCT cfv.product_id) AS cnt
     FROM harley_families hf
     JOIN harley_models hm ON hm.family_id = hf.id
     JOIN harley_model_years hmy ON hmy.model_id = hm.id
     JOIN catalog_fitment_v2 cfv ON cfv.model_year_id = hmy.id
     GROUP BY hf.name`
  );
  const result: Record<string, number> = {};
  for (const r of rows) result[r.family] = parseInt(r.cnt);
  return result;
}

export async function browseProducts(filters: BrowseFilters): Promise<BrowseResult> {
  const {
    family,
    families,
    yearMin,
    yearMax,
    universal,
    modelCode,
    year,
    category,
    dbCategories,
    brand,
    inStock,
    search,
    minPrice,
    maxPrice,
    page = 1,
    perPage = 48,
    sort = "relevance",
  } = filters;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  const effectiveFamilies: string[] = families?.length
    ? families
    : family
    ? [family]
    : [];

  let fitmentJoin = "";

  // Always filter to active products only
  conditions.push(`cu.is_active = true`);

  if (universal) {
    // Universal/chopper era — products not tied to a specific H-D family.
    conditions.push(`(cu.is_harley_fitment = false OR cu.is_universal = true)`);
  } else if (effectiveFamilies.length > 0 || modelCode || year || yearMin || yearMax) {
    // yearMin/yearMax are pushed into a subquery so they filter BEFORE the
    // LEFT JOIN, rather than living in the WHERE clause (which would break the
    // is_harley_fitment fallback — the fallback arm would ignore year bounds and
    // surface all non-fitment products for every era page).
    // Using a subquery also avoids the join-order problem where hmy.year would
    // not yet be in scope if placed directly in the cfv LEFT JOIN ON clause.
    const fitSubConditions: string[] = [];
    if (yearMin) {
      fitSubConditions.push(`hmy2.year >= $${p++}`);
      params.push(yearMin);
    }
    if (yearMax) {
      fitSubConditions.push(`hmy2.year <= $${p++}`);
      params.push(yearMax);
    }

    const fitSubWhere = fitSubConditions.length > 0
      ? `WHERE ${fitSubConditions.join(" AND ")}`
      : "";

    // cfv_yr is a pre-filtered set of fitment rows (year-bounded).
    // cfv_yr.id IS NULL after the LEFT JOIN means "no fitment row in this year range"
    // which is the correct signal for the is_harley_fitment fallback.
    fitmentJoin = `
      LEFT JOIN (
        SELECT cfv2.id, cfv2.product_id, hmy2.model_id, hmy2.year
        FROM catalog_fitment_v2 cfv2
        JOIN harley_model_years hmy2 ON hmy2.id = cfv2.model_year_id
        ${fitSubWhere}
      ) cfv_yr ON cfv_yr.product_id = cu.id
      LEFT JOIN harley_models hm ON hm.id = cfv_yr.model_id
      LEFT JOIN harley_families hf ON hf.id = hm.family_id
    `;

    const familyConditions: string[] = [];

    if (effectiveFamilies.length === 1) {
      familyConditions.push(`hf.name = $${p++}`);
      params.push(effectiveFamilies[0]);
    } else if (effectiveFamilies.length > 1) {
      familyConditions.push(`hf.name = ANY($${p++}::text[])`);
      params.push(effectiveFamilies);
    }

    if (modelCode) {
      conditions.push(`hm.model_code = $${p++}`);
      params.push(modelCode);
    }

    // Exact year (user dropdown — not era range)
    if (year) {
      conditions.push(`cfv_yr.year = $${p++}`);
      params.push(year);
    }

    if (familyConditions.length > 0) {
      // Fallback: is_harley_fitment=true products with no fitment rows yet.
      // cfv_yr.id IS NULL after the year-bounded LEFT JOIN means either:
      //   (a) no fitment rows at all, or
      //   (b) fitment rows exist but none match the year range.
      // Both are valid fallback cases — a product flagged is_harley_fitment
      // that predates our fitment data should still surface for its era.
      conditions.push(
        `(
          (${familyConditions.join(" AND ")})
          OR (cfv_yr.id IS NULL AND cu.is_harley_fitment = true)
        )`
      );
    }
    // year/modelCode-only path — no family condition needed
  }

  if (dbCategories && dbCategories.length > 0) {
    if (dbCategories.length === 1) {
      conditions.push(`cu.category = $${p++}`);
      params.push(dbCategories[0]);
    } else {
      conditions.push(`cu.category = ANY($${p++}::text[])`);
      params.push(dbCategories);
    }
  } else if (category) {
    conditions.push(`cu.category = $${p++}`);
    params.push(category);
  }

  if (brand) {
    conditions.push(`cu.brand ILIKE $${p++}`);
    params.push(brand);
  }
  if (inStock) {
    conditions.push(`cu.in_stock = true`);
  }
  if (search) {
    const likeParam = p++;
    const exactParam = p++;
    conditions.push(
      `(cu.name ILIKE $${likeParam} OR cu.brand ILIKE $${likeParam} OR cu.sku ILIKE $${likeParam} OR $${exactParam}::text = ANY(cu.oem_numbers))`
    );
    params.push(`%${search}%`, search);
  }
  if (minPrice != null) {
    conditions.push(`cu.computed_price >= $${p++}`);
    params.push(minPrice);
  }
  if (maxPrice != null) {
    conditions.push(`cu.computed_price <= $${p++}`);
    params.push(maxPrice);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sortMap: Record<string, string> = {
    relevance:  "cu.in_stock DESC, cu.name ASC",
    price_asc:  "cu.computed_price ASC NULLS LAST",
    price_desc: "cu.computed_price DESC NULLS LAST",
    name_asc:   "cu.name ASC",
    newest:     "cu.id DESC",
  };
  const orderBy = sortMap[sort] ?? "cu.id DESC";
  const offset = (page - 1) * perPage;

  // FIX 3: Snapshot facet params BEFORE pushing LIMIT/OFFSET.
  // This is always correct regardless of sort branch.
  const facetParams = [...params];

  // Now push pagination params
  const limitParam = p++;
  const offsetParam = p++;
  params.push(perPage, offset);

  const baseQuery = `
    SELECT DISTINCT
      cu.id, cu.sku, cu.slug, cu.name, cu.brand,
      cu.category, cu.subcategory, cu.source_vendor,
      cu.computed_price, cu.msrp, cu.map_price,
      cu.image_url, cu.image_urls, cu.in_stock, cu.stock_quantity,
      cu.is_harley_fitment, cu.features, cu.oem_numbers
    FROM catalog_unified cu
    ${fitmentJoin}
    ${where}
    ORDER BY ${orderBy}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  // FIX 4: Removed the vendor_rank CTE from relevance sort. It was
  // deduplicating by vendor rather than by product, producing result counts
  // that didn't match the COUNT(DISTINCT cu.id) total used for pagination.
  // DISTINCT in the SELECT already handles multi-row joins correctly.
  const dataQuery = baseQuery;

  const facetBase = `FROM catalog_unified cu ${fitmentJoin} ${where}`;

  const [dataRes, countRes, catRes, brandRes, priceRes] = await Promise.all([
    pool.query(dataQuery, params),
    pool.query(
      `SELECT COUNT(DISTINCT cu.id) AS total FROM catalog_unified cu ${fitmentJoin} ${where}`,
      facetParams
    ),
    pool.query(
      `SELECT cu.category AS name, COUNT(DISTINCT cu.id) AS count ${facetBase} GROUP BY cu.category ORDER BY count DESC LIMIT 20`,
      facetParams
    ),
    pool.query(
      `SELECT cu.brand AS name, COUNT(DISTINCT cu.id) AS count ${facetBase} GROUP BY cu.brand ORDER BY count DESC LIMIT 30`,
      facetParams
    ),
    pool.query(
      `SELECT MIN(cu.computed_price) AS min, MAX(cu.computed_price) AS max ${facetBase}`,
      facetParams
    ),
  ]);

  return {
    products: dataRes.rows,
    total: parseInt(countRes.rows[0]?.total ?? "0"),
    page,
    perPage,
    facets: {
      categories: catRes.rows.map((r) => ({
        name: r.name,
        count: parseInt(r.count),
      })),
      brands: brandRes.rows.map((r) => ({
        name: r.name,
        count: parseInt(r.count),
      })),
      priceRange: {
        min: parseFloat(priceRes.rows[0]?.min ?? "0"),
        max: parseFloat(priceRes.rows[0]?.max ?? "0"),
      },
    },
  };
}

export async function getProductBySlug(
  slug: string
): Promise<ProductDetail | null> {
  const { rows } = await pool.query(
    `SELECT cu.*, cp.description, cp.weight, cp.upc, cp.country_of_origin, cp.manufacturer_part_number
     FROM catalog_unified cu
     LEFT JOIN catalog_products cp ON cp.id = cu.id
     WHERE cu.slug = $1 LIMIT 1`,
    [slug]
  );
  if (!rows[0]) return null;
  const product = rows[0];
  const { rows: fitRows } = await pool.query(
    `SELECT hf.name AS family, hm.name AS model, hm.model_code,
       MIN(hmy.year) AS year_start, MAX(hmy.year) AS year_end
     FROM catalog_fitment_v2 cfv
     JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
     JOIN harley_models hm ON hm.id = hmy.model_id
     JOIN harley_families hf ON hf.id = hm.family_id
     WHERE cfv.product_id = $1
     GROUP BY hf.name, hm.name, hm.model_code
     ORDER BY hf.name, hm.name`,
    [product.id]
  );
  return { ...product, fitment: fitRows };
}

export async function getCategoryStats(): Promise<
  { category: string; count: number }[]
> {
  const { rows } = await pool.query(
    `SELECT category, COUNT(*) AS count FROM catalog_unified WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 20`
  );
  return rows.map((r) => ({ category: r.category, count: parseInt(r.count) }));
}

export async function quickSearch(
  q: string,
  limit = 8
): Promise<CatalogProduct[]> {
  const { rows } = await pool.query(
    `SELECT id, sku, slug, name, brand, category, computed_price, image_url, in_stock
     FROM catalog_unified
     WHERE name ILIKE $1 OR sku ILIKE $2 OR brand ILIKE $1 OR $3::text = ANY(oem_numbers)
     ORDER BY CASE WHEN sku ILIKE $2 THEN 0 ELSE 1 END, in_stock DESC, name
     LIMIT $4`,
    [`%${q}%`, `${q}%`, q, limit]
  );
  return rows;
}
