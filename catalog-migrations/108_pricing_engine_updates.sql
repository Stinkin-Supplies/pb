ALTER TABLE vendor_offers ADD COLUMN our_price NUMERIC;
ALTER TABLE vendor_offers ADD COLUMN map_price NUMERIC;
ALTER TABLE vendor_offers ADD COLUMN computed_at TIMESTAMP;
ALTER TABLE catalog_products ADD COLUMN computed_price NUMERIC;
