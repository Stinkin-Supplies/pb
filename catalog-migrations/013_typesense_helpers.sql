-- 013_catalog_inventory.sql
-- Inventory tracking by location

CREATE TABLE IF NOT EXISTS catalog_inventory (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    location VARCHAR(100),
    quantity INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Optional index for faster inventory queries
CREATE INDEX idx_inventory_product ON catalog_inventory(product_id);