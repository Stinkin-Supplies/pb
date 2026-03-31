-- 026_storefront_rewire.sql
-- Align the self-hosted catalog schema with the storefront rewire.
-- Safe to run on an existing catalog DB.

-- catalog_products: add storefront fields expected by the new queries
ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS slug       TEXT,
  ADD COLUMN IF NOT EXISTS map_price   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS msrp       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill slugs for existing products when absent.
UPDATE public.catalog_products
SET slug = LOWER(REGEXP_REPLACE(COALESCE(name, sku), '[^a-z0-9]+', '-', 'g')) || '-' || sku
WHERE slug IS NULL OR slug = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_products_slug
  ON public.catalog_products (slug);

CREATE INDEX IF NOT EXISTS idx_cp_category_active
  ON public.catalog_products (category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cp_brand_active
  ON public.catalog_products (brand)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cp_price_active
  ON public.catalog_products (price)
  WHERE is_active = true;

-- catalog_images: normalize to catalog_product_id for the rewire
ALTER TABLE public.catalog_images
  ADD COLUMN IF NOT EXISTS catalog_product_id INTEGER;

UPDATE public.catalog_images
SET catalog_product_id = COALESCE(catalog_product_id, product_id)
WHERE catalog_product_id IS NULL;

-- Remove duplicate rows before creating the unique constraint.
DELETE FROM public.catalog_images ci
USING (
  SELECT
    MIN(ctid) AS keep_ctid,
    catalog_product_id,
    url
  FROM public.catalog_images
  WHERE catalog_product_id IS NOT NULL
    AND url IS NOT NULL
  GROUP BY catalog_product_id, url
  HAVING COUNT(*) > 1
) dup
WHERE ci.catalog_product_id = dup.catalog_product_id
  AND ci.url = dup.url
  AND ci.ctid <> dup.keep_ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_images_product_url
  ON public.catalog_images (catalog_product_id, url);

CREATE INDEX IF NOT EXISTS idx_catalog_images_product_primary
  ON public.catalog_images (catalog_product_id, is_primary);

CREATE INDEX IF NOT EXISTS idx_catalog_images_catalog_product_id
  ON public.catalog_images (catalog_product_id);

-- Optional stock lookup helper for storefront filters
ALTER TABLE public.vendor_offers
  ADD COLUMN IF NOT EXISTS catalog_product_id INTEGER,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_vendor_offers_catalog_active
  ON public.vendor_offers (catalog_product_id, is_active);

CREATE INDEX IF NOT EXISTS idx_vendor_offers_catalog_product_id
  ON public.vendor_offers (catalog_product_id);

-- Facet function used by /api/products and SSR /shop
DROP FUNCTION IF EXISTS public.get_product_facets(TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_product_facets(
  p_brand      TEXT    DEFAULT NULL,
  p_category   TEXT    DEFAULT NULL,
  p_min_price  NUMERIC DEFAULT NULL,
  p_max_price  NUMERIC DEFAULT NULL,
  p_in_stock   BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE SQL
STABLE
AS $$
  SELECT json_build_object(
    'categories', COALESCE((
      SELECT json_agg(json_build_object('name', category, 'count', cnt))
      FROM (
        SELECT cp.category, COUNT(*) AS cnt
        FROM public.catalog_products cp
        WHERE cp.is_active = true
          AND (p_brand    IS NULL OR cp.brand = p_brand)
          AND (p_min_price IS NULL OR cp.price >= p_min_price)
          AND (p_max_price IS NULL OR cp.price <= p_max_price)
          AND (
            p_in_stock IS NULL OR p_in_stock = false OR EXISTS (
              SELECT 1
              FROM public.vendor_offers vo
              WHERE vo.catalog_product_id = cp.id
                AND vo.is_active = true
                AND COALESCE(vo.total_qty, 0) > 0
            )
          )
        GROUP BY cp.category
        ORDER BY cnt DESC
      ) s
    ), '[]'::json),
    'brands', COALESCE((
      SELECT json_agg(json_build_object('name', brand, 'count', cnt))
      FROM (
        SELECT cp.brand, COUNT(*) AS cnt
        FROM public.catalog_products cp
        WHERE cp.is_active = true
          AND (p_category IS NULL OR cp.category = p_category)
          AND (p_min_price IS NULL OR cp.price >= p_min_price)
          AND (p_max_price IS NULL OR cp.price <= p_max_price)
          AND (
            p_in_stock IS NULL OR p_in_stock = false OR EXISTS (
              SELECT 1
              FROM public.vendor_offers vo
              WHERE vo.catalog_product_id = cp.id
                AND vo.is_active = true
                AND COALESCE(vo.total_qty, 0) > 0
            )
          )
        GROUP BY cp.brand
        ORDER BY cnt DESC
        LIMIT 100
      ) s
    ), '[]'::json),
    'price_range', COALESCE((
      SELECT json_build_object('min', MIN(price), 'max', MAX(price))
      FROM public.catalog_products cp
      WHERE cp.is_active = true
        AND (p_brand IS NULL OR cp.brand = p_brand)
        AND (p_category IS NULL OR cp.category = p_category)
        AND (
          p_in_stock IS NULL OR p_in_stock = false OR EXISTS (
            SELECT 1
            FROM public.vendor_offers vo
            WHERE vo.catalog_product_id = cp.id
              AND vo.is_active = true
              AND COALESCE(vo.total_qty, 0) > 0
          )
        )
        AND price > 0
    ), json_build_object('min', 0, 'max', 0))
  );
$$;
