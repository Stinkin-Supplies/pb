# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: Catalog Rebuild + PU Fitment Scrape + UI Overhaul · May 20, 2026**

---

## WHERE WE ARE

### What Was Built/Fixed This Session

#### 1. vendor_offers Rebuilt ✅
New script `scripts/ingest/populate_wps_vendor_offers.cjs` sources from `wps_catalog` directly.
- 22,278 rows inserted, all priced, 15,921 in stock, 1.35M total units across warehouses
- FK correctly points to `catalog_unified(id)`
- Join key: `catalog_unified.vendor_sku = wps_catalog.sku` (not `catalog_unified.sku`)
- `harddrive_catalog` boolean comparison quirk — use `IS NOT FALSE` not `= true`

#### 2. catalog_unified Rebuilt ✅
New canonical script `scripts/ingest/merge_catalog_unified.js` (replaces `merge_vendors.js`).
- Sources WPS from `wps_catalog` directly (old script used `catalog_products`)
- WPS SKUs prefixed `WPS-`, `vendor_sku` stores original WPS sku for joins
- VTwin SKUs prefixed `VT-`
- 96,711 total rows: PU 36,684 + WPS 22,278 + VTwin 37,749
- All 3 vendors: 0 errors

#### 3. VTwin Categories Assigned ✅
`infer_vtwin_categories.mjs --live` — 37,749 rows, 100% match, 0 unmatched.

#### 4. Typesense Reindex ✅
90,276 active docs indexed, 0 errors.
- Active filter: `is_active:true && (drag_part:true || in_oldbook:true || in_fatbook:true || in_harddrive:true)`
- Increase from 88,234 explained by PU enrichment marking more rows active

#### 5. vendor_offers Re-run After Rebuild ✅
Re-ran after catalog_unified rebuild to refresh PKs. 22,278 rows, clean.

#### 6. PU Fitment Scrape Ingest — NEW SCRIPT ✅
Built `scripts/ingest/ingest_pu_fitment_scrape.cjs`.
- Source: `/Users/home/Desktop/ds-fitment-scraper/catalog_fitment_enriched.csv`
- 13,913 SKUs with fitment parsed (of 19,559 total, 71% hit rate)
- Inserts into: `pu_fitment`, `pu_fitment_parsed`, `pu_fitment_expanded`
- Also extracts HD OEM numbers → `catalog_oem_crossref`
- OEM formats: `XXXXX-XX[A]` (dashed) + 7-digit pure numeric (legacy)
- Self-reference filter: strips OEM entries that are just the SKU's own digits
- **Still running** — `pu_fitment_expanded` 1.67M rows, individual inserts ~12+ hrs

Parsing logic:
- Splits fitment string on `;`
- Strips `\t-\t-` tab artifacts
- Regex scans all words for HD model code pattern (`FL*`, `FX*`, `XL*`, etc.)
- Handles both "CODE Name" and "Name CODE" formats

#### 7. BrandRolodex Fix ✅
- Fixed `position: "fixed"` → `"relative"` bug that broke grid display
- Tile height reduced 150 → 100
- Logo sizing: `maxWidth: "70%"`, `maxHeight: 56`, centered via flexbox
- Logos now properly centered vertically

#### 8. OEM Badge on Product Cards ✅
Added OEM ribbon badge to `app/browse/page.jsx` product cards.
- Shows gold ribbon SVG when `product.oem_numbers?.length > 0`
- Falls back to "HD Fit" badge when fitment exists but no OEM numbers
- Ribbon positioned `top: 8, left: 0` flush to card edge

#### 9. ProductDetailClient.jsx — Full Rewrite ✅
`app/browse/[slug]/ProductDetailClient.jsx` completely overhauled:
- **Theme**: cream/gold/white (dark theme retired)
- **Gallery**: vertical scroll stack with scroll-snap, dot nav on right, thumbnail strip
- **Cart**: placeholder button (cart context was dead — `catalog_variants` doesn't exist)
- **Tabs**: Description, Features, Fitment, OEM, Specs
- **Fitment tab**: shows fitment table + OEM numbers stacked below
- **Modal**: bottom sheet on related card click — full product detail, tabs, placeholder cart
- **Mobile**: single column, related grid 2 columns, gallery full width

#### 10. FilterSidebar — New Component ✅
Extracted to `components/browse/FilterSidebar.jsx` (standalone, easy to update).
- Collapsible animated sidebar: 220px ↔ 48px icon-only
- Gold chevron toggle at bottom
- Sections: Model Family (open by default), Era, Category, Subcategory, Brand, Price
- **Model Family**: 15 HD families with curated sub-model drill-down
  - Touring → Road King, Road Glide, Street Glide, Electra Glide, Ultra Classic, Tour Glide
  - Softail → Fat Boy, Heritage, Springer, Slim, Deluxe, Breakout, Night Train, Deuce, etc.
  - Dyna → Fat Bob, Wide Glide, Super Glide, Low Rider, Street Bob, Switchback, etc.
  - Sportster → Iron 883, 1200 Custom, Forty-Eight, K/KH Models, XR Models, etc.
  - FXR → Super Glide II, Low Rider, Sport Glide, Convertible
- **Era**: 10 eras with year ranges (data pending — era_* columns not yet backfilled)
- **Subcategory**: auto-appears when category selected, sourced from facets
- Mobile: FAB filter button, drawer slides in from left, backdrop tap to close

#### 11. browse.ts + API Route Updated ✅
- Added `subcategory` filter + facet query to `lib/db/browse.ts`
- Added `modelCodes[]` array support for sub-model filtering
- Updated `app/api/browse/products/route.ts` to pass `subcategory`, `modelCodes`

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. pu_fitment_expanded — FINISH RUNNING
Still inserting ~1.67M rows. After completion:
```bash
# Verify counts
psql ... -c "SELECT COUNT(*) FROM pu_fitment_expanded;"
# Then reindex Typesense to pick up new OEM data
node scripts/ingest/index_unified.js --recreate
```

### 2. Promote pu_fitment → catalog_fitment_v2
After expanded insert finishes, need to join pu_fitment back to catalog_unified and insert fitment rows. Script TBD.

### 3. Backfill era_* columns on catalog_unified
All era_* columns are 0 — era filter in sidebar won't work until backfilled. Run era population script after pu_fitment_expanded finishes.

### 4. VTwin Fitment Pipeline
`vtwin_oem_crossref` (12,278 pairs) → `catalog_fitment_v2`. Script TBD.

### 5. WPS Fitment Files
Pending from rep since April 30 — follow up.

### 6. browse/page.jsx API Wiring Check
Confirm `subcategory` and `modelCodes` params are flowing through correctly end-to-end.

---

## KEY FILES CHANGED THIS SESSION

| File | Location | Change |
|------|----------|--------|
| populate_wps_vendor_offers.cjs | scripts/ingest/ | New — sources from wps_catalog |
| merge_catalog_unified.js | scripts/ingest/ | New canonical rebuild script |
| ingest_pu_fitment_scrape.cjs | scripts/ingest/ | New — parses fitment CSV, inserts pu_fitment* + OEM |
| FilterSidebar.jsx | components/browse/ | New standalone component |
| browse/page.jsx | app/browse/ | OEM badge, sidebar import, model/era/subcategory filters |
| browse.ts | lib/db/ | subcategory facet, modelCodes[] array support |
| route.ts | app/api/browse/products/ | subcategory + modelCodes passthrough |
| ProductDetailClient.jsx | app/browse/[slug]/ | Full rewrite — cream/gold theme, vertical gallery, modal |
| BrandRolodex.tsx | components/home/ | Fixed position bug, height reduced, logos centered |

---

## DB STATE

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 total / 90,276 active | ✅ Rebuilt May 20 from wps_catalog |
| — WPS | 22,278 | ✅ Sourced from wps_catalog |
| — PU | 36,684 | ✅ Enriched |
| — VTWIN | 37,749 | ✅ |
| Typesense | 90,276 docs | ✅ Current |
| catalog_fitment_v2 | ~1.54M | Stable — pu_fitment not yet promoted |
| catalog_oem_crossref | ~10,953 + new OEM | ⚠️ pu_scrape OEM rows being inserted |
| catalog_media | 32,718 | ✅ FK → catalog_unified |
| vendor_offers | 22,278 | ✅ Rebuilt May 20 |
| pu_fitment | 13,913 | ✅ Inserted May 20 |
| pu_fitment_parsed | 393,202 | ✅ Inserted May 20 |
| pu_fitment_expanded | ~1.07M (still running) | ⚠️ Insert in progress — do not touch DB |
| harley_models | 299 | ✅ |
| harley_model_years | ~2,230 | ✅ |
| harley_families | 17 | DO NOT MODIFY |
| era_* columns on catalog_unified | all 0 | ⚠️ Needs backfill after expanded insert finishes |
