# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: PDP Overhaul + Filter Bottom Sheet + Fitment Scripts · May 21, 2026 (Twenty-Fifth Pass)**

---

## WHERE WE ARE

### What Was Built/Fixed This Session

#### 1. PDP Full Redesign ✅
`app/browse/[slug]/ProductDetailClient.jsx` — complete visual overhaul:
- Gallery now `position: sticky; top: 20px` — stays visible while scrolling info panel
- Price and stock indicator on same row (price left, dot right) — no more hunting
- Qty + Cart above the fold at 44px height
- Trust badges compact 2×2 grid, visually lighter
- Fitment single-year dedup fixed: `rangeStr()` uses `Set` grouping — `1987` shows as `1987`, not `1987–1987`
- No `<style jsx>` anywhere — pure inline styles
- Mobile: gallery unsticks, grid goes single column

#### 2. VariantSelector Fixes ✅
`components/browse/VariantSelector.jsx`:
- **`data` scope bug fixed**: `TwoAxisSelector` now receives `group` as an explicit prop instead of reading `data?.group` from parent closure
- **Navigation loading state**: both selectors fade to 60% opacity on click while route changes
- **Current item UX**: `VariantRow` shows `← HERE` label on current product, `disabled={isCurrent}` so clicking self does nothing
- `SingleAxisSelector` and `TwoAxisSelector` both receive `group` prop explicitly

#### 3. BottomNav — Filter Toggle on /browse ✅
`components/BottomNav.tsx`:
- On `/browse` and `/browse/*`: left slot swaps HOME → 3-line hamburger
- Hamburger fires `window.dispatchEvent(new CustomEvent("stinkin:filterToggle"))` — no prop drilling
- On desktop (≥769px): hamburger hidden via CSS (desktop has persistent sidebar)
- Center search orb dimmed/disabled on browse (filter is the primary action there)
- All other pages: HOME link restored as before

#### 4. Browse Page — Mobile-First Restructure ✅
`app/browse/page.jsx`:
- `window.addEventListener("stinkin:filterToggle", ...)` in `useEffect` toggles `sidebarOpen`
- Desktop: `<div className="desktop-sidebar">` renders `FilterSidebar` with `mobileSheet={false}` — hidden on ≤768px
- Mobile: `<div className="mobile-only">` renders `FilterSidebar` with `mobileSheet={true}` — hidden on ≥769px
- Floating filter pill button: `position: fixed; bottom: 86px` centered above bottom nav, shows FILTER + active count badge, visible on mobile only
- Sort + count bar moved into grid area (no top bar needed)
- Removed broken `mobile-filter-btn` div that was `display:none` but never wired
- `PagBtn` extracted as shared pagination component
- Product grid: 4-col desktop → 2-col mobile

#### 5. FilterSidebar — Bottom Sheet Mode ✅
`components/browse/FilterSidebar.jsx`:
- New `mobileSheet` prop — when `true`, renders as bottom sheet instead of sticky column
- Bottom sheet: `borderRadius: "16px 16px 0 0"`, spring animation `y: "100%" → 0`, max-height 82vh
- Drag handle at top, scrollable filter content, "Show Results" button pinned at bottom
- Body scroll locked while sheet open (`document.body.style.overflow = "hidden"`)
- `FilterContent` extracted as shared sub-component used by both modes — zero duplication
- Desktop sidebar: unchanged (sticky, collapsible, same `‹` toggle)
- Both instances share same `filters`/`onChange` state — stay in sync

#### 6. PU Fitment Promote Script ✅
`scripts/ingest/promote_pu_fitment.cjs` — new script:
- Auto-introspects `pu_fitment_expanded` column names (detects SKU col, verifies `model_year_id`)
- Estimates matchable pairs before writing (`--dry` flag)
- Deletes old PU rows, batch-inserts 10K at a time with `ON CONFLICT DO NOTHING`
- Backfills `is_harley_fitment = true` on matched PU products
- Prints final counts for both PU and total `catalog_fitment_v2`

#### 7. VTwin Fitment Script ✅
`scripts/ingest/ingest_vtwin_fitment.cjs` — new script:
- Auto-introspects `vtwin_oem_crossref` columns, prints sample rows
- **Strategy A** (if has year + model cols): direct year → `harley_model_years` join
- **Strategy B** (if has SKU ↔ OEM pairs): copies fitment via `catalog_oem_crossref` from matched products that already have fitment
- Auto-detects which strategy applies, falls back to B if unclear
- Backfills `is_harley_fitment` on matched VTWIN products
- `--dry` flag supported

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. Run promote_pu_fitment.cjs (HIGH)
```bash
node scripts/ingest/promote_pu_fitment.cjs --dry   # check match count
node scripts/ingest/promote_pu_fitment.cjs          # live run
```
Expected: ~1.64M source rows → significant new rows in `catalog_fitment_v2`

### 2. Run ingest_vtwin_fitment.cjs (HIGH)
```bash
node scripts/ingest/ingest_vtwin_fitment.cjs --dry  # check strategy + match count
node scripts/ingest/ingest_vtwin_fitment.cjs         # live run
```
Watch the dry run output — if Strategy B returns 0 matches, check the sample rows it prints and adjust the script's OEM column detection.

### 3. Re-run ERA BACKFILL SQL (HIGH)
After both fitment promotes complete, re-run the ERA BACKFILL SQL from MasterRef to re-tag `era_*` columns with the new fitment data.

### 4. Re-run build_variant_groups.cjs (HIGH)
```bash
node scripts/ingest/build_variant_groups.cjs
```
Cable variant groups (70 groups with identical names) will populate fitment labels once PU fitment is in `catalog_fitment_v2`.

### 5. Typesense reindex (HIGH — after all above)
```bash
node scripts/ingest/index_unified.js --recreate
```

### 6. WPS fitment files (BLOCKED — external)
Still pending from rep since April 30. Follow up again.

### 7. Verify filter end-to-end on mobile (LOW)
Test `subcategory` + `modelCodes` params flow correctly through the API with the new bottom sheet UX.

---

## KEY FILES CHANGED THIS SESSION

| File | Location | Change |
|------|----------|--------|
| ProductDetailClient.jsx | app/browse/[slug]/ | Full redesign — sticky gallery, tighter layout, fitment year dedup |
| VariantSelector.jsx | components/browse/ | Fixed data scope bug, navigation loading state, current-item UX |
| BottomNav.tsx | components/ | Hamburger on /browse fires filter toggle event |
| page.jsx | app/browse/ | Mobile-first restructure, event listener, floating pill, bottom sheet |
| FilterSidebar.jsx | components/browse/ | mobileSheet prop, bottom sheet mode, FilterContent extracted |
| promote_pu_fitment.cjs | scripts/ingest/ | New — promotes pu_fitment_expanded → catalog_fitment_v2 |
| ingest_vtwin_fitment.cjs | scripts/ingest/ | New — vtwin_oem_crossref → catalog_fitment_v2, dual strategy |

---

## DB STATE

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 total / 90,276 active | ✅ Rebuilt May 20 |
| — WPS | 22,278 | ✅ wps_product_id + wps_item_id populated |
| — PU | 36,684 | ✅ Enriched |
| — VTWIN | 37,749 | ✅ Categories cleaned |
| Typesense | 90,276 docs | ✅ era columns live |
| catalog_fitment_v2 | ~1.54M | ⚠️ PU + VTWIN promotes pending |
| catalog_oem_crossref | ~14,819 | ✅ |
| catalog_media | 32,718 | ✅ |
| vendor_offers | 22,278 | ✅ |
| pu_fitment | 13,913 | ✅ |
| pu_fitment_parsed | 393,202 | ✅ |
| pu_fitment_expanded | 1,640,065 | ✅ Ready to promote |
| catalog_variant_groups | 2,887 | ✅ |
| catalog_variant_members | 19,464 | ✅ |
| wps_catalog | 22,278 | ✅ + wps_product_id, wps_item_id |
| harley_models | 299 | ✅ |
| harley_model_years | ~2,230 | ✅ |
| harley_families | 17 | DO NOT MODIFY |
| era_* columns on catalog_unified | ✅ Backfilled May 20 | Re-run after fitment promotes |
| vtwin_oem_crossref | 12,278 | ⚠️ Promote script ready, not yet run |
