/**
 * lib/db/browse.ts
 * All queries against catalog_unified — the single source of truth.
 * Phase 10 — fitment via catalog_fitment_v2 only.
 * Supports multi-family, universal/chopper, year range bounds.
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
  fits_all_models: boolean;
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
  const { rows } = await pool.query(`SELECT id, name, start_year, end_year FROM harley_families ORDER BY name`);
  return rows;
}

export async function getModels(familyId: number): Promise<HarleyModel[]> {
  const { rows } = await pool.query(`SELECT id, name, model_code, family_id FROM harley_models WHERE family_id = $1 ORDER BY name`, [familyId]);
  return rows;
}

export async function getYears(modelId: number): Promise<number[]> {
  const { rows } = await pool.query(`SELECT year FROM harley_model_years WHERE model_id = $1 ORDER BY year DESC`, [modelId]);
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
    family, families, yearMin, yearMax,
    universal, modelCode, year,
    category, dbCategories,
    brand, inStock, search,
    minPrice, maxPrice,
    page = 1, perPage = 48, sort = "relevance",
  } = filters;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  const effectiveFamilies: string[] = families?.length ? families : family ? [family] : [];

  let fitmentJoin = "";

  if (universal) {
    conditions.push(`(cu.fits_all_models = true OR cu.is_universal = true)`);
  } else if (effectiveFamilies.length > 0 || modelCode || year || yearMin || yearMax) {
    fitmentJoin = `
      JOIN catalog_fitment_v2 cfv ON cfv.product_id = cu.id
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
    `;

    if (effectiveFamilies.length === 1) {
      conditions.push(`hf.name = $${p++}`);
      params.push(effectiveFamilies[0]);
    } else if (effectiveFamilies.length > 1) {
      conditions.push(`hf.name = ANY($${p++}::text[])`);
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
    // e.g. Ironhead (1957-1985) vs Evo Sportster (1986-2021), both "Sportster"
    if (yearMin) {
      conditions.push(`hmy.year >= $${p++}`);
      params.push(yearMin);
    }
    if (yearMax) {
      conditions.push(`hmy.year <= $${p++}`);
      params.push(yearMax);
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

  if (brand) { conditions.push(`cu.brand ILIKE $${p++}`); params.push(brand); }
  if (inStock) { conditions.push(`cu.in_stock = true`); }
  if (search) {
    conditions.push(`(cu.name ILIKE $${p++} OR cu.brand ILIKE $${p} OR cu.sku ILIKE $${p} OR $${p} = ANY(cu.oem_numbers))`);
    params.push(`%${search}%`);
    p += 3;
  }
  if (minPrice != null) { conditions.push(`cu.computed_price >= $${p++}`); params.push(minPrice); }
  if (maxPrice != null) { conditions.push(`cu.computed_price <= $${p++}`); params.push(maxPrice); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortMap: Record<string, string> = {
    relevance:  "cu.in_stock DESC, cu.name ASC",
    price_asc:  "cu.computed_price ASC NULLS LAST",
    price_desc: "cu.computed_price DESC NULLS LAST",
    name_asc:   "cu.name ASC",
    newest:     "cu.id DESC",
  };
  const orderBy = sortMap[sort] ?? "cu.id DESC";
  const offset = (page - 1) * perPage;

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
  `;

  const dataQuery = sort === "relevance"
    ? `WITH base AS (${baseQuery}), ranked AS (
        SELECT base.*, ROW_NUMBER() OVER (PARTITION BY base.source_vendor ORDER BY base.id DESC) AS vendor_rank
        FROM base
      )
      SELECT ranked.id, ranked.sku, ranked.slug, ranked.name, ranked.brand,
        ranked.category, ranked.subcategory, ranked.source_vendor,
        ranked.computed_price, ranked.msrp, ranked.map_price,
        ranked.image_url, ranked.image_urls, ranked.in_stock, ranked.stock_quantity,
        ranked.is_harley_fitment, ranked.features, ranked.oem_numbers
      FROM ranked
      ORDER BY ranked.in_stock DESC, ranked.name ASC
      LIMIT $${p++} OFFSET $${p++}`
    : `${baseQuery} ORDER BY ${orderBy} LIMIT $${p++} OFFSET $${p++}`;

  params.push(perPage, offset);

  const filterParamCount = params.length - 2;
  const facetParams = params.slice(0, filterParamCount);
  const facetBase = `FROM catalog_unified cu ${fitmentJoin} ${where}`;

  const [dataRes, countRes, catRes, brandRes, priceRes] = await Promise.all([
    pool.query(dataQuery, params),
    pool.query(`SELECT COUNT(DISTINCT cu.id) AS total FROM catalog_unified cu ${fitmentJoin} ${where}`, facetParams),
    pool.query(`SELECT cu.category AS name, COUNT(DISTINCT cu.id) AS count ${facetBase} GROUP BY cu.category ORDER BY count DESC LIMIT 20`, facetParams),
    pool.query(`SELECT cu.brand AS name, COUNT(DISTINCT cu.id) AS count ${facetBase} GROUP BY cu.brand ORDER BY count DESC LIMIT 30`, facetParams),
    pool.query(`SELECT MIN(cu.computed_price) AS min, MAX(cu.computed_price) AS max ${facetBase}`, facetParams),
  ]);

  return {
    products: dataRes.rows,
    total: parseInt(countRes.rows[0]?.total ?? "0"),
    page,
    perPage,
    facets: {
      categories: catRes.rows.map((r) => ({ name: r.name, count: parseInt(r.count) })),
      brands: brandRes.rows.map((r) => ({ name: r.name, count: parseInt(r.count) })),
      priceRange: {
        min: parseFloat(priceRes.rows[0]?.min ?? "0"),
        max: parseFloat(priceRes.rows[0]?.max ?? "0"),
      },
    },
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
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

export async function getCategoryStats(): Promise<{ category: string; count: number }[]> {
  const { rows } = await pool.query(
    `SELECT category, COUNT(*) AS count FROM catalog_unified WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 20`
  );
  return rows.map((r) => ({ category: r.category, count: parseInt(r.count) }));
}

export async function quickSearch(q: string, limit = 8): Promise<CatalogProduct[]> {
  const { rows } = await pool.query(
    `SELECT id, sku, slug, name, brand, category, computed_price, image_url, in_stock
     FROM catalog_unified
     WHERE name ILIKE $1 OR sku ILIKE $2 OR brand ILIKE $1 OR $3 = ANY(oem_numbers)
     ORDER BY CASE WHEN sku ILIKE $2 THEN 0 ELSE 1 END, in_stock DESC, name
     LIMIT $4`,
    [`%${q}%`, `${q}%`, q, limit]
  );
  return rows;
}