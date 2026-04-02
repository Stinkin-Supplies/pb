CREATE TABLE catalog_media (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image',
  priority INTEGER DEFAULT 0
);
