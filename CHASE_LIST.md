# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 7, 2026 — Forty-Third Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | VTwin scraper finish + import | Scraper running against `vtwin_scrape_targets_2.csv` (19,662 SKUs). When done: export checkpoint → `import_vtwin_fitment_partial.mjs` → universal mark → mat view refresh → reindex |
| 2 | Mark universals + mat view + reindex | Still pending from last import run: universal SQL + `REFRESH MATERIALIZED VIEW mv_family_product_ranges` + `node scripts/ingest/index_unified.js --recreate` |
| 3 | Add ADMIN_SECRET to Vercel | `npx vercel env add ADMIN_SECRET` — required for inline PDP edit in production |
| 4 | Add FLHRX to harley_models | Skipped in importer as unknown model code — Road Glide Custom, valid model |
| 5 | Drop in session 43 component files | See files list below — layout.tsx, globals.css, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, ModelFinder.jsx, BespokeSerif-Variable.ttf |
| 6 | Wire ProductQuickViewModal into browse page | Add `quickView` state, `setQuickView(product)` on card click, render modal |
| 7 | Wire BrowseBackButton into PDP | `import BrowseBackButton from "@/components/pdp/BrowseBackButton"` near top of PDP layout |
| 8 | Verify null slug on /browse | Hard refresh /browse — VTwin cards should route to real PDPs, not /browse/null |
| 9 | Add remaining model images | 9 images needed: softail, dyna, sportster, fxr, shovelhead, vintage, trike, v-rod, street. 400x160px at `public/images/models/{slug}.jpg` |
| 10 | Manual variant group review | Size variants: valve guides, rocker arm shims, helmet pads, cam lock washers, mainshaft races |
| 11 | Bulk-fix flagged products | `GET /api/admin/products/1?token=YOUR_SECRET` returns all unresolved flags |

## Session 43 — Files to Drop In

| File | Destination |
|------|-------------|
| globals.css | app/globals.css |
| layout.tsx | app/layout.tsx |
| BespokeSerif-Variable.ttf | public/fonts/BespokeSerif-Variable.ttf (replace Regular) |
| FilterSidebar.jsx | components/browse/FilterSidebar.jsx |
| ProductQuickViewModal.jsx | components/browse/ProductQuickViewModal.jsx |
| BrowseBackButton.jsx | components/pdp/BrowseBackButton.jsx |
| ModelFinder.jsx | components/home/ModelFinder.jsx |
| products-slug-route.ts | app/api/products/[slug]/route.ts (new file) |
| import_vtwin_fitment_partial.mjs | scripts/ingest/import_vtwin_fitment_partial.mjs |

## ✅ DONE JUNE 7 — FORTY-THIRD PASS

| Area | What Was Done |
|------|---------------|
| Font system — globals.css | Body font changed from Share Tech Mono → Barlow (via `--font-body`). `text-transform: uppercase` removed from body (was forcing all text to caps site-wide). Added `font-size: 15px`, `font-weight: 500`, `line-height: 1.55`. Added type scale CSS vars (`--text-2xs` through `--text-4xl`) and weight vars (`--fw-normal` through `--fw-bold`). Letter spacing switched to em-based. |
| Font system — layout.tsx | Barlow formally loaded via `next/font/google` (weights 400/500/600/700) as `--font-body`. Previously just a string reference — never actually loaded. `--font-barlow` legacy alias wired. |
| Font system — Bespoke Serif | Switched from static `BespokeSerif-Regular.ttf` (weight 400 only) to `BespokeSerif-Variable.ttf` (wght 300–800: Light/Regular/Medium/Bold/Extrabold). `weight: "300 800"` range in localFont. Static files can be deleted. |
| Typography — components | FilterSidebar + ProductQuickViewModal: all font sizes below 12px bumped (8/9→12, 10/11→13). MUTED color #888→#555 (contrast fix). Absolute px letter-spacing→em. #aaa/#bbb/#ccc grays darkened. |
| ModelFinder — title | KineticText `clamp(14px,1.8vw,20px)` → `clamp(36px,5vw,72px)`. Header layout restructured: label+step dots on top row, title full-width below with gold fading rule. |
| FilterSidebar — search | `useDebounce` hook added (320ms). Search input at top of FilterContent. `filters.search` wired to chips, activeCount, and all clear-all handlers. Calls `onChange({ search })` on debounce. |
| ProductQuickViewModal | Rebuilt with 3-tab interface: Details / Fitment / OEM. Details shows card data instantly, enriches from fetch. Fitment: alternating-stripe table grouped by family in canonical order (Touring→Softail→etc), model+code+year columns. OEM: copyable pill grid, "Copy All" button. Tab badges show counts. Fetches from `/api/products/[slug]`. |
| BrowseBackButton.jsx | New component. Reads `stinkin_browse_return` from sessionStorage (written by modal's "View Full Details"). Shows back button on PDP only when set. Clears key on navigate. |
| API route — products/[slug] | New `app/api/products/[slug]/route.ts` wrapping `getProductBySlug`. Powers ProductQuickViewModal fetch. |
| PDP SKU fix | `page.jsx` line 100: flipped `COALESCE(cp.internal_sku, cu.internal_sku)` → `COALESCE(cu.internal_sku, cp.internal_sku)` so taxonomy SKU wins over catalog_products SKU. |
| catalog_oem_crossref schema | Added `product_id` FK column. Backfilled 20,836 rows via `sku` join. Deduped 1,898 duplicate rows. Added unique index on `(sku, oem_number)`. Dropped NOT NULL on `oem_manufacturer`. |
| import_vtwin_fitment_partial.mjs | Major patch: OEM collection during dedup (skuToOem map). Removed `oem_numbers` from `catalog_unified` upsert. New step 9 writes OEM to `catalog_oem_crossref` (ON CONFLICT DO NOTHING) then rebuilds `oem_numbers[]` from crossref. Removed all delete-then-reinsert patterns — script now only fills gaps, never wipes. |
| VTwin fitment import | Ran against new checkpoint (12,100 SKUs): 3,513 fitment rows inserted, 868 OEM rows to crossref. Coverage: 45.7% (15,371 with fitment + 2,946 universal). |
| vtwin_scrape_targets_2.csv | Generated: 19,662 SKUs never scraped. Scraper restarted against this file. |
| OEM arrays rebuilt | `UPDATE 52,707` VTwin products rebuilding `oem_numbers[]` from crossref. |

## ✅ DONE JUNE 5 — FORTY-SECOND PASS

| Area | What Was Done |
|------|---------------|
| Filtering system audit | 4-layer audit (browse.ts, FilterSidebar, fitment data, Typesense). 5 critical + 7 gaps + 2 minor identified. filter_roadmap.md built. |
| browse.ts — is_universal fix | `OR cu.is_universal = true` added to modelCode, year, and family fallback conditions. Column is `is_universal` not `fits_all_models`. |
| browse.ts — dash-suffix regex | Open-ended `\s*-\s*[A-Z][A-Z0-9 /]+$` replaced with finish-word-restricted pattern. Directional parts no longer collapse. |
| vtwin_mark_universal.sql | Rebuilt from scratch. 2,328 VTwin products marked is_universal=true via category + name patterns. |
| FilterSidebar — year chip | `filters.year` chip added. Family chip clear resets year. Both clear-all handlers include year: null. |
| FilterSidebar — activeCount | Outer activeCount now includes family, model, year. Header badge correct. |
| FilterSidebar — Engine Era | Section renamed "Era" → "Engine Era". Coverage hint added when fitment active. |
| Model codes | 12 added to harley_models: FLTRCVO, FLHTKCVO, FLHTCVO, FLTRXCVO, FLHXCVO, XG, FLFBSANY/V/X, FLHCSANV, FLHTKS, FXDR. |
| MODEL_ALIASES expanded | 5 new groups: FLHR, FLHX, FLSTF, FXSTB, FXDWG. All fired on first import. |
| extract_fitment_from_names | PU 45.3%→49.2%, VTwin 36.3%→37.7%, WPS 38.7%→40.8% |
| VTwin scraper partial import | 6,742 SKUs / 91,259 fitment rows / 26 new products / 550 universals. FXDR added. |
| Typesense reindex | 90,536 docs, 0 errors. |

## ✅ DONE JUNE 5 — FORTY-FIRST PASS

| Area | What Was Done |
|------|---------------|
| Homepage rebuilt | VideoHero → ModelFinder → ScrollVelocity → BrandRolodex. FloatingNav + EraCarousel removed. |
| ModelFinder | Era → Year → Model Code, 3-step flow. Era image cards. Year slider locked to era range. Routes to /browse. |
| Font system | Tanker (--font-tanker) replaces New Sailor + Bebas Neue. Bespoke Serif (--font-bespoke). Legacy aliases wired. |
| FilterSidebar | Model Family section removed entirely. |
| VariantSelector | Mode A fitment+color grouping. Fixes duplicate BLACK/CHROME rows. |
| browse.ts | DISTINCT ON key upgraded to 3-tier: variant_group_id → name-based → u||id. |
| Variant group merges | 8 master groups, 199 sub-groups collapsed. |
| Typesense reindex | 90,510 docs, 0 errors (×2). |

## ✅ DONE JUNE 4 — FORTIETH PASS

| Area | What Was Done |
|------|---------------|
| route.ts | Removed debug console.log from isAuthorized(). |
| extract_fitment_from_names.mjs | Tier 2 Big Twin → Softail exclusion for year ranges ending ≤ 1984. |
| FilterSidebar.jsx | Full redesign — chips, gold dots, auto-open, mobile footer. |
| VTwin SKU duplicates | 14,407 bare-SKU dupes deactivated. Prefixed (VT-) rows canonical. |
| import_vtwin_fitment_partial.mjs | fits_all_models, MODEL_ALIASES, SKU resolution, delete scope patches. |
| VTwin fitment import | 185,234 rows on correct prefixed IDs. |
| vtwin_scrape_targets.csv | 20,236 SKUs ready. Scraper started. |
| OEM backfill schema fix | catalog_oem_crossref joins on sku. UPDATE 3,897 VTwin products. |

## ✅ DONE JUNE 4 — THIRTY-NINTH PASS

Fitment filter bug fixed. OEM cleanup. Typesense reindex 104,917 docs.

## ✅ DONE JUNE 4 — THIRTY-EIGHTH PASS

Admin inline PDP edit. API route. catalog_review_flags table. Next.js 15 params fix.

## ✅ DONE JUNE 3 — THIRTY-SEVENTH PASS

FlowingMenu. /models page rebuilt. mv_family_product_ranges mat view (9s→83ms). Font system. VTwin scraper finished.

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
| PU 5,900 Handlebar & Controls no fitment | Worth investigating whether PU fitment scrape missed this category |
| Size variant grouping | Valve guides, rocker shims, helmet pads, cam lock washers, mainshaft races |
| /models in nav | Add Models link to main nav + home page Shop by Model tile |
| Mobile layout pass on /models | FlowingMenu rows too tall on mobile |
| display_subcategory UPDATE script | Extract into scripts/ingest/map_display_subcategory.sql |
| Reindex automation | Wire npm run reindex as post-step in ingest scripts |
| Typesense schema documentation | Create scripts/ingest/TYPESENSE_SCHEMA.md |
| SKU display on PDP | Show clean internal_sku or branded part number instead of vendor SKU — defer until taxonomy finalized |
