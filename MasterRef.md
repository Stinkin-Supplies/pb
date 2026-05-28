# Stinkin' Supplies — Master Reference
**Last Updated:** May 28, 2026 (Thirty-Second Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Nav redesigned ✅ | Category taxonomy normalized ✅ | Public database snapshot live ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (total / active) | 96,711 total / 89,989 active | ✅ PU 36,684 / WPS 22,278 / VTWIN 37,749 |
| catalog_fitment_v2 | 2,245,762 rows | ✅ JW Boon + WPS + OEM |
| catalog_oem_crossref | 55,122 rows / 31,313 products | ✅ FatBook + OldBook + manual |
| catalog_variant_groups | 7,141 | ✅ MAX_VARIANT_MEMBERS=20 cap enforced |
| catalog_variant_members | 27,989 | ✅ |
| oem_fitment | 379,899 rows | ✅ All families |
| harley_model_years | 1,619 rows | ✅ DO NOT MODIFY |
| Typesense | 89,989 docs | ✅ Reindexed May 27 with display_category/display_subcategory |
| Browse card count (deduped) | 71,834 | ✅ PU 27,494 / VTWIN 35,420 / WPS 8,077 (post-cap) |

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

Fitment breakdown:

- 18,793 products have fitment rows
- Fitment coverage is 19.4% of the active catalog
- Average fitment density is 119.5 rows per fitted product
- Fitment year span is 1936-2026
- Top families by fitment rows are Touring, Softail, Sportster, Dyna, FXR, and Trike
- Top model codes are FLHR, FLHTCU, FLSTF, FLSTC, FLHX, FLHTC, FLHT, FLHTK, FXSTS, and FXST

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

## VARIANT GROUP RULES

- **MAX_VARIANT_MEMBERS = 20** in build_variant_groups.cjs — enforced via HAVING clause + per-group guard + cleanup pass
- WPS wps_product_id is a product LINE id — not a true variant signal for groups > 20
- Real variants (color/finish/size/compound/oversize) max out ~10-15 SKUs
- Cleanup pass runs at top of main() — dissolves existing oversized groups before any inserts
- Browse count = DISTINCT ON (COALESCE(variant_group_id, 'u'||id)) — 89,989 active → 71,834 cards is correct

### VariantSelector render mode
- If any variant has `option_1_value` set → flat list (color/size/RPM variants)
- If only fitment data, no option values → grouped by HD family
- `option_1_name = 'Fits'` with year range as value is correct for fitment-differentiated variants

---

## BROWSE / TYPESENSE FILTER

Browse page uses `is_active = true` only — no book flag gate. All 89,989 active rows are eligible.
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

New route at `/models/[family]` — model-first navigation.

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
Step 5:  node scripts/ingest/import_oem_crossref.js
Step 6:  node scripts/ingest/merge_catalog_unified.js
Step 7:  node scripts/ingest/normalize_brands.sql
Step 8:  node scripts/ingest/map_wps_categories.sql
Step 9:  node scripts/ingest/infer_vtwin_categories.mjs
Step 10: node scripts/ingest/import_jwboon_fitment_v3.mjs
Step 11: node scripts/ingest/promote_wps_fitment.cjs
Step 12: node scripts/ingest/build_oem_fitment.mjs (+ softail/dyna/touring/fx variants)
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
| Reindex | Run locally: node scripts/ingest/index_unified.js --recreate (Lambda missing dotenv) |
| psql connection | psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' |
| zsh special chars | Write .js file and run with node — never inline -e with IPv6 brackets or ! |
| REPLACE() in JOIN | Never use on large tables — temp table + direct SKU join instead |
| WPS images on Vercel | http:// URLs = mixed content. Always proxy via /api/image-proxy or /api/img — never redirect |
| display_category facet query | facetBase already includes WHERE — use AND not WHERE for IS NOT NULL condition |
| VariantSelector fitment grouping | Check hasOptionValues first — if option_1_value exists, always use flat list |
| app/layout.jsx vs layout.tsx | Only layout.tsx should exist at app root. layout.jsx was a rogue admin layout — deleted |
| year_min/year_max in browse | Must be in state init + fetchProducts + handleFilterChange + clear-all in browse/page.jsx |

---

## KEY COMMANDS

```bash
# Connect
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'

# Rebuild variant groups (safe to re-run — cleanup pass dissolves oversized groups first)
node scripts/ingest/build_variant_groups.cjs --dry  # preview
node scripts/ingest/build_variant_groups.cjs         # live

# Typesense reindex
node scripts/ingest/index_unified.js --recreate

# Deploy
npx vercel --prod

# Check display_category coverage after merge
SELECT display_category, COUNT(*) FROM catalog_unified WHERE is_active = true GROUP BY display_category ORDER BY COUNT(*) DESC;
```

---

*Master Reference — Last update: May 27, 2026 · Thirty-First Pass*
