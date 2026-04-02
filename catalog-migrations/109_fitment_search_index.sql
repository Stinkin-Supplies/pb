CREATE INDEX idx_fitment_product ON catalog_fitment(product_id);
CREATE INDEX idx_fitment_make_model ON catalog_fitment(make, model);
CREATE INDEX idx_fitment_year ON catalog_fitment(year_start, year_end);
