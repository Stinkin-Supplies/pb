-- 014_catalog_attributes.sql
-- Product attributes (e.g., color, size)

CREATE TABLE IF NOT EXISTS catalog_attributes (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    attribute_name VARCHAR(100) NOT NULL,
    attribute_value VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional index for fast lookup by attribute
CREATE INDEX idx_attributes_name_value
ON catalog_attributes(attribute_name, attribute_value);