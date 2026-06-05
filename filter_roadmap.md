# Stinkin' Supplies — Filtering System Roadmap
**Created:** June 5, 2026  
**Scope:** browse.ts · FilterSidebar · Fitment data · Typesense facets

---

## Architectural note

Two parallel paths exist that do not share state. Typesense provides facet counts shown in the sidebar. `browse.ts` runs the actual product query with fitment JOINs. When `?year=` or `?model=` params are active, these paths **diverge** — sidebar counts reflect the un-filtered catalog while the product grid reflects the fitment-filtered subset. Phase 4 resolves this structurally; earlier phases reduce the damage.

---

## Prerequisite — Drop Session 41 Outputs

Before starting Phase 1, drop all outputs from session 41 into the codebase. These are the base files the phases below modify.

| File | Destination |
|------|-------------|
| `browse.ts` | `lib/db/browse.ts` |
| `FilterSidebar.jsx` | `components/browse/FilterSidebar.jsx` |
| `VariantSelector.jsx` | `components/browse/VariantSelector.jsx` |
| `page.jsx` | `app/page.jsx` |
| `ModelFinder.jsx` | `components/home/ModelFinder.jsx` |
| `layout.tsx` | `app/layout.tsx` |
| `by-engine-route.ts` | `app/api/models/by-engine/route.ts` |
| `codes-route.ts` | `app/api/models/codes/route.ts` |

---

## Phase 1 — Quick Unblocks
**Target:** Session 42 · Low effort · Mostly SQL + config

### 1.1 Run vtwin_mark_universal.sql ⚡ READY
**File:** `scripts/ingest/vtwin_mark_universal.sql` (already in outputs)  
**Impact:** Unblocks 2,350 VTwin universal/tool products — currently invisible in all fitment-filtered results

```bash
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -f scripts/ingest/vtwin_mark_universal.sql
```

After running, verify:
```sql
SELECT COUNT(*) FROM catalog_unified
WHERE source_vendor = 'VTWIN' AND fits_all_models = true;
-- expect ~2,350
```

---

### 1.2 Audit + Fix fits_all_models in browse.ts fitment WHERE
**File:** `lib/db/browse.ts`  
**Issue:** When `?year=` or `?model=` params are active, the fitment WHERE clause needs to include `fits_all_models` products OR they are excluded from filtered results.

Find the fitment filter block in browse.ts. The WHERE condition must be:

```sql
-- CORRECT
WHERE (
  EXISTS (
    SELECT 1 FROM catalog_fitment_v2 f
    WHERE f.product_id = cu.id
    AND f.model_code = $model
    AND f.year = $year
  )
  OR cu.fits_all_models = true
)
```

If it is only the `EXISTS (...)` clause without the `OR cu.fits_all_models = true`, add it. This is the gate that lets universal products through when a model filter is active.

---

### 1.3 Tighten Dash-Suffix Regex in browse.ts
**File:** `lib/db/browse.ts`  
**Issue:** The current middle-tier DISTINCT ON key regex strips anything after a dash:
```
\s*-\s*[A-Z][A-Z0-9 /]+$
```
This collapses directional parts — `BRAKE PAD - FRONT` and `BRAKE PAD - REAR` become the same card.

**Fix:** Replace the open-ended dash strip with a finish-word-only pattern. The suffix words list is already defined in browse.ts for the bare-word tier. Reuse it:

```sql
-- Replace the middle regex strip with this:
regexp_replace(
  name,
  '\s*-\s*(BLACK|CHROME|SILVER|GOLD|RED|BLUE|GREEN|BROWN|PINK|WHITE|NATURAL|POLISHED|WRINKLE|GLOSS|MATTE|SATIN)$',
  '',
  'i'
)
```

This only strips known finish/color suffixes after a dash, leaving `- FRONT`, `- REAR`, `- LEFT`, `- RIGHT`, `- UPPER`, `- LOWER` intact.

---

### 1.4 Check Typesense Brand Facet Cap
**File:** `scripts/ingest/index_unified.js`  
**Issue:** Typesense's default `max_facet_values` is 10. With 507 brands, the brand filter in the sidebar may silently truncate to the top 10. 

Find the collection schema definition and the search call. Confirm `max_facet_values` is set at query time:

```js
// In the search/facet query call
max_facet_values: 100,  // should be at least this
```

If missing, add it to wherever the Typesense search query is constructed (likely in the browse API route or the FilterSidebar data fetch).

---

### 1.5 Verify OEM # Search ⚡ QUEUED
**From:** NEXT SESSION #15

```
Search: 24009-06
Expected: 3 products returned
```

If zero results: check that `oem_numbers` is included in `query_by` in the Typesense search call, and that the field is defined as a `string[]` in the collection schema.

---

## Phase 2 — Sidebar UX
**Target:** Session 42–43 · ~1 session · React work  
**Depends on:** Phase 1.1 (vtwin_universal) complete

### 2.1 Fitment Context Chip
**File:** `components/browse/FilterSidebar.jsx`  
**Issue:** Users arriving from ModelFinder with `?year=2005&model=FLHR&family=Touring` have no visible indicator of their active bike context in the sidebar. They cannot see or clear it.

**What to build:** Read `year`, `model`, and `family` from URL search params. Render a dismissable chip in the active filters area above the section list.

```jsx
// Read from URL
const searchParams = useSearchParams()
const activeYear = searchParams.get('year')
const activeModel = searchParams.get('model')
const activeFamily = searchParams.get('family')

// Render chip when any fitment param is present
{(activeYear || activeModel) && (
  <div className="fitment-chip">
    {activeYear && <span>{activeYear}</span>}
    {activeModel && <span> · {activeModel}</span>}
    <button onClick={() => clearFitmentParams()}>×</button>
  </div>
)}
```

`clearFitmentParams` should push a new URL with `year`, `model`, and `family` removed but all other params preserved.

Display format: `2005 · FLHR ×`

---

### 2.2 Fix activeCount
**File:** `components/browse/FilterSidebar.jsx`  
**Issue:** The filter badge count on the sidebar toggle button excludes `year` and `model` params. A user with a bike selected + 2 sidebar filters sees `2` instead of `4`.

Find the `activeCount` calculation and add:

```js
const activeCount = [
  filters.category,
  filters.era,
  filters.brand,
  filters.inStock,
  filters.priceMin || filters.priceMax,
  searchParams.get('year'),    // add these
  searchParams.get('model'),   // add these
].filter(Boolean).length
```

---

### 2.3 Clarify Era vs Family
**File:** `components/browse/FilterSidebar.jsx`  
**Issue:** The sidebar's Era section filters `catalog_unified.era` (engine era: Evolution, Twin Cam, Milwaukee Eight, etc.). ModelFinder routes with `?family=` (HD model family: Touring, Softail, Dyna, etc.). These are different dimensions and can both be active simultaneously.

**Fix:** Rename the sidebar section from "Era" to "Engine Era" to make it explicit that this is the engine generation, not the bike family. Optionally add a small descriptor under the label: `engine generation`.

This prevents users from thinking they've double-selected when they have `?family=Touring` from ModelFinder and see a separate "Era" section in the sidebar.

---

### 2.4 Fitment Coverage Signal
**File:** `components/browse/FilterSidebar.jsx` (or browse grid header)  
**Issue:** When a fitment filter is active, ~60% of the catalog is excluded with no explanation. Users may miss valid parts that simply lack fitment data.

**What to build:** When `?year=` or `?model=` is present in the URL, show a small count line below the active filter chips:

```
Showing 312 fitment-matched · 47 universal
```

This count can be returned from the browse API alongside the product list — add two count fields to the browse response:
- `fitmentMatchCount` — products with a fitment row matching the active params
- `universalCount` — products where `fits_all_models = true`

---

## Phase 3 — Fitment Coverage
**Target:** Sessions 43–44 · ~2 sessions · Data + code  
**Expected coverage improvement:** ~40% → ~55%+ after all phase 3 tasks complete

### 3.1 Add 26 Missing Model Codes ⚡ QUEUED
**From:** NEXT SESSION #13  
**File:** `harley_models` table

Insert the following codes. Each needs `family`, `year_start`, `year_end`, and `display_name` at minimum.

**CVO Touring (1999+):**
`FLTRCVO`, `FLHTKCVO`, `FLHTCVO`, `FLTRXCVO`, `FLHXCVO`

**CVO Softail:**
`FLFBSANY`, `FLFBSANV`, `FLFBSANX`, `FLHCSANV`

**CVO Dyna/FXR:**
`FXBSE`, `FXDE`

**Street:**
`XG` (Street 500/750, 2015+)

**Specialty:**
`RH120S` (Road King 120th Anniversary), `FLHXX` (Street Glide Special), `FXRST`, `FLHTKS`, `FXLRSST`, `FLTHK`, `FLTSN`, `FLTN`, `FXLRFLFB`, `FLFS`

After insert, confirm ModelFinder can surface these via `/api/models/search`.

---

### 3.2 Expand MODEL_ALIASES
**File:** `scripts/ingest/import_vtwin_fitment_partial.mjs`  
**Issue:** A fitment row stored under `FLHR` won't match a user querying `FLHRCI`. The existing MODEL_ALIASES only covers `E`, `XL883`, and `XL1200`.

Add the following alias groups:

```js
const MODEL_ALIASES = {
  // Existing
  'E':      ['EL', 'ELH'],
  'XL883':  ['XL883', 'XL883C', 'XL883L', 'XL883N', 'XL883R'],
  'XL1200': ['XL1200', 'XL1200C', 'XL1200L', 'XL1200N', 'XL1200R', 'XL1200S',
             'XL1200T', 'XL1200V', 'XL1200X', 'XL1200CX', 'XL1200NS'],

  // Road King
  'FLHR':   ['FLHR', 'FLHRI', 'FLHRC', 'FLHRCI', 'FLHRSE', 'FLHRS',
             'FLHRSI', 'FLHRSEI', 'FLHRSCI', 'FLHRXS'],

  // Street Glide
  'FLHX':   ['FLHX', 'FLHXI', 'FLHXSE', 'FLHXS', 'FLHXXX'],

  // Fat Boy
  'FLSTF':  ['FLSTF', 'FLSTFI', 'FLSTFSE', 'FLSTFB', 'FLSTFBS', 'FLFB', 'FLFBS'],

  // Night Train
  'FXSTB':  ['FXSTB', 'FXSTBI', 'FXSTBSE'],

  // Wide Glide
  'FXDWG':  ['FXDWG', 'FXDWGI', 'FXDWG3', 'FXDWGS'],

  // Electra Glide
  'FLHT':   ['FLHT', 'FLHTI', 'FLHTC', 'FLHTCI', 'FLHTCSE', 'FLHTCU', 'FLHTCUI',
             'FLHTK', 'FLHTKI'],
}
```

After updating aliases, re-run the VTwin fitment import and reindex.

---

### 3.3 Run extract_fitment_from_names.mjs ⚡ QUEUED
**From:** NEXT SESSION #10  
**File:** `scripts/ingest/extract_fitment_from_names.mjs`

Safe to run — has NOT EXISTS guard, will not overwrite existing fitment rows.

```bash
node scripts/ingest/extract_fitment_from_names.mjs
```

Adds ~4,700 fitment rows extracted from product names across all three vendors. Tier 2 Big Twin → Softail exclusion for year ranges ending ≤ 1984 was applied in session 40.

After run: refresh mat view + reindex.

```bash
psql 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog' \
  -c 'REFRESH MATERIALIZED VIEW mv_family_product_ranges;'
node scripts/ingest/index_unified.js --recreate
```

---

### 3.4 Import VTwin Scraper Results ⚡ QUEUED
**From:** NEXT SESSION #9  
**Depends on:** Scraper finishing against `vtwin_scrape_targets.csv` (20,236 SKUs)

```bash
VTWIN_CSV=./scripts/ingest/vtwin_fitment_combined.csv \
  node scripts/ingest/import_vtwin_fitment_partial.mjs
```

⚠️ Never run two instances of `import_vtwin_fitment_partial.mjs` in parallel.  
After import: reindex.

---

## Phase 4 — Facet Alignment
**Target:** Future · Decision required first  
**Depends on:** Phases 1–3 complete

### 4.1 Decision — Facet Strategy When Fitment Filter Active

The core problem: Typesense facet counts are computed from the full catalog. When `?year=2005&model=FLHR` is active, the sidebar might show "Engine (847)" but the post-fitment product grid has 312. This causes misleading filter option counts and potential empty result sets when a user clicks a category.

Three options:

**Option A — Postgres facets when fitment active** *(recommended long-term)*  
When fitment params are in the URL, compute facets via a Postgres `GROUP BY` query instead of Typesense. Accurate, adds a second facet code path.

```sql
-- Fitment-aware category facet
SELECT display_category, COUNT(*) as count
FROM catalog_unified cu
WHERE cu.is_active = true
AND (
  EXISTS (SELECT 1 FROM catalog_fitment_v2 f
          WHERE f.product_id = cu.id AND f.model_code = $model AND f.year = $year)
  OR cu.fits_all_models = true
)
GROUP BY display_category ORDER BY count DESC;
```

**Option B — Accept divergence + UX label** *(interim quickest path)*  
Keep Typesense facets. Add a small note in the sidebar when fitment params are active: `"Counts reflect full catalog"`. One label, one condition check. Honest, slightly confusing.

**Option C — Typesense fitment filter field** *(keeps stack consistent)*  
During reindex, add a `fitment_model_codes: string[]` field to each Typesense document containing all model codes that fit the product. When `?model=FLHR` is active, add `filter_by: fitment_model_codes:=[FLHR,FLHRI,FLHRC,...]` to the Typesense query. Facets are then computed against the filtered result set. Requires schema redesign and a large field (some products have 100+ fitment rows).

**Recommendation:** Do Option B now (one line) so sidebar counts are labeled accurately while you wait for Phase 3 data to stabilize, then implement Option A or C in a dedicated session.

---

### 4.2 Reindex Automation
**File:** `scripts/ingest/index_unified.js`  
**Issue:** Reindex is currently manual. After bulk catalog operations (fitment import, OEM update, variant merge), facets go stale until manually re-run.

Add a final step to the end of each ingest script:

```js
// At end of import_vtwin_fitment_partial.mjs, extract_fitment_from_names.mjs, etc.
import { execSync } from 'child_process'
console.log('Triggering Typesense reindex...')
execSync('node scripts/ingest/index_unified.js --recreate', { stdio: 'inherit' })
```

Or wire as a post-script in `package.json`:
```json
"scripts": {
  "reindex": "node scripts/ingest/index_unified.js --recreate",
  "ingest:vtwin": "node scripts/ingest/import_vtwin_fitment_partial.mjs && npm run reindex"
}
```

---

### 4.3 Document Typesense Schema
**File:** Create `scripts/ingest/TYPESENSE_SCHEMA.md`

Document every field in the Typesense collection — name, type, facet: true/false, sort: true/false, whether it maps to a `catalog_unified` column. Without this, schema changes after `catalog_unified` alterations get missed and the index silently serves stale or missing data.

---

## Issue Summary

| Layer | Issue | Severity | Phase |
|-------|-------|----------|-------|
| browse.ts | Dash-suffix regex collapses directional parts | 🔴 Critical | 1.3 |
| browse.ts | fits_all_models not confirmed in fitment WHERE | 🔴 Critical | 1.2 |
| browse.ts | Cross-vendor name collapse hides price/option differences | 🟡 Gap | — |
| FilterSidebar | No chip for active year/model params | 🔴 Critical | 2.1 |
| FilterSidebar | activeCount excludes year/model params | 🔴 Critical | 2.2 |
| FilterSidebar | Era vs Family label confusion | 🟡 Gap | 2.3 |
| FilterSidebar | Brand facet cap may truncate to top 10 | 🟡 Gap | 1.4 |
| Fitment data | vtwin_mark_universal.sql not run | 🔴 Critical | 1.1 |
| Fitment data | ~60% of catalog unfitted, no UX signal | 🟡 Gap | 2.4 |
| Fitment data | MODEL_ALIASES incomplete | 🟡 Gap | 3.2 |
| Fitment data | 26 model codes missing from harley_models | 🟡 Gap | 3.1 |
| Typesense | Facets pre-fitment filter — counts don't match grid | 🔴 Critical | 4.1 |
| Typesense | No reindex automation | 🟡 Gap | 4.2 |
| Typesense | oem_numbers search pending verification | ⚪ Minor | 1.5 |
| Typesense | Schema undocumented | ⚪ Minor | 4.3 |

---

*Filter Roadmap — June 5, 2026 · Built from session 41 audit*
