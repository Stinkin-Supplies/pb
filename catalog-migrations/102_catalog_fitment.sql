CREATE TABLE catalog_fitment (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  make TEXT,
  model TEXT,
  year_start INTEGER,
  year_end INTEGER
);
