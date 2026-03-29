-- 005_vendor_categories.sql
-- Stores vendor-defined category mappings (raw + processed)

SET search_path TO vendor;

CREATE TABLE vendor_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_code TEXT NOT NULL,         -- 'wps', 'pu'
    vendor_category_id TEXT NOT NULL,  -- vendor’s category ID
    parent_category_id TEXT,           -- null for root categories

    name TEXT NOT NULL,                -- vendor’s label
    full_path TEXT,                    -- "Brakes > Pads > Front"
    metadata JSONB,                    -- any extra info vendor supplies

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX vendor_categories_vendor_idx
    ON vendor_categories (vendor_code);

CREATE INDEX vendor_categories_parent_idx
    ON vendor_categories (parent_category_id);
    