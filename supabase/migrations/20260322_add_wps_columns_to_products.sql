-- ============================================================
-- Adds WPS-specific columns to the products table.
-- Run in Supabase SQL Editor before running the WPS sync.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images         text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wps_item_id    integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wps_product_id integer DEFAULT NULL;

-- Index for order routing (WPS PO flow looks up by wps_item_id)
CREATE INDEX IF NOT EXISTS idx_products_wps_item_id
  ON public.products (wps_item_id)
  WHERE wps_item_id IS NOT NULL;
