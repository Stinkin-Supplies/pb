# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: April 29, 2026 — end of DB session

---

## 🚀 NEXT SESSION — START HERE

1. **Reindex Typesense** — pricing updated, needs refresh
   ```bash
   node scripts/ingest/index_unified.js --recreate
   ```
2. **Request PU ACES fitment files** from PU rep (30% → 70%+ coverage)
3. **Verify era page product counts** — confirm queries work with new FK target (catalog_unified)
4. **Era images** — 8 WebP images still missing (see list in HANDOFF_LOG)
5. **My Garage audit** — built against /shop, review for /browse

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

### Reindex Typesense
Pricing was updated this session. Typesense still has stale computed_price values.
```bash
node scripts/ingest/index_unified.js --recreate
```

### PU ACES Fitment Files
30% → 70%+ fitment coverage for PU products. Request ACES XML from PU rep.
Once received, run fitment extraction against pu_products and insert into catalog_fitment_v2.

---

## 🔵 LOW PRIORITY / FUTURE

### Era images remaining (800×600px min, WebP, landscape)
```
public/images/eras/panhead.webp
public/images/eras/ironhead-sportster.webp
public/images/eras/shovelhead.webp
public/images/eras/evolution.webp
public/images/eras/evo-sportster.webp
public/images/eras/twin-cam.webp
public/images/eras/milwaukee-8.webp
public/images/eras/chopper.webp
```

### My Garage audit
Built against /shop — review now that /browse is canonical.

### WPS FatBook PDF OEM extraction
### Tire catalog images — tire_master_image.xlsx not processed
### Fix import_pu_brand_xml.js — remove dead cuOEM UPDATE block
### IMG_CACHE_DIR — set in .env.local on Hetzner

---

## 📊 CURRENT STATE (End of April 29)

| Metric | Value |
|--------|-------|
| catalog_unified | 88,512 rows |
| — WPS | 26,754 |
| — PU | 24,009 |
| — VTwin | 37,749 |
| catalog_products | ~133,022 rows (includes non-Harley) |
| pu_products | ~152,928 rows (includes non-Harley) |
| Typesense indexed | 88,301 (⚠️ needs reindex) |
| catalog_fitment_archived | 26,008 rows (legacy, do not write) |
| catalog_fitment_v2 | ~2,896,193 rows |
| — FK points to | catalog_unified.id ✅ |
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
| Era pages | 9 eras live at /era/[slug] |
| Homepage | Live — era cards + category grid + corner nav |
| Fonts | Bebas Neue + Share Tech Mono live |

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

---

*Updated: April 29, 2026*
