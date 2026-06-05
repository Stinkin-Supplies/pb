# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 4, 2026 — Fortieth Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Reindex Typesense | URGENT — active count changed to 90,520 (was 104,917). Run: `node scripts/ingest/index_unified.js --recreate` |
| 2 | Run vtwin_mark_universal.sql | Quick win — marks 2,350 VTwin tools/universal as fits_all_models=true. File in outputs. |
| 3 | Wait for scraper + import results | Scraper running against vtwin_scrape_targets.csv (20,236 SKUs). When done, import with updated import_vtwin_fitment_partial.mjs |
| 4 | Run extract_fitment_from_names.mjs | Safe to run now — Tier 2 Big Twin/Softail fix applied. ~4,700 products have name signals |
| 5 | Drop Tanker + Bespoke fonts | Download from Fontshare. Drop at `public/fonts/Tanker-Regular.ttf` + `public/fonts/BespokeSerif-Regular.ttf`. Hard refresh /models. |
| 6 | Add ADMIN_SECRET to Vercel | Run `npx vercel env add ADMIN_SECRET` — required for inline PDP edit in production |
| 7 | Add remaining model images | 9 images needed: softail, dyna, sportster, fxr, shovelhead, vintage, trike, v-rod, street. 400x160px at `public/images/models/{slug}.jpg` |
| 8 | Add 26 missing model codes | FLTRCVO, FLHTKCVO, FLHTCVO, FLTRXCVO, FLHXCVO (CVO Touring), FLFBSANY/V/X, FLHCSANV (CVO Softail), FXBSE, FXDE, XG, RH120S, FLHXX, FXRST, FLHTKS, FXLRSST, FLTHK, FLTSN, FLTN, FXLRFLFB, FLFS |
| 9 | Mobile layout pass on /models | FlowingMenu rows too tall on mobile — add min-height floor + hide sub labels below 480px |
| 10 | Verify null slug on /browse | Hard refresh /browse — VTwin cards should route to real PDPs, not /browse/null |
| 11 | Verify OEM search | Search `24009-06` — should return 3 products |
| 12 | /models in nav | Add Models link to main nav + home page Shop by Model tile |
| 13 | display_subcategory UPDATE script | Extract into `scripts/ingest/map_display_subcategory.sql` for post-merge runs |
| 14 | Bulk-fix flagged products | `GET /api/admin/products/1?token=YOUR_SECRET` returns all unresolved flags |

## ✅ DONE JUNE 4 — FORTIETH PASS

| Area | What Was Done |
|------|---------------|
| route.ts | Removed debug console.log from isAuthorized(). Safe to deploy. |
| extract_fitment_from_names.mjs | Tier 2 Big Twin → Softail exclusion for year ranges ending ≤ 1984. Safe to re-run. |
| FilterSidebar.jsx | Full redesign — active filter chips, gold dot indicators, auto-open sections, collapsed sidebar labels, mobile Clear + Show Results footer, framer-motion hover |
| VTwin SKU duplicates | 14,407 bare-SKU dupes deactivated. Prefixed (VT-) rows are now canonical. Active VTwin: 38,270 |
| import_vtwin_fitment_partial.mjs | 4 patches: fits_all_models wired, MODEL_ALIASES (E/XL883/XL1200), SKU resolution active-only + prefixed priority, delete scope includes old bare IDs |
| Knucklehead + Sportster fitment | E → [EL,ELH], XL883/XL1200 expand to all variants via MODEL_ALIASES |
| VTwin fitment import | 185,234 rows on correct prefixed IDs. 174,489 prefixed + 10,745 bare-only (521 legitimate products) |
| VTwin fitment gap | 24,393 unfitted analyzed: 13 dead, 1,794 SKU-only, 2,350 universal, 20,236 scrape targets |
| vtwin_scrape_targets.csv | 20,236 SKUs ready to feed into scraper. Scraper started. |
| vtwin_mark_universal.sql | SQL to mark 2,350 tools/universal as fits_all_models=true. Ready to run. |
| OEM backfill schema fix | catalog_oem_crossref joins on sku not product_id. UPDATE 3,897 VTwin products. |

## ✅ DONE JUNE 4 — THIRTY-NINTH PASS

| Area | What Was Done |
|------|---------------|
| Fitment filter bug | Fixed: "Big Twin '53-'84" products no longer appear in Softail filter results. Deleted 2,051 bad name_extraction Softail rows + 1,269,765 Tier 3 (conf=0.65) rows. |
| OEM number cleanup | 295 JGI- prefixes stripped → real HD OEM. 16,378 vendor/noise values NULLed. 16,610 real HD OEM numbers synced into oem_numbers[]. 63,396 NULL arrays initialized to {}. 0 out-of-sync. |
| Typesense reindex | 104,917 docs, 0 errors. |

## ✅ DONE JUNE 4 — THIRTY-EIGHTH PASS

| Area | What Was Done |
|------|---------------|
| Admin inline PDP edit | `AdminEditPanel.jsx` built — floating pencil button on every PDP, visible at `?admin=1&token=`. Edit Fields + Flag Issue modes. |
| API route | `app/api/admin/products/[id]/route.ts` — PATCH handles update + flag. GET returns unresolved flags. |
| catalog_review_flags table | Auto-created on first flag submission. |
| Next.js 15 params fix | Route handler params updated to `Promise<{id}>` + await. |
| Token auth debug | Token read from `window.location.search`, cached in sessionStorage. |

## ✅ DONE JUNE 3 — THIRTY-SEVENTH PASS

| Area | What Was Done |
|------|---------------|
| FlowingMenu component | Built from scratch. Randomized heights, fonts, alignment, direction, speed. GSAP animations. |
| /models page rebuild | Replaced card grid with FlowingMenu. Zero API calls. Static data. |
| Parts route — 9s → 83ms | Created `mv_family_product_ranges` materialized view. |
| Font system | Tanker + Bespoke Serif added to layout.tsx. ⚠️ Files not in git — download from Fontshare. |
| VTwin scraper finished | 37,980 rows scraped, 100% complete. CSV at scripts/ingest/vtwin_fitment.csv. |

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
| Admin flag batch resolver | Script to read `catalog_review_flags WHERE resolved = false`, apply fixes in bulk |
| Harden admin auth | Replace `?token=` URL param with session cookie when ready |
| vtwin_mark_universal.sql | Mark 2,350 VTwin tools/universal as fits_all_models — file in outputs, run when ready |
| PU 5,900 Handlebar & Controls no fitment | Suspicious — worth investigating whether PU fitment scrape missed this category |
