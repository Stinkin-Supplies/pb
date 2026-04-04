-- 010_catalog_categories.sql
-- Hierarchical category structure

CREATE TABLE IF NOT EXISTS catalog_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id INT REFERENCES catalog_categories(id) ON DELETE SET NULL,
    slug VARCHAR(150) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Optional: index for fast slug lookup
CREATE INDEX idx_categories_slug ON catalog_categories(slug);