# Stinkin' Supplies — Master Reference
**Last Updated:** May 21, 2026 (Twenty-Fifth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog stable ✅ | Variants live ✅ | Era pages live ✅ | Fitment promote pending ⚠️ | Mobile filter bottom sheet live ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified total | 96,711 rows | ✅ Rebuilt May 20 |
| — WPS | 22,278 | ✅ wps_product_id backfilled |
| — PU | 36,684 | ✅ Enriched |
| — VTWIN | 37,749 | ✅ Categories cleaned |
| Typesense | 90,276 docs | ✅ Current — era columns live |
| catalog_fitment_v2 | ~1.54M rows | ⚠️ PU + VTWIN promotes pending |
| oem_fitment | 379,899 rows | ✅ All families |
| catalog_media | 32,718 rows | ✅ FK → catalog_unified |
| vendor_offers | 22,278 rows | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 rows | ✅ |
| pu_fitment_parsed | 393,202 rows | ✅ |
| pu_fitment_expanded | 1,640,065 rows | ✅ Ready to promote |
| catalog_variant_groups | 2,887 | ✅ |
| catalog_variant_members | 19,464 | ✅ |
| era_* columns | Backfilled May 20 | ⚠️ Re-run after fitment promotes |
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
node scripts/ingest/ingest_vtwin_fitment.cjs --dry  # check strategy + match count
node scripts/ingest/ingest_vtwin_fitment.cjs
# → vtwin_oem_crossref → catalog_fitment_v2 (source='VTWIN')

# Step 12: vendor_offers
node scripts/ingest/populate_wps_vendor_offers.cjs

# Step 13: WPS product IDs (for variant grouping)
node scripts/ingest/backfill_wps_product_ids.cjs
# → wps_catalog.wps_product_id + wps_item_id

# Step 14: Variant groups
node scripts/ingest/build_variant_groups.cjs
# → catalog_variant_groups, catalog_variant_members

# Step 15: Era column backfill (SQL — run after fitment is populated)
# See ERA BACKFILL SQL below

# Step 16: Typesense reindex
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
  era_evolution     = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id IN (35,4,7,10) AND hmy.year BETWEEN 1984 AND 1999),
  era_twin_cam      = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id IN (35,4,7,10) AND hmy.year BETWEEN 1999 AND 2017),
  era_milwaukee8    = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id IN (35,7,8) AND hmy.year >= 2017),
  era_chopper       = EXISTS(SELECT 1 FROM catalog_fitment_v2 cfv JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id JOIN harley_models hm ON hm.id = hmy.model_id WHERE cfv.product_id = cu.id AND hm.family_id IN (10,19) AND hmy.year BETWEEN 1966 AND 1986)
WHERE cu.id IN (SELECT DISTINCT product_id FROM catalog_fitment_v2);
```

⚠️ Families 18 (Panhead), 21 (Twin Cam), 22 (Evolution) have 0 fitment rows in catalog_fitment_v2.
Use year-based mapping for panhead (1948–1965). TC and Evo use Touring/Softail/Dyna year ranges.

---

## VARIANT SYSTEM

### Tables
```
catalog_variant_groups
  id, wps_product_id, display_name, source_vendor

catalog_variant_members
  id, group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order

catalog_unified.variant_group_id  → FK to catalog_variant_groups(id)
wps_catalog.wps_product_id        → WPS internal product grouping ID
wps_catalog.wps_item_id           → WPS internal item ID
```

### Option Logic
- **Single-axis**: option_1_name/value only — fitment, measurement, finish, size when no color split
- **Two-axis**: option_1 = Color, option_2 = Size — auto-split when value ends in XS/SM/MD/LG/XL/2X/3X/4X/5X
- 70 groups have identical names (cables) — option_1_value null until WPS fitment files arrive
- Re-run `build_variant_groups.cjs` after each new fitment import to refresh labels

### API
`GET /api/browse/variants/[productId]`
Returns: `{ hasVariants, group, currentProductId, variants[] }`

### UI Component
`components/browse/VariantSelector.jsx`
- Auto-detects two-axis vs single-axis from presence of option_2_value
- Two-axis: color pill row + size pill row, cross-availability check
- Single-axis: scrollable list of variant rows with price + stock
- `group` prop passed explicitly to both selector modes (data scope bug fixed May 21)
- Navigation loading state: 60% opacity while route changes
- Current item shows `← HERE` label, is non-clickable
- Renders null when hasVariants: false (no overhead for non-variant products)

---

## BROWSE PAGE — MOBILE FILTER ARCHITECTURE

### Event Bridge
BottomNav hamburger (on /browse only) fires:
```js
window.dispatchEvent(new CustomEvent("stinkin:filterToggle"))
```
Browse page listens:
```js
useEffect(() => {
  const handler = () => setSidebarOpen(o => !o);
  window.addEventListener("stinkin:filterToggle", handler);
  return () => window.removeEventListener("stinkin:filterToggle", handler);
}, []);
```

### Render Split
```
<div className="desktop-sidebar">     // display:none on ≤768px
  <FilterSidebar mobileSheet={false} />   // sticky left column
</div>
<div className="mobile-only">         // display:none on ≥769px
  <FilterSidebar mobileSheet={true} open={sidebarOpen} />  // bottom sheet
</div>
```

### Floating Pill Button
Fixed at `bottom: 86px`, centered, mobile only. Shows FILTER + active count badge.
Both the pill and the BottomNav hamburger toggle the same `sidebarOpen` state.

### FilterSidebar Bottom Sheet (mobileSheet=true)
- Spring animation: `y: "100%" → 0`
- `borderRadius: "16px 16px 0 0"`
- Max height 82vh, scrollable content
- Drag handle, × close button, "Show Results" button pinned at bottom
- Body scroll locked while open
- `FilterContent` sub-component shared between desktop and mobile — no duplication

---

## CATALOG_UNIFIED REBUILD PROCEDURE

```sql
-- BEFORE running merge_catalog_unified.js:
DROP VIEW IF EXISTS v_catalog_fitment;
ALTER TABLE IF EXISTS catalog_fitment_v2 DROP CONSTRAINT IF EXISTS catalog_fitment_v2_product_id_fkey;
ALTER TABLE IF EXISTS product_fitment_year_model DROP CONSTRAINT IF EXISTS product_fitment_year_model_unified_id_fkey;
ALTER TABLE IF EXISTS vendor_offers DROP CONSTRAINT IF EXISTS vendor_offers_catalog_product_id_fkey;
ALTER TABLE IF EXISTS catalog_media DROP CONSTRAINT IF EXISTS catalog_media_product_id_fkey;
ALTER TABLE IF EXISTS catalog_variant_members DROP CONSTRAINT IF EXISTS catalog_variant_members_product_id_fkey;

-- AFTER full pipeline:
DELETE FROM catalog_fitment_v2 WHERE product_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM vendor_offers WHERE catalog_product_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM catalog_media WHERE product_id NOT IN (SELECT id FROM catalog_unified);
DELETE FROM catalog_variant_members WHERE product_id NOT IN (SELECT id FROM catalog_unified);

-- Re-add constraints, re-run backfill_wps_product_ids.cjs + build_variant_groups.cjs
```

---

## CATEGORY MAP (cleaned — no GROUP suffix)

| DB Value | Display Label |
|----------|---------------|
| ENGINE | Engine |
| HANDLEBAR-CONTROLS-MIRRORS | Controls & Bars |
| BRAKING | Brakes |
| ELECTRICAL SYSTEM | Electrical |
| CARBURETION-FUEL | Carb / Fuel |
| TRANSMISSION-CLUTCH | Transmission |
| SEATING | Seats |
| WHEEL AND RIM | Tires & Wheels |
| LIGHTING-LICENSE | Lighting |
| HARDWARE | Hardware |
| FOOT CONTROLS | Foot Controls |
| EXHAUST | Exhaust |
| FRAME AND BODY | Frame & Body |
| MEDIA PRODUCTS | Swag |
| SUSPENSION | Suspension |
| TANK | Tanks |
| DRIVE TRAIN | Drive Train |
| COMMON MISC | General |
| TOOLS | Tools |

---

## ERA COVERAGE TIERS

| Slug | Coverage | Products | Notes |
|------|----------|----------|-------|
| milwaukee-8 | full | 3,815 | ✅ Backfilled — re-run after fitment promotes |
| twin-cam | full | 8,165 | ✅ Backfilled — re-run after fitment promotes |
| evolution | full | 5,026 | ✅ Backfilled — re-run after fitment promotes |
| evo-sportster | full | 1,642 | ✅ Backfilled — re-run after fitment promotes |
| shovelhead | full | 1,031 | ✅ Backfilled — re-run after fitment promotes |
| ironhead-sportster | full | 1,091 | ✅ Backfilled — re-run after fitment promotes |
| chopper | full | 2,002 | ✅ Backfilled — re-run after fitment promotes |
| flathead | limited | 26 | LimitedBanner shown. flathead.webp missing |
| knucklehead | limited | 26 | LimitedBanner shown |
| panhead | limited | 587 | LimitedBanner shown. Year-range mapped 1948–1965 |

ERA_COVERAGE map in `app/era/[slug]/page.jsx` — knucklehead/panhead marked "pending" in file but show "limited" in data.

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
| populate_wps_vendor_offers.cjs | harddrive_catalog = true join gives 0 | Use `IS NOT FALSE` |
| enrich_pu_catalog_xml.js | COALESCE-skipped all fields | Replaced by enrich_pu_xml_comprehensive.js |
| wps-master-item-import.js | ES module error | Renamed to .cjs |
| wps-master-item-import.cjs | Duplicate isValid() | Removed at line 223 |
| import_pu_fitment.mjs | chunk not defined | Fixed |
| Any route handler | params not Promise | Next.js 15+ — always await params |
| ingest_pu_fitment_scrape.cjs | Individual inserts slow | ~12+ hrs for 1.67M rows — batch TBD |
| variants route.ts | db.end() on shared pool | Removed — getCatalogDb() is shared, never call end() |
| build_variant_groups.cjs | brand_name doesn't exist | Use `brand` column — auto-detected now |
| WPS API single item lookup | Expects integer ID not SKU string | Use filter[sku]= batch endpoint instead |
| promote_pu_fitment.cjs | Column names vary | Auto-introspects — detects sku/vendor_sku/part_number |
| ingest_vtwin_fitment.cjs | Crossref structure unknown | Auto-detects Strategy A (year+model) or B (OEM cross-ref) |

---

## PUBLIC SCHEMA — TABLE INVENTORY

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 | 90,276 active — rebuilt May 20 |
| catalog_fitment_v2 | ~1.54M | ⚠️ PU + VTWIN promotes pending |
| oem_fitment | 379,899 | ✅ All families |
| catalog_products | 146,989 | Legacy — no longer used in pipeline |
| pu_catalog | 36,684 | ✅ Fully enriched |
| pu_brand_enrichment | 93,585 | ✅ |
| wps_catalog | 22,278 | ✅ + wps_product_id, wps_item_id columns |
| vtwin_catalog | 37,749 | ✅ oem_numbers consolidated |
| vtwin_oem_crossref | 12,278 | ⚠️ Promote script ready, not yet run |
| catalog_media | 32,718 | ✅ FK → catalog_unified |
| vendor_offers | 22,278 | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 | ✅ |
| pu_fitment_parsed | 393,202 | ✅ |
| pu_fitment_expanded | 1,640,065 | ✅ Ready to promote |
| catalog_oem_crossref | ~14,819 | ✅ |
| catalog_variant_groups | 2,887 | ✅ |
| catalog_variant_members | 19,464 | ✅ |
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
| harddrive_catalog boolean | Use IS NOT FALSE — `= true` gives 0 results |
| getCatalogDb() | Returns shared pool — NEVER call db.end() in API routes |
| WPS API item lookup | filter[sku]= batch works; /items/{sku} 500s (expects integer ID) |
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
| era_* columns | Backfilled May 20 — re-run ERA BACKFILL SQL after each fitment update |
| catalog_variants | Does NOT exist — replaced by catalog_variant_members |
| CartContext / addItem | Placeholder only — not wired to real cart |
| VTwin categories | GROUP suffix stripped May 20 — old category map is stale |
| FilterSidebar mobileSheet | Pass mobileSheet={true} for bottom sheet, mobileSheet={false} for desktop sidebar |
| BottomNav filter event | On /browse, hamburger fires `stinkin:filterToggle` — browse page must have listener |

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

# vendor_offers
node scripts/ingest/populate_wps_vendor_offers.cjs --dry
node scripts/ingest/populate_wps_vendor_offers.cjs

# Variant system
node scripts/ingest/backfill_wps_product_ids.cjs --dry
node scripts/ingest/backfill_wps_product_ids.cjs
node scripts/ingest/build_variant_groups.cjs --dry
node scripts/ingest/build_variant_groups.cjs

# Typesense
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Git
git add -A && git commit -m "message" && git push
```
