-- ============================================================================
-- Migration 112: WPS Fitment Staging + Fitment Deduping
-- Run on the catalog DB (Hetzner Postgres).
-- ============================================================================

-- Raw WPS Vehicles staging (JSON:API responses from /vehicles?include=...)
CREATE TABLE IF NOT EXISTS public.raw_vendor_wps_vehicles (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  source_file TEXT UNIQUE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_vendor_wps_vehicles_imported_at
  ON public.raw_vendor_wps_vehicles(imported_at);

-- Prevent duplicate fitment rows from re-runs.
-- (catalog_fitment columns are nullable, so use a partial unique index.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_catalog_fitment_row
  ON public.catalog_fitment(product_id, make, model, year_start, year_end)
  WHERE make IS NOT NULL
    AND model IS NOT NULL
    AND year_start IS NOT NULL
    AND year_end IS NOT NULL;

