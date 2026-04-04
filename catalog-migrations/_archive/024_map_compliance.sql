-- ─────────────────────────────────────────────────────────────────────────────
-- 024: Phase 3.2 — MAP Compliance audit function + log table
-- Run after 023_pricing_function.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- MAP audit log table
CREATE TABLE IF NOT EXISTS public.map_audit_log (
  id                 SERIAL PRIMARY KEY,
  catalog_product_id INTEGER REFERENCES public.catalog_products(id),
  sku                TEXT,
  brand              TEXT,
  map_price          NUMERIC,
  computed_price     NUMERIC,
  violation_amount   NUMERIC,
  vendor_code        TEXT,
  status             TEXT DEFAULT 'violation',
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_audit_log_product
  ON public.map_audit_log (catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_map_audit_log_created
  ON public.map_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_map_audit_log_status
  ON public.map_audit_log (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Daily MAP audit function
-- Finds all products priced below MAP and logs them
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_map_audit()
RETURNS TABLE (
  violations       INTEGER,
  total_checked    INTEGER,
  compliance_pct   NUMERIC
) AS $$
DECLARE
  v_violations    INTEGER := 0;
  v_total         INTEGER := 0;
BEGIN
  -- Count total products with MAP prices
  SELECT COUNT(*) INTO v_total
  FROM public.catalog_products
  WHERE map_price IS NOT NULL AND map_price > 0 AND is_active = TRUE;

  -- Log violations (price below MAP)
  INSERT INTO public.map_audit_log (
    catalog_product_id, sku, brand,
    map_price, computed_price, violation_amount,
    vendor_code, status, created_at
  )
  SELECT
    cp.id,
    cp.sku,
    cp.brand,
    cp.map_price,
    COALESCE(cp.computed_price, cp.price),
    cp.map_price - COALESCE(cp.computed_price, cp.price),
    cp.source_vendor,
    'violation',
    NOW()
  FROM public.catalog_products cp
  WHERE cp.map_price IS NOT NULL
    AND cp.map_price > 0
    AND cp.is_active = TRUE
    AND COALESCE(cp.computed_price, cp.price) IS NOT NULL
    AND COALESCE(cp.computed_price, cp.price) < cp.map_price;

  GET DIAGNOSTICS v_violations = ROW_COUNT;

  RETURN QUERY SELECT
    v_violations,
    v_total,
    CASE WHEN v_total > 0
      THEN ROUND((1 - v_violations::NUMERIC / v_total) * 100, 2)
      ELSE 100.00
    END;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- MAP audit summary view (for admin dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.map_audit_summary AS
SELECT
  DATE_TRUNC('day', created_at)    AS audit_date,
  COUNT(*)                          AS total_violations,
  COUNT(DISTINCT catalog_product_id) AS unique_products,
  ROUND(AVG(violation_amount), 2)   AS avg_violation_amount,
  ROUND(MAX(violation_amount), 2)   AS max_violation_amount,
  ROUND(SUM(violation_amount), 2)   AS total_violation_amount,
  vendor_code
FROM public.map_audit_log
WHERE status = 'violation'
GROUP BY DATE_TRUNC('day', created_at), vendor_code
ORDER BY audit_date DESC, total_violations DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-correct function: set price = MAP for all violating products
-- Run manually or via admin panel
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fix_map_violations()
RETURNS INTEGER AS $$
DECLARE
  v_fixed INTEGER;
BEGIN
  UPDATE public.catalog_products
  SET
    computed_price = map_price,
    price          = map_price,
    updated_at     = NOW()
  WHERE map_price IS NOT NULL
    AND map_price > 0
    AND is_active = TRUE
    AND COALESCE(computed_price, price) < map_price;

  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  -- Mark violations as resolved
  UPDATE public.map_audit_log
  SET status = 'resolved', resolved_at = NOW()
  WHERE status = 'violation';

  RETURN v_fixed;
END;
$$ LANGUAGE plpgsql;

-- Verify everything was created
SELECT
  routine_name AS name,
  routine_type AS type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('run_map_audit', 'fix_map_violations', 'calculate_price', 'run_nightly_pricing')
UNION ALL
SELECT table_name, 'TABLE'
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('map_audit_log', 'pricing_rules')
UNION ALL
SELECT table_name, 'VIEW'
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'map_audit_summary'
ORDER BY type, name;
