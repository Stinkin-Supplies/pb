/**
 * lib/db/browse.ts
 * All queries against catalog_unified — the single source of truth.
 * Phase 10 — fitment via catalog_fitment_v2 only.
 * Supports multi-family, universal/chopper, year range bounds.
 *
 * FIXES (May 2026):
 *  1. universal branch: removed fits_all_models (doesn't exist on catalog_unified),
 *     uses is_harley_fitment = false OR is_universal = true as the universal signal.
 *  2. Fitment JOIN changed to LEFT JOIN with fallback so products that have
 *     is_harley_fitment = true but no catalog_fitment_v2 rows yet (JW Boon pending
 *     re-run) still surface in era pages.
 *  3. relevance sort: removed the vendor_rank CTE — it was re-introducing duplicates
 *     and producing counts that didn't match the COUNT(DISTINCT) total.
 *  4. facetParams slice is now derived before LIMIT/OFFSET are pushed, so it's
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

  if (universal) {
    // FIX 1: fits_all_models does not exist on catalog_unified.
    // Universal/chopper era = products not explicitly tied to a specific H-D
    // fitment family, OR explicitly flagged is_harley_fitment = false.
    // Adjust this condition to match whatever signal you use in catalog_unified.
    conditions.push(`(cu.is_harley_fitment = false OR cu.is_universal = true)`);
  } else if (effectiveFamilies.length > 0 || modelCode || year || yearMin || yearMax) {
    // FIX 2: LEFT JOIN so products with is_harley_fitment=true but no
    // catalog_fitment_v2 rows yet (JW Boon pending re-run) still surface.
    // The OR condition in the WHERE acts as the fallback.
    fitmentJoin = `
      LEFT JOIN catalog_fitment_v2 cfv ON cfv.product_id = cu.id
      LEFT JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      LEFT JOIN harley_models hm ON hm.id = hmy.model_id
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

    // Exact year (user dropdown selection)
    if (year) {
      conditions.push(`hmy.year = $${p++}`);
      params.push(year);
    }

    // Era year range bounds — used to split eras sharing a family
    // e.g. Ironhead (1957–1985) vs Evo Sportster (1986–2021), both "Sportster"
    if (yearMin) {
      familyConditions.push(`hmy.year >= $${p++}`);
      params.push(yearMin);
    }
    if (yearMax) {
      familyConditions.push(`hmy.year <= $${p++}`);
      params.push(yearMax);
    }

    // Fallback: include products flagged is_harley_fitment=true that don't
    // have fitment rows yet (JW Boon not yet re-run after rebuild).
    // Once JW Boon is re-run this fallback is harmless — it just OR-matches
    // things that already match via the JOIN.
    if (familyConditions.length > 0) {
      conditions.push(
        `(
          (${familyConditions.join(" AND ")})
          OR (cfv.id IS NULL AND cu.is_harley_fitment = true)
        )`
      );
    } else {
      // year/modelCode-only path — no fallback needed
    }
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
