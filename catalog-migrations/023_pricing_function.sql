-- ─────────────────────────────────────────────────────────────────────────────
-- 023: Phase 3 — Pricing engine function + nightly price calculation
-- Run after Phase 2 is complete
-- ─────────────────────────────────────────────────────────────────────────────

-- Add pricing_rule_id to catalog_products
ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS pricing_rule_id  INTEGER REFERENCES public.pricing_rules(id),
  ADD COLUMN IF NOT EXISTS computed_price   NUMERIC,
  ADD COLUMN IF NOT EXISTS margin_percent   NUMERIC,
  ADD COLUMN IF NOT EXISTS last_priced_at   TIMESTAMPTZ;

-- Add pricing_rule_id to vendor_offers
ALTER TABLE public.vendor_offers
  ADD COLUMN IF NOT EXISTS pricing_rule_id  INTEGER REFERENCES public.pricing_rules(id),
  ADD COLUMN IF NOT EXISTS computed_price   NUMERIC,
  ADD COLUMN IF NOT EXISTS margin_percent   NUMERIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Core pricing function
-- Logic:
--   1. If MAP price exists → sell at MAP (MAP-protected)
--   2. If no MAP but MSRP exists → sell at MSRP * (1 - markdown)
--   3. If only cost exists → sell at cost * (1 + markup) ensuring min_margin
--   4. Never sell below cost
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_price(
  p_cost            NUMERIC,
  p_map_price       NUMERIC,
  p_msrp            NUMERIC,
  p_formula_type    TEXT    DEFAULT 'map_protected',
  p_markup_percent  NUMERIC DEFAULT 0,
  p_markdown_percent NUMERIC DEFAULT 0,
  p_min_margin      NUMERIC DEFAULT 0.15
)
RETURNS NUMERIC AS $$
DECLARE
  v_price    NUMERIC;
  v_min_sell NUMERIC;
BEGIN
  -- Minimum sell price to maintain margin (if cost known)
  IF p_cost IS NOT NULL AND p_cost > 0 THEN
    v_min_sell := p_cost / (1 - p_min_margin);
  ELSE
    v_min_sell := NULL;
  END IF;

  -- MAP-protected formula
  IF p_formula_type = 'map_protected' THEN
    IF p_map_price IS NOT NULL AND p_map_price > 0 THEN
      v_price := p_map_price;
    ELSIF p_msrp IS NOT NULL AND p_msrp > 0 THEN
      v_price := p_msrp * (1 - COALESCE(p_markdown_percent, 0) / 100);
    ELSIF p_cost IS NOT NULL AND p_cost > 0 THEN
      v_price := p_cost * (1 + COALESCE(p_markup_percent, 0) / 100 + p_min_margin);
    ELSE
      RETURN NULL;
    END IF;

  -- Markup formula (cost + markup)
  ELSIF p_formula_type = 'markup' THEN
    IF p_cost IS NOT NULL AND p_cost > 0 THEN
      v_price := p_cost * (1 + COALESCE(p_markup_percent, 0) / 100);
    ELSE
      RETURN NULL;
    END IF;

  -- Markdown formula (MSRP - markdown)
  ELSIF p_formula_type = 'markdown' THEN
    IF p_msrp IS NOT NULL AND p_msrp > 0 THEN
      v_price := p_msrp * (1 - COALESCE(p_markdown_percent, 0) / 100);
    ELSE
      RETURN NULL;
    END IF;

  ELSE
    RETURN NULL;
  END IF;

  -- Never sell below minimum margin
  IF v_min_sell IS NOT NULL AND v_price < v_min_sell THEN
    v_price := v_min_sell;
  END IF;

  -- Never sell below cost
  IF p_cost IS NOT NULL AND v_price < p_cost THEN
    v_price := p_cost;
  END IF;

  -- Round to 2 decimal places
  RETURN ROUND(v_price, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Nightly price calculation procedure
-- Updates computed_price + margin_percent on every catalog product
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE public.run_nightly_pricing()
LANGUAGE plpgsql AS $$
DECLARE
  v_updated INTEGER := 0;
  v_rule    RECORD;
BEGIN
  -- Load default rule
  SELECT * INTO v_rule FROM public.pricing_rules WHERE is_default = TRUE LIMIT 1;

  UPDATE public.catalog_products cp
  SET
    computed_price = public.calculate_price(
      cp.cost,
      cp.map_price,
      cp.msrp,
      COALESCE(pr.formula_type,    v_rule.formula_type),
      COALESCE(pr.markup_percent,  v_rule.markup_percent),
      COALESCE(pr.markdown_percent,v_rule.markdown_percent),
      COALESCE(pr.min_margin,      v_rule.min_margin)
    ),
    margin_percent = CASE
      WHEN cp.cost IS NOT NULL AND cp.cost > 0 AND
           public.calculate_price(cp.cost, cp.map_price, cp.msrp,
             COALESCE(pr.formula_type, v_rule.formula_type),
             COALESCE(pr.markup_percent, v_rule.markup_percent),
             COALESCE(pr.markdown_percent, v_rule.markdown_percent),
             COALESCE(pr.min_margin, v_rule.min_margin)) IS NOT NULL
      THEN ROUND(
        (public.calculate_price(cp.cost, cp.map_price, cp.msrp,
           COALESCE(pr.formula_type, v_rule.formula_type),
           COALESCE(pr.markup_percent, v_rule.markup_percent),
           COALESCE(pr.markdown_percent, v_rule.markdown_percent),
           COALESCE(pr.min_margin, v_rule.min_margin)) - cp.cost)
        / NULLIF(public.calculate_price(cp.cost, cp.map_price, cp.msrp,
           COALESCE(pr.formula_type, v_rule.formula_type),
           COALESCE(pr.markup_percent, v_rule.markup_percent),
           COALESCE(pr.markdown_percent, v_rule.markdown_percent),
           COALESCE(pr.min_margin, v_rule.min_margin)), 0) * 100, 2)
      ELSE NULL
    END,
    pricing_rule_id = COALESCE(cp.pricing_rule_id, v_rule.id),
    last_priced_at  = NOW(),
    updated_at      = NOW()
  FROM public.pricing_rules pr
  WHERE pr.id = cp.pricing_rule_id
     OR (cp.pricing_rule_id IS NULL AND pr.id = v_rule.id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Nightly pricing complete — % products updated', v_updated;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test the pricing function with sample values
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'MAP exists'      AS scenario,
  public.calculate_price(50.00, 89.99, 119.99, 'map_protected', 0, 0, 0.15) AS computed_price,
  ROUND((89.99 - 50.00) / 89.99 * 100, 2) AS margin_pct
UNION ALL
SELECT
  'No MAP, has MSRP',
  public.calculate_price(50.00, NULL, 119.99, 'map_protected', 0, 0, 0.15),
  ROUND((119.99 - 50.00) / 119.99 * 100, 2)
UNION ALL
SELECT
  'Cost only',
  public.calculate_price(50.00, NULL, NULL, 'map_protected', 0, 0, 0.15),
  15.00
UNION ALL
SELECT
  'No pricing data',
  public.calculate_price(NULL, NULL, NULL, 'map_protected', 0, 0, 0.15),
  NULL;
