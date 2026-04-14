-- migration-122-product-groups.sql
--
-- Creates the product grouping tables that power vendor-blind search dedup
-- and multi-brand checkout routing.
--
-- product_groups        — one row per "need" (OEM fitment / unique product)
-- product_group_members — every SKU across WPS + PU that satisfies the need
--
-- Grouping signals (applied in this order, highest confidence first):
--   1. OEM crossref  — same oem_number in catalog_oem_crossref
--   2. UPC match     — same non-null UPC in catalog_unified across vendors
--   3. Ungrouped     — products with no match get their own singleton group
--
-- Run:
--   psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
--     -f scripts/ingest/sql/migration-122-product-groups.sql

BEGIN;

-- ── product_groups ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_groups (
  id                   SERIAL PRIMARY KEY,

  -- How this group was formed
  group_signal         VARCHAR(20) NOT NULL DEFAULT 'singleton',
  -- 'oem_crossref'  — grouped because members share an OEM part number
  -- 'upc_match'     — grouped because members share a UPC code
  -- 'singleton'     — no dedup signal found; one product, one group

  -- The OEM part number this group replaces (populated for oem_crossref groups)
  oem_number           VARCHAR(100),

  -- The UPC that triggered the group (populated for upc_match groups)
  upc                  VARCHAR(30),

  -- Canonical display values for search (taken from the best member)
  canonical_name       TEXT NOT NULL,
  canonical_brand      TEXT,           -- display_brand of the canonical member
  canonical_category   TEXT,
  canonical_image_url  TEXT,

  -- The primary product_id to link to for the storefront URL
  canonical_product_id INTEGER,        -- FK set after catalog_products is populated

  -- Aggregated availability across all members
  any_in_stock         BOOLEAN DEFAULT FALSE,
  member_count         SMALLINT DEFAULT 1,
  vendor_count         SMALLINT DEFAULT 1, -- how many distinct vendors cover this group
  brand_count          SMALLINT DEFAULT 1, -- how many distinct brands in this group

  -- Pricing range across all members
  price_min            NUMERIC(10,2),
  price_max            NUMERIC(10,2),

  -- Internal SKU of the canonical member (for slug building)
  canonical_internal_sku VARCHAR(15),

  -- Slug for storefront URLs — derived from canonical member
  slug                 TEXT UNIQUE,

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_oem_number  ON product_groups(oem_number)  WHERE oem_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pg_upc         ON product_groups(upc)          WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pg_signal      ON product_groups(group_signal);
CREATE INDEX IF NOT EXISTS idx_pg_in_stock    ON product_groups(any_in_stock);
CREATE INDEX IF NOT EXISTS idx_pg_category    ON product_groups(canonical_category);
CREATE INDEX IF NOT EXISTS idx_pg_slug        ON product_groups(slug);

-- ── product_group_members ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_group_members (
  id                   SERIAL PRIMARY KEY,
  group_id             INTEGER NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,

  -- The actual product record
  product_id           INTEGER,        -- references catalog_products.id (nullable for PU-only)
  unified_id           INTEGER,        -- references catalog_unified.id  (always set)

  -- Vendor / fulfillment info
  vendor               VARCHAR(10) NOT NULL,  -- 'WPS' | 'PU'
  vendor_sku           VARCHAR(100) NOT NULL,

  -- Brand this member represents
  brand                TEXT,
  display_brand        TEXT,
  internal_sku         VARCHAR(15),

  -- Pricing snapshot (refreshed on sync)
  msrp                 NUMERIC(10,2),
  cost                 NUMERIC(10,2),
  map_price            NUMERIC(10,2),

  -- Inventory snapshot
  in_stock             BOOLEAN DEFAULT FALSE,
  stock_quantity       INTEGER DEFAULT 0,

  -- Warehouse breakdown (for routing distance scoring)
  warehouse_wi         INTEGER DEFAULT 0,
  warehouse_ny         INTEGER DEFAULT 0,
  warehouse_tx         INTEGER DEFAULT 0,
  warehouse_nv         INTEGER DEFAULT 0,
  warehouse_nc         INTEGER DEFAULT 0,

  -- Whether this is the canonical/preferred member for the group
  is_canonical         BOOLEAN DEFAULT FALSE,

  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (group_id, vendor_sku)
);

CREATE INDEX IF NOT EXISTS idx_pgm_group_id   ON product_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_pgm_vendor_sku ON product_group_members(vendor_sku);
CREATE INDEX IF NOT EXISTS idx_pgm_vendor     ON product_group_members(vendor);
CREATE INDEX IF NOT EXISTS idx_pgm_in_stock   ON product_group_members(in_stock);
CREATE INDEX IF NOT EXISTS idx_pgm_canonical  ON product_group_members(is_canonical) WHERE is_canonical = TRUE;

COMMIT;

\echo 'migration-122-product-groups.sql complete'
\echo 'Next step: run   node scripts/ingest/build-product-groups.js'
