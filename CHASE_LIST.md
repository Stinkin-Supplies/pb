# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 30, 2026 — end of session (second pass)

---

## 🚀 NEXT SESSION — START HERE

1. **PDP updates** — display `image_urls` (multi-image carousel), `special_instructions`, confirm bullets render
2. **WPS fitment files** — pending from WPS rep (contacted April 30)
3. **My Garage audit** — built against /shop, review for /browse
4. **Low-confidence fitment staging** — 560 products in fitment_staging with confidence='low', not yet promoted

---

## ✅ DONE APRIL 30 — SECOND PASS

| Task | Result |
|------|--------|
| Era page product counts verified | ✅ All 9 eras returning real counts |
| Era config fixed | ✅ Family names now match DB (Softail Evo, Softail M8, etc.) |
| Era images | ✅ All 9 WebP images live |
| hf.slug bug | ✅ Fixed in api/admin/products/[id]/fitment/route.ts |
| Fitment staging pipeline | ✅ Built infer_fitment_staging.js + promote_fitment_staging.js |
| Fitment inference — all vendors | ✅ 88,512 products evaluated, 61,404 rows inserted to fitment_staging |
| High-confidence fitment promoted | ✅ 43,552 rows → catalog_fitment_v2 |
| Medium-confidence fitment promoted | ✅ 199,513 rows → catalog_fitment_v2 |
| Universal products flagged | ✅ 311 products set is_universal = true |
| Old iron era counts | ✅ Knucklehead 2,745 / Panhead 3,224 / Shovelhead 6,310 |
| Typesense reindexed | ✅ 88,512 docs, 0 errors |
| Browse search param bug | ✅ Fixed in lib/db/browse.ts (p index was advancing too far) |
| VTwin PDP 404 | ✅ Fixed — removed flag gate from unified fallback in page.jsx |
| generateMetadata | ✅ Fixed — now queries catalog_unified for VTwin-only products |
| catalog.ts hardened | ✅ Throws on missing CATALOG_DATABASE_URL instead of silently hitting prod |

---

## ✅ DONE APRIL 30 — FIRST PASS

| Task | Result |
|------|--------|
| Reindex Typesense | ✅ 88,512 docs, 0 errors, pricing current |
| WPS fitment files | ✅ Contacted WPS rep — awaiting files |
| pu_products schema migration | ✅ Added part_image, product_image, special_instructions, supplier_number |
| enrich_pu_products.cjs | ✅ Built — parses Catalog Content + PIES, upserts pu_products, syncs catalog_unified |
| PU image ingestion — main zip | ✅ 134 files, 77,958 updated |
| PU image ingestion — brand files | ✅ 95 files, 6,434 updated |
| PU image coverage | ✅ 23,975 / 24,009 (99.9%) |
| PU dual image_urls | ✅ 8,310 products with 2+ images |

---

## ✅ DONE APRIL 29 — DB SESSION

| Task | Result |
|------|--------|
| FK: catalog_fitment_v2 → catalog_unified | ✅ Migrated, orphans cleaned |
| FK: vendor_offers → catalog_unified | ✅ Migrated, orphans cleaned |
| daily_price_sync.js | ✅ Built, bulk SQL, MAP compliant |
| WPS pricing | ✅ 26,729 products, 0 MAP violations |
| PU pricing | ✅ 24,007 products, 0 MAP violations |
| Cron on Hetzner | ✅ 3am daily, /var/log/price_sync.log |
| VTwin fitment migration pass 1 | ✅ 542,161 rows |
| VTwin fitment migration pass 2 (aliases) | ✅ +26,974 rows |
| model_alias_map expansion | ✅ FLTRX, FXDB, FLHTK, FLSTF, FLHRC, FXDWG |

## ✅ DONE APRIL 29 — FRONTEND SESSION

| Task | Result |
|------|--------|
| Homepage redesign | Era cards + category grid + corner nav + floating header |
| lib/eras/config.ts | 9 eras with year_min/year_max for Sportster split |
| app/era/[slug]/page.jsx | Era landing page, side panel filters, product grid |
| lib/db/browse.ts | Multi-family, universal, yearMin/yearMax, dbCategories |
| api/browse/products/route.ts | Passes families[], year_min, year_max, dbCategory[] |
| app/layout.tsx | Bebas Neue + Share Tech Mono via next/font/google |
| /shop → /browse | All references updated, shop directory deleted |
| knucklehead.webp | Live on homepage era card |

---

## ✅ DONE APRIL 27

| Task | Result |
|------|--------|
| Phase 10 complete | catalog_fitment → catalog_fitment_archived, all routes on v2 |
| 6 ingest scripts retired | Moved to scripts/ingest/_retired/ |
| api/fitment/route.ts | HD-only, non-Harley paths removed |
| api/products/route.ts | Non-Harley fitment block removed |
| api/harley2/style-products/route.ts | Rewritten for catalog_fitment_v2 |
| app/browse/[slug]/page.jsx | Fitment reads from catalog_fitment_readable |

---

## 🔴 HIGH PRIORITY

### WPS Fitment Files
Contacted WPS rep April 30. Once received, run fitment extraction and insert into catalog_fitment_v2.

### PDP — Rich Content Display
`image_urls`, `special_instructions`, and bullets are now in the DB but not displayed on the PDP.
- Multi-image carousel/gallery using `catalog_unified.image_urls`
- `special_instructions` block (where not null)
- Bullets already in `features` array — confirm rendering

---

## 🔵 LOW PRIORITY / FUTURE

### Low-confidence fitment staging — 560 products
`fitment_staging` has 560 products with `confidence='low'` and `status='pending'`.
These are displacement-inference rows (e.g. "80 inch" → Shovelhead/Evo range).
Review before promoting: `SELECT * FROM fitment_staging WHERE confidence='low' LIMIT 30;`

### My Garage audit
Built against /shop — review now that /browse is canonical.

### PU SKU mismatches — minor brands
jagoilcoolers (55 parsed, 1 updated), dannygray (72 parsed, 6 updated),
ohlins (102 parsed, 50 updated), avon-gripd (285 parsed, 40 updated).
Investigate SKU format mismatch.

### WPS FatBook PDF OEM extraction
### Tire catalog images — tire_master_image.xlsx not processed
### Fix import_pu_brand_xml.js — remove dead cuOEM UPDATE block
### IMG_CACHE_DIR — set in .env.local on Hetzner

---

## 📊 CURRENT STATE (End of April 30 — second pass)

| Metric | Value |
|--------|-------|
| catalog_unified | 88,512 rows |
| — WPS | 26,754 |
| — PU | 24,009 |
| — VTwin | 37,749 |
| catalog_products | ~133,022 rows (includes non-Harley) |
| pu_products | ~152,928 rows (includes non-Harley) |
| Typesense indexed | 88,512 ✅ (reindexed April 30) |
| catalog_fitment_archived | 26,008 rows (legacy, do not write) |
| catalog_fitment_v2 | ~3,139,258 rows (after staging promotion) |
| — FK points to | catalog_unified.id ✅ |
| fitment_staging | 61,404 rows total — high+medium promoted, low pending |
| vendor_offers | 23,499 rows |
| — FK points to | catalog_unified.id ✅ |
| WPS pricing | 26,729 products synced |
| PU pricing | 24,007 products synced |
| MAP violations | 0 ✅ |
| Cron | 0 3 * * * Hetzner |
| harley_families | 15 |
| harley_models | 158 |
| harley_model_years | 1,415 rows |
| model_alias_map | +6 new aliases (FLTRX, FXDB, FLHTK, FLSTF, FLHRC, FXDWG) |
| Era pages | 9 eras live, all with real product counts |
| Era fitment counts | Knucklehead 2,745 / Panhead 3,224 / Shovelhead 6,310 / Evolution 6,649 / Ironhead 1,962 / Evo Sportster 3,293 / Twin Cam 10,291 / Milwaukee-8 4,414 / Chopper 3,630 |
| Homepage | Live — era cards + category grid + corner nav |
| Fonts | Bebas Neue + Share Tech Mono live |
| PU image_url coverage | 23,975 / 24,009 (99.9%) |
| PU image_urls (2+) | 8,310 / 24,009 |
| pu_products new columns | part_image, product_image, special_instructions, supplier_number ✅ |
| is_universal products | 311 flagged ✅ |

---

## 🏗️ ARCHITECTURE VISION (current reality)

Each vendor has their own source table for daily price updates:
- `catalog_products` — WPS source (pricing via `catalog_pricing`)
- `pu_products` — PU source (pricing via `pu_pricing`)
- VTwin — lives directly in `catalog_unified` (no separate vendor table)

All flow into `catalog_unified` — the ONLY table the frontend reads.
`catalog_fitment_v2.product_id` references `catalog_unified.id` ✅
`vendor_offers.catalog_product_id` references `catalog_unified.id` ✅

Daily pricing pipeline:
1. `catalog_pricing` / `pu_pricing` → `vendor_offers` (upsert with MAP formula)
2. `vendor_offers` → `catalog_unified.computed_price` (bulk sync)
3. Cron runs at 3am Hetzner time

PU enrichment pipeline:
- `scripts/ingest/enrich_pu_products.cjs <xml_dir>` — parses Catalog Content + PIES XMLs
- Detects format by root tag (`<root>` = Catalog Content, else PIES)
- Upserts part_image, product_image, special_instructions, supplier_number into pu_products
- Syncs image_url + image_urls to catalog_unified

Fitment staging pipeline:
- `scripts/ingest/infer_fitment_staging.js [--vendor VTWIN|PU|WPS] [--replace]`
- 4-pass inference: OEM year decode → era keyword → displacement → universal flag
- Writes to `fitment_staging` table with confidence + status for review
- `scripts/ingest/promote_fitment_staging.js [--confidence high|medium|low] [--dry-run]`
- Promotes approved rows from fitment_staging → catalog_fitment_v2

---

*Updated: April 30, 2026 — second pass*
