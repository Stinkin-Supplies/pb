# Stinkin' Supplies — Master Reference
**Last Updated:** May 20, 2026 (Twenty-Fourth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog stable ✅ | VTwin promoted ✅ | PU enriched ✅ | catalog_media rebuilt ✅ | Fitment ~20% coverage | pu_fitment_expanded INSERT IN PROGRESS ⚠️

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified total | 96,711 rows | ✅ Rebuilt May 20 |
| — WPS | 22,278 | ✅ Sourced from wps_catalog |
| — PU | 36,684 | ✅ Enriched |
| — VTWIN | 37,749 | ✅ |
| Typesense | 90,276 docs | ✅ Current |
| catalog_fitment_v2 | ~1.54M rows | ✅ JW Boon + PU + OEM |
| oem_fitment | 379,899 rows | ✅ All families |
| catalog_media | 32,718 rows | ✅ FK → catalog_unified |
| vendor_offers | 22,278 rows | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 rows | ✅ Inserted May 20 |
| pu_fitment_parsed | 393,202 rows | ✅ Inserted May 20 |
| pu_fitment_expanded | ~1.07M (target 1.67M) | ⚠️ INSERT IN PROGRESS — do not touch DB |
| era_* columns | all 0 | ⚠️ Needs backfill after expanded finishes |
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

---

## ROUTING STRUCTURE

```
/modelshop                          → app/modelshop/ModelShop.tsx (family tile grid)
/harley/[family]                    → app/harley/[family]/page.tsx (model group tiles)
/harley/[family]/[model]            → app/harley/[family]/[model]/page.tsx (product grid)
/era                                → app/era/page.tsx (era carousel)
/era/[slug]                         → app/era/[slug]/page.jsx (era product grid)
/browse/[slug]                      → app/browse/[slug]/ (PDP)
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
# Source: scripts/data/pu_pricefile/brand_files/*.xml (133 files)

# Step 4: Merge all vendors (NEW CANONICAL SCRIPT)
node scripts/ingest/merge_catalog_unified.js
# → catalog_unified (WPS + PU + VTwin)
# ⚠️ Drops/rebuilds catalog_unified — drop FK constraints first (see REBUILD PROCEDURE)
# Sources: wps_catalog, pu_catalog, vtwin_catalog directly
# WPS SKUs prefixed WPS-, VTwin prefixed VT-
# vendor_sku stores original vendor sku for joins

# Step 5: VTwin categories
node scripts/ingest/infer_vtwin_categories.mjs --live
# → catalog_unified VTWIN rows get category assigned

# Step 6: JW Boon fitment
node scripts/ingest/import_jwboon_fitment_v2.mjs
# → catalog_fitment_v2

# Step 7: OEM fitment
node scripts/ingest/build_oem_fitment.mjs
node scripts/ingest/build_oem_fitment_softail.mjs
node scripts/ingest/build_oem_fitment_dyna.mjs
node scripts/ingest/build_oem_fitment_touring.mjs
node scripts/ingest/build_oem_fitment_fx.mjs
# → oem_fitment

# Step 8: PU fitment (from XML/DB)
node scripts/ingest/import_pu_fitment.mjs
# → catalog_fitment_v2 + catalog_oem_crossref

# Step 9: PU fitment scrape (from scraped CSV)
node scripts/ingest/ingest_pu_fitment_scrape.cjs
# → pu_fitment, pu_fitment_parsed, pu_fitment_expanded, catalog_oem_crossref
# Source: /Users/home/Desktop/ds-fitment-scraper/catalog_fitment_enriched.csv

# Step 10: vendor_offers
node scripts/ingest/populate_wps_vendor_offers.cjs
# → vendor_offers (source: wps_catalog)
# Join: catalog_unified.vendor_sku = wps_catalog.sku

# Step 11: Typesense reindex
node scripts/ingest/index_unified.js --recreate
```

---

## CATALOG_UNIFIED REBUILD PROCEDURE

```sql
-- BEFORE running merge_catalog_unified.js:
DROP VIEW IF EXISTS v_catalog_fitment;
ALTER TABLE IF EXISTS catalog_fitment_v2 DROP CONSTRAINT IF EXISTS catalog_fitment_v2_product_id_fkey;
ALTER TABLE IF EXISTS product_fitment_year_model DROP CONSTRAINT IF EXISTS product_fitment_year_model_unified_id_fkey;
ALTER TABLE IF EXISTS vendor_offers DROP CONSTRAINT IF EXISTS vendor_offers_catalog_product_id_fkey;
ALTER TABLE IF EXISTS catalog_media DROP CONSTRAINT IF EXISTS catalog_media_product_id_fkey;

-- AFTER full pipeline:
DELETE FROM catalog_fitment_v2 WHERE product_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM product_fitment_year_model WHERE unified_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM vendor_offers WHERE catalog_product_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM catalog_media WHERE product_id NOT IN (SELECT id FROM catalog_unified);

ALTER TABLE catalog_fitment_v2 ADD CONSTRAINT catalog_fitment_v2_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
ALTER TABLE product_fitment_year_model ADD CONSTRAINT product_fitment_year_model_unified_id_fkey
  FOREIGN KEY (unified_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
ALTER TABLE vendor_offers ADD CONSTRAINT vendor_offers_catalog_product_id_fkey
  FOREIGN KEY (catalog_product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
ALTER TABLE catalog_media ADD CONSTRAINT catalog_media_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
```

---

## CATEGORY MAP (24 categories)

| DB Value | Display Label |
|----------|---------------|
| ENGINE GROUP | Engine |
| HANDLEBAR-CONTROLS-MIRRORS GROUP | Controls & Bars |
| BRAKING GROUP | Brakes |
| ELECTRICAL SYSTEM GROUP | Electrical |
| CARBURETION-FUEL GROUP | Carb / Fuel |
| TRANSMISSION-CLUTCH GROUP | Transmission |
| SEATING GROUP | Seats |
| WHEEL AND RIM GROUP | Tires & Wheels |
| LIGHTING-LICENSE GROUP | Lighting |
| HARDWARE GROUP | Hardware |
| FOOT CONTROLS GROUP | Foot Controls |
| EXHAUST GROUP | Exhaust |
| FRAME AND BODY GROUP | Frame & Body |
| MEDIA PRODUCTS GROUP | Swag |
| HELMET AND SHIELD GROUP | Helmets |
| SUSPENSION GROUP-FRONT | Suspension Front |
| TANK GROUP-GAS AND OIL | Tanks |
| DRIVE TRAIN GROUP | Drive Train |
| SECURITY-COVERS-SHELTERS GROUP | Luggage & Covers |
| WINDSHIELD-FAIRING GROUP | Windshield |
| INSTRUMENT GROUP | Gauges |
| SUSPENSION GROUP-REAR | Suspension Rear |
| COMMON MISC GROUP | General |
| TOOLS GROUP | Tools |

---

## ERA COVERAGE TIERS

| Slug | Coverage | Products | Notes |
|------|----------|----------|-------|
| milwaukee-8 | full | High | era_milwaukee8 column — needs backfill |
| twin-cam | full | High | era_twin_cam column — needs backfill |
| evolution | full | High | era_evolution column — needs backfill |
| evo-sportster | full | High | era_evo_sportster column — needs backfill |
| shovelhead | full | 1,028 | era_shovelhead column — needs backfill |
| ironhead-sportster | full | High | era_ironhead column — needs backfill |
| chopper | full | — | era_chopper column — needs backfill |
| flathead | limited | 26 | LimitedBanner shown. flathead.webp missing |
| knucklehead | limited | 30 | LimitedBanner shown. Real codes: EL, ELH |
| panhead | limited | 1 | LimitedBanner shown. Real codes: FL, FLH, FLF, FLHF, FLE |

ERA_COVERAGE map is in `app/era/[slug]/page.jsx` — update when data improves.
⚠️ All era_* columns are 0 after May 20 rebuild — era pages broken until backfilled.

---

## VENDOR_OFFERS SCHEMA

```
catalog_product_id  → catalog_unified(id)
vendor_code         → 'WPS'
vendor_part_number  → wps_catalog.sku (original WPS sku, no prefix)
wholesale_cost      → wps_catalog.dealer_price
msrp                → wps_catalog.list_price
map_price           → wps_catalog.map_price
id_qty              → warehouse_boise
ca_qty              → warehouse_fresno
pa_qty              → warehouse_elizabethtown
in_qty              → warehouse_ashley
tx_qty              → warehouse_midlothian
ga_qty              → warehouse_jessup
nv_qty              → warehouse_midway
nc_qty, wi_qty, ny_qty → 0
total_qty           → sum of all warehouse qtys
```

Unique constraint: `(catalog_product_id, vendor_code)`

---

## KNOWN SCRIPT ISSUES & FIXES

| Script | Issue | Fix Applied |
|--------|-------|-------------|
| All build_oem_fitment*.mjs | IPv6 hardcoded | sed replaced with 5.161.100.126 |
| All build_oem_fitment*.mjs | python3 path | /usr/bin/python3 in execSync |
| import_jwboon_fitment_v2.mjs | IPv6 hardcoded | Replaced with 5.161.100.126 |
| merge_vendors.js | Sources from catalog_products | REPLACED by merge_catalog_unified.js |
| populate_wps_vendor_offers.js | Referenced raw_vendor_wps_products | REPLACED by populate_wps_vendor_offers.cjs |
| populate_wps_vendor_offers.cjs | harddrive_catalog = true join gives 0 | Use `IS NOT FALSE` — boolean comparison quirk |
| enrich_pu_catalog_xml.js | COALESCE-skipped all fields | Replaced by enrich_pu_xml_comprehensive.js |
| wps-master-item-import.js | ES module error | Renamed to .cjs |
| wps-master-item-import.cjs | Duplicate isValid() | Removed at line 223 |
| import_pu_fitment.mjs | chunk not defined | Fixed — was oemChunk, loop iterated Map not array |
| Any route handler | params not Promise | Next.js 15+ — always await params before destructuring |
| ingest_pu_fitment_scrape.cjs | Individual inserts slow | ~12+ hrs for 1.67M expanded rows — batch TBD |

---

## PUBLIC SCHEMA — TABLE INVENTORY

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 | 90,276 active — rebuilt May 20 |
| catalog_fitment_v2 | ~1.54M | ✅ JW Boon + PU + OEM |
| oem_fitment | 379,899 | ✅ All families |
| catalog_products | 146,989 | Legacy — no longer used in pipeline |
| pu_catalog | 36,684 | ✅ Fully enriched |
| pu_brand_enrichment | 93,585 | ✅ |
| wps_catalog | 22,278 | ✅ Source for vendor_offers + unified rebuild |
| vtwin_catalog | 37,749 | ✅ oem_numbers consolidated |
| vtwin_oem_crossref | 12,278 | ⚠️ Not yet ingested to catalog_fitment_v2 |
| catalog_media | 32,718 | ✅ FK → catalog_unified |
| vendor_offers | 22,278 | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 | ✅ Inserted May 20 |
| pu_fitment_parsed | 393,202 | ✅ Inserted May 20 |
| pu_fitment_expanded | ~1.07M (target 1.67M) | ⚠️ INSERT IN PROGRESS |
| catalog_oem_crossref | ~10,953 + scrape OEM | ⚠️ New OEM rows being inserted by scrape |
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
| Next.js 15 params | params is Promise in route handlers — await before destructuring |
| catalog_unified rebuild | Use merge_catalog_unified.js — not merge_vendors.js (legacy) |
| catalog_unified WPS join | Join on vendor_sku not sku — WPS rows have WPS- prefix in sku |
| harddrive_catalog boolean | Use IS NOT FALSE — `= true` gives 0 results due to pg quirk |
| pdfplumber subprocess | Use /usr/bin/python3 in execSync |
| zsh heredoc | Edit file directly — heredoc fails on special chars |
| zsh bracket paths | Use quotes: "/path/to/[slug]/file.jsx" |
| Vercel env vars | Use printf not echo (avoids \n in vars) |
| IS_GROUPS_COLLECTION | Must stay = false in lib/typesense/client.ts |
| WPS filter | harddrive_catalog IS NOT FALSE in wps_catalog |
| PU filter | Drag Part=Y in BasePriceFile.csv |
| COPY TO file | Use \copy — catalog_app not superuser |
| catalog_specs | DROPPED — any script referencing it will fail |
| catalog_brands | DROPPED — rebuild from vendor data |
| BottomNav spacer | height must stay 0 — was 82, caused global gap |
| Sticky tab offset | top: 0 not top: 52 — no global navbar exists |
| NavBar import | components/NavBar.tsx is a shim re-exporting BottomNav |
| motion/react import | Use framer-motion not motion/react |
| zsh ! in python -c | Write to /tmp/script.py and run with python3 instead |
| catalog_media FK | Points to catalog_unified(id) |
| vendor_offers FK | Points to catalog_unified(id) — integer not UUID |
| raw_vendor_wps_products | Does NOT exist — use wps_catalog instead |
| VTWIN source_vendor | Must be uppercase 'VTWIN' |
| pu_catalog varchar cols | uom, part_status now TEXT — widened May 19 |
| era_* columns | All 0 after May 20 rebuild — need backfill before era filter works |
| catalog_variants | Does NOT exist — no real variant data |
| CartContext / addItem | Placeholder only — not wired to real cart |

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

# PU fitment scrape
node scripts/ingest/ingest_pu_fitment_scrape.cjs --dry
node scripts/ingest/ingest_pu_fitment_scrape.cjs

# vendor_offers
node scripts/ingest/populate_wps_vendor_offers.cjs --dry
node scripts/ingest/populate_wps_vendor_offers.cjs

# Typesense
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Git
git add -A && git commit -m "message" && git push
```
