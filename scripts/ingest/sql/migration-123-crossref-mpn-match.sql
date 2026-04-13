-- migration-123-crossref-mpn-match.sql
--
-- Closes the gap between catalog_oem_crossref.page_reference (Brand-Part#)
-- and catalog_products.manufacturer_part_number.
--
-- Problem:
--   crossref row:  oem_number=738, sku=681-4572, page_reference=JGI-738
--   catalog row:   sku=681-4572, manufacturer_part_number=JGI-738
--
--   These are already linked via sku=681-4572.  BUT some products may appear
--   in the catalog under a DIFFERENT vendor SKU while sharing the same MPN.
--   e.g. a PU-sourced James Gaskets product with sku=PU-99999 and
--   manufacturer_part_number=JGI-738 has NO crossref row.
--
-- Fix:
--   1. Add an index on catalog_products.manufacturer_part_number (if not present).
--   2. Insert new rows into catalog_oem_crossref for any catalog_products rows
--      whose manufacturer_part_number matches an existing crossref.page_reference
--      but whose sku is NOT already in the crossref for that oem_number.
--   3. Report coverage before and after.
--
-- Safe to re-run (INSERT … ON CONFLICT DO NOTHING).
--
-- Run:
--   psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
--     -f scripts/ingest/sql/migration-123-crossref-mpn-match.sql

BEGIN;

-- ── 1. Ensure index on manufacturer_part_number ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cp_manufacturer_part_number
  ON catalog_products (manufacturer_part_number)
  WHERE manufacturer_part_number IS NOT NULL
    AND btrim(manufacturer_part_number) <> '';

-- ── 2. Ensure index on catalog_oem_crossref.page_reference ───────────────────
CREATE INDEX IF NOT EXISTS idx_crossref_page_reference
  ON catalog_oem_crossref (page_reference)
  WHERE page_reference IS NOT NULL
    AND page_reference <> '';

-- ── 3. Count before ───────────────────────────────────────────────────────────
\echo ''
\echo '── Before: crossref coverage ─────────────────────────────────'
SELECT
  COUNT(*)                    AS total_crossref_rows,
  COUNT(DISTINCT sku)         AS distinct_skus,
  COUNT(DISTINCT oem_number)  AS distinct_oem_numbers
FROM catalog_oem_crossref;

-- ── 4. How many catalog_products rows could gain a crossref entry via MPN? ────
\echo ''
\echo '── MPN→page_reference match candidates ───────────────────────'
SELECT
  COUNT(*) AS potential_new_crossref_rows
FROM catalog_products cp
JOIN catalog_oem_crossref x
  ON  UPPER(TRIM(cp.manufacturer_part_number)) = UPPER(TRIM(x.page_reference))
  AND x.page_reference IS NOT NULL
  AND x.page_reference <> ''
WHERE cp.manufacturer_part_number IS NOT NULL
  AND cp.manufacturer_part_number <> ''
  -- Only add row if this (oem_number, sku) pair is not already there
  AND NOT EXISTS (
    SELECT 1 FROM catalog_oem_crossref x2
    WHERE x2.oem_number = x.oem_number
      AND x2.sku        = cp.sku
  );

-- ── 5. Insert the new crossref rows ──────────────────────────────────────────
\echo ''
\echo '── Inserting MPN-matched crossref rows ───────────────────────'
WITH matches AS (
  SELECT DISTINCT
    cp.sku                   AS sku,
    x.oem_number             AS oem_number,
    x.oem_manufacturer       AS oem_manufacturer,
    cp.manufacturer_part_number AS page_reference,
    'mpn_match'              AS source_file   -- marks how this row was created
  FROM catalog_products cp
  JOIN catalog_oem_crossref x
    ON  UPPER(TRIM(cp.manufacturer_part_number)) = UPPER(TRIM(x.page_reference))
    AND x.page_reference IS NOT NULL
    AND x.page_reference <> ''
  WHERE cp.manufacturer_part_number IS NOT NULL
    AND cp.manufacturer_part_number <> ''
    AND NOT EXISTS (
      SELECT 1 FROM catalog_oem_crossref x2
      WHERE x2.oem_number = x.oem_number
        AND x2.sku        = cp.sku
    )
)
INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, page_reference, source_file)
SELECT sku, oem_number, oem_manufacturer, page_reference, source_file
FROM matches
ON CONFLICT DO NOTHING;

GET DIAGNOSTICS rows_inserted = ROW_COUNT;
-- (psql prints it automatically)

-- ── 6. Count after ────────────────────────────────────────────────────────────
\echo ''
\echo '── After: crossref coverage ──────────────────────────────────'
SELECT
  COUNT(*)                                                          AS total_crossref_rows,
  COUNT(*) FILTER (WHERE source_file = 'mpn_match')                AS mpn_matched_rows,
  COUNT(DISTINCT sku)                                               AS distinct_skus,
  COUNT(DISTINCT oem_number)                                        AS distinct_oem_numbers
FROM catalog_oem_crossref;

-- ── 7. Sample of newly added rows ────────────────────────────────────────────
\echo ''
\echo '── Sample MPN-matched rows ───────────────────────────────────'
SELECT
  x.sku,
  x.oem_number,
  x.oem_manufacturer,
  x.page_reference,
  cp.name,
  cp.brand
FROM catalog_oem_crossref x
JOIN catalog_products cp ON cp.sku = x.sku
WHERE x.source_file = 'mpn_match'
ORDER BY x.oem_manufacturer, x.sku
LIMIT 20;

\echo ''
\echo '══ migration-123 complete ════════════════════════════════════'

COMMIT;
