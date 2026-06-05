# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 5, 2026 — Forty-First Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Drop in new browse.ts | `lib/db/browse.ts` — name-based variant group key fallback. In outputs from session 41. Required for wire spool + other ungrouped products to collapse in browse grid. |
| 2 | Drop in new ModelFinder.jsx | `components/home/ModelFinder.jsx` — era → year → model code flow. In outputs. |
| 3 | Drop in new page.jsx (homepage) | `app/page.jsx` — VideoHero → ModelFinder → ScrollVelocity → BrandRolodex. In outputs. |
| 4 | Drop in new FilterSidebar.jsx | `components/browse/FilterSidebar.jsx` — Model Family section removed. In outputs. |
| 5 | Drop in new VariantSelector.jsx | `components/browse/VariantSelector.jsx` — fitment+color mode fixes duplicate BLACK/CHROME rows. In outputs. |
| 6 | Drop in new layout.tsx | `app/layout.tsx` — Tanker + Bespoke Serif fonts, legacy aliases. In outputs. |
| 7 | Add two API routes | `app/api/models/by-engine/route.ts` + `app/api/models/codes/route.ts` — back the ModelFinder. In outputs. |
| 8 | Run vtwin_mark_universal.sql | Marks 2,350 VTwin tools/universal as fits_all_models=true. File in outputs. |
| 9 | Wait for scraper + import results | Scraper running against vtwin_scrape_targets.csv (20,236 SKUs). When done, import with updated import_vtwin_fitment_partial.mjs |
| 10 | Run extract_fitment_from_names.mjs | Safe to run — Tier 2 Big Twin/Softail fix applied. ~4,700 products have name signals |
| 11 | Add ADMIN_SECRET to Vercel | Run `npx vercel env add ADMIN_SECRET` — required for inline PDP edit in production |
| 12 | Add remaining model images | 9 images needed: softail, dyna, sportster, fxr, shovelhead, vintage, trike, v-rod, street. 400x160px at `public/images/models/{slug}.jpg` |
| 13 | Add 26 missing model codes | FLTRCVO, FLHTKCVO, FLHTCVO, FLTRXCVO, FLHXCVO (CVO Touring), FLFBSANY/V/X, FLHCSANV (CVO Softail), FXBSE, FXDE, XG, RH120S, FLHXX, FXRST, FLHTKS, FXLRSST, FLTHK, FLTSN, FLTN, FXLRFLFB, FLFS |
| 14 | Verify null slug on /browse | Hard refresh /browse — VTwin cards should route to real PDPs, not /browse/null |
| 15 | Verify OEM search | Search `24009-06` — should return 3 products |
| 16 | Manual variant group review | Go through size variants (valve guides, rocker arm shims, helmet pads, cam lock washers, mainshaft races) one at a time. Use admin panel to flag, then merge script pattern from session 41. |
| 17 | display_subcategory UPDATE script | Extract into `scripts/ingest/map_display_subcategory.sql` for post-merge runs |
| 18 | Bulk-fix flagged products | `GET /api/admin/products/1?token=YOUR_SECRET` returns all unresolved flags |

## ✅ DONE JUNE 5 — FORTY-FIRST PASS

| Area | What Was Done |
|------|---------------|
| Homepage rebuilt | VideoHero → ModelFinder → ScrollVelocity → BrandRolodex. FloatingNav + EraCarousel removed. |
| ModelFinder | Era → Year → Model Code, 3-step flow. Era image cards with art/gradient. Year slider locked to era range. Model codes from /api/models/search. Routes to /browse. Full-width, Tanker font. |
| Font system | Tanker (--font-tanker) replaces New Sailor + Bebas Neue. Bespoke Serif (--font-bespoke) replaces Bebas Neue. Legacy aliases --font-sailor + --font-caesar wired in layout.tsx. Bebas Neue removed. |
| FilterSidebar | Model Family section removed (HD_FAMILY_SUBMODELS, HD_FAMILIES_FLAT, family useEffect, family from activeCount all removed). |
| VariantSelector | New fitment+color mode (Mode A): groups by fitment family first, color swatches within each group. Fixes duplicate BLACK/CHROME rows on sissy bars etc. |
| browse.ts | DISTINCT ON key upgraded to 3-tier: variant_group_id → name-based brand+base_name key → u||id. Collapses ungrouped color variants in browse grid. |
| Variant group merges | 8 master groups created, 199 sub-groups collapsed: Universal Brake Line (122 members), Brake Line (387), QC Clutch Cable Upper (102), License Plate Frame (14), Windshield (32), Air Cleaner Cover (14), Foot Pegs (19), 100' Wire Spool (68). |
| Wire spool color labels | option_2_name=Color, option_2_value extracted from product name via regex. 45 members updated. |
| Typesense reindex | 90,510 docs, 0 errors (×2 runs this session). |

## ✅ DONE JUNE 4 — FORTIETH PASS

| Area | What Was Done |
|------|---------------|
| route.ts | Removed debug console.log from isAuthorized(). Safe to deploy. |
| extract_fitment_from_names.mjs | Tier 2 Big Twin → Softail exclusion for year ranges ending ≤ 1984. Safe to re-run. |
| FilterSidebar.jsx | Full redesign — active filter chips, gold dot indicators, auto-open sections, collapsed sidebar labels, mobile Clear + Show Results footer, framer-motion hover |
| VTwin SKU duplicates | 14,407 bare-SKU dupes deactivated. Prefixed (VT-) rows are now canonical. Active VTwin: 38,270 |
| import_vtwin_fitment_partial.mjs | 4 patches: fits_all_models wired, MODEL_ALIASES (E/XL883/XL1200), SKU resolution active-only + prefixed priority, delete scope includes old bare IDs |
| Knucklehead + Sportster fitment | E → [EL,ELH], XL883/XL1200 expand to all variants via MODEL_ALIASES |
| VTwin fitment import | 185,234 rows on correct prefixed IDs. |
| VTwin fitment gap | 24,393 unfitted: 13 dead, 1,794 SKU-only, 2,350 universal, 20,236 scrape targets |
| vtwin_scrape_targets.csv | 20,236 SKUs ready. Scraper started. |
| vtwin_mark_universal.sql | SQL ready. Not yet run. |
| OEM backfill schema fix | catalog_oem_crossref joins on sku. UPDATE 3,897 VTwin products. |

## ✅ DONE JUNE 4 — THIRTY-NINTH PASS

| Area | What Was Done |
|------|---------------|
| Fitment filter bug | Fixed. Deleted 2,051 bad Softail rows + 1,269,765 Tier 3 rows. |
| OEM number cleanup | 295 JGI- prefixes stripped. 16,378 noise NULLed. 16,610 OEMs synced. 63,396 arrays initialized. |
| Typesense reindex | 104,917 docs, 0 errors. |

## ✅ DONE JUNE 4 — THIRTY-EIGHTH PASS

| Area | What Was Done |
|------|---------------|
| Admin inline PDP edit | AdminEditPanel.jsx built. Edit Fields + Flag Issue modes. |
| API route | app/api/admin/products/[id]/route.ts — PATCH + GET. |
| catalog_review_flags table | Auto-created on first flag. |
| Next.js 15 params fix | params is Promise<{id}> — must await. |
| Token auth | Read from ?token= URL param, cached in sessionStorage. |

## ✅ DONE JUNE 3 — THIRTY-SEVENTH PASS

| Area | What Was Done |
|------|---------------|
| FlowingMenu component | Built. GSAP animations, randomized layout. |
| /models page | Replaced card grid with FlowingMenu. |
| Parts route | mv_family_product_ranges mat view — 9s → 83ms. |
| Font system | Tanker + Bespoke Serif added to layout.tsx. |
| VTwin scraper | 37,980 rows scraped, 100% complete. |

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing | cross_vendor_products table + resolve_cart_fulfillment() + cart integration |
| Cart wiring | CartContext/addItem is placeholder only |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| flathead.webp | Missing from public/images/eras/ |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| PU multi-image | image_zip column has multiple angles — not yet fetched |
| Hard Drive book crossref | Same pattern as FatBook/OldBook — import when file available |
| Admin flag batch resolver | Script to read catalog_review_flags WHERE resolved = false, apply fixes in bulk |
| Harden admin auth | Replace ?token= URL param with session cookie when ready |
| PU 5,900 Handlebar & Controls no fitment | Worth investigating whether PU fitment scrape missed this category |
| Size variant grouping | Valve guides, rocker shims, helmet pads, cam lock washers, mainshaft races — review manually, group with admin flag + merge script pattern |
| /models in nav | Add Models link to main nav + home page Shop by Model tile |
| Mobile layout pass on /models | FlowingMenu rows too tall on mobile |
