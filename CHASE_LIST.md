# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 16, 2026

---

## ✅ COMPLETED THIS SESSION (April 16)

| # | Fix | Result |
|---|-----|--------|
| 1 | Deleted 18,450 metric/apparel/non-HD products | 78,072 clean products remain |
| 2 | Added 9,699 orphaned HD products to allowlist | 78,072 in_allowlist, 0 missing |
| 3 | Loaded 61,639 PU dealer prices into catalog_pricing | 87.9% PU pricing coverage |
| 4 | Fixed index_assembly.js INNER JOIN → LEFT JOIN | All products index regardless of images |
| 5 | Reindexed Typesense | **74,119 indexed** (was 12,443), 0 failed |

---

## 🔴 HIGH PRIORITY

### 114,244 WPS products in vendor_products never promoted to catalog
- **What:** vendor.vendor_products has 122,192 WPS rows, catalog_products only has 7,948 WPS
- **Confirmed eligible:** status='STK', drop_ship_eligible=true (exhaust springs, petcock kits, etc.)
- **Investigate:**
  ```sql
  SELECT vp.status, vp.drop_ship_eligible, COUNT(*)
  FROM vendor.vendor_products vp
  LEFT JOIN catalog_products cp ON cp.sku = vp.vendor_part_number
  WHERE vp.vendor_code = 'wps' AND cp.id IS NULL
  GROUP BY vp.status, vp.drop_ship_eligible
  ORDER BY count DESC;
  ```
- **Fix:** Find/rewrite WPS promotion script — filter to HD brands + tires + tools only before promoting
- **Note:** vendor_code is lowercase 'wps' not 'WPS'

### 99,403 PU products in vendor_products never promoted to catalog
- **What:** vendor.vendor_products has 173,741 PU rows, catalog_products only has 70,124
- **Fix:** Same investigation as WPS — find promotion script, run for missing rows
- **Note:** vendor_code is lowercase 'pu' not 'PU'

---

## 🟡 MEDIUM PRIORITY

### 8,485 PU products with no dealer_price
- **What:** 70,124 PU in catalog, only 61,639 got pricing — 8,485 have no price, can't be sold
- **Investigate:**
  ```sql
  SELECT cp.sku, cp.brand, cp.name,
         pp.dealer_price as pu_pricing_price,
         pp.part_number as pu_pricing_match
  FROM catalog_products cp
  LEFT JOIN catalog_pricing pr ON pr.sku = cp.sku AND pr.supplier = 'PU'
  LEFT JOIN pu_pricing pp ON pp.part_number = cp.sku
  WHERE cp.source_vendor = 'pu' AND pr.sku IS NULL
  LIMIT 20;
  ```
- **Fix options:** SKU format mismatch (punctuated vs plain), NULL price in source, different source file needed

### catalog_unified rebuild needed
- **What:** 138,872 rows — built before metric purge, stale
- **Fix:** Full rebuild after catalog_products pipeline gaps are closed

### catalog_images legacy table consolidation
- **What:** catalog_images (29,683 rows) is legacy — catalog_media (38,512) is active
- **Risk:** Frontend product detail page may still read catalog_images → missing images
- **Fix:** Migrate unique catalog_images rows to catalog_media, then DROP catalog_images
- **Warning:** Dual FK issue — drop both constraints before any bulk ops (see Build Tracker)

### 52 PU products with NULL computed_price
- **What:** 70,072 of 70,124 PU products have computed_price — 52 are NULL, won't index
- **Investigate:**
  ```sql
  SELECT cp.sku, cp.brand, cp.name, cp.pricing_rule_id, pr.dealer_price
  FROM catalog_products cp
  LEFT JOIN catalog_pricing pr ON pr.sku = cp.sku AND pr.supplier = 'PU'
  WHERE cp.source_vendor = 'pu' AND cp.computed_price IS NULL;
  ```

---

## 🔵 LOW PRIORITY / FUTURE

### OEM cross-reference expansion
- catalog_oem_crossref has only 19 rows
- **Quick win:** Mass extract pu_products.oem_part_number → catalog_oem_crossref
  ```sql
  INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
  SELECT sku, oem_part_number, brand, source_file
  FROM pu_products
  WHERE oem_part_number IS NOT NULL AND oem_part_number != ''
  ON CONFLICT (sku, oem_number, oem_manufacturer) DO NOTHING;
  ```
- **Bigger lift:** FatBook PDF extraction for WPS OEM numbers
- **Frontend:** Add oem_numbers to Typesense query_by, display on product detail pages

### Fitment extraction pipeline
- catalog_fitment has 11,891 rows (~15% of products)
- Fitment buried in vendor description text fields
- Need regex/NLP/AI extraction → catalog_fitment (make, model, year_start, year_end)
- Harley model reference table in Supabase (harley.models, ~1,670 records) ready to link

### Tire catalog images
- tire_master_image.xlsx not yet processed
- Method: Python HYPERLINK formula extraction (same as HardDrive catalog)

### catalog_product_enrichment orphans (~94K rows)
- 172,656 enrichment rows vs 78,072 catalog_products
  ```sql
  DELETE FROM catalog_product_enrichment
  WHERE product_id NOT IN (SELECT id FROM catalog_products);
  ```

### PU OEM cross-reference scraping
- PU provides OEM-to-PU part number cross-reference — difficult to scrape cleanly

---

## 📋 THINGS THAT BIT US (operational notes)

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table pattern |
| catalog_images dual FK blocks deletes | DROP both FK constraints, delete, ADD back |
| `DISABLE TRIGGER ALL` permission denied | catalog_app is not superuser — use DROP/ADD constraint |
| Next.js dev server holds read locks | Stop dev server before bulk DDL/DML |
| vendor_code casing | Always lowercase: 'wps' and 'pu' |

---

*Updated: April 16, 2026*
