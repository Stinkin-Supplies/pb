-- 007_catalog_core_tables.sql
-- Merged catalog product table for storefront

CREATE TABLE IF NOT EXISTS catalog_products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    brand VARCHAR(100),
    category VARCHAR(100),
    price NUMERIC(10,2) NOT NULL,
    cost NUMERIC(10,2),
    weight NUMERIC(8,3),
    dimensions JSONB, -- {length, width, height}
    stock_quantity INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Optional: index for faster SKU lookup
CREATE INDEX idx_catalog_products_sku ON catalog_products(sku);