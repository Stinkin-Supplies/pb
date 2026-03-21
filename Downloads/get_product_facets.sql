-- ============================================================
-- Run this once in the Supabase SQL editor.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- Creates a single Postgres function that returns category
-- counts, brand counts, and price range in one round-trip.
--
-- Faceting rules (industry standard):
--   - Category counts: apply all filters EXCEPT category
--     so sidebar shows "how many results if I pick this category"
--   - Brand counts: apply all filters EXCEPT brand
--   - Price range: apply all filters (for the range slider bounds)
--
-- Called by: lib/supabase/admin.ts → getFilteredProducts()
-- Replaced by: Typesense facets (Phase B)
-- ============================================================

CREATE OR REPLACE FUNCTION get_product_facets(
  p_brand      text    DEFAULT NULL,
  p_category   text    DEFAULT NULL,
  p_min_price  numeric DEFAULT NULL,
  p_max_price  numeric DEFAULT NULL,
  p_in_stock   boolean DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(

    -- Category counts: all filters applied EXCEPT p_category
    -- so user sees accurate counts for each category option
    'categories', (
      SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.count DESC), '[]'::json)
      FROM (
        SELECT category_name AS name, COUNT(*)::int AS count
        FROM products
        WHERE status = 'active'
          AND (p_brand     IS NULL OR brand_name = p_brand)
          AND (p_min_price IS NULL OR our_price  >= p_min_price)
          AND (p_max_price IS NULL OR our_price  <= p_max_price)
          AND (p_in_stock  IS NULL OR p_in_stock = false OR in_stock = true)
          AND category_name IS NOT NULL
        GROUP BY category_name
      ) c
    ),

    -- Brand counts: all filters applied EXCEPT p_brand
    'brands', (
      SELECT COALESCE(json_agg(row_to_json(b) ORDER BY b.count DESC), '[]'::json)
      FROM (
        SELECT brand_name AS name, COUNT(*)::int AS count
        FROM products
        WHERE status = 'active'
          AND (p_category  IS NULL OR category_name = p_category)
          AND (p_min_price IS NULL OR our_price     >= p_min_price)
          AND (p_max_price IS NULL OR our_price     <= p_max_price)
          AND (p_in_stock  IS NULL OR p_in_stock = false OR in_stock = true)
          AND brand_name IS NOT NULL
        GROUP BY brand_name
      ) b
    ),

    -- Price range: full filter set applied, gives slider bounds
    'price_range', (
      SELECT json_build_object(
        'min', COALESCE(MIN(our_price), 0),
        'max', COALESCE(MAX(our_price), 0)
      )
      FROM products
      WHERE status = 'active'
        AND (p_brand     IS NULL OR brand_name    = p_brand)
        AND (p_category  IS NULL OR category_name = p_category)
        AND (p_in_stock  IS NULL OR p_in_stock = false OR in_stock = true)
    )

  )
$$;

-- Grant access to the anon and service roles
GRANT EXECUTE ON FUNCTION get_product_facets TO anon, authenticated, service_role;

-- Index hint: make sure these columns are indexed for fast GROUP BY
-- Run EXPLAIN ANALYZE on the function if facets are slow.
-- CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category_name) WHERE status = 'active';
-- CREATE INDEX IF NOT EXISTS idx_products_brand_name    ON products(brand_name)    WHERE status = 'active';
-- CREATE INDEX IF NOT EXISTS idx_products_our_price     ON products(our_price)     WHERE status = 'active';
