# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 17, 2026 — end of session

---

## 🚀 NEXT SESSION — START HERE

```bash
# 1. Reindex Typesense to pick up fitment + OEM data added this session
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```
Expected: ~94,400 indexed. Needs stable WiFi.

Then tackle:
1. Tire catalog images — `tire_master_image.xlsx`
2. WPS FatBook PDF OEM extraction

---

## ✅ DONE APRIL 17

| Task | Result |
|------|--------|
| Reindexed Typesense (start of session) | 94,400 indexed, 0 failed |
| OEM crossref expansion | 19 → **93,548 rows** (from pu_brand_enrichment) |
| catalog_images migration | 21,075 rows → catalog_media, table dropped |
| catalog_media | 38K → **58,544 rows** |
| Products with images | 31,130 → **44,508** |
| index_assembly.js | Added oem_numbers[] field + catalog_oem_crossref JOIN |
| client.ts query_by | Updated to name, brand, sku, mpn, specs_blob, search_blob, oem_numbers |
| nginx client_max_body_size | 1MB → 20MB (Typesense proxy fix) |
| catalog_product_enrichment orphan cleanup | 95,633 orphaned rows deleted (172,656 → 77,023) |
| Fitment extraction pipeline | 11,891 → **18,653 rows** / 600 → **7,256 products** covered |
| — FXR separated from Dyna | FXR is own family (1982-1994) |
| — M8 year inference | Milwaukee-Eight → Touring 2017-Up, Softail 2018-Up, Sportster 2021-Up |
| Added NULLS NOT DISTINCT unique index | catalog_fitment deduplicated, safe for re-runs |

---

## ✅ COMPLETED APRIL 16

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

### 9 PU products with NULL computed_price
- Genuinely no pricing data anywhere — may need manual price entry or removal
```sql
SELECT sku, brand, name, msrp, cost, map_price
FROM catalog_products
WHERE computed_price IS NULL AND is_active = true;
```

---

## 🔵 LOW PRIORITY / FUTURE

### Tire catalog images
- tire_master_image.xlsx not yet processed
- Same Python HYPERLINK extraction as HardDrive catalog

### WPS FatBook PDF OEM extraction
- Bigger lift for catalog_oem_crossref WPS side
- Requires PDF parsing pipeline

### catalog_fitment — messy model name variants in pre-existing data
- Pre-existing rows have many granular/variant model names (FXRT Sport Glide, FXRS Low Rider, TLE SIDECAR vs TLE - SIDECAR, etc.)
- Low urgency — main families (Touring, Softail, Dyna, Sportster, FXR) are clean
- Could normalize with a UPDATE pass when bandwidth allows

---

## 📊 CURRENT STATE (End of April 17)

| Metric | Value |
|--------|-------|
| Typesense indexed | 94,400 (**needs reindex** for fitment + OEM) |
| catalog_products | 98,353 |
| WPS in catalog | 27,219 (100% priced) |
| PU in catalog | 71,134 (99.99% priced) |
| catalog_unified | 94,400 |
| Products with images | **44,508** |
| catalog_media | **58,544 rows** |
| catalog_oem_crossref | **93,548 rows** |
| catalog_fitment | **18,653 rows / 7,256 products** |
| catalog_product_enrichment | **77,023 rows** (cleaned) |
| Search | ✅ Working |

---

## 📋 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| `NOT IN (large subquery)` hangs | Use `NOT EXISTS` or temp table |
| `DISABLE TRIGGER ALL` denied | catalog_app not superuser — use DROP/ADD constraint |
| Next.js holds read locks | Stop dev server before bulk DDL/DML |
| vendor_code casing | Always lowercase: 'wps'/'pu' |
| catalog_unified source_vendor | UPPERCASE 'WPS'/'PU' (different from catalog_products) |
| pu_products.map_price | VARCHAR 'Y'/'N' flag — not a price |
| PU drop_ship_eligible | All false — unreliable, ignore |
| PU SKU format | catalog uses punctuated (1401-1193), pu_pricing.part_number is plain (14011193) — join via punctuated_part_number |
| Typesense on hotspot | Fails — needs stable WiFi for Promise.all parallel queries |
| Typesense batch size | 1000 docs/batch safe now (nginx 20MB limit) |
| psql paste cuts off | Watch for `-*>` continuation prompt |
| Temp table lost after ROLLBACK | Recreate before retrying |
| catalog_unified not a view | Regular table — TRUNCATE + INSERT to rebuild |
| catalog_fitment unique index | NULLS NOT DISTINCT on (product_id, make, model, year_start, year_end) — safe to re-run extract_fitment.js |
| FXR ≠ Dyna | FXR = rubber-mount 1982-1994, Dyna = FXD 1991-2017, separate families |
| M8 = Milwaukee-Eight | 2017+ Touring, 2018+ Softail, 2021+ Sportster S |

---

*Updated: April 17, 2026 — end of session*
