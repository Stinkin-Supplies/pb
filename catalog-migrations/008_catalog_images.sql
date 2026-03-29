-- 008_catalog_images.sql
-- Normalized image handling

CREATE TABLE IF NOT EXISTS catalog_images (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt_text TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Ensure one primary image per product
CREATE UNIQUE INDEX idx_primary_image_per_product
ON catalog_images(product_id)
WHERE is_primary = TRUE;
