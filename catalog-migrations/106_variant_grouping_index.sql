CREATE INDEX idx_catalog_variants_product ON catalog_variants(product_id);
CREATE INDEX idx_catalog_variants_option ON catalog_variants(option_name, option_value);
