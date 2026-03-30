-- ─────────────────────────────────────────────
-- PHASE 1 VERIFICATION QUERIES
-- Run these in SQLTools after each import
-- ─────────────────────────────────────────────


-- ── AFTER WPS IMPORT (Phase 1.1) ─────────────

-- Row counts
SELECT COUNT(*) AS wps_products  FROM vendor.vendor_products  WHERE vendor_code = 'wps';
SELECT COUNT(*) AS wps_inventory FROM vendor.vendor_inventory  WHERE vendor_code = 'wps';
SELECT COUNT(*) AS wps_warehouses FROM vendor.vendor_warehouses WHERE vendor_code = 'wps';
SELECT COUNT(*) AS wps_categories FROM vendor.vendor_categories WHERE vendor_code = 'wps';

-- Last sync log entry
SELECT status, rows_inserted, rows_failed, notes, completed_at
FROM vendor.vendor_sync_log
WHERE vendor_code = 'wps'
ORDER BY completed_at DESC LIMIT 1;

-- Error log summary
SELECT error_type, COUNT(*) AS count
FROM vendor.vendor_error_log
WHERE vendor_code = 'wps'
GROUP BY error_type;

-- Spot-check 5 rows
SELECT
  vendor_part_number,
  manufacturer_part_number,
  title,
  brand,
  wholesale_cost,
  map_price,
  msrp,
  jsonb_array_length(images_raw) AS image_count
FROM vendor.vendor_products
WHERE vendor_code = 'wps'
LIMIT 5;


-- ── AFTER PU IMPORT (Phase 1.2) ──────────────

-- Row counts
SELECT COUNT(*) AS pu_products  FROM vendor.vendor_products  WHERE vendor_code = 'pu';
SELECT COUNT(*) AS pu_inventory FROM vendor.vendor_inventory  WHERE vendor_code = 'pu';
SELECT COUNT(*) AS pu_categories FROM vendor.vendor_categories WHERE vendor_code = 'pu';

-- Last sync log entry
SELECT status, rows_inserted, rows_failed, notes, completed_at
FROM vendor.vendor_sync_log
WHERE vendor_code = 'pu'
ORDER BY completed_at DESC LIMIT 1;

-- Error log summary
SELECT error_type, COUNT(*) AS count
FROM vendor.vendor_error_log
WHERE vendor_code = 'pu'
GROUP BY error_type;


-- ── PHASE 1 COMPLETE — FINAL CHECK ───────────

SELECT
  vendor_code,
  COUNT(*)                                                              AS total_products,
  COUNT(map_price)                                                      AS with_map,
  COUNT(wholesale_cost)                                                 AS with_cost,
  COUNT(images_raw) FILTER (WHERE jsonb_array_length(images_raw) > 0)  AS with_images,
  COUNT(fitment_raw) FILTER (WHERE jsonb_array_length(fitment_raw) > 0) AS with_fitment
FROM vendor.vendor_products
GROUP BY vendor_code;

-- Combined totals across all tables
SELECT
  (SELECT COUNT(*) FROM vendor.vendor_products)  AS total_products,
  (SELECT COUNT(*) FROM vendor.vendor_inventory) AS total_inventory,
  (SELECT COUNT(*) FROM vendor.vendor_categories) AS total_categories,
  (SELECT COUNT(*) FROM vendor.vendor_error_log) AS total_errors;
