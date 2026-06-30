# STINKIN' SUPPLIES — HANDOFF LOG

> **Note:** Sessions 57–58 are detailed in `HANDOFF_PATCH.md`. Sessions 49–56 are summarized below.
> Full per-session detail for sessions 41–47 is in the original HANDOFF_LOG. This file consolidates forward.

---

# ——— SIXTY-FIFTH PASS (June 29, 2026) ———

## WHERE WE ARE

OEM fitment data quality crisis diagnosed and fully resolved. Two systemic bugs in `build_oem_fitment_all.mjs` and `promote_oem_fitment.mjs` were causing incorrect model fitment across the entire catalog. Both fixed, oem_fitment rebuilt, catalog_fitment_v2 cleaned and re-promoted, matview refreshed, Typesense reindexed.

catalog_fitment_v2: **5,126,957 rows** (down from 6,369,578 — the removed rows were wrong).

⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review at /admin/variant-candidates.
⚠️ 283 OEM supersession pairs still pending review.
⚠️ Missing 2024 Touring catalog — user still sourcing.
⚠️ Softail 2016 catalog — still missing.
⚠️ Sportster 1979–1985 — user still searching.
⚠️ OCR 4 image-only PDFs: FX 1971-80, FX 1971-84, Softail 2002, WLA 1942.

## What Was Done

### Bug 1 — Year-annotation noise rows in oem_fitment ✅ FIXED

**Root cause:** HD parts catalogs print supersession year annotations inline with part numbers (e.g. `45902-00  2000`). The Python PDF extractor in `build_oem_fitment_all.mjs` was treating the bare year `"2000"` as the part description. These rows then inherited fitment from their surrounding section context — stamping a front brake rotor with Switches & Circuit Breakers section models, Oil Tank section models, Exhaust section models, etc.

**Scale:** 130,621 noise rows (29.6% of oem_fitment) with description matching `^\d{4}$`.

**Fix:** Added guard in the Python extractor immediately after `split_desc_models()` call:
```python
if re.match(r'^\d{4}$', desc.strip()):
    last_row = None
    continue
```

### Bug 2 — Universal promotion ignoring catalog family ✅ FIXED

**Root cause:** `promote_oem_fitment.mjs` PATH_A_UNIVERSAL, PATH_B_UNIVERSAL, and PATH_C_UNIVERSAL joined `harley_model_years` on year range only — no family constraint. When a Sportster catalog marked a part `{ALL}` (meaning "all 2004 Sportsters"), the promotion stamped it across every 2004 model in every family: Dyna, Softail, Touring, V-Rod, Shovelhead, everything. The 2012 Softail `{ALL}` row for OEM 44156-00 (a front brake rotor) was appearing on V-Rods and Shovelheads.

**Fix 1 — Schema:** Added `catalog_family text` column to `oem_fitment`. Backfilled from filename patterns (all 441K rows mapped, 0 NULLs). Now populated at ingest time by `bulkInsert()` using `cat.family` from the CATALOGS manifest.

```sql
ALTER TABLE oem_fitment ADD COLUMN IF NOT EXISTS catalog_family text;
```

**Fix 2 — Promote script:** All three universal paths now JOIN `harley_models` + `harley_families` and constrain by catalog_family:
```sql
AND (
  f.catalog_family = 'all_model'    -- 1340cc era genuinely cross-family
  OR f.catalog_family IS NULL       -- safety valve
  OR LOWER(hf.name) = f.catalog_family
  OR (f.catalog_family IN ('fxr', 'fx') AND hf.name = 'Dyna')
)
```

### Cleanup + rebuild sequence ✅

| Step | Result |
|------|--------|
| `build_oem_fitment_all.mjs --force` | 441,416 → **315,427 rows** (−125,989 noise rows) |
| DELETE oem_* from catalog_fitment_v2 | **−1,948,437 rows** (all 10 oem_* sources) |
| `promote_oem_fitment.mjs` | **+705,816 net new** (family-scoped) |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage` | ✅ |
| `node scripts/ingest/index_unified.js` | 89,151 docs, 0 errors |

### Universal row counts before vs. after

| Source | Before | After | Reduction |
|--------|--------|-------|-----------|
| oem_catalog_hd_universal | 655,872 | 165,738 | −75% |
| oem_crossref_vtwin_universal | 224,244 | 68,804 | −69% |
| oem_crossref_fatbook_universal | 452,016 | 133,629 | −70% |

### Verification ✅

Product 87454 (11.5" Drilled Front Brake Disc, OEM 44156-00):
- **Before:** 431 rows across 7 families including V-Rod, Shovelhead, `twin_cam` pseudo-code, Trike
- **After:** 11 rows across Dyna / Softail / Sportster / Touring only — correct

## Final State — catalog_fitment_v2 source breakdown

| Source | Rows | Products |
|--------|------|---------|
| name_extraction | 1,552,895 | 5,441 |
| jwboon | 1,341,862 | 13,632 |
| wps | 796,979 | 5,837 |
| copied_from_crossref | 349,187 | 6,012 |
| vtwin_partial | 209,853 | 6,978 |
| oem_catalog_hd_universal | 165,738 | 1,400 |
| oem_catalog_hd | 160,179 | 3,271 |
| oem_crossref_fatbook_universal | 133,629 | 1,061 |
| oem_crossref_fatbook | 109,734 | 2,042 |
| vtwin_fitment_raw | 84,208 | 5,621 |
| oem_crossref_vtwin_universal | 68,804 | 543 |
| oem_crossref_vtwin | 68,489 | 1,149 |
| (none) | 47,638 | 2,696 |
| canonical_merge_sync | 35,138 | 367 |
| ebc_catalog | 2,519 | 116 |
| pu_fitment_expanded | 62 | 17 |
| manual | 43 | 3 |

## Next Session Starting Points

```bash
# All systems current. No immediate pipeline work needed.

# If new catalogs uploaded:
node scripts/ingest/build_oem_fitment_all.mjs --force
node scripts/ingest/promote_oem_fitment.mjs
node -e "require('dotenv').config({path:'.env.local'}); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.CATALOG_DATABASE_URL}); p.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage').then(()=>{console.log('done');p.end()})"
node scripts/ingest/index_unified.js

# Review queues:
# - /admin/variant-candidates (62 pending)
# - oem_supersession (283 pairs): SELECT * FROM oem_supersession_review LIMIT 30

# OCR image-only PDFs when ocrmypdf installed:
brew install ocrmypdf
ocrmypdf "parts-catalogs/FX/FX 1971-80.pdf" "parts-catalogs/FX/FX 1971-80-ocr.pdf" --skip-text
```

---

# ——— SIXTY-FOURTH PASS (June 29, 2026) ———

## WHERE WE ARE

All fitment, crossref, and search systems are fully up to date. catalog_fitment_v2 at **6,369,578 rows**. Typesense at **89,151 docs, 0 errors**. Eastern Motorcycle Parts crossref imported. Path C bug fixed — brand numbers in `oem_numbers[]` now route through correctly.

⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review at /admin/variant-candidates.
⚠️ 283 OEM supersession pairs still pending review.
⚠️ Missing 2024 Touring catalog — user still sourcing.
⚠️ Softail 2016 catalog — still missing.
⚠️ Sportster 1979–1985 — user still searching.
⚠️ OCR 4 image-only PDFs: FX 1971-80, FX 1971-84, Softail 2002, WLA 1942.

## What Was Done

### oem_fitment re-ingest — new catalogs ✅

Ran `node scripts/ingest/build_oem_fitment_all.mjs --force` picking up all newly uploaded catalogs.

| Metric | Before | After |
|--------|--------|-------|
| Total rows | 383,251 | 441,416 |
| Unique OEM#s | 17,910 | 18,308 |
| Catalogs loaded | 105 | 121 |
| Matched → unified | 143,319 (37.4%) | 165,874 (37.6%) |

### promote_oem_fitment.mjs — full run ✅

| Path | Upserted | Source Tag | Confidence |
|------|----------|------------|------------|
| A model-specific | 178,466 | oem_catalog_hd | 0.95 |
| A universal | 686,705 | oem_catalog_hd_universal | 0.85 |
| B model-specific | 148,274 | oem_crossref_vtwin | 0.90 |
| B universal | 524,495 | oem_crossref_vtwin_universal | 0.80 |
| C model-specific | 260,644 | oem_crossref_fatbook | 0.88 |
| C universal | 1,078,690 | oem_crossref_fatbook_universal | 0.78 |
| **Net new** | **+506,886** | | |

catalog_fitment_v2: 5,874,564 → **6,369,578 rows**

### Eastern Motorcycle Parts crossref — imported ✅

New script: `scripts/ingest/import_eastern_crossref.mjs`

- Parsed Eastern's 2022-2024 catalog (538 pages) with pdfplumber word-position extraction
- 8,196 raw rows → 4,832 unique after dedup
- **4,832 rows** inserted into `catalog_oem_crossref` (`oem_manufacturer = 'EASTERN'`)
- **4,364 unique HD OEM#s** cross-referenced to Eastern aftermarket equivalents
- Coverage spans 1911–present vintage parts
- Cached to `scripts/ingest/_eastern_raw.json`

### Bug fix — Path C `oem_numbers[]` join ✅

**File:** `scripts/ingest/promote_oem_fitment.mjs`

Path C was joining `catalog_unified cu ON cu.sku = c.sku` — missing all products where the crossref SKU lives in `oem_numbers[]` rather than the `sku` column. Fixed both PATH_C_SPECIFIC and PATH_C_UNIVERSAL:

```sql
-- Before:
JOIN catalog_unified cu ON cu.sku = c.sku

-- After:
JOIN catalog_unified cu ON (cu.sku = c.sku OR c.sku = ANY(cu.oem_numbers))
```

Result: +6,886 net new fitment rows from the previously-missed Eastern + other brand-number matches (602 Eastern products confirmed matched via oem_numbers[]).

### React key warning fix — Parts Timeline ✅

`app/admin/parts-timeline/page.tsx` — replaced bare `<>` fragments in table body map with `<Fragment key={...}>`. Category keyed on `cat`, subcategory on `sub-${cat}-${subcat}`.

### mv_oem_fitment_coverage refreshed ✅

### Typesense reindexed ✅

89,151 documents, 0 errors.

## Final State — catalog_fitment_v2 source breakdown

| Source | Rows | Products |
|--------|------|---------|
| name_extraction | 1,554,856 | 5,441 |
| jwboon | 1,343,233 | 13,632 |
| wps | 797,515 | 5,837 |
| oem_catalog_hd_universal | 655,874 | 1,530 |
| oem_crossref_fatbook_universal | 452,016 | 1,034 |
| copied_from_crossref | 349,187 | 6,012 |
| oem_crossref_vtwin_universal | 224,244 | 520 |
| vtwin_partial | 209,853 | 6,978 |
| oem_catalog_hd | 189,076 | 3,509 |
| oem_catalog_family | 126,904 | 2,070 |
| oem_crossref_fatbook | 114,999 | 1,983 |
| oem_catalog_universal | 103,828 | 516 |
| vtwin_fitment_raw | 84,208 | 5,621 |
| oem_crossref_vtwin | 70,026 | 1,120 |
| (none) | 47,638 | 2,696 |
| canonical_merge_sync | 35,138 | 367 |
| oem_catalog | 10,621 | 796 |
| ebc_catalog | 2,519 | 116 |
| oem_crossref | 851 | 85 |
| pu_fitment_expanded | 62 | 17 |
| manual | 43 | 3 |

## Next Session Starting Points

```bash
# All major systems current — no immediate pipeline work needed

# If new catalogs uploaded, re-ingest:
node scripts/ingest/build_oem_fitment_all.mjs --force
node scripts/ingest/promote_oem_fitment.mjs
node -e "require('dotenv').config({path:'.env.local'}); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.CATALOG_DATABASE_URL}); p.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage').then(()=>{console.log('done');p.end()})"
node scripts/ingest/index_unified.js

# Review queues:
# - /admin/variant-candidates (62 pending)
# - oem_supersession (283 pairs)

# OCR image-only PDFs when ocrmypdf installed:
brew install ocrmypdf
ocrmypdf "parts-catalogs/FX/FX 1971-80.pdf" "parts-catalogs/FX/FX 1971-80-ocr.pdf"
```

---

# ——— SIXTY-THIRD PASS (June 28, 2026) ———

## WHERE WE ARE

OEM fitment promotion fully applied. catalog_fitment_v2 grew from 5,062,086 → **5,874,564 rows** (+737,995 net new) across 6 upsert paths covering direct HD OEM matches, VT- crossref bridge, and fatbook/oldbook crossref bridge.

⚠️ Typesense needs reindex to reflect new fitment coverage.
⚠️ mv_oem_fitment_coverage needs refresh after promotion.
⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review.
⚠️ oem_supersession 283 original inferred pairs still pending review.

## What Was Done

### promote_oem_fitment.mjs — bugs fixed and applied ✅

Two bugs in the script fixed before running:

1. **`updated_at` column doesn't exist** on catalog_fitment_v2 — removed from UPSERT_SUFFIX
2. **PATH_A_UNIVERSAL FK violation** — `oem_fitment.matched_product_id` can reference products not in catalog_unified (deleted/inactive). Fixed by adding `JOIN catalog_unified cu ON cu.id = f.matched_product_id`.

Promotion results (5,062,086 baseline → 5,874,564):

| Path | Variant | Rows Upserted | Source Tag | Confidence |
|------|---------|--------------|------------|------------|
| A — direct match | model-specific | 116,434 | oem_catalog_hd | 0.95 |
| A — direct match | universal | 454,872 | oem_catalog_hd_universal | 0.85 |
| B — VT- crossref | model-specific | 103,005 | oem_crossref_vtwin | 0.90 |
| B — VT- crossref | universal | 356,066 | oem_crossref_vtwin_universal | 0.80 |
| C — fatbook crossref | model-specific | 164,777 | oem_crossref_fatbook | 0.88 |
| C — fatbook crossref | universal | 696,286 | oem_crossref_fatbook_universal | 0.78 |
| **Total** | | **+737,995 net new** | | |

ON CONFLICT kept highest confidence — no manual rows (1.0) were downgraded.

Full source breakdown after promotion (21 sources total):

| Source | Rows | Products |
|--------|------|---------|
| name_extraction | 1,555,326 | 5,441 |
| jwboon | 1,374,081 | 13,746 |
| wps | 799,415 | 5,844 |
| oem_catalog_hd_universal | 417,436 | 1,242 |
| copied_from_crossref | 383,785 | 6,079 |
| oem_crossref_fatbook_universal | 308,463 | 894 |
| vtwin_partial | 211,211 | 7,020 |
| oem_crossref_vtwin_universal | 169,840 | 492 |
| oem_catalog_family | 127,257 | 2,073 |
| oem_catalog_hd | 116,390 | 3,094 |
| oem_catalog_universal | 104,911 | 521 |
| vtwin_fitment_raw | 84,372 | 5,634 |
| oem_crossref_fatbook | 73,712 | 1,857 |
| oem_crossref_vtwin | 50,565 | 1,115 |
| (none) | 47,955 | 2,700 |
| canonical_merge_sync | 35,556 | 368 |
| oem_catalog | 10,692 | 798 |
| ebc_catalog | 2,641 | 117 |
| oem_crossref | 851 | 85 |
| pu_fitment_expanded | 62 | 17 |
| manual | 43 | 3 |

## Next Session Starting Points

```bash
# 1. Refresh materialized view
psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
  -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage"

# 2. Reindex Typesense
node scripts/ingest/index_unified.js --recreate

# 3. OCR image-only PDF catalogs (need ocrmypdf installed)
brew install ocrmypdf
ocrmypdf "/Users/home/Desktop/Stanky/parts-catalogs/FX/1971-80 FX - SuperGlide Parts Catalog.pdf" \
         "/Users/home/Desktop/Stanky/parts-catalogs/FX/1971-80 FX - SuperGlide Parts Catalog.pdf" --skip-text
# repeat for FX 1971-84, Softail 2002, WLA 1942
# then re-extract and re-promote:
node scripts/ingest/build_oem_fitment_all.mjs --force
node scripts/ingest/promote_oem_fitment.mjs

# 4. Acquire missing catalog PDFs
# Dyna 1993–1997, 2002–2005, 2007–2008, 2010, 2012+
# Softail 1984–1992, 1998, 2004+
# Touring 1999, 2001, 2007–2008, 2010, 2014–2015
# Sportster 1979–1985
# Source: microfiche.info, HD dealer portals, hdforums.com
```

---

# ——— SIXTY-SECOND PASS (June 28, 2026) ———

## WHERE WE ARE

HD OEM PDF catalog fitment fully rebuilt with fixed extractor. All fitment sources now consolidated into `catalog_fitment_v2` via `promote_oem_fitment.mjs`. VT- prefix discovery unlocks vtwin_oem_crossref bridge. OEM crossref admin page has inline editing + fitment modal.

⚠️ `promote_oem_fitment.mjs --dry-run` had arg-parsing bug (fixed this session) — run with no flags to apply.
⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review.
⚠️ oem_supersession 283 original inferred pairs still pending review.
⚠️ Typesense needs reindex after fitment promotion.

## What Was Done

### Admin — OEM Crossref page overhaul ✅
`app/admin/oem-crossref/page.jsx`
- Fixed column labels: "WPS #" → "VENDOR SKU"
- Inline row editing: click Edit → form → PATCH `/api/admin/oem-crossref/[id]`
- OEM # fitment modal (click dotted-underline OEM number):
  - **Fitment tab**: union fitment across all products sharing that OEM#; add/remove fitment by family + year range + optional model code
  - **Products tab**: all catalog_unified products that carry this OEM#
  - Modal scroll fix: `alignItems: flex-start`, `maxHeight: calc(100vh - 64px)`, scrollable inner div
  - Duplicate key fix: GROUP BY `hf.id, hm.model_code` (not `hm.id`) — multiple harley_models share same model_code

### New API routes ✅
- `app/api/admin/oem-crossref/[id]/route.ts` — PATCH inline edit
- `app/api/admin/oem-crossref/oem-fitment/route.ts` — GET/POST/DELETE fitment by oem_number

### build_oem_fitment_all.mjs — complete rewrite ✅
`scripts/ingest/build_oem_fitment_all.mjs`

**Replaces:** build_oem_fitment.mjs, build_oem_fitment_dyna.mjs, build_oem_fitment_softail.mjs, build_oem_fitment_touring.mjs, build_oem_fitment_fx.mjs

**Critical MODEL_BARE_RE bug fixed:** All 5 old scripts used Sportster-only regex:
```python
r'^(XL[0-9A-Z]+|XLH[0-9A-Z]*|XR[0-9A-Z]+|ALL)$'  # silently dropped Dyna/Softail/Touring/FX codes
```
Fixed to:
```python
r'^(FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10}|ALL)$'
```

**Python extractor improvements:**
- Front-page model inventory: scans pages 0–7, builds per-catalog model whitelist
- Section context inheritance: pure model-code lines (e.g. page header "FXDWG FXDL") between parts set context; untagged parts inherit it
- Catalog-level initialization: section_models starts as full catalog inventory so common parts before first context line get "all models in this catalog"
- MODEL_DENYLIST: FLYWHEEL, FLANGE, FLOOR, FLEX, etc. blocked from matching FL/FX regex
- Whitelist guard on section context: every code must be in catalog inventory (prevents false positives)

**--force bug fixed:** was stacking rows (INSERT without DELETE); now DELETEs existing rows per `catalog_file` before re-inserting.

**Results:**
| Metric | Before | After |
|--------|--------|-------|
| Total rows | 892,904 (stacked dupes) | 267,200 |
| No model tag | 487,833 (55%) | 12,600 (5%) |
| Model-specific | 89,917 | 231,060 |
| Match rate | 37.1% | 37.4% |
| Catalogs | 66 distinct | 78 |

**Manifest:** 87 entries, 9 families. Image-only PDFs (0 rows, need OCR):
- `FX/1971-80 FX - SuperGlide Parts Catalog.pdf`
- `FX/1971-84 FX Parts Catalog.pdf`
- `Softail/2002 Softail Parts Catalog.pdf`
- `1942 WLA Parts List.pdf`

**Missing year gaps** (PDFs not yet acquired):
- Sportster 1979–1985
- Dyna 1993–1997, 2002–2005, 2007–2008, 2010, 2012+
- Softail 1984–1992, 1998, 2004+
- Touring 1999, 2001, 2007–2008, 2010, 2014–2015

### Fitment data audit ✅
- catalog_fitment_v2 has 15 distinct fitment_source values, ~5M rows
- HD OEM catalog (oem_fitment) = ground truth (actual HD parts books)
- vtwin_oem_crossref: V-Twin part numbers stored as `VT-XXXXX` in catalog_unified — **9,006 of 12,278 match via VT- prefix** (was 0 without prefix — key discovery)
- catalog_oem_crossref 65K rows: oldbook/fatbook no-source (40K), vtwin backfill (6.3K), PU enriched (4.3K), PU scrape (1.9K)
- confidence_score column EXISTS in catalog_fitment_v2 — old master ref note was wrong

### promote_oem_fitment.mjs — new consolidation pipeline ✅
`scripts/ingest/promote_oem_fitment.mjs`

Three promotion paths from `oem_fitment` → `catalog_fitment_v2`:

**Path A — Direct match** (oem_fitment.matched_product_id IS NOT NULL)
- model-specific rows: confidence 0.95, source `oem_catalog_hd`
- fits_all rows: confidence 0.85, source `oem_catalog_hd_universal`

**Path B — VT- crossref** (vtwin_oem_crossref → `VT-` prefix products)
- model-specific: confidence 0.90, source `oem_crossref_vtwin`
- fits_all: confidence 0.80, source `oem_crossref_vtwin_universal`
- Coverage: 2,397 VT- products linkable; 155 with zero current fitment

**Path C — FatBook/OldBook crossref** (catalog_oem_crossref → catalog_unified)
- model-specific: confidence 0.88, source `oem_crossref_fatbook`
- fits_all: confidence 0.78, source `oem_crossref_fatbook_universal`
- Coverage: ~6,051 fully-connected pairs

ON CONFLICT: keeps highest confidence_score. Manual rows (1.0) never downgraded.

Bug fixed this session: `--path` arg parsing used wrong index (findIndex + 1 on missing key picked up `argv[0]`).

## Next Session Starting Points

```bash
# 1. Run fitment promotion (dry-run first, then apply)
node scripts/ingest/promote_oem_fitment.mjs --dry-run
node scripts/ingest/promote_oem_fitment.mjs

# 2. OCR the image-only PDF catalogs
brew install ocrmypdf
ocrmypdf "/Users/home/Desktop/Stanky/parts-catalogs/FX/1971-80 FX - SuperGlide Parts Catalog.pdf" \
         "/Users/home/Desktop/Stanky/parts-catalogs/FX/1971-80 FX - SuperGlide Parts Catalog.pdf" --skip-text
# repeat for FX 1971-84, Softail 2002, WLA 1942
# then: node scripts/ingest/build_oem_fitment_all.mjs --force

# 3. Refresh materialized view after promotion
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage;

# 4. Reindex Typesense
node scripts/ingest/index_unified.js --recreate
```

---

# ——— SIXTY-FIRST PASS (June 27, 2026) ———

## WHERE WE ARE

bike_specs table created and fully populated from DS FatBook 2026 + OldBook 2026 quick-reference charts. 1288 rows covering battery, spark plugs, belt/chain, sprockets, tires, and shock length per model+year. Also gap-filled 28 harley_model_years rows discovered during import matching.

⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review.
⚠️ oem_supersession 283 original inferred pairs still pending review.

## What Was Done

### bike_specs table — New ✅
```sql
CREATE TABLE bike_specs (
  id              serial PRIMARY KEY,
  model_year_id   int NOT NULL REFERENCES harley_model_years(id),
  battery         text,
  spark_plug_ngk  text,
  spark_plug_champ text,
  belt_pitch      text,   -- '24 mm', '1-1/8"', '530' (chain uses chain size)
  belt_teeth      int,    -- belt tooth count OR chain link count
  sprocket_front  int,
  sprocket_rear   int,
  tire_front      text,
  tire_rear       text,
  shock_length_in numeric, -- NULL = N/A in source
  source          text NOT NULL DEFAULT 'DS_FATBOOK_2026',
  created_at      timestamptz DEFAULT now(),
  UNIQUE (model_year_id, source)
);
```

### import_bike_specs.mjs — New ✅
`scripts/ingest/import_bike_specs.mjs` — imports DS FatBook 2026 + DS OldBook 2026 quick-reference charts into bike_specs.
- 296 raw source rows encoded; 1733 expanded (model, year) pairs after year-range + model-code expansion
- Sources: `DS_FATBOOK_2026` (1986–2025: Dresser, Trike, Softail, Dyna, V-Rod, Sportster, Street, Pan America, LiveWire, Buell) + `DS_OLDBOOK_2026` (1936–1999: Big Twin EL/FL→FLT, Softail, Dyna, FXR, FX, Sportster)
- 47-entry EXPANSIONS map handles all slash patterns (FLHT/C/U/I, VRSCAW/DX, XL883 HUG → XLH883HUG, FXDS-CONV → FXDS, etc.)
- Year expansion: discontinuous ranges (11-13,16-19), century logic (≤26 → 20xx, 27-99 → 19xx)
- ON CONFLICT (model_year_id, source) DO NOTHING — idempotent
- **Result: 1288 rows inserted, 0 errors**

### harley_model_years gap-filling — 28 rows ✅
Verified against H-D production history before inserting:
- XL883L (24): 2005–2009 — existed from introduction; DB was missing these years
- FXST (302): 2020 — Softail Standard reintroduced
- FXLR (70): 1990–1993, 2021, 2024, 2025
- FLTRXS (138): 2024, 2025 — Road Glide Special; DB ended at 2023
- RA1250 (1): 2025 — Pan America; DB ended at 2024
- VRSCB (383): 2006 — V-Rod Black existed 2004-2006
- FLH (108): 1966–1971, 1973–1977 — continuous production gap

### Model code corrections in script ✅
- `XL1100`→`XLH1100`, `XL1200`→`XLH1200`, `XL883HUG`→`XLH883HUG`
- `FLH/C`→`FLH` (old FLH Classic = FLH in DB; FLHC is modern Heritage Classic)
- `FXDSCONV`→`FXDS`
- `FXDB/I 91-92` split into `FXDB-S` (1991 Sturgis) + `FXDB-D` (1992 Daytona)

### Permanent skips confirmed by research ✅
- VRSCAW ended 2010 — "VRSCAW/DX 07-17" in FatBook means only VRSCDX for 2011-2017; VRSCDX rows match correctly
- FLHXS 2024-2025 — Street Glide Special code retired in 2024 lineup redesign
- XL1200XS — Forty-Eight Special only existed 2018-2020
- FXLRS — Low Rider S introduced 2020; 2018-2019 unmatched is correct
- FLTRX 2015-2016 — Road Glide Custom ended 2013

## DB State After Session 61

| Table | State |
|---|---|
| bike_specs | **1288 rows** (DS_FATBOOK_2026 + DS_OLDBOOK_2026) |
| harley_model_years | **~2,090 rows** (+28 gap rows) |

---

# ——— FIFTY-EIGHTH PASS (June 25, 2026) ———

## WHERE WE ARE

VTwin fitment coverage expanded from 41.1% → 55.8% via two new scripts. PDP window function crash fixed. PU fitment gap confirmed unfixable without a new feed. Typesense reindex needed.

⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review.
⚠️ VTwin build_product_details.mjs attributes bug: extra_attributes stored as stringified JSON. Workaround active in ProductDetailsSection (#22 on chase list).
⚠️ scrape_vtwin_missing.mjs pg deprecation warning (concurrent queries on single client) — not failing.

## What Was Done

### PDP Window Function Crash Fixed ✅
`app/browse/[slug]/page.jsx` — `MIN(priority) OVER ()` inside FILTER clause was illegal in Postgres window context. Replaced the entire lateral with `array_agg(url ORDER BY priority ASC)` nested subquery; `urls[1]` = primary, `urls` = all_urls.

### Fitment Gap Analysis ✅
Full investigation of 47,531 products with no fitment. Title parsing: ~90 products, dead end. PU gap: 17,796 products — all in FatBook/OldBook but pu_fitment_parsed never produced fitment for these pages (no model-specific tables). Unfixable without PU API. WPS gap: 9,345 — confirmed non-HD/universal products, correct as-is. VTwin gap: 20,376 — addressed via scraper.

### `parse_vtwin_fitment_raw.mjs` — New ✅
Parses `fitment_raw` strings from vtwin_scrape_data for VTwin products with scrape data but no catalog_fitment_v2 rows. Pattern: `MODEL_CODE YEAR-YEAR` or `YEAR-UP`, pipe-separated. Skips Indian/Excelsior/Custom/DLX/Hummer. FXBFS typo fixed to FXFBS. ~86,833 rows inserted total across all runs (fitment_source=`vtwin_fitment_raw`, confidence=0.80). Dry-run default, `--apply` flag.

### `scrape_vtwin_missing.mjs` — New ✅
Two-phase scraper. Phase 1: GraphQL batches of 50 SKUs → url_key; 31,288 SKUs queried, 12,398 url_keys found, 18,890 not on vtwinmfg.com (discontinued). Phase 2: 8-concurrent HTML fetch of `{url_key}.html`, parses `<td data-th="FITS">` + OEM No. + description + attrs, upserts vtwin_scrape_data. 12,265/12,398 had fitment (99% hit rate). Checkpoint saved to vtwin_scrape_checkpoint.json. Runtime ~25 min.

### Net Result
VTwin fitment: 15,741 products (41.1%) → **21,390 products (55.8%)**. vtwin_scrape_data: ~19,000 → ~31,000+ rows.

## DB State After Session 58

| Table/Column | State |
|---|---|
| catalog_unified total active | **89,153** |
| catalog_fitment_v2 VTwin coverage | **21,390 products (55.8%)** |
| catalog_fitment_v2 new rows | ~86,833 (vtwin_fitment_raw source) |
| vtwin_scrape_data | **~31,000+ rows** (+12,398) |
| Typesense | **Reindex needed** — 89,153 docs currently indexed but fitment additions not yet reflected |

---

# ——— FIFTY-SEVENTH PASS (June 24, 2026) ———

## What Was Done

### infer_vtwin_categories.mjs — Updated + Run ✅
VTWIN_CATEGORY_TO_DISPLAY map (28 VTwin source categories → 21 display values). Live UPDATE sets both `category` and `display_category` in one pass. Run: 566 products, 100% match, 0 unmatched.

### generate_vtwin_skus.js — Full Rewrite ✅
Old script referenced non-existent schemas (vendor.vtwin_sku_staging, etc.) and had hardcoded credentials. Rewritten to: read catalog_unified WHERE source_vendor='VTWIN' AND internal_sku IS NULL; map display_category → SKU prefix; allocate from sku_counter; write internal_sku directly with .v suffix. Dry-run default, --apply flag.

### Browse ?category= Filter Stuck Bug ✅
CategoryBentoGrid and PDP breadcrumb were linking to `?category=Engine` (legacy) instead of `?display_category=Engine`. page.jsx filter init now folds old param into display_category. Removed category/subcategory from API params, URL builder, clear-all. Breadcrumb link on PDP fixed.

### OEM Number Search ✅
browse.ts ILIKE fallback extended to `unnest(cu.oem_numbers)`. Each word now also searches OEM arrays. Query `16779-99` went from 1 → 3 results.

### ProductImageGallery.jsx — New ✅
Client component. Builds image list from primaryUrl + imageUrls[], deduplicates. Single image → renders as before. Multiple → 1:1 hero + 64px thumbnail strip, gold border on active, per-image onError, horizontally scrollable. PU reads from catalog_media.all_urls; VTwin reads from cu.image_urls. getProduct() SQL updated: cu.image_urls added; catalog_media lateral fetches all images as array.

### PDP Layout + OEM Panel ✅
ProductDetailsSection moved above DataTabs (was below). OemAlternativesPanel removed entirely (import, parallel fetch, render).

### VTwin Attributes JSON Parse Fix ✅
ProductDetailsSection in page.jsx: attributes field now parsed with JSON.parse() if typeof === 'string'. Real fix in build_product_details.mjs is #22 on chase list.

### extract_pu_images.mjs — New ✅
Parses 133 PU brand XML files in scripts/data/pu_pricefile/brand_files/. Two schemas: PIES (DigitalAssets → URI) + Catalog_Content (partImage compound URL → base64 decode → comma-split). SKU matching normalized to no-dash on both sides. Results: 22,253 PU products with multi-image; 33,740 catalog_media rows inserted; 8,828 PU descriptions added; 15,330 OEM crossref entries (source=PU_PIES). Idempotent.

Typesense reindex: 89,153 docs, 0 errors.

---

# ——— FIFTY-SIXTH PASS (June 23, 2026) ———

## What Was Done

### build_pack_size_groups.mjs — Sync + Dedup ✅
dedupByPackQty() added (PU wins ties). Sync/evict on re-run. Fixed canonical query dropping variant_group_id IS NULL filter. canonical:91278 fixed. 148 total MULTI groups.

### scan_pack_qty_from_names.mjs — New ✅
12 auto-apply patterns + 3 review-only. 254 corrections applied. pack_qty>1 products: 1,917 → 2,171.

### product_details JSONB Column — New ✅
build_product_details.mjs normalizes PU features + WPS HTML→bullets + VTwin description/pdp_payload. 59,765/89,153 = 67% coverage initially. GIN index. index_unified.js updated: uses product_details as primary source, WPS HTML stripped from Typesense.

### PDP — ProductDetailsSection ✅
Description, gold-bulleted features, tech note callout, attributes grid.

### VTwin Catalog Refresh ✅
import_vtwin_catalog.js + ingest_vtwin_unified.js fixed. 38,160 products loaded, 411 new. 566 new SKUs assigned (MSC999973–1000538). VTwin OEM crossref: 8,426 → 16,752. VTwin scrape data synced: 87 descriptions + 3,165 pdp_payload entries. sku_counter table created and seeded.

Typesense reindex: 89,153 docs, 0 errors.

---

# ——— FIFTY-FIFTH PASS (June 22–23, 2026) ———

## What Was Done

- Credential rotation — WPS_TOKEN + DB password rotated, process.env references confirmed
- **Canonical merges fully drained** — 2,407 applied / 0 pending / 1,772 rejected
- WPS pack_qty: 1,070 corrected from WPS inventory data
- build_pack_size_groups.mjs new — cross-vendor pack-size variant groups, 145 groups initially
- WPS OEM crossref: 1,665 entries imported from wps-cross-fitment.csv
- VTwin OEM crossref: 8,426 entries from vtwin_catalog.oem_numbers
- 4× Typesense reindexes

---

# ——— FIFTY-FOURTH PASS (June 22, 2026) ———

## What Was Done

- Fulfillment pipeline: optimizer.ts, triggerFulfillment.ts, checkout/prepare, orders/create
- build_variant_groups.cjs: non-distinguishing axis bug fixed — 994 false groups where both members had same axis value (e.g. Chrome vs Chrome) dissolved
- Blast radius: 668 groups / 1,768 members before fix. All dissolved via rebuild
- Variant rebuild + reindex

---

# ——— FIFTY-THIRD PASS (June 16–22, 2026) ———

## What Was Done

- browse.ts: structural params fix (shared-array bug causing per-query param contamination)
- Canonical: Phase B mismatch-filtering rebuilt (pack qty + finish/color false-positive filters)
- Sweep script: auto-rejects queued proposals failing mismatch checks; all 2,407 pending proposals drained
- Orphan-fix SQL for chain-merge stragglers
- Image proxy: fflate-based route wired into ProductCard.jsx and ProductImage.jsx via resolveImageSrc()
- PU image contamination: 31,730 products nulled, 31,396 bad catalog_media rows deleted
- PU image URLs restored from pu_brand_enrichment
- OEM badge on PDP sourced from catalog_oem_crossref only

---

# ——— FIFTIETH PASS (June 15, 2026) ———

## What Was Done

- Browse OEM chain: pre-fetches chain product IDs (1.3ms warm) when year+model set
- ProductCard.jsx extracted as separate client component; selected/onSelect props; OEM chain badge
- InlinePanel.jsx — three parallel queries (variants, fitment year ranges, OEM crossref traversal)
- Browse inline panel API route
- Variant rebuild

---

# ——— FORTY-NINTH PASS (June 14, 2026) ———

## What Was Done

- **OEM supersession system**: oem_supersession table (283 pairs, confidence=1 pending review)
- normalize_oem() function (strips dashes/spaces/uppercases)
- from_oem_norm / to_oem_norm generated columns
- oem_supersession_review view
- mv_oem_fitment_coverage matview (683K rows, recursive forward+backward chain)
- browse.ts pre-fetch for OEM chain products
- Variant groups: Fits axis removed from WPS variant members
- normalizeAxisName() mapping (Finish→Color etc.)
- getChronologicalNeighbors updated with optional displaySubcategory param

---

# ——— FORTY-EIGHTH PASS (June 12–13, 2026) ———

## What Was Done

Full detail in HANDOFF_LOG.md (original). Summary:
- CRITICAL: PU vendor_sku completely fixed — all 36,396 active PU rows: vendor_sku = sku (PU's ordering number). brand_part_number retained as manufacturer cross-reference.
- Migrations: 005 (is_kit), 006 (pack_qty), 007 (DS###### PU rows), 010 (all remaining PU rows), 011 (variant_candidates table)
- Canonical match review tool expanded to v16 — inline editor, manual match, mismatch badges, variant flagging, variant candidates page
- admin/products/[id]/page.jsx: cream/gold/black restyling
- admin/products/[id]/route.ts: GENERIC_FIELD_MAP for ProductManager flat-body PATCHes
- ProductManager.jsx: pack_qty column
- admin/products list route: internal_sku + brand_part_number in search

---

# ——— FORTY-SEVENTH PASS (June 11–12, 2026) ———

## What Was Done

- Fulfillment architecture locked (drop-ship PU+WPS, VTwin manual PO, own merchant gateway TBD)
- canonical_products / product_vendors / canonical_match_proposals / orders tables created
- Phase A+B canonical pipeline: 89,153 products → 1:1 canonical entries; 469 OEM groups / 1,537 proposals
- CartContext, optimizer.ts, triggerFulfillment.ts, checkout/prepare, checkout/charge routes
- Initial vendor_sku fix (PU side found backwards in session 48 and re-fixed)

---

# ——— PASSES 41–46 (June 5–8, 2026) ———

Covered: display_subcategory taxonomy complete (all 20 categories, 87–97% coverage). VTwin round-2 scrape (22,583 rows). CategoryBentoGrid + ModelFinder redesign. browse.ts disjunctive faceting + count fix + variant dedup. FilterSidebar. VariantSelector Mode A. Font system locked (Tanker + Bespoke Serif Variable + Share Tech Mono). FlowingMenu + /models page. OEM cleanup (4,122 PU catalog numbers removed). VTwin OEM sync (15,723 products). mat view refresh.
