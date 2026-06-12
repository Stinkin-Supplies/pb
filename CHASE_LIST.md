# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 11–12, 2026 — Forty-Seventh Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | **Canonical match review** (IN PROGRESS) | 469 OEM groups / 1,536 proposals at `/admin/canonical-matches?token=...`. Confirm/reject per group, use "Sync fitment ↔" to reconcile fitment regardless of merge decision. Click "Apply confirmed merges" once a batch is reviewed. |
| 2 | Decide payment gateway | Authorize.net / NMI / Braintree / Heartland / etc. Only blocker for `app/api/checkout/charge/route.ts` — single TODO block, everything else wired. |
| 3 | Wire `<CartProvider>` into root layout | `lib/cart/CartContext.jsx` ready — wrap `app/layout.tsx`, then `useCart()` everywhere |
| 4 | Build cart drawer UI | Uses `useCart()` — items, addItem, removeItem, updateQty, subtotal |
| 5 | Build checkout page UI | Address form + order summary + payment form, posts to `/api/checkout/prepare` then `/api/checkout/charge` |
| 6 | Wire real PU + WPS API credentials | `lib/fulfillment/triggerFulfillment.ts` — adapters stubbed with correct shapes, need `PU_API_URL/KEY`, `WPS_API_URL/KEY` env vars + endpoint confirmation |
| 7 | Shipping + tax calculation | Both $0 placeholders in `app/api/checkout/prepare/route.ts` — `calculateShipping()` and `calculateTax()` |
| 8 | Drop remaining session 43 files | globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts — see files table below |
| 9 | Add ADMIN_SECRET to Vercel | `npx vercel env add ADMIN_SECRET` — confirm value matches local `.env.local` (`a7f3c9e2d4b8a1f6`) |
| 10 | Fix Framer Motion transparent errors | Reference doc ready: `FRAMER_TRANSPARENT_FIX.md` — palette-specific rgba() replacements, not yet applied |
| 11 | Wire ProductQuickViewModal into browse page | Add `quickView` state, `setQuickView(product)` on card click, render modal |
| 12 | Wire BrowseBackButton into PDP | `import BrowseBackButton from "@/components/pdp/BrowseBackButton"` near top of PDP layout |
| 13 | Verify null slug on /browse | Hard refresh — VTwin cards should route to real PDPs, not /browse/null |
| 14 | Add remaining model images | 9 images: softail, dyna, sportster, fxr, shovelhead, vintage, trike, v-rod, street. 400×160px at `public/images/models/{slug}.jpg` |
| 15 | Bulk-fix flagged products | `GET /api/admin/products/1?token=YOUR_SECRET` returns all unresolved flags |

## ✅ DONE JUNE 11–12 — FORTY-SEVENTH PASS

| Area | What Was Done |
|------|---------------|
| Fulfillment architecture | Drop-ship confirmed: PU+WPS API ordering, VTwin manual PO. Own merchant gateway (TBD), invoicing in admin panel. Canonical product layer designed: one listing per part, checkout-time optimizer for vendor routing. |
| DB schema — canonical products | `canonical_products`, `product_vendors`, `canonical_match_proposals` tables created. `catalog_unified.canonical_product_id` FK added. |
| DB schema — orders | `orders`, `order_items`, `vendor_orders` created. Auto `SS-YYYYMMDD-NNNN` order numbers via trigger. Gateway-agnostic payment fields. |
| Canonical products pipeline | Phase A: all 90,605 active products → 1:1 canonical_products + product_vendors (rewritten to bulk CTE, 3,715 rows/s). Phase B: OEM matching → 469 groups / 1,537 proposals in review queue. |
| Admin canonical match review UI | `/admin/canonical-matches` — grouped by OEM, side-by-side vendor cards, bulk confirm/reject, apply merges, fitment range display + mismatch flag, "Sync fitment ↔" action. |
| **CRITICAL: vendor_sku fix** | All 90,605 product_vendors.vendor_sku were wrong (internal_sku format, not real vendor ordering #s) — found via PDF cross-check, fixed in single UPDATE. PU/WPS/VTwin all now have real ordering numbers. |
| Fulfillment backend scaffolding | CartContext (real localStorage cart), optimizer.ts (vendor consolidation/margin routing), triggerFulfillment.ts (PU/WPS/VTwin adapters), checkout/prepare + checkout/charge routes (gateway stub). |
| Chase list quick fixes | FLI model years inserted. catalog_fitment_v2 composite indexes added (Engine+Dyna fix). Luggage Racks→Racks confirmed. ANALYZE run. Framer transparent fix reference doc created. |

## Files to Drop In — Session 43 (still pending)

| File | Destination |
|------|-------------|
| globals.css | app/globals.css |
| layout.tsx | app/layout.tsx |
| BespokeSerif-Variable.ttf | public/fonts/BespokeSerif-Variable.ttf (replace Regular) |
| FilterSidebar.jsx | components/browse/FilterSidebar.jsx |
| ProductQuickViewModal.jsx | components/browse/ProductQuickViewModal.jsx |
| BrowseBackButton.jsx | components/pdp/BrowseBackButton.jsx |
| products-slug-route.ts | app/api/products/[slug]/route.ts (new) |



| Area | What Was Done |
|------|---------------|
| CategoryBentoGrid subcategory overlay | Full overlay system built and iterated: spring animation from clicked tile (x/y translate + scale), left-panel-only design (40% width, right tiles exposed), large gold ✕ button straddling panel edge, Tanker-font text list with underlines, top-aligned subcategories, word-wrap fix for KineticText |
| browse.ts — disjunctive faceting | catFacetConditions + subcatFacetConditions snapshots added. Category sidebar now shows all 20 categories instead of collapsing to selected one. Subcategory sidebar shows all subcategories for selected category. |
| browse.ts — count fix | GROUP_KEY_SQL used for COUNT(DISTINCT) so page count matches actual DISTINCT ON rows. Eliminates phantom extra pages. |
| browse.ts — Typesense fix | page:1 always (Postgres handles pagination via OFFSET). explicit sort_by: "_text_match:desc,in_stock:desc,computed_price:asc" so same product no longer always shows first. per_page scales with browse page so deep pages work. |
| browse.ts — variant count fix | Removed ng LEFT JOIN (expensive full-catalog subquery). COALESCE now uses only vc.variant_count. Products grouped by name-normalization no longer show false "X OPTIONS" badge. |
| ModelFinder redesign | Text changed to "FIND YOUR PARTS", 2× larger (clamp 72px→144px), centered, word-wrap fix. Era tiles: gridAutoRows 320px (portrait), year slider removed, clicking era navigates directly to /browse?eraSlug=X. Gold color palette (was orange). |
| CategoryBentoGrid layout | Grid redesigned: EXHAUST tall narrow col (rows 1–2), compact short-name row (LIGHT/ELEC/BRAKES/FOOT at 110px), HANDLEBAR as bottom-right 2×2 secondary hero (gold text on deep dark). Row heights varied (168/168/130/110/115/138/138). Per-area font size map replacing uniform 2rem. |
| CategoryBentoGrid images | 5 images wired: engine, trans, carb, fenders, susp. Files at public/images/cats/. |
| VTwin round-2 scrape imported | 501,478 fitment rows inserted. 4,255 OEM numbers added to catalog_oem_crossref. 6,331 products marked is_universal=true. 56 vintage year gap entries filled. |
| HUMMER + FLHRX added | Both added to harley_models with correct family and year ranges (HUMMER 1947–1958 Vintage, FLHRX 2006–2008 Touring). Year entries generated. |
| OEM cleanup | 4,122 PU catalog numbers (XXXX-XXXX format) deleted from catalog_oem_crossref. 4,143 catalog_unified.oem_numbers arrays cleaned. Reindexed. |
| VTwin OEM sync | 15,723 VTwin products had oem_numbers arrays synced from catalog_oem_crossref (SKU format mismatch VT-XXXXX vs bare was preventing sync). Reindexed. |
| Mat view refresh | REFRESH MATERIALIZED VIEW mv_family_product_ranges run. |
| VACUUM ANALYZE | catalog_fitment_v2 analyzed after round-2 import. |

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
