# Stinkin' Supplies — Master Reference
**Last Updated:** June 2, 2026 (Thirty-Sixth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Nav redesigned ✅ | Category taxonomy normalized ✅ | Public database snapshot live ✅ | VTwin fitment partial imported ✅ | VTwin images backfilled ✅ | OEM crossref expanded ✅ | OEM catalog bridge built ✅ | Name extraction fitment built ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (total / active) | ~103,264 active | ✅ PU 36,396 / WPS 15,844 / VTwin 51,024 |
| catalog_fitment_v2 | ~4,920,000 rows | ✅ +~2M rows added June 2 (session 36) |
| catalog_oem_crossref | ~65,000+ rows | ✅ +10,265 VTwin OEMs added June 2 |
| catalog_variant_groups | 7,377 | ✅ MAX_VARIANT_MEMBERS=20 cap enforced |
| catalog_variant_members | 28,619 | ✅ |
| oem_fitment | 379,899 rows | ✅ All families — now bridged to catalog_fitment_v2 |
| harley_model_years | ~1,889 rows | ✅ +29 added, 6 deleted June 2 |
| harley_models | ~325 rows | ✅ |
| Typesense | 103,264 docs | ✅ Reindexing June 2 (session 36) |

### Fitment Coverage (June 2 — Session 36)
| Vendor | Total | With Fitment | Coverage |
|--------|-------|--------------|----------|
| PU | 36,396 | 17,918 | 49.2% |
| VTwin | 51,024 | 17,494 | 34.3% |
| WPS | 15,844 | 6,463 | 40.8% |
| **Total** | **103,264** | **41,875** | **40.5%** |

### Fitment Sources (June 2 — Session 36)
| Source | Rows | Products | Confidence |
|--------|------|----------|-----------|
| jwboon | 1,442,318 | 13,764 | high |
| wps | 802,890 | 5,847 | high |
| name_extraction | 1,552,960 | 5,795 | 0.65–0.85 |
| copied_from_crossref | 467,015 | 6,219 | varies |
| oem_catalog_universal | 261,091 | 1,239 | 0.75 |
| vtwin_partial | 239,035 | 7,677 | high |
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

## DATABASE SNAPSHOT

Live dashboard routes:

| Route | Purpose |
|-------|---------|
| `/database` | Public catalog + fitment snapshot with no auth gate |
| `/admin/database` | Admin-only chart-first snapshot with the same live data |

---

## CATEGORY TAXONOMY

catalog_unified now has two normalized category columns:

| Column | Purpose |
|--------|---------|
| `display_category` | 20 clean top-level categories (Engine, Exhaust, Brakes, etc.) |
| `display_subcategory` | Subcategory within parent (Gaskets & Seals, Rotors, etc.) |

These are mapped from the raw `category` / `subcategory` vendor columns via `mapDisplayCategory()` in `merge_catalog_unified.js`. After any bulk import or merge, re-run the subcategory UPDATE SQL.

**All browse filtering, facets, and the /models/[family] page use display_ columns.**
Legacy `?category=` and `?dbCategory=` params still work as fallback for old bookmarked URLs.

### 20 Display Categories
Engine · Exhaust · Transmission & Clutch · Handlebar & Controls · Suspension · Brakes · Foot Controls · Lighting · Electrical · Seating · Carburetion & Fuel · Wheels & Tires · Fenders & Body · Frame & Hardware · Instrumentation · Luggage & Racks · Security & Covers · Tools & Chemicals · Riding Gear & Apparel · Accessories & Misc

---

## VTWIN IMAGE URL PATTERN

VTwin product images follow a predictable pattern on www.vtwinmfg.com (NOT www2):

```
Primary:  https://www.vtwinmfg.com/WebPics/{first-segment-of-sku}/{raw-sku}a.jpg
Fallback: https://www.vtwinmfg.com/WebPics/{first-segment-of-sku}/{raw-sku}.jpg
```

Example: SKU `VT-35-0427` → raw `35-0427` → prefix `35` → try `35-0427a.jpg` then `35-0427.jpg`

~51% hit rate (10,302 of 20,167 missing images found). 9,865 genuinely have no image.

Backfill script: `/tmp/vtwin_image_backfill.py` — run from vtwin_scraper venv, requires psycopg2-binary.

---

## VTWIN FITMENT IMPORT

New script: `scripts/ingest/import_vtwin_fitment_partial.mjs`

| Flag | Behavior |
|------|----------|
| `--dry` | Preview only — no DB writes |
| `--skip-existing` | Skip SKUs already in catalog_unified (use for subsequent files) |
| `VTWIN_CSV=path` | Path to CSV or JSONL file |

Fitment parsing rules:
- `MODEL YYYY-YYYY | MODEL YYYY-UP` → structured rows → `catalog_fitment_v2` with `fitment_source='vtwin_partial'`
- `All models` / `All` → universal, no fitment rows, `fits_all_models` flag
- `Custom application…` / `Replacement…` → stored in `special_instructions`, no fitment rows
- Blank → no fitment rows

Re-run safety: script deletes existing `fitment_source='vtwin_partial'` rows for affected products before reinserting. Safe to re-run at any time.

For subsequent files with overlapping SKUs:
```bash
VTWIN_CSV=./scripts/ingest/new_batch.jsonl \
  node scripts/ingest/import_vtwin_fitment_partial.mjs --skip-existing
```

### VTwin product count note
VTwin is ~51,024 products (not ~37,749 as originally cataloged). The difference (~13,275) came from the fitment partial import inserting net-new SKUs that weren't in the original VTwin catalog import.

---

## OEM NUMBER EXTRACTION FROM PRODUCT NAMES

~1,217 OEM numbers extracted from catalog_unified.name June 2. Patterns used:

```sql
-- Pass 1: HD#/OE#/OEM prefix
regexp_match(name, '(?:HD#?\s*|OE#?\s*|OEM\s*)([0-9]{4,6}-[0-9]{2,3}[A-Z]?(?:-[A-Z])?)')

-- Pass 2: Bare trailing 5-digit OEM
regexp_match(name, '(?<![0-9])([0-9]{5}-[0-9]{2,3}[A-Z]?)(?![0-9-])$')

-- Pass 3: Extended suffixes (-F, -KF, -A, -B, -MLS etc.)
regexp_match(name, '(?<![0-9-])([0-9]{4,6}-[0-9]{2,3}[A-Z]?(?:-[A-Z]{1,3})?)(?:\s|$)')

-- Pass 4: Final 5-digit cleanup (excludes year ranges)
regexp_match(name, '(?<![0-9])([0-9]{5}-[0-9]{2,3}[A-Z]?(?:-[A-Z0-9]{1,4})?)(?:\s|$)')
-- With filter: AND name !~ '\s(19|20)[0-9]{2}-' AND name !~ '^(19|20)[0-9]{2}'
```

Known exclusions: 4-digit SKUs (non-HD), FRAM filter numbers (49065-xxxx), year ranges.

---

## OEM CATALOG FITMENT BRIDGE

`oem_fitment` (379,899 rows from HD OEM PDF catalogs — Sportster, Touring, Softail, Dyna, FX) → `catalog_fitment_v2` via three passes:

| Pass | Logic | Source Label | Confidence |
|------|-------|-------------|-----------|
| 1 | `oem_fitment.model_codes[]` → `harley_models` → year filter | `oem_catalog` | 0.90–0.95 |
| 2 | `fits_all_models=true` → all `harley_model_years` in year range | `oem_catalog_universal` | 0.75 |
| 3 | Catalog filename → implied family (touring/softail/dyna/xl/fx) → year filter | `oem_catalog_family` | 0.80 |

Run for both `oem_fitment.matched_product_id` (already-matched products) and direct `oem_part_number` joins (VTwin) and `oem_numbers[]` joins (PU/WPS). Safe to re-run — uses NOT EXISTS guard + ON CONFLICT DO NOTHING.

SQL files (one-off, checked into `/tmp/`):
```
/tmp/oem_bridge.sql               # pass 1 — model code + year
/tmp/oem_bridge_aliases.sql       # pass 1b — alias unmapped codes (XL883HUG→XLH883HUG etc.)
/tmp/oem_bridge_universal.sql     # pass 2 — fits_all_models
/tmp/oem_bridge_implied_family.sql # pass 3 — catalog filename → family
/tmp/vtwin_oem_fitment_direct.sql  # VTwin direct OEM match, pass 1
/tmp/vtwin_oem_fitment_universal.sql # VTwin direct, pass 2
/tmp/vtwin_oem_fitment_family.sql  # VTwin direct, pass 3
/tmp/pu_wps_oem_bridge.sql        # PU/WPS oem_numbers[], all 3 passes
```

---

## FITMENT FROM PRODUCT NAME EXTRACTION

Script: `scripts/ingest/extract_fitment_from_names.mjs`

Parses product names for three tiers of fitment signal:

| Tier | Pattern | Example | Confidence |
|------|---------|---------|-----------|
| 1 | Model code + apostrophe/full year | `FXST '06-'10`, `'96-'07 Touring` | 0.85 |
| 2 | Family keyword + year | `Big Twin '99-'06`, `1981-1984 XL` | 0.80 |
| 3 | Family keyword only (no year) | `Softail`, `Touring` | 0.65 |

Apostrophe year conversion: `'YY` → if YY < 30 → 2000+YY, else 1900+YY.  
Pipe-separated segments (`Twin Cam '07-'17 | Dyna '06`) each parsed independently.  
`fitment_source = 'name_extraction'`, ON CONFLICT DO NOTHING, NOT EXISTS guard.

```bash
node scripts/ingest/extract_fitment_from_names.mjs           # live
node scripts/ingest/extract_fitment_from_names.mjs --dry     # preview
node scripts/ingest/extract_fitment_from_names.mjs --vendor VTWIN
```

---

## FITMENT FROM OEM CROSSREF COPY

Products with zero fitment can inherit fitment from OEM crossref matches. Run after any bulk OEM import:

```sql
-- Check potential gain first
SELECT COUNT(DISTINCT cu.id)
FROM catalog_unified cu
JOIN catalog_oem_crossref cor ON cor.oem_number = ANY(cu.oem_numbers)
JOIN catalog_unified cu2 ON cu2.sku = cor.sku
JOIN catalog_fitment_v2 f ON f.product_id = cu2.id
WHERE cu.is_active = true
AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 f2 WHERE f2.product_id = cu.id);

-- Run the copy
INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
SELECT DISTINCT cu.id, f.model_year_id, 'copied_from_crossref', f.confidence_score
FROM catalog_unified cu
JOIN catalog_oem_crossref cor ON cor.oem_number = ANY(cu.oem_numbers)
JOIN catalog_unified cu2 ON cu2.sku = cor.sku
JOIN catalog_fitment_v2 f ON f.product_id = cu2.id
WHERE cu.is_active = true
AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 f2 WHERE f2.product_id = cu.id)
ON CONFLICT DO NOTHING;
```

VTwin-specific version (join via oem_part_number since oem_numbers[] may lag):
```sql
JOIN catalog_oem_crossref cor ON cor.oem_number = cu.oem_part_number
    OR cor.oem_number = replace(cu.oem_part_number, 'A-', '')
```

---

## VARIANT GROUP RULES

- **MAX_VARIANT_MEMBERS = 20** in build_variant_groups.cjs — enforced via HAVING clause + per-group guard + cleanup pass
- WPS wps_product_id is a product LINE id — not a true variant signal for groups > 20
- Real variants (color/finish/size/compound/oversize) max out ~10-15 SKUs
- Cleanup pass runs at top of main() — dissolves existing oversized groups before any inserts
- Browse count = DISTINCT ON (COALESCE(variant_group_id, 'u'||id)) — 103,264 active → browse card count reflects dedup

### VariantSelector render mode
- If any variant has `option_1_value` set → flat list (color/size/RPM variants)
- If only fitment data, no option values → grouped by HD family
- `option_1_name = 'Fits'` with year range as value is correct for fitment-differentiated variants

---

## BROWSE / TYPESENSE FILTER

Browse page uses `is_active = true` only — no book flag gate. All 103,264 active rows are eligible.
Typesense index: all active products indexed, no additional filter beyond is_active.

### URL params (all supported)
| Param | Maps to |
|-------|---------|
| `display_category` | cu.display_category (preferred) |
| `display_subcategory` | cu.display_subcategory (preferred) |
| `category` | cu.category (legacy fallback) |
| `subcategory` | cu.display_subcategory (legacy, maps to display col) |
| `family` | fitment join on harley_families.name |
| `year_min` / `year_max` | harley_model_years.year range in fitment join |
| `era` | era_* boolean column on catalog_unified |

---

## /MODELS/[FAMILY] PARTS CATALOG

Route at `/models/[family]` — model-first navigation.

| Route | File | Purpose |
|-------|------|---------|
| /models | app/models/page.jsx | Family index grid |
| /models/[family] | app/models/[family]/page.jsx | Server shell |
| /models/[family] | app/models/[family]/ModelCatalogClient.jsx | Client — era chips, category accordion |
| API | app/api/models/[family]/parts/route.ts | Era-bucketed catalog query |

**Supported families:** touring · softail · dyna · sportster · fxr · shovelhead · vintage · trike · v-rod · street

**Vintage** = Panhead + Knucklehead + Flathead grouped together. API uses `hf.name = ANY(...)`. Browse URL uses multiple `?family=` params.

**Era boundaries** come from `hd_engine_types.year_start/year_end` — not hardcoded.

---

## ADMIN TOOLS

| Route | Purpose |
|-------|---------|
| /admin/products | Product manager — search/filter, inline edit, fitment, bulk actions |
| /admin/oem-crossref | OEM crossref table — paginated, bulk delete/brand/add-OEM |
| /admin/fitment | Fitment modal editor |
| /admin/database | Admin database snapshot — chart-first fitment and source mix view |
| /database | Public database snapshot — same live breakdown without auth |

### OEM Crossref Bulk API
`POST/PATCH/DELETE /api/admin/oem-crossref/bulk`
Payload: `{ mode: "ids", ids: number[] }` or `{ mode: "filter", search, brand, source }`
- DELETE: removes rows
- PATCH: `{ field: "oem_manufacturer", value: string }` — bulk brand update
- POST: `{ oem_number, oem_manufacturer, source_file }` — adds OEM# to distinct SKUs of selection, ON CONFLICT DO NOTHING

---

## IMAGE PROXY

Two proxy routes exist — both must be kept in sync:

| Route | Used by | Notes |
|-------|---------|-------|
| `/api/image-proxy` | PDP, most components | fflate ZIP extraction for LeMans, fetch+pipe for WPS/VTwin |
| `/api/img` | lib/utils/image-proxy.ts for http:// URLs | AdmZip for LeMans, plain fetch for others |

**WPS images are http:// — always proxy, never redirect.** Mixed content blocks on HTTPS Vercel.
**VTwin images are https:// from www.vtwinmfg.com — proxy still recommended for consistency.**
`cdn.wpsstatic.com` is in ALLOWED_HOSTS on both routes.

`lib/utils/image-proxy.ts` routes all http:// URLs through `/api/img`.

---

## BOTTOM NAV BEHAVIOR

- **Idle / scrolling up**: full pill centered at bottom (width min(88vw,440px), height 58px)
- **Scrolling down >40px**: collapses to 52px gold orb, bottom-right corner (right:20, bottom:20)
- **Stops scrolling**: settle timer (1200ms) auto-expands back to pill
- On /browse collapsed orb: hamburger icon → fires stinkin:filterToggle
- On other pages collapsed orb: search icon → opens search popup bottom-right
- Single motion.nav element (never unmounts) — prevents Framer Motion removeChild crash
- `/database` and `/admin/database` hide BottomNav entirely so the snapshot can use the full viewport

Tuning constants in BottomNav.tsx:
```
THRESHOLD = 40    // px scrolled down before collapsing
SETTLE_MS = 1200  // ms after last scroll before auto-expand
```

---

## FILTER SIDEBAR

- **HD_FAMILIES_FLAT**: Touring, Softail, Dyna, Sportster, FXR, Trike, Revolution Max, V-Rod, Street (9 entries — model platforms only)
- **HD_ERAS**: separate array for engine era section — Twin Cam, Evolution, Shovelhead, Flathead, Knucklehead, Panhead
- ⚠️ Do NOT add engine eras to HD_FAMILIES_FLAT — they bleed into the MODEL FAMILY filter section
- Category filter uses `display_category` / `display_subcategory` — NOT raw `category` / `subcategory`

---

## CATALOG PIPELINE — CANONICAL ORDER

```
Step 1:  node scripts/ingest/import_pu_catalog.js
Step 2:  node scripts/ingest/enrich_pu_catalog_xml.js
Step 3:  node scripts/ingest/import_wps_catalog.js
Step 4:  node scripts/ingest/import_vtwin_catalog.js
Step 4b: VTWIN_CSV=./scripts/ingest/vtwin_fitment_partial.csv node scripts/ingest/import_vtwin_fitment_partial.mjs
Step 5:  node scripts/ingest/import_oem_crossref.js
Step 6:  node scripts/ingest/merge_catalog_unified.js
Step 7:  node scripts/ingest/normalize_brands.sql
Step 8:  node scripts/ingest/map_wps_categories.sql
Step 9:  node scripts/ingest/infer_vtwin_categories.mjs --live
Step 10: node scripts/ingest/import_jwboon_fitment_v3.mjs
Step 11: node scripts/ingest/promote_wps_fitment.cjs
Step 12: node scripts/ingest/build_oem_fitment.mjs (+ softail/dyna/touring/fx variants)
Step 12b: [run OEM number name-extraction SQL — see OEM NUMBER EXTRACTION section]
Step 12c: [run fitment-from-crossref copy SQL — see FITMENT FROM OEM CROSSREF COPY section]
Step 12d: [run OEM catalog bridge SQL — see OEM CATALOG FITMENT BRIDGE section — all 8 SQL files]
Step 12e: node scripts/ingest/extract_fitment_from_names.mjs
Step 13: node scripts/ingest/build_variant_groups.cjs
Step 14: [run display_subcategory UPDATE SQL — see HANDOFF_LOG for full statement]
Step 15: node scripts/ingest/index_unified.js --recreate
```

---

## OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| IPv6 on Vercel | Never use 2a01:4ff — use CATALOG_DATABASE_URL |
| catalog_unified.fitment_year_start/end | NULL for all products — year data lives only in catalog_fitment_v2 → harley_model_years |
| sortMap in browse.ts | Must use d. alias — inner DISTINCT ON query aliases d in outer query |
| WPS variant groups | wps_product_id is a LINE id — cap at 20 members or groups swallow entire product families |
| Framer Motion removeChild | Never swap two component trees — keep single mounted element, use variants to morph |
| source_vendor case | catalog_unified: uppercase ('PU'/'WPS'/'VTWIN'). catalog_products: lowercase |
| oem_numbers[] rebuild | After bulk deleting from catalog_oem_crossref, rebuild oem_numbers[] on catalog_unified |
| Typesense oem_numbers | oem_numbers IS in schema AND query_by — required so OEM# search hits all vendors, not just oem_part_number |
| name_extraction re-run | Safe to re-run: NOT EXISTS guard prevents overwrite; wipe first with DELETE WHERE fitment_source='name_extraction' if you want a clean reset |
| oem_catalog stale IDs | oem_fitment.matched_product_id can go stale after catalog rebuilds — always JOIN catalog_unified cu ON cu.id=matched_product_id AND cu.is_active=true |
| Reindex | Run locally: node scripts/ingest/index_unified.js --recreate (Lambda missing dotenv) |
| psql connection | psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' |
| zsh special chars | Write .js file and run with node — never inline -e with IPv6 brackets or ! |
| REPLACE() in JOIN | Never use on large tables — temp table + direct SKU join instead |
| WPS images on Vercel | http:// URLs = mixed content. Always proxy via /api/image-proxy or /api/img — never redirect |
| display_category facet query | facetBase already includes WHERE — use AND not WHERE for IS NOT NULL condition |
| VariantSelector fitment grouping | Check hasOptionValues first — if option_1_value exists, always use flat list |
| app/layout.jsx vs layout.tsx | Only layout.tsx should exist at app root. layout.jsx was a rogue admin layout — deleted |
| year_min/year_max in browse | Must be in state init + fetchProducts + handleFilterChange + clear-all in browse/page.jsx |
| harley_model_years | DO NOT MODIFY directly — add models via harley_models + generate_series pattern |
| VTwin fitment re-run | Delete WHERE fitment_source='vtwin_partial' first, then re-run script |
| catalog_fitment_v2 source col | Column is fitment_source not source |
| harley_model_years model col | Column is model_id (FK to harley_models.id) not model_code — join through harley_models |
| VTwin products not in catalog_products | After any VTwin import, run: INSERT INTO catalog_products FROM catalog_unified WHERE source_vendor = 'VTWIN' ON CONFLICT DO NOTHING |
| VTwin slug generation | Fitment partial batch imports may leave NULL slugs — generate from name+SKU with -v suffix, then sync to catalog_products |
| catalog_products VTwin SKU join | Raw SKUs in catalog_products (e.g. 33-2141), VT- prefixed in catalog_unified — join with: 'VT-' \|\| cp.sku = cu.sku |
| VTwin oem_numbers[] empty | After VTwin import, run: UPDATE catalog_unified SET oem_numbers = ARRAY[oem_part_number] WHERE source_vendor='VTWIN' AND oem_part_number IS NOT NULL AND oem_numbers IS NULL/empty |
| FLHP model code | Two rows exist: id=367 (Electra Glide Police 1984-1993) and new row (Road King Police 1994-2023) |
| FLHX 1984 | Street Glide didn't exist in 1984 — bad PU data, deleted from harley_model_years |
| FLTRX/FLTRXSE 2023-2025 | Road Glide Custom discontinued ~2013 — bad PU data, deleted from harley_model_years |
| ELW 2020 | Knucklehead Sidecar 1936-1947 — any year outside that range is bad PU data, ignore |
| A- prefix on OEM numbers | Eastern Motorcycle Parts convention — 'A-24009-06' and '24009-06' are same OEM. Join with: replace(oem_part_number, 'A-', '') |

---

## KEY COMMANDS

```bash
# Connect
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'

# VTwin fitment import
VTWIN_CSV=./scripts/ingest/vtwin_fitment_partial.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs

# VTwin image backfill (run from vtwin_scraper venv)
cd ~/Desktop/vtwin_scraper/vtwin_scraper && source venv/bin/activate
python3 /tmp/vtwin_image_backfill.py

# Rebuild variant groups (safe to re-run — cleanup pass dissolves oversized groups first)
node scripts/ingest/build_variant_groups.cjs --dry  # preview
node scripts/ingest/build_variant_groups.cjs         # live

# Typesense reindex
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Check display_category coverage after merge
SELECT display_category, COUNT(*) FROM catalog_unified WHERE is_active = true GROUP BY display_category ORDER BY COUNT(*) DESC;

# Check fitment coverage by vendor
SELECT source_vendor, COUNT(DISTINCT cu.id) as total, COUNT(DISTINCT f.product_id) as with_fitment,
  ROUND(COUNT(DISTINCT f.product_id)::numeric / COUNT(DISTINCT cu.id) * 100, 1) as pct
FROM catalog_unified cu
LEFT JOIN catalog_fitment_v2 f ON f.product_id = cu.id
WHERE cu.is_active = true GROUP BY source_vendor ORDER BY source_vendor;

# Check VTwin fitment coverage
SELECT COUNT(DISTINCT product_id) FROM catalog_fitment_v2 WHERE fitment_source = 'vtwin_partial';

# Check null slugs
SELECT source_vendor, COUNT(*) FROM catalog_unified WHERE is_active = true AND (slug IS NULL OR slug = 'null') GROUP BY source_vendor;
SELECT source_vendor, COUNT(*) FROM catalog_products WHERE slug IS NULL OR slug = 'null' GROUP BY source_vendor;

# Fix VTwin oem_numbers[] after import
UPDATE catalog_unified SET oem_numbers = ARRAY[oem_part_number]
WHERE source_vendor = 'VTWIN' AND oem_part_number IS NOT NULL AND oem_part_number != ''
AND (oem_numbers IS NULL OR oem_numbers = '{}');
```

---

*Master Reference — Last update: June 2, 2026 · Thirty-Sixth Pass*
