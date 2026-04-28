# Stinkin' Supplies — Session Handoff
**Date:** April 27, 2026
**Status:** ✅ Phase 10 cutover complete | ✅ catalog_fitment archived | ✅ All routes on v2

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,301 docs (fresh index from April 26)
- **Fitment filtering** — catalog_fitment_v2 only (~3,048,000+ rows, 10,580 products)
- **Fitment dropdowns** — /api/fitment serves families/models/years, HD-only, no legacy paths
- **OEM numbers** — 5,411 products have OEM numbers in catalog_unified.oem_numbers[]
- **catalog_oem_crossref** — ~95,116 rows
- **Harley authority tables** — 15 families, 158 models, 1,415 model-year rows (1936–2026)
- **Admin product manager** — /admin/products live (search, filter, edit, bulk actions, fitment)
- **Production** — https://stinksupp.vercel.app

---

## 📦 WHAT WAS DONE THIS SESSION (April 27)

### Phase 10 — Cutover Complete
- `catalog_fitment` renamed to `catalog_fitment_archived` on DB
- All app routes redirected to `catalog_fitment_v2` exclusively
- 6 legacy ingest scripts moved to `scripts/ingest/_retired/`

### Routes Updated
| File | Change |
|------|--------|
| `app/api/fitment/route.ts` | Removed makes endpoint + all non-Harley paths. HD-only, no make param needed |
| `app/api/products/route.ts` | Removed fitmentMake param + non-Harley else-if block |
| `app/api/harley2/style-products/route.ts` | Replaced catalog_fitment JOIN with EXISTS through catalog_fitment_v2 → harley_families |
| `app/browse/[slug]/page.jsx` | Fitment query switched from catalog_fitment to catalog_fitment_readable view |

### Scripts Retired (moved to scripts/ingest/_retired/)
- `extract_fitment.js`
- `import-hd-fitment.js`
- `normalize_aces.js`
- `backfill_pu_fitment_structured.js`
- `stage0-wps-fitment.js`
- `phase4_migrate_fitment.js`

---

## 📊 CURRENT STATE (End of April 27)

### catalog_fitment status
```
catalog_fitment          → ARCHIVED (renamed catalog_fitment_archived)
catalog_fitment_v2       → SOLE CANONICAL TABLE (~3,048,000+ rows)
catalog_fitment_readable → VIEW over v2, used by browse/[slug] for display
```

### catalog_fitment_v2 coverage
```
VTwin covered:   4,858 products (12.9%)
WPS covered:     2,328 products (8.7%)
PU covered:      7,250 products (30.2%)
```

---

## 🚨 CURRENT ISSUES

### Issue 1: PU fitment gap (post-2012)
`hd_parts_data_clean.csv` covers 1979–2012 only. PU items for 2013+ bikes need PU ACES XML files from PU rep. This is the single biggest remaining fitment unlock.

### Issue 2: catalog_unified vs catalog_products sync
Frontend reads from `catalog_unified`. Fitment filtering reads from `catalog_fitment_v2` which references `catalog_products.id`. Stay in sync via shared `sku` but are separate tables.

---

## 🗺️ NEXT SESSION PRIORITIES

1. **PU ACES fitment files** — request from PU rep, would push PU fitment from 30% → 70%+
2. **Expand model_alias_map** — add FLTRX, FXDB, FLHTK, FLSTF and other missing codes
3. **Frontend redesign** — /browse overhaul (discuss vision before building)

---

## 🏗️ INFRASTRUCTURE (unchanged)

```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
Typesense:  Docker "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443 HTTPS → Typesense (5.161.100.126.nip.io)
Vercel:     epluris-projects/pb → https://stinksupp.vercel.app
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| `features` is `text[]` not `text` | Wrap plain strings as `[string]` before writing |
| `image_urls` is `text[]` not JSON | Pass JS array, pg driver serializes automatically |
| `fitment_hd_families` is `text[]` | Pass JS array, not `{Family1,Family2}` string |
| `fitment_year_ranges` is `jsonb` | Pass as JSON string with `::jsonb` cast |
| `oem_numbers` is `text[]` | Pass JS array, not JSON string |
| VTwin join key | `catalog_unified.vendor_sku = vtwin-master.ITEM` (NOT catalog_unified.sku) |
| `catalog_products.sku` for VTwin | IS the VTwin ITEM number directly (e.g. `10-0040`) |
| 21k+ individual UPDATE queries | Use temp table + single UPDATE FROM — row-by-row over network hangs |
| enrich_pu_xml.js --dir flag | `node enrich_pu_xml.js --dir scripts/data/pu_pricefile/brand_files` |
| DB-driven fitment improvement | INSERT into model_alias_map or engine_platform_map, re-run extract_fitment_db_driven.js |
| DATABASE_URL not persistent | `export DATABASE_URL="postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"` each session |
| `harley_families` has no slug column | Use `name` for joins and selects |
| Admin API routes bypassed by proxy | `/api/admin/` is in `isPublic` passthrough in proxy.ts |
| getCatalogDb import path | `import getCatalogDb from '@/lib/db/catalog'` |
| catalog_fitment | ARCHIVED — do not write to it. Use catalog_fitment_v2 only |
| /browse not /shop | Product detail page is app/browse/[slug]/page.jsx |
