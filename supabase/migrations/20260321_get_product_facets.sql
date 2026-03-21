-- ============================================================
-- Creates a Postgres function that returns category counts,
-- brand counts, and price range in one round-trip.
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

    -- Price range: full filter set applied
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

GRANT EXECUTE ON FUNCTION get_product_facets TO anon, authenticated, service_role;

-- Optional indexes for performance:
-- CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category_name) WHERE status = 'active';
-- CREATE INDEX IF NOT EXISTS idx_products_brand_name    ON products(brand_name)    WHERE status = 'active';
-- CREATE INDEX IF NOT EXISTS idx_products_our_price     ON products(our_price)     WHERE status = 'active';
