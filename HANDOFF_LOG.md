# Handoff Log

Use this file as the root-level record of changes, verification, and follow-up items.

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
- `catalog_unified` — normalized 40+ granular family name variants → 6 clean families (Touring, Softail, Dyna, Sportster, FXR, V-Rod)
- `catalog_unified` — backfilled `internal_sku` for 20,281 rows
- `catalog_products` — generated `internal_sku` for all 20,281 NULL products (prefix by category)
- `hd_models` — inserted 11 FXR model rows (FXRS, FXRT, FXRD, FXRDG, FXRP, FXLR, FXRS-SP, FXRS-CON, FXR, FXEF, FXSB)
- `hd_family_engine_map` — FXR entry confirmed present

### Verification
- `curl localhost:3000/api/harley2/products?family=Touring&year=2013&category=Exhaust` → returns products ✅
- `curl localhost:3000/api/harley/models?family=FXR` → returns 1982–1994 correct models ✅
- `catalog_unified` fitment families: Touring 4,580 | Softail 1,621 | FXR 1,412 | Dyna 1,144 | Sportster 970 | V-Rod 29
- `catalog_products` NULL internal_sku: 0 ✅

### Open Items
1. **PDP image still broken** — `images: []` returned despite `catalog_media` having valid URLs. Debug console.log added at line ~175 of `page.jsx` — **remove before deploy**. Root cause not yet confirmed: subquery returns empty array even though direct psql join works. Suspect connection pool or schema search_path issue.
2. **Typesense needs reindex** — fitment + OEM data added April 17 not yet in index. Run reindex on stable WiFi (first thing next session).
3. **catalog_fitment sparse** — 7.7% coverage. Pre-existing granular rows (FXRT Sport Glide, TLE SIDECAR variants etc.) still exist in `catalog_fitment` but are normalized in `catalog_unified`. Low priority.
4. **Tire catalog images** — `tire_master_image.xlsx` not yet processed.
5. **WPS FatBook PDF OEM extraction** — WPS side of catalog_oem_crossref still sparse.
6. **9 PU products with NULL computed_price** — genuinely unpriceable, may need manual entry or removal.

---

## 2026-04-14 — Harley Shop Swap

### Summary
- Replaced the default `/shop` experience with a Harley-first shop flow while keeping the legacy grid available.

### Changed Files
- `app/shop/page.jsx`
- `app/shop/classic/page.jsx`
- `app/harley/page.tsx`
- `app/harley/HarleySearchClient.tsx`
- `app/api/harley2/styles/route.ts`
- `app/api/harley2/style-models/route.ts`
- `app/api/harley2/style-products/route.ts`
- `app/api/harley2/submodels/route.ts`
- `app/api/harley2/products/route.ts`
- `app/api/harley2/exact-products/route.ts`
- `lib/harley/config.ts`
- `lib/harley/catalog.ts`

### Details
- The new shop experience starts with a Harley style stack, then drills into model, submodel, and category browsing.
- Existing `/shop` now defaults to the Harley-first flow.
- The legacy catalog grid remains available at `/shop/classic` and via `?view=classic`.
- Harley fitment routes now read from the existing vehicle and catalog tables instead of placeholder packages.
- Product detail uses a shared-layout modal transition.

### Verification
- `npm run build` completed successfully after the Harley swap.

### Open Items
- The Harley experience is now wired, but the exact fitment behavior still depends on how much submodel data exists in the `vehicles` and catalog fitment tables.

---

## 2026-04-14 — Build Fixes

### Summary
- Fixed broken build issues in the products API route, product detail page, and shop client prerender state.

### Changed Files
- `app/api/products/route.ts`
- `app/shop/[slug]/ProductDetailClient.jsx`
- `app/shop/ShopClient.jsx`

### Details
- Rebuilt `app/api/products/route.ts` into a valid GET handler after the file was left in a broken merged state.
- Removed stale and duplicated control flow from the products API route.
- Fixed JSX parsing in `app/shop/[slug]/ProductDetailClient.jsx` by removing stray closing tags.
- Removed the duplicate `activeTab` state declaration in `ProductDetailClient.jsx`.
- Added missing `openSections` state in `app/shop/ShopClient.jsx` so category/shop pages can prerender without crashing.

### Verification
- `npm run build` completed successfully.

### Open Items
- The repo contains Typesense and OEM cross-reference scaffolding, but external execution steps against Postgres and Typesense cannot be confirmed from the filesystem alone.

---

## Current State (April 17, 2026)

| Metric | Value |
|--------|-------|
| catalog_products | 98,353 (0 NULL internal_sku) |
| — WPS | 27,219 (100% priced) |
| — PU | 71,134 (99.99% priced) |
| catalog_unified | 94,400 rows |
| — is_harley_fitment = true | 7,237 rows |
| Typesense indexed | 94,400 (**needs reindex**) |
| Products with images | 44,508 |
| catalog_media | 58,544 rows |
| catalog_oem_crossref | 93,548 rows |
| catalog_fitment | 18,653 rows / 7,256 products |
| Harley families in catalog_unified | Touring 4,580 / Softail 1,621 / FXR 1,412 / Dyna 1,144 / Sportster 970 / V-Rod 29 |
| Search | ✅ Working |
| Fitment filtering (/harley) | ✅ Working |
| PDP internal SKU display | ✅ Fixed |
| PDP images | ⚠️ Broken (debug in progress) |

### ⚠️ Before Deploying
- Remove `console.log("[PDP DEBUG]...")` from `app/shop/[slug]/page.jsx` line ~175
- Resolve PDP image bug (images array returning empty)
- Run Typesense reindex

### First Thing Next Session
```bash
# Remove debug log first
# Then reindex
npx dotenv -e .env.local -- node -e "import('./scripts/ingest/index_assembly.js').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"
```
