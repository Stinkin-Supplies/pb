-- 012_catalog_prices.sql
-- Price history tracking

CREATE TABLE IF NOT EXISTS catalog_prices (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Ensure no overlapping price ranges
CREATE UNIQUE INDEX idx_unique_price_period
ON catalog_prices(product_id, start_date);