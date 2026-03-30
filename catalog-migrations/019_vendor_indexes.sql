-- ─────────────────────────────────────────────────────────────────────────────
-- 019: Add performance indexes on vendor tables
-- Run before ingestion for best insert performance
-- ─────────────────────────────────────────────────────────────────────────────

-- vendor_products: lookup by MPN (critical for Phase 2 merge)
CREATE INDEX IF NOT EXISTS idx_vendor_products_mpn
  ON vendor.vendor_products (manufacturer_part_number);

-- vendor_products: lookup by vendor + sku
CREATE INDEX IF NOT EXISTS idx_vendor_products_vendor_sku
  ON vendor.vendor_products (vendor_code, vendor_part_number);

-- vendor_products: filter by status
CREATE INDEX IF NOT EXISTS idx_vendor_products_status
  ON vendor.vendor_products (status);

-- vendor_products: filter by brand
CREATE INDEX IF NOT EXISTS idx_vendor_products_brand
  ON vendor.vendor_products (brand);

-- vendor_inventory: lookup by vendor + sku
CREATE INDEX IF NOT EXISTS idx_vendor_inventory_vendor_sku
  ON vendor.vendor_inventory (vendor_code, vendor_part_number);

-- vendor_inventory: lookup by warehouse
CREATE INDEX IF NOT EXISTS idx_vendor_inventory_warehouse
  ON vendor.vendor_inventory (warehouse_id);

-- vendor_sync_log: latest sync per vendor
CREATE INDEX IF NOT EXISTS idx_vendor_sync_log_vendor_date
  ON vendor.vendor_sync_log (vendor_code, completed_at DESC);

-- vendor_error_log: latest errors per vendor
CREATE INDEX IF NOT EXISTS idx_vendor_error_log_vendor_date
  ON vendor.vendor_error_log (vendor_code, created_at DESC);

-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'vendor'
ORDER BY tablename, indexname;
