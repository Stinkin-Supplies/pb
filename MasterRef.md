# Stinkin' Supplies — Master Reference
**Last Updated:** May 23, 2026 (Twenty-Eighth Pass — Addendum)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog stable ✅ | Variants live ✅ | Era pages live ✅ | WPS fitment live ✅ | Typesense current ✅ | OEM crossref rebuilt ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified total | 96,711 rows | ✅ Rebuilt May 20 |
| — WPS | 22,278 | ✅ wps_product_id backfilled |
| — PU | 36,684 | ✅ Enriched |
| — VTWIN | 37,749 | ✅ Categories cleaned |
| catalog_unified in_fatbook | 32,577 | ✅ Updated May 23 |
| catalog_unified in_oldbook | 17,049 | ✅ Updated May 23 |
| catalog_unified oem_numbers[] | 33,890 products | ✅ Rebuilt May 23 from crossref |
| Typesense | 90,276 docs | ✅ Reindexed May 23 |
| catalog_fitment_v2 | 2,245,762 rows | ✅ WPS gap fix May 23 (+98,410 rows) |
| wps_catalog.fitment | 5,810 items with Harley fitment | ✅ May 22 |
| wps_vehicles | 44,709 rows | ✅ Loaded May 22 |
| oem_fitment | 379,899 rows | ✅ All families |
| catalog_oem_crossref | 55,122 rows | ✅ +fatbook_page + oldbook_page May 23 |
| catalog_media | 32,718 rows | ✅ FK → catalog_unified |
| vendor_offers | 22,278 rows | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 rows | ✅ |
| pu_fitment_parsed | 393,202 rows | ✅ |
| pu_fitment_expanded | 1,640,065 rows | ✅ Promoted |
| catalog_variant_groups | 2,901 | ✅ |
| catalog_variant_members | 19,460 | ✅ 97 bad rows purged May 23 |
| era_* columns | 17,808 products tagged | ✅ Re-run May 23 with corrected era→family mapping |
| harley_models | 299 | ✅ |
| harley_model_years | ~2,230 | ✅ |

---

## DATABASE CONNECTION

```
Host (local/psql): 2a01:4ff:f0:fa6f::1 (IPv6)
Host (Vercel):     Use CATALOG_DATABASE_URL env var (IPv4 only)
Port:              5432
Database:          stinkin_catalog
User:              catalog_app
Password:          smelly
SSH Alias:         ssh stinkdb
psql:              psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog"
Vercel env:        CATALOG_DATABASE_URL
```

⚠️ NEVER use IPv6 in Vercel-deployed code — Vercel does not support IPv6.
⚠️ catalog_app is NOT superuser — use \copy not COPY TO file.
⚠️ Next.js 15+: params in route handlers is Promise — always await params.
⚠️ Use getCatalogDb() from @/lib/db/catalog in all new API routes.
⚠️ getCatalogDb() returns a SHARED POOL — never call db.end() in API routes.
⚠️ pg Client with IPv6: pass { host, user, password, database } object — never a URL string.

---

## ROUTING STRUCTURE

```
/modelshop                          → app/modelshop/ModelShop.tsx (family tile grid)
/harley/[family]                    → app/harley/[family]/page.tsx (model group tiles)
/harley/[family]/[model]            → app/harley/[family]/[model]/page.tsx (product grid)
/era                                → app/era/page.tsx (era carousel)
/era/[slug]                         → app/era/[slug]/page.jsx (era product grid)
/browse                             → app/browse/page.jsx (product grid + filter)
/browse/[slug]                      → app/browse/[slug]/ (PDP)
/browse/[slug] variants             → /api/browse/variants/[productId] (variant siblings)
/search                             → app/search/
/garage                             → app/garage/
```

### Family → Slug Map
| Family | Slug | filter_groups |
|--------|------|---------------|
| Touring | touring | ROAD_KING, ROAD_GLIDE, STREET_GLIDE, TOURING, TRIKE |
| Softail | softail | SOFTAIL, FAT_BOY, HERITAGE, LOW_RIDER |
| Sportster | sportster | SPORTSTER |
| Dyna | dyna | DYNA |
| FXR | fxr | FXR, SUPER_GLIDE |
| Vintage | vintage | VINTAGE |
| Revolution Max | revolution-max | REVOLUTION_MAX |
| Trike | trike | TRIKE |

---

## CATALOG PIPELINE — CANONICAL ORDER

```bash
# Step 1: PU filtered
node scripts/ingest/import_pu_filtered.js
# → pu_catalog (Drag Part=Y only)

# Step 2: WPS master
node scripts/ingest/wps-master-item-import.cjs scripts/data/wps/master_item_wps.csv
# → wps_catalog

# Step 3: PU XML enrichment
node scripts/ingest/enrich_pu_xml_comprehensive.js
# → pu_catalog enriched (features, images, pricing, OEM, dimensions)

# Step 4: Merge all vendors
node scripts/ingest/merge_catalog_unified.js
# → catalog_unified (WPS + PU + VTwin)
# ⚠️ Drops/rebuilds catalog_unified — drop FK constraints first (see REBUILD PROCEDURE)

# Step 5: VTwin categories
node scripts/ingest/infer_vtwin_categories.mjs --live

# Step 6: JW Boon fitment
node scripts/ingest/import_jwboon_fitment_v2.mjs

# Step 7: OEM fitment
node scripts/ingest/build_oem_fitment.mjs
node scripts/ingest/build_oem_fitment_softail.mjs
node scripts/ingest/build_oem_fitment_dyna.mjs
node scripts/ingest/build_oem_fitment_touring.mjs
node scripts/ingest/build_oem_fitment_fx.mjs

# Step 8: PU fitment (from XML/DB)
node scripts/ingest/import_pu_fitment.mjs

# Step 9: PU fitment scrape (from scraped CSV)
node scripts/ingest/ingest_pu_fitment_scrape.cjs
# Source: /Users/home/Desktop/ds-fitment-scraper/catalog_fitment_enriched.csv

# Step 10: PU fitment promote
node scripts/ingest/promote_pu_fitment.cjs --dry   # check first
node scripts/ingest/promote_pu_fitment.cjs
# → inserts pu_fitment_expanded into catalog_fitment_v2 (source='PU')

# Step 11: VTwin fitment
node scripts/ingest/ingest_vtwin_fitment.cjs --dry
node scripts/ingest/ingest_vtwin_fitment.cjs
# → vtwin_oem_crossref → catalog_fitment_v2 (source='VTWIN')

# Step 12: WPS fitment
node scripts/ingest/import_wps_fitment.mjs
# → wps_vehicles table (44,709 rows from CSV), wps_catalog.fitment JSONB
# CSV source: scripts/data/wps/1779424242-1856360.csv
# Uses taxonomyterms/196 (Hard Drive) API — no vehicle:read scope needed
# Stores raw_vehicle_ids + vehicles + harley_vehicles per item

node scripts/ingest/promote_wps_fitment.cjs
# → wps_catalog.fitment -> harley_vehicles[] → catalog_fitment_v2 (fitment_source='wps')
# Join: wps_catalog.sku → catalog_unified.vendor_sku
# 702,633 rows inserted (May 22). 19,810 unresolved (model name mismatches)

# Step 13: vendor_offers
node scripts/ingest/populate_wps_vendor_offers.cjs

# Step 14: WPS product IDs (for variant grouping)
node scripts/ingest/backfill_wps_product_ids.cjs
# → wps_catalog.wps_product_id + wps_item_id

# Step 15: Variant groups
node scripts/ingest/build_variant_groups.cjs
# → catalog_variant_groups, catalog_variant_members

# Step 16: FatBook / OldBook crossref
node scripts/ingest/import_fatbook_crossref.cjs scripts/ingest/fatbookcrossref.txt
node scripts/ingest/import_oldbook_crossref.cjs scripts/ingest/oldbookcrossref.txt
# → catalog_oem_crossref (fatbook_page, oldbook_page columns)
# → catalog_unified in_fatbook / in_oldbook flags

# Step 17: OEM numbers rebuild
psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]/stinkin_catalog" -c "
UPDATE catalog_unified cu
SET oem_numbers = (
  SELECT array_agg(DISTINCT xr.oem_number ORDER BY xr.oem_number)
  FROM catalog_oem_crossref xr WHERE xr.sku = cu.sku
)
WHERE EXISTS (SELECT 1 FROM catalog_oem_crossref xr WHERE xr.sku = cu.sku);
UPDATE catalog_unified SET oem_numbers = NULL
WHERE (oem_numbers IS NOT NULL AND oem_numbers != '{}')
  AND NOT EXISTS (SELECT 1 FROM catalog_oem_crossref xr WHERE xr.sku = catalog_unified.sku);
"

# Step 18: Era column backfill (SQL — run after fitment is populated)
# See ERA BACKFILL SQL below

# Step 19: Typesense reindex
node scripts/ingest/index_unified.js --recreate
```

---

## ERA BACKFILL SQL

Run after catalog_fitment_v2 is populated (or re-populated):

```sql
UPDATE catalog_unified cu SET
  era_flathead      = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id = 23),
  era_knucklehead   = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id = 17),
  era_panhead       = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hmy.year BETWEEN 1948 AND 1965),
  era_shovelhead    = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id = 19),
  era_ironhead      = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id = 3 AND hmy.year <= 1985),
  era_evo_sportster = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id = 3 AND hmy.year BETWEEN 1986 AND 2003),
  era_evolution     = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hmy.year BETWEEN 1984 AND 1999 AND hm.family_id IN (SELECT id FROM harley_families WHERE name IN ('Touring','Softail','Dyna','FXR','Evolution'))),
  era_twin_cam      = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hmy.year BETWEEN 1999 AND 2017 AND hm.family_id IN (SELECT id FROM harley_families WHERE name IN ('Touring','Softail','Dyna'))),
  era_milwaukee8    = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hmy.year >= 2017 AND hm.family_id IN (SELECT id FROM harley_families WHERE name IN ('Touring','Softail','Trike'))),
  era_chopper       = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id IN (SELECT id FROM harley_families WHERE name IN ('FXR','Dyna','Softail')));
```

---

## CATALOG_OEM_CROSSREF SCHEMA

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| sku | TEXT | Normalized DS part number (no dashes) |
| oem_number | TEXT | HD OEM part number |
| oem_manufacturer | TEXT | 'HD' for all FatBook/OldBook rows |
| fatbook_page | INTEGER | FatBook page reference |
| oldbook_page | INTEGER | OldBook page reference |
| page_reference | TEXT | Legacy |
| source | TEXT | 'fatbook_crossref' or 'oldbook_crossref' |
| source_file | TEXT | |
| created_at | TIMESTAMP | |

Unique constraint: `(sku, oem_number, oem_manufacturer)`

Crossref files:
- `scripts/ingest/fatbookcrossref.txt` — 3,948 rows, 3,354 distinct DS SKUs
- `scripts/ingest/oldbookcrossref.txt` — source: `1779569140000_oldbook_crossref.txt`

---

## KNOWN SCRIPT ISSUES / FIXES APPLIED

| Script | Issue | Fix Applied |
|--------|-------|-------------|
| All build_oem_fitment*.mjs | IPv6 hardcoded | sed replaced with 5.161.100.126 |
| All build_oem_fitment*.mjs | python3 path | /usr/bin/python3 in execSync |
| import_jwboon_fitment_v2.mjs | IPv6 hardcoded | Replaced with 5.161.100.126 |
| merge_vendors.js | Sources from catalog_products | REPLACED by merge_catalog_unified.js |
| populate_wps_vendor_offers.js | Referenced raw_vendor_wps_products | REPLACED by populate_wps_vendor_offers.cjs |
| populate_wps_vendor_offers.cjs | harddrive_catalog = true join gives 0 | Use `IS NOT FALSE` |
| enrich_pu_catalog_xml.js | COALESCE-skipped all fields | Replaced by enrich_pu_xml_comprehensive.js |
| wps-master-item-import.js | ES module error | Renamed to .cjs |
| wps-master-item-import.cjs | Duplicate isValid() | Removed at line 223 |
| import_pu_fitment.mjs | chunk not defined | Fixed |
| Any route handler | params not Promise | Next.js 15+ — always await params |
| ingest_pu_fitment_scrape.cjs | Individual inserts slow | ~12+ hrs for 1.67M rows — batch TBD |
| variants route.ts | db.end() on shared pool | Removed — getCatalogDb() is shared, never call end() |
| build_variant_groups.cjs | brand_name doesn't exist | Use `brand` column — auto-detected now |
| WPS API single item lookup | Expects integer ID not SKU string | Use taxonomyterms/196/items?include=vehicles instead |
| promote_pu_fitment.cjs | Column names vary | Auto-introspects — detects sku/vendor_sku/part_number |
| ingest_vtwin_fitment.cjs | Crossref structure unknown | Auto-detects Strategy A (year+model) or B (OEM cross-ref) |
| promote_wps_fitment.cjs | vendor_item_id / wps_item_id don't exist on cu | Join on vendor_sku = wc.sku |
| import_wps_fitment.mjs | vehicle:read scope 403 | Use taxonomyterms/196 items endpoint — no vehicle scope needed |
| import_fatbook_crossref.cjs | pg Client IPv6 URL string fails | Pass { host, user, password, database } object |
| import_fatbook_crossref.cjs | ON CONFLICT duplicate source rows | DISTINCT ON (sku, oem_number) before upsert |

---

## PUBLIC SCHEMA — TABLE INVENTORY

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 | 90,276 active — rebuilt May 20 |
| catalog_fitment_v2 | 2,245,762 | ✅ WPS gap fix May 23 |
| oem_fitment | 379,899 | ✅ All families |
| catalog_products | 146,989 | Legacy — no longer used in pipeline |
| pu_catalog | 36,684 | ✅ Fully enriched |
| pu_brand_enrichment | 93,585 | ✅ |
| wps_catalog | 22,278 | ✅ + wps_product_id, wps_item_id, fitment columns |
| wps_vehicles | 44,709 | ✅ Loaded May 22 from WPS vehicle master CSV |
| vtwin_catalog | 37,749 | ✅ oem_numbers consolidated |
| vtwin_oem_crossref | 12,278 | ✅ Promoted |
| catalog_media | 32,718 | ✅ FK → catalog_unified |
| vendor_offers | 22,278 | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 | ✅ |
| pu_fitment_parsed | 393,202 | ✅ |
| pu_fitment_expanded | 1,640,065 | ✅ Promoted |
| catalog_oem_crossref | 55,122 | ✅ +fatbook_page +oldbook_page May 23 |
| catalog_variant_groups | 2,901 | ✅ |
| catalog_variant_members | 19,460 | ✅ 97 bad rows purged May 23 |
| harley_models | 299 | ✅ DO NOT bulk modify |
| harley_model_years | ~2,230 | ✅ DO NOT MODIFY |
| harley_families | 17 | ✅ DO NOT MODIFY — no slug column |
| model_filter_groups | 81 | Cross-membership rows |
| hd_engine_types | 15 | ✅ DO NOT MODIFY |
| model_alias_map | 347 | Search aliases |
| user_garage | 1 | |
| product_fitment_year_model | 0 | ⚠️ Needs repopulation |

---

## OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| IPv6 on Vercel | Never use 2a01:4ff — use CATALOG_DATABASE_URL |
| psql IPv6 | Quote URL: psql 'postgresql://...' |
| pg Client IPv6 | Pass { host, user, password, database } object — never a URL string |
| Next.js 15 params | params is Promise in route handlers — await before destructuring |
| catalog_unified rebuild | Use merge_catalog_unified.js — not merge_vendors.js (legacy) |
| catalog_unified WPS join | Join on vendor_sku not sku — WPS rows have WPS- prefix in sku |
| harddrive_catalog boolean | Use IS NOT FALSE — `= true` gives 0 results |
| getCatalogDb() | Returns shared pool — NEVER call db.end() in API routes |
| WPS API item lookup | Use taxonomyterms/196/items?include=vehicles — /items/{sku} expects integer ID |
| WPS vehicle scope | vehicle:read scope NOT needed — vehicles come via include= on items endpoint |
| WPS fitment join | wps_catalog.sku → catalog_unified.vendor_sku (not cu.sku, not cu.wps_item_id) |
| WPS attributes | No cable length attribute — length only in name for Indian cables |
| Variant labels (cables) | 70 groups identical-named — labels populate after WPS fitment files |
| catalog_unified.brand | Column is `brand` not `brand_name` (brand_name doesn't exist) |
| catalog_unified.id in PDP | Use unified_id from query — COALESCE(cp.id, cu.id) gives wrong ID |
| pdfplumber subprocess | Use /usr/bin/python3 in execSync |
| zsh heredoc | Edit file directly — heredoc fails on special chars |
| zsh bracket paths | Use quotes: "/path/to/[slug]/file.jsx" |
| macOS sed -i | Requires empty string arg: sed -i '' 's/old/new/' file |
| styled-jsx in App Router | Not supported — use inline styles throughout |
| VTWIN source_vendor | Must be uppercase 'VTWIN' |
| era_* columns | Re-run ERA BACKFILL SQL after each fitment update |
| catalog_variants | Does NOT exist — replaced by catalog_variant_members |
| CartContext / addItem | Placeholder only — not wired to real cart |
| VTwin categories | GROUP suffix stripped May 20 — old category map is stale |
| FilterSidebar mobileSheet | Pass mobileSheet={true} for bottom sheet, mobileSheet={false} for desktop sidebar |
| BottomNav filter event | On /browse, hamburger fires `stinkin:filterToggle` — browse page must have listener |
| catalog_oem_crossref unique key | (sku, oem_number, oem_manufacturer) — always include oem_manufacturer='HD' on insert |
| oem_numbers[] on catalog_unified | Rebuilt from catalog_oem_crossref — do NOT populate from any other source |

---

## KEY COMMANDS

```bash
# Connect
ssh stinkdb
psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog"

# PU enrichment
node scripts/ingest/enrich_pu_xml_comprehensive.js --dry
node scripts/ingest/enrich_pu_xml_comprehensive.js

# Full catalog rebuild (canonical order)
node scripts/ingest/import_pu_filtered.js
node scripts/ingest/wps-master-item-import.cjs scripts/data/wps/master_item_wps.csv
node scripts/ingest/enrich_pu_xml_comprehensive.js
node scripts/ingest/merge_catalog_unified.js
node scripts/ingest/infer_vtwin_categories.mjs --live

# Fitment rebuild
node scripts/ingest/import_jwboon_fitment_v2.mjs
node scripts/ingest/build_oem_fitment.mjs
node scripts/ingest/build_oem_fitment_softail.mjs
node scripts/ingest/build_oem_fitment_dyna.mjs
node scripts/ingest/build_oem_fitment_touring.mjs
node scripts/ingest/build_oem_fitment_fx.mjs
node scripts/ingest/import_pu_fitment.mjs

# PU fitment scrape + promote
node scripts/ingest/ingest_pu_fitment_scrape.cjs --dry
node scripts/ingest/ingest_pu_fitment_scrape.cjs
node scripts/ingest/promote_pu_fitment.cjs --dry
node scripts/ingest/promote_pu_fitment.cjs

# VTwin fitment
node scripts/ingest/ingest_vtwin_fitment.cjs --dry
node scripts/ingest/ingest_vtwin_fitment.cjs

# WPS fitment
node scripts/ingest/import_wps_fitment.mjs
node scripts/ingest/promote_wps_fitment.cjs

# vendor_offers
node scripts/ingest/populate_wps_vendor_offers.cjs --dry
node scripts/ingest/populate_wps_vendor_offers.cjs

# Variant system
node scripts/ingest/backfill_wps_product_ids.cjs --dry
node scripts/ingest/backfill_wps_product_ids.cjs
node scripts/ingest/build_variant_groups.cjs --dry
node scripts/ingest/build_variant_groups.cjs

# FatBook / OldBook crossref
node scripts/ingest/import_fatbook_crossref.cjs scripts/ingest/fatbookcrossref.txt
node scripts/ingest/import_oldbook_crossref.cjs scripts/ingest/oldbookcrossref.txt

# OEM numbers rebuild (run after crossref import)
psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]/stinkin_catalog" -c "
UPDATE catalog_unified cu SET oem_numbers = (SELECT array_agg(DISTINCT xr.oem_number ORDER BY xr.oem_number) FROM catalog_oem_crossref xr WHERE xr.sku = cu.sku) WHERE EXISTS (SELECT 1 FROM catalog_oem_crossref xr WHERE xr.sku = cu.sku);
UPDATE catalog_unified SET oem_numbers = NULL WHERE (oem_numbers IS NOT NULL AND oem_numbers != '{}') AND NOT EXISTS (SELECT 1 FROM catalog_oem_crossref xr WHERE xr.sku = catalog_unified.sku);
"

# Typesense
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Git
git add -A && git commit -m "message" && git push
```

---

## TWENTY-EIGHTH PASS ADDITIONS (May 23, 2026) — ADDENDUM

### FatBook + OldBook Crossref — Live
- `import_fatbook_crossref.cjs` — OEM→DS part number crossref from FatBook index
- `import_oldbook_crossref.cjs` — OEM→DS part number crossref from OldBook index
- `fatbook_page` + `oldbook_page` columns added to `catalog_oem_crossref`
- 55,122 total crossref rows, 3,940 with FatBook pages, 2,643 with OldBook pages
- `catalog_unified.oem_numbers[]` fully rebuilt — 33,890 products with verified OEM arrays
- 14,936 stale/incorrect OEM entries cleared

### catalog_oem_crossref State (May 23)
- Total rows: 55,122
- With fatbook_page: 3,940
- With oldbook_page: 2,643
- Source breakdown: fatbook_crossref + oldbook_crossref + prior imports

---

## TWENTY-SEVENTH PASS ADDITIONS (May 22, 2026)

### WPS Fitment Pipeline — Live
Full WPS fitment pipeline built and run:
- `wps_vehicles` table created (44,709 rows from vehicle master CSV)
- `wps_catalog.fitment` JSONB column populated — 5,810 items with Harley vehicle data
- `wps_catalog.fitment_updated_at` timestamp column added
- `promote_wps_fitment.cjs` — promotes harley_vehicles[] to catalog_fitment_v2
- 702,633 fitment rows inserted, 27,342 skipped as dupes
- Era backfill re-run: 18,793 products tagged (up from 13,773)
- Typesense reindexed: 90,276 docs, 0 errors

### catalog_fitment_v2 Source Breakdown (May 23)
- Total: 2,245,762 rows
- WPS (fitment_source='wps'): 704,480
- PU + VTwin + OEM + JW Boon: stored with NULL fitment_source (~1,541,282)
- oem_crossref: 554
