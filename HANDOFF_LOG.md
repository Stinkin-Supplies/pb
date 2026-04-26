# Stinkin' Supplies — Session Handoff
**Date:** April 25, 2026
**Status:** ✅ Vendor enrichment complete | ✅ Fitment pipeline expanded | ✅ New scripts deployed | ⏳ Typesense reindex pending

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,301 docs (needs reindex to pick up new enrichment)
- **Fitment filtering** — catalog_fitment_v2 live (2,717,429 rows, 10,580 products)
- **Fitment dropdowns** — /api/fitment serves families/models/years from canonical tables
- **OEM numbers** — 5,411 products have OEM numbers in catalog_unified.oem_numbers[]
- **catalog_oem_crossref** — ~95,116 rows
- **Harley authority tables** — 15 families, 158 models, 1,415 model-year rows (1936–2026)
- **Production** — https://stinksupp.vercel.app

---

## 📦 WHAT WAS DONE THIS SESSION (April 25)

### 1. WPS Content Enrichment (`enrich_wps_content.js`)
- Backfilled `description`, `features`, `name`, `upc`, dimensions, `has_map_policy`, `country_of_origin` from `wps_master_item_harddrive.csv`
- Backfilled `image_url` + `image_urls[]` from `wps-master-image-list.csv`
- Result: **9,678 content rows updated**, **1,607 images added** to catalog_unified
- Note: `features` is `text[]` — harddrive plain text wrapped as single-element array

### 2. VTwin Content Enrichment (`enrich_vtwin_content.js`)
- Backfilled `image_url`, `image_urls[]` (up to 4 per item from FULL_PIC1–4)
- Backfilled `oem_numbers[]` from OEM_XREF1–3 columns
- Backfilled `oem_part_number` from VENDOR_PARTNO
- Synced `cost` (DEALER_PRICE), `msrp` (RETAIL_PRICE), `in_stock` (HAS_STOCK)
- Backfilled `manufacturer_brand` from MANUFACTURER
- Join key: `catalog_unified.vendor_sku = vtwin-master.ITEM`
- Result: **21,797 rows updated** via bulk temp table UPDATE
- Images: 30,857 VTwin items now have image_url

### 3. Drag Specialties XML Enrichment (`ingest_ds_xml.js`)
- Parsed `Drag-Specialties_Catalog_Content_Export.xml` (6,753 parts)
- Matched 4,304 DS parts to PU catalog on `partNumber = sku`
- Enriched: `name`, `description`, `features` (bullet1–24), `image_url`, pricing
- Unmatched 2,449 DS parts written to `scripts/data/ds_unmatched_parts.csv` (likely from excluded PU product codes)
- Result: **4,302 rows updated**

### 4. PU XML Enrichment (`enrich_pu_xml.js`)
- Processes ALL XML files in `scripts/data/pu_pricefile/` automatically
- Handles two formats: `Catalog_Content_Export` (bullet1–24) and `PIES_Export` (AAIA standard)
- Also supports `--dir` flag for alternate directories (ran against `brand_files/` too)
- Matched 12,736 PU parts across 134 brand XMLs
- Result: **4,971 rows updated** (name, description, features, image_url, dimensions, pricing)

### 5. Fitment Pipeline — OEM Cross Reference (`build_fitment.js` → catalog_unified columns)
- Populated `fitment_year_start/end`, `fitment_hd_families`, `fitment_year_ranges` in catalog_unified
- Sources: VTwin OEM_XREF → hd_parts_data_clean.csv, WPS OEM xref, Fatbook/Oldbook xref
- Note: This writes to catalog_unified fitment columns only (not catalog_fitment_v2)

### 6. Fitment Pipeline — catalog_fitment_v2 (`build_fitment_v2.js`)
- Properly populates `catalog_fitment_v2` using `harley_model_years` IDs
- VTwin: joins via `catalog_products.sku = vtwin-master ITEM` (catalog_products is the real table)
- WPS: joins via `wps_harley_oem_cross_reference OEM# → WPS# → hd_parts_data_clean`
- Result: **265,716 VTwin rows** + **65,081 WPS rows** inserted into catalog_fitment_v2
- Coverage after: VTwin 12.9% (4,858 products), WPS 8.7% (2,328 products), PU unchanged 30.2%

### 7. Fitment Extraction from Product Names (`extract_fitment_from_names.js`)
- Regex extraction of year ranges and HD family from product name text
- Handles: `86-06`, `17+`, `'10-'16`, `FLHT/FXD` slash codes, single years, CVO patterns
- Three sources: year+family, slash model codes, family-only (uses full family year range)
- Result: **6,185 rows updated** in catalog_unified
- Coverage after: PU 5,158 with year (was 2,647), WPS 2,266 (was 1,753)

### 8. DB-Driven Fitment Extraction (`extract_fitment_db_driven.js`)
- New scalable approach using `model_alias_map` + `engine_platform_map` DB tables
- Add new aliases to DB → re-run script → improved coverage without code changes
- Result: **14 additional rows** (remaining gap is genuinely unfittable generic parts)

### New DB Tables Created This Session
- `model_alias_map` — text token → family + model_code + priority (205 aliases)
- `engine_platform_map` — engine keyword → year range + families (6 entries: M8, Twin Cam, Evo, Shovelhead, TC)
- Added columns to `catalog_fitment_v2`: `fitment_source`, `confidence_score`, `parsed_snapshot`

---

## 📊 CURRENT STATE (End of April 25)

### catalog_unified fitment coverage
```
PU    (24,009): has_year=5,171 | has_families=5,365 | has_ranges=4,911 | 21.5%
VTWIN (37,749): has_year=5,399 | has_families=5,370 | has_ranges=5,399 | 14.3%
WPS   (26,754): has_year=2,266 | has_families=2,362 | has_ranges=2,226 |  8.5%
```

### catalog_fitment_v2
```
Total rows:          ~3,048,000+ (was 2,717,429 before this session)
VTwin covered:       4,858 products (12.9%)
WPS covered:         2,328 products (8.7%)
PU covered:          7,250 products (30.2%)
```

### New Scripts (all in scripts/ingest/)
```
enrich_wps_content.js        — WPS content + image backfill
enrich_vtwin_content.js      — VTwin images, OEM, pricing sync
ingest_ds_xml.js             — Drag Specialties XML enrichment
enrich_pu_xml.js             — All PU brand XMLs (both formats, --dir flag)
build_fitment.js             — OEM xref → catalog_unified fitment columns
build_fitment_v2.js          — OEM xref → catalog_fitment_v2 (correct table)
extract_fitment_from_names.js — Regex fitment extraction from product names
extract_fitment_db_driven.js  — DB alias table driven extraction (scalable)
```

---

## 🚨 CURRENT ISSUES (carried forward + new)

### Issue 1: Typesense reindex needed
All enrichment from this session (descriptions, features, images, fitment) is in catalog_unified but Typesense still has the April 23 index. Needs reindex.
```bash
node scripts/ingest/index_unified.js --recreate
```

### Issue 2: Typesense schema mismatch (carried from April 23)
Reindex with `index_unified.js` to pick up the latest enrichment in `catalog_unified`.

### Issue 3: Phase 9 (Admin UI) not yet built
No `/admin/fitment` UI for managing catalog_fitment_v2.

### Issue 4: Phase 10 (cutover) not done
`catalog_fitment` still exists. Cutover to v2 pending Admin UI.

### Issue 5: catalog_unified vs catalog_products sync
Frontend product data reads from `catalog_unified`. Fitment filtering reads from `catalog_fitment_v2` which references `catalog_products.id`. The enrichment scripts write to `catalog_unified`. These two tables stay in sync via shared `sku` but are separate tables — content enrichment only updated `catalog_unified`.

### Issue 6: PU fitment gap (post-2012)
`hd_parts_data_clean.csv` covers 1979–2012 only. PU items for 2013+ bikes have no fitment from OEM xref. Needs PU ACES XML files from PU rep to fill this gap.

---

## 🗺️ NEXT SESSION PRIORITIES

1. **Reindex Typesense** — pick up all enriched content from this session
2. **Reindex Typesense** — use `index_unified.js` to refresh the live collection
3. **Phase 9 — Admin UI** — `/admin/fitment` page
4. **Phase 10 — Cutover** — archive catalog_fitment, all writes → v2
5. **PU ACES fitment files** — request from PU rep, would push PU fitment from 30% → 70%+
6. **Expand model_alias_map** — add FLTRX, FXDB, FLHTK, FLSTF and other missing codes

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

## 💡 NEW OPERATIONAL GOTCHAS (April 25)

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
