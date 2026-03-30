-- ─────────────────────────────────────────────────────────────────────────────
-- 017: Ensure unique constraint on vendor_part_number for ON CONFLICT to work
-- Safe to run even if constraint already exists
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendor_products_vendor_part_number_key'
      AND conrelid = 'vendor.vendor_products'::regclass
  ) THEN
    ALTER TABLE vendor.vendor_products
      ADD CONSTRAINT vendor_products_vendor_part_number_key
      UNIQUE (vendor_part_number);
    RAISE NOTICE 'Unique constraint added on vendor_part_number';
  ELSE
    RAISE NOTICE 'Unique constraint already exists — skipping';
  END IF;
END $$;

-- Verify constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'vendor.vendor_products'::regclass
ORDER BY conname;