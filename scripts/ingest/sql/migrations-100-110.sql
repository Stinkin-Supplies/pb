-- ============================================================================
-- Stinkin' Supplies - Catalog Schema Migrations 100-110
-- Run these in Supabase/Hetzner SQL Editor before running the pipeline
-- ============================================================================

-- Migration 100: Create catalog_variants table
-- For size/color/config dropdowns on PDP
CREATE TABLE IF NOT EXISTS catalog_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 101: Create catalog_specs table
-- For PIES technical attributes
CREATE TABLE IF NOT EXISTS catalog_specs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 102: Create catalog_fitment table
-- For ACES vehicle fitment (Year/Make/Model)
CREATE TABLE IF NOT EXISTS catalog_fitment (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  make TEXT,
  model TEXT,
  year_start INTEGER,
  year_end INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 103: Create catalog_media table
-- Replaces images[] array
CREATE TABLE IF NOT EXISTS catalog_media (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 104: Create raw vendor staging tables
-- Zero-loss raw data storage
CREATE TABLE IF NOT EXISTS raw_vendor_pu (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  source_file TEXT UNIQUE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_vendor_wps_products (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  source_file TEXT UNIQUE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_vendor_wps_inventory (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  source_file TEXT UNIQUE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_vendor_aces (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  source_file TEXT UNIQUE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_vendor_pies (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  source_file TEXT UNIQUE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration 105: Add discontinued tracking
ALTER TABLE catalog_products 
ADD COLUMN IF NOT EXISTS is_discontinued BOOLEAN DEFAULT FALSE;

-- Migration 106: Create variant indexes
CREATE INDEX IF NOT EXISTS idx_catalog_variants_product 
ON catalog_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_catalog_variants_option 
ON catalog_variants(option_name, option_value);

-- Migration 107: Create specs indexes
CREATE INDEX IF NOT EXISTS idx_specs_attribute 
ON catalog_specs(attribute);

CREATE INDEX IF NOT EXISTS idx_specs_product 
ON catalog_specs(product_id);

-- Migration 108: Add pricing fields to vendor_offers
ALTER TABLE vendor_offers 
ADD COLUMN IF NOT EXISTS our_price NUMERIC;

ALTER TABLE vendor_offers 
ADD COLUMN IF NOT EXISTS map_price NUMERIC;

ALTER TABLE vendor_offers 
ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ;

ALTER TABLE catalog_products 
ADD COLUMN IF NOT EXISTS computed_price NUMERIC;

-- Migration 109: Create fitment indexes
CREATE INDEX IF NOT EXISTS idx_fitment_product 
ON catalog_fitment(product_id);

CREATE INDEX IF NOT EXISTS idx_fitment_make_model 
ON catalog_fitment(make, model);

CREATE INDEX IF NOT EXISTS idx_fitment_year 
ON catalog_fitment(year_start, year_end);

-- Migration 110: Create catalog_allowlist table
CREATE TABLE IF NOT EXISTS catalog_allowlist (
  sku TEXT NOT NULL,
  source TEXT NOT NULL,
  catalog TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sku, source)
);

CREATE INDEX IF NOT EXISTS idx_allowlist_sku 
ON catalog_allowlist(sku);

CREATE INDEX IF NOT EXISTS idx_allowlist_source 
ON catalog_allowlist(source);

-- Create sync_log table for tracking
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  vendor TEXT NOT NULL,
  status TEXT NOT NULL,
  event TEXT NOT NULL,
  upserted INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_vendor 
ON sync_log(vendor, completed_at);

-- Finalize: Analyze tables
VACUUM ANALYZE catalog_products;
VACUUM ANALYZE vendor_offers;
VACUUM ANALYZE catalog_specs;
VACUUM ANALYZE catalog_variants;
VACUUM ANALYZE catalog_media;
VACUUM ANALYZE catalog_fitment;
VACUUM ANALYZE catalog_allowlist;

-- ============================================================================
-- ✅ Migrations Complete!
-- You can now run the ingestion pipeline.
-- ============================================================================
