-- migration-121-crossref-page-reference.sql
--
-- Adds brand part number (page_reference) column to catalog_unified and
-- catalog_products, then backfills from catalog_oem_crossref.
--
-- The crossref table links vendor SKUs to OEM numbers and aftermarket brand
-- part numbers. One SKU can have multiple crossref rows (one per brand).
-- This migration picks the first page_reference alphabetically per SKU.
--
-- Run:
--   psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
--     -f scripts/ingest/sql/migration-121-crossref-page-reference.sql

BEGIN;

-- ── 1. Add column to catalog_unified ─────────────────────────────────────────
ALTER TABLE catalog_unified
  ADD COLUMN IF NOT EXISTS page_reference TEXT;

-- ── 2. Add column to catalog_products ────────────────────────────────────────
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS page_reference TEXT;

-- ── 3. Backfill catalog_unified from catalog_oem_crossref ────────────────────
--   For SKUs with multiple crossref rows, picks the page_reference from the
--   row with the alphabetically first oem_manufacturer.
UPDATE catalog_unified AS cu
SET page_reference = x.page_reference
FROM (
  SELECT DISTINCT ON (sku)
    sku,
    page_reference
  FROM catalog_oem_crossref
  WHERE page_reference IS NOT NULL
    AND page_reference <> ''
  ORDER BY sku, oem_manufacturer
) AS x
WHERE cu.sku = x.sku
  AND (cu.page_reference IS NULL OR cu.page_reference = '');

-- ── 4. Backfill catalog_products from catalog_oem_crossref ───────────────────
UPDATE catalog_products AS cp
SET page_reference = x.page_reference
FROM (
  SELECT DISTINCT ON (sku)
    sku,
    page_reference
  FROM catalog_oem_crossref
  WHERE page_reference IS NOT NULL
    AND page_reference <> ''
  ORDER BY sku, oem_manufacturer
) AS x
WHERE cp.sku = x.sku
  AND (cp.page_reference IS NULL OR cp.page_reference = '');

-- ── 5. Report ─────────────────────────────────────────────────────────────────
SELECT
  'catalog_unified'  AS tbl,
  COUNT(*)           AS total_rows,
  COUNT(page_reference) FILTER (WHERE page_reference IS NOT NULL AND page_reference <> '') AS rows_with_page_ref
FROM catalog_unified
UNION ALL
SELECT
  'catalog_products',
  COUNT(*),
  COUNT(page_reference) FILTER (WHERE page_reference IS NOT NULL AND page_reference <> '')
FROM catalog_products;

COMMIT;
