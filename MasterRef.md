# Stinkin' Supplies — Master Reference
**Last Updated:** June 4, 2026 (Fortieth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Nav redesigned ✅ | Category taxonomy normalized ✅ | VTwin fitment imported ✅ | VTwin images backfilled ✅ | OEM crossref expanded ✅ | OEM catalog bridge built ✅ | Name extraction fitment built ✅ | /models FlowingMenu built ✅ | mv_family_product_ranges mat view created ✅ | Fitment filter bug fixed ✅ | OEM number cleanup done ✅ | VTwin SKU dupes resolved ✅ | Knucklehead + Sportster aliases wired ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (active) | **90,520** | ✅ PU 36,396 / WPS 15,844 / VTwin 38,270 |
| catalog_fitment_v2 | ~3,680,000 rows | ✅ vtwin_partial 185,234 rows on correct prefixed IDs |
| catalog_oem_crossref | ~65,000+ rows | ✅ |
| catalog_variant_groups | 7,547 | ✅ |
| catalog_variant_members | 29,031 | ✅ |
| oem_fitment | 379,899 rows | ✅ Bridged to catalog_fitment_v2 |
| harley_model_years | ~2,020 rows | ✅ |
| harley_models | ~347 rows | ✅ |
| mv_family_product_ranges | 81,332 rows | ✅ Auto-refreshes in index_unified.js |
| Typesense | 104,917 docs | ⚠️ STALE — reindex needed (active now 90,520) |

### Fitment Coverage (June 4 — Session 40)
| Vendor | Total Active | With Fitment | Coverage |
|--------|-------------|--------------|----------|
| PU | 36,396 | 16,502 | 45.3% |
| VTwin | **38,270** | **13,877** | **36.3%** |
| WPS | 15,844 | 6,133 | 38.7% |

⚠️ VTwin active dropped from 52,677 → 38,270 after deactivating 14,407 bare-SKU dupes. Scraper running for 20,236 remaining unfitted SKUs.

### Fitment Sources (June 4 — Session 40)
| Source | Rows | Products | Confidence |
|--------|------|----------|-----------|
| jwboon | 1,442,318 | 13,764 | high |
| wps | 802,890 | 5,847 | high |
| copied_from_crossref | 467,015 | 6,219 | varies |
| name_extraction | 281,144 | 3,170 | 0.80–0.85 |
| **vtwin_partial** | **185,234** | **6,083** | high (on correct prefixed IDs) |
| oem_catalog_universal | 261,091 | 1,239 | 0.75 |
| oem_catalog_family | 141,293 | 2,079 | 0.80 |
| oem_catalog | 12,801 | 848 | 0.90–0.95 |
| oem_crossref | 554 | 79 | high |

---

## DATABASE CONNECTION

```
Host:       5.161.100.126 (IPv4 — ALWAYS use this)
Port:       5432
Database:   stinkin_catalog
User:       catalog_app
Password:   smelly
SSH Alias:  ssh stinkdb
psql:       psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
Vercel env: CATALOG_DATABASE_URL
```

⚠️ NEVER use IPv6 2a01:4ff:f0:fa6f::1 in Vercel code.
⚠️ catalog_app is NOT superuser — use \copy not COPY TO file.
⚠️ catalog_oem_crossref joins on `sku` column — NOT product_id or catalog_product_id.

---

## VTWIN SKU NAMESPACE — IMPORTANT

VTwin products in `catalog_unified` exist in two SKU forms:

| Type | Format | Count | Status | Origin |
|------|--------|-------|--------|--------|
| Prefixed | `VT-10-0030` | 37,749 | **Canonical / Active** | Main catalog merge (May 19) |
| Bare | `10-0030` | 521 active, 14,407 inactive | Bare-only or deactivated dupes | import_vtwin_fitment_partial.mjs (May 29+) |

**Rule:** Always use prefixed `VT-` SKUs as the canonical reference. Bare SKUs are legacy orphans except for the 521 that have no VT- counterpart.

`import_vtwin_fitment_partial.mjs` was patched (Session 40) to:
1. Pre-check which bare SKUs have active VT- counterparts
2. Upsert with VT- prefix for those
3. Resolve IDs from active rows only, preferring VT- prefixed
4. Delete vtwin_partial fitment from BOTH prefixed and bare IDs on re-run

---

## VTWIN FITMENT SCRAPER

Scraper location: `/Users/home/Desktop/vtwin_scraper/vtwin_scraper/`

```bash
# Activate and run
cd /Users/home/Desktop/vtwin_scraper/vtwin_scraper
source venv/bin/activate
python3 scrape_vtwin_fitment.py
```

**Scrape target list:** `vtwin_scrape_targets.csv` (20,236 SKUs — real product names, no tools/universals/dead SKUs)

**VTwin fitment gap breakdown (Session 40):**
| Category | Count | Action |
|----------|-------|--------|
| *UPDATE discontinued | 13 | Skip |
| SKU-only (no name) | 1,794 | Skip |
| Tools/universal | 2,350 | `vtwin_mark_universal.sql` |
| Scrape targets | 20,236 | Re-scrape |

---

## VTWIN FITMENT IMPORT

Script: `scripts/ingest/import_vtwin_fitment_partial.mjs`

**Current combined file:** `scripts/ingest/vtwin_fitment_combined.csv` (14,928 unique SKUs — merge of vtwin_fitment_final.csv + vtwin_fitment_missing.csv)

**MODEL_ALIASES** (patched Session 40):
```js
E      → [EL, ELH]           // Knucklehead — VTwin uses bare 'E'
XL1200 → [all 11 XL1200 variants]
XL883  → [XL883, XL883C, XL883L, XL883N, XL883R]
```

Fitment parsing rules:
- `MODEL YYYY-YYYY` → structured rows → `catalog_fitment_v2` with `fitment_source='vtwin_partial'`
- `All models` / `All` → `fits_all_models = true`, no fitment rows
- `Custom application…` → stored in `special_instructions`, no fitment rows
- Blank → no fitment rows

Re-run safety: script deletes existing `vtwin_partial` rows for affected products (both prefixed AND bare IDs) before reinserting.

```bash
VTWIN_CSV=./scripts/ingest/vtwin_fitment_combined.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs
```

---

## CATEGORY TAXONOMY

| Column | Purpose |
|--------|---------|
| `display_category` | 20 clean top-level categories |
| `display_subcategory` | Subcategory within parent |

**20 Display Categories:**
Engine · Exhaust · Transmission & Clutch · Handlebar & Controls · Suspension · Brakes · Foot Controls · Lighting · Electrical · Seating · Carburetion & Fuel · Wheels & Tires · Fenders & Body · Frame & Hardware · Instrumentation · Luggage & Racks · Security & Covers · Tools & Chemicals · Riding Gear & Apparel · Accessories & Misc

---

## VTWIN IMAGE URL PATTERN

```
Primary:  https://www.vtwinmfg.com/WebPics/{first-segment-of-sku}/{raw-sku}a.jpg
Fallback: https://www.vtwinmfg.com/WebPics/{first-segment-of-sku}/{raw-sku}.jpg
```

Example: SKU `VT-35-0427` → raw `35-0427` → prefix `35` → try `35-0427a.jpg` then `35-0427.jpg`
~51% hit rate. Backfill script: `/tmp/vtwin_image_backfill.py`

---

## FILTER SIDEBAR

`components/browse/FilterSidebar.jsx` — redesigned Session 40.

Props:
- `facets` — `{ categories, subcategories, brands }` arrays with `{ name, count }`
- `filters` — current filter state object
- `onChange(updates)` — partial update handler
- `open` — boolean (mobile only)
- `onClose` — function (mobile only)
- `mobileSheet` — boolean, renders as bottom sheet when true

Features: active filter chips, section dot indicators, auto-open on URL params, collapsed desktop mode, mobile Clear + Show Results footer.

---

## ADMIN INLINE EDIT

Activate: visit any PDP with `?admin=1&token=ADMIN_SECRET`

- **Edit Fields:** display_category, display_subcategory, fits_all_models
- **Flag Issue:** wrong_category, wrong_subcategory, missing_fitment, wrong_fitment, bad_image, duplicate, other
- Token cached in sessionStorage after first use

API: `app/api/admin/products/[id]/route.ts`
- `PATCH { action: "update" }` — updates catalog_unified + Typesense single-doc PATCH
- `PATCH { action: "flag" }` — upserts to catalog_review_flags
- `GET` — returns all unresolved flags (limit 200)

---

## OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|---------|
| IPv6 on Vercel | Never use 2a01:4ff — use CATALOG_DATABASE_URL |
| VTwin SKU prefix | VT- prefixed = canonical. Bare = legacy. import_vtwin_fitment_partial.mjs now handles both automatically |
| catalog_oem_crossref join | Joins on `sku` column — NOT product_id |
| sortMap in browse.ts | Must use d. alias — inner DISTINCT ON query aliases d in outer query |
| WPS variant groups | wps_product_id is a LINE id — cap at 20 members |
| Framer Motion removeChild | Never swap two component trees — keep single mounted element |
| source_vendor case | catalog_unified: uppercase ('PU'/'WPS'/'VTWIN'). catalog_products: lowercase |
| oem_numbers[] rebuild | After bulk deleting from catalog_oem_crossref, rebuild oem_numbers[] on catalog_unified |
| Typesense oem_numbers | oem_numbers IS in schema AND query_by — required for OEM# search |
| name_extraction re-run | Safe to re-run: NOT EXISTS guard prevents overwrite |
| name_extraction "Big Twin" | Tier 2 Softail exclusion now wired — safe to re-run (Session 40 fix) |
| name_extraction Tier 3 deleted | 1,269,765 conf=0.65 rows deleted Session 39. Re-run will NOT reinsert them. |
| oem_catalog stale IDs | Always JOIN with is_active=true |
| Reindex | Run locally: node scripts/ingest/index_unified.js --recreate |
| psql \copy | Writes to LOCAL machine /tmp/, not server |
| zsh special chars | Write .js file and run with node — never inline -e with IPv6 brackets or ! |
| VTwin fitment parallel import | NEVER run two import_vtwin_fitment_partial.mjs in parallel |
| import_vtwin_fitment_full.mjs | Wrong schema (harley_model_id/year_start/year_end don't exist). Do not use. |
| mv_family_product_ranges refresh | Run plain REFRESH MATERIALIZED VIEW (not CONCURRENTLY — needs unique index) |
| Tanker/Bespoke fonts | Download from Fontshare. Not in git. `public/fonts/Tanker-Regular.ttf` + `BespokeSerif-Regular.ttf` |
| FlowingMenu hydration | Seeded random sr() — never use Math.random() in row config |
| FlowingMenu GSAP timing | 120ms setTimeout before measuring scrollWidth — do not reduce |
| "All Makes" family | Slug is "street" in FAMILIES array. Routes to /browse?universal=true |
| AdminEditPanel token | Read from ?token= URL param, cached in sessionStorage |
| Next.js 15 route params | params is now Promise<{id}> — must await before reading .id |
| JGI- prefix on OEM | Strip JGI- prefix to get real HD OEM. Already done for all rows. |
| A- prefix on OEM | Eastern Motorcycle Parts — 'A-24009-06' and '24009-06' are same OEM |
| harley_families eras | Twin Cam + Evolution are family rows. Dual era flags on 1996-2002 Softail = correct |
| FLHX 1984 | Street Glide didn't exist — bad data, deleted |
| FLTRX/FLTRXSE 2023-2025 | Discontinued ~2013 — bad data, deleted |
| VTwin bare dupes | 14,407 deactivated Session 40. 521 legitimate bare-only products remain active. |

---

## KEY COMMANDS

```bash
# Connect
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'

# VTwin fitment import (combined file — always use this going forward)
VTWIN_CSV=./scripts/ingest/vtwin_fitment_combined.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs

# OEM backfill (VTwin — correct column is sku not product_id)
UPDATE catalog_unified cu
SET oem_numbers = ARRAY(SELECT oem_number FROM catalog_oem_crossref WHERE sku = cu.sku)
WHERE source_vendor = 'VTWIN'
AND EXISTS (SELECT 1 FROM catalog_oem_crossref WHERE sku = cu.sku);

# Mark universal VTwin tools/parts (run vtwin_mark_universal.sql)
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -f scripts/ingest/vtwin_mark_universal.sql

# Typesense reindex (also refreshes mv_family_product_ranges)
node scripts/ingest/index_unified.js --recreate

# Refresh mat view manually
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -c 'REFRESH MATERIALIZED VIEW mv_family_product_ranges;'

# Rebuild variant groups
node scripts/ingest/build_variant_groups.cjs

# Deploy
npx vercel --prod

# Add ADMIN_SECRET to Vercel
npx vercel env add ADMIN_SECRET

# VTwin scraper
cd /Users/home/Desktop/vtwin_scraper/vtwin_scraper && source venv/bin/activate
python3 scrape_vtwin_fitment.py

# Check fitment coverage by vendor
SELECT source_vendor, COUNT(DISTINCT cu.id) as total, COUNT(DISTINCT f.product_id) as with_fitment,
  ROUND(COUNT(DISTINCT f.product_id)::numeric / COUNT(DISTINCT cu.id) * 100, 1) as pct
FROM catalog_unified cu
LEFT JOIN catalog_fitment_v2 f ON f.product_id = cu.id
WHERE cu.is_active = true GROUP BY source_vendor ORDER BY source_vendor;

# Check vtwin_partial fitment distribution (bare vs prefixed)
SELECT 
  CASE WHEN cu.sku LIKE 'VT-%' THEN 'prefixed' ELSE 'bare' END as sku_type,
  cu.is_active,
  COUNT(DISTINCT f.product_id) as products,
  COUNT(*) as fitment_rows
FROM catalog_fitment_v2 f
JOIN catalog_unified cu ON cu.id = f.product_id
WHERE f.fitment_source = 'vtwin_partial'
AND cu.source_vendor = 'VTWIN'
GROUP BY sku_type, cu.is_active;

# List unresolved review flags
GET /api/admin/products/1?token=YOUR_SECRET

# Check null slugs
SELECT source_vendor, COUNT(*) FROM catalog_unified
WHERE is_active = true AND (slug IS NULL OR slug = 'null') GROUP BY source_vendor;

# Fix null slugs (VTwin)
UPDATE catalog_unified SET slug = lower(regexp_replace(regexp_replace(name,'[^a-zA-Z0-9\s-]','','g'),'\s+','-','g'))
  || '-' || lower(replace(sku,'VT-','')) || '-v'
WHERE source_vendor='VTWIN' AND is_active=true AND (slug IS NULL OR slug='null');
```

---

*Master Reference — Last update: June 4, 2026 · Fortieth Pass (VTwin SKU dupes resolved, fitment import patched, FilterSidebar redesigned, Knucklehead/Sportster aliases added)*
