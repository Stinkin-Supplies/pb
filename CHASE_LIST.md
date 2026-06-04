# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 4, 2026 — Thirty-Eighth Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Drop Tanker + Bespoke fonts | Download from Fontshare. Drop at `public/fonts/Tanker-Regular.ttf` + `public/fonts/BespokeSerif-Regular.ttf`. Then hard refresh /models. |
| 2 | Add remaining model images | 9 images needed: softail, dyna, sportster, fxr, shovelhead, vintage, trike, v-rod, street (skip or use placeholder — "All Makes" now routes to /browse). 400x160px, drop at `public/images/models/{slug}.jpg` |
| 3 | Import vtwin_fitment.csv | Scraper finished 100% — 37,980 rows, 34,952 fitment, 10,057 OEM, 0 errors. Run: `VTWIN_CSV=./scripts/ingest/vtwin_fitment.csv node scripts/ingest/import_vtwin_fitment_partial.mjs --skip-existing` |
| 4 | Add 26 missing model codes | FLTRCVO, FLHTKCVO, FLHTCVO, FLTRXCVO, FLHXCVO (CVO Touring), FLFBSANY/V/X, FLHCSANV (CVO Softail), FXBSE, FXDE, XG, RH120S, FLHXX, FXRST, FLHTKS, FXLRSST, FLTHK, FLTSN, FLTN, FXLRFLFB, FLFS. Skip ELW (bad data), XL1200 (generic). |
| 5 | Mobile layout pass on /models | FlowingMenu rows too tall on mobile — add min-height floor + hide sub labels below 480px |
| 6 | Verify null slug on /browse | Hard refresh /browse — VTwin cards should route to real PDPs, not /browse/null |
| 7 | Verify OEM search | Search `24009-06` — should return 3 products |
| 8 | VTwin scraper OEM fix | Hit rate 26.5% (10,057/37,980). Investigate Details tab HTML — confirm `_ATTR_MAP` hitting right label |
| 9 | /models in nav | Add Models link to main nav + home page Shop by Model tile |
| 10 | display_subcategory UPDATE script | Extract into `scripts/ingest/map_display_subcategory.sql` for post-merge runs |
| 11 | Remove console.log from route.ts | Debug log in `isAuthorized()` in `app/api/admin/products/[id]/route.ts` — remove before deploying to production |
| 12 | Add ADMIN_SECRET to Vercel | Run `npx vercel env add ADMIN_SECRET` — required for inline PDP edit to work in production |
| 13 | Bulk-fix flagged products | Once flags accumulate: `GET /api/admin/products/1?token=YOUR_SECRET` returns all unresolved flags. Write a batch script to apply fixes + partial Typesense updates. |

## ✅ DONE JUNE 4 — THIRTY-EIGHTH PASS

| Area | What Was Done |
|------|---------------|
| Admin inline PDP edit | `AdminEditPanel.jsx` built — floating pencil button on every PDP, visible at `?admin=1&token=`. Two modes: Edit Fields (display_category, display_subcategory, fits_all_models) and Flag Issue. Saves to Postgres + single Typesense doc PATCH, no full reindex. |
| API route | `app/api/admin/products/[id]/route.ts` — PATCH handles update + flag actions. GET returns all unresolved flags. Auth via `?token=` query param or `X-Admin-Token` header, cached in sessionStorage. |
| catalog_review_flags table | Auto-created on first flag submission. Schema: product_id, flag_type, flag_notes, flagged_at, resolved, resolved_at. UNIQUE on (product_id, flag_type). |
| Next.js 15 params fix | Route handler params updated to `Promise<{id}>` + await — required for Next.js 15 / App Router. |
| Token auth debug | Traced 401 to missing `&token=` in URL. Fixed by reading token from `window.location.search` + caching in sessionStorage so it survives client-side navigation. |

## ✅ DONE JUNE 3 — THIRTY-SEVENTH PASS

| Area | What Was Done |
|------|---------------|
| FlowingMenu component | Built from scratch. Randomized heights, fonts, alignment, direction, speed. GSAP animations. Bike images interleaved in marquee strip. |
| /models page rebuild | Replaced card grid with FlowingMenu. Cream header, dark menu rows, static data, zero API calls. "Street" → "All Makes" routing to /browse?universal=true. |
| Parts route — 9s → 83ms | Created `mv_family_product_ranges` materialized view (81,332 rows). Route now queries mat view. Era resolved in JS. Refresh wired into index_unified.js. |
| Font system | Tanker (`--font-tanker`) + Bespoke Serif (`--font-bespoke`) added to layout.tsx as local fonts. Tanker = FlowingMenu, Bespoke = headers. |
| ModelCatalogClient fonts | Removed broken `@font-face /New_Sailor.ttf` 404. FONT_DISPLAY → `var(--font-stencil)`. Headings → `var(--font-bespoke)`. |
| /api/models/summary deleted | Route removed — 7s query, not needed. Static sub labels used instead. |
| VTwin scraper finished | 37,980 rows scraped, 100% complete. 34,952 fitment hits, 10,057 OEM, 0 errors. Ready to import. |

## ✅ DONE JUNE 2 — THIRTY-SIXTH PASS

| Area | What Was Done |
|------|---------------|
| OEM catalog bridge | `oem_fitment` (379,899 rows) bridged to `catalog_fitment_v2` via 3-pass system. New sources: oem_catalog (0.90–0.95), oem_catalog_universal (0.75), oem_catalog_family (0.80). |
| Fitment from product names | `extract_fitment_from_names.mjs` — 3 tiers, 1,552,960 rows inserted for 5,795 products. `fitment_source = 'name_extraction'`. |
| Typesense oem_numbers fix | `oem_numbers[]` added to `query_by` with weight 5. OEM search now hits all vendors. |
| Overall fitment | ~4,920,000 rows. PU 49.2%, VTwin 34.3%, WPS 40.8%, overall 40.5%. |
| VTwin null slugs | 31,078 `catalog_products` rows fixed. Join required `'VT-' || cp.sku = cu.sku`. |
| VTwin image backfill | 10,302 image URLs written to `catalog_unified.image_url`. 9,865 genuinely have no image. |
| OEM numbers from names | ~1,217 OEM numbers extracted via regex from `catalog_unified.name` across all vendors. |
| VTwin oem_numbers[] backfill | 13,449 VTwin products had `oem_part_number` set but `oem_numbers[]` empty — fixed. |
| Fitment from OEM crossref | +5,434 products gained fitment (+~450K rows). VTwin 15.4→25.9%, PU 33.5→35.6%, WPS 35.5→36.1%. |
| Typesense reindex | 103,264 docs, 0 errors. |

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing | `cross_vendor_products` table + `resolve_cart_fulfillment()` + cart integration |
| Cart wiring | `CartContext/addItem` is placeholder only |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| flathead.webp | Missing from `public/images/eras/` |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| PU multi-image | `image_zip` column has multiple angles — not yet fetched |
| Hard Drive book crossref | Same pattern as FatBook/OldBook — import when file available |
| Fitment from name — year-range products | ~23 PU/WPS products have year ranges in name — need fitment-from-names parser pass |
| Admin flag batch resolver | Script to read `catalog_review_flags WHERE resolved = false`, apply fixes in bulk, partial Typesense update |
| Harden admin auth | Replace `?token=` URL param with proper session cookie or middleware auth when ready |
