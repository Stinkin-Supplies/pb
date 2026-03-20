-- ============================================================
-- supabase/migrations/20260101_add_vendor_product_columns.sql
-- ============================================================
-- Adds all Parts Unlimited / vendor sync columns to the
-- products table. Run via: supabase db push
-- OR paste into Supabase SQL Editor.
-- ============================================================

-- Add vendor sync columns to products table
ALTER TABLE public.products
  -- Vendor identification
  ADD COLUMN IF NOT EXISTS vendor_id          uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_sku         text,
  ADD COLUMN IF NOT EXISTS product_code       text,       -- PU product code (A, E, F, etc.)
  ADD COLUMN IF NOT EXISTS commodity_code     text,       -- PU commodity code (4 chars)

  -- Pricing
  ADD COLUMN IF NOT EXISTS dealer_cost        numeric(10,2),  -- our cost from vendor
  ADD COLUMN IF NOT EXISTS map_price          numeric(10,2),  -- minimum advertised price
  ADD COLUMN IF NOT EXISTS map_floor          numeric(10,2),  -- alias for map_price
  ADD COLUMN IF NOT EXISTS compare_at_price   numeric(10,2),  -- MSRP / was price
  ADD COLUMN IF NOT EXISTS our_price          numeric(10,2),  -- selling price (rename from price if needed)

  -- Physical
  ADD COLUMN IF NOT EXISTS weight_lbs         numeric(8,2),
  ADD COLUMN IF NOT EXISTS upc_code           text,
  ADD COLUMN IF NOT EXISTS country_of_origin  char(2),

  -- Warehouse availability (PU has 5 warehouses)
  ADD COLUMN IF NOT EXISTS wi_qty             smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ny_qty             smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tx_qty             smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nv_qty             smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nc_qty             smallint DEFAULT 0,

  -- Flags
  ADD COLUMN IF NOT EXISTS hazardous_code     char(1),
  ADD COLUMN IF NOT EXISTS truck_only         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_map             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_drag_specialties boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_closeout        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_new             boolean DEFAULT false,

  -- Metadata
  ADD COLUMN IF NOT EXISTS part_add_date      date,
  ADD COLUMN IF NOT EXISTS last_synced_at     timestamptz;

-- Make sure products has the base columns the app expects
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku           text,
  ADD COLUMN IF NOT EXISTS slug          text,
  ADD COLUMN IF NOT EXISTS name          text,
  ADD COLUMN IF NOT EXISTS brand_name    text,
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_stock      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status        text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS description   text;

-- Unique constraint on SKU (used for upsert conflict resolution)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_sku_unique'
    AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sku_unique UNIQUE (sku);
  END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────

-- SKU lookups (primary vendor key)
CREATE INDEX IF NOT EXISTS products_sku_idx
  ON public.products (sku);

-- Brand browsing
CREATE INDEX IF NOT EXISTS products_brand_name_idx
  ON public.products (brand_name);

-- Category browsing
CREATE INDEX IF NOT EXISTS products_category_name_idx
  ON public.products (category_name);

-- Status filter (active products only)
CREATE INDEX IF NOT EXISTS products_status_idx
  ON public.products (status)
  WHERE status = 'active';

-- In-stock filter (common in shop queries)
CREATE INDEX IF NOT EXISTS products_in_stock_idx
  ON public.products (in_stock)
  WHERE in_stock = true;

-- MAP/Drag Specialties flags
CREATE INDEX IF NOT EXISTS products_is_drag_idx
  ON public.products (is_drag_specialties)
  WHERE is_drag_specialties = true;

CREATE INDEX IF NOT EXISTS products_vendor_id_idx
  ON public.products (vendor_id);

-- Last synced (for monitoring sync freshness)
CREATE INDEX IF NOT EXISTS products_last_synced_idx
  ON public.products (last_synced_at DESC);

-- ── Full-text search vector ───────────────────────────────────
-- Add tsvector column for Postgres full-text search
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'english',
        coalesce(name, '')        || ' ' ||
        coalesce(brand_name, '')  || ' ' ||
        coalesce(category_name, '') || ' ' ||
        coalesce(sku, '')         || ' ' ||
        coalesce(description, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS products_search_vector_idx
  ON public.products USING GIN (search_vector);

-- ── vendors table (if not exists) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE NOT NULL,
  avg_ship_time_days integer DEFAULT 2,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Insert Parts Unlimited vendor if not present
INSERT INTO public.vendors (name, slug, avg_ship_time_days)
VALUES ('Parts Unlimited', 'parts-unlimited', 2)
ON CONFLICT (slug) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────
-- Products are public-readable (storefront), write is admin only
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public can read active products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products'
    AND policyname = 'products_public_read'
  ) THEN
    CREATE POLICY products_public_read ON public.products
      FOR SELECT
      USING (status = 'active');
  END IF;
END $$;

-- Service role bypasses RLS (used by sync worker)
-- No policy needed for service role.

COMMENT ON TABLE public.products IS
  'Canonical product catalog. Synced from Parts Unlimited and other vendors via /api/vendors/*/sync.';
COMMENT ON COLUMN public.products.dealer_cost IS
  'Our actual cost from vendor. Never exposed to customers.';
COMMENT ON COLUMN public.products.map_price IS
  'Minimum Advertised Price. our_price must be >= map_price when is_map = true.';
COMMENT ON COLUMN public.products.our_price IS
  'The price shown to customers on the storefront.';
