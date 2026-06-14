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
    // Always fetch from Typesense page 1. Postgres handles browse pagination via
    // OFFSET — but for that to work, Typesense must return enough results to cover
    // the current browse page. e.g. browse page 3 (perPage=24) needs at least 72 IDs.
    //
    // Old behaviour was `page: page` which caused Typesense to skip to its OWN
    // page N, meaning browse page 2 received Typesense global ranks 73–144
    // instead of 25–48, and browse page 3+ would often return zero rows.
    //
    // Cap at 250 (Typesense per_page hard limit). Deep pages beyond ~10 will hit
    // this ceiling but that's an acceptable trade-off vs fetching everything.
    const neededIds = page * perPage + perPage * 2;

    const results = await typesenseClient
      .collections(COLLECTION)
      .documents()
      .search({
        ...DEFAULT_SEARCH_PARAMS,
        q,
        // Explicit sort_by so DEFAULT_SEARCH_PARAMS can't accidentally override
        // text-match relevance with a fixed field (price, id, etc.) that would
        // return the same product first regardless of what was searched.
        sort_by: "_text_match:desc,in_stock:desc,computed_price:asc",
        page: 1,                                     // ← always 1; Postgres owns pagination
        per_page: Math.min(neededIds, 250),          // ← enough to reach current browse page
        ...(extraFilters ? { filter_by: extraFilters } : {}),
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

  // Normalise model codes into a single array early — used by chain pre-fetch
  // AND by the fitment conditions below (replaces the separate modelCode /
  // modelCodes branches later in this function).
  const effectiveModelCodes: string[] = modelCodes?.length
    ? modelCodes
    : modelCode
    ? [modelCode]
    : [];

  // ── OEM chain pre-fetch ────────────────────────────────────────────────────
  // When an exact year + model is specified (ModelFinder path), surface products
  // reachable via the OEM supersession chain: their OEM number covers this
  // model-year through a predecessor/successor relationship even though they lack
  // a direct catalog_fitment_v2 row for it.
  //
  // mv_oem_fitment_coverage.has_direct_match = FALSE → coverage comes entirely
  // from chain members, not from a direct crossref entry for this model-year.
  //
  // Non-fatal: if the matview is missing or the query fails, chainProductIds
  // stays empty and the rest of browseProducts runs identically to before.
  let chainProductIds: number[] = [];

  if (year && effectiveModelCodes.length > 0) {
    try {
      const { rows: chainRows } = await pool.query<{ product_id: number }>(`
        WITH target_my AS (
          SELECT my.id AS model_year_id
          FROM harley_model_years my
          JOIN harley_models hm ON hm.id = my.model_id
          WHERE my.year = $1
            AND hm.model_code = ANY($2::text[])
        ),
        chain_oems AS (
          SELECT DISTINCT fc.oem_number
          FROM mv_oem_fitment_coverage fc
          JOIN target_my tm ON tm.model_year_id = fc.model_year_id
          WHERE fc.has_direct_match = FALSE
        )
        SELECT DISTINCT x.product_id
        FROM catalog_oem_crossref x
        JOIN chain_oems co ON x.oem_number = co.oem_number
        WHERE x.oem_format IN ('hd_oem', 'hd_oem_nodash')
          AND x.expanded_from = FALSE
      `, [year, effectiveModelCodes]);
      chainProductIds = chainRows.map(r => r.product_id);
      if (chainProductIds.length > 0) {
        console.log(`[browse] OEM chain: ${chainProductIds.length} chain products for ${year} ${effectiveModelCodes.join(',')}`);
      }
    } catch (err) {
      console.error('[browse] OEM chain pre-fetch failed (non-fatal):', err);
    }
  }

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
  } else if (effectiveFamilies.length > 0 || effectiveModelCodes.length > 0 || year || yearMin || yearMax) {
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

    // Model code filter — chain-aware.
    // When chain products exist, OR them in so they bypass the model_code JOIN
    // (chain products may not have a cfv_yr row for the target model, so hm is NULL).
    if (effectiveModelCodes.length > 0) {
      if (chainProductIds.length > 0) {
        conditions.push(`(hm.model_code = ANY($${p++}::text[]) OR cu.id = ANY($${p++}::int[]))`);
        params.push(effectiveModelCodes, chainProductIds);
      } else {
        conditions.push(`hm.model_code = ANY($${p++}::text[])`);
        params.push(effectiveModelCodes);
      }
    }

    // Exact year (user dropdown — not era range) — chain-aware.
    // Chain products are OR'd in so they bypass the year constraint: their fitment
    // rows cover ADJACENT years, not the target year, but they're valid via OEM chain.
    if (year) {
      if (chainProductIds.length > 0) {
        conditions.push(`(cfv_yr.year = $${p++} OR cu.id = ANY($${p++}::int[]))`);
        params.push(year, chainProductIds);
      } else {
        conditions.push(`cfv_yr.year = $${p++}`);
        params.push(year);
      }
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

  // ── Non-category filters — must come BEFORE display_category/subcategory ────
  // brand, inStock, search, and price are added here so that catFacetConditions
  // (snapshotted below) captures them. If they were added after the snapshot,
  // the category facet query would not respect active brand/price/etc. filters.

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

  // ── catFacetConditions snapshot ────────────────────────────────────────────
  // Captured BEFORE display_category and display_subcategory.
  // Used by the category facet query so it returns all available categories
  // (not just the one currently selected) — i.e. disjunctive faceting.
  const catFacetConditions = [...conditions];
  const catFacetParams    = [...params];

  // ── Category filtering ─────────────────────────────────────────────────────
  // Prefer display_category (clean unified taxonomy) over raw category.
  // Legacy dbCategories param still supported for backwards compat.
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

  // ── subcatFacetConditions snapshot ────────────────────────────────────────
  // Captured AFTER display_category but BEFORE display_subcategory.
  // Used by the subcategory facet query so it returns all subcategories within
  // the selected category (not just the one currently selected).
  const subcatFacetConditions = [...conditions];
  const subcatFacetParams     = [...params];

  if (displaySubcategory) {
    conditions.push(`cu.display_subcategory = $${p++}`);
    params.push(displaySubcategory);
  } else if (subcategory) {
    conditions.push(`cu.display_subcategory = $${p++}`);
    params.push(subcategory);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // catFacetConditions always has at least cu.is_active = true, so these are never empty.
  const catFacetWhere    = `WHERE ${catFacetConditions.join(" AND ")}`;
  const subcatFacetWhere = `WHERE ${subcatFacetConditions.join(" AND ")}`;

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
  //
  // Grouping key priority:
  //   1. variant_group_id   — explicit group from catalog_variant_groups (best)
  //   2. name_group_key     — derived from (brand, base_name) for products whose
  //                           names differ only by a color/finish/size suffix.
  //                           e.g. "100' SPOOL 20-GAUGE WIRE (BLACK)" and
  //                                "100' SPOOL 20-GAUGE WIRE (BLUE)" → same key.
  //   3. 'u' || id          — unique per product (no grouping)
  const dataQuery = `
    SELECT d.*, COALESCE(vc.variant_count, 1) AS variant_count
    FROM (
      SELECT DISTINCT ON (group_key)
        cu.id, cu.sku, cu.slug, cu.name, cu.brand,
        cu.category, cu.subcategory,
        cu.display_category, cu.display_subcategory,
        cu.source_vendor,
        cu.computed_price, cu.msrp, cu.map_price,
        cu.image_url, cu.image_urls, cu.in_stock, cu.stock_quantity,
        cu.is_harley_fitment, cu.features, cu.oem_numbers,
        cu.variant_group_id,
        cu.fitment_year_start, cu.fitment_year_end,
        CASE
          WHEN cu.variant_group_id IS NOT NULL
            THEN cu.variant_group_id::text
          ELSE
            cu.brand || '||' || TRIM(regexp_replace(regexp_replace(regexp_replace(
              cu.name,
              '\s*\([A-Z][A-Z0-9 /\-]+\)\s*$', '', 'i'),
              '\s*-\s*[A-Z][A-Z0-9 /]+$', '', 'i'),
              '\s+(BLACK|CHROME|SILVER|GOLD|RED|BLUE|GREEN|BROWN|PINK|WHITE|NATURAL|POLISHED|WRINKLE|GLOSS|MATTE|SATIN)\s*$',
              '', 'i'))
        END AS group_key
      FROM catalog_unified cu
      ${fitmentJoin}
      ${where}
      ORDER BY group_key,
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

  // GROUP_KEY_SQL must be byte-for-byte identical to the group_key CASE expression
  // inside dataQuery's DISTINCT ON — otherwise COUNT(DISTINCT group_key) diverges
  // from the number of rows actually returned, producing phantom extra pages.
  const GROUP_KEY_SQL = `
    CASE
      WHEN cu.variant_group_id IS NOT NULL
        THEN cu.variant_group_id::text
      ELSE
        cu.brand || '||' || TRIM(regexp_replace(regexp_replace(regexp_replace(
          cu.name,
          '\\s*\\([A-Z][A-Z0-9 /\\-]+\\)\\s*$', '', 'i'),
          '\\s*-\\s*[A-Z][A-Z0-9 /]+$', '', 'i'),
          '\\s+(BLACK|CHROME|SILVER|GOLD|RED|BLUE|GREEN|BROWN|PINK|WHITE|NATURAL|POLISHED|WRINKLE|GLOSS|MATTE|SATIN)\\s*$',
          '', 'i'))
    END`;

  const [dataRes, countRes, catRes, brandRes, priceRes, subCatRes] = await Promise.all([
    pool.query(dataQuery, params),
    // Count uses the same group_key expression as DISTINCT ON in dataQuery.
    pool.query(
      `SELECT COUNT(DISTINCT ${GROUP_KEY_SQL}) AS total
       FROM catalog_unified cu ${fitmentJoin} ${where}`,
      facetParams
    ),
    // catFacetWhere omits display_category + display_subcategory →
    // returns all 20 categories with counts for current family/brand/etc. filters.
    pool.query(
      `SELECT cu.display_category AS name, COUNT(DISTINCT cu.id) AS count
       FROM catalog_unified cu ${fitmentJoin} ${catFacetWhere}
       AND cu.display_category IS NOT NULL
       GROUP BY cu.display_category ORDER BY count DESC LIMIT 30`,
      catFacetParams
    ),
    pool.query(
      `SELECT cu.brand AS name, COUNT(DISTINCT cu.id) AS count ${facetBase} GROUP BY cu.brand ORDER BY count DESC LIMIT 30`,
      facetParams
    ),
    pool.query(
      `SELECT MIN(cu.computed_price) AS min, MAX(cu.computed_price) AS max ${facetBase}`,
      facetParams
    ),
    // subcatFacetWhere includes display_category but omits display_subcategory →
    // returns all subcategories within the selected category.
    pool.query(
      `SELECT cu.display_subcategory AS name, COUNT(DISTINCT cu.id) AS count
       FROM catalog_unified cu ${fitmentJoin} ${subcatFacetWhere}
       AND cu.display_subcategory IS NOT NULL
       GROUP BY cu.display_subcategory ORDER BY count DESC LIMIT 30`,
      subcatFacetParams
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
