# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 16, 2026 (end of session)

---

## ✅ COMPLETED THIS SESSION (April 16)

| # | Fix | Result |
|---|-----|--------|
| 1 | Deleted 18,450 metric/apparel/non-HD products | 78,072 clean products remain |
| 2 | Added 9,699 orphaned HD products to allowlist | 78,072 in_allowlist, 0 missing |
| 3 | Loaded 61,639 PU dealer prices into catalog_pricing | 87.9% PU pricing coverage |
| 4 | Fixed index_assembly.js INNER JOIN → LEFT JOIN | All products index regardless of images |
| 5 | Promoted 19,271 WPS products from vendor_products | WPS: 7,948 → 27,219 in catalog |
| 6 | Extracted 22,181 WPS images from images_raw JSON | Loaded into catalog_media |
| 7 | Promoted 1,010 PU products from pu_products | PU: 70,124 → 71,134 in catalog |
| 8 | Added pricing for 426 new PU products | Via pu_pricing join |
| 9 | Reindexed Typesense | **94,400 indexed** (was 12,443 at start), 0 failed |

---

## 🔴 HIGH PRIORITY

### WPS computed_price gap — 19,271 newly promoted WPS products
- **What:** WPS has 27,219 in catalog, 27,194 have pricing (99.9%) but computed_price may be NULL on new products
- **Check:**
  ```sql
  SELECT COUNT(*) as missing_computed
  FROM catalog_products
  WHERE source_vendor = 'wps' AND computed_price IS NULL;
  ```
- **Fix:** Run pricing engine / update computed_price from catalog_pricing join using pricing_rules formula
- **Impact:** Products without computed_price won't show in Typesense (gate in index query)
- **Note:** 93,390 indexed last session vs 94,400 now — gap is shrinking but check WPS computed_price

### catalog_unified rebuild
- **What:** 138,872 rows — completely stale, built before all fixes
- **Impact:** Storefront category/brand browsing broken until rebuilt
- **Fix:** Find and run catalog_unified rebuild script, or write new one from catalog_products

---

## 🟡 MEDIUM PRIORITY

### 8,485 PU products still with no dealer_price
- **What:** Original 70,124 PU products — 61,639 priced, 8,485 still at $0
- **Investigate:**
  ```sql
  SELECT cp.sku, cp.brand, cp.name,
         pp.part_number as pu_pricing_match,
         pp.dealer_price as pu_pricing_price
  FROM catalog_products cp
  LEFT JOIN catalog_pricing pr ON pr.sku = cp.sku AND pr.supplier = 'PU'
  LEFT JOIN pu_pricing pp ON pp.part_number = cp.sku
  WHERE cp.source_vendor = 'pu' AND pr.sku IS NULL
  LIMIT 20;
  ```

### catalog_images legacy table consolidation
- **What:** catalog_images (29,683 rows) is legacy — catalog_media is active
- **Risk:** Frontend product detail page may read catalog_images → missing images
- **Fix:** Migrate unique rows to catalog_media, DROP catalog_images
- **Warning:** Dual FK — drop both constraints before bulk ops

### 52 PU products with NULL computed_price
  ```sql
  SELECT cp.sku, cp.brand, cp.name
  FROM catalog_products cp
  WHERE cp.source_vendor = 'pu' AND cp.computed_price IS NULL;
  ```

### PU images not linked for 1,010 newly promoted products
- **What:** New PU products have no images in catalog_media
- **Fix:** Join pu_brand_enrichment or pu_products image_url fields to catalog_media
  ```sql
  -- Check if pu_brand_enrichment has image URLs for these SKUs
  SELECT COUNT(*) FROM pu_brand_enrichment pbe
  JOIN catalog_products cp ON cp.sku = pbe.sku
  WHERE cp.source_vendor = 'pu'
    AND cp.id NOT IN (SELECT product_id FROM catalog_media WHERE product_id IS NOT NULL);
  ```

---

## 🔵 LOW PRIORITY / FUTURE

### OEM cross-reference expansion
- catalog_oem_crossref has only 19 rows
- **Quick win:** Mass extract from pu_products (oem_part_number field in pu_brand_enrichment)
- **Bigger lift:** FatBook PDF extraction for WPS OEM numbers
- **Frontend:** Add oem_numbers to Typesense query_by, display on product detail pages

### Fitment extraction pipeline
- catalog_fitment has ~11,891 rows (~12% coverage)
- Fitment buried in vendor description text fields
- Need regex/NLP/AI extraction → catalog_fitment (make, model, year_start, year_end)
- Harley model reference table in Supabase (harley.models, ~1,670 records) ready to link

### Tire catalog images
- tire_master_image.xlsx not yet processed
- Method: Python HYPERLINK formula extraction (same as HardDrive catalog)

### catalog_product_enrichment orphans
- 172,656 enrichment rows vs ~98K catalog_products — ~74K orphaned
  ```sql
  DELETE FROM catalog_product_enrichment
  WHERE product_id NOT IN (SELECT id FROM catalog_products);
  ```

### PU OEM cross-reference scraping
- PU provides OEM-to-PU part number cross-reference — difficult to scrape cleanly

---

## 📊 FULL SESSION SCOREBOARD

| Metric | Start of Session | End of Session |
|--------|-----------------|----------------|
| Typesense indexed | 12,443 | **94,400** |
| catalog_products total | 96,522 | **98,353** |
| Metric/junk products | 18,450 | **0** |
| WPS in catalog | 7,948 | **27,219** |
| PU in catalog | 74,244 | **71,134** (purged junk, added good) |
| PU pricing coverage | 0% | **88%+** |
| Images in catalog_media | 28,445 products | **50K+ products** |

---

## 📋 THINGS THAT BIT US (operational notes)

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table pattern |
| catalog_images dual FK blocks deletes | DROP both FK constraints, delete, ADD back |
| `DISABLE TRIGGER ALL` permission denied | catalog_app is not superuser — use DROP/ADD constraint |
| Next.js dev server holds read locks | Stop dev server before bulk DDL/DML |
| vendor_code casing | Always lowercase: 'wps' and 'pu' |
| ETIMEDOUT on Typesense | Transient — just retry. Docker on :8108 |
| pu_products.map_price = 'Y'/'N' | It's a flag not a price — use pu_pricing for actual MAP |
| pu_products has no image column | Images come from pu_brand_enrichment or catalog_media |
| psql paste cut off mid-query | Watch for `-*>` continuation prompt — finish the statement |
| Temp table lost after ROLLBACK | Recreate temp table before retrying transaction |

---

*Updated: April 16, 2026 — end of session*
