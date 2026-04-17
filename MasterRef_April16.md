# Stinkin' Supplies — Master Reference
**Last Updated:** April 17, 2026
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog clean ✅ | Search working ✅ | Pricing 99.99% ✅ | Fitment + OEM expanded ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_products | 98,353 | ✅ Clean |
| — WPS products | 27,219 | ✅ 100% priced |
| — PU products | 71,134 | ✅ 99.99% priced |
| catalog_unified | 94,400 rows | ✅ Current |
| Typesense indexed | 94,400 | ✅ Current (fitment + OEM live) |
| Products with images | 44,508 | ✅ |
| catalog_media | 58,544 rows | ✅ Canonical image table |
| catalog_oem_crossref | 93,548 rows | ✅ Expanded April 17 |
| catalog_fitment | 18,653 rows / 7,256 products | ⚠️ ~7.7% coverage |
| catalog_product_enrichment | 77,023 rows | ✅ Cleaned April 17 |

---

## DATABASE CONNECTION

```
Host:       5.161.100.126 (Hetzner)
Port:       5432
Database:   stinkin_catalog
User:       catalog_app
Password:   smelly
SSH Alias:  ssh stinkdb
Connection: postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog
```

Note: catalog_app is NOT a superuser. Cannot DISABLE TRIGGER ALL.

---

## SCHEMA OVERVIEW

### Two-Schema Layout
- **vendor schema** — raw vendor data, never modified by application
- **public schema** — application catalog, derived from vendor data

---

## PUBLIC SCHEMA — KEY TABLES

### catalog_products (98,353 rows | ~620 MB)
Master customer-facing product catalog. Source of truth for all product data.

**Key columns:**
- `id` (PK serial)
- `sku` (unique text) — vendor SKU
- `slug` (unique text) — URL identifier
- `name`, `description` — product content
- `brand`, `category`, `subcategory`
- `source_vendor` — 'wps' or 'pu' (lowercase)
- `msrp`, `cost`, `map_price`, `computed_price`
- `has_map_policy`, `drop_ship_eligible`
- `is_active`, `is_discontinued`
- `manufacturer_part_number`, `oem_part_number`, `upc`
- `pricing_rule_id` → pricing_rules FK
- `internal_sku` — 3-letter prefix + 6-digit sequential (e.g. ENG-100142)

**Cascade children (auto-delete on product delete):**
catalog_media, catalog_specs, catalog_fitment, catalog_prices,
catalog_reviews, catalog_variants, catalog_attributes

**Non-cascade dependents (must delete manually first):**
vendor_offers, map_audit_log, routing_decisions

Note: catalog_images was DROPPED April 17 — no longer a dependent.

---

### catalog_unified (94,400 rows)
Denormalized customer-facing view. Rebuilt April 16.
Has 69 columns including all fitment, image_url, features array, stock quantities by warehouse.
WPS: 27,219 rows | PU: 67,181 rows.

---

### catalog_allowlist (494K+ rows)
Controls what gets indexed into Typesense. Only products with a matching SKU here are searchable.

**Schema:** `(sku, source, catalog, created_at)` — PK on (sku, source)

**Rebuild command:**
```bash
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs
```

---

### catalog_media (58,544 rows)
**CANONICAL image table** — used by Typesense indexer and frontend.
`catalog_images` was DROPPED April 17 after migrating 21,075 rows here.

**Schema:** `(id, product_id→catalog_products CASCADE, url, media_type, priority)`
- Unique constraint on (product_id, url)
- 44,508 distinct products have at least one image

---

### ~~catalog_images~~ — DROPPED April 17
Migrated to catalog_media. No longer exists.

---

### catalog_inventory (697,796 rows)
WPS warehouse inventory. All records supplier='WPS'.

**Schema:** `(id, sku, quantity, warehouse, supplier, created_at, updated_at)`
**Unique:** (sku, supplier, warehouse)
**Warehouses:** boise, fresno, elizabethtown, ashley, midlothian, jessup, midway

---

### catalog_pricing (123,034 rows)
Dealer pricing. WPS=27,219 rows (100% coverage). PU=62,065 rows (~87% coverage).

**Schema:** `(id, sku, punctuated_sku, dealer_price, supplier)`
Note: SKU-based join. Join to catalog_products on sku.

---

### catalog_fitment (18,653 rows | 7,256 products)
Structured fitment data. ~7.7% of products covered.
Columns: product_id, make, model, year_start, year_end, notes

**Unique index:** `NULLS NOT DISTINCT ON (product_id, make, model, year_start, year_end)`

**Model families (clean):**
| Family | Products |
|--------|---------|
| Touring | 4,201 |
| Softail | 1,462 |
| Dyna (FXD) | 1,081 |
| Sportster | 942 |
| FXR | 388 |

Note: FXR ≠ Dyna. FXR = rubber-mount series 1982-1994. Dyna = FXD 1991-2017.
Note: Pre-existing rows have granular model name variants (FXRT Sport Glide, TLE SIDECAR, etc.) — low priority to normalize.

**Extraction script:** `scripts/ingest/extract_fitment.js` — safe to re-run (idempotent via unique index)

---

### catalog_oem_crossref (93,548 rows)
OEM cross-reference numbers. Expanded April 17 from pu_brand_enrichment.
Columns: sku, oem_number, oem_manufacturer, page_reference, source_file

**Unique constraint:** (sku, oem_number, oem_manufacturer)

Note: Only 6,431 of 93,548 rows JOIN to active catalog_products (SKU format gap). Indexed in Typesense as oem_numbers[].

---

### catalog_product_enrichment (77,023 rows)
Brand/supplier metadata, features, dimensions. Cleaned April 17 (95,633 orphaned rows removed).
Links by SKU (not product_id — all product_id values are NULL).

---

### product_groups / product_group_members (132,783 / 132,801 rows)
Groups identical products across vendors. member_count, vendor_count, canonical_product_id.

---

### pricing_rules (4 rows)
Business rules for markup/margin. Editable from admin dashboard.
Key fields: formula_type, markup_percent, margin_min (0.10), margin_target (0.25), map_floor, msrp_ceiling.

---

### pu_products (152,928 rows)
PU brand-specific product data loaded from XML brand catalog exports.
Columns: sku, brand, brand_code, name, features[], oem_part_number, dimensions, weight, image_uri, dealer_price, part_status.

---

### pu_pricing (151,497 rows)
PU dealer pricing from D00108_DealerPrice.csv.
Join to catalog_pricing via punctuated_part_number.

---

### pu_brand_enrichment
WPS/PU brand enrichment data. Source for:
- OEM part numbers → catalog_oem_crossref (93,529 loaded)
- Product images → catalog_media

---

### raw_vendor_wps_products (121,110 rows)
Raw WPS product data staging table.

---

## VENDOR SCHEMA — KEY TABLES

### vendor.vendor_products (295,933 rows)
Raw vendor product data — never modify directly.

**vendor_code values:** 'wps' (122,192) and 'pu' (173,741) — lowercase only.

**Key columns:**
- vendor_code, vendor_part_number (unique), manufacturer_part_number
- title, description_raw, brand
- msrp, map_price, wholesale_cost
- images_raw (jsonb), fitment_raw (jsonb), attributes_raw (jsonb)
- status, drop_ship_eligible, has_map_policy
- upc, superseded_sku

---

## CATALOG SCOPE — WHAT WE SELL

### Included
| Source | Catalog | Filter Method |
|--------|---------|---------------|
| WPS | Hard Drive (HDTwin) | Brand name ILIKE match |
| WPS | Tires & Wheels | Tire brand name match |
| WPS | Tools & Chemicals | Category name ILIKE match |
| PU | Fatbook | fatbook_catalog field in D00108 |
| PU | Fatbook Mid-Year | fatbook_midyear field |
| PU | Oldbook | oldbook_catalog field |
| PU | Oldbook Mid-Year | oldbook_midyear field |
| PU | Tire / Service | tire_catalog field |

### Excluded
Street, ATV, Offroad, Snow, Watercraft, Apparel, Bicycle, Helmet & Apparel,
FLY Racing, metric brands (Scorpion EXO, GMAX, Highway 21, Motion Pro, Mikuni, etc.)

---

## TYPESENSE SEARCH

**Collection:** `products` (active)
**Host:** 5.161.100.126.nip.io:443 (HTTPS via nginx proxy)
**nginx limit:** 20MB per request (raised April 17 from 1MB default)
**Batch size:** 1,000 docs/batch (~safe at ~1MB avg)

**query_by:** name, brand, sku, mpn, specs_blob, search_blob, oem_numbers
**Facets:** brand, category, in_stock, free_shipping, fitment_make, fitment_model, fitment_year, sport_types, vendors

**Reindex command:**
```bash
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```

**Indexer sources (index_assembly.js):**
- catalog_products — core fields
- catalog_specs — specs_blob
- catalog_fitment — fitment_make[], fitment_model[], fitment_year[]
- catalog_media — primary_image, images[]
- vendor_offers — vendors[]
- catalog_oem_crossref — oem_numbers[]

---

## KNOWN ISSUES

### 🔴 Active
1. **9 PU products with NULL computed_price** — no pricing data anywhere, genuinely unpriceable

### ⚠️ Low Priority
2. **catalog_fitment sparse** — 7.7% coverage, pre-existing rows have messy model name variants
3. **Tire catalog images** — tire_master_image.xlsx not yet processed
4. **WPS FatBook PDF OEM extraction** — catalog_oem_crossref WPS side incomplete

---

## IMPORTANT OPERATIONAL NOTES

### Before Any Bulk Delete/DDL
1. Stop Next.js dev server — it holds AccessShareLocks on catalog_products
2. Use temp table pattern for ID sets (NOT IN on large tables hangs)
3. Note: catalog_images no longer exists — bulk delete pattern no longer needs its FK drops

### Query Performance
- `NOT IN (large subquery)` — hangs, use `NOT EXISTS` or temp table
- `NOT EXISTS` with index on allowlist.sku — fast

### Casing Rules
- vendor_code: always lowercase ('wps'/'pu')
- catalog_unified.source_vendor: UPPERCASE ('WPS'/'PU')

### HD Fitment Notes
- FXR ≠ Dyna: FXR rubber-mount 1982-1994, Dyna FXD 1991-2017
- M8 (Milwaukee-Eight): Touring 2017+, Softail 2018+, Sportster S 2021+
- XL alone = size ambiguous (matches clothing XL); use XLH/XLS/XL+digits for Sportster

---

*Master Reference maintained by Claude — Last update: April 17, 2026*
