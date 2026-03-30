-- ─────────────────────────────────────────────────────────────────────────────
-- 016: Add WPS-specific columns to vendor.vendor_products
-- Run BEFORE executing wps-ingest.js
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE vendor.vendor_products
  ADD COLUMN IF NOT EXISTS vendor_item_id        TEXT,
  ADD COLUMN IF NOT EXISTS vendor_product_id     TEXT,
  ADD COLUMN IF NOT EXISTS upc                   TEXT,
  ADD COLUMN IF NOT EXISTS superseded_sku        TEXT,
  ADD COLUMN IF NOT EXISTS status                TEXT,
  ADD COLUMN IF NOT EXISTS status_id             INTEGER,
  ADD COLUMN IF NOT EXISTS product_type          TEXT,
  ADD COLUMN IF NOT EXISTS unit_of_measurement   TEXT,
  ADD COLUMN IF NOT EXISTS has_map_policy        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drop_ship_eligible    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS carb                  TEXT,
  ADD COLUMN IF NOT EXISTS prop_65_code          TEXT,
  ADD COLUMN IF NOT EXISTS prop_65_detail        TEXT,
  ADD COLUMN IF NOT EXISTS country_id            INTEGER,
  ADD COLUMN IF NOT EXISTS published_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_created_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_updated_at     TIMESTAMPTZ;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'vendor'
  AND table_name   = 'vendor_products'
ORDER BY ordinal_position;
