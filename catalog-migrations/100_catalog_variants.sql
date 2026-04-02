CREATE TABLE catalog_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES catalog_products(id) ON DELETE CASCADE,
  option_name TEXT NOT NULL,
  option_value TEXT NOT NULL
);
