-- =============================================================================
-- Migration 120: Internal SKU System + Brand Display Fields
--
-- Adds:
--   catalog_products.internal_sku   (ENG-100001 style — never customer-facing)
--   catalog_products.display_brand  (what the storefront shows)
--   catalog_products.manufacturer_brand (actual maker, may differ from display)
--   catalog_unified (same three columns)
--   sku_counter table (global sequential counter used by assign-internal-skus.js)
--
-- Run:
--   psql $CATALOG_DATABASE_URL -f scripts/ingest/sql/migration-120-internal-sku.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. catalog_products — new columns
-- ---------------------------------------------------------------------------

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS internal_sku       VARCHAR(15) UNIQUE,
  ADD COLUMN IF NOT EXISTS display_brand      TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer_brand TEXT;

-- Index: admin + PDP lookup by internal SKU
CREATE UNIQUE INDEX IF NOT EXISTS idx_cp_internal_sku
  ON catalog_products (internal_sku)
  WHERE internal_sku IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. catalog_unified — same columns (kept in sync by assign script)
-- ---------------------------------------------------------------------------

ALTER TABLE catalog_unified
  ADD COLUMN IF NOT EXISTS internal_sku       VARCHAR(15),
  ADD COLUMN IF NOT EXISTS display_brand      TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer_brand TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cu_internal_sku
  ON catalog_unified (internal_sku)
  WHERE internal_sku IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Global SKU counter table
--    One row per prefix; the assign script increments atomically.
--    Pre-seed with all known prefixes starting at 100000 so the first
--    generated SKU is ENG-100001, BRK-100001, etc.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sku_counter (
  prefix       CHAR(3)  PRIMARY KEY,
  description  TEXT     NOT NULL,
  last_val     INTEGER  NOT NULL DEFAULT 100000,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sku_counter (prefix, description) VALUES
  ('ENG', 'Engine — gaskets, filters, pistons, seals, internals'),
  ('BRK', 'Brakes — pads, rotors, calipers, lines, fluids'),
  ('WHL', 'Wheels — rims, tires, spokes, hubs, tubes'),
  ('EXH', 'Exhaust — pipes, mufflers, header wrap, clamps'),
  ('SUS', 'Suspension — forks, shocks, springs, lowering kits'),
  ('ELC', 'Electrical — coils, starters, switches, wiring, batteries'),
  ('LIG', 'Lighting — headlights, taillights, turn signals, LEDs'),
  ('STR', 'Steering — handlebars, risers, grips, mirrors, controls'),
  ('FUL', 'Fuel — carbs, injectors, tanks, petcocks, fuel filters'),
  ('DRV', 'Drivetrain — chains, belts, sprockets, clutch, primary'),
  ('FEN', 'Fenders — front & rear fenders and struts'),
  ('SEA', 'Seating — seats, seat pans, backrests, covers'),
  ('BDY', 'Body — fairings, tanks, side covers, trim, hardware'),
  ('FTR', 'Footwear — pegs, boards, floorboards, heel/toe controls'),
  ('ACC', 'Accessories — apparel, luggage, chemicals, tools, misc')
ON CONFLICT (prefix) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Verify
-- ---------------------------------------------------------------------------

SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'catalog_products'
  AND column_name IN ('internal_sku','display_brand','manufacturer_brand')
ORDER BY column_name;

SELECT prefix, description, last_val FROM sku_counter ORDER BY prefix;

COMMIT;
