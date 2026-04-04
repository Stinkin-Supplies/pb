-- 113_catalog_product_search_cache.sql
-- Optional denormalized cache to speed Typesense indexing (Stage 3).
-- Populated by Stage 2 when STAGE2_BUILD_SEARCH_CACHE=1.

CREATE TABLE IF NOT EXISTS public.catalog_product_search_cache (
  product_id    INTEGER PRIMARY KEY REFERENCES public.catalog_products(id) ON DELETE CASCADE,

  specs         TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  fitment_make  TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  fitment_model TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  fitment_year  INT[]  NOT NULL DEFAULT ARRAY[]::int[],

  image_url     TEXT,
  search_blob   TEXT,

  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_product_search_cache_updated_at
  ON public.catalog_product_search_cache (updated_at);

