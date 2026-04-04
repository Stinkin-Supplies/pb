-- 003_vendor_inventory_tables.sql
-- Inventory per vendor, per warehouse, per SKU

SET search_path TO vendor;

-- =============================
-- vendor_inventory
-- Tracks stock per vendor SKU per warehouse
-- =============================
CREATE TABLE vendor_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_product_id UUID NOT NULL REFERENCES vendor_products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES vendor_warehouses(id) ON DELETE CASCADE,

    stock_quantity INTEGER,
    backorder_eta TEXT,

    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX vendor_inventory_product_idx 
    ON vendor_inventory (vendor_product_id);

CREATE INDEX vendor_inventory_warehouse_idx 
    ON vendor_inventory (warehouse_id);

CREATE INDEX vendor_inventory_stock_idx 
    ON vendor_inventory (stock_quantity);
    