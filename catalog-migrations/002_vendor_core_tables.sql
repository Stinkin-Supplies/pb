-- 002_vendor_core_tables.sql
-- Base vendor product + warehouse definitions (shared structure for WPS, PU, future vendors)

SET search_path TO vendor;

-- =============================
-- vendor_products
-- One row per vendor-supplied SKU
-- =============================
CREATE TABLE vendor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_code TEXT NOT NULL,               -- 'wps', 'pu', etc
    vendor_part_number TEXT NOT NULL,        -- vendor's SKU
    manufacturer_part_number TEXT NOT NULL,  -- canonical identity
    your_part_number TEXT,                   -- optional later

    title TEXT,
    description_raw TEXT,
    brand TEXT,
    categories_raw JSONB,                    -- vendor's category tree
    attributes_raw JSONB,                    -- raw specs

    msrp NUMERIC(10,2),
    map_price NUMERIC(10,2),
    wholesale_cost NUMERIC(10,2),

    vendor_fees JSONB,                       -- per-vendor fee data
    drop_ship_fee NUMERIC(10,2),

    images_raw JSONB,                        -- array of URLs
    fitment_raw JSONB,                       -- raw ACES/PIES or other

    weight NUMERIC(10,2),
    length NUMERIC(10,2),
    width NUMERIC(10,2),
    height NUMERIC(10,2),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX vendor_products_vendor_code_idx 
    ON vendor_products (vendor_code);

CREATE INDEX vendor_products_mpn_idx 
    ON vendor_products (manufacturer_part_number);

CREATE INDEX vendor_products_vendor_part_idx 
    ON vendor_products (vendor_part_number);

-- =============================
-- vendor_warehouses
-- Each vendor can have many warehouses
-- =============================
CREATE TABLE vendor_warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_code TEXT NOT NULL,
    warehouse_code TEXT NOT NULL,    -- vendor's code
    name TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,

    shipping_zone TEXT,
    shipping_rules JSONB,            -- vendor-defined rules

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX vendor_warehouses_vendor_idx 
    ON vendor_warehouses (vendor_code);
    