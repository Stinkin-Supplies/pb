-- crossref-coverage-report.sql
--
-- Compares catalog_oem_crossref against both WPS and PU product tables.
-- Shows how many crossref SKUs have a matching product record on each side.
--
-- Run:
--   psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
--     -f scripts/ingest/sql/crossref-coverage-report.sql

\echo ''
\echo '══ OEM CROSSREF COVERAGE REPORT ══════════════════════════════'
\echo ''

-- ── 1. Total crossref rows ────────────────────────────────────────────────────
SELECT
  COUNT(*)                                         AS total_crossref_rows,
  COUNT(DISTINCT sku)                              AS distinct_wps_skus,
  COUNT(DISTINCT oem_number)                       AS distinct_oem_numbers,
  COUNT(DISTINCT oem_manufacturer)                 AS distinct_brands
FROM catalog_oem_crossref;

\echo ''
\echo '── WPS match rate (crossref.sku → catalog_products.sku) ──────'

-- ── 2. WPS crossref → catalog_products match ─────────────────────────────────
SELECT
  COUNT(DISTINCT x.sku)                            AS crossref_wps_skus,
  COUNT(DISTINCT cp.sku)                           AS matched_in_catalog_products,
  COUNT(DISTINCT x.sku) - COUNT(DISTINCT cp.sku)   AS unmatched,
  ROUND(
    COUNT(DISTINCT cp.sku)::numeric /
    NULLIF(COUNT(DISTINCT x.sku), 0) * 100, 1
  )                                                AS match_pct
FROM catalog_oem_crossref x
LEFT JOIN catalog_products cp ON cp.sku = x.sku;

\echo ''
\echo '── WPS match rate (crossref.sku → catalog_unified WPS rows) ──'

-- ── 3. WPS crossref → catalog_unified (WPS source) ───────────────────────────
SELECT
  COUNT(DISTINCT x.sku)                            AS crossref_wps_skus,
  COUNT(DISTINCT cu.sku)                           AS matched_in_catalog_unified,
  COUNT(DISTINCT x.sku) - COUNT(DISTINCT cu.sku)   AS unmatched
FROM catalog_oem_crossref x
LEFT JOIN catalog_unified cu ON cu.sku = x.sku AND cu.source_vendor = 'WPS';

\echo ''
\echo '── PU match rate (crossref.sku → pu_products.sku) ───────────'

-- ── 4. PU crossref match (for when PU crossref data is loaded)
--    catalog_oem_crossref currently holds WPS SKUs; this query is ready
--    for when you add PU SKUs with source_file like '%PU%'
SELECT
  COUNT(DISTINCT x.sku)                            AS crossref_pu_skus,
  COUNT(DISTINCT pp.sku)                           AS matched_in_pu_products,
  COUNT(DISTINCT x.sku) - COUNT(DISTINCT pp.sku)   AS unmatched
FROM catalog_oem_crossref x
JOIN pu_products pp ON pp.sku = x.sku
WHERE x.source_file ILIKE '%PU%' OR x.source_file ILIKE '%parts%unlimited%';

\echo ''
\echo '── OEM numbers present in crossref but missing fitment ───────'

-- ── 5. OEM numbers with crossref data but no fitment in catalog_fitment ───────
SELECT
  COUNT(DISTINCT x.oem_number)                     AS oem_nums_in_crossref,
  COUNT(DISTINCT cf.product_id)                    AS products_with_fitment,
  COUNT(DISTINCT x.oem_number) -
    COUNT(DISTINCT cf.product_id)                  AS oem_nums_without_fitment
FROM catalog_oem_crossref x
LEFT JOIN catalog_products cp ON cp.sku = x.sku
LEFT JOIN catalog_fitment cf ON cf.product_id = cp.id;

\echo ''
\echo '── Top 20 brands in crossref ─────────────────────────────────'

-- ── 6. Brand breakdown ────────────────────────────────────────────────────────
SELECT
  oem_manufacturer                                 AS brand,
  COUNT(*)                                         AS crossref_rows,
  COUNT(DISTINCT sku)                              AS distinct_skus,
  COUNT(DISTINCT oem_number)                       AS distinct_oem_numbers
FROM catalog_oem_crossref
WHERE oem_manufacturer IS NOT NULL
GROUP BY 1
ORDER BY crossref_rows DESC
LIMIT 20;

\echo ''
\echo '── WPS SKUs in crossref with NO match in either product table ─'

-- ── 7. Orphaned crossref rows (SKU exists in crossref but nowhere in catalog) ─
SELECT
  x.sku,
  x.oem_manufacturer,
  x.oem_number,
  x.page_reference,
  x.source_file
FROM catalog_oem_crossref x
LEFT JOIN catalog_products cp ON cp.sku = x.sku
LEFT JOIN catalog_unified  cu ON cu.sku = x.sku
WHERE cp.sku IS NULL AND cu.sku IS NULL
ORDER BY x.oem_manufacturer, x.sku
LIMIT 50;

\echo ''
\echo '══ END REPORT ═════════════════════════════════════════════════'
