-- Per-warehouse stock from PU / WPS feeds (normalize_pu.js, normalize_wps.js)
ALTER TABLE public.vendor_offers
  ADD COLUMN IF NOT EXISTS warehouse_json JSONB;

COMMENT ON COLUMN public.vendor_offers.warehouse_json IS
  'Vendor stock by warehouse code (e.g. wi, ny, tx, nv, nc); mirrors CSV/API fields.';
