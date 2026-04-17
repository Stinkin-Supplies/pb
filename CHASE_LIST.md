# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 17, 2026 — start of session

---

## ✅ DONE APRIL 17 START
- Reindexed Typesense: 94,400 indexed, 0 failed (96.4s) — pricing updates live in search

---

## 🚀 NEXT UP

---

## ✅ COMPLETED THIS SESSION (April 16)

| Fix | Result |
|-----|--------|
| Deleted 18,450 metric products | 0 metric in catalog |
| Added 9,699 HD products to allowlist | 0 missing from allowlist |
| Loaded PU pricing (62,065 rows) | 87%+ dealer price coverage |
| Promoted 19,271 WPS products | WPS: 7,948 → 27,219 |
| Promoted 1,010 PU products | PU: 70,124 → 71,134 |
| Computed prices WPS | 27,219/27,219 = 100% |
| Computed prices PU | 67,172/67,181 = 99.99% |
| Rebuilt catalog_unified | 94,400 fresh rows |
| Added 1,538 PU images | 31,130 products with images |
| Fixed search (query_by, facet_by, sort_by, filter_by) | Search working ✅ |
| Fixed db.js connectionTimeoutMillis 5000→30000 | Fewer timeout errors |

---

## 🔴 HIGH PRIORITY

### ~~Reindex Typesense~~ ✅ DONE April 17
- 94,400 indexed, 0 failed

### 9 PU products with NULL computed_price
- Genuinely no pricing data anywhere — may need manual price entry or removal
```sql
SELECT sku, brand, name, msrp, cost, map_price
FROM catalog_products
WHERE computed_price IS NULL AND is_active = true;
```

---

## 🟡 MEDIUM PRIORITY

### OEM cross-reference expansion — QUICK WIN
- catalog_oem_crossref has only 19 rows
- pu_brand_enrichment has oem_part_number data ready to load
```sql
INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
SELECT pbe.sku, pbe.oem_part_number, pbe.brand, pbe.source_file
FROM pu_brand_enrichment pbe
WHERE pbe.oem_part_number IS NOT NULL AND pbe.oem_part_number != ''
ON CONFLICT (sku, oem_number, oem_manufacturer) DO NOTHING;
```
Then reindex so oem_numbers appear in search.

### catalog_images legacy table consolidation
- catalog_images (29,683 rows) is legacy — catalog_media is active
- Frontend product detail page may still read catalog_images
- Fix: migrate unique rows to catalog_media, DROP catalog_images
- Warning: dual FK — drop both constraints before bulk ops
```sql
-- Step 1: migrate rows not already in catalog_media
INSERT INTO catalog_media (product_id, url, media_type, priority)
SELECT ci.product_id, ci.url, 'image', 1
FROM catalog_images ci
WHERE ci.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM catalog_media cm 
    WHERE cm.product_id = ci.product_id AND cm.url = ci.url
  )
ON CONFLICT (product_id, url) DO NOTHING;

-- Step 2: drop FKs, drop table
ALTER TABLE catalog_images DROP CONSTRAINT catalog_images_product_id_fkey;
ALTER TABLE catalog_images DROP CONSTRAINT catalog_images_catalog_product_id_fkey;
DROP TABLE catalog_images;
```

### 8,485 PU products with no dealer_price in catalog_pricing
- Exist in catalog, have computed_price via msrp/cost but no dealer cost on file
- Low urgency — products are sellable, just no cost basis recorded
```sql
SELECT cp.sku, cp.brand, cp.name, cp.msrp, cp.cost, cp.computed_price
FROM catalog_products cp
LEFT JOIN catalog_pricing pr ON pr.sku = cp.sku AND pr.supplier = 'PU'
WHERE cp.source_vendor = 'pu' AND pr.sku IS NULL
LIMIT 20;
```

---

## 🔵 LOW PRIORITY / FUTURE

### Fitment extraction pipeline
- catalog_fitment has 11,891 rows (~12% of 94K products)
- Fitment buried in vendor description text fields
- Need regex/NLP/AI extraction → catalog_fitment (make, model, year_start, year_end)
- Harley model reference table in Supabase (harley.models ~1,670 records) ready to connect
- After pipeline: rebuild catalog_unified to populate fitment_year_start/end/families/codes columns

### catalog_product_enrichment orphan cleanup
- 172,656 enrichment rows vs 98K catalog_products — ~74K orphaned
```sql
DELETE FROM catalog_product_enrichment
WHERE product_id NOT IN (SELECT id FROM catalog_products);
```

### Tire catalog images
- tire_master_image.xlsx not yet processed
- Same Python HYPERLINK extraction as HardDrive catalog

### WPS FatBook PDF OEM extraction
- Bigger lift for catalog_oem_crossref WPS side
- Requires PDF parsing pipeline

---

## 📊 END OF SESSION STATE

| Metric | Value |
|--------|-------|
| Typesense indexed | 94,400 (needs reindex) |
| catalog_products | 98,353 |
| WPS in catalog | 27,219 (100% priced) |
| PU in catalog | 71,134 (99.99% priced) |
| catalog_unified | 94,400 (fresh) |
| Products with images | 31,130 |
| Search | ✅ Working |
| Metric products | 0 |

---

## 📋 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table |
| catalog_images dual FK blocks deletes | DROP both FKs, delete, ADD back |
| `DISABLE TRIGGER ALL` denied | catalog_app not superuser — use DROP/ADD constraint |
| Next.js holds read locks | Stop dev server before bulk DDL/DML |
| vendor_code casing | Always lowercase: 'wps'/'pu' |
| catalog_unified source_vendor | UPPERCASE 'WPS'/'PU' (different from catalog_products) |
| pu_products.map_price | VARCHAR 'Y'/'N' flag — not a price |
| PU drop_ship_eligible | All false — unreliable, ignore |
| PU SKU format | catalog uses punctuated (1401-1193), pu_pricing.part_number is plain (14011193) — join via punctuated_part_number |
| Typesense on hotspot | Fails — needs stable WiFi for Promise.all parallel queries |
| psql paste cuts off | Watch for `-*>` continuation prompt |
| Temp table lost after ROLLBACK | Recreate before retrying |
| catalog_unified not a view | Regular table — TRUNCATE + INSERT to rebuild |

---

*Updated: April 16, 2026 — end of session*
