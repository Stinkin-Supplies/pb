# Stinkin' Supplies — Master Reference
**Last Updated:** April 16, 2026
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Cleanup In Progress — Metric products purged, HD fixes queued

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_products | 78,072 | ✅ Clean (metric purge complete) |
| — WPS products | 7,948 | ⚠️ Pipeline gap — 114K more in vendor_products |
| — PU products | 70,124 | ⚠️ Pricing gap — 0% priced |
| In allowlist (searchable) | 68,373 | ⚠️ 9,699 HD products missing from allowlist |
| catalog_media (images) | 28,445 products | ✅ Active image table |
| catalog_inventory | 697,796 records | ✅ 7 WPS warehouses |
| WPS pricing coverage | 22,278 (100%) | ✅ |
| PU pricing coverage | 0 (0%) | 🔴 Fix queued |
| catalog_oem_crossref | 19 rows | 🔴 Near-empty |
| catalog_fitment | 11,891 rows | ⚠️ ~15% coverage |

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

### catalog_products (78,072 rows | 620 MB)
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
vendor_offers, catalog_images (both FKs), map_audit_log, routing_decisions

---

### catalog_unified (138,872 rows | 219 MB)
Denormalized customer-facing view. Currently STALE — needs rebuild.
Has 69 columns including all fitment, image_url, features array, stock quantities by warehouse.
source_vendor: WPS=96,522 rows, PU=42,350 rows (orphaned — catalog_products has 0 PU rows with that count).

---

### catalog_allowlist (479,565 rows | 69 MB)
Controls what gets indexed into Typesense. Only products with a matching SKU here are searchable.

**Schema:** `(sku, source, catalog, created_at)` — PK on (sku, source)

**Sources:**
| source | catalog | unique SKUs |
|--------|---------|-------------|
| wps_hard_drive | WPS Hard Drive | 5,618 |
| wps_tire_brands | WPS Tires/Wheels | 8,332 |
| wps_tools_chemicals | WPS Tools/Chemicals | 10,608 |
| pu_fatbook | PU Fatbook | 151,669 |
| pu_oldbook | PU Oldbook | 151,669 |
| pu_tire | PU Tire/Service | 151,669 |

Total unique SKUs: ~169,041
Note: fatbook/oldbook/tire all have same 151,669 count — most PU products appear in multiple catalogs.

**Rebuild command:**
```bash
npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs
```

---

### catalog_media (38,512 rows | 18 MB)
**CANONICAL image table** — used by Typesense indexer and should be used by frontend.

**Schema:** `(id, product_id→catalog_products CASCADE, url, media_type, priority)`
- `priority = 1` for all records (not 0 — bug fixed previously)
- Unique constraint on (product_id, url)

---

### catalog_images (29,683 rows | 103 MB)
**LEGACY image table** — to be consolidated into catalog_media and dropped.
Has TWO FKs to catalog_products: `product_id` (CASCADE) and `catalog_product_id` (NO ACTION).
The dual-FK causes conflicts during bulk deletes — see delete pattern in Build Tracker.

---

### catalog_inventory (697,796 rows | 203 MB)
WPS warehouse inventory. All records supplier='WPS'.

**Schema:** `(id, sku, quantity, warehouse, supplier, created_at, updated_at)`
**Unique:** (sku, supplier, warehouse)
**Warehouses:** boise, fresno, elizabethtown, ashley, midlothian, jessup, midway

---

### catalog_pricing (123,034 rows | 24 MB)
Dealer pricing. WPS=22,278 rows (100% coverage). PU=0 rows (fix queued).

**Schema:** `(id, sku, punctuated_sku, dealer_price, supplier)`
Note: SKU-based join, not product_id FK. Join to catalog_products on sku.

---

### catalog_fitment (11,891 rows | 3 MB)
Structured fitment data. Currently ~15% of products covered.
Columns: product_id, make, model, year_start, year_end, notes

---

### catalog_oem_crossref (19 rows)
Nearly empty. Needs expansion from pu_products.oem_part_number and FatBook PDF extraction.
Columns: sku, oem_number, oem_manufacturer, page_reference, source_file

---

### catalog_product_enrichment (172,656 rows | 65 MB)
Brand/supplier metadata, features, dimensions. More rows than catalog_products — contains orphaned records. Needs reconciliation.

---

### product_groups / product_group_members (132,783 / 132,801 rows)
Groups identical products across vendors. member_count, vendor_count, canonical_product_id.
product_group_members has per-warehouse stock columns: warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc.

---

### pricing_rules (4 rows)
Business rules for markup/margin. Editable from admin dashboard.
Key fields: formula_type, markup_percent, margin_min (0.10), margin_target (0.25), map_floor, msrp_ceiling.

---

### pu_products (152,928 rows | 48 MB)
PU brand-specific product data loaded from XML brand catalog exports.
Columns include: sku, brand, brand_code, name, features[], oem_part_number, dimensions, weight, image_uri, dealer_price, your_dealer_price, retail_price, part_status.
Note: dealer_price/your_dealer_price column names confirmed NOT present in this table — pricing comes from pu_pricing.

---

### pu_pricing (151,497 rows | 40 MB)
PU dealer pricing from D00108_DealerPrice.csv. NOT yet joined to catalog_pricing.
Needs schema confirmation before join query.

---

### pu_pricefile_staging (153,085 rows | 313 MB)
Raw D00108 price file data in batch format (dealerprice_batch_* rows).

---

### raw_vendor_wps_products (121,110 rows | 170 MB)
Raw WPS product data staging table.

---

## VENDOR SCHEMA — KEY TABLES

### vendor.vendor_products (295,933 rows | 504 MB)
Raw vendor product data — never modify directly.

**vendor_code values:** 'wps' (122,192) and 'pu' (173,741) — lowercase only.

**Key columns:**
- vendor_code, vendor_part_number (unique), manufacturer_part_number
- title, description_raw, brand
- msrp, map_price, wholesale_cost
- images_raw (jsonb), fitment_raw (jsonb), attributes_raw (jsonb)
- status, drop_ship_eligible, has_map_policy
- weight, length, width, height
- upc, superseded_sku, carb, prop_65_code

**Pipeline gap (as of April 16):**
- WPS: 122,192 in vendor_products → 7,948 in catalog_products (6.4% promoted)
- PU: 173,741 in vendor_products → 70,124 in catalog_products (40.4% promoted)
- Root cause under investigation

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

### HD Brand List (WPS Hard Drive)
DRAG SPECIALTIES, KURYAKYN, ARLEN NESS, CUSTOM CHROME, HARDDRIVE, NATIONAL CYCLE,
KHROME WERKS, SHOW CHROME, THUNDER MANUFACTURING, SUMAX, WITCHDOCTORS, BIKER CHOICE,
CUSTOM DYNAMICS, PERFORMANCE MACHINE, PROGRESSIVE SUSPENSION, COBRA, VANCE AND HINES,
SUPERTRAPP, SAMSON, FREEDOM PERFORMANCE, BASSANI, TRASK, ROLAND SANDS, BURLY BRAND,
MUSTANG, CORBIN, SADDLEMEN, DANNY GRAY, LE PERA, BILTWELL, RICK ROSS, NOVELLO, COLONY,
JAMES GASKETS, COMETIC, ANDREWS, RIVERA PRIMO, BELT DRIVES, BAKER DRIVETRAIN, DARK HORSE,
S&S CYCLE, FUELING, REVTECH, TP ENGINEERING, LAGUNA, DAYCO, DSS, + more (ILIKE match)

---

## TYPESENSE SEARCH

**Index:** catalog_products filtered by catalog_allowlist
**Query:** Only products where is_active=true AND is_discontinued=false AND computed_price IS NOT NULL AND sku IN allowlist
**Key fields:** name, brand, category, oem_numbers (array), features (array)
**Facets:** brand, category, in_stock, has_image, price range

**Reindex command (clean):**
```bash
rm .stage3_checkpoint.json
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```

---

## KNOWN ISSUES & FIXES QUEUED

### 🔴 Critical
1. **PU pricing = 0%** — 70,124 PU products unsellable. Fix: join pu_pricing → catalog_pricing.
2. **9,699 HD products not in allowlist** — invisible in search. Fix: insert into catalog_allowlist.

### ⚠️ Major
3. **WPS pipeline gap** — 114K WPS products in vendor_products never promoted to catalog.
4. **PU pipeline gap** — 99K PU products in vendor_products never promoted to catalog.
5. **catalog_unified stale** — needs rebuild after catalog_products stabilizes.
6. **catalog_images legacy table** — consolidate into catalog_media, drop.

### ℹ️ Minor
7. **catalog_oem_crossref near-empty** — 19 rows, needs mass extraction.
8. **catalog_fitment sparse** — 15% coverage, extraction pipeline needed.
9. **catalog_product_enrichment orphans** — 172K rows vs 78K products, needs reconcile.

---

## IMPORTANT OPERATIONAL NOTES

### Before Any Bulk Delete/DDL
1. Stop Next.js dev server — it holds AccessShareLocks on catalog_products
2. Kill other blocking connections: `SELECT pg_terminate_backend(pid) FROM pg_locks WHERE relation::regclass::text = 'catalog_products' AND pid != pg_backend_pid();`
3. Use temp table pattern for ID sets (NOT IN on 479K rows hangs)
4. Drop catalog_images FK constraints before deleting from catalog_products

### Query Performance
- `NOT IN (large subquery)` — hangs, use `NOT EXISTS` or temp table
- `NOT EXISTS` with index on allowlist.sku — fast
- Temp table with index — fastest for repeated use in same session

### vendor_code Casing
Always lowercase: 'wps' not 'WPS', 'pu' not 'PU'

---

*Master Reference maintained by Claude — Last update: April 16, 2026*
