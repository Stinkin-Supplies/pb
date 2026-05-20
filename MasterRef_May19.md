# Stinkin' Supplies — Master Reference
**Last Updated:** May 19, 2026 (Twenty-Third Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog stable ✅ | VTwin promoted ✅ | PU enriched ✅ | catalog_media rebuilt ✅ | Fitment 20% coverage

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified total | 134,404 rows | ✅ |
| — WPS (HardDrive only) | 22,278 (14,247 active) | ✅ |
| — PU (Drag Part=Y) | 37,028 (36,238 active) | ✅ Enriched — rebuild unified to pick up |
| — VTWIN | 37,749 (all active) | ✅ Promoted May 19 |
| Typesense | 88,234 docs | ✅ Current |
| catalog_fitment_v2 | ~1.54M rows | ✅ JW Boon + PU + OEM |
| oem_fitment | 379,899 rows | ✅ All families |
| catalog_media | 32,718 rows | ✅ Rebuilt May 19 — FK → catalog_unified |
| products with fitment | 17,431 (20%) | ✅ |
| catalog_unified categories | 24 distinct + VTWIN 28 | ✅ |
| vendor_offers | 0 rows | ⚠️ Needs rebuild |
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
# → pu_products_filtered (Drag Part=Y only)

# Step 2: WPS master
node scripts/ingest/wps-master-item-import.cjs scripts/data/wps/master_item_wps.csv
# → wps_catalog (harddrive_catalog=true = ~9,742)

# Step 3: PU XML enrichment (NEW — replaces import_pu_brand_catalogs_WORKING.js)
node scripts/ingest/enrich_pu_xml_comprehensive.js
# → pu_catalog enriched (features, images, pricing, OEM, dimensions)
# Source: scripts/data/pu_pricefile/brand_files/*.xml (133 files)

# Step 4: Merge vendors
node scripts/ingest/merge_vendors.js
# → catalog_unified (WPS + PU)
# ⚠️ Drops/rebuilds catalog_unified — drop FK constraints first (see REBUILD PROCEDURE)

# Step 5: VTwin
node scripts/ingest/ingest_vtwin_unified.js
# → catalog_unified += VTwin (sources from vtwin_catalog directly)

# Step 6: VTwin categories
node scripts/ingest/infer_vtwin_categories.mjs --live
# → catalog_unified VTWIN rows get category assigned

# Step 7: JW Boon fitment
node scripts/ingest/import_jwboon_fitment_v2.mjs
# → catalog_fitment_v2

# Step 8: OEM fitment
node scripts/ingest/build_oem_fitment.mjs
node scripts/ingest/build_oem_fitment_softail.mjs
node scripts/ingest/build_oem_fitment_dyna.mjs
node scripts/ingest/build_oem_fitment_touring.mjs
node scripts/ingest/build_oem_fitment_fx.mjs
# → oem_fitment

# Step 9: PU fitment
node scripts/ingest/import_pu_fitment.mjs
# → catalog_fitment_v2 + catalog_oem_crossref

# Step 10: vendor_offers
node scripts/ingest/populate_wps_vendor_offers.js
# → vendor_offers (source: wps_catalog, NOT raw_vendor_wps_products)

# Step 11: Typesense reindex
node scripts/ingest/index_unified.js --recreate
```

---

## CATALOG_UNIFIED REBUILD PROCEDURE

```sql
-- BEFORE running merge_vendors.js:
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

Tabs display alphabetically with "All Parts" pinned first.

---

## ERA COVERAGE TIERS

| Slug | Coverage | Products | Notes |
|------|----------|----------|-------|
| milwaukee-8 | full | High | |
| twin-cam | full | High | |
| evolution | full | High | Routes to era page — no family tile |
| evo-sportster | full | High | |
| shovelhead | full | 1,028 | |
| ironhead-sportster | full | High | |
| chopper | full | — | |
| flathead | limited | 26 | LimitedBanner shown. flathead.webp missing |
| knucklehead | limited | 30 | LimitedBanner shown. Real codes: EL, ELH |
| panhead | limited | 1 | LimitedBanner shown. Real codes: FL, FLH, FLF, FLHF, FLE |

ERA_COVERAGE map is in `app/era/[slug]/page.jsx` — update when data improves.

---

## VENDOR_OFFERS REBUILD NOTES

Old script referenced `raw_vendor_wps_products` which does not exist. New approach:
- Source: `wps_catalog` (22,278 rows, harddrive_catalog=true filtered during ingest)
- WPS warehouse → vendor_offers state column mapping:
  - `warehouse_boise` → `id_qty`
  - `warehouse_fresno` → `ca_qty`
  - `warehouse_elizabethtown` → `pa_qty`
  - `warehouse_ashley` → `in_qty`
  - `warehouse_midlothian` → `tx_qty`
  - `warehouse_jessup` → `ga_qty`
  - `warehouse_midway` → `nv_qty`
  - nc_qty = 0
- Script: `scripts/ingest/populate_wps_vendor_offers.js`
- Unique constraint: `(catalog_product_id, vendor_code)`

---

## HARLEY_MODELS — FILTER GROUP ASSIGNMENTS

Key filter_groups and what they mean:
- `ROAD_KING` — Road King variants (FLHR, FLHRC, FLHRSE...)
- `ROAD_GLIDE` — Road Glide variants (FLTR, FLTRX, FLTRU...)
- `STREET_GLIDE` — Street Glide variants (FLHX, FLHXS...)
- `TOURING` — Electra Glide + general touring (FLHT, FLHTC, FLHTCU...)
- `TRIKE` — All trike variants (FLHTCUTG, FLHXXX, FLTRT...)
- `SOFTAIL` — General Softail (FXST, FLSTC, FXSB...)
- `FAT_BOY` — Fat Boy (FLSTF, FLFB...)
- `HERITAGE` — Heritage Softail (FLST, FLSTC...)
- `LOW_RIDER` — Low Rider (FXLR, FXLRS, FXLRST)
- `FXR` — FXR family (FXR, FXRS, FXRT, FXRD...)
- `SUPER_GLIDE` — Super Glide / FX era (FXRDG, FXWG, FXDG...)
- `DYNA` — Dyna (FXD, FXDB, FXDL, FXDRS...)
- `SPORTSTER` — All Sportster (XL883, XL1200, XLH...)
- `REVOLUTION_MAX` — Pan America, Nightster (RA1250, RH975...)
- `VINTAGE` — Pre-1966 (flathead, knucklehead, panhead, early shovel)
- `EVOLUTION` — evolution_bigtwin (1984-1999 catch-all)

---

## KNOWN SCRIPT ISSUES & FIXES

| Script | Issue | Fix Applied |
|--------|-------|-------------|
| All build_oem_fitment*.mjs | IPv6 hardcoded | sed replaced with 5.161.100.126 |
| All build_oem_fitment*.mjs | python3 path | /usr/bin/python3 in execSync |
| import_jwboon_fitment_v2.mjs | IPv6 hardcoded | Replaced with 5.161.100.126 |
| ingest_vtwin_unified.js | Referenced vendor.vtwinmtc_products | Rewritten — sources from vtwin_catalog directly |
| populate_wps_vendor_offers.js | Referenced raw_vendor_wps_products | Needs rewrite — source from wps_catalog |
| enrich_pu_catalog_xml.js | COALESCE-skipped all fields, missed pricing/multi-image | Replaced by enrich_pu_xml_comprehensive.js |
| wps-master-item-import.js | ES module error | Renamed to .cjs |
| wps-master-item-import.cjs | Duplicate isValid() | Removed at line 223 |
| merge_vendors.js | CASCADE drop wipes fitment | Drop FK constraints before, re-add after |
| merge_vendors.js | v_catalog_fitment view | Drop view before DROP TABLE, recreate after |
| import_pu_filtered.js | Wrong filter | Filter on Drag Part=Y, not product code |
| import_pu_fitment.mjs | chunk not defined | Fixed — was oemChunk, loop iterated Map not array |
| Any route handler | params not Promise | Next.js 15+ — always await params before destructuring |

---

## PUBLIC SCHEMA — TABLE INVENTORY

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 134,404 | 88,234 active |
| catalog_fitment_v2 | ~1.54M | ✅ JW Boon + PU + OEM |
| oem_fitment | 379,899 | ✅ All families |
| catalog_products | 146,989 | WPS+PU raw pipeline — legacy |
| pu_catalog | 36,684 | ✅ Fully enriched May 19 |
| pu_brand_enrichment | 93,585 | ✅ |
| wps_catalog | 22,278 | ✅ Source for vendor_offers rebuild |
| vtwin_catalog | 37,749 | ✅ oem_numbers consolidated May 19 |
| vtwin_oem_crossref | 12,278 | ⚠️ Not yet ingested to catalog_fitment_v2 |
| catalog_media | 32,718 | ✅ Rebuilt May 19 — FK → catalog_unified |
| harley_models | 299 | ✅ DO NOT bulk modify |
| harley_model_years | ~2,230 | ✅ DO NOT MODIFY |
| harley_families | 17 | ✅ DO NOT MODIFY — no slug column, derive via CASE |
| model_filter_groups | 81 | Cross-membership rows |
| hd_engine_types | 15 | ✅ DO NOT MODIFY |
| vendor_offers | 0 | ⚠️ Needs rebuild |
| catalog_oem_crossref | ~10,953 | ✅ |
| product_fitment_year_model | 0 | ⚠️ Needs repopulation |
| model_alias_map | 347 | Search aliases |
| user_garage | 1 | |

---

## OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| IPv6 on Vercel | Never use 2a01:4ff — use CATALOG_DATABASE_URL |
| psql IPv6 | Quote URL: psql 'postgresql://...' |
| Next.js 15 params | params is Promise in route handlers — await before destructuring |
| catalog_unified rebuild | See REBUILD PROCEDURE — catalog_media FK must also be dropped |
| pdfplumber subprocess | Use /usr/bin/python3 in execSync |
| zsh heredoc | Edit file directly — heredoc fails on special chars |
| zsh bracket paths | Use quotes: "/path/to/[slug]/file.jsx" |
| Vercel env vars | Use printf not echo (avoids \n in vars) |
| IS_GROUPS_COLLECTION | Must stay = false in lib/typesense/client.ts |
| WPS filter | harddrive_catalog=true in wps_catalog |
| PU filter | Drag Part=Y in BasePriceFile.csv |
| COPY TO file | Use \copy — catalog_app not superuser |
| catalog_specs | DROPPED — any script referencing it will fail |
| catalog_brands | DROPPED — rebuild from vendor data |
| BottomNav spacer | height must stay 0 — was 82, caused global gap |
| Sticky tab offset | top: 0 not top: 52 — no global navbar exists |
| NavBar import | components/NavBar.tsx is a shim re-exporting BottomNav |
| motion/react import | Use framer-motion not motion/react |
| zsh ! in python -c | Write to /tmp/script.py and run with python3 instead |
| catalog_media FK | Now points to catalog_unified(id) — was catalog_products(id) |
| vendor_offers FK | Points to catalog_unified(id) — integer not UUID |
| raw_vendor_wps_products | Does NOT exist — use wps_catalog instead |
| VTWIN source_vendor | Must be uppercase 'VTWIN' — old rows used this, keep consistent |
| pu_catalog varchar cols | uom, part_status now TEXT — widened May 19 |

---

## KEY COMMANDS

```bash
# Connect
ssh stinkdb
psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog"

# PU enrichment
node scripts/ingest/enrich_pu_xml_comprehensive.js --dry
node scripts/ingest/enrich_pu_xml_comprehensive.js

# Full catalog rebuild
node scripts/ingest/import_pu_filtered.js
node scripts/ingest/wps-master-item-import.cjs scripts/data/wps/master_item_wps.csv
node scripts/ingest/enrich_pu_xml_comprehensive.js
node scripts/ingest/merge_vendors.js
node scripts/ingest/ingest_vtwin_unified.js
node scripts/ingest/infer_vtwin_categories.mjs --live

# Fitment rebuild
node scripts/ingest/import_jwboon_fitment_v2.mjs
node scripts/ingest/build_oem_fitment.mjs
node scripts/ingest/build_oem_fitment_softail.mjs
node scripts/ingest/build_oem_fitment_dyna.mjs
node scripts/ingest/build_oem_fitment_touring.mjs
node scripts/ingest/build_oem_fitment_fx.mjs
node scripts/ingest/import_pu_fitment.mjs

# Category labels
python3 ~/Downloads/apply_category_labels.py

# Typesense
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Git
git add -A && git commit -m "message" && git push
```
