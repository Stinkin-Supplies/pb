-- 027_pu_pricefile_staging.sql
-- PU price-file processing area before merging into vendor.vendor_products

SET search_path TO vendor;

CREATE TABLE IF NOT EXISTS pu_pricefile_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    mfr_sku TEXT NOT NULL,
    sku TEXT,
    name TEXT,
    slug TEXT,
    description_raw TEXT,
    brand TEXT,
    categories_raw JSONB,
    attributes_raw JSONB,

    best_price NUMERIC(10,2),
    msrp NUMERIC(10,2),
    total_qty INTEGER DEFAULT 0,
    in_stock SMALLINT DEFAULT 0,

    hazardous_code TEXT,
    no_ship_ca BOOLEAN DEFAULT FALSE,
    is_atv BOOLEAN DEFAULT FALSE,
    is_street BOOLEAN DEFAULT FALSE,
    is_snow BOOLEAN DEFAULT FALSE,
    is_offroad BOOLEAN DEFAULT FALSE,
    is_watercraft BOOLEAN DEFAULT FALSE,

    weight_lbs NUMERIC(10,2),
    dropship_fee_pu NUMERIC(10,2),

    source_file TEXT,
    source_row JSONB NOT NULL,

    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (mfr_sku)
);

CREATE INDEX IF NOT EXISTS pu_pricefile_staging_in_stock_idx
    ON pu_pricefile_staging (in_stock);

CREATE INDEX IF NOT EXISTS pu_pricefile_staging_imported_at_idx
    ON pu_pricefile_staging (imported_at DESC);
