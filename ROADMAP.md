# STINKIN' SUPPLIES — PROJECT ROADMAP
**Last Updated: June 24, 2026 (Fifty-Seventh Pass)**

---

## ✅ PHASE 1 — FOUNDATION (Complete)

| Item | Status |
|------|--------|
| Stack: Next.js 15 / Postgres (Hetzner 5.161.100.126) / Typesense / Vercel | ✅ |
| Three vendor staging tables: pu_catalog, wps_catalog, vtwin_catalog | ✅ |
| catalog_unified — single source of truth (**89,153 active rows**) | ✅ |
| Internal SKU taxonomy (17 prefixes: ACC, BDY, BRK, DRV, ELC, ENG, EXH, etc.) | ✅ |
| harley_families / harley_models / harley_model_years (~360 models, ~2,070 year rows) | ✅ |
| Typesense schema + index (**89,153 docs**, 0 errors) | ✅ |

---

## ✅ PHASE 2 — FITMENT INFRASTRUCTURE (Complete)

| Item | Status |
|------|--------|
| catalog_fitment_v2 as canonical fitment table (model_year_id FK) | ✅ |
| JW Boon NOS import (348K rows) | ✅ |
| PU fitment pipeline (pu_fitment → pu_fitment_parsed → pu_fitment_expanded, 1.67M rows) | ✅ |
| WPS fitment via taxonomyterms API (702K rows) | ✅ |
| VTwin fitment from scraper rounds 1 + 2 (501K rows) | ✅ |
| Era boolean columns on catalog_unified (era_flathead → era_milwaukee8) | ✅ |
| catalog_fitment_v2 composite indexes (product_id+model_year_id, reverse) | ✅ |
| Fitment coverage: PU 49% / VTwin 48% / WPS 41% — ceiling reached | ✅ |
| Vintage model codes (Flathead, Knucklehead, Panhead, Shovelhead, Ironhead, police, CVO, V-Rod) | ✅ |
| FLHRX + FLI model codes added | ✅ |
| idx_cfv2_product_modelyear + idx_cfv2_modelyear_product composite indexes | ✅ |

---

## ✅ PHASE 3 — OEM & CATALOG ENRICHMENT (Complete)

| Item | Status |
|------|--------|
| catalog_oem_crossref — canonical OEM source (FatBook/OldBook + VTwin PDF, 12,278+ pairs) | ✅ |
| product_id FK backfilled (20,836 rows) | ✅ |
| PU XML enrichment pipeline (catalog_media, features, dimensions) | ✅ |
| OEM cleanup: 4,122 PU catalog numbers removed from crossref | ✅ |
| VTwin OEM crossref — **16,752 rows** (+8,326 from vtwin_catalog.oem_numbers import) | ✅ |
| WPS OEM crossref — 1,665 rows (from wps-cross-fitment.csv) | ✅ |
| **PU OEM crossref — 15,330 rows** (source=`PU_PIES`, OSP supplier numbers from brand XML files) | ✅ |
| OEM badge on PDP sourced only from catalog_oem_crossref (vendor catalog numbers excluded) | ✅ |
| pack_qty column — **2,171 active non-kit products with pack_qty > 1** | ✅ |
| scan_pack_qty_from_names.mjs — 12 auto-apply patterns; 254 corrections applied | ✅ |
| Pack qty badge on PDP | ✅ |
| AdminEditPanel pack_qty field | ✅ |
| product_details JSONB column — GIN index; **~68,593 populated (~77%)** after PU description pass | ✅ |
| VTwin scrape data synced — 87 descriptions + 3,165 pdp_payload entries | ✅ |
| **PU multi-image extraction** — `extract_pu_images.mjs` parses 133 brand XML files; **~35,990 catalog_media rows**; **8,828 PU descriptions** added; **22,253 PU products** with multi-angle galleries | ✅ |
| sku_counter table — created and seeded | ✅ |

---

## ✅ PHASE 4 — TAXONOMY (Complete)

| Item | Status |
|------|--------|
| display_category (21 confirmed values) | ✅ |
| display_subcategory across all 20 display categories | ✅ |
| Coverage 87–97% across categories (Accessories & Misc intentionally low — catch-all) | ✅ |
| Typesense reindexed with full subcategory facets | ✅ |

### Subcategory coverage by category
| Category | Subcategories | Coverage |
|----------|--------------|---------|
| Instrumentation | Speedometers · Gauges · Dash & Trim | 96.5% |
| Fenders & Body | Windshields · Gas Tanks · Fenders · Gas Caps & Petcocks · Fender Parts & Accessories · Windshield Hardware · Fairings | 95.9% |
| Carburetion & Fuel | Air Cleaners · Carburetors & Jets · Fuel Lines & Pumps · Fuel Injection · Throttle & Cables · Intake Manifolds | 95.8% |
| Lighting | Turn Signals · Auxiliary · Bulbs · Taillights · Headlights · License Plate · Lighting Controls | 95.3% |
| Seating | Seats · Seat Hardware · Backrests · Seat Pads & Covers | 95.0% |
| Handlebar & Controls | Cables & Lines · Handlebars · Risers & Clamps · Levers · Mirrors · Grips · Throttle · Switches | 94.9% |
| Transmission & Clutch | Clutch Plates · Trans Internals · Oil System · Trans Covers · Sprockets · Belts · Drive Chains · Primary Drive | 94.8% |
| Brakes | Brake Lines · Rotors · Brake Pads · Calipers · Brake Hardware · Master Cylinders · Conversion Kits | 94.3% |
| Luggage & Racks | Sissy Bars · Saddlebags · Bags & Packs · Luggage Racks · Parts | 93.3% |
| Exhaust | Exhaust Systems · Mufflers · Headers & Pipes · Exhaust Parts | 93.1% |
| Foot Controls | Footpegs · Shifters · Floorboards · Kickstands · Highway Bars · Forward Controls · Brake Pedals | 92.9% |
| Security & Covers | Security · Bike Covers · Shelters & Storage | 92.8% |
| Wheels & Tires | Wheels · Axles & Spacers · Tires & Tubes · Hubs & Spokes · Bearings · Valves | 92.2% |
| Electrical | Ignition · Wiring · Charging & Alternators · Switches · Starters · Batteries · Audio · Horns | 92.1% |
| Engine | Gaskets · Pistons & Cylinders · Cams & Valvetrain · Engine Covers · Heads · Bottom End · Oil Pumps · Performance Kits | 91.2% |
| Suspension | Shocks · Fork Tubes · Triple Trees · Fork Lowers · Swingarms · Fork Seals · Lowering Kits | 87.8% |
| Frame & Hardware | Hardware & Fasteners · Frame Parts · Kickstands · Body Panels · Protection | 87.5% |
| Tools & Chemicals | Tools · Chemicals & Lubricants · Cleaners & Detailing | 71.3% |
| Riding Gear & Apparel | Helmets · Gloves · Jackets · Pants · Footwear · Accessories | 65.2% |
| Accessories & Misc | Books & Manuals · Trailer & Towing · Decals · Tie-Downs · Cooling Systems | 6.1% (catch-all) |

### Taxonomy decisions
- Gas Tanks → Fenders & Body (bodywork, not fuel system)
- Oil System → Transmission & Clutch (drivetrain maintenance)
- Intake Manifolds + Throttle & Cables split from Carburetors & Jets
- Kickstands → Foot Controls

---

## ✅ PHASE 5 — FRONTEND: BROWSE + SEARCH (Complete)

| Item | Status |
|------|--------|
| browse.ts — disjunctive faceting, count fix, Typesense pagination, variant dedup | ✅ |
| browse.ts — multi-word search (per-word AND matching across name/brand/sku) | ✅ |
| browse.ts — per-query params rendering (fixed shared-array bug) | ✅ |
| browse.ts — **OEM number search via `unnest(cu.oem_numbers) ILIKE`** — OEM queries now surface all crossref-linked products | ✅ |
| browse.ts / pdp-page.jsx — catalog_media image fallback | ✅ |
| ProductCard.jsx / pdp-page.jsx — cream theme conversion | ✅ |
| ProductImage.jsx — graceful broken-image fallback | ✅ |
| **ProductImageGallery.jsx** — multi-image thumbnail strip on PDP; reads `image_urls` (VTwin) or `catalog_media.all_urls` (PU); single-image renders as before | ✅ |
| FilterSidebar — active filter chips, section indicators, mobile bottom sheet | ✅ |
| **FilterSidebar + page.jsx — `?category=` URL param bug fixed** — old nav links using `?category=X` now correctly fold into `display_category`; category never persists invisibly in URL | ✅ |
| BrowseBackButton (sessionStorage) | ✅ |
| Typesense group_by: variant_group_id | ✅ |
| Era pages (era_* boolean column lookups) | ✅ |
| PDP (/browse/[slug]) — LeMans image proxy, fitment tab, OEM tab | ✅ |
| QuickView modal removed — cards navigate directly to PDP | ✅ |
| OEM supersession chain — oem_supersession (283 pairs), mv_oem_fitment_coverage (683K rows) | ✅ |
| browse.ts OEM chain pre-fetch — surfaces chain products when year+model set (1.3ms warm) | ✅ |
| getChronologicalNeighbors — tightened to display_subcategory | ✅ |
| Browse inline panel — InlinePanel.jsx + panel API route + ProductCard selected/onSelect props | ✅ |
| PDP — ProductDetailsSection — description, gold-bulleted features, tech note, attributes grid (above fitment tabs) | ✅ |
| PDP — OemAlternativesPanel — removed (session 57) | ✅ |
| PDP — breadcrumb link fixed (`?category=` → `?display_category=`) | ✅ |
| index_unified.js — uses product_details as primary source; WPS HTML stripped from Typesense | ✅ |
| **getProduct() SQL — catalog_media multi-image fetch** — lateral now returns `primary_url` + `all_urls[]`; `image_urls` falls back to `catalog_media.all_urls` for PU | ✅ |

---

## ✅ PHASE 6 — FRONTEND: HOMEPAGE + NAVIGATION (Complete)

| Item | Status |
|------|--------|
| Font system: --font-tanker / --font-bespoke / --font-stencil | ✅ |
| Color palette: gold #C9A84C / cream #F2EAD3 / deep dark #1A1208 | ✅ |
| ModelFinder — era-first → year slider → model → /browse | ✅ |
| CategoryBentoGrid — bento layout, spring animation | ✅ |
| FlowingMenu — /models page | ✅ |
| mv_family_product_ranges materialized view (83ms vs 9.5s) | ✅ |
| BottomNav — scroll-collapse to gold orb | ✅ |

---

## ✅ PHASE 7 — VARIANT SYSTEM (Complete)

| Item | Status |
|------|--------|
| catalog_variant_groups + catalog_variant_members tables | ✅ |
| build_variant_groups.cjs — name-based grouping for PU/VTwin | ✅ |
| VariantSelector Mode A/B/C/D | ✅ |
| ColorQtySelector — two radio pill sections | ✅ |
| apply_oversize_variants.cjs — cross-oversize grouping (73 groups, 332 members) | ✅ |
| catalog_variant_candidates table | ✅ |
| Fits axis removed from WPS variant members | ✅ |
| normalizeAxisName() — Finish→Color normalization | ✅ |
| Non-distinguishing axis fix (invariant #7) — 994 false groups dissolved. Live: 2,763 groups / 8,109 members | ✅ |
| build_pack_size_groups.mjs — **148 MULTI pack-size groups**; sync/evict; dedupByPackQty | ✅ |

---

## ✅ PHASE 8 — ADMIN TOOLING (Substantially Complete)

| Item | Status |
|------|--------|
| AdminEditPanel — inline PDP editing, catalog_review_flags | ✅ |
| /admin/products/[id] — full product detail edit | ✅ |
| ProductManager — bulk grid with inline edit | ✅ |
| /admin/canonical-matches — confirm/reject/flag/edit/manual-match/variant-flag | ✅ |
| /admin/variant-candidates — candidate tracking + resolution | ✅ |
| Harden auth (session cookie vs ?token=) | 🔵 Future |
| ADMIN_SECRET to Vercel | ⏳ |

---

## ✅ PHASE 9 — DATA QUALITY: VENDOR SKUs (Complete)

| Item | Status |
|------|--------|
| WPS vendor_sku 100% correct from initial import | ✅ |
| VTwin vendor_sku correct (VT- prefix stripped) | ✅ |
| PU DS###### rows fixed (migration 007) | ✅ |
| PU remaining rows fixed (migration 010) — all 36,396 active rows clean | ✅ |
| PU portal spot-check (3-4 numbers) | ⏳ Recommended |

---

## ✅ PHASE 10 — CANONICAL PRODUCTS: MULTI-VENDOR MATCHING (Complete)

All 2,407 confirmed canonical merges applied and drained. Variant candidates remain for ongoing human review.

| Item | Status |
|------|--------|
| canonical_products table (89,153 rows, schema correct) | ✅ |
| product_vendors table (89,153 rows, one per unified row) | ✅ |
| build_canonical_products.mjs Phase A + Phase B | ✅ |
| is_kit column, pack_qty column | ✅ |
| **All confirmed merges applied** — 2,407 applied / 0 confirmed / 0 pending / 1,772 rejected | ✅ |
| **62 variant candidates remaining** — /admin/variant-candidates; finish/size/length groups needing human judgment | ⏳ |
| **Backfill vendor_offers from product_vendors** — PU/VTwin cost/stock not in vendor_offers (only 22,278 WPS rows). Optimizer reads product_vendors as correct workaround. | ⏳ |

---

## ⏳ PHASE 11 — CHECKOUT + PAYMENT (Backend Ready, Gateway TBD)

Schema is complete. Only blocker is gateway decision.

| Item | Status |
|------|--------|
| orders / order_items / vendor_orders tables — full schema, triggers, indexes | ✅ |
| Auto order numbers SS-YYYYMMDD-NNNN trigger | ✅ |
| CartContext (localStorage, canonical_sku-based) | ✅ |
| CartProvider wired into root layout | ✅ |
| Checkout page skeleton with address form + MAP pricing | ✅ |
| `app/api/checkout/prepare/route.ts` — validates cart, runs optimizer | ✅ |
| `app/api/orders/create/route.ts` — charges gateway (stub), writes orders atomically, dispatches fulfillment | ✅ (gateway stub) |
| **Payment gateway decision** — Authorize.net / NMI / Heartland / Braintree? | ⚠️ BLOCKING |
| Order confirmation page — /checkout/success | ⏳ |
| Tax calculation — TaxJar or flat rate table | ⏳ |
| Shipping estimate — UPS/FedEx API or flat rate by zone | ⏳ |
| PU + WPS API credentials for order submission | ⏳ |

---

## ✅ PHASE 12 — FULFILLMENT OPTIMIZER (Complete — awaiting API creds)

| Item | Status |
|------|--------|
| `lib/fulfillment/optimizer.ts` — minimize vendor count, maximize margin, VTwin→manual | ✅ |
| `lib/fulfillment/triggerFulfillment.ts` — inserts vendor_orders, dispatches adapters | ✅ |
| Live stock check at checkout via product_vendors | ✅ |
| PU API order submission | ⏳ Needs `PU_API_URL`/`PU_API_KEY` |
| WPS API order submission | ⏳ Needs `WPS_API_URL`/`WPS_API_KEY` |
| VTwin → manual queue — vendor_orders row with is_manual=true | ✅ |
| Backfill vendor_offers from product_vendors | ⏳ |

---

## ⏳ PHASE 13 — ADMIN: ORDERS & FULFILLMENT DASHBOARD (Ready to build)

| Item | Status |
|------|--------|
| /admin/orders — list all orders; filter by status/vendor/date | ⏳ |
| /admin/orders/[id] — order detail + actions | ⏳ |
| /admin/fulfillment/vtwin — manual PO queue | ⏳ |
| /admin/inventory — per-vendor stock levels | ⏳ |
| /admin/margins — margin by vendor / category / product | ⏳ |
| Invoice PDF generation | ⏳ |

---

## ⏳ PHASE 14 — AUTOMATED SYNC & NOTIFICATIONS (After Phase 12)

| Item | Status |
|------|--------|
| Daily price/stock sync cron — PU + WPS jobs | ⏳ |
| Order status webhooks — PU/WPS shipment handlers | ⏳ |
| Customer email notifications — confirmation, shipped, delivered | ⏳ |
| Typesense stock sync without full reindex | ⏳ |

---

## ⏳ PHASE 15 — FRONTEND CLEANUP

| Item | Status |
|------|--------|
| Fix Framer Motion transparent errors (FRAMER_TRANSPARENT_FIX.md ready) | ⏳ |
| Add 9 remaining model images | ⏳ |
| /models link in main nav | ⏳ |
| Mobile layout pass /models — FlowingMenu too tall on mobile | ⏳ |
| flathead.webp missing from public/images/eras/ | ⏳ |
| Evolution family standalone era page | 🔵 Future |

---

## ⏳ PHASE 16 — VTWIN CATALOG GAPS (Ongoing)

| Item | Status |
|------|--------|
| **VTwin OEM scrape expansion** — ~21,000 products still have zero OEM crossref; web scraper captured 7,277 OEM numbers in `vtwin_scrape_data.oem_no` — import those, then consider targeted re-scrape | ⏳ |
| **Fix `build_product_details.mjs` VTwin attributes** — `extra_attributes` stored as stringified JSON; add `JSON.parse()` before write | ⏳ |
| VTwin product_details gap (23K+ products) — no description/pdp_payload; vtwinmfg.com scrape is the only self-serve path | 🔵 Future |

---

## 🔵 PHASE 17 — FUTURE / LOW PRIORITY

| Item | Notes |
|------|-------|
| PU image zip contamination | ✅ RESOLVED. Live proxy recovers zipped photos. Genuine unrecoverable remainder: 3,573 products with no source image. |
| PU image-proxy: persistent cache | Zero server-side caching — needs Vercel Blob/S3/R2 before full browse-grid traffic. |
| PU image-proxy: browse grid spot-check | PDP confirmed. Browse grid needs visual re-confirm. |
| PU product_details remaining gap | ~3,500 products — brands that never shipped XML content. Only fixable with updated PU files. |
| Re-run `extract_pu_images.mjs` | After each new PU XML drop — idempotent. |
| Hard Drive book crossref | Import when file available |
| WPS API enrichment | Test features+blocks hit rate |
| WPS OEM crossref — 662 unmatched rows | Revisit after next WPS ingest |
| Browse/Brand tabs | Data ready, UI unbuilt |
| TC/M8 platform dedup in variant groups | Platform-aware split in build_variant_groups.cjs |
| Harden admin auth | ?token= → session cookie |
| oem_supersession PDP timeline | Show chain on OEM tab: "replaced X in [year]" |
| oem_supersession review | 283 pairs pending — SELECT * FROM oem_supersession_review LIMIT 30 |
| Accessories & Misc subcategory | 3,809 NULL — catch-all, low ROI |
| Tools & Chemicals coverage | 547 NULL — WPS abbreviations |
| Typesense reindex automation | Auto-run as post-step in ingest scripts |
| Auto-reject variant proposals on apply | When canonical merges applied, auto-reject proposals where both share same variant_group_id |
| Unknown match pipeline | Proposals with match_reason='upc' or 'brand_part_number' and null shared_oem_number — source never identified |
| Drop session 43 files | globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts |
| /models in nav | Add to main nav + home page tile |

---

## Open Issues

| Area | Issue | Status |
|------|-------|--------|
| Framer Motion | Transparent animation errors | ⏳ FRAMER_TRANSPARENT_FIX.md ready |
| Typesense | No reindex automation | 🔵 Future |
| Admin | ADMIN_SECRET not in Vercel | ⏳ |
| PU | Portal spot-check 3-4 SKUs | ⏳ Recommended |
| PU | 3,573 active products with no recoverable image | 🔵 No fix without new PU vendor data |
| Browse | Softail + Suspension + Triple Trees & Stems filter combo — untested since session 51 | ⏳ Retest |

---

*Last updated June 24, 2026 · Session 57*
