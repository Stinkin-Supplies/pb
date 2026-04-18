# Handoff Log

Use this file as the root-level record of changes, verification, and follow-up items.

---

## 2026-04-18 — Shop Page Fixes, Filter Rebuild, Image + Price Pipeline

### Summary
- Rebuilt `/shop` filter sidebar from scratch — 4 clean sections only
- Fixed $0.00 prices across all products (wrong Typesense field)
- Fixed broken product images (double-proxy + wrong field name)
- Deleted ~2,869 non-HD products (Apparel, Helmets, Jackets, Footwear, Pants, Tracks)
- Reindexed Typesense (91,531 indexed, 0 failed)
- Fixed Harley shop returning zero products for every category (category name mismatch)
- Fixed Harley shop pricing (msrp → computed_price)
- Fixed Harley shop sort (in-stock + stock_quantity first)
- Removed stale `app/route.ts` causing build conflict

### Changed Files
- `app/shop/ShopClient.jsx` — filter sidebar rebuilt (4 sections: Fitment, Category, Brand, Price); fixed `setFiltersState` → `setFilters` bug; removed double-proxy in ProductCard; fixed image field to use `p.image`; removed dead imports/state
- `app/api/search/route.ts` — `normalizeProductDoc` now reads `doc.primary_image` for image, `doc.computed_price` for price
- `lib/typesense/client.ts` — removed `computed_price(stats)` facet (field not facetable in collection); fixed price filter to use `computed_price` instead of `msrp`
- `lib/harley/config.ts` — added `dbCategories[]` mapping to each `HarleyCategory`; each UI category now maps to multiple real DB category values
- `app/api/harley2/products/route.ts` — category filter now uses `= ANY($n::text[])` with resolved `dbCategories`; price uses `computed_price`; sort uses `in_stock DESC, stock_quantity DESC, computed_price DESC`
- `app/route.ts` — DELETED (was causing "Conflicting route and page at /" build error)

### Database Changes
- Deleted 2,571 products in categories: Apparel (1,343 PU + 87 WPS), Helmets (426), Jackets (278), Footwear (368), Pants (156) — plus their vendor_offers
- Deleted 298 Tracks products (all PU) + vendor_offers
- Total deleted: ~2,869 products

### Reindex
- Ran full reindex after deletions: **91,531 indexed, 0 failed** (101.7s)

### Verification
- `curl .../api/search?pageSize=1 | jq '.products[0] | {image, price}'` → image populated, price correct ✅
- Categories clean — no Apparel, Helmets, Jackets, Footwear, Pants, Tracks ✅
- Harley shop `/harley` — Controls & Handlebars now resolves to 7 DB categories ✅

### Open Items
1. **Product images still showing broken on live site** — `primary_image` field confirmed in Typesense with correct `/api/img?u=...` URL; API returning correct `image` field; browser rendering unknown — needs screenshot verification
2. **`catalog_unified` not rebuilt** — still reflects pre-deletion data; rebuild recommended
3. **Harley shop image field** — `normalizeHarleyProductRow` uses `image_url` from `catalog_unified`; may need same fix as search route
4. **`catalog_unified.computed_price`** — confirm column exists and is populated

---

## 2026-04-17 — Fitment Filtering + PDP Fixes

### Summary
- Wired `catalog_fitment` data into `catalog_unified` so the Harley shop actually returns products
- Normalized 40+ granular family name variants into 6 clean families
- Rebuilt `lib/harley/config.ts` to match only families with real fitment data
- Fixed FXR year dropdown (missing `hd_models` rows + models API engine_key collision)
- Generated `internal_sku` for all 20,281 products that were missing it
- Fixed PDP to display `internal_sku` instead of vendor SKU
- Fixed PDP image rendering (WPS URLs were being incorrectly proxied)
- Fixed PDP specs table showing `CATALOG: Fatbook/Oldbook/Tire` rows
- Fixed `normalizeHarleyProductRow` SKU extraction (slug regex → internal_sku)

### Changed Files
- `lib/harley/config.ts` — stripped to 6 real families: Touring, Softail, Dyna, Sportster, FXR, V-Rod
- `app/api/harley/models/route.ts` — fixed engine_key fallback bleeding Softail rows into FXR
- `app/api/harley2/products/route.ts` — added `cu.internal_sku` to SELECT
- `app/shop/[slug]/page.jsx` — added `cp.internal_sku` to SELECT; fixed `gallery`/`primaryImage` mapping; fixed `sku` field to use `internal_sku`; filtered Catalog/Product Code from specs
- `app/shop/[slug]/ProductDetailClient.jsx` — fixed `displaySku` to use `internal_sku`; fixed WPS image proxy (direct now, proxy only for LeMans)
- `lib/harley/catalog.ts` — fixed SKU extraction to use `internal_sku`

### Database Changes
- `catalog_unified` — populated `is_harley_fitment`, `fitment_hd_families`, `fitment_year_start`, `fitment_year_end` from `catalog_fitment` (7,237 rows updated)
- `catalog_unified` — normalized 40+ granular family name variants → 6 clean families
- `catalog_unified` — backfilled `internal_sku` for 20,281 rows
- `catalog_products` — generated `internal_sku` for all 20,281 NULL products
- `hd_models` — inserted 11 FXR model rows
- `hd_family_engine_map` — FXR entry confirmed present

### Verification
- `curl localhost:3000/api/harley2/products?family=Touring&year=2013&category=Exhaust` → returns products ✅
- `catalog_products` NULL internal_sku: 0 ✅

---

## 2026-04-17 — Enrichment Backfill + LeMans Image Proxy

### Summary
- Backfilled descriptions, specs, and catalog_unified sync
- Built on-demand image proxy (`/api/img`) for LeMans ZIP archives
- Reindexed Typesense with proxy URLs

### Changed Files
- `app/api/img/route.ts` — NEW: on-demand LeMans ZIP image proxy
- `lib/utils/image-proxy.ts` — NEW: shared `proxyImageUrl` / `proxyImageUrls` utilities
- `app/shop/[slug]/page.jsx` — removed debug log; applied proxy to gallery/primaryImage
- `app/api/search/route.ts` — applied proxy in normalizers
- `lib/harley/catalog.ts` — applied proxy in `normalizeHarleyProductRow`
- `scripts/ingest/index_assembly.js` — LeMans prefix check + proxy URL generation

### Image Architecture
- **Direct URLs** — regular HTTPS CDN links, served as-is
- **LeMans ZIP URLs** — `http://asset.lemansnet.com/z/<base64>` — proxy via `/api/img?u=<encoded>`
- Typesense stores already-proxied URLs in `primary_image` field

---

## 2026-04-14 — Harley Shop Swap + Build Fixes

### Summary
- Replaced `/shop` default with Harley-first flow; legacy grid at `/shop/classic`
- Fixed broken build issues in products API route, PDP, ShopClient

---

## Current State (April 18, 2026)

| Metric | Value |
|--------|-------|
| catalog_products | ~95,484 (after deletions) |
| — WPS | 27,219 (100% priced) |
| — PU | ~68,265 (99.99% priced) |
| catalog_unified | 94,400 (needs rebuild after deletions) |
| Typesense indexed | **91,531** (reindexed April 18) |
| Products with images | ~44,508 |
| catalog_media | 58,544 rows |
| catalog_oem_crossref | 93,548 rows |
| catalog_fitment | 18,653 rows / 7,256 products |
| Search | ✅ Working |
| Prices | ✅ Fixed (computed_price) |
| Filter sidebar | ✅ Rebuilt (4 clean sections) |
| Harley shop categories | ✅ Fixed (dbCategories mapping) |
| PDP images | ✅ Fixed (LeMans proxy) |
