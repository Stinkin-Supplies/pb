# Stinkin' Supplies — Chase List
**Running log of loose ends to follow up on**
Last Updated: May 2, 2026 — end of session (seventh pass)

---

## 🚀 NEXT SESSION — START HERE

1. **WPS fitment files** — pending from rep (contacted April 30)
   When received: parse directly → catalog_fitment_v2, no inference.

2. **Touring PDFs — get non-scanned versions**
   Current Touring catalog set has scanned PDFs that yielded 0 rows.
   Get text-based PDFs, drop in same folder, re-run:
   `node scripts/ingest/build_oem_fitment_touring.mjs`

3. **FX PDFs — same issue**
   Only 1984-86 catalog had extractable text (1,709 rows).
   1971-1984 catalogs were scanned — get text versions.

4. **My Garage audit** — built against /shop, review for /browse

5. **Flathead era image** — need flathead.webp for homepage era card

---

## ✅ DONE MAY 2 — SEVENTH PASS

| Task | Result |
|------|--------|
| JW Boon fitment import | ✅ 348,377 rows inserted into catalog_fitment_v2 |
| 7,081 products backfilled | ✅ is_harley_fitment = true (JW Boon) |
| seed_vintage_model_years.sql | ✅ Knucklehead/Panhead/Shovelhead/Ironhead/Flathead year rows seeded |
| harley_model_years | ✅ 1,602 rows (up from 1,501) |
| harley_models ironhead | ✅ K, KK, KH, KHK, KR, XL, XLH, XLCH, XLS, XLCR, XLT, XR750 added |
| raw_vendor_aces | ✅ Confirmed empty — crossed off permanently |
| Softail OEM extraction | ✅ 26,330 rows, 9,556 matched |
| Dyna OEM extraction | ✅ 9,360 rows, 3,777 matched |
| Touring OEM extraction | ✅ 11,434 rows, 3,798 matched (scanned PDFs — partial) |
| FX OEM extraction | ✅ 1,709 rows, 874 matched (mostly scanned — partial) |
| is_harley_fitment backfill | ✅ 24,183 total products flagged (up from 7,081) |

---

## ✅ DONE MAY 2 — SIXTH PASS

| Task | Result |
|------|--------|
| Sportster OEM PDF extraction | ✅ 75,963 rows extracted from 30 catalogs (1986–2022) |
| oem_fitment table created | ✅ Full schema + GIN indexes + v_oem_fitment view |
| hd_sportster_models seeded | ✅ 26 canonical Sportster model codes |
| OEM → catalog_unified match | ✅ 23,869 rows matched (31.4%) |
| catalog_unified backfill | ✅ 681 SKUs updated with OEM-sourced fitment |
| fitment_hd_models normalized | ✅ 107,022 clean codes, 0 verbose strings remaining |

---

## ✅ DONE MAY 1 — FIFTH PASS

| Task | Result |
|------|--------|
| catalog_fitment_v2 wiped | ✅ TRUNCATED — 4,086,728 bad rows gone |
| fitment_staging wiped | ✅ TRUNCATED — 64,258 bad rows gone |
| hd_models fully corrected | ✅ Engine era splits, vintage history complete |
| JW Boon fitment DB acquired | ✅ jwboon_parts_final.xlsx |
| Fulfillment infrastructure | ✅ warehouse_locations, vendor_sku_crossref, pick_fulfillment() |
| WPS vendor_offers | ✅ 25,763 rows populated |

---

## ✅ DONE APRIL 30 — FOURTH PASS

| Task | Result |
|------|--------|
| Fulfillment infrastructure | ✅ |
| WPS vendor_offers populated | ✅ 25,763 rows |
| OEM crossref imported | ✅ |
| brand_directory table | ✅ 7 tier-1 + 25 tier-2 brands |
| category_display_map table | ✅ 30 raw categories → clean groups |
| hd_engine_types | ✅ 15 engines |

---

## ✅ DONE APRIL 29-30

| Task | Result |
|------|--------|
| Homepage redesign | ✅ Era cards + category grid |
| Era pages (10) | ✅ live at /era/[slug] |
| Daily price sync | ✅ MAP compliant, cron live |
| /shop → /browse | ✅ |
| PDP multi-image gallery | ✅ live |

---

## 🔴 HIGH PRIORITY

### WPS Fitment Files
Pending from rep. When received: parse directly → catalog_fitment_v2.
NO inference. Explicit year/make/model/submodel only.

### Better Touring + FX PDFs
Touring: 1991-1992, 1995-1996, 1998 catalogs were scanned (0 rows extracted).
FX: 1971-1980 and 1971-1984 catalogs were scanned.
Get text-based versions → re-run the family scripts.
Scripts handle re-run safely (append-only, no dedup yet — add manifest guard if needed).

### Flathead Era Image
`public/images/eras/flathead.webp` — 800×600px, landscape WebP.

---

## 🔵 LOW PRIORITY / FUTURE

### Re-run dedup guard for oem_fitment
Current scripts are append-only — re-running would duplicate already-extracted catalogs.
Add: `WHERE catalog_file NOT IN (SELECT DISTINCT catalog_file FROM oem_fitment)`
before inserting, so re-runs only process new files.

### OEM match rate improvement
oem_fitment: 33.6% matched (41,874 / 124,796 rows).
~83k rows = OEM parts H-D listed that WPS/PU don't carry.
Worth reviewing by section to find high-value gaps.

### My Garage audit
Built against /shop — review for /browse.

### Browse/brand tabs
3-tab UI: Find by Bike / Browse All / Brands
brand_directory + category_display_map tables ready.
Unblocks ~50k products with no fitment.

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
| catalog_fitment_v2 | 348,377 rows (JW Boon, confidence=1.0) |
| fitment_staging | 0 (wiped, do not use) |
| oem_fitment | 124,796 rows (all families) |
| — Sportster | 75,963 |
| — Softail | 26,330 |
| — Dyna | 9,360 |
| — Touring | 11,434 |
| — FX | 1,709 |
| oem_fitment matched | 41,874 (33.6%) |
| hd_sportster_models | 26 model codes |
| harley_model_years | 1,602 rows |
| harley_models | ~192 rows (ironhead/K-series added) |
| harley_families | 16 |
| vendor_offers | 99,007 rows |
| hd_models | ~250 rows (fully corrected) |
| catalog_oem_crossref | 1,587 clean HD OEM rows |
| oem_numbers enriched | 36,692 products |
| fitment_hd_models | 107,022 clean codes, 0 verbose |
| is_harley_fitment = true | 24,183 products |
| Typesense | 88,512 docs ✅ |
| MAP violations | 0 ✅ |
| raw_vendor_aces | 0 (empty, done) |

## 🗄️ KEY TABLES
```
catalog_unified           — 88,512 products, source of truth
catalog_fitment_v2        — 348,377 rows (JW Boon, confidence=1.0)
fitment_staging           — EMPTY, do not use
oem_fitment               — 124,796 rows (Sportster+Softail+Dyna+Touring+FX)
v_oem_fitment             — aggregated view, 1 row per OEM part#
hd_sportster_models       — 26 Sportster model codes
harley_families           — 16 families
harley_models             — ~192 rows (includes ironhead/K-series)
harley_model_years        — 1,602 rows (includes vintage eras)
hd_models                 — ~250 rows, reference table
hd_engine_types           — 15 engine families
vendor_offers             — 99,007 rows
vendor_sku_crossref       — 110,679 entries
catalog_oem_crossref      — 1,587 HD OEM → aftermarket mappings
brand_directory           — 32 brands (UI reference)
category_display_map      — 30 category mappings (UI reference)
warehouse_locations       — 10 warehouses
```

## 🛠️ INGEST SCRIPTS
```
scripts/ingest/build_oem_fitment.mjs              — Sportster (30 catalogs)
scripts/ingest/build_oem_fitment_softail.mjs      — Softail (8 catalogs)
scripts/ingest/build_oem_fitment_dyna.mjs         — Dyna (3 catalogs)
scripts/ingest/build_oem_fitment_touring.mjs      — Touring (5 catalogs, partial)
scripts/ingest/build_oem_fitment_fx.mjs           — FX (4 catalogs, partial)
scripts/ingest/import_jwboon_fitment_v2.mjs       — JW Boon NOS fitment
scripts/ingest/seed_vintage_model_years.sql       — Vintage model year seeding
scripts/ingest/daily_price_sync.js                — Daily MAP-compliant price sync
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| psql IPv6 | Quote URL: psql 'postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog' |
| catalog_unified.id | INTEGER not UUID — use ::int[] not ::uuid[] in ANY() casts |
| catalog_fitment_v2 | 348,377 rows — DO NOT TRUNCATE |
| oem_fitment re-run | Append-only — add catalog_file dedup guard before re-running |
| harley_models vs hd_models | harley_models = fitment FK target, hd_models = reference only |
| JW Boon OEM format | Short vintage numbers — don't match modern H-D OEM format in catalog |
| Touring/FX PDFs | Scanned — need text-based versions for better extraction |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
