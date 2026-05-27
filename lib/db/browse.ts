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
import {
  typesenseClient,
  COLLECTION,
  DEFAULT_SEARCH_PARAMS,
  VARIANT_GROUP_FIELD,
} from "@/lib/typesense/client";

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
  display_category: string | null;
  display_subcategory: string | null;
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
  variant_group_id: number | null;
  variant_count: number;
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

// Era slug → catalog_unified boolean column map
const ERA_COLUMN_MAP: Record<string, string> = {
  "flathead":            "era_flathead",
  "knucklehead":         "era_knucklehead",
  "panhead":             "era_panhead",
  "ironhead-sportster":  "era_ironhead",
  "shovelhead":          "era_shovelhead",
  "evolution":           "era_evolution",
  "evo-sportster":       "era_evo_sportster",
  "twin-cam":            "era_twin_cam",
  "milwaukee-8":         "era_milwaukee8",
  "chopper":             "era_chopper",
};

export interface BrowseFilters {
  eraSlug?: string;      // era page slug — uses era_* boolean columns directly
  family?: string;
  families?: string[];
  // Era year range bounds — splits shared families (e.g. Ironhead vs Evo Sportster)
  yearMin?: number;
  yearMax?: number;
  universal?: boolean;
  modelCode?: string;
  modelCodes?: string[];
  year?: number;
  category?: string;
  dbCategories?: string[];
  displayCategory?: string;
  displaySubcategory?: string;
  brand?: string;
  inStock?: boolean;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  perPage?: number;
  subcategory?: string;
  sort?: "relevance" | "price_asc" | "price_desc" | "name_asc" | "newest" | "year_asc" | "year_desc";
}

export interface PartNeighbor {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  computed_price: number | null;
  image_url: string | null;
  fitment_year_start: number | null;
  fitment_year_end: number | null;
  in_stock: boolean;
}

export interface BrowseResult {
  products: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
  facets: {
    categories: { name: string; count: number }[];
    brands: { name: string; count: number }[];
    subcategories: { name: string; count: number }[];
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

/**
 * Hit Typesense with a text query and return ranked product IDs.
 * Used by browseProducts when `search` is present so browse gets
 * Typesense relevance scoring instead of postgres ILIKE.
 * Returns { ids, total } where ids are ordered by Typesense rank.
 */
async function searchProductIds(
  q: string,
  page: number,
  perPage: number,
  extraFilters?: string
): Promise<{ ids: number[]; total: number }> {
  try {
    const results = await typesenseClient
      .collections(COLLECTION)
      .documents()
      .search({
        ...DEFAULT_SEARCH_PARAMS,
        q,
        page,
        per_page: perPage * 3, // fetch extra to account for variant dedup in postgres
        // Don't group here — postgres handles variant dedup
        ...(extraFilters ? { filter_by: extraFilters } : {}),
        // Only return id field — we fetch full data from postgres
        include_fields: "id",
      } as any);

    const ids = (results.hits ?? [])
      .map((h: any) => parseInt(h.document.id))
      .filter((id: number) => !isNaN(id));

    return { ids, total: results.found ?? 0 };
  } catch (err) {
    console.error("[browse] Typesense search failed, falling back to ILIKE:", err);
    return { ids: [], total: 0 };
  }
}

export async function browseProducts(filters: BrowseFilters): Promise<BrowseResult> {
  const {
    eraSlug,
    family,
    families,
    yearMin,
    yearMax,
    universal,
    modelCode,
    modelCodes,
    year,
    category,
    subcategory,
    dbCategories,
    displayCategory,
    displaySubcategory,
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

  if (eraSlug && ERA_COLUMN_MAP[eraSlug]) {
    // Era page — direct boolean column lookup, no fitment JOIN needed.
    // These columns are pre-populated by era_columns_populate.sql and cover
    // all vendors including vintage eras via name inference.
    conditions.push(`cu.${ERA_COLUMN_MAP[eraSlug]} = true`);
  } else if (universal) {
    // Universal/chopper era — products not tied to a specific H-D family.
    conditions.push(`(cu.is_harley_fitment = false OR cu.is_universal = true)`);
  } else if (effectiveFamilies.length > 0 || modelCode || modelCodes?.length || year || yearMin || yearMax) {
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

    if (modelCodes && modelCodes.length > 0) {
      conditions.push(`hm.model_code = ANY($${p++}::text[])`);
      params.push(modelCodes);
    } else if (modelCode) {
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

  // ── Category filtering ─────────────────────────────────────────────────────
  // Prefer display_category (clean unified taxonomy) over raw category.
  // Legacy dbCategories param still supported for backwards compat — maps to
  // raw category column so existing links don't break during transition.
  if (displayCategory) {
    conditions.push(`cu.display_category = $${p++}`);
    params.push(displayCategory);
  } else if (dbCategories && dbCategories.length > 0) {
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

  if (displaySubcategory) {
    conditions.push(`cu.display_subcategory = $${p++}`);
    params.push(displaySubcategory);
  } else if (subcategory) {
    conditions.push(`cu.display_subcategory = $${p++}`);
    params.push(subcategory);
  }

  if (brand) {
    conditions.push(`cu.brand ILIKE $${p++}`);
    params.push(brand);
  }
  if (inStock) {
    conditions.push(`cu.in_stock = true`);
  }
  // ── Text search via Typesense ─────────────────────────────────
  // When `search` is present, hit Typesense first to get relevance-ranked IDs,
  // then filter postgres to those IDs. Falls back to ILIKE if Typesense fails.
  let typesenseIds: number[] | null = null;
  let typesenseTotal: number | null = null;

  if (search) {
    const { ids, total } = await searchProductIds(search, page, perPage);
    if (ids.length > 0) {
      typesenseIds = ids;
      typesenseTotal = total;
      conditions.push(`cu.id = ANY($${p++}::int[])`);
      params.push(ids);
    } else {
      // Typesense returned nothing or failed — fall back to ILIKE
      const likeParam = p++;
      const exactParam = p++;
      conditions.push(
        `(cu.name ILIKE $${likeParam} OR cu.brand ILIKE $${likeParam} OR cu.sku ILIKE $${likeParam} OR $${exactParam}::text = ANY(cu.oem_numbers))`
      );
      params.push(`%${search}%`, search);
    }
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
    relevance:  "d.in_stock DESC, d.name ASC",
    price_asc:  "d.computed_price ASC NULLS LAST",
    price_desc: "d.computed_price DESC NULLS LAST",
    name_asc:   "d.name ASC",
    newest:     "d.id DESC",
    year_asc:   "d.fitment_year_start ASC NULLS LAST, d.name ASC",
    year_desc:  "d.fitment_year_start DESC NULLS FIRST, d.name ASC",
  };

  const offset = (page - 1) * perPage;

  // Snapshot facet params BEFORE pushing array_position IDs or LIMIT/OFFSET.
  // Facet queries only reference the WHERE-clause params ($1..$N here).
  // array_position and pagination params must not bleed into facets.
  const facetParams = [...params];

  // When using Typesense IDs, preserve Typesense's relevance rank.
  // This push MUST come after facetParams is snapshotted.
  const orderBy = typesenseIds && sort === "relevance"
    ? `array_position($${p++}::int[], d.id), d.in_stock DESC`
    : (sortMap[sort] ?? "d.id DESC");
  if (typesenseIds && sort === "relevance") params.push(typesenseIds);

  // Now push pagination params
  const limitParam = p++;
  const offsetParam = p++;
  params.push(perPage, offset);

  // Variant dedup: DISTINCT ON picks one SKU per group (in-stock + lowest price first).
  // Two-level query: DISTINCT ON cannot use window functions, so variant_count
  // is added via a separate GROUP BY subquery joined in the outer level.
  const dataQuery = `
    SELECT d.*, COALESCE(vc.variant_count, 1) AS variant_count
    FROM (
      SELECT DISTINCT ON (COALESCE(cu.variant_group_id::text, 'u' || cu.id::text))
        cu.id, cu.sku, cu.slug, cu.name, cu.brand,
        cu.category, cu.subcategory,
        cu.display_category, cu.display_subcategory,
        cu.source_vendor,
        cu.computed_price, cu.msrp, cu.map_price,
        cu.image_url, cu.image_urls, cu.in_stock, cu.stock_quantity,
        cu.is_harley_fitment, cu.features, cu.oem_numbers,
        cu.variant_group_id,
        cu.fitment_year_start, cu.fitment_year_end
      FROM catalog_unified cu
      ${fitmentJoin}
      ${where}
      ORDER BY COALESCE(cu.variant_group_id::text, 'u' || cu.id::text),
               cu.in_stock DESC,
               cu.computed_price ASC NULLS LAST
    ) d
    LEFT JOIN (
      SELECT variant_group_id, COUNT(*) AS variant_count
      FROM catalog_unified
      WHERE variant_group_id IS NOT NULL AND is_active = true
      GROUP BY variant_group_id
    ) vc ON vc.variant_group_id = d.variant_group_id
    ORDER BY ${orderBy}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const facetBase = `FROM catalog_unified cu ${fitmentJoin} ${where}`;

  const [dataRes, countRes, catRes, brandRes, priceRes, subCatRes] = await Promise.all([
    pool.query(dataQuery, params),
    pool.query(
      `SELECT COUNT(DISTINCT COALESCE(cu.variant_group_id::text, 'u' || cu.id::text)) AS total FROM catalog_unified cu ${fitmentJoin} ${where}`,
      facetParams
    ),
    pool.query(
      `SELECT cu.display_category AS name, COUNT(DISTINCT cu.id) AS count ${facetBase} ${where ? "AND" : "WHERE"} cu.display_category IS NOT NULL GROUP BY cu.display_category ORDER BY count DESC LIMIT 30`,
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
    pool.query(
      `SELECT cu.display_subcategory AS name, COUNT(DISTINCT cu.id) AS count FROM catalog_unified cu ${fitmentJoin} ${where ? where + " AND cu.display_subcategory IS NOT NULL" : "WHERE cu.display_subcategory IS NOT NULL"} GROUP BY cu.display_subcategory ORDER BY count DESC LIMIT 30`,
      facetParams
    ),
  ]);

  return {
    products: dataRes.rows,
    total: typesenseTotal ?? parseInt(countRes.rows[0]?.total ?? "0"),
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
      subcategories: subCatRes.rows.map((r) => ({
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

/**
 * For a product with H-D fitment, find the closest predecessor (fits same model
 * codes, year range ends before ours starts) and successor (starts after ours ends).
 *
 * Year data lives in catalog_fitment_v2 → harley_model_years, NOT in
 * catalog_unified.fitment_year_start / fitment_year_end (those columns are all NULL).
 * We therefore derive the current product's year range and model codes in Step 1,
 * then use GROUP BY + HAVING on the fitment tables to locate neighbors in Step 2.
 */
export async function getChronologicalNeighbors(
  productId: number,
  category: string | null,
): Promise<{
  prev: PartNeighbor | null;
  next: PartNeighbor | null;
  currentYearStart: number | null;
  currentYearEnd: number | null;
}> {
  if (!category) {
    return { prev: null, next: null, currentYearStart: null, currentYearEnd: null };
  }

  // ── Step 1: Derive model codes + year range from fitment tables ──────────
  const { rows: selfRows } = await pool.query(
    `SELECT
       array_agg(DISTINCT hm.model_code) AS model_codes,
       MIN(hmy.year)                      AS year_start,
       MAX(hmy.year)                      AS year_end
     FROM catalog_fitment_v2 cfv
     JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
     JOIN harley_models      hm  ON hm.id  = hmy.model_id
     WHERE cfv.product_id = $1`,
    [productId]
  );

  const self = selfRows[0];
  if (!self?.model_codes?.length || self.year_start == null || self.year_end == null) {
    return { prev: null, next: null, currentYearStart: null, currentYearEnd: null };
  }

  const modelCodes: string[] = self.model_codes;
  const yearStart = Number(self.year_start);
  const yearEnd   = Number(self.year_end);

  // ── Step 2: Find predecessor / successor via GROUP BY + HAVING ───────────
  // The base SELECT computes each candidate product's year span from fitment rows.
  // HAVING restricts to those whose span falls entirely before/after ours.
  const neighborBase = `
    SELECT
      cu.id, cu.slug, cu.name, cu.brand, cu.category,
      cu.computed_price, cu.image_url, cu.in_stock,
      MIN(hmy.year) AS fitment_year_start,
      MAX(hmy.year) AS fitment_year_end
    FROM catalog_fitment_v2 cfv
    JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
    JOIN harley_models      hm  ON hm.id  = hmy.model_id
    JOIN catalog_unified    cu  ON cu.id  = cfv.product_id
    WHERE hm.model_code = ANY($1::text[])
      AND cu.is_active  = true
      AND cu.category   = $2
      AND cu.id        != $3
    GROUP BY
      cu.id, cu.slug, cu.name, cu.brand, cu.category,
      cu.computed_price, cu.image_url, cu.in_stock
  `;

  const [prevRes, nextRes] = await Promise.all([
    // Predecessor: latest year range that ends before our range starts
    pool.query(
      `${neighborBase} HAVING MAX(hmy.year) < $4 ORDER BY MAX(hmy.year) DESC LIMIT 1`,
      [modelCodes, category, productId, yearStart]
    ),
    // Successor: earliest year range that starts after our range ends
    pool.query(
      `${neighborBase} HAVING MIN(hmy.year) > $4 ORDER BY MIN(hmy.year) ASC LIMIT 1`,
      [modelCodes, category, productId, yearEnd]
    ),
  ]);

  return {
    prev: prevRes.rows[0] ?? null,
    next: nextRes.rows[0] ?? null,
    currentYearStart: yearStart,
    currentYearEnd:   yearEnd,
  };
}
