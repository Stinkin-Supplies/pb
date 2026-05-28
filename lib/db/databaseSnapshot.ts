import getCatalogDb from "@/lib/db/catalog";

type SnapshotOptions = {
  includeTableStats?: boolean;
};

type RowLike = {
  table?: string | null;
  rows?: number | string | null;
  bytes?: number | string | null;
  vendor?: string | null;
  products?: number | string | null;
  year?: number | string | null;
  family?: string | null;
  model_code?: string | null;
  model?: string | null;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function mapTableStats(rows: RowLike[]) {
  return rows.map((row) => ({
    table: String(row.table ?? ""),
    rows: toNumber(row.rows),
    bytes: toNumber(row.bytes),
  }));
}

function mapVendorRows(rows: RowLike[]) {
  return rows.map((row) => ({
    vendor: row.vendor ?? null,
    rows: toNumber(row.rows),
  }));
}

function mapFitmentRows(rows: RowLike[]) {
  return rows.map((row) => ({
    ...row,
    rows: toNumber(row.rows),
    products: row.products != null ? toNumber(row.products) : undefined,
  }));
}

function mapYearRows(rows: RowLike[]) {
  return rows.map((row) => ({
    year: toNumber(row.year),
    rows: toNumber(row.rows),
  }));
}

export async function getDatabaseSnapshot(options: SnapshotOptions = {}) {
  const { includeTableStats = true } = options;
  const db = getCatalogDb();

  const queries = [
    db.query(`
      SELECT
        COUNT(*)::bigint AS total_products,
        COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_products,
        COUNT(*) FILTER (WHERE source_vendor = 'WPS')::bigint AS wps_products,
        COUNT(*) FILTER (WHERE source_vendor = 'PU')::bigint AS pu_products,
        COUNT(*) FILTER (WHERE source_vendor = 'VTWIN')::bigint AS vtwin_products,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id))::bigint AS products_with_fitment,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku))::bigint AS products_with_oem_crossref
      FROM catalog_unified cu
    `),
    db.query(`
      SELECT
        COUNT(*)::bigint AS fitment_rows,
        COUNT(DISTINCT product_id)::bigint AS products_with_fitment
      FROM catalog_fitment_v2
    `),
    db.query(`
      SELECT hf.name AS family, COUNT(*)::bigint AS rows, COUNT(DISTINCT cfv.product_id)::bigint AS products
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
      GROUP BY hf.name
      ORDER BY rows DESC, family ASC
      LIMIT 10
    `),
    db.query(`
      SELECT hm.model_code, hm.name AS model, hf.name AS family, COUNT(*)::bigint AS rows
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
      GROUP BY hm.model_code, hm.name, hf.name
      ORDER BY rows DESC, hm.model_code ASC
      LIMIT 10
    `),
    db.query(`
      SELECT hmy.year::int AS year, COUNT(*)::bigint AS rows
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      GROUP BY hmy.year
      ORDER BY hmy.year DESC
      LIMIT 20
    `),
    db.query(`
      SELECT MIN(hmy.year)::int AS min_year, MAX(hmy.year)::int AS max_year
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
    `),
    db.query(`
      SELECT source_vendor AS vendor, COUNT(*)::bigint AS rows
      FROM catalog_unified
      GROUP BY source_vendor
      ORDER BY rows DESC, vendor ASC
    `),
  ];

  const tableStatsPromise = includeTableStats
    ? db.query(`
        SELECT relname AS table, n_live_tup::bigint AS rows, pg_total_relation_size(relid)::bigint AS bytes
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY bytes DESC
        LIMIT 12
      `)
    : Promise.resolve({ rows: [] as RowLike[] });

  const [
    overviewRes,
    fitmentTotalsRes,
    familyRowsRes,
    modelRowsRes,
    yearRowsRes,
    yearsRangeRes,
    vendorRowsRes,
    tableStatsRes,
  ] = await Promise.all([...queries, tableStatsPromise]);

  const overviewRow = overviewRes.rows[0] ?? {};
  const fitmentTotalsRow = fitmentTotalsRes.rows[0] ?? {};
  const yearsRangeRow = yearsRangeRes.rows[0] ?? {};

  return {
    tableStats: mapTableStats(tableStatsRes.rows),
    overview: {
      total_products: toNumber(overviewRow.total_products),
      active_products: toNumber(overviewRow.active_products),
      wps_products: toNumber(overviewRow.wps_products),
      pu_products: toNumber(overviewRow.pu_products),
      vtwin_products: toNumber(overviewRow.vtwin_products),
      products_with_fitment: toNumber(overviewRow.products_with_fitment),
      products_with_oem_crossref: toNumber(overviewRow.products_with_oem_crossref),
    },
    fitmentTotals: {
      fitment_rows: toNumber(fitmentTotalsRow.fitment_rows),
      products_with_fitment: toNumber(fitmentTotalsRow.products_with_fitment),
    },
    familyRows: mapFitmentRows(familyRowsRes.rows),
    modelRows: mapFitmentRows(modelRowsRes.rows),
    yearRows: mapYearRows(yearRowsRes.rows),
    yearsRange: {
      min_year: yearsRangeRow.min_year ?? null,
      max_year: yearsRangeRow.max_year ?? null,
    },
    vendorRows: mapVendorRows(vendorRowsRes.rows),
  };
}

export type DatabaseSnapshot = Awaited<ReturnType<typeof getDatabaseSnapshot>>;
