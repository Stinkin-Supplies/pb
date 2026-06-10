# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 8, 2026 — Forty-Fifth Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Drop in session 44 + 43 component files | See files table below |
| 2 | Run mat view refresh | `psql $CATALOG_DATABASE_URL -c 'REFRESH MATERIALIZED VIEW mv_family_product_ranges;'` |
| 3 | Run universal mark (round 2 scrape) | `psql $CATALOG_DATABASE_URL -c "UPDATE catalog_unified cu SET is_universal = true FROM vtwin_scrape_data vsd WHERE cu.source_vendor = 'VTWIN' AND (cu.sku = 'VT-' || vsd.sku OR cu.sku = vsd.sku) AND vsd.fitment_raw IN ('All models', 'All', 'Custom application') AND cu.is_universal = false;"` |
| 4 | Add FLHRX + FLI to harley_models | FLHRX = Road Glide Custom, FLI = Road Glide Limited. Both skipped by importer. |
| 5 | Add ADMIN_SECRET to Vercel | `npx vercel env add ADMIN_SECRET` |
| 6 | Fix Framer Motion transparent errors | Replace `transparent` with `rgba(0,0,0,0)` anywhere background animates. May be in computed values not literal strings — check framer-motion variant objects. |
| 7 | Browse query performance Engine + Dyna | 3.5–7.6s. EXPLAIN shows index hit but fitment JOIN on 14K+ rows is culprit. Check catalog_fitment_v2 indexes — may need composite index on (product_id, model_year_id). |
| 8 | Wire CategoryBentoGrid image backgrounds | When images ready: add `images` prop to CategoryBentoGrid in ModelCatalogClient. Files at `public/images/categories/{area}.jpg` |
| 9 | Wire ProductQuickViewModal into browse page | Add `quickView` state, `setQuickView(product)` on card click, render modal |
| 10 | Wire BrowseBackButton into PDP | `import BrowseBackButton from "@/components/pdp/BrowseBackButton"` near top of PDP layout |
| 11 | Add remaining model images | 9 images: softail, dyna, sportster, fxr, shovelhead, vintage, trike, v-rod, street. 400×160px at `public/images/models/{slug}.jpg` |
| 12 | Verify null slug on /browse | Hard refresh — VTwin cards should route to real PDPs, not /browse/null |
| 13 | Bulk-fix flagged products | `GET /api/admin/products/1?token=YOUR_SECRET` returns all unresolved flags |

## Files to Drop In — Sessions 43 + 44

| File | Destination | Session |
|------|-------------|---------|
| CategoryBentoGrid.jsx | components/models/CategoryBentoGrid.jsx (new) | 44 |
| ModelCatalogClient.jsx | app/models/[family]/ModelCatalogClient.jsx (replace) | 44 |
| globals.css | app/globals.css | 43 |
| layout.tsx | app/layout.tsx | 43 |
| BespokeSerif-Variable.ttf | public/fonts/BespokeSerif-Variable.ttf (replace Regular) | 43 |
| FilterSidebar.jsx | components/browse/FilterSidebar.jsx | 43 |
| ProductQuickViewModal.jsx | components/browse/ProductQuickViewModal.jsx | 43 |
| BrowseBackButton.jsx | components/pdp/BrowseBackButton.jsx | 43 |
| ModelFinder.jsx | components/home/ModelFinder.jsx | 43 |
| products-slug-route.ts | app/api/products/[slug]/route.ts (new) | 43 |
| import_vtwin_fitment_partial.mjs | scripts/ingest/import_vtwin_fitment_partial.mjs | 43 |

## ✅ DONE JUNE 8 — FORTY-FIFTH PASS

| Area | What Was Done |
|------|---------------|
| display_subcategory — Handlebar & Controls | 9 subcategories. Key: WPS "LW CABLE" and "BURLY CNTRL KIT" patterns. ~5% NULL. |
| display_subcategory — Brakes | 8 subcategories. Brake Hardware new subcategory (pedals, levers). Moves: PU Misc Electrical → Electrical, air cleaner backing plates → Carburetion & Fuel. ~6% NULL. |
| display_subcategory — Suspension | 8 subcategories. Moves: valve spring kits → Engine, spring fork fenders → Fenders & Body, spotlamps → Lighting. ~12% NULL. |
| display_subcategory — Lighting | 8 subcategories. Key: `%spotlamp%` → Auxiliary. License plate frames/holders caught. ~5% NULL. |
| display_subcategory — Wheels & Tires | 7 subcategories. Key: `%spoke set%` and `% spoke %` needed (not `%wheel spoke%`). WPS FR/RR prefix = complete wheels. ~8% NULL. |
| display_subcategory — Foot Controls | 9 subcategories. Kickstands new subcategory. Moves: Wyatt Gatling exhaust → Exhaust, luggage rack → Luggage, solo seat → Seating. ~7% NULL. |
| display_subcategory — Exhaust | 4 subcategories. Moves: exhaust valves → Engine, brake crossover → Brakes, grip sets → Handlebar. ~7% NULL. |
| display_subcategory — Frame & Hardware | 5 subcategories. Moves: PU Misc Engine Parts → Engine, shifter shaft → Transmission. ~13% NULL. |
| display_subcategory — Seating | 4 subcategories. ~5% NULL. |
| display_subcategory — Luggage & Racks | 5 subcategories. ~7% NULL. |
| display_subcategory — Instrumentation | 3 subcategories. 96.5% mapped — best coverage of all categories. |
| display_subcategory — Security & Covers | 3 subcategories. ~8% NULL. |
| display_subcategory — Tools & Chemicals | 3 subcategories. Moves: transmission gear kit, electrical items, bike covers out. 71% mapped — WPS abbreviations limit coverage. |
| display_subcategory — Riding Gear & Apparel | 6 subcategories. Moves: switchblade lowers, side plates → Fenders & Body; phone mounts → Accessories; handguards → Handlebar. 65% mapped — excluded from bento grid. |
| display_subcategory — Accessories & Misc | 5 subcategories. 1,274 misclassified products moved to correct categories (primary covers, axles, motor mounts, valve kits, brake sensors, etc.). 6% mapped — intentional catch-all. |
| Typesense reindex | Final reindex with full subcategory data. All 20 categories now have display_subcategory facets live. |

## ✅ DONE JUNE 8 — FORTY-FOURTH PASS

CategoryBentoGrid + ModelCatalogClient rebuilt. VTwin scraper round 2 imported (48% coverage). Engine/Electrical/Carburetion & Fuel/Fenders & Body/Transmission & Clutch subcategories mapped. VACUUM ANALYZE. placeholder.jpg.

## ✅ DONE JUNE 7 — FORTY-THIRD PASS

Font system. FilterSidebar search. ProductQuickViewModal. BrowseBackButton. API route. catalog_oem_crossref schema. VTwin round 2 scraper.

## ✅ DONE JUNE 5 — FORTY-SECOND PASS

Filtering audit + all critical fixes. browse.ts. FilterSidebar. 12 model codes. Reindex 90,536.

## ✅ DONE JUNE 5 — FORTY-FIRST PASS

Homepage + ModelFinder. Font system locked. VariantSelector Mode A. 199 sub-groups merged.

## ✅ DONE JUNE 4 — FORTIETH PASS

VTwin SKU duplicates. import_vtwin_fitment_partial.mjs ×4. 185,234 fitment rows.

## ✅ DONE JUNE 4 — THIRTY-NINTH/EIGHTH PASS

Fitment filter. OEM. Admin inline edit. catalog_review_flags. Next.js 15 params.

## ✅ DONE JUNE 3 — THIRTY-SEVENTH PASS

FlowingMenu. /models. mv_family_product_ranges mat view. Font system.

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing | cross_vendor_products table + resolve_cart_fulfillment() + cart integration |
| Cart wiring | CartContext/addItem is placeholder only |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| Browse/Brand tabs | Data ready, UI unbuilt |
| flathead.webp | Missing from public/images/eras/ |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| PU multi-image | image_zip column has multiple angles — not yet fetched |
| Hard Drive book crossref | Same pattern as FatBook/OldBook — import when file available |
| Admin flag batch resolver | Script to read catalog_review_flags WHERE resolved = false |
| Harden admin auth | Replace ?token= URL param with session cookie |
| Size variant grouping | Valve guides, rocker shims, helmet pads, cam lock washers, mainshaft races |
| /models in nav | Add Models link to main nav + home page Shop by Model tile |
| Mobile layout pass on /models | FlowingMenu rows too tall on mobile |
| Reindex automation | Wire npm run reindex as post-step in ingest scripts |
| Typesense schema documentation | Create scripts/ingest/TYPESENSE_SCHEMA.md |
| SKU display on PDP | Show clean internal_sku — defer until taxonomy finalized (now finalized) |
| display_subcategory master script | Consolidate all mapping scripts into scripts/ingest/map_display_subcategory.sql |
| Accessories & Misc subcategory improvement | 3,809 NULL — VTwin catch-all products; low ROI |
| Tools & Chemicals coverage | 547 NULL — WPS specialty abbreviations; low ROI |
