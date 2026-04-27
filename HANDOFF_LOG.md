# Stinkin' Supplies — Session Handoff
**Date:** April 27, 2026
**Status:** ✅ Typesense reindexed | ✅ Admin product manager live | ✅ Schema cleaned up | ✅ VTwin image + sort fixes | ⏳ Phase 10 cutover pending

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,301 docs (fresh index from April 26)
- **Fitment filtering** — catalog_fitment_v2 live (~3,048,000+ rows, 10,580 products)
- **Fitment dropdowns** — /api/fitment serves families/models/years from canonical tables
- **OEM numbers** — 5,411 products have OEM numbers in catalog_unified.oem_numbers[]
- **catalog_oem_crossref** — ~95,116 rows
- **Harley authority tables** — 15 families, 158 models, 1,415 model-year rows (1936–2026)
- **Admin product manager** — /admin/products live (search, filter, edit, bulk actions, fitment)
- **Production** — https://stinksupp.vercel.app

---

## 📦 WHAT WAS DONE THIS SESSION (April 27)

### 1. Shop Sort Default — VTwin Domination Fix
- Default sort changed from `newest` (created_at DESC) to `name_asc` across all three entry points
- Files: `app/api/products/route.ts`, `app/shop/ShopClient.jsx`, `app/shop/page.jsx`
- Root cause: VTwin was the most recently ingested vendor so all 37k rows had the latest `created_at`, flooding the first pages

### 2. VTwin Image Blurriness Fix
- Root cause 1: `catalog_unified.image_url` was storing THUMB_PIC (`/tn/` path, `t`-suffix) instead of FULL_PIC1
- Root cause 2: `vtwinmfg.com` blocks hotlinks — browser was receiving a rejected/placeholder response and scaling it up
- **DB fix:** `UPDATE catalog_unified SET image_url = image_urls[1] WHERE source_vendor = 'VTWIN' AND image_url LIKE '%/tn/%'` — 30,856 rows updated, 0 thumbnail URLs remaining
- **Proxy fix:** Added `vtwinmfg.com` to `/api/image-proxy` with spoofed `Referer: https://www.vtwinmfg.com/` header; `normalizeProductRow` now wraps vtwin image URLs through the proxy before returning them to the ProductCard
- **Ingest fix:** `scripts/ingest/ingest_vtwin_unified.js` primaryImage now prefers `full_pic1` over `thumb_pic` (for future re-ingests)
- **Enrich fix:** `scripts/ingest/enrich_vtwin_content.js` removed `!row.image_url` guard that was silently skipping image updates when a thumbnail was already stored
- Files changed: `app/api/image-proxy/route.ts`, `app/api/products/route.ts`, `lib/getProductImage.ts`, `next.config.ts`, `scripts/ingest/ingest_vtwin_unified.js`, `scripts/ingest/enrich_vtwin_content.js`

---

## 📦 WHAT WAS DONE LAST SESSION (April 26)

### 1. Typesense Reindex
- Ran `node scripts/ingest/index_unified.js --recreate`
- Result: **88,301 docs indexed, 0 errors** in 104.2s
- Picks up all April 25 enrichment (descriptions, features, images, fitment)

### 2. Typesense Schema Cleanup
- Audited schema mismatch issue from chase list
- `index_unified.js` already had all needed fields: `source_vendor`, `is_active`, `has_image`, `features`
- `drag_part`, `in_fatbook`, `in_harddrive` intentionally excluded — not used anywhere
- Retired `index_assembly.js` and `index_assembly_updated.js` — all references updated to `index_unified.js`
- Updated: pipeline.js, package.json, backfill_pu_fitment_structured.js, run_pu_enrichment.js, extract_fitment.js, importPuPriceFile.js, import_pu_brand_xml.js, ingest_vtwin_unified.js, all MasterRef/BuildTracker docs

### 3. Phase 9 — Admin Product Manager (`/admin/products`)
- Full product editor with search, vendor/category/brand filters
- Table view: SKU, name, vendor badge, brand, category, status, fitment count, image thumb
- Single product edit modal: name, description, features list, active/discontinued toggles
- Fitment editor: view assigned fitment, add via Family→Model→Year cascade, remove individual rows
- Bulk actions: activate, deactivate, assign fitment (modal), delete (with confirm)
- Pagination (50/page)
- Nav item added to `/admin` dashboard

### New Files
```
app/admin/products/page.jsx                      — server component, auth + seed data
app/admin/products/ProductManager.jsx            — full client UI
app/api/admin/products/route.ts                  — GET (list) + POST (bulk actions)
app/api/admin/products/[id]/route.ts             — PATCH (single product edit)
app/api/admin/products/[id]/fitment/route.ts     — GET/POST/DELETE fitment
app/api/fitment/models/route.ts                  — cascade: family → models
app/api/fitment/years/route.ts                   — cascade: model → years
```

### Bug Fixes
- `proxy.ts` — added `/api/admin/` to `isPublic` passthrough (was intercepting admin API routes, returning blank 200)
- `harley_families` — no `slug` column exists; fixed all queries to use `name` instead
- `getCatalogDb` import path — corrected to `@/lib/db/catalog` across all new route files
- TypeScript handler signatures — added `Request` type and `{ params }` types to all route handlers
- `catalog_fitment_v2` unique constraint — added `UNIQUE (product_id, model_year_id)` directly on DB for `ON CONFLICT DO NOTHING` to work safely

```sql
ALTER TABLE catalog_fitment_v2
ADD CONSTRAINT cfv_product_model_year_unique
UNIQUE (product_id, model_year_id);
```

---

## 📊 CURRENT STATE (End of April 26)

### catalog_unified fitment coverage
```
PU    (24,009): has_year=5,171 | has_families=5,365 | has_ranges=4,911 | 21.5%
VTWIN (37,749): has_year=5,399 | has_families=5,370 | has_ranges=5,399 | 14.3%
WPS   (26,754): has_year=2,266 | has_families=2,362 | has_ranges=2,226 |  8.5%
```

### catalog_fitment_v2
```
Total rows:          ~3,048,000+
VTwin covered:       4,858 products (12.9%)
WPS covered:         2,328 products (8.7%)
PU covered:          7,250 products (30.2%)
```

---

## 🚨 CURRENT ISSUES

### Issue 1: Phase 10 (cutover) not done
`catalog_fitment` still exists. Cutover to v2 pending.

### Issue 2: catalog_unified vs catalog_products sync
Frontend shop grid reads from `catalog_products` (not `catalog_unified`). `source_vendor` is lowercase in `catalog_products` (`vtwin`, `wps`, `pu`) but uppercase in `catalog_unified` (`VTWIN`, `WPS`, `PU`). Keep this in mind for any vendor-specific queries.

### Issue 3: PU fitment gap (post-2012)
`hd_parts_data_clean.csv` covers 1979–2012 only. PU items for 2013+ bikes need PU ACES XML files from PU rep.

### Issue 4: enrich_vtwin_content.js DATABASE_URL mismatch
The enrichment script reads `process.env.DATABASE_URL` but the live DB requires the hardcoded Hetzner connection. Either export `DATABASE_URL` before running or switch the script to use the hardcoded string (see `ingest_vtwin_unified.js` for the pattern). The April 27 DB fix was applied directly via psql instead.

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Phase 10 — Cutover** — archive `catalog_fitment`, all writes → `catalog_fitment_v2` only
2. **PU ACES fitment files** — request from PU rep, would push PU fitment from 30% → 70%+
3. **Expand model_alias_map** — add FLTRX, FXDB, FLHTK, FLSTF and other missing codes

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
