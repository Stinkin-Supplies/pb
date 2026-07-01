# STINKIN' SUPPLIES — PROJECT ROADMAP
**Last Updated: June 29, 2026 (Sixty-Fourth Pass)**

---

## ✅ PHASE 1 — FOUNDATION (Complete)

| Item | Status |
|------|--------|
| Stack: Next.js 15 / Postgres (Hetzner 5.161.100.126) / Typesense / Vercel | ✅ |
| Three vendor staging tables: pu_catalog, wps_catalog, vtwin_catalog | ✅ |
| catalog_unified — single source of truth (**89,153 active rows**) | ✅ |
| Internal SKU taxonomy (17 prefixes: ACC, BDY, BRK, DRV, ELC, ENG, EXH, etc.) | ✅ |
| harley_families / harley_models / harley_model_years (**~365 models, ~2,090 year rows** — audited session 59; +28 gap rows session 61) | ✅ |
| Typesense schema + index (**89,153 docs** — reindexed session 60) | ✅ |

---

## ✅ PHASE 2 — FITMENT INFRASTRUCTURE (Complete)

| Item | Status |
|------|--------|
| catalog_fitment_v2 as canonical fitment table (model_year_id FK) | ✅ |
| JW Boon NOS import (348K rows) | ✅ |
| PU fitment pipeline (pu_fitment → pu_fitment_parsed → pu_fitment_expanded, 1.67M rows) | ✅ |
| WPS fitment via taxonomyterms API (702K rows) | ✅ |
| VTwin fitment rounds 1+2+3 (501K original + ~86,833 new from parse_vtwin_fitment_raw.mjs) | ✅ |
| **EBC brake fitment — 3,005 net-new rows** (source='ebc_catalog', session 60 via import_ebc_fitment.mjs) | ✅ |
| Era boolean columns on catalog_unified (era_flathead → era_milwaukee8) | ✅ |
| catalog_fitment_v2 composite indexes (product_id+model_year_id, reverse) | ✅ |
| `confidence_score` column EXISTS on catalog_fitment_v2 — safe to include in INSERTs (older rows NULL) | ✅ |
| **VTwin fitment coverage: 55.8%** (21,390 products) — up from 41.1% (15,741) | ✅ |
| PU fitment coverage: ~49% — ceiling reached, no new feed available | ✅ |
| WPS fitment: 41% — correct as-is (non-HD/universal products confirmed) | ✅ |
| EBC brake products: ~89% fitment via ebc_catalog source | ✅ |
| Vintage model codes (Flathead, Knucklehead, Panhead, Shovelhead, Ironhead, police, CVO, V-Rod) | ✅ |
| FLHRX + FLI model codes added | ✅ |
| FXBFS typo corrected to FXFBS in vtwin_scrape_data | ✅ |
| **`parse_vtwin_fitment_raw.mjs`** — re-parses fitment_raw from vtwin_scrape_data; ~86,833 rows inserted | ✅ |
| **`scrape_vtwin_missing.mjs`** — GraphQL url_key discovery + HTML FITS scrape for 12,398 never-scraped VTwin SKUs; 99% hit rate; upserts vtwin_scrape_data | ✅ |

---

## ✅ PHASE 3 — OEM & CATALOG ENRICHMENT (Complete)

| Item | Status |
|------|--------|
| catalog_oem_crossref — FatBook/OldBook PDFs + VTwin PDF | ✅ |
| product_id FK backfilled | ✅ |
| PU XML enrichment pipeline (catalog_media, features, dimensions) | ✅ |
| OEM cleanup: 4,122 PU catalog numbers removed from crossref | ✅ |
| **VTwin OEM crossref — 16,752 rows** (from vtwin_catalog.oem_numbers import) | ✅ |
| **WPS OEM crossref — 2,491 rows** (1,665 from wps-cross-fitment.csv + 826 from WPS/HardDrive 2026 catalog pp.1091–1104) | ✅ |
| **PU OEM crossref — 15,330 rows** (source=PU_PIES, OSP supplier numbers from brand XML) | ✅ |
| **VTwin scrape OEM import — 5,511 rows** (source='vtwin_scrape', session 60 via import_vtwin_oem_crossref.mjs) | ✅ |
| **HD_OEM battery crossref — 63 rows** (7 H-D OEM battery SKUs → 64 BCI-matched catalog products, session 60) | ✅ |
| **HD_OEM handlebar crossref — 2 rows** (56569-86 + 56082-83 already in crossref from OldBook; 3 stock-only OEMs not in catalog) | ✅ |
| **Total catalog_oem_crossref: 65,434 rows** (pre-session 64) | ✅ |
| **Eastern Motorcycle Parts crossref — 4,832 rows** (oem_manufacturer='EASTERN'; 4,364 unique HD OEM#s; 1911–present coverage; session 64 via import_eastern_crossref.mjs) | ✅ |
| **Total catalog_oem_crossref: ~70,329 rows** | ✅ |
| OEM badge on PDP sourced only from catalog_oem_crossref (catalog numbers excluded) | ✅ |
| **WPS/HardDrive 2026 OEM crossref** — 826 product→OEM pairs imported from pp.1091–1104; 272 WPS# missing from wps_catalog (Kibble White, Diamond Chain, Carlisle, Alto specialty lines) | ✅ |
| **VTwin 2026 hardware supersession** — 202 old→new H-D OEM pairs in oem_supersession (source='vtwin'); vintage hardware format (nuts, bolts, washers, cotter pins, lock washers) | ✅ |
| pack_qty column — **2,171 active non-kit products with pack_qty > 1** | ✅ |
| scan_pack_qty_from_names.mjs — 12 auto-apply patterns; 254 corrections | ✅ |
| is_kit column — kits excluded from OEM matching | ✅ |
| **product_details JSONB column** — GIN index; **~59,253 populated (~66.5%)** — VTwin attributes fixed session 60 | ✅ |
| build_product_details.mjs — normalizes PU features + WPS HTML→bullets + VTwin description/pdp_payload. VTwin now JS-based (session 60); handles stringified attributes + extra_attributes fallback | ✅ |
| **extract_pu_images.mjs** — 133 brand XML files; 33,740 catalog_media rows; 8,828 PU descriptions; 15,330 OEM entries | ✅ |
| **ProductImageGallery.jsx** — multi-image thumbnail strip; reads catalog_media.all_urls (PU) or cu.image_urls (VTwin) | ✅ |
| PU image-proxy route — fflate-based, edge-compatible, Referer-spoofing for LeMans zips | ✅ |
| PU image-proxy persistent cache | ⏳ Zero server-side caching — needs Blob/S3/R2 before full browse-grid traffic |
| sku_counter table — created and seeded (24 prefixes) | ✅ |
| **oem_supersession table** — **485 pairs** (283 original inferred confidence=1 + 202 vtwin hardware session 59); normalize_oem() function; from_oem_norm/to_oem_norm are GENERATED columns | ✅ |
| **mv_oem_fitment_coverage** — 683K rows; recursive forward+backward chain traversal | ✅ |
| oem_supersession_review view — inferred confidence=1 pairs pending human review | ✅ |
| **ebc_brake_fitment staging table — 528 rows** (14 H-D families, EBC 2026 catalog, session 60) | ✅ |
| **hd_battery_fitment staging table — 22 rows** (7 H-D OEM battery SKUs × model/year fitment, session 60) | ✅ |
| **hd_handlebar_specs staging table — 89 rows** (OEM handlebar dims per model/year 2002-2013, session 60) | ✅ |
| **bike_specs table — 1,288 rows** (DS FatBook 2026 + OldBook 2026; battery/plugs/belt/chain/sprockets/tires/shock per model+year; UNIQUE(model_year_id, source); session 61 via import_bike_specs.mjs) | ✅ |

---

## ✅ PHASE 4 — TAXONOMY (Complete)

| Item | Status |
|------|--------|
| display_category (21 confirmed values) | ✅ |
| display_subcategory across all 20 display categories | ✅ |
| Coverage 87–97% across categories | ✅ |
| infer_vtwin_categories.mjs — VTWIN_CATEGORY_TO_DISPLAY map (28 source → 21 display); 566 products updated | ✅ |
| generate_vtwin_skus.js — full rewrite; reads catalog_unified, display_category→prefix map, writes internal_sku directly | ✅ |
| Typesense reindexed with full subcategory facets | ✅ |

---

## ✅ PHASE 5 — FRONTEND: BROWSE + SEARCH (Complete)

| Item | Status |
|------|--------|
| browse.ts — disjunctive faceting, count fix, Typesense pagination, variant dedup | ✅ |
| browse.ts — multi-word AND search across name/brand/sku | ✅ |
| browse.ts — per-query params fix (shared-array bug) | ✅ |
| browse.ts — OEM number search via `unnest(cu.oem_numbers) ILIKE` | ✅ |
| browse.ts — catalog_media image fallback | ✅ |
| browse.ts — OEM chain pre-fetch (1.3ms warm) when year+model set | ✅ |
| **`?category=` URL param stuck bug fixed** — old links fold into display_category; category never persists invisibly | ✅ |
| ProductCard.jsx / ProductImage.jsx — cream theme, broken-image fallback | ✅ |
| ProductCard.jsx — selected/onSelect props; OEM chain badge | ✅ |
| ProductImageGallery.jsx — multi-image thumbnail strip on PDP | ✅ |
| FilterSidebar — active chips, section indicators, mobile bottom sheet | ✅ |
| BrowseBackButton (sessionStorage) | ✅ |
| Browse inline panel — InlinePanel.jsx + panel API route | ✅ |
| Era pages — era_* boolean lookups | ✅ |
| PDP (/browse/[slug]) — LeMans image proxy, fitment tab, OEM tab | ✅ |
| **PDP window function crash fixed** — catalog_media lateral replaced MIN OVER with array_agg nested subquery | ✅ |
| PDP — ProductDetailsSection above fitment/OEM tabs | ✅ |
| PDP — OemAlternativesPanel removed (session 57) | ✅ |
| PDP — breadcrumb link fixed (?category= → ?display_category=) | ✅ |
| PDP — getProduct() SQL: catalog_media all_urls lateral; image_urls VTwin/PU fallback | ✅ |
| **PDP — VTwin attributes fixed at source** (session 60) — JSON.parse workaround removed from PDPTabs.jsx | ✅ |
| index_unified.js — product_details as primary source; WPS HTML stripped from Typesense | ✅ |
| QuickView modal — removed; cards navigate directly to PDP | ✅ |
| getChronologicalNeighbors — tightened to display_subcategory | ✅ |
| OEM supersession chain surfaced in browse pre-fetch | ✅ |

---

## ✅ PHASE 6 — FRONTEND: HOMEPAGE + NAVIGATION (Complete)

| Item | Status |
|------|--------|
| Font system: --font-tanker / --font-bespoke / --font-stencil | ✅ |
| Color palette: gold #C9A84C / cream #F2EAD3 / deep dark #1A1208 | ✅ |
| ModelFinder — era-first → year slider → model → /browse | ✅ |
| CategoryBentoGrid — bento layout, spring tile-origin animation | ✅ |
| FlowingMenu — /models page | ✅ |
| mv_family_product_ranges materialized view | ✅ |
| BottomNav — scroll-collapse to gold orb | ✅ |

---

## ✅ PHASE 7 — VARIANT SYSTEM (Complete)

| Item | Status |
|------|--------|
| catalog_variant_groups + catalog_variant_members tables | ✅ |
| build_variant_groups.cjs — name-based grouping, non-distinguishing axis fix (994 false groups dissolved), Brushed SS/Raw SS/Brushed finishes, normalizeAxisName() | ✅ |
| VariantSelector Mode A/B/C/D | ✅ |
| ColorQtySelector — two radio pill sections | ✅ |
| build_pack_size_groups.mjs — 148 cross-vendor MULTI pack-size variant groups; dedupByPackQty(); sync/evict on re-run | ✅ |
| catalog_variant_candidates table — 62 finish/size/length groups pending human judgment | ⏳ |
| TC/M8 platform dedup in variant groups | 🔵 Future |
| Auto-reject variant proposals on canonical apply | 🔵 Future |

---

## ✅ PHASE 8 — ADMIN TOOLING (Substantially Complete)

| Item | Status |
|------|--------|
| AdminEditPanel — inline PDP editing, catalog_review_flags | ✅ |
| admin/products/[id]/page.jsx — cream/gold/black theme, larger fonts | ✅ |
| admin/products/[id]/route.ts — update + flag + generic flat-body (GENERIC_FIELD_MAP) + pack_qty | ✅ |
| ProductManager.jsx — bulk grid, inline edit, pack_qty column, EditModal | ✅ |
| /admin/canonical-matches — full workbench (confirm/reject/flag/edit/manual-match/variant-flag/mismatch badges) | ✅ |
| /admin/variant-candidates — variant candidate tracking + resolution (images fixed via COALESCE across 3 sources) | ✅ |
| admin/products list route — search by name/sku/internal_sku/brand_part_number | ✅ |
| **/admin/parts-timeline** — OEM# span visualization per model code; category/subcat filters; colored bars with tooltip (session 64) | ✅ |
| /admin/orders — list, filter, order detail | ⏳ |
| /admin/fulfillment/vtwin — manual PO queue | ⏳ |
| /admin/inventory — per-vendor stock levels | ⏳ |
| Harden auth (?token= → session cookie) | 🔵 Future |

---

## ✅ PHASE 9 — DATA QUALITY: VENDOR SKUs (Complete)

| Item | Status |
|------|--------|
| WPS vendor_sku 100% correct | ✅ |
| VTwin vendor_sku correct (VT- prefix stripped) | ✅ |
| PU DS###### rows fixed (migration 007) | ✅ |
| PU all remaining rows fixed (migration 010) — all 36,396 active rows: vendor_sku = sku | ✅ |
| brand_part_number retained as manufacturer cross-reference only | ✅ |
| PU portal spot-check (3-4 numbers) | ⏳ Verify before treating as fully closed |

---

## ✅ PHASE 10 — CANONICAL PRODUCTS (Complete — 62 candidates remain)

| Item | Status |
|------|--------|
| canonical_products table + product_vendors table | ✅ |
| build_canonical_products.mjs Phase A + Phase B | ✅ |
| **All merges drained** — 0 pending / 2,807 applied / 1,375 rejected (session 66) | ✅ |
| **62 variant candidates** — /admin/variant-candidates; finish/size/length groups | ⏳ |
| Backfill vendor_offers from product_vendors (PU/VTwin) | ⏳ |
| Unknown match pipeline (match_reason='upc'/'brand_part_number', null shared_oem_number) | ⏳ Identify source script |

---

## ⚠️ PHASE 11 — CHECKOUT + PAYMENT (Backend Ready — GATEWAY BLOCKING)

| Item | Status |
|------|--------|
| orders / order_items / vendor_orders schema + triggers | ✅ |
| Auto order numbers SS-YYYYMMDD-NNNN | ✅ |
| CartContext (localStorage, canonical_sku-based) | ✅ |
| CartProvider wired into root layout | ✅ |
| Checkout page skeleton — address form + MAP pricing | ✅ |
| app/api/checkout/prepare/route.ts — validates cart, runs optimizer | ✅ |
| app/api/orders/create/route.ts — gateway stub, atomic order write, fulfillment dispatch | ✅ |
| **Payment gateway decision** ⚠️ BLOCKING — Braintree recommended | ⚠️ PENDING MERCHANT MEETING |
| Order confirmation page (/checkout/success) | ⏳ |
| Tax calculation (TaxJar or flat rate) | ⏳ |
| Shipping estimate (UPS/FedEx API or zone table) | ⏳ |
| PU + WPS API credentials for order submission | ⏳ |

---

## ✅ PHASE 12 — FULFILLMENT OPTIMIZER (Complete — awaiting API creds)

| Item | Status |
|------|--------|
| optimizer.ts — minimize vendor count, maximize margin, VTwin→manual | ✅ |
| triggerFulfillment.ts — inserts vendor_orders, dispatches adapters | ✅ |
| Live stock check at checkout via product_vendors | ✅ |
| PU API order submission | ⏳ Needs PU_API_URL/KEY |
| WPS API order submission | ⏳ Needs WPS_API_URL/KEY |
| VTwin → manual queue (vendor_orders, is_manual=true) | ✅ |

---

## ⏳ PHASE 13 — ADMIN: ORDERS & FULFILLMENT DASHBOARD

| Item | Status |
|------|--------|
| /admin/orders — list all orders; filter by status/vendor/date | ⏳ |
| /admin/orders/[id] — order detail + actions | ⏳ |
| /admin/fulfillment/vtwin — manual PO queue | ⏳ |
| /admin/inventory — per-vendor stock levels | ⏳ |
| Invoice PDF generation | ⏳ |

---

## ⏳ PHASE 14 — AUTOMATED SYNC & NOTIFICATIONS

| Item | Status |
|------|--------|
| Daily price/stock sync cron — PU + WPS | ⏳ |
| Order status webhooks — PU/WPS shipment handlers | ⏳ |
| Customer email notifications — confirmation, shipped, delivered | ⏳ |
| Typesense stock sync without full reindex | ⏳ |

---

## ⏳ PHASE 15 — FRONTEND CLEANUP

| Item | Status |
|------|--------|
| Fix Framer Motion transparent errors (FRAMER_TRANSPARENT_FIX.md ready) | ⏳ |
| Add 9 remaining model images (400×160px at public/images/models/{slug}.jpg) | ⏳ |
| /models link in main nav | ⏳ |
| Mobile layout pass /models — FlowingMenu too tall on mobile | ⏳ |
| flathead.webp missing from public/images/eras/ | ⏳ |
| ADMIN_SECRET to Vercel (`npx vercel env add ADMIN_SECRET`) | ⏳ |
| Drop session 43 files (globals.css, layout.tsx, BespokeSerif-Variable.ttf, etc.) | ⏳ |

---

## ✅ PHASE 16 — VTWIN CATALOG GAPS (Complete)

| Item | Status |
|------|--------|
| **Fix build_product_details.mjs VTwin attributes** — JS-based rewrite; parseVtwinAttributes() handles object/string/double-string; extra_attributes fallback. 2,499 products corrected. | ✅ Session 60 |
| **PDPTabs.jsx JSON.parse workaround removed** — attributes read directly as object | ✅ Session 60 |
| **Import vtwin_scrape_data.oem_no → catalog_oem_crossref** — 5,511 rows inserted (source='vtwin_scrape') | ✅ Session 60 |
| VTwin product_details gap (23K+ products) — no description/pdp_payload | 🔵 |
| Re-run scrape_vtwin_missing.mjs on newly added VTwin SKUs | 🔵 |

---

## 🔵 PHASE 17 — FUTURE / LOW PRIORITY

| Item | Notes |
|------|-------|
| PU image-proxy persistent cache | Zero server-side caching — Vercel Blob/S3/R2 needed for browse-grid scale |
| PU image-proxy browse grid spot-check | PDP confirmed; browse grid visual confirm pending |
| 3,573 PU products with no recoverable image | No source photo exists; stays on placeholder |
| Re-run extract_pu_images.mjs | After each PU XML drop — idempotent |
| Hard Drive book crossref | Import when file available |
| WPS API enrichment | Features+blocks hit rate testing |
| WPS OEM crossref — 662 unmatched rows | Revisit after next WPS ingest |
| oem_supersession review | 283 original inferred pairs pending — `SELECT * FROM oem_supersession_review LIMIT 30`; 202 vtwin hardware pairs are solid (source catalog) |
| oem_supersession PDP timeline | Show chain on OEM tab: "replaced X in [year]" |
| TC/M8 platform dedup in variant groups | Platform-aware split in build_variant_groups.cjs |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Harden admin auth | ?token= → session cookie |
| Typesense reindex automation | Auto-run as post-step in ingest scripts |
| Unknown match pipeline | match_reason='upc'/'brand_part_number' — source never identified |
| oem_fitment table | **315,427 rows** (session 65) — 121 catalogs. `catalog_family` column added. 130K year-annotation noise rows eliminated. Universal promotion now family-scoped. Re-run `--force` after adding catalogs. |
| OCR 4 image-only PDFs | FX 1971-80, FX 1971-84, Softail 2002, WLA 1942 — need `brew install ocrmypdf` |
| Missing catalogs | 2024 Touring, Softail 2016, Sportster 1979-1985 — user still sourcing |
| Brake/battery/handlebar/spec finder pages | ebc_brake_fitment + hd_battery_fitment + hd_handlebar_specs + bike_specs staging tables ready — frontend pages unbuilt |
| EBC catalog annual refresh | parse_ebc.py reusable; run against new Issue PDF each year |
| scrape_vtwin_missing.mjs pg pool fix | Replace concurrent client queries with pool.query() |

---

## Open Issues

| Area | Issue | Status |
|------|-------|--------|
| Payment gateway | Merchant account meeting pending | ⚠️ BLOCKING |
| Framer Motion | Transparent animation errors — fix doc ready, not applied | ⏳ |
| Admin | ADMIN_SECRET not added to Vercel | ⏳ |
| PU | Portal spot-check 3-4 corrected SKUs | ⏳ Recommended |
| Browse | Softail + Suspension + Triple Trees filter combo — untested since session 51 | ⏳ Retest |
| scrape_vtwin_missing.mjs | pg deprecation warning (concurrent queries on single client) — not failing | ⏳ Low urgency |
| catalog_oem_crossref | 826 WPS 2026 catalog entries have NULL source — no source column value specified on INSERT | ⏳ Low priority |
| FLHXU 2025 | Street Glide Ultra (2025-only model, predecessor to FLHXL) has 0 WPS fitment rows | 🔵 Monitor after next WPS feed |
| oem_supersession | 283 original inferred pairs confidence=1 still pending review | ⏳ |
| catalog_variant_candidates | 62 groups pending human review | ⏳ |

---

*Last updated June 30, 2026 · Session 66*
