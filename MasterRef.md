# Stinkin' Supplies — Master Reference
**Last Updated:** June 4, 2026 (Thirty-Eighth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Nav redesigned ✅ | Category taxonomy normalized ✅ | VTwin fitment FULL imported ✅ | VTwin images backfilled ✅ | OEM crossref expanded ✅ | OEM catalog bridge built ✅ | Name extraction fitment built ✅ | /models FlowingMenu built ✅ | mv_family_product_ranges mat view created ✅ | 22 missing model codes added ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (total / active) | ~104,917 active | ✅ PU 36,396 / WPS 15,844 / VTwin 52,677 |
| catalog_fitment_v2 | ~4,920,000+ rows | ✅ vtwin_partial +269,511 rows June 4 (session 38) |
| catalog_oem_crossref | ~65,000+ rows | ✅ +10,265 VTwin OEMs added June 2 |
| catalog_variant_groups | 7,377 | ✅ MAX_VARIANT_MEMBERS=20 cap enforced |
| catalog_variant_members | 28,619 | ✅ |
| oem_fitment | 379,899 rows | ✅ All families — bridged to catalog_fitment_v2 |
| harley_model_years | ~2,020 rows | ✅ +131 added June 4 (22 new model codes) |
| harley_models | ~347 rows | ✅ +22 added June 4 (CVO, Street, Rev Max variants) |
| mv_family_product_ranges | 81,332 rows | ✅ Created June 3 — refreshes auto in index_unified.js |
| Typesense | 104,917 docs | ✅ Reindexed June 4 (session 38) |

### Fitment Coverage (June 4 — Session 38)
| Vendor | Total | With Fitment | Coverage |
|--------|-------|--------------|----------|
| PU | 36,396 | 17,918 | 49.2% |
| VTwin | **52,677** | **18,452** | **35.0%** |
| WPS | 15,844 | 6,463 | 40.8% |
| **Total** | **104,917** | **42,833** | **40.8%** |

### Fitment Sources (June 4 — Session 38)
| Source | Rows | Products | Confidence |
|--------|------|----------|-----------|
| jwboon | 1,442,318 | 13,764 | high |
| name_extraction | 1,552,960 | 5,795 | 0.65–0.85 |
| wps | 802,890 | 5,847 | high |
| copied_from_crossref | 467,015 | 6,219 | varies |
| **vtwin_partial** | **269,511** | **8,635** | high |
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

### Full VTwin scraper import (June 4 — Session 38) ✅ DONE
Two CSV files from scraper, imported sequentially:

| File | SKUs | Fitment Rows | New Products |
|------|------|-------------|-------------|
| vtwin_fitment.csv | 13,275 | 239,494 | 0 (all existing) |
| vtwin_fitment_missing.csv | 7,479 | 160,910 | 1,653 |

```bash
# Run sequentially (parallel runs cause delete/reinsert collisions):
VTWIN_CSV=/path/to/vtwin_fitment.csv node scripts/ingest/import_vtwin_fitment_partial.mjs
VTWIN_CSV=/path/to/vtwin_fitment_missing.csv node scripts/ingest/import_vtwin_fitment_partial.mjs
```

After import: fix null slugs, sync catalog_products, refresh mat view, reindex Typesense.

Skipped permanently: `C`, `E` (single-letter bad data), `XL1200` (too generic), `FXLRFLFB` (parse error — FXLR+FLFB merged without pipe).

### VTwin product count note
VTwin is ~52,677 products (+1,653 added June 4 from vtwin_fitment_missing.csv). Previously ~51,024.

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

## MISSING MODEL CODES — ADDED JUNE 4 (SESSION 38)

22 model codes added to `harley_models` + `harley_model_years` (131 year rows total).
These were previously unknown in VTwin fitment data — SKU fitment rows for these models were skipped until now.

| Model Code | Name | Family | Years |
|------------|------|--------|-------|
| FLTRCVO | CVO Road Glide Ultra | Touring | 2018–2019 |
| FLHTKCVO | CVO Ultra Limited | Touring | 2018–2019 |
| FLHTCVO | CVO Electra Glide Classic | Touring | 2018–2019 |
| FLTRXCVO | CVO Road Glide Custom | Touring | 2018–2019 |
| FLHXCVO | CVO Street Glide | Touring | 2018–2019 |
| FLHTKS | King of the Bagger | Touring | 2021–2026 |
| FLHXX | Ultra Classic Electra Glide X | Touring | 2009–2013 |
| FLTHK | Tri Glide Ultra (variant) | Touring | 2008–2023 |
| FLTN | Touring Model (variant) | Touring | 2008 |
| FLFBSANY | Fat Boy Annual (Y) | Softail | 2018–2019 |
| FLFBSANV | Fat Boy Annual (V) | Softail | 2018–2026 |
| FLFBSANX | Fat Boy Annual (X) | Softail | 2018–2026 |
| FLHCSANV | Heritage Classic Anniversary | Softail | 2018–2025 |
| FXBSE | CVO Breakout | Softail | 2013–2014 |
| FLFS | Softail (variant) | Softail | 2018–2022 |
| FLTSN | Softail Deluxe (variant) | Softail | 2004–2017 |
| FXLRSST | Low Rider ST (variant) | Softail | 2018–2026 |
| FXRST | Low Rider ST | Softail | 2018–2022 |
| FXDE | Dyna (European variant) | Dyna | 1992–2005 |
| XG | Street (generic) | Street | 2015–2021 |
| RH120S | Sportster S (variant) | Revolution Max | 2021–2026 |

Permanently skipped (intentional): `C`, `E` (single-letter noise), `XL1200` (too generic), `ELW` (bad PU data), `FXLRFLFB` (parse error).

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

Route at `/models/[family]` — model-first navigation. Rebuilt June 3 with FlowingMenu + materialized view.

| Route | File | Purpose |
|-------|------|---------|
| /models | app/models/page.jsx | FlowingMenu family index — static, zero API calls |
| /models/[family] | app/models/[family]/page.jsx | Server shell |
| /models/[family] | app/models/[family]/ModelCatalogClient.jsx | Client — era chips, category accordion |
| API | app/api/models/[family]/parts/route.ts | Queries mv_family_product_ranges — 83ms cached |

**Supported families:** touring · softail · dyna · sportster · fxr · shovelhead · vintage · trike · v-rod

**"All Makes"** slug is `street` in FAMILIES array — routes to `/browse?universal=true`, not `/models/street`. No parts API route needed for it.

**Vintage** = Panhead + Knucklehead + Flathead grouped together. API uses `hf.name = ANY($1::text[])`.

**Era boundaries** come from `hd_engine_types.year_start/year_end` — 15 rows, cached in module scope on cold start.

**Performance:** 496ms cold start, 83ms cached (was 9.5s before mat view).

### mv_family_product_ranges Materialized View

Pre-aggregates per-family product year ranges. 81,332 rows.

```sql
CREATE INDEX ON mv_family_product_ranges (family_name);
CREATE INDEX ON mv_family_product_ranges (family_name, display_category, display_subcategory);

-- Query used by parts route:
SELECT display_category, display_subcategory,
  MIN(year_start), MAX(year_end), COUNT(*)
FROM mv_family_product_ranges
WHERE family_name = $1
GROUP BY display_category, display_subcategory;

-- Manual refresh (auto-runs in index_unified.js after reindex):
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_family_product_ranges;
```

### Font System (June 3)
Two new CSS variables added in layout.tsx:

| Variable | File | Used for |
|----------|------|---------|
| `--font-tanker` | `public/fonts/Tanker-Regular.ttf` | FlowingMenu family names + marquee |
| `--font-bespoke` | `public/fonts/BespokeSerif-Regular.ttf` | Page headers + category headings |

⚠️ Both files must exist locally — not in git. Download from Fontshare kit link.

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

### Inline PDP Admin Edit (June 4)

Floating pencil button on every PDP. Visible only when `?admin=1&token=ADMIN_SECRET` is in the URL. Slides open a 360px panel with two modes:

**Edit Fields** — updates `display_category`, `display_subcategory`, `fits_all_models` on `catalog_unified`, then fires a single-document Typesense PATCH (no full reindex needed). Save button stays grey until a field is actually changed.

**Flag Issue** — writes to `catalog_review_flags` (auto-created on first use). Nothing changes on the live product — queued for batch review.

Files:
- `components/admin/AdminEditPanel.jsx` — client component, import into ProductDetailClient.jsx
- `app/api/admin/products/[id]/route.ts` — PATCH (update or flag) + GET (list unresolved flags)

Required env var:
```
ADMIN_SECRET=your-secret-here   # .env.local + Vercel dashboard
```

Usage:
```
# Any PDP — token only needed at save time, but easiest to keep both in URL
http://localhost:3000/browse/{slug}?admin=1&token=YOUR_SECRET

# List all unresolved flags
GET /api/admin/products/1?token=YOUR_SECRET  (id ignored for GET)
```

Auth: token read from URL query param (`?token=`) or `X-Admin-Token` header. Token cached in `sessionStorage` after first use so it survives client-side navigation within the same session.

#### catalog_review_flags schema (auto-created)
```sql
CREATE TABLE catalog_review_flags (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL,
  flag_type   TEXT NOT NULL,   -- wrong_category | wrong_subcategory | missing_fitment | wrong_fitment | bad_image | duplicate | other
  flag_notes  TEXT,
  flagged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  UNIQUE (product_id, flag_type)
);
```

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
         (also auto-runs: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_family_product_ranges)
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
| mv_family_product_ranges stale | Run REFRESH MATERIALIZED VIEW CONCURRENTLY mv_family_product_ranges after any fitment import. Auto-runs in index_unified.js. |
| Tanker/Bespoke fonts missing | Files must exist at public/fonts/Tanker-Regular.ttf + BespokeSerif-Regular.ttf. Download from Fontshare. Not in git. |
| FlowingMenu hydration | Seeded random sr() function ensures SSR + client produce identical row configs. Never use Math.random() in row config. |
| FlowingMenu GSAP timing | 120ms setTimeout before measuring scrollWidth — images need time to affect layout. Do not reduce. |
| "All Makes" family | Slug is still "street" in FAMILIES array. Routes to /browse?universal=true, not /models/street. No parts API route needed. |
| AdminEditPanel token | Token read from ?token= URL param, cached in sessionStorage after first use. ADMIN_SECRET env var must be set in .env.local and Vercel. |
| Next.js 15 route params | params is now Promise<{id}> in route handlers — must await params before reading .id |
| VTwin fitment parallel import | NEVER run two import_vtwin_fitment_partial.mjs in parallel — delete step collides. Run sequentially. |
| vtwin_fitment.csv --skip-existing | With --skip-existing, ALL 13,275 SKUs are filtered (already in catalog) → 0 imports. Drop flag to update fitment for existing products. |
| vtwin_fitment_missing.csv | Contains 7,479 unique SKUs including 1,653 net-new products. Use import_vtwin_fitment_partial.mjs (not the full script — wrong schema). |
| import_vtwin_fitment_full.mjs schema | This script uses harley_model_id/year_start/year_end columns that DON'T exist. catalog_fitment_v2 uses model_year_id. Do not use this script without fixing. |
| mv_family_product_ranges CONCURRENTLY | CONCURRENTLY refresh requires a unique index — run plain REFRESH MATERIALIZED VIEW instead. |

---

## KEY COMMANDS

```bash
# Connect
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'

# VTwin fitment import — run SEQUENTIALLY (parallel causes delete collisions)
VTWIN_CSV=/path/to/vtwin_fitment.csv node scripts/ingest/import_vtwin_fitment_partial.mjs
VTWIN_CSV=/path/to/vtwin_fitment_missing.csv node scripts/ingest/import_vtwin_fitment_partial.mjs

# Fix null slugs after VTwin import (1,653 new products added June 4)
UPDATE catalog_unified SET slug = lower(regexp_replace(regexp_replace(name,'[^a-zA-Z0-9\s-]','','g'),'\s+','-','g'))
  || '-' || lower(replace(sku,'VT-','')) || '-v'
WHERE source_vendor='VTWIN' AND is_active=true AND (slug IS NULL OR slug='null');

# Sync new VTwin products to catalog_products
INSERT INTO catalog_products (sku,name,slug,source_vendor,is_active)
SELECT replace(cu.sku,'VT-',''),cu.name,cu.slug,'vtwin',true FROM catalog_unified cu
WHERE cu.source_vendor='VTWIN' AND cu.is_active=true
AND NOT EXISTS (SELECT 1 FROM catalog_products cp WHERE 'VT-'||cp.sku=cu.sku OR cp.sku=cu.sku)
ON CONFLICT DO NOTHING;

# VTwin image backfill (run from vtwin_scraper venv)
cd ~/Desktop/vtwin_scraper/vtwin_scraper && source venv/bin/activate
python3 /tmp/vtwin_image_backfill.py

# Rebuild variant groups (safe to re-run — cleanup pass dissolves oversized groups first)
node scripts/ingest/build_variant_groups.cjs --dry  # preview
node scripts/ingest/build_variant_groups.cjs         # live

# Typesense reindex (also refreshes mv_family_product_ranges)
node scripts/ingest/index_unified.js --recreate

# Refresh mat view manually (after fitment import without full reindex)
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -c 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_family_product_ranges;'

# Deploy
npx vercel --prod

# Add ADMIN_SECRET to Vercel
npx vercel env add ADMIN_SECRET

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

# List all unresolved review flags
GET /api/admin/products/1?token=YOUR_SECRET
```

---

*Master Reference — Last update: June 4, 2026 · Thirty-Eighth Pass (VTwin full fitment ingest + 22 model codes added)*
