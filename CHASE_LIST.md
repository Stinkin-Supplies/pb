# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 24, 2026 — Fifty-Seventh Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | **Payment gateway decision** | Authorize.net / NMI / Braintree / Heartland. ⚠️ BLOCKING — pending merchant account meeting. Only blocker for checkout going live. Recommendation: Braintree (no monthly fee, best API, direct signup). |
| 2 | **PU image-proxy: persistent cache** | `app/api/image-proxy/route.ts` has zero server-side caching — every unique zip re-downloaded from LeMans on first request. Needs Vercel Blob/S3/R2-backed cache before carrying full browse-grid traffic for 31K+ products. |
| 3 | **PU image-proxy: confirm browse grid visually** | PDP confirmed working. `ProductCard.jsx` got the fix but browse grid was not visually re-confirmed. Quick spot check. |
| 4 | **Wire `<CartProvider>` into root layout** | `lib/cart/CartContext.jsx` ready — wrap `app/layout.tsx`, then `useCart()` everywhere. |
| 5 | **Build cart drawer UI** | Uses `useCart()` — items, addItem, removeItem, updateQty, subtotal. |
| 6 | **Build checkout page UI** | Address form + order summary + payment form → `/api/checkout/prepare` then `/api/orders/create`. |
| 7 | **Wire real PU + WPS API credentials** | `lib/fulfillment/triggerFulfillment.ts` — need `PU_API_URL/KEY`, `WPS_API_URL/KEY` env vars. |
| 8 | **Shipping + tax calculation** | Both `$0` placeholders in `app/api/checkout/prepare/route.ts` and `app/api/orders/create/route.ts`. |
| 9 | **Review oem_supersession confidence=1 rows** | `SELECT * FROM oem_supersession_review LIMIT 30;` — 283 pairs pending, untouched. Bulk-promote reliable ones, reject false positives. |
| 10 | **Confirm Softail + Suspension + Triple Trees & Stems filter fix** | Still untested since session 51 — retest this exact combo returns 131 results, not 0. |
| 11 | **Verify PU vendor SKUs in portal** | Run `09344715`, `09251068`, `10101765`, `DS196011` through PU's ordering portal to confirm migration 010 fixed the ordering pipeline. |
| 12 | **Variant candidates — 62 remaining** | `/admin/variant-candidates?token=...` — finish/size/length groups. Need human judgment. |
| 13 | **Find the unknown match-generation pipeline** | Proposals with `match_reason = 'upc'` or `'brand_part_number'` and null `shared_oem_number` — source script never identified. |
| 14 | **Drop remaining session 43 files** | globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts |
| 15 | **Add ADMIN_SECRET to Vercel** | `npx vercel env add ADMIN_SECRET` |
| 16 | **Fix Framer Motion transparent errors** | `FRAMER_TRANSPARENT_FIX.md` — palette rgba() replacements, not yet applied. |
| 17 | **Add remaining model images** | 9 images at `public/images/models/{slug}.jpg` (400×160px). |
| 18 | **TC/M8 platform dedup in variant groups** | WPS `wps_product_id` groups can mix Twin Cam and Milwaukee-8 platform variants. Need platform-aware split in `build_variant_groups.cjs`. |
| 19 | **Backfill vendor_offers from product_vendors** | PU and VTwin cost/stock needs to flow into `vendor_offers` (currently only 22,278 WPS rows). Optimizer reads `product_vendors` as workaround. |
| 20 | **VTwin OEM scrape expansion** | ~21,000 VTwin products still have zero OEM crossref. Web scraper captured OEM numbers for 7,277 products in `vtwin_scrape_data.oem_no` — import those, then consider targeted re-scrape. |
| 21 | **WPS OEM crossref — 662 unmatched rows** | 662 WPS crossref entries have no matching active product. 81 exist as inactive. Revisit after next WPS ingest. |
| 22 | **Fix VTwin attributes in `build_product_details.mjs`** | VTwin `extra_attributes` from `pdp_payload` is being stored as a stringified JSON string instead of a parsed object. Add `JSON.parse()` before writing to `product_details.attributes`. Workaround in `ProductDetailsSection` active in the meantime. |

## Files to Drop In — Session 43 (still pending)

| File | Destination |
|---|---|
| globals.css | app/globals.css |
| layout.tsx | app/layout.tsx |
| BespokeSerif-Variable.ttf | public/fonts/ |
| FilterSidebar.jsx | components/browse/ |
| ProductQuickViewModal.jsx | components/browse/ |
| BrowseBackButton.jsx | components/pdp/ |
| products-slug-route.ts | app/api/products/[slug]/route.ts |

## ✅ DONE JUNE 24 — FIFTY-SEVENTH PASS

| Area | What Was Done |
|---|---|
| **`infer_vtwin_categories.mjs` — updated + run** | Added `VTWIN_CATEGORY_TO_DISPLAY` map (28 VTwin source categories → 21 display values). Live UPDATE now sets both `category` and `display_category` in one pass. Run: 566 products, 100% match, 0 unmatched. |
| **`generate_vtwin_skus.js` — full rewrite** | Removed all `vendor.*` schema references (`vendor.vtwin_sku_staging`, `vendor.vtwinmtc_products`, `vendor.vtwin_category_pages`). Now reads from `catalog_unified WHERE source_vendor='VTWIN' AND internal_sku IS NULL`, maps `display_category` → SKU prefix, allocates from `sku_counter`, writes `internal_sku` directly with `.v` suffix. Dry-run default, `--apply` flag. |
| **Browse `?category=` filter stuck bug** | `page.jsx`: filter init now folds `?category=X` into `display_category` (backward compat for old navigation links). Removed `category`/`subcategory` from API params, URL builder, and clear-all. `FilterSidebar.jsx`: chips and clearAll already correct. Breadcrumb link on PDP also fixed (`?category=` → `?display_category=`). |
| **OEM number search** | `browse.ts` ILIKE fallback extended: each word now also searches `unnest(cu.oem_numbers)`. Query `16779-99` went from 1 result → 3 results. |
| **VTwin image gallery — `ProductImageGallery.jsx`** | New client component. Builds image list from `image_url` + `image_urls` array, deduplicates. Single image → renders exactly as before. Multiple images → 1:1 hero + 64px thumbnail strip, gold border on active, per-image error handling, horizontally scrollable. `getProduct()` SQL updated: `cu.image_urls` added to SELECT; `catalog_media` lateral now fetches all images as array (`all_urls`) alongside primary. PU products read from `catalog_media.all_urls`; VTwin reads from `cu.image_urls`. |
| **PDP layout fix** | `ProductDetailsSection` moved above `DataTabs` (was below). `OemAlternativesPanel` removed entirely (import, parallel fetch, render). `getOemAlternatives()` still in file but no longer called. |
| **VTwin attributes JSON parse fix** | `ProductDetailsSection` in `page.jsx`: `attributes` field now parsed with `JSON.parse()` if stored as a string (VTwin `extra_attributes` write bug). Proper fix in `build_product_details.mjs` is #22 on chase list. |
| **`extract_pu_images.mjs` — new** | Parses all 133 XML files in `scripts/data/pu_pricefile/brand_files/`. Two schemas handled: PIES (`<DigitalAssets><DigitalFileInformation><URI>`) + Catalog_Content (`<partImage>` compound URL → base64 decode → split by comma → re-encode each path). SKU matching normalized to no-dash format on both sides. Results: **22,253 PU products** with multi-image; **33,740 catalog_media rows** inserted; **8,828 PU descriptions** added to `product_details`; **15,330 OEM crossref entries** (source=`PU_PIES`). |
| **Typesense reindex** | 89,153 docs, 0 errors. |

## ✅ DONE JUNE 23 — FIFTY-SIXTH PASS

| Area | What Was Done |
|---|---|
| **`build_pack_size_groups.mjs` — sync + dedup** | `dedupByPackQty()` added (PU wins ties). Sync/evict on re-run. Fixed canonical query dropping `variant_group_id IS NULL` filter. `canonical:91278` fixed. 148 total MULTI groups. |
| **`scan_pack_qty_from_names.mjs` — new** | 12 auto-apply patterns + 3 review-only. 254 corrections applied. pack_qty>1 products: 1,917→2,171. |
| **`product_details JSONB` column — new** | `build_product_details.mjs` normalizes PU features + WPS HTML→bullets + VTwin description/pdp_payload. 59,765/89,153 = 67% coverage. GIN index. |
| **`index_unified.js` updated** | Uses `product_details` as primary source — WPS HTML now stripped from Typesense. |
| **PDP — ProductDetailsSection** | Description, feature bullets, tech note callout, attributes grid. |
| **PDP — OemAlternativesPanel** | Client component, expandable rows with thumbnail + overlay. (Removed session 57.) |
| **VTwin catalog refresh** | `import_vtwin_catalog.js` + `ingest_vtwin_unified.js` fixed. 38,160 products loaded, 411 new. 566 new SKUs assigned manually (MSC999973–1000538). |
| **VTwin OEM crossref 8,426→16,752** | `vtwin_catalog.oem_numbers` imported. |
| **VTwin scrape data synced** | 87 descriptions + 3,165 pdp_payload entries. |
| **`sku_counter` table created** | Seeded from existing MSC max values. |
| **Typesense reindex** | 89,153 docs, 0 errors. |

## ✅ DONE JUNE 22–23 — FIFTY-FIFTH PASS

Credential rotation. Canonical merges fully drained (2,407 applied). WPS pack_qty 1,070 corrected. `build_pack_size_groups.mjs` new. 145 pack-size variant groups. WPS OEM crossref 1,665 entries. VTwin OEM crossref 8,426 entries. 4× Typesense reindexes.

## ✅ DONE JUNE 22 — FIFTY-FOURTH PASS

Fulfillment pipeline (`optimizer.ts`, `triggerFulfillment.ts`, `checkout/prepare`, `orders/create`). `build_variant_groups.cjs` non-distinguishing axis fix. 994 false groups dissolved. Variant rebuild + reindex.

## ✅ DONE JUNE 16 — PASSES 51–52
browse.ts structural params fix. Canonical revert+rebuild. Phase B mismatch filter. Image proxy wired. OEM badge on PDP.

## ✅ DONE JUNE 15 — FIFTIETH PASS
Browse OEM chain. ProductCard.jsx extracted. InlinePanel.jsx. Panel API route. Variant rebuild.

## ✅ DONE JUNE 14 — FORTY-NINTH PASS
OEM supersession system. mv_oem_fitment_coverage. Variant Fits axis removed. Axis normalization.

## ✅ DONE JUNE 12–13 — FORTY-EIGHTH PASS
PU vendor_sku fix. is_kit + pack_qty columns. Canonical match review workbench.

## ✅ DONE JUNE 11–12 — FORTY-SEVENTH PASS
Fulfillment architecture tables. Canonical pipeline Phase A+B. CartContext.

## ✅ DONE JUNE 5–8 — PASSES 41–46
display_subcategory taxonomy. VTwin round-2 scrape. CategoryBentoGrid + ModelFinder. Font system. FlowingMenu.

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing live | PU + WPS API credentials needed |
| WPS API enrichment | Test features+blocks hit rate |
| Browse/Brand tabs | Data ready, UI unbuilt |
| flathead.webp | Missing from public/images/eras/ |
| Hard Drive book crossref | Import when file available |
| Harden admin auth | Replace ?token= with session cookie |
| /models in nav | Add to main nav + home page tile |
| Reindex automation | Wire as post-step in ingest scripts |
| Accessories & Misc subcategory | 3,809 NULL — catch-all by design |
| Tools & Chemicals coverage | 547 NULL — WPS abbreviations; low ROI |
| oem_supersession PDP timeline | Show chain on OEM tab: "replaced X in [year]" |
| Auto-reject variant proposals on apply | When canonical merges applied, auto-reject proposals where both share same variant_group_id |
| PU product_details remaining gap | ~3,500 products — brands that never shipped XML content at all; only fixable by requesting updated files from PU |
| VTwin product_details gap (23K+) | No description/pdp_payload — vtwinmfg.com scrape is the only self-serve path |
| Re-run `extract_pu_images.mjs` | After each new PU XML drop — picks up new images, descriptions, OSP crossref numbers idempotently |
