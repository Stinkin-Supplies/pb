# Stinkin' Supplies — Master Reference
**Last Updated:** May 26, 2026 (Thirtieth Pass)
**Database:** Hetzner Postgres — stinkin_catalog
**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Nav redesigned ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (active) | 89,989 rows | ✅ PU 36,396 / WPS 15,844 / VTWIN 37,749 |
| catalog_fitment_v2 | 2,245,762 rows | ✅ JW Boon + WPS + OEM |
| catalog_oem_crossref | 55,122 rows | ✅ FatBook + OldBook + manual |
| catalog_variant_groups | 7,141 | ✅ MAX_VARIANT_MEMBERS=20 cap enforced |
| catalog_variant_members | 27,989 | ✅ |
| oem_fitment | 379,899 rows | ✅ All families |
| harley_model_years | 1,619 rows | ✅ DO NOT MODIFY |
| Typesense | 89,989 docs | ✅ Reindexed May 26 |
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

---

## VARIANT GROUP RULES

- **MAX_VARIANT_MEMBERS = 20** in build_variant_groups.cjs — enforced via HAVING clause + per-group guard + cleanup pass
- WPS wps_product_id is a product LINE id — not a true variant signal for groups > 20
- Real variants (color/finish/size/compound/oversize) max out ~10-15 SKUs
- Cleanup pass runs at top of main() — dissolves existing oversized groups before any inserts
- Browse count = DISTINCT ON (COALESCE(variant_group_id, 'u'||id)) — 89,989 active → 71,834 cards is correct

---

## BROWSE / TYPESENSE FILTER

Browse page uses `is_active = true` only — no book flag gate. All 89,989 active rows are eligible.
Typesense index: all active products indexed, no additional filter beyond is_active.

---

## ADMIN TOOLS

| Route | Purpose |
|-------|---------|
| /admin/products | Product manager — search/filter, inline edit, fitment, bulk actions |
| /admin/oem-crossref | OEM crossref table — paginated, bulk delete/brand/add-OEM |
| /admin/fitment | Fitment modal editor |

### OEM Crossref Bulk API
`POST/PATCH/DELETE /api/admin/oem-crossref/bulk`
Payload: `{ mode: "ids", ids: number[] }` or `{ mode: "filter", search, brand, source }`
- DELETE: removes rows
- PATCH: `{ field: "oem_manufacturer", value: string }` — bulk brand update
- POST: `{ oem_number, oem_manufacturer, source_file }` — adds OEM# to distinct SKUs of selection, ON CONFLICT DO NOTHING

---

## BOTTOM NAV BEHAVIOR

- **Idle / scrolling up**: full pill centered at bottom (width min(88vw,440px), height 58px)
- **Scrolling down >40px**: collapses to 52px gold orb, bottom-right corner (right:20, bottom:20)
- **Stops scrolling**: settle timer (1200ms) auto-expands back to pill
- On /browse collapsed orb: hamburger icon → fires stinkin:filterToggle
- On other pages collapsed orb: search icon → opens search popup bottom-right
- Single motion.nav element (never unmounts) — prevents Framer Motion removeChild crash

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
Step 14: node scripts/ingest/index_unified.js --recreate
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
```

---

*Master Reference — Last update: May 26, 2026 · Thirtieth Pass*
