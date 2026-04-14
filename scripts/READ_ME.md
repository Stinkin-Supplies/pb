# Stinkin Supplies - Database Schema Reference

**Database:** `stinkin_catalog`  
**Host:** `5.161.100.126:5432`  
**User:** `catalog_app`  
**Last Updated:** 2025-04-07

---

## 📦 CORE CATALOG TABLES (13)

### **catalog_products**
Main product catalog table. Primary source of truth for all products.

**Key Columns:**
- `id` (PK) - Integer primary key
- `sku` - Unique product SKU
- `name` - Product name
- `description` - Product description (TEXT)
- `brand` - Brand name
- `category` - Product category
- `price` - Retail price (NUMERIC)
- `cost` - Wholesale cost (NUMERIC)
- `weight` - Product weight (NUMERIC)
- `dimensions` - L×W×H dimensions (JSONB)
- `stock_quantity` - Current stock level (INTEGER)
- `manufacturer_part_number` - MPN (TEXT)
- `vendor_codes` - Supplier reference codes (ARRAY)
- `map_price` - Minimum Advertised Price (NUMERIC)
- `msrp` - Manufacturer Suggested Retail Price (NUMERIC)
- `status` - Product status (TEXT)
- `product_type` - WPS product_type category (TEXT)
- `unit_of_measurement` - UOM (TEXT)
- `is_active` - Active flag (BOOLEAN)
- `created_at`, `updated_at` - Timestamps

**Notes:**
- WPS SKUs start with `0`
- Parts Unlimited SKUs don't start with `0`

---

### **catalog_media**
Product images and media files. Replaces deprecated `catalog_images`.

**Key Columns:**
- `id` (PK)
- `product_id` (FK → catalog_products.id)
- `media_type` - 'image', 'video', etc.
- `url` - Full image URL
- `is_primary` - Primary image flag
- `sort_order` - Display order

**Notes:**
- ✅ **USE THIS TABLE** for images
- ❌ `catalog_images` is deprecated/old

---

### **catalog_images** ❌ DEPRECATED
Old image table. Do NOT use. All new code should use `catalog_media`.

---

### **catalog_brands**
Brand/manufacturer information.

**Usage:**
- Brand listings page
- Brand filter in shop
- Brand logos/assets

---

### **catalog_categories**
Product category hierarchy.

**Usage:**
- Category navigation
- Category filters
- SEO/breadcrumbs

---

### **catalog_fitment**
ACES vehicle fitment data (Year/Make/Model/Submodel compatibility).

**Usage:**
- "Fits your vehicle" badge
- Garage/vehicle selector
- Fitment filters

**Status:** 
- ⚠️ Schema exists, data not yet imported
- 📋 See: STEP3_PU_ACES_XML_GUIDE.md for import process

---

### **catalog_inventory**
Real-time inventory levels per warehouse/location.

**Usage:**
- Stock availability
- Multi-warehouse routing
- Backorder tracking

---

### **catalog_prices**
Tiered pricing rules (wholesale, retail, member, etc.).

**Usage:**
- Customer-specific pricing
- Volume discounts
- Promotional pricing

---

### **catalog_specs**
Product specifications (technical details).

**Columns:**
- `product_id` (FK)
- `spec_key` - Attribute name (e.g., "Thread Size")
- `spec_value` - Value (e.g., "M8 × 1.25")

**Usage:**
- Specs table on product detail page
- Search/filter by specs

---

### **catalog_attributes**
Product attributes/properties (structured data).

**Usage:**
- Faceted search
- Advanced filters
- Product comparison

---

### **catalog_variants**
Product variations (size, color, etc.).

**Example:**
- Parent: "T-Shirt"
- Variants: Small/Medium/Large, Red/Blue/Black

---

### **catalog_reviews**
Customer product reviews and ratings.

**Status:** Not yet implemented

---

### **catalog_allowlist**
Product access control (which customers can see which products).

**Usage:**
- B2B customer restrictions
- Dealer-only products

---

## 🔄 RAW VENDOR DATA TABLES (6)

### **raw_vendor_wps_products**
WPS product master data (imported from master_item_wps.csv).

**Usage:**
- Source of truth for WPS product data
- Reference for re-imports
- Category mapping

---

### **raw_vendor_wps_inventory**
WPS real-time inventory feed.

**Usage:**
- Stock level updates
- Availability sync

---

### **raw_vendor_wps_vehicles**
WPS vehicle fitment data.

**Status:** Exists but may not be actively used

---

### **raw_vendor_pu**
Parts Unlimited product master data.

**Usage:**
- PU product imports
- Price/availability sync

---

### **raw_vendor_aces**
ACES XML fitment data (Year/Make/Model compatibility).

**Status:** 
- ⚠️ Table exists, data not yet imported
- 📋 See: STEP3_PU_ACES_XML_GUIDE.md

---

### **raw_vendor_pies**
PIES XML product data standard.

**Status:** May be unused

---

## 🚚 ROUTING & FULFILLMENT TABLES (4)

### **routing_warehouses**
Warehouse locations and capabilities.

**Usage:**
- Multi-warehouse inventory
- Shipping cost calculation

---

### **routing_shipping_rules**
Shipping method rules and costs.

**Usage:**
- Shipping calculator
- Free shipping thresholds

---

### **routing_decisions**
Order routing logic (which warehouse fulfills which order).

**Usage:**
- Split shipments
- Closest warehouse routing

---

### **vendor_offers**
Vendor-specific pricing and availability.

**Usage:**
- Multi-vendor comparison
- Best price selection

---

## 💰 PRICING & BUSINESS LOGIC TABLES (2)

### **pricing_rules**
Dynamic pricing rules (margins, markup, promotions).

**Usage:**
- Automated pricing
- Promotional pricing
- Margin protection

---

### **map_audit_log**
MAP (Minimum Advertised Price) compliance tracking.

**Usage:**
- MAP violation monitoring
- Audit trail for pricing changes

---

## 📊 SYSTEM & UTILITY TABLES (2)

### **sync_log**
Vendor sync operation logs.

**Usage:**
- Track import/sync jobs
- Error logging
- Sync history

---

### **products_search**
Materialized view or search index for product search.

**Status:** 
- ⚠️ May be replaced by Typesense
- Verify if still in use

---

## 🔑 TABLE RELATIONSHIPS

```
catalog_products (parent)
  ├── catalog_media (1:many) - images
  ├── catalog_specs (1:many) - specifications
  ├── catalog_variants (1:many) - size/color variants
  ├── catalog_fitment (1:many) - vehicle compatibility
  ├── catalog_inventory (1:many) - stock by location
  ├── catalog_prices (1:many) - tiered pricing
  ├── catalog_reviews (1:many) - customer reviews
  └── catalog_attributes (1:many) - properties

catalog_brands (reference)
  └── catalog_products.brand (lookup)

catalog_categories (reference)
  └── catalog_products.category (lookup)
```

---

## 📝 IMPORTANT NOTES

### **Image Storage:**
- ✅ **USE:** `catalog_media` (current)
- ❌ **AVOID:** `catalog_images` (deprecated)

### **WPS SKU Identification:**
- WPS SKUs start with `0` (e.g., `020-00010`)
- Use `WHERE sku LIKE '0%'` to filter WPS products

### **Harddrive Catalog Filter:**
- Only import WPS products where `harddrive_catalog = "yes"`
- Current count: ~22,056 products

### **Category Mapping:**
- WPS: Use `product_type` column from master CSV
- PU: TBD (need to check PU master data)

### **Fitment Data:**
- Schema exists (`catalog_fitment`)
- Data not yet imported
- See: `STEP3_PU_ACES_XML_GUIDE.md`

---

## 🔧 SCHEMA VERIFICATION COMMANDS

```sql
-- List all tables
\dt

-- Check specific table structure
\d catalog_products
\d catalog_media
\d catalog_fitment

-- Count products by source
SELECT 
  CASE WHEN sku LIKE '0%' THEN 'WPS' ELSE 'Other' END as source,
  COUNT(*)
FROM catalog_products
WHERE is_active = true
GROUP BY source;

-- Check image storage
SELECT COUNT(*) FROM catalog_media WHERE media_type = 'image';
SELECT COUNT(*) FROM catalog_images; -- Should be 0 or deprecated

-- Verify categories
SELECT category, COUNT(*) 
FROM catalog_products 
WHERE is_active = true 
GROUP BY category 
ORDER BY COUNT(*) DESC 
LIMIT 20;
```

---

## 🚀 MIGRATION CHECKLIST

- [x] catalog_products schema verified
- [x] catalog_media in use (not catalog_images)
- [x] WPS categories updated from product_type
- [ ] catalog_fitment data imported (ACES XML)
- [ ] Parts Unlimited categories mapped
- [ ] Prop 65 fields added to catalog_products
- [ ] Product features field added
- [ ] UPC field verified/added

---

*Last verified: 2025-04-07*  
*Database: stinkin_catalog @ 5.161.100.126:5432*
