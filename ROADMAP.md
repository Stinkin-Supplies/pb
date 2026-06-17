# STINKIN' SUPPLIES — PROJECT ROADMAP
**Last Updated: June 16, 2026 (Fifty-First Pass)**

---

## ✅ PHASE 1 — FOUNDATION (Complete)

| Item | Status |
|------|--------|
| Stack: Next.js 15 / Postgres (Hetzner 5.161.100.126) / Typesense / Vercel | ✅ |
| Three vendor staging tables: pu_catalog, wps_catalog, vtwin_catalog | ✅ |
| catalog_unified — single source of truth (90,605 active rows) | ✅ |
| Internal SKU taxonomy (17 prefixes: ACC, BDY, BRK, DRV, ELC, ENG, EXH, etc.) | ✅ |
| harley_families / harley_models / harley_model_years (~360 models, ~2,070 year rows) | ✅ |
| Typesense schema + index (~90K docs) | ✅ |

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
| VTwin OEM sync: 15,723 products synced | ✅ |
| OEM badge on PDP sourced only from catalog_oem_crossref (vendor catalog numbers excluded) | ✅ |
| pack_qty column — 1,026 rows populated via regex bulk pass | ✅ |
| Pack qty badge on PDP | ✅ |
| AdminEditPanel pack_qty field | ✅ |

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
| browse.ts — per-query params rendering (fixed shared-array bug across product/count/3 facet queries) | ✅ |
| browse.ts / pdp-page.jsx — catalog_media image fallback when image_url null/empty | ✅ (does not cover PU zip-contaminated rows — see Phase 16) |
| ProductCard.jsx / pdp-page.jsx — cream theme conversion | ✅ |
| ProductImage.jsx — graceful broken-image fallback (client component for server-component pages) | ✅ |
| FilterSidebar — active filter chips, section indicators, mobile bottom sheet | ✅ |
| BrowseBackButton (sessionStorage) | ✅ |
| Typesense group_by: variant_group_id | ✅ |
| Era pages (era_* boolean column lookups) | ✅ |
| PDP (/browse/[slug]) — LeMans image proxy, fitment tab, OEM tab | ✅ |
| QuickView modal removed — cards navigate directly to PDP | ✅ |
| Placeholder "400×400" image removed — returns null when no real image | ✅ |
| OEM supersession chain — oem_supersession (283 pairs), mv_oem_fitment_coverage (683K rows) | ✅ |
| browse.ts OEM chain pre-fetch — surfaces chain products when year+model set (1.3ms warm) | ✅ |
| getChronologicalNeighbors — tightened to display_subcategory, timeline shows same part type | ✅ |

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
| Wire spool groups merged | ✅ |
| VariantSelector Mode A (fitment+color), B (fitment only), C (options list), D (color+qty) | ✅ |
| ColorQtySelector — two radio pill sections, auto-navigates to cheapest in-stock | ✅ |
| apply_oversize_variants.cjs — cross-oversize grouping (73 groups, 332 members) | ✅ |
| Oversize variant Typesense reindex (90,605 docs, 0 errors) | ✅ |
| catalog_variant_candidates table | ✅ |
| Fits axis removed from WPS variant members — no more year ranges as selectable options | ✅ |
| Brushed SS / Brushed / Raw SS added to Finish rule in extractAttribute | ✅ |
| normalizeAxisName() — Finish→Color normalization prevents mixed-axis splits | ✅ |

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

## ⏳ PHASE 10 — CANONICAL PRODUCTS: MULTI-VENDOR MATCHING (In Progress)

The foundation exists. The work now is promoting reviewed pairs into real multi-vendor canonicals.

| Item | Status |
|------|--------|
| canonical_products table (90,605 rows, schema correct) | ✅ |
| product_vendors table (90,605 rows, one per unified row) | ✅ |
| canonical_match_proposals (1,537 initial reviewed down to ~37 groups remaining) | ✅ In Progress |
| build_canonical_products.mjs Phase A + Phase B | ✅ |
| is_kit column, pack_qty column | ✅ |
| **Finish admin review** — ~37 groups / ~187 pairs remaining at /admin/canonical-matches | ⏳ |
| **Promote confirmed merges** — script to merge winning pairs into shared canonical records with 2–3 product_vendors rows each. Currently 0 multi-vendor canonicals exist. | ⏳ |
| **Backfill vendor_offers from product_vendors** — PU and VTwin cost/stock needs to flow into vendor_offers (currently only 22,278 WPS rows). Optimizer needs one unified pricing table. | ⏳ |
| Variant candidates flagged for later variant building | ⏳ Ongoing |

---

## ⏳ PHASE 11 — CHECKOUT + PAYMENT (Backend Ready, Gateway TBD)

Schema is complete. Only blocker is gateway decision.

| Item | Status |
|------|--------|
| orders / order_items / vendor_orders tables — full schema, triggers, indexes | ✅ |
| Auto order numbers SS-YYYYMMDD-NNNN trigger | ✅ |
| CartContext (localStorage, canonical_sku-based) | ✅ |
| CartProvider wired into root layout | ✅ |
| Checkout page skeleton (app/checkout/page.jsx) with address form + MAP pricing | ✅ |
| checkout/prepare route (optimizer + order creation stub) | ✅ |
| **Payment gateway decision** — Authorize.net / NMI / Heartland / Braintree? | ⚠️ BLOCKING — reminder set for Wed June 17 |
| **POST /api/orders/create** — validate cart, compute totals, write orders + order_items, charge gateway, return order number | ⏳ After gateway |
| **Order confirmation page** — /checkout/success needs real order data + email receipt | ⏳ |
| Tax calculation — TaxJar or flat rate table | ⏳ |
| Shipping estimate — UPS/FedEx API or flat rate by zone | ⏳ |
| PU + WPS API credentials for order submission | ⏳ |

---

## ⏳ PHASE 12 — FULFILLMENT OPTIMIZER (Ready to build now)

All DB tables are correct. Can start this immediately.

| Item | Status |
|------|--------|
| vendor_orders table — all fields present (vendor, is_manual, api_payload, retry_count) | ✅ |
| order_items.is_manual_fulfillment — VTwin flag in schema | ✅ |
| triggerFulfillment.ts — PU/WPS/VTwin adapters stubbed | ✅ |
| **lib/fulfillment/optimizer.ts** — given order items, return vendor routing: (1) minimize vendor count, (2) maximize margin within vendor, (3) live stock check at resolution time, (4) VTwin → manual queue | ⏳ |
| Live stock check at checkout — query vendor_offers before charging, auto-fallback to next vendor | ⏳ |
| PU API order submission — auto-submit, capture vendor order number | ⏳ Needs API creds |
| WPS API order submission — scaffolding exists, needs creds | ⏳ Needs API creds |
| VTwin → manual queue — write vendor_orders row with is_manual=true | ⏳ |

---

## ⏳ PHASE 13 — ADMIN: ORDERS & FULFILLMENT DASHBOARD (Ready to build)

| Item | Status |
|------|--------|
| /admin/orders — list all orders; filter by status/vendor/date; sale price, cost, margin | ⏳ |
| /admin/orders/[id] — order detail: items, vendor routing, gateway txn ID, timeline; actions: refund/cancel/resubmit | ⏳ |
| /admin/fulfillment/vtwin — manual PO queue: customer address, vendor cost; mark submitted, enter tracking; customer auto-notified | ⏳ |
| /admin/inventory — per-vendor stock levels, last sync time, drift warnings, manual resync trigger | ⏳ |
| /admin/margins — margin by vendor / category / product; optimizer savings tracker | ⏳ |
| Invoice PDF generation — one PDF per order tied to gateway txn ID, attached to confirmation email | ⏳ |

---

## ⏳ PHASE 14 — AUTOMATED SYNC & NOTIFICATIONS (After Phase 12)

| Item | Status |
|------|--------|
| Daily price/stock sync cron — app/api/cron/ exists; add PU + WPS jobs; update vendor_offers; flag drift | ⏳ |
| Order status webhooks — app/api/webhooks/ exists; add PU/WPS shipment handlers; auto-update tracking | ⏳ |
| Customer email notifications — order confirmation, shipped (with tracking), delivered via Resend or Postmark | ⏳ |
| Typesense stock sync — patch in_stock after vendor_offers update without full reindex | ⏳ |

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

## 🔵 PHASE 16 — FUTURE / LOW PRIORITY

| Item | Notes |
|------|-------|
| PU image zip contamination | **Confirmed June 16** — not "not yet fetched," confirmed broken. ~13,790 active PU products (37.6%) have `image_url` resolving to `application/x-zip` across three independent sources (`catalog_unified.image_url`, `pu_catalog.product_image`, `pu_brand_enrichment.image_uri`). PU's feed never shipped a direct image for these — only a zip archive. Stopgap (null + placeholder) and real fix (extract from zip) both scoped in `PU_ZIP_EXTRACTION_TODO.md`. |
| Hard Drive book crossref | Same pattern as FatBook/OldBook |
| WPS API enrichment | features+blocks hit rate testing |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Admin flag batch resolver | Bulk resolve unreviewed flags |
| Harden admin auth | ?token= → session cookie |
| Size variant grouping | Valve guides, rocker shims, helmet pads, cam lock washers |
| Accessories & Misc subcategory | 3,809 NULL — catch-all, low ROI |
| Tools & Chemicals coverage | 547 NULL — WPS abbreviations |
| display_subcategory master script | Consolidate all mapping SQL into one place |
| Typesense reindex automation | Auto-run as post-step in ingest scripts |

---

## Open Issues

| Area | Issue | Status |
|------|-------|--------|
| Framer Motion | Transparent animation errors | ⏳ FRAMER_TRANSPARENT_FIX.md ready |
| Typesense | No reindex automation | 🔵 Future |
| Admin | ADMIN_SECRET not in Vercel | ⏳ |
| PU | Portal spot-check 3-4 SKUs | ⏳ Recommended |
| PU | ~13,790 active products have zip-contaminated image_url (confirmed June 16) | ⏳ See PU_ZIP_EXTRACTION_TODO.md |

---

*Last updated June 16, 2026 · Session 51*
