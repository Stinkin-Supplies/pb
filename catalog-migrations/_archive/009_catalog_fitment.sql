-- 009_catalog_fitment.sql
-- Unified ACES/PIES fitment schema

CREATE TABLE IF NOT EXISTS catalog_fitment (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year_start INT NOT NULL,
    year_end INT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional index for quicker fitment lookup
CREATE INDEX idx_fitment_lookup
ON catalog_fitment(make, model, year_start, year_end);
