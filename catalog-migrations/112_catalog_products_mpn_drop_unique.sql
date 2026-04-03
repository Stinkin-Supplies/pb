-- Manufacturer part numbers are not globally unique: different vendor SKUs can share
-- the same MPN (supersessions, kits, multi-pack). Identity remains `sku`.
ALTER TABLE public.catalog_products
  DROP CONSTRAINT IF EXISTS catalog_products_mpn_key;

-- In case uniqueness was implemented as a named unique index instead
DROP INDEX IF EXISTS public.catalog_products_mpn_key;

CREATE INDEX IF NOT EXISTS idx_catalog_products_manufacturer_part_number
  ON public.catalog_products (manufacturer_part_number)
  WHERE manufacturer_part_number IS NOT NULL AND btrim(manufacturer_part_number) <> '';
