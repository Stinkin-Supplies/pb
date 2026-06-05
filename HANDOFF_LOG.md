# STINKIN' SUPPLIES — HANDOFF LOG

---

# ——— FORTIETH PASS (June 4, 2026) ———

Session: Fortieth Pass · June 4, 2026

## WHERE WE ARE

Long data quality + fitment session. No frontend schema changes. Fixed three files (route.ts, extract_fitment_from_names.mjs, FilterSidebar.jsx), resolved a major VTwin SKU duplicate problem, imported VTwin fitment, and identified the remaining scrape gap.

## What Was Done This Session

### 1. console.log Removed from route.ts ✅
Removed debug `console.log` from `isAuthorized()` in `app/api/admin/products/[id]/route.ts`. Safe to deploy.

### 2. extract_fitment_from_names.mjs — Tier 2 Big Twin/Softail Fix ✅
Added `softailCutoff` exclusion: when mapping "Big Twin" → Softail family, skip products whose year range ends ≤ 1984. Prevents pre-1984 Big Twin products from appearing in Softail filter results on re-run.

### 3. FilterSidebar.jsx — Full Redesign ✅
Complete rewrite. Key improvements:
- Active filter chips at top with individual ×-remove buttons
- Gold dot indicators on collapsed sections that have active filters
- Sections auto-open when landing with ?family= or ?display_category= in URL
- Subcategory section auto-opens when a category is selected
- Collapsed desktop sidebar shows abbreviated vertical labels
- Mobile footer has separate Clear + Show Results buttons
- Framer Motion whileHover on rows, pill toggle for In Stock
- Price inputs parse as floats on change

### 4. VTwin SKU Duplicate Discovery & Cleanup ✅
Discovered two classes of VTwin SKUs in catalog_unified:
- **Prefixed** (`VT-10-0030`): 37,749 rows — canonical, from main catalog merge, created May 19
- **Bare** (`10-0030`): 14,928 rows — orphans, created by import_vtwin_fitment_partial.mjs upserting with raw SKUs

14,407 products existed as both. Fixed via:
1. Migrated fitment from bare IDs → prefixed IDs (deleted 163,301 conflict rows, moved 104,819)
2. Deactivated 14,407 bare dupes (521 bare-only products with no VT- counterpart left active)
3. Patched import script to upsert with VT- prefix, resolve active-only IDs, prefer prefixed in lookup, delete old bare-ID fitment on re-run

### 5. import_vtwin_fitment_partial.mjs — Four Patches ✅
- **fits_all_models**: Column added to INSERT + ON CONFLICT. Universal SKUs now set `fits_all_models = true`
- **MODEL_ALIASES**: `E → [EL, ELH]`, `XL883 → [XL883, XL883C, XL883L, XL883N, XL883R]`, `XL1200 → all 11 variants`. Knucklehead + Sportster fitment now resolves correctly
- **SKU resolution**: Now filters `is_active = true`, prefers VT- prefixed rows over bare rows
- **Upsert prefix**: Pre-loads which bare SKUs have active VT- counterpart, upserts with VT- prefix for those
- **Delete scope**: Also deletes vtwin_partial fitment from old bare IDs before reinserting to prefixed IDs

### 6. VTwin Fitment Import (Combined File) ✅
Merged vtwin_fitment_final.csv + vtwin_fitment_missing.csv into vtwin_fitment_combined.csv (14,928 unique SKUs after dedup). Imported with all patches applied:
- 185,234 fitment rows inserted
- 174,489 on active prefixed IDs ✅
- 10,745 on active bare-only IDs (521 legitimate products) ✅
- 0 on inactive bare IDs ✅

### 7. VTwin Fitment Gap Analysis ✅
24,393 VTwin products still have zero fitment. Analyzed and categorized:
- 13 `*UPDATE` discontinued SKUs → skip
- 1,794 SKU-only (no real name) → skip
- 2,350 tools/universal parts → mark `fits_all_models = true` (SQL: `vtwin_mark_universal.sql`)
- **20,236 genuine scrape targets** → `vtwin_scrape_targets.csv` ready to feed into scraper

Scraper re-run started: `cd /Users/home/Desktop/vtwin_scraper/vtwin_scraper && source venv/bin/activate && python3 scrape_vtwin_fitment.py`

### 8. OEM Backfill — Schema Fix ✅
`catalog_oem_crossref` has no `product_id` or `catalog_product_id` column — joins on `sku`. Correct backfill:
```sql
UPDATE catalog_unified cu
SET oem_numbers = ARRAY(SELECT oem_number FROM catalog_oem_crossref WHERE sku = cu.sku)
WHERE source_vendor = 'VTWIN'
AND EXISTS (SELECT 1 FROM catalog_oem_crossref WHERE sku = cu.sku);
```
Ran — UPDATE 3,897.

## DB State After This Session

| Table | Change |
|-------|--------|
| catalog_unified | 14,407 bare VTwin dupes deactivated. Active: PU 36,396 / VTwin 38,270 / WPS 15,844 = 90,520 total active |
| catalog_fitment_v2 | vtwin_partial: 185,234 rows on correct prefixed IDs |
| catalog_unified.fits_all_models | 555 VTwin universal SKUs now flagged (from this import) |
| catalog_unified.oem_numbers[] | 3,897 VTwin products backfilled |

### Current Fitment Coverage
| Vendor | Total | With Fitment | Coverage |
|--------|-------|--------------|----------|
| PU | 36,396 | 16,502 | 45.3% |
| VTwin | 38,270 | 13,877 | 36.3% |
| WPS | 15,844 | 6,133 | 38.7% |

⚠️ Note: Total active dropped from 104,917 → 90,520 due to 14,407 bare dupe deactivations. Typesense reindex needed.

## What Needs to Happen Next

| # | Task | Priority |
|---|------|----------|
| 1 | Reindex Typesense | HIGH — active count changed (90,520 now vs 104,917 indexed) |
| 2 | Run vtwin_mark_universal.sql | HIGH — marks 2,350 tools as fits_all_models |
| 3 | Wait for scraper + import vtwin_scrape_targets results | HIGH — 20,236 SKUs being scraped |
| 4 | Run extract_fitment_from_names.mjs | MEDIUM — ~4,700 products have name signals |
| 5 | Fix Tanker + Bespoke fonts | HIGH — /models broken without them |
| 6 | Remove console.log from route.ts | DONE ✅ |
| 7 | Add ADMIN_SECRET to Vercel | HIGH |
| 8 | Verify null slug on /browse | MEDIUM |
| 9 | Verify OEM search for 24009-06 | MEDIUM |
| 10 | /models in nav | MEDIUM |

---

# ——— THIRTY-NINTH PASS (June 4, 2026) ———

Session: Thirty-Ninth Pass · June 4, 2026

## WHERE WE ARE

Data quality session. No schema changes. No frontend changes. Fixed product filtering bug (wrong products appearing in family filter results) and did a full OEM number cleanup pass. Reindexed Typesense at end.

## What Was Done This Session

### 1. Fitment Filter Bug — Fixed ✅

**Symptom:** Filtering by `?family=Softail` showed products like "TAPPET ASSEMBLIES - BIG TWIN '53-'84" that predate Softail entirely.

**Root cause:** `extract_fitment_from_names.mjs` Tier 2 mapped the "Big Twin" keyword to ALL Big Twin families in the year range. The FXST launched mid-1984, so products with year ranges ending at 1984 picked up exactly 1 Softail model-year row — enough to appear in Softail filter results.

**Fix:** Deleted 2,051 `name_extraction` Softail fitment rows from products matching `big.?twin.*(''5x|''6x|''7x|''8[0-4])` pattern.

Also deleted 1,269,765 Tier 3 `name_extraction` rows (conf=0.65 — family keyword only, no year anchor).

**⚠️ Code fix applied in session 40:** `extract_fitment_from_names.mjs` Tier 2 now has softailCutoff exclusion.

### 2. OEM Number Cleanup ✅

Full audit and cleanup of `oem_part_number` column across all 104,917 active products.

1. Stripped `JGI-` prefix from 295 James Gaskets numbers
2. NULLed 16,378 confirmed noise values
3. Synced 16,610 real HD OEM numbers into `oem_numbers[]`
4. Initialized 63,396 NULL `oem_numbers[]` to `{}`

### 3. Typesense Reindex ✅
104,917 docs, 0 errors.

