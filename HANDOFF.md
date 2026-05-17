# STINKIN' SUPPLIES — HANDOFF LOG
## Session: Harley Shop UI + Fitment Infrastructure
---

## WHERE WE ARE

### What was built this session
1. **Fitment import pipeline** — `import_pu_fitment.mjs` in `scripts/ingest/`
   - Imports `catalog_fitment_enriched.csv` (PU enrichment file) into `catalog_fitment_v2`
   - Cleans OEM numbers into `catalog_oem_crossref`
   - Currently: 430K rows in `catalog_fitment_v2` with `fitment_source = 'pu_enriched_csv'`
   - **An updated enrichment CSV is coming — re-run the import script to refresh**

2. **Filter group schema** — `harley_models.filter_group` column + `model_filter_groups` join table
   - 293 models, all grouped
   - `v_model_all_groups` view for querying across primary + cross-membership groups
   - Migration: `migrate_filter_groups_ab.sql` (already run)

3. **`FilterGroupLinks.tsx`** — `components/FilterGroupLinks.tsx`
   - 7-tile bento grid: Touring, Softail, Dyna, FXR, Sportster, Revolution Max, Vintage
   - 5 tiles open LayeredStack modals with sub-model cards
   - 2 tiles (Dyna, FXR) go direct
   - Uses `gsap` for LayeredStack card stacking animation
   - Uses `framer-motion` for tile hover + modal transitions
   - Font: `var(--font-sailor)` = New Sailor (loaded via `next/font/local` in `layout.tsx`)
   - **UI DIRECTION HAS CHANGED — see below**

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. UI redesign — white/gold/black palette
The current `FilterGroupLinks.tsx` uses the dark teal/charcoal palette.
**New direction: white, gold (#c9a84c), black — bold graphic, vintage badge/license plate aesthetic.**
The reference screenshot shows New Sailor font, gold fill tiles, black background, thick black border.
Rebuild the bento tiles + modal cards in this palette before wiring in.

### 2. Updated enrichment CSV import
User has a new version of `catalog_fitment_enriched.csv` with more complete data.
Run the existing import script — it deletes and re-inserts `pu_enriched_csv` rows cleanly:
```bash
node scripts/ingest/import_pu_fitment.mjs --dry-run   # check stats
node scripts/ingest/import_pu_fitment.mjs              # live run
```

### 3. New API route — `/api/harley/[family]/[model]/products`
Needs to be built from scratch. Query pattern:
```sql
SELECT DISTINCT cu.*
FROM catalog_unified cu
JOIN catalog_fitment_v2 cfv ON cfv.product_id = cu.id
JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
JOIN harley_models hm ON hm.id = hmy.model_id
WHERE cu.is_active = true
  AND (
    hm.filter_group = $1                          -- e.g. 'ROAD_KING'
    OR EXISTS (
      SELECT 1 FROM model_filter_groups mfg
      WHERE mfg.model_id = hm.id AND mfg.filter_group = $1
    )
  )
ORDER BY cu.name
LIMIT $2 OFFSET $3
```
Helper functions already written in `fitment_filter.mjs` (in project root or scripts/).

### 4. Clean URL routing
Structure: `/harley/[family]/[model]`
Examples:
- `/harley/touring/road-king`
- `/harley/softail/fat-boy`
- `/harley/sportster/ironhead`
- `/harley/vintage/panhead`

Needs:
- `app/harley/[family]/[model]/page.tsx` — server component, passes params to client
- `app/harley/[family]/[model]/ProductsClient.tsx` — fetches from new API, renders grid

### 5. Wire FilterGroupLinks into the new routing
`FilterGroupLinks.tsx` `onSelect` currently receives a `familyName` string.
After routing is built, it should instead call `router.push('/harley/touring/road-king')` etc.
The `FILTER_GROUP_TO_FAMILY` map in the component will need a slug version too.

---

## KEY FILES

| File | Location | Status |
|---|---|---|
| `FilterGroupLinks.tsx` | `components/FilterGroupLinks.tsx` | Built, needs palette update |
| `HarleySearchClient.tsx` | `app/harley/HarleySearchClient.tsx` | Old flow, being replaced |
| `import_pu_fitment.mjs` | `scripts/ingest/import_pu_fitment.mjs` | Done, re-run with new CSV |
| `fitment_filter.mjs` | project root or scripts/ | Helper query functions |
| `layout.tsx` | `app/layout.tsx` | New Sailor font loaded as `--font-sailor` |
| `config.ts` | `lib/harley/config.ts` | HARLEY_FAMILIES has 6 entries |

---

## DB STATE

```
catalog_unified          96,655 products
catalog_fitment_v2       ~1.2M rows total
  pu_enriched_csv        430,608 rows  ← will grow with new enrichment CSV
  oem_crossref           631 rows
  (null source)          769,113 rows  ← legacy, provenance unknown
catalog_oem_crossref     ~7,700 rows
harley_models            293 models, all have filter_group
harley_model_years       ~2,065 rows
model_filter_groups      81 cross-membership rows
v_model_all_groups       view — use this for filter queries
```

**DB connection (Node.js — use object form, not connection string):**
```js
const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  user: 'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
});
```
**psql (CLI — brackets required):**
```bash
psql "postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog"
```

---

## MODAL SUB-MODEL MAP

| Tile | Modal Cards | Maps to Family |
|---|---|---|
| Touring | Touring, Road King, Street Glide, Road Glide, Trike | Touring |
| Softail | Softail, Fat Boy, Heritage, Springer, Deluxe, Night Train, Breakout, Low Rider S | Softail |
| Sportster | Sportster, Ironhead | Sportster |
| Revolution Max | Pan America, Nightster, Sportster S | Sportster |
| Vintage | Panhead, Knucklehead, Flathead, Shovelhead, WL Series, Super Glide | FXR / Dyna |
| Dyna | (direct) | Dyna |
| FXR | (direct) | FXR |

---

## FILTER GROUP → DB MODEL CODES (key ones)
```
ROAD_KING    → harley_models WHERE model_code IN (FLHR, FLHRC, FLHRCI, FLHRSE, ...)
STREET_GLIDE → harley_models WHERE model_code IN (FLHX, FLHXI, FLHXSE, ...)
ROAD_GLIDE   → harley_models WHERE model_code IN (FLTR, FLTRI, FLTRX, ...)
TOURING      → harley_models WHERE filter_group = 'TOURING'
SPORTSTER    → harley_models WHERE filter_group = 'SPORTSTER'
IRONHEAD     → subset of SPORTSTER (XL, XLCH, XLH, year <= 1985)
PANHEAD      → model_code = 'panhead', year 1948-1965
```
Use `v_model_all_groups` view to query — handles cross-membership automatically.

---

## DESIGN DIRECTION

**Palette:** Black background `#080706`, Gold `#c9a84c`, White `#f0ebe3`
**Font:** New Sailor (`var(--font-sailor)`) for tile labels and modal headers
**Stencil font:** `var(--font-stencil)` = Share Tech Mono for sub-labels
**Caesar font:** `var(--font-caesar)` = Bebas Neue for product names/prices
**Reference:** Bold graphic tiles, thick borders, vintage badge/license plate feel
**Tile layout:** 3-column bento grid, mixed span-1 and span-2
**Interaction:** Hover = image slides in from alternating directions + teal border
**Modal:** LayeredStack (gsap) — cards stacked on open, spread on hover, click to select

---

## NEXT STEPS IN ORDER
1. Upload new enrichment CSV → re-run `import_pu_fitment.mjs`
2. Rebuild `FilterGroupLinks.tsx` in white/gold/black palette
3. Build `/api/harley/[family]/[model]/products` API route
4. Build `app/harley/[family]/[model]/page.tsx` + `ProductsClient.tsx`
5. Wire `FilterGroupLinks` to push to clean URLs instead of calling `onSelect`
6. Test end-to-end: tile → modal → model → product grid
