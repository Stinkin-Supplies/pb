-- 015_catalog_reviews.sql
-- Customer product reviews

CREATE TABLE IF NOT EXISTS catalog_reviews (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
    customer_id INT,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Optional index for product review lookup
CREATE INDEX idx_reviews_product ON catalog_reviews(product_id);