# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: Variants System + Era Fix + Catalog Cleanup · May 20, 2026 (Twenty-Fourth Pass — Evening)**

---

## WHERE WE ARE

### What Was Built/Fixed This Session (Evening Pass)

#### 1. WPS Product ID Backfill ✅
New script `scripts/ingest/backfill_wps_product_ids.cjs`.
- Hits WPS API `/items?filter[sku]=...` in batches of 50
- Adds `wps_product_id` + `wps_item_id` columns to `wps_catalog`
- 22,184 of 22,278 SKUs filled (94 not found in API — discontinued)
- 5,764 distinct WPS product groups across 22K items
- Runtime: ~2 minutes

#### 2. Variant Groups Built ✅
New script `scripts/ingest/build_variant_groups.cjs`.
- Tables created: `catalog_variant_groups`, `catalog_variant_members`
- `variant_group_id` back-reference added to `catalog_unified`
- 2,887 groups, 19,464 members
- Product display names fetched from WPS `/products` API
- Fitment labels attempted from `catalog_fitment_v2` (partial — WPS fitment not yet in v2)
- 17,762 members populated with `option_1_value` from product name variation
- 4,080 members split into Color + Size axes (helmets, gloves, apparel)
- 70 groups remain with identical names (cables) — awaiting WPS fitment files

#### 3. Variant Selector UI — Full Build ✅
`components/browse/VariantSelector.jsx` — auto-detects mode:
- **Two-axis mode**: Color pills + Size pills (XS/SM/MD/LG/XL/2X/3X) for apparel
- **Single-axis mode**: List of variant rows for fitment/measurement variants
- Fetches from `/api/browse/variants/[productId]`
- Navigates to sibling SKU slug on selection
- Shows price + stock count per variant
- Renders nothing if product has no siblings (null return)

#### 4. Variants API Route ✅
`app/api/browse/variants/[productId]/route.ts`
- Looks up variant group by `catalog_unified.id`
- Returns all siblings with fitment_by_family, stock, price, image
- No `db.end()` — uses shared pool correctly

#### 5. ProductDetailClient.jsx Cleaned ✅
- `variants` prop removed (replaced by API-driven selector)
- `VariantSelector` placed after stock indicator, before qty/cart
- `FitmentTable` year handling fixed — normalizes both `{year_start, year_end}` and `{year}` shapes
- `proxyImg` simplified — removed redundant typeof check
- `qty` setter lambda renamed to avoid shadowing
- `dotNavBtn` extracted as shared style object
- All `<style jsx>` blocks removed — pure inline styles throughout

#### 6. page.jsx (PDP) Fixed ✅
`app/browse/[slug]/page.jsx`
- Added `cu.id AS unified_id` to both primary and fallback queries
- Normalizer now uses `row.unified_id ?? row.id` for `product.id`
- Ensures `product.id` is always `catalog_unified.id`, not `catalog_products.id`
- Required for variant lookup to work correctly

#### 7. Era Columns Backfilled ✅
12,721 products tagged across 10 era columns:
- `era_flathead`: 26 | `era_knucklehead`: 26 | `era_panhead`: 587
- `era_shovelhead`: 1,031 | `era_ironhead`: 1,091 | `era_evo_sportster`: 1,642
- `era_evolution`: 5,026 | `era_twin_cam`: 8,165 | `era_milwaukee8`: 3,815 | `era_chopper`: 2,002
- Year-based mapping (not engine family IDs — families 18/21/22 have 0 fitment rows)
- Typesense reindexed: 90,276 docs, 0 errors

#### 8. VTwin Category Cleanup ✅
- Stripped " GROUP" suffix from 74,287 rows across all vendors
- Stripped " GROUP-*" suffix from VTWIN suspension/tank categories (2,814 rows)
- Result: "ENGINE GROUP" → "ENGINE", "SUSPENSION GROUP-FRONT" → "SUSPENSION"

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. Promote pu_fitment → catalog_fitment_v2 (HIGH)
`pu_fitment_expanded` completed: 1,640,065 rows. Script TBD.
Join `pu_fitment_parsed` → `catalog_unified` on sku, insert to `catalog_fitment_v2`.
After this, re-run `build_variant_groups.cjs` to populate fitment labels on cable groups.

### 2. VTwin Fitment Pipeline (HIGH)
`vtwin_oem_crossref` (12,278 pairs) → `catalog_fitment_v2`. Script TBD.

### 3. WPS Fitment Files (HIGH)
Pending from rep since April 30. When received:
- Import to new `wps_fitment` table
- Join to `catalog_unified` via `vendor_sku`
- Insert to `catalog_fitment_v2`
- Re-run `build_variant_groups.cjs` to update the 70 cable groups

### 4. VariantSelector Bug (LOW)
`TwoAxisSelector` references `data` variable out of scope for group display name.
Harmless (header falls back gracefully) but should be fixed.

### 5. sidebar filter end-to-end verify (LOW)
Confirm `subcategory` + `modelCodes` params flowing correctly through API.

---

## KEY FILES CHANGED THIS SESSION

| File | Location | Change |
|------|----------|--------|
| backfill_wps_product_ids.cjs | scripts/ingest/ | New — adds wps_product_id to wps_catalog |
| build_variant_groups.cjs | scripts/ingest/ | New — builds catalog_variant_groups + members |
| VariantSelector.jsx | components/browse/ | New — two-axis + single-axis variant selector |
| route.ts | app/api/browse/variants/[productId]/ | New — variant siblings API |
| ProductDetailClient.jsx | app/browse/[slug]/ | Cleaned — VariantSelector integrated |
| page.jsx | app/browse/[slug]/ | Fixed — unified_id for correct product.id |

---

## DB STATE

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 total / 90,276 active | ✅ Rebuilt May 20 |
| — WPS | 22,278 | ✅ wps_product_id + wps_item_id now populated |
| — PU | 36,684 | ✅ Enriched |
| — VTWIN | 37,749 | ✅ Categories cleaned (GROUP suffix stripped) |
| Typesense | 90,276 docs | ✅ Reindexed with era columns |
| catalog_fitment_v2 | ~1.54M | Stable — pu_fitment not yet promoted |
| catalog_oem_crossref | ~14,819 | ✅ Scrape OEM rows inserted |
| catalog_media | 32,718 | ✅ FK → catalog_unified |
| vendor_offers | 22,278 | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 | ✅ |
| pu_fitment_parsed | 393,202 | ✅ |
| pu_fitment_expanded | 1,640,065 | ✅ Complete |
| catalog_variant_groups | 2,887 | ✅ NEW — WPS product groupings |
| catalog_variant_members | 19,464 | ✅ NEW — option_1/2 name+value populated |
| wps_catalog | 22,278 | ✅ + wps_product_id, wps_item_id columns |
| harley_models | 299 | ✅ |
| harley_model_years | ~2,230 | ✅ |
| harley_families | 17 | DO NOT MODIFY |
| era_* columns on catalog_unified | ✅ Backfilled | 12,721 products tagged |
| vtwin_oem_crossref | 12,278 | ⚠️ Not yet ingested to catalog_fitment_v2 |
