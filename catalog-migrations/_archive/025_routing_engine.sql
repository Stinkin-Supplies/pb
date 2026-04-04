-- ─────────────────────────────────────────────────────────────────────────────
-- 025: Phase 4 — Routing engine tables
-- Warehouse locations, shipping rules, drop-ship fees
-- ─────────────────────────────────────────────────────────────────────────────

-- Vendor warehouse locations (seed with known WPS + PU warehouses)
CREATE TABLE IF NOT EXISTS public.routing_warehouses (
  id            SERIAL PRIMARY KEY,
  vendor_code   TEXT NOT NULL,
  warehouse_id  TEXT NOT NULL,
  name          TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  country       TEXT DEFAULT 'US',
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (vendor_code, warehouse_id)
);

-- Vendor shipping rules
CREATE TABLE IF NOT EXISTS public.routing_shipping_rules (
  id                  SERIAL PRIMARY KEY,
  vendor_code         TEXT NOT NULL,
  warehouse_id        TEXT,
  carrier             TEXT,
  service_level       TEXT,
  min_days            INTEGER,
  max_days            INTEGER,
  base_rate           NUMERIC DEFAULT 0,
  per_lb_rate         NUMERIC DEFAULT 0,
  free_shipping_over  NUMERIC,
  max_weight_lbs      NUMERIC,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Order routing decisions (written at fulfillment time)
CREATE TABLE IF NOT EXISTS public.routing_decisions (
  id                   SERIAL PRIMARY KEY,
  order_id             TEXT,
  catalog_product_id   INTEGER REFERENCES public.catalog_products(id),
  selected_vendor_code TEXT,
  selected_warehouse   TEXT,
  routing_strategy     TEXT DEFAULT 'cheapest',
  estimated_days       INTEGER,
  estimated_cost       NUMERIC,
  drop_ship_fee        NUMERIC DEFAULT 0,
  routing_metadata     JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_routing_warehouses_vendor
  ON public.routing_warehouses (vendor_code);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_order
  ON public.routing_decisions (order_id);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_product
  ON public.routing_decisions (catalog_product_id);

-- ── Seed WPS warehouses (from their API data) ─────────────────────────────────
INSERT INTO public.routing_warehouses (vendor_code, warehouse_id, name, city, state, country)
VALUES
  ('wps', 'wps-boise',      'WPS Boise',       'Boise',       'ID', 'US'),
  ('wps', 'wps-memphis',    'WPS Memphis',      'Memphis',     'TN', 'US'),
  ('wps', 'wps-reno',       'WPS Reno',         'Reno',        'NV', 'US'),
  ('wps', 'wps-orlando',    'WPS Orlando',      'Orlando',     'FL', 'US'),
  ('wps', 'wps-harrisburg', 'WPS Harrisburg',   'Harrisburg',  'PA', 'US')
ON CONFLICT (vendor_code, warehouse_id) DO NOTHING;

-- ── Seed PU warehouses ────────────────────────────────────────────────────────
INSERT INTO public.routing_warehouses (vendor_code, warehouse_id, name, city, state, country)
VALUES
  ('pu', 'pu-wi', 'PU Wisconsin',      'Janesville',    'WI', 'US'),
  ('pu', 'pu-ny', 'PU New York',       'Syosset',       'NY', 'US'),
  ('pu', 'pu-tx', 'PU Texas',          'Dallas',        'TX', 'US'),
  ('pu', 'pu-nv', 'PU Nevada',         'Reno',          'NV', 'US'),
  ('pu', 'pu-nc', 'PU North Carolina', 'Concord',       'NC', 'US')
ON CONFLICT (vendor_code, warehouse_id) DO NOTHING;

-- ── Seed default shipping rules ───────────────────────────────────────────────
INSERT INTO public.routing_shipping_rules
  (vendor_code, warehouse_id, carrier, service_level, min_days, max_days, base_rate, per_lb_rate)
VALUES
  ('wps', NULL, 'UPS', 'Ground',       3, 7, 0.00, 0.50),
  ('wps', NULL, 'UPS', '2nd Day Air',  2, 2, 0.00, 1.25),
  ('wps', NULL, 'UPS', 'Next Day Air', 1, 1, 0.00, 2.50),
  ('pu',  NULL, 'UPS', 'Ground',       3, 7, 0.00, 0.50),
  ('pu',  NULL, 'FedEx', '2Day',       2, 2, 0.00, 1.25),
  ('pu',  NULL, 'FedEx', 'Overnight',  1, 1, 0.00, 2.50);

-- ── Core routing function ─────────────────────────────────────────────────────
-- Returns best vendor for a given product based on strategy
-- strategy: 'cheapest' | 'fastest'
CREATE OR REPLACE FUNCTION public.route_product(
  p_catalog_product_id INTEGER,
  p_strategy           TEXT DEFAULT 'cheapest'
)
RETURNS TABLE (
  vendor_code      TEXT,
  warehouse_id     TEXT,
  wholesale_cost   NUMERIC,
  drop_ship_fee    NUMERIC,
  total_cost       NUMERIC,
  estimated_days   INTEGER
) AS $$
BEGIN
  IF p_strategy = 'cheapest' THEN
    RETURN QUERY
      SELECT
        vo.vendor_code,
        'default'::TEXT AS warehouse_id,
        vo.wholesale_cost,
        vo.drop_ship_fee,
        COALESCE(vo.wholesale_cost, 0) + COALESCE(vo.drop_ship_fee, 0) AS total_cost,
        7 AS estimated_days
      FROM public.vendor_offers vo
      WHERE vo.catalog_product_id = p_catalog_product_id
        AND vo.is_active = TRUE
        AND vo.wholesale_cost IS NOT NULL
      ORDER BY total_cost ASC
      LIMIT 1;

  ELSIF p_strategy = 'fastest' THEN
    RETURN QUERY
      SELECT
        vo.vendor_code,
        'default'::TEXT AS warehouse_id,
        vo.wholesale_cost,
        vo.drop_ship_fee,
        COALESCE(vo.wholesale_cost, 0) + COALESCE(vo.drop_ship_fee, 0) AS total_cost,
        3 AS estimated_days
      FROM public.vendor_offers vo
      WHERE vo.catalog_product_id = p_catalog_product_id
        AND vo.is_active = TRUE
      ORDER BY vo.drop_ship_fee ASC NULLS LAST
      LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Verify
SELECT
  'routing_warehouses'    AS table_name, COUNT(*) AS rows FROM public.routing_warehouses
UNION ALL
SELECT 'routing_shipping_rules', COUNT(*) FROM public.routing_shipping_rules
UNION ALL
SELECT 'routing_decisions',      COUNT(*) FROM public.routing_decisions;
