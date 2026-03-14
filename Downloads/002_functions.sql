-- ============================================================
-- MIGRATION 002: POSTGRES FUNCTIONS
-- Atomic operations that replace Firestore transactions
-- ============================================================

-- ─── POINTS TRANSACTION (atomic, race-condition proof) ────────
-- Called from workers via supabase.rpc('add_points_transaction', {...})
-- Postgres handles the transaction — no app-level locking needed

CREATE OR REPLACE FUNCTION add_points_transaction(
  p_user_id       UUID,
  p_type          TEXT,
  p_amount        INTEGER,
  p_order_id      UUID    DEFAULT NULL,
  p_product_id    UUID    DEFAULT NULL,
  p_reason        TEXT    DEFAULT NULL,
  p_admin_user_id UUID    DEFAULT NULL,
  p_expires_at    TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as superuser so workers can bypass RLS
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance     INTEGER;
BEGIN
  -- Lock the user row to prevent race conditions
  SELECT points_balance INTO v_current_balance
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient points: balance %, attempted deduction %',
      v_current_balance, ABS(p_amount);
  END IF;

  -- Update user balance
  UPDATE user_profiles SET
    points_balance = v_new_balance,
    lifetime_points_earned = CASE
      WHEN p_amount > 0 THEN lifetime_points_earned + p_amount
      ELSE lifetime_points_earned
    END
  WHERE id = p_user_id;

  -- Append ledger entry (insert only — never update)
  INSERT INTO points_ledger (
    user_id, type, amount, balance_after,
    order_id, product_id, reason, admin_user_id, expires_at
  ) VALUES (
    p_user_id, p_type, p_amount, v_new_balance,
    p_order_id, p_product_id, p_reason, p_admin_user_id, p_expires_at
  );

  RETURN jsonb_build_object(
    'success',        TRUE,
    'points_added',   p_amount,
    'new_balance',    v_new_balance,
    'prev_balance',   v_current_balance
  );
END;
$$;

-- ─── ORDER STATS UPDATE (called after order status changes) ───

CREATE OR REPLACE FUNCTION update_user_order_stats(
  p_user_id   UUID,
  p_order_total NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles SET
    lifetime_spend = lifetime_spend + p_order_total,
    order_count    = order_count + 1,
    last_order_at  = NOW()
  WHERE id = p_user_id;
END;
$$;

-- ─── FITMENT CHECK (fast lookup) ──────────────────────────────
-- Returns TRUE if a product fits a given vehicle

CREATE OR REPLACE FUNCTION product_fits_vehicle(
  p_product_id UUID,
  p_vehicle_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE  -- result won't change within a transaction
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fitment
    WHERE product_id = p_product_id
    AND vehicle_id = p_vehicle_id
  )
  OR EXISTS (
    SELECT 1 FROM products
    WHERE id = p_product_id AND is_universal = TRUE
  );
$$;

-- ─── MAP PRICE CALCULATION (used in checkout) ─────────────────
-- Returns the effective MAP floor for a product (highest across vendors)

CREATE OR REPLACE FUNCTION get_effective_map(p_product_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(map_price), 0)
  FROM vendor_products
  WHERE product_id = p_product_id;
$$;

-- ─── CALCULATE FINAL PRICE (MAP-enforced) ─────────────────────

CREATE OR REPLACE FUNCTION calculate_final_price(
  p_product_id      UUID,
  p_points_to_redeem INTEGER DEFAULT 0,
  p_redeem_rate      NUMERIC DEFAULT 100  -- 100 pts = $1
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_our_price     NUMERIC;
  v_map_floor     NUMERIC;
  v_points_value  NUMERIC;
  v_max_discount  NUMERIC;
  v_actual_discount NUMERIC;
  v_final_price   NUMERIC;
BEGIN
  SELECT our_price, map_floor
  INTO v_our_price, v_map_floor
  FROM products
  WHERE id = p_product_id;

  -- Points discount can never reduce price below MAP
  v_points_value  := p_points_to_redeem / p_redeem_rate;
  v_max_discount  := GREATEST(v_our_price - v_map_floor, 0);
  v_actual_discount := LEAST(v_points_value, v_max_discount);
  v_final_price   := GREATEST(v_our_price - v_actual_discount, v_map_floor);

  RETURN jsonb_build_object(
    'our_price',        v_our_price,
    'map_floor',        v_map_floor,
    'points_discount',  v_actual_discount,
    'final_price',      v_final_price,
    'is_at_map',        v_final_price <= v_map_floor + 0.001
  );
END;
$$;

-- ─── ABANDONED CART QUERY (used by worker) ────────────────────
-- Returns carts ready for each abandonment email sequence

CREATE OR REPLACE FUNCTION get_carts_for_abandonment(
  p_sequence    INTEGER,   -- 1, 2, or 3
  p_hours_min   NUMERIC,   -- minimum hours since last activity
  p_hours_max   NUMERIC    -- maximum hours since last activity  
)
RETURNS TABLE (
  cart_id         UUID,
  user_id         UUID,
  guest_email     TEXT,
  total           NUMERIC,
  emails_sent     SMALLINT,
  last_activity   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.user_id,
    COALESCE(up.email, c.guest_email) AS guest_email,
    c.total,
    c.abandonment_emails_sent,
    c.last_activity_at
  FROM carts c
  LEFT JOIN user_profiles up ON up.id = c.user_id
  WHERE c.status = 'active'
    AND c.total > 0
    AND c.abandonment_emails_sent = p_sequence - 1
    AND c.last_activity_at < NOW() - (p_hours_min || ' hours')::INTERVAL
    AND c.last_activity_at > NOW() - (p_hours_max || ' hours')::INTERVAL
    AND (up.email IS NOT NULL OR c.guest_email IS NOT NULL)
  ORDER BY c.last_activity_at ASC
  LIMIT 500;  -- process in batches
$$;
