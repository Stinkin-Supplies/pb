CREATE TABLE raw_vendor_pu (
  id SERIAL PRIMARY KEY,
  payload JSONB,
  source_file TEXT UNIQUE,
  imported_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE raw_vendor_wps_products (
  id SERIAL PRIMARY KEY,
  payload JSONB,
  source_file TEXT UNIQUE,
  imported_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE raw_vendor_wps_inventory (
  id SERIAL PRIMARY KEY,
  payload JSONB,
  source_file TEXT UNIQUE,
  imported_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE raw_vendor_aces (
  id SERIAL PRIMARY KEY,
  payload JSONB,
  source_file TEXT UNIQUE,
  imported_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE raw_vendor_pies (
  id SERIAL PRIMARY KEY,
  payload JSONB,
  source_file TEXT UNIQUE,
  imported_at TIMESTAMP DEFAULT NOW()
);
