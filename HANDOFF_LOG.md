# STINKIN' SUPPLIES — HANDOFF LOG

---

# ——— FORTY-THIRD PASS (June 7, 2026) ———

Session: Forty-Third Pass · June 7, 2026

## WHERE WE ARE

Mixed frontend + data pipeline session. Font system fully overhauled (Barlow loaded, body uppercase removed, Bespoke Serif variable font). Browse UI gained product quick-view modal with fitment/OEM tabs and sidebar search. VTwin import pipeline patched to write OEM to canonical table. Scraper running against 19,662 remaining targets.

⚠️ Scraper still running — import + reindex + universal mark still pending.
⚠️ Component files built this session need to be dropped into codebase — see CHASE_LIST files table.

## What Was Done This Session

### 1. Font System Overhaul ✅

**globals.css:**
- Body font changed: `var(--font-stencil)` (Share Tech Mono) → `var(--font-body, 'Barlow')` — monospace was the default for ALL body text
- `text-transform: uppercase` **removed from body** — was forcing every character site-wide to caps. Single biggest readability fix.
- Added `font-size: 15px`, `font-weight: 500`, `line-height: 1.55` to body
- Added full type scale: `--text-2xs` (10px) through `--text-4xl` (56px)
- Added weight vars: `--fw-normal/medium/semibold/bold`
- Letter spacing switched to em-based (`--ls-label: 0.08em`)
- Added utility classes: `.label`, `.font-body`, `.fw-bold`, `.text-lg`, etc.

**layout.tsx:**
- `Barlow` added via `next/font/google` (weights 400/500/600/700) as `--font-body` variable
- Previously just a string `'Barlow', 'Barlow Condensed', sans-serif` — never actually loaded by Next.js
- `--font-barlow` legacy alias wired to `--font-body`
- Bespoke Serif switched from `BespokeSerif-Regular.ttf` → `BespokeSerif-Variable.ttf` with `weight: "300 800"`

**BespokeSerif-Variable.ttf:**
- Covers wght 300–800: Light · Regular · Medium · Bold · Extrabold
- Replaces all static weight files (Regular/Bold/Extrabold/Light can be deleted)
- Usage: `font-family: var(--font-bespoke); font-weight: 700;` now just works

**Component typography fixes (FilterSidebar + ProductQuickViewModal):**
- All font sizes below 12px bumped: 8/9→12px, 10/11→13px
- `MUTED: "#888"` → `"#555"` (was failing 3:1 contrast on cream)
- Washed-out grays `#aaa/#bbb/#ccc` → `#777/#888/#999`
- Absolute px letter-spacing → em-based throughout

### 2. ModelFinder — Title Size ✅
`components/home/ModelFinder.jsx`:
- KineticText fontSize: `clamp(14px,1.8vw,20px)` → `clamp(36px,5vw,72px)` — was 20px max, now 72px max
- Header layout restructured: "STINKIN' SUPPLIES" label + step dots on top row; title gets full width below
- Gold fading horizontal rule added under title

### 3. FilterSidebar — Inline Search ✅
`components/browse/FilterSidebar.jsx`:
- `useDebounce(value, 320)` hook added
- Search input rendered at top of FilterContent (hidden in collapsed mode)
- Local `searchInput` state, debounced → `onChange({ search: value })`
- Sync-back `useEffect`: resets input when `filters.search` cleared externally
- `filters.search` added to: chips array (quoted label), activeCount, all clear-all handlers (FilterContent + mobile footer)

### 4. ProductQuickViewModal — Tabbed Rebuild ✅
`components/browse/ProductQuickViewModal.jsx` — full rebuild with 3 tabs:

**Architecture:** Card data renders Details tab instantly (no loading). Fetch to `/api/products/[slug]` runs in background, enriches Details tab and populates Fitment/OEM tabs.

**Details tab:** Brand, name, category tags, price, stock, SKU/MPN/UPC, description, weight/origin, H-D fitment + universal badges. All fields from `ProductDetail`.

**Fitment tab:** Compact alternating-stripe table. Grouped by family in canonical order (Touring→CVO→Softail→Dyna→Sportster→FXR→V-Rod→Street→Vintage). Family header rows (gold background). Model / Code / Years columns. Summary line shows count + family count.

**OEM tab:** Pill grid of all OEM numbers. Click any pill to copy. "Copy All" button copies comma-separated list. Empty states for no data.

**Tab badges:** Show count once fetch resolves (e.g. `Fitment 42`). Spinner in tab label while loading.

**"View Full Details →"** writes `window.location.href` to `sessionStorage['stinkin_browse_return']` before navigating to PDP.

**Wiring in browse page:**
```jsx
const [quickView, setQuickView] = useState(null);
// on card: onClick={() => setQuickView(product)}
{quickView && <ProductQuickViewModal product={quickView} onClose={() => setQuickView(null)} />}
```

### 5. BrowseBackButton.jsx ✅
New `components/pdp/BrowseBackButton.jsx`:
- Reads `stinkin_browse_return` from sessionStorage on mount
- Only renders when key is present (user arrived from browse modal)
- Clears key on navigate to avoid stale back links
- Matches cream/gold palette

### 6. API Route — `/api/products/[slug]` ✅
New `app/api/products/[slug]/route.ts`:
- Thin wrapper around `getProductBySlug(slug)` from browse.ts
- Powers the ProductQuickViewModal fetch
- Returns full `ProductDetail` including fitment array

### 7. PDP SKU Fix ✅
`app/browse/[slug]/page.jsx` line 100:
- `COALESCE(cp.internal_sku, cu.internal_sku)` → `COALESCE(cu.internal_sku, cp.internal_sku)`
- `catalog_products.internal_sku` was winning over `catalog_unified.internal_sku` (taxonomy SKU)
- Now taxonomy SKU wins. `catalog_products` value only used as fallback.

### 8. catalog_oem_crossref Schema Fixes ✅
```sql
ALTER TABLE catalog_oem_crossref ADD COLUMN product_id integer REFERENCES catalog_unified(id);
-- Backfilled 20,836 rows via sku join (7,553 FatBook/OldBook rows remain NULL — ok)
DELETE FROM catalog_oem_crossref WHERE id NOT IN (SELECT MIN(id) FROM catalog_oem_crossref GROUP BY sku, oem_number);
-- Removed 1,898 duplicates
CREATE UNIQUE INDEX catalog_oem_crossref_sku_oem_uniq ON catalog_oem_crossref (sku, oem_number);
ALTER TABLE catalog_oem_crossref ALTER COLUMN oem_manufacturer DROP NOT NULL;
```

### 9. import_vtwin_fitment_partial.mjs — OEM Pipeline Fix ✅
Key problem: OEM data was writing directly to `catalog_unified.oem_numbers[]`, bypassing `catalog_oem_crossref` entirely.

**Patches applied:**
- Dedup pass now builds `skuToOem` map (bare_sku → oem_number)
- `oem_numbers` column removed from `catalog_unified` upsert
- New step 9: batch INSERT into `catalog_oem_crossref` (`source = 'VTWIN_SCRAPE'`, `ON CONFLICT DO NOTHING`)
- New step 9b: rebuild `oem_numbers[]` on `catalog_unified` from `catalog_oem_crossref` for affected products
- **All delete-then-reinsert patterns removed** — script now only fills gaps, never wipes existing data
- Summary now reports OEM rows inserted
- Next steps simplified to: mark universals → refresh mat view → reindex

### 10. VTwin Fitment Import ✅
Ran against new checkpoint (12,100 SKUs):
- 3,513 new fitment rows (rest were already present — ON CONFLICT DO NOTHING working correctly)
- 868 new OEM rows into catalog_oem_crossref
- oem_numbers[] rebuilt for 3,863 products
- Coverage: **45.7%** (15,371 with fitment + 2,946 universal out of 38,353 active)

### 11. VTwin Scraper — Round 2 ✅
Generated `vtwin_scrape_targets_2.csv` — 19,662 SKUs never scraped:
```sql
\copy (SELECT REPLACE(cu.sku, 'VT-', '') AS sku FROM catalog_unified cu
LEFT JOIN vtwin_scrape_data vsd ON (cu.sku = 'VT-' || vsd.sku OR cu.sku = vsd.sku)
WHERE cu.source_vendor = 'VTWIN' AND cu.is_active = true AND cu.is_universal = false
AND vsd.sku IS NULL AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 cfv WHERE cfv.product_id = cu.id))
TO '.../vtwin_scrape_targets_2.csv' CSV HEADER
```
Scraper restarted: `source venv/bin/activate && python scrape_vtwin_fitment.py --input vtwin_scrape_targets_2.csv`

## DB State After This Session

| Table | Change |
|-------|--------|
| catalog_oem_crossref | Added `product_id` FK. 20,836 backfilled. 1,898 dupes removed. Unique index on (sku, oem_number). oem_manufacturer nullable. |
| catalog_unified | 52,707 VTwin oem_numbers[] rebuilt from catalog_oem_crossref. 13 new VTwin products added. |
| catalog_fitment_v2 | +3,513 VTwin rows from new checkpoint import. |

## What Needs to Happen Next

1. Wait for scraper to finish against vtwin_scrape_targets_2.csv
2. Export checkpoint → run import → mark universals → refresh mat view → reindex
3. Drop session 43 component files into codebase (see CHASE_LIST)
4. Wire ProductQuickViewModal into browse page product cards
5. Wire BrowseBackButton into PDP
6. Add ADMIN_SECRET to Vercel

---

# ——— FORTY-SECOND PASS (June 5, 2026) ———

Session: Forty-Second Pass · June 5, 2026

## WHERE WE ARE

Full filtering system audit + fixes. 4-layer review of browse.ts, FilterSidebar, fitment data, Typesense. All critical issues resolved. VTwin scraper partial import run. filter_roadmap.md created.

## What Was Done This Session

### 1. Filtering System Audit ✅
4-layer audit. 5 critical bugs, 7 gaps, 2 minor. filter_roadmap.md built.

### 2. browse.ts — is_universal Fix ✅
`OR cu.is_universal = true` added to modelCode, year, and family fallback WHERE conditions. Column is `is_universal` not `fits_all_models`.

### 3. browse.ts — Dash-Suffix Regex ✅
Open-ended regex replaced with finish-word-restricted pattern. Directional parts no longer collapse.

### 4. vtwin_mark_universal.sql ✅
Rebuilt. 2,328 VTwin products marked via category + name patterns.

### 5. FilterSidebar Fixes ✅
Year chip added. Family chip clear resets year. Outer activeCount fixed. "Engine Era" rename. Coverage hint added.

### 6. Model Codes + MODEL_ALIASES ✅
12 model codes added. 5 new alias groups: FLHR, FLHX, FLSTF, FXSTB, FXDWG.

### 7. extract_fitment_from_names ✅
PU 45.3%→49.2%, VTwin 36.3%→37.7%, WPS 38.7%→40.8%

### 8. VTwin Scraper Partial Import ✅
6,742 SKUs / 91,259 fitment rows / 550 universals.

### 9. Typesense Reindex ✅
90,536 docs, 0 errors.

---

# ——— FORTY-FIRST PASS (June 5, 2026) ———

Homepage rebuilt around ModelFinder. Font system locked in. Variant display overhauled. 199 variant sub-groups merged. Typesense reindexed twice.

---

# ——— FORTIETH PASS (June 4, 2026) ———

VTwin SKU duplicate cleanup. import_vtwin_fitment_partial.mjs patched (×4). 185,234 fitment rows. vtwin_scrape_targets.csv generated.

---

# ——— THIRTY-NINTH PASS (June 4, 2026) ———

Fitment filter bug fixed. OEM cleanup. Typesense reindex 104,917 docs.

---

# ——— THIRTY-EIGHTH PASS (June 4, 2026) ———

Admin inline PDP edit. API route. catalog_review_flags. Next.js 15 params fix.

---

# ——— THIRTY-SEVENTH PASS (June 3, 2026) ———

FlowingMenu. /models page. mv_family_product_ranges mat view (9s→83ms). Font system. VTwin scraper finished.

