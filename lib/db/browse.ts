/**
 * lib/db/browse.ts
 * Postgres-based product browse + facets.
 *
 * BrowseFilters matches the shape that app/api/browse/products/route.ts constructs.
 *
 * Session 50 changes:
 *   - CatalogProduct: oem_chain_match?: boolean
 *   - browseProducts: chain IDs ORed into fitment condition; oem_chain_match computed column
 *   - getChronologicalNeighbors: displaySubcategory third param ($3); productId→$4; yearWindow→$5
 *
 * Session 71 changes:
 *   - CatalogProduct: canonical_sku: string | null (was missing entirely — same gap /api/search had
 *     until session 69; this route/lib never joined canonical_products at all)
 *   - browseProducts: LEFT JOIN canonical_products cp ON cp.id = cu.canonical_product_id;
 *     cp.canonical_sku added to productSql SELECT. NOT added to countSql/facet queries (not needed there).
 *   - getProductBySlug: NOT yet checked for the same gap — separate query, used by PDP not brand-page grids.
 */

import { getCatalogDb } from './catalog';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CatalogProduct {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image_url: string | null;
  vendor_sku: string;
  source_vendor: 'PU' | 'WPS' | 'VTWIN';
  display_category: string;
  display_subcategory: string | null;
  category: string;
  is_universal: boolean;
  is_active: boolean;
  is_kit: boolean | null;
  pack_qty: number | null;
  variant_group_id: number | null;
  variant_count: number;
  oem_numbers: string[];
  stock_quantity: number;
  in_stock: boolean;
  /** canonical_products.canonical_sku, joined via cu.canonical_product_id.
   *  Null when the product has no canonical match yet (~2.3% of active catalog). */
  canonical_sku: string | null;
  /** True when surfaced via OEM supersession chain (not a direct fitment row).
   *  Only populated when year + model are active in the request. */
  oem_chain_match?: boolean;
}

export interface BrowseFacet {
  name: string;
  count: number;
}

/** Field names must match what app/api/browse/products/route.ts constructs. */
export interface BrowseFilters {
  eraSlug?:            string;          // maps to era_* boolean column
  families?:           string[];        // multi-family display names
  family?:             string;          // single family display name
  yearMin?:            number;          // year-range lower bound (ModelFinder slider)
  yearMax?:            number;          // year-range upper bound
  year?:               number;          // exact year (activates OEM chain pre-fetch)
  modelCode?:          string;
  modelCodes?:         string[];
  universal?:          boolean;
  dbCategories?:       string[];        // raw cu.category values
  category?:           string;          // display_category (preferred) or raw category
  subcategory?:        string;
  displayCategory?:    string;          // cu.display_category
  displaySubcategory?: string;          // cu.display_subcategory
  brand?:              string;
  inStock?:            boolean;
  search?:             string;          // full-text (ILIKE fallback; Typesense caller sets tsIds)
  tsIds?:              number[];        // Typesense-pre-filtered product IDs
  minPrice?:           number;
  maxPrice?:           number;
  page?:               number;
  perPage?:            number;
  sort?:               'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | string;
}

export interface BrowseResult {
  products: CatalogProduct[];
  total:    number;
  facets: {
    categories:    BrowseFacet[];
    subcategories: BrowseFacet[];
    brands:        BrowseFacet[];
  };
}

// ── Era column map ────────────────────────────────────────────────────────────
// Keys = URL ?era= values; values = catalog_unified column names.
// Confirmed via: SELECT column_name FROM information_schema.columns
//                WHERE table_name='catalog_unified' AND column_name LIKE 'era%';

const ERA_COL: Record<string, string> = {
  'flathead':      'era_flathead',
  'knucklehead':   'era_knucklehead',
  'panhead':       'era_panhead',
  'shovelhead':    'era_shovelhead',
  'ironhead':      'era_ironhead',
  'evolution':     'era_evolution',
  'twin-cam':      'era_twin_cam',
  'milwaukee8':    'era_milwaukee8',
  'milwaukee-8':   'era_milwaukee8',
  'chopper':       'era_chopper',
  'evo-sportster': 'era_evo_sportster',
  'sportster':     'era_evo_sportster',
};

// ── OEM chain pre-fetch ───────────────────────────────────────────────────────

async function fetchChainProductIds(
  db: ReturnType<typeof getCatalogDb>,
  year: number,
  modelCodes: string[],
): Promise<number[]> {
  try {
    const { rows } = await db.query<{ id: number }>(`
      WITH target_year_ids AS (
        SELECT DISTINCT my.id
        FROM harley_model_years my
        JOIN harley_models hm ON hm.id = my.model_id
        WHERE my.year = $1
          AND hm.model_code = ANY($2::text[])
      )
      SELECT DISTINCT coc.product_id AS id
      FROM mv_oem_fitment_coverage mv
      JOIN target_year_ids ty ON ty.id = mv.model_year_id
      JOIN catalog_oem_crossref coc
        ON normalize_oem(coc.oem_number) = normalize_oem(mv.oem_number)
       AND coc.oem_format IN ('hd_oem', 'hd_oem_nodash')
       AND coc.expanded_from = FALSE
      JOIN catalog_unified cu ON cu.id = coc.product_id
      WHERE cu.is_active = true
    `, [year, modelCodes]);
    return rows.map(r => r.id);
  } catch {
    return [];
  }
}

// ── DISTINCT ON dedup key ─────────────────────────────────────────────────────
// Single-quoted SQL regex string (no dollar-quoting) — avoids parse confusion
// in Postgres extended query protocol.

const DEDUP_KEY = `
  COALESCE(
    cu.variant_group_id::text,
    cu.brand || '||' || REGEXP_REPLACE(
      LOWER(cu.name),
      '\\s*[-\u2013]\\s*(black|chrome|silver|gold|red|blue|green|brown|pink|white|natural|polished|wrinkle|gloss|matte|satin)\\s*$',
      '', 'gi'
    ),
    'u' || cu.id::text
  )
`.trim();

// ── Main browse function ──────────────────────────────────────────────────────

export async function browseProducts(filters: BrowseFilters): Promise<BrowseResult> {
  const db       = getCatalogDb();
  const page     = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(96, Math.max(12, filters.perPage ?? 48));
  const offset   = (page - 1) * pageSize;

  // ── Effective model codes ─────────────────────────────────────────────────
  const effectiveModelCodes: string[] = [
    ...(filters.modelCodes ?? []),
    ...(filters.modelCode  ? [filters.modelCode] : []),
  ];

  // ── OEM chain pre-fetch (when exact year + model codes are set) ───────────
  let chainProductIds: number[] = [];
  if (filters.year && effectiveModelCodes.length) {
    chainProductIds = await fetchChainProductIds(db, filters.year, effectiveModelCodes);
  }
  const chainLiteral = `ARRAY[${(chainProductIds.length ? chainProductIds : [-1]).join(',')}]::int[]`;

  // ── Resolve model_year_ids (exact year + model/family) ───────────────────
  let modelYearIds: number[] = [];
  if (filters.year && effectiveModelCodes.length) {
    const { rows } = await db.query<{ id: number }>(`
      SELECT DISTINCT my.id
      FROM harley_model_years my
      JOIN harley_models hm ON hm.id = my.model_id
      WHERE my.year = $1 AND hm.model_code = ANY($2::text[])
    `, [filters.year, effectiveModelCodes]);
    modelYearIds = rows.map(r => r.id);
  } else if (filters.year && filters.family) {
    const { rows } = await db.query<{ id: number }>(`
      SELECT DISTINCT my.id
      FROM harley_model_years my
      JOIN harley_models hm   ON hm.id = my.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
      WHERE my.year = $1 AND hf.name = $2
    `, [filters.year, filters.family]);
    modelYearIds = rows.map(r => r.id);
  }

  // ── Build filter conditions ───────────────────────────────────────────────
  // Each condition is tagged so facet queries can drop exactly the right ones
  // and renumber their own $N placeholders — params are NEVER shared across
  // differently-shaped queries (sharing one array across queries with
  // different WHERE clauses is what caused "could not determine data type of
  // parameter $N" — a dropped condition's $N stops appearing in that query's
  // text while the array still had a value sitting at that position).

  type Cond = { tag: string; sql: string; values: unknown[] };
  const conds: Cond[] = [{ tag: 'base', sql: 'cu.is_active = true', values: [] }];

  // Typesense pre-filtered IDs (text search handled upstream)
  if (filters.tsIds?.length) {
    conds.push({ tag: 'other', sql: 'cu.id = ANY(??::int[])', values: [filters.tsIds] });
  }

  // Full-text fallback (ILIKE) when no tsIds but search string present.
  // For 1-2 word queries: require ALL words to match (precise).
  // For 3+ word queries: require at least 2 words to match — prevents
  // model names like "street glide" from killing results when they don't
  // appear in product names. "brake rotor street glide" → "brake" + "rotor"
  // both match → results surface correctly.
  if (filters.search && !filters.tsIds?.length) {
    const words = filters.search.trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (words.length) {
      const groups: string[] = [];
      const values: unknown[] = [];
      for (const w of words) {
        const pat = `%${w}%`;
        groups.push('(cu.name ILIKE ?? OR cu.brand ILIKE ?? OR cu.vendor_sku ILIKE ?? OR cu.internal_sku ILIKE ?? OR EXISTS (SELECT 1 FROM unnest(cu.oem_numbers) AS oem WHERE oem ILIKE ??))');
        values.push(pat, pat, pat, pat, pat);
      }
      if (words.length <= 2) {
        // Short queries: AND all words — stay precise
        conds.push({ tag: 'other', sql: `(${groups.join(' AND ')})`, values });
      } else {
        // Longer queries: score each word 0/1, require at least 2 to match
        const cases = groups.map(g => `(CASE WHEN ${g} THEN 1 ELSE 0 END)`);
        conds.push({ tag: 'other', sql: `(${cases.join(' + ')}) >= 2`, values });
      }
    }
  }

  // Era filter
  if (filters.eraSlug) {
    const col = ERA_COL[filters.eraSlug];
    if (col) conds.push({ tag: 'other', sql: `cu.${col} = true`, values: [] });
  }

  // Category — prefer displayCategory over raw category; dbCategories also
  // tagged 'category' so the category facet excludes both forms together.
  if (filters.displayCategory) {
    conds.push({ tag: 'category', sql: 'cu.display_category = ??', values: [filters.displayCategory] });
  } else if (filters.category) {
    conds.push({ tag: 'category', sql: 'cu.display_category = ??', values: [filters.category] });
  }
  if (filters.dbCategories?.length) {
    conds.push({ tag: 'category', sql: 'cu.category = ANY(??::text[])', values: [filters.dbCategories] });
  }

  // Subcategory — prefer displaySubcategory
  if (filters.displaySubcategory) {
    conds.push({ tag: 'subcategory', sql: 'cu.display_subcategory = ??', values: [filters.displaySubcategory] });
  } else if (filters.subcategory) {
    conds.push({ tag: 'subcategory', sql: 'cu.display_subcategory = ??', values: [filters.subcategory] });
  }

  // Brand
  if (filters.brand) {
    conds.push({ tag: 'brand', sql: 'cu.brand = ??', values: [filters.brand] });
  }

  // Price range
  if (filters.minPrice != null) conds.push({ tag: 'other', sql: 'cu.computed_price >= ??', values: [filters.minPrice] });
  if (filters.maxPrice != null) conds.push({ tag: 'other', sql: 'cu.computed_price <= ??', values: [filters.maxPrice] });

  // In stock (only add if column exists — guarded)
  // if (filters.inStock) conds.push({ tag: 'other', sql: 'cu.stock_qty > 0', values: [] });

  // ── Fitment join ──────────────────────────────────────────────────────────
  // Always included identically in every query variant (never filtered out),
  // so its param is always $1 — leadingParams below keeps that position
  // stable across product/count/facet queries regardless of which
  // conditions get dropped.
  let fitmentJoin = `LEFT JOIN catalog_fitment_v2 fv ON FALSE`;
  let joinParams: unknown[] = [];

  if (modelYearIds.length) {
    joinParams = [modelYearIds];
    fitmentJoin = `
      LEFT JOIN catalog_fitment_v2 fv
        ON fv.product_id    = cu.id
       AND fv.model_year_id = ANY($1::int[])`;
  }

  // ── Fitment / universal / year-range / family conditions ─────────────────
  const familyList = [
    ...(filters.families ?? []),
    ...(filters.family ? [filters.family] : []),
  ];

  if (filters.universal) {
    conds.push({ tag: 'other', sql: 'cu.is_universal = true', values: [] });

  } else if (modelYearIds.length) {
    // Exact year + model: direct fitment OR universal OR OEM chain.
    // chainLiteral is inlined (always integers, never user-controlled), no param needed.
    conds.push({
      tag: 'other',
      sql: `(
        fv.product_id IS NOT NULL
        OR cu.is_universal = true
        OR cu.id = ANY(${chainLiteral})
      )`,
      values: [],
    });

  } else if (filters.yearMin != null || filters.yearMax != null) {
    // Year-range from ModelFinder slider (no specific model code)
    const yMin = filters.yearMin ?? 1903;
    const yMax = filters.yearMax ?? 2030;
    if (familyList.length === 1) {
      conds.push({
        tag: 'other',
        sql: `(
          cu.is_universal = true
          OR EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf2
            JOIN harley_model_years hmy2 ON hmy2.id = cf2.model_year_id
            JOIN harley_models hm2       ON hm2.id  = hmy2.model_id
            JOIN harley_families hf      ON hf.id   = hm2.family_id
            WHERE cf2.product_id = cu.id
              AND hmy2.year BETWEEN ?? AND ??
              AND hf.name = ??
          )
        )`,
        values: [yMin, yMax, familyList[0]],
      });
    } else if (familyList.length > 1) {
      conds.push({
        tag: 'other',
        sql: `(
          cu.is_universal = true
          OR EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf2
            JOIN harley_model_years hmy2 ON hmy2.id = cf2.model_year_id
            JOIN harley_models hm2       ON hm2.id  = hmy2.model_id
            JOIN harley_families hf      ON hf.id   = hm2.family_id
            WHERE cf2.product_id = cu.id
              AND hmy2.year BETWEEN ?? AND ??
              AND hf.name = ANY(??::text[])
          )
        )`,
        values: [yMin, yMax, familyList],
      });
    } else {
      conds.push({
        tag: 'other',
        sql: `(
          cu.is_universal = true
          OR EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf2
            JOIN harley_model_years hmy2 ON hmy2.id = cf2.model_year_id
            WHERE cf2.product_id = cu.id
              AND hmy2.year BETWEEN ?? AND ??
          )
        )`,
        values: [yMin, yMax],
      });
    }

  } else if (familyList.length) {
    // Family filter without year — any fitment in that family.
    if (familyList.length === 1) {
      conds.push({
        tag: 'other',
        sql: `(
          cu.is_universal = true
          OR EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf2
            JOIN harley_model_years hmy2 ON hmy2.id = cf2.model_year_id
            JOIN harley_models hm2       ON hm2.id  = hmy2.model_id
            JOIN harley_families hf      ON hf.id   = hm2.family_id
            WHERE cf2.product_id = cu.id
              AND hf.name = ??
          )
        )`,
        values: [familyList[0]],
      });
    } else {
      conds.push({
        tag: 'other',
        sql: `(
          cu.is_universal = true
          OR EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf2
            JOIN harley_model_years hmy2 ON hmy2.id = cf2.model_year_id
            JOIN harley_models hm2       ON hm2.id  = hmy2.model_id
            JOIN harley_families hf      ON hf.id   = hm2.family_id
            WHERE cf2.product_id = cu.id
              AND hf.name = ANY(??::text[])
          )
        )`,
        values: [familyList],
      });
    }
  }

  // ── Render a specific set of conditions into SQL + a correctly-numbered
  // params array, starting after leadingParams (the fitmentJoin param) ──────
  function renderWhere(selected: Cond[]): { sql: string; params: unknown[] } {
    const params: unknown[] = [...joinParams];
    const parts = selected.map(c => {
      let sql = c.sql;
      for (const v of c.values) {
        params.push(v);
        sql = sql.replace('??', `$${params.length}`);
      }
      return sql;
    });
    return { sql: parts.length ? parts.join('\n      AND ') : 'TRUE', params };
  }

  const { sql: whereAll,  params: paramsAll }  = renderWhere(conds);
  const { sql: whereNoCategory, params: paramsNoCategory } = renderWhere(conds.filter(c => c.tag !== 'category'));
  const { sql: whereNoSubcat,   params: paramsNoSubcat }   = renderWhere(conds.filter(c => c.tag !== 'subcategory'));
  const { sql: whereNoBrand,    params: paramsNoBrand }    = renderWhere(conds.filter(c => c.tag !== 'brand'));

  // ── Sort ──────────────────────────────────────────────────────────────────
  const SORT_MAP: Record<string, string> = {
    price_asc:  'd.price ASC',
    price_desc: 'd.price DESC',
    name_asc:   'd.name ASC',
    newest:     'd.id DESC',
    relevance:  'd.price ASC',
  };
  const outerSort = SORT_MAP[filters.sort ?? ''] ?? 'd.price ASC';

  // ── Product query ─────────────────────────────────────────────────────────
  const productSql = `
    SELECT d.*
    FROM (
      SELECT DISTINCT ON (${DEDUP_KEY})
        cu.id,
        cu.sku,
        cu.slug,
        cu.name,
        cu.brand,
        cu.computed_price                          AS price,
        COALESCE(cu.image_url, cm.url)             AS image_url,
        cu.vendor_sku,
        cu.source_vendor,
        cu.display_category,
        cu.display_subcategory,
        cu.category,
        cu.is_universal,
        cu.is_active,
        cu.is_kit,
        cu.pack_qty,
        cu.variant_group_id,
        cu.oem_numbers,
        cp.canonical_sku                           AS canonical_sku,
        COALESCE((
          SELECT SUM(vo.total_qty)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cu.id
            AND vo.is_active = true
        ), cu.stock_quantity, 0) AS stock_quantity,
        COALESCE((
          SELECT BOOL_OR(vo.is_active)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cu.id
        ), cu.in_stock, false) AS in_stock,
        COALESCE(vcnt.cnt, 0)::int                AS variant_count,
        (cu.id = ANY(${chainLiteral}))            AS oem_chain_match,
        (fv.product_id IS NOT NULL)               AS has_fitment
      FROM catalog_unified cu
      LEFT JOIN canonical_products cp ON cp.id = cu.canonical_product_id
      ${fitmentJoin}
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM catalog_variant_members
        WHERE group_id = cu.variant_group_id
      ) vcnt ON true
      LEFT JOIN LATERAL (
        SELECT url FROM catalog_media
        WHERE product_id = cu.id AND media_type = 'image'
        ORDER BY priority ASC
        LIMIT 1
      ) cm ON cu.image_url IS NULL OR cu.image_url = ''
      WHERE ${whereAll}
      ORDER BY
        ${DEDUP_KEY},
        (fv.product_id IS NOT NULL) DESC,
        cu.computed_price ASC
    ) d
    ORDER BY ${outerSort}
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  const countSql = `
    SELECT COUNT(DISTINCT ${DEDUP_KEY}) AS total
    FROM catalog_unified cu
    ${fitmentJoin}
    WHERE ${whereAll}
  `;

  const categoryFacetSql = `
    SELECT cu.display_category AS name, COUNT(DISTINCT ${DEDUP_KEY}) AS count
    FROM catalog_unified cu
    ${fitmentJoin}
    WHERE ${whereNoCategory}
      AND cu.display_category IS NOT NULL
    GROUP BY cu.display_category
    ORDER BY count DESC
  `;

  const subcategoryFacetSql = `
    SELECT cu.display_subcategory AS name, COUNT(DISTINCT ${DEDUP_KEY}) AS count
    FROM catalog_unified cu
    ${fitmentJoin}
    WHERE ${whereNoSubcat}
      AND cu.display_subcategory IS NOT NULL
    GROUP BY cu.display_subcategory
    ORDER BY count DESC
    LIMIT 50
  `;

  const brandFacetSql = `
    SELECT cu.brand AS name, COUNT(DISTINCT ${DEDUP_KEY}) AS count
    FROM catalog_unified cu
    ${fitmentJoin}
    WHERE ${whereNoBrand}
      AND cu.brand IS NOT NULL
    GROUP BY cu.brand
    ORDER BY count DESC
    LIMIT 80
  `;

  const [productsRes, countRes, catRes, subcatRes, brandRes] = await Promise.all([
    db.query<CatalogProduct & { has_fitment: boolean }>(productSql, paramsAll),
    db.query<{ total: string }>(countSql, paramsAll),
    db.query<BrowseFacet>(categoryFacetSql, paramsNoCategory),
    db.query<BrowseFacet>(subcategoryFacetSql, paramsNoSubcat),
    db.query<BrowseFacet>(brandFacetSql, paramsNoBrand),
  ]);

  return {
    products: productsRes.rows,
    total:    parseInt(countRes.rows[0]?.total ?? '0', 10),
    facets: {
      categories:    catRes.rows,
      subcategories: subcatRes.rows,
      brands:        brandRes.rows,
    },
  };
}

// ── Chronological neighbors (PDP timeline) ────────────────────────────────────
// Param positions (session 50):
//   $1 = productId        (my_years CTE)
//   $2 = category         (fallback when displaySubcategory is null)
//   $3 = displaySubcategory
//   $4 = productId        (WHERE cu.id <> $4)
//   $5 = yearWindow

export async function getChronologicalNeighbors(
  productId: number,
  category: string,
  displaySubcategory?: string | null,
  yearWindow = 20,
): Promise<CatalogProduct[]> {
  const db = getCatalogDb();
  const { rows } = await db.query<CatalogProduct>(`
    WITH my_years AS (
      SELECT
        COALESCE(MIN(hmy.year), 1903) AS min_y,
        COALESCE(MAX(hmy.year), 2030) AS max_y
      FROM catalog_fitment_v2 cf
      JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
      WHERE cf.product_id = $1
    )
    SELECT DISTINCT ON (cu.id)
      cu.id, cu.sku, cu.slug, cu.name, cu.brand,
      cu.computed_price AS price,
      COALESCE(cu.image_url, cm.url) AS image_url,
      cu.vendor_sku, cu.source_vendor,
      cu.display_category, cu.display_subcategory, cu.category,
      cu.is_universal, cu.is_active, cu.is_kit, cu.pack_qty,
      cu.variant_group_id, cu.oem_numbers,
      0::int AS variant_count
    FROM catalog_unified cu
    LEFT JOIN LATERAL (
      SELECT url FROM catalog_media
      WHERE product_id = cu.id AND media_type = 'image'
      ORDER BY priority ASC
      LIMIT 1
    ) cm ON cu.image_url IS NULL OR cu.image_url = ''
    WHERE cu.is_active = true
      AND (
        ($3::text IS NOT NULL AND cu.display_subcategory = $3)
        OR ($3::text IS NULL  AND cu.category = $2)
      )
      AND cu.id <> $4
      AND (
        cu.is_universal = true
        OR NOT EXISTS (
          SELECT 1 FROM catalog_fitment_v2 WHERE product_id = cu.id
        )
        OR EXISTS (
          SELECT 1
          FROM catalog_fitment_v2 cf2
          JOIN harley_model_years hmy2 ON hmy2.id = cf2.model_year_id
          WHERE cf2.product_id = cu.id
            AND hmy2.year BETWEEN (SELECT min_y - $5 FROM my_years)
                              AND (SELECT max_y + $5 FROM my_years)
        )
      )
    ORDER BY cu.id, cu.computed_price ASC
    LIMIT 12
  `, [productId, category, displaySubcategory ?? null, productId, yearWindow]);

  return rows;
}

// ── Single product by slug ────────────────────────────────────────────────────

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const db = getCatalogDb();
  const { rows } = await db.query<CatalogProduct>(`
    SELECT
      cu.id, cu.sku, cu.slug, cu.name, cu.brand,
      cu.computed_price AS price,
      COALESCE(cu.image_url, cm.url) AS image_url,
      cu.vendor_sku, cu.source_vendor,
      cu.display_category, cu.display_subcategory, cu.category,
      cu.is_universal, cu.is_active, cu.is_kit, cu.pack_qty,
      cu.variant_group_id, cu.oem_numbers,
      COALESCE(vcnt.cnt, 0)::int AS variant_count
    FROM catalog_unified cu
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM catalog_variant_members
      WHERE group_id = cu.variant_group_id
    ) vcnt ON true
    LEFT JOIN LATERAL (
      SELECT url FROM catalog_media
      WHERE product_id = cu.id AND media_type = 'image'
      ORDER BY priority ASC
      LIMIT 1
    ) cm ON cu.image_url IS NULL OR cu.image_url = ''
    WHERE cu.slug = $1 AND cu.is_active = true
    LIMIT 1
  `, [slug]);
  return rows[0] ?? null;
}

// ── Fitment helpers (used by app/api/browse/fitment/route.ts) ─────────────────

export interface HarleyFamily {
  id:   number;
  name: string;
  slug: string;
}

export interface HarleyModel {
  id:         number;
  name:       string;
  model_code: string;
  family_id:  number;
}

export interface HarleyYear {
  year: number;
}

export interface FamilyProductCount {
  family_name:   string;
  family_slug:   string;
  product_count: number;
  year_min:      number | null;
  year_max:      number | null;
}

export async function getFamilies(): Promise<HarleyFamily[]> {
  const db = getCatalogDb();
  const { rows } = await db.query<HarleyFamily>(`
    SELECT id, name, slug
    FROM harley_families
    ORDER BY name
  `);
  return rows;
}

export async function getModels(familyId: number): Promise<HarleyModel[]> {
  const db = getCatalogDb();
  const { rows } = await db.query<HarleyModel>(`
    SELECT id, model_code, name, family_id
    FROM harley_models
    WHERE family_id = $1
    ORDER BY name ASC
  `, [familyId]);
  return rows;
}

export async function getYears(modelId: number): Promise<HarleyYear[]> {
  const db = getCatalogDb();
  const { rows } = await db.query<HarleyYear>(`
    SELECT DISTINCT year
    FROM harley_model_years
    WHERE model_id = $1
    ORDER BY year DESC
  `, [modelId]);
  return rows;
}

/** Product counts per family — uses mv_family_product_ranges when available. */
export async function getFamilyProductCounts(): Promise<FamilyProductCount[]> {
  const db = getCatalogDb();
  try {
    // Fast path: use pre-aggregated matview
    const { rows } = await db.query<FamilyProductCount>(`
      SELECT
        hf.name                         AS family_name,
        hf.slug                         AS family_slug,
        COUNT(DISTINCT mv.product_id)   AS product_count,
        MIN(mv.year_min)                AS year_min,
        MAX(mv.year_max)                AS year_max
      FROM mv_family_product_ranges mv
      JOIN harley_families hf ON hf.id = mv.family_id
      GROUP BY hf.id, hf.name, hf.slug
      ORDER BY product_count DESC
    `);
    return rows;
  } catch {
    // Fallback: direct count (slower)
    const { rows } = await db.query<FamilyProductCount>(`
      SELECT
        hf.name                           AS family_name,
        hf.slug                           AS family_slug,
        COUNT(DISTINCT cf.product_id)     AS product_count,
        MIN(hmy.year)                     AS year_min,
        MAX(hmy.year)                     AS year_max
      FROM harley_families hf
      JOIN harley_models hm       ON hm.family_id  = hf.id
      JOIN harley_model_years hmy ON hmy.model_id  = hm.id
      JOIN catalog_fitment_v2 cf  ON cf.model_year_id = hmy.id
      JOIN catalog_unified cu     ON cu.id = cf.product_id AND cu.is_active = true
      GROUP BY hf.id, hf.name, hf.slug
      ORDER BY product_count DESC
    `);
    return rows;
  }
}
