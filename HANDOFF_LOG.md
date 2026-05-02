# Stinkin' Supplies — Session Handoff
**Date:** May 2, 2026 (sixth pass)
**Status:** ✅ Sportster OEM catalog extracted | ✅ fitment_hd_models fully normalized | ✅ 681 SKUs backfilled | ⏳ JW Boon import next | ⏳ other catalog families queued

---

## ✅ WHAT'S WORKING NOW

- **Shop** — 88,512 products in catalog_unified (WPS + PU + VTwin)
- **Search** — Typesense live, 88,512 docs (reindexed April 30, pricing current)
- **Browse** — /browse replaces /shop everywhere
- **Pricing** — Daily price sync live, MAP compliant, WPS + PU
- **Homepage** — Era cards + Shop by Part categories + corner nav
- **Era pages** — 10 eras live at /era/[slug]
- **Era images** — 9/10 WebP images live (flathead.webp missing)
- **PDP** — Multi-image gallery, special_instructions block
- **Fonts** — Bebas Neue (headers) + Share Tech Mono (body)
- **Admin** — /admin/products live
- **Production** — https://stinksupp.vercel.app
- **PU images** — 23,975 / 24,009 (99.9%)
- **OEM crossref** — 1,587 clean HD OEM entries, 36,692 products enriched
- **vendor_offers** — WPS (25,763) + PU (74,244) = 99,007 total
- **Fulfillment routing** — pick_fulfillment() live, fastest/cheapest modes
- **hd_models** — ✅ FULLY CORRECTED (engine era splits, vintage history)
- **fitment_hd_models** — ✅ 107,022 clean codes, 0 verbose strings remaining
- **oem_fitment** — ✅ 75,963 Sportster OEM rows, 23,869 matched to catalog_unified

---

## ✅ WHAT WAS DONE THIS SESSION (May 2)

### Sportster OEM Catalog Extraction
Built `scripts/ingest/build_oem_fitment.mjs` — full pipeline:
- Python/pdfplumber extractor embedded, shelled out per catalog
- 30 Sportster PDFs processed (1986–2022)
- 75,963 part rows extracted with section, OEM part#, description, qty note, model_codes[]
- Handles: multi-year qualifiers (1991/1992 format), wrapped model lists (2016+ format)

New tables created:
- **`oem_fitment`** — raw extracted rows, one per (oem_part_no × catalog year)
- **`hd_sportster_models`** — 26 canonical Sportster model codes with year ranges
- **`v_oem_fitment`** — aggregated view, one row per OEM part# with full history

### OEM Match → catalog_unified
Match strategy (two passes):
- Pass 1: `oem_fitment.oem_part_no = ANY(catalog_unified.oem_numbers)` → 23,869 matched
- Pass 2: via `catalog_oem_crossref` bridge → 0 additional (crossref too sparse for Sportster)
- 681 distinct SKUs updated in `catalog_unified` with `fitment_hd_models`, `fitment_year_start/end`, `is_harley_fitment=true`

### fitment_hd_models Normalization
All 184,691 verbose WPS/PU strings → clean H-D model codes:
- Pass 1 (`norm_hd_models_v2.sql`): 468 strings auto-normalized via VIN parenthetical extraction
- Pass 2 (same file): 82 hand-mapped (common names, old Sportster codes, sidecars, police)
- Pass 3 (`norm_hd_models_v3.sql`): final 17 mopped up
- Result: 107,022 clean codes, **0 verbose strings remaining**

---

## 🚀 NEW FITMENT APPROACH — REMINDER

**catalog_fitment_v2 is still empty.** The oem_fitment work this session wrote to `catalog_unified.fitment_hd_models` directly, not to catalog_fitment_v2. The proper fitment pipeline flows through:

```
harley_model_years (id) ← catalog_fitment_v2.model_year_id
harley_models (id)      ← harley_model_years.model_id
harley_families (id)    ← harley_models.family_id
```

### Trusted Fitment Sources (in priority order)

**1. JW Boon Parts Database** (`jwboon_parts_final.xlsx`) ← DO NEXT
- ~1,000 rows of NOS vintage HD parts
- Columns: OEM Number, Description, Fitment, Notes, Models, Year Ranges, All Years
- Human-curated, explicit model codes + year lists
- Import: parse Models + Year Ranges → look up harley_model_years → insert catalog_fitment_v2
- OEM lookup: check catalog_oem_crossref AND catalog_unified.oem_numbers[] (both paths)
- fitment_source='jwboon', confidence_score=1.0

**2. WPS Fitment Files** — pending from rep
- Explicit year/make/model/submodel per SKU
- When received: parse → catalog_fitment_v2 directly, no inference

**3. PU ACES XML** — `raw_vendor_aces` table (check if populated)
- `SELECT COUNT(*) FROM raw_vendor_aces;`
- If populated: parse ACES XML → catalog_fitment_v2

**4. Other H-D OEM Catalogs** — Touring, Softail, Dyna, FXR PDFs exist
- Same format as Sportster, same script
- Add to oem_fitment → then backfill catalog_unified same way

### What NOT to do
- Do NOT re-run infer_fitment_staging.js — retired
- Do NOT populate fitment_staging via inference
- Do NOT use keyword matching for year/model assignment

---

## 🗺️ NEXT SESSION PRIORITIES

1. **JW Boon fitment import** — `scripts/data/jwboon_parts_final.xlsx`
   - Upload the file, read the actual column names/values first
   - Parse Models → match to harley_model_years via harley_models.model_code
   - Parse All Years (Fitment) → individual year rows
   - OEM lookup: `catalog_unified.oem_numbers[]` first, then `catalog_oem_crossref`
   - Insert to catalog_fitment_v2 with fitment_source='jwboon', confidence_score=1.0

2. **Check raw_vendor_aces** — `SELECT COUNT(*) FROM raw_vendor_aces LIMIT 1;`

3. **WPS fitment files** — ingest once received

4. **Other OEM catalog families** — Touring/Softail/Dyna PDFs → oem_fitment

5. **Flathead era image** — drop flathead.webp in public/images/eras/

---

## 🏗️ INFRASTRUCTURE

```
Hetzner:    5.161.100.126
SSH:        ssh stinkdb
PostgreSQL: :5432  stinkin_catalog  (user: catalog_app, password: smelly)
IPv6 direct: postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog
Typesense:  Docker "typesense" (typesense/typesense:30.1, API key: xyz)
nginx:      :443 HTTPS → Typesense (5.161.100.226.nip.io)
Vercel:     epluris-projects/pb → https://stinksupp.vercel.app
Cron:       0 3 * * * daily_price_sync.js (Hetzner)
```

## 💡 OPERATIONAL GOTCHAS

| Issue | Solution |
|-------|----------|
| DB connection from Mac | CATALOG_DB_HOST=2a01:4ff:f0:fa6f::1 CATALOG_DB_PORT=5432 CATALOG_DB_USER=catalog_app CATALOG_DB_PASSWORD=smelly |
| psql IPv6 URL | postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog (brackets required) |
| psql with !~ operator | Use -f with a .sql file — zsh chokes on ! in -c strings |
| catalog_fitment_v2 | EMPTY — ready for JW Boon + WPS fitment |
| fitment_staging | EMPTY — do not use for inference |
| hd_models | Fully corrected with engine era splits + full vintage history |
| harley_models vs hd_models | harley_models = fitment table (has family_id FK), hd_models = reference table |
| catalog_fitment_v2 columns | id, product_id, model_year_id, created_at, fitment_source, confidence_score, parsed_snapshot |
| harley_model_years | Links harley_models to years — FK target in catalog_fitment_v2 |
| VTwin family names in DB | Softail Evo, Softail M8 — NOT "Softail" or "Big Twin" |
| harley_models requires start_year/end_year | NOT NULL — always include both |
| vendor_code casing | Always lowercase ('wps'/'pu') |
| source_vendor casing | Always UPPERCASE ('WPS'/'PU'/'VTWIN') |
| catalog_oem_crossref | 1,587 rows — ONLY real HD OEM numbers |
| oem_fitment match method | 'oem_numbers_array' = via cu.oem_numbers[], 'oem_crossref' = via bridge table |
| fitment_hd_models | Now fully normalized — 107K clean codes, no verbose strings |
| Daily price sync | scripts/ingest/daily_price_sync.js |
| CATALOG_DATABASE_URL | Must be set — no fallback |
| Era images | Drop WebP 800×600px+ in public/images/eras/{slug}.webp |
| fonts | Bebas Neue = --font-caesar, Share Tech Mono = --font-stencil |
| /browse not /shop | app/browse/[slug]/page.jsx is the PDP |
| catalog_fitment archived | catalog_fitment_archived — do not write to it |
| OEM fitment script | scripts/ingest/build_oem_fitment.mjs — update CATALOG_DIR for other families |

## 📊 CURRENT STATE (End of May 2 — sixth pass)

| Metric | Value |
|--------|-------|
| catalog_unified | 88,512 rows |
| — WPS | 26,754 |
| — PU | 24,009 |
| — VTwin | 37,749 |
| Typesense indexed | 88,512 ✅ |
| catalog_fitment_v2 | 0 rows (EMPTY — JW Boon next) |
| fitment_staging | 0 rows (WIPED) |
| oem_fitment | 75,963 rows (Sportster 1986–2022) |
| hd_sportster_models | 26 model codes |
| vendor_offers | 99,007 rows (WPS 25,763 + PU 73,244) |
| vendor_sku_crossref | 110,679 entries |
| catalog_oem_crossref | 1,587 clean HD OEM rows |
| oem_numbers enriched | 36,692 products |
| fitment_hd_models clean codes | 107,022 (0 verbose remaining) |
| catalog_unified OEM backfill | 681 SKUs updated |
| hd_models | ~250 rows (fully corrected + vintage) |
| harley_families | 16 |
| harley_models | 170 |
| harley_model_years | 1,501 rows |
| MAP violations | 0 ✅ |
| PU image coverage | 99.9% |

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
