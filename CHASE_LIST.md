# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: May 2, 2026 — end of session (seventh pass)

---

## 🚀 NEXT SESSION — START HERE

1. **Other H-D catalog families** — run same PDF extraction pipeline against
   Touring, Softail, Dyna, FXR folders (same format as Sportster).
   Update CATALOG_DIR + manifest in build_oem_fitment.mjs per family.
   All data lands in same oem_fitment table (catalog_file column distinguishes).

2. **WPS fitment files** — pending from rep (contacted April 30)
   When received: parse directly → catalog_fitment_v2, no inference.

3. **My Garage audit** — built against /shop, review for /browse

4. **Flathead era image** — need flathead.webp for homepage era card

5. **raw_vendor_aces** — confirmed EMPTY (0 rows). Remove from chase list.

---

## ✅ DONE MAY 2 — SEVENTH PASS

| Task | Result |
|------|--------|
| JW Boon fitment import | ✅ 348,377 rows inserted into catalog_fitment_v2 |
| 7,081 products backfilled | ✅ is_harley_fitment = true |
| seed_vintage_model_years.sql | ✅ Knucklehead/Panhead/Shovelhead/Ironhead/Flathead year rows seeded |
| harley_model_years | ✅ 1,602 rows (up from 1,501) |
| harley_models ironhead | ✅ K, KK, KH, KHK, KR, XL, XLH, XLCH, XLS, XLCR, XLT, XR750 added |
| raw_vendor_aces | ✅ Confirmed empty — no ACES data to parse |

---

## ✅ DONE MAY 2 — SIXTH PASS

| Task | Result |
|------|--------|
| Sportster OEM PDF extraction | ✅ 75,963 rows extracted from 30 catalogs (1986–2022) |
| oem_fitment table created | ✅ Full schema + GIN indexes + v_oem_fitment view |
| hd_sportster_models seeded | ✅ 26 canonical Sportster model codes (XL883N, XL1200X, etc.) |
| OEM → catalog_unified match | ✅ 23,869 rows matched via oem_numbers[] array (31.4%) |
| catalog_unified backfill | ✅ 681 SKUs updated with OEM-sourced fitment_hd_models + year ranges |
| fitment_hd_models normalized | ✅ 107,022 clean codes, 0 verbose strings remaining |

---

## ✅ DONE MAY 1 — FIFTH PASS

| Task | Result |
|------|--------|
| catalog_fitment_v2 wiped | ✅ TRUNCATED — 4,086,728 bad rows gone |
| fitment_staging wiped | ✅ TRUNCATED — 64,258 bad rows gone |
| hd_models engine splits | ✅ All Big Twin platforms split at Evo→TC (2000) and TC→M8 (2017) |
| hd_models NULL engine_keys | ✅ All 16 NULL engine_keys filled |
| Vintage models added | ✅ Original Single, F-Head, Flathead D/V/R/U/W, Servi-Car, Hummer |
| Knucklehead/Panhead/Shovelhead/FXR models | ✅ Full lineup |
| JW Boon fitment DB acquired | ✅ jwboon_parts_final.xlsx |
| Fulfillment infrastructure | ✅ warehouse_locations, vendor_sku_crossref, pick_fulfillment() |

---

## ✅ DONE APRIL 30 — FOURTH PASS

| Task | Result |
|------|--------|
| Fulfillment infrastructure | ✅ |
| WPS vendor_offers populated | ✅ 25,763 rows |
| OEM crossref imported | ✅ |
| brand_directory table | ✅ |
| category_display_map table | ✅ |
| hd_engine_types | ✅ 15 engines |

---

## ✅ DONE APRIL 30 — THIRD PASS

| Task | Result |
|------|--------|
| Flathead family | ✅ |
| special_instructions | ✅ 970 products synced |
| PDP multi-image gallery | ✅ live |
| Typesense reindexed | ✅ 88,512 docs |

---

## ✅ DONE APRIL 29-30

| Task | Result |
|------|--------|
| Homepage redesign | ✅ Era cards + category grid |
| Era pages (10) | ✅ live at /era/[slug] |
| Daily price sync | ✅ MAP compliant, cron live |
| /shop → /browse | ✅ |

---

## 🔴 HIGH PRIORITY

### Other H-D Catalog Families
PDFs exist for Touring, Softail, Dyna, FXR — same format as Sportster.
Run build_oem_fitment.mjs against each folder.
Script is at: `scripts/ingest/build_oem_fitment.mjs`
Only change needed: CATALOG_DIR path + CATALOGS manifest per family.
All data lands in same oem_fitment table (catalog_file column distinguishes).

### WPS Fitment Files
Pending from rep. When received: parse directly → catalog_fitment_v2.
NO inference. Explicit year/make/model/submodel only.

### Flathead Era Image
`public/images/eras/flathead.webp` — 800×600px, landscape WebP.

---

## 🔵 LOW PRIORITY / FUTURE

### OEM match rate improvement
oem_fitment: 31.4% matched (23,869 / 75,963 rows).
Unmatched = OEM parts H-D listed that WPS/PU don't carry.

### My Garage audit
Built against /shop — review for /browse.

### Browse/brand tabs
3-tab UI: Find by Bike / Browse All / Brands
brand_directory + category_display_map tables ready.

### PDP redesign
Not started. Do after fitment is solid.

### PU SKU mismatches — minor brands
jagoilcoolers, dannygray, ohlins, avon-gripd

### IMG_CACHE_DIR — set in .env.local on Hetzner

---

## 📊 CURRENT STATE (End of May 2 — seventh pass)

| Metric | Value |
|--------|-------|
| catalog_unified | 88,512 rows |
| catalog_fitment_v2 | 348,377 rows (JW Boon) |
| fitment_staging | 0 (wiped) |
| oem_fitment | 75,963 rows (Sportster only, 1986–2022) |
| hd_sportster_models | 26 model codes |
| harley_model_years | 1,602 rows |
| harley_models | ~192 rows (ironhead/K-series added) |
| harley_families | 16 |
| harley_models | ~192 |
| harley_model_years | 1,602 |
| vendor_offers | 99,007 rows |
| hd_models | ~250 rows (fully corrected) |
| catalog_oem_crossref | 1,587 clean HD OEM rows |
| oem_numbers enriched | 36,692 products |
| fitment_hd_models | 107,022 clean codes, 0 verbose |
| catalog_unified w/ OEM fitment | 681 SKUs backfilled |
| catalog_unified is_harley_fitment | 7,081 products (JW Boon) |
| Typesense | 88,512 docs ✅ |
| MAP violations | 0 ✅ |
| raw_vendor_aces | 0 (empty) |

## 🗄️ KEY TABLES
```
catalog_unified          — 88,512 products, source of truth for frontend
catalog_fitment_v2       — 348,377 rows (JW Boon fitment, confidence=1.0)
fitment_staging          — EMPTY, do not use for inference
oem_fitment              — 75,963 rows, Sportster OEM catalog data
hd_sportster_models      — 26 Sportster model codes + year ranges
v_oem_fitment            — aggregated view: 1 row per OEM part #
harley_families          — 16 families
harley_models            — ~192 rows (now includes ironhead/K-series)
harley_model_years       — 1,602 rows (includes vintage eras)
hd_models                — ~250 rows, fully corrected reference table
hd_engine_types          — 15 engine families
vendor_offers            — 99,007 vendor pricing/stock rows
vendor_sku_crossref      — 110,679 SKU links
catalog_oem_crossref     — 1,587 HD OEM → aftermarket SKU mappings
brand_directory          — 32 brands (UI reference)
category_display_map     — 30 category mappings (UI reference)
warehouse_locations      — 10 warehouses
```

## 🖼️ ERA IMAGES STATUS
```
public/images/eras/flathead.webp           ← STILL NEEDED
public/images/eras/knucklehead.webp        ✅
public/images/eras/panhead.webp            ✅
public/images/eras/ironhead-sportster.webp ✅
public/images/eras/shovelhead.webp         ✅
public/images/eras/evolution.webp          ✅
public/images/eras/evo-sportster.webp      ✅
public/images/eras/twin-cam.webp           ✅
public/images/eras/milwaukee-8.webp        ✅
public/images/eras/chopper.webp            ✅
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| DB connection from Mac | CATALOG_DB_HOST=2a01:4ff:f0:fa6f::1 CATALOG_DB_PORT=5432 CATALOG_DB_USER=catalog_app CATALOG_DB_PASSWORD=smelly |
| psql IPv6 URL | Quote it: psql 'postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog' |
| psql with !~ operator | Use -f with a .sql file — zsh chokes on ! in -c strings |
| catalog_unified.id | INTEGER not UUID — use ::int[] not ::uuid[] in ANY() casts |
| catalog_fitment_v2 | 348,377 JW Boon rows — DO NOT TRUNCATE |
| harley_models vs hd_models | harley_models = fitment table (has family_id FK), hd_models = reference table |
| catalog_fitment_v2 columns | id, product_id, model_year_id, created_at, fitment_source, confidence_score, parsed_snapshot |
| harley_model_years | Links harley_models to years — FK target in catalog_fitment_v2 |
| JW Boon OEM format | Short vintage numbers (215, 1080) — don't match modern H-D OEM format in catalog |
| import script | scripts/ingest/import_jwboon_fitment_v2.mjs |
| seed script | scripts/ingest/seed_vintage_model_years.sql |
| Daily price sync | scripts/ingest/daily_price_sync.js |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
| OEM fitment script | scripts/ingest/build_oem_fitment.mjs — update CATALOG_DIR for other families |
