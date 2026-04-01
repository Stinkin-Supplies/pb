-- 028_public_vendor_products.sql
-- Create the vendor product table in the current public-only database.
-- This matches the importer expectations and preserves the existing
-- Supabase / PostgREST layout already present in this project.

CREATE TABLE IF NOT EXISTS public.vendor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_code TEXT NOT NULL,
    vendor_item_id TEXT,
    vendor_product_id TEXT,
    vendor_part_number TEXT NOT NULL,
    manufacturer_part_number TEXT NOT NULL,
    your_part_number TEXT,

    title TEXT,
    description_raw TEXT,
    brand TEXT,
    categories_raw JSONB,
    attributes_raw JSONB,

    msrp NUMERIC(10,2),
    map_price NUMERIC(10,2),
    wholesale_cost NUMERIC(10,2),

    vendor_fees JSONB,
    drop_ship_fee NUMERIC(10,2),
    drop_ship_eligible BOOLEAN DEFAULT FALSE,

    images_raw JSONB,
    fitment_raw JSONB,

    weight NUMERIC(10,2),
    length NUMERIC(10,2),
    width NUMERIC(10,2),
    height NUMERIC(10,2),

    upc TEXT,
    superseded_sku TEXT,
    status TEXT,
    status_id INTEGER,
    product_type TEXT,
    unit_of_measurement TEXT,
    has_map_policy BOOLEAN DEFAULT FALSE,
    carb TEXT,
    prop_65_code TEXT,
    prop_65_detail TEXT,
    country_id INTEGER,
    published_at TIMESTAMPTZ,
    vendor_created_at TIMESTAMPTZ,
    vendor_updated_at TIMESTAMPTZ,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vendor_products_vendor_part_number_key'
          AND conrelid = 'public.vendor_products'::regclass
    ) THEN
        ALTER TABLE public.vendor_products
            ADD CONSTRAINT vendor_products_vendor_part_number_key
            UNIQUE (vendor_part_number);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS vendor_products_vendor_code_idx
    ON public.vendor_products (vendor_code);

CREATE INDEX IF NOT EXISTS vendor_products_mpn_idx
    ON public.vendor_products (manufacturer_part_number);

CREATE INDEX IF NOT EXISTS vendor_products_vendor_part_idx
    ON public.vendor_products (vendor_part_number);

CREATE INDEX IF NOT EXISTS vendor_products_status_idx
    ON public.vendor_products (status);

CREATE INDEX IF NOT EXISTS vendor_products_brand_idx
    ON public.vendor_products (brand);
