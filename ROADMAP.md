# STINKIN' SUPPLIES — PROJECT ROADMAP
**Last Updated: July 2, 2026 (Sixty-Eighth Pass)**

---

## ✅ PHASE 1 — FOUNDATION (Complete)

| Item | Status |
|------|--------|
| Stack: Next.js 15 / Postgres (Hetzner 5.161.100.126) / Typesense / Vercel | ✅ |
| Three vendor staging tables: pu_catalog, wps_catalog, vtwin_catalog | ✅ |
| catalog_unified — single source of truth (**90,629 active rows**) | ✅ |
| Internal SKU taxonomy (17 prefixes: ACC, BDY, BRK, DRV, ELC, ENG, EXH, etc.) | ✅ |
| harley_families / harley_models / harley_model_years (**347 models, 3,290 year rows** — audited session 59; +28 gap rows session 61; 3 duplicate Dyna models merged + 6 redundant generic-bucket rows removed session 68) | ✅ |
| Typesense schema + index (**90,629 docs, 0 errors** — reindexed session 68) | ✅ |

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
| **Eastern Motorcycle Parts crossref (4,832 rows) linked to products for the first time** — 0 → 3,103 linked via oem_number = ANY(oem_numbers[]); 606 products gained fitment (session 68) | ✅ |
| **PU brand-file XML corpus mined for fitment** — all 133 brand XMLs; 42 products / 1,148 rows (session 68) | ✅ |
| **Colony Machine 2026 catalog mined for fitment** — Kit Application Index tables; 84 products / 7,887 rows (session 68) | ✅ |
| **GMA Engineering (PU brand) — 3 forward-control SKUs fitted, 27 correctly flagged is_universal instead of guessed** (session 68) | ✅ |
| **catalog_unified flat fitment columns synced catalog-wide for the first time** — was 0% populated (0/97,277); now 45,659 products synced via new `sync_fitment_flat_columns.mjs` (session 68) | ✅ |

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
| **Total catalog_oem_crossref: 70,329 rows** | ✅ |
| **Eastern crossref linked to product_id for the first time** — 0 → 3,103 rows, via oem_number = ANY(cu.oem_numbers[]) instead of sku (Eastern's own catalog numbering doesn't match vendor_sku); session 68 via backfill_eastern_crossref_fitment.mjs | ✅ |
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
| **browse.ts — ILIKE 2-word threshold for 3+ word queries (session 67)** — "brake rotor street glide" no longer returns 0 | ✅ |
| `?category=` URL param stuck bug fixed — old links fold into display_category; category never persists invisibly | ✅ |
| ProductCard.jsx / ProductImage.jsx — cream theme, broken-image fallback | ✅ |
| ProductCard.jsx — selected/onSelect props; OEM chain badge | ✅ |
| ProductImageGallery.jsx — multi-image thumbnail strip on PDP | ✅ |
| FilterSidebar — active chips, section indicators, mobile bottom sheet | ✅ |
| BrowseBackButton (sessionStorage) | ✅ |
| Browse inline panel — InlinePanel.jsx + panel API route | ✅ |
| Era pages — era_* boolean lookups | ✅ |
| PDP (/browse/[slug]) — LeMans image proxy, fitment tab, OEM tab | ✅ |
| PDP window function crash fixed — catalog_media lateral replaced MIN OVER with array_agg nested subquery | ✅ |
| PDP — ProductDetailsSection above fitment/OEM tabs | ✅ |
| PDP — breadcrumb link fixed (?category= → ?display_category=) | ✅ |
| PDP — VTwin attributes fixed at source (session 60) — JSON.parse workaround removed from PDPTabs.jsx | ✅ |
| **PDP — OemPartTimeline component (session 67)** — two-panel: left=options for OEM#, right=year carousel. Modal with image/brand/packQty/price. No vendor data shown. | ✅ |
| **`lib/getOemPartTimeline.ts` (session 67)** — server function; older/same_year/newer/current buckets; returns null when no family | ✅ |
| **Typesense search properly wired (session 67)** — `route.ts` now calls Typesense server-side when `?q=` present; was indexed but never called before this session | ✅ |
| **`fitment_text` Typesense field (session 67)** — combined family+model+code+year string per product; "Street Glide" in search now matches via fitment data | ✅ |
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

## ✅ PHASE 10 — CANONICAL PRODUCTS (Complete — 15 ambiguous groups + 74 missed-merges remain)

| Item | Status |
|------|--------|
| canonical_products table + product_vendors table | ✅ |
| build_canonical_products.mjs Phase A + Phase B | ✅ |
| **All OEM-based merges drained** — 0 pending / 2,807 applied / 1,375 rejected (session 66) | ✅ |
| **62 variant candidates** — /admin/variant-candidates; finish/size/length groups | ⏳ |
| Backfill vendor_offers from product_vendors (PU/VTwin) | ⏳ |
| Unknown match pipeline (match_reason='upc'/'brand_part_number', null shared_oem_number) | ✅ Resolved session 70 — `match_reason='brand_part_number'` was a legitimate value already used by the admin "admin-select" manual-match path (1,440 pre-existing rows); it just had no automated generator until session 70. Root cause: Phase B only ever proposed on OEM number, never checked brand_part_number at all — 89% of duplicate-part-number pairs had literally zero proposal of any kind. |
| **Canonical match audit (session 70)** — read-only audit found 3,898 missed-merge groups (duplicate cards) + 38 false-merge groups (wrong products sharing a card) | ✅ Missed-merges → 74, false-merges → 22 after fix. See HANDOFF_LOG "SEVENTIETH PASS" for full detail. |
| 15 ambiguous false-merge groups needing Laken's parts-domain review | ⏳ Session 70 — see HANDOFF_LOG for the id list |
| 74 remaining missed-merge groups + 61 auto-rejected proposals from session 70's batch | ⏳ Unverified as of session 70 |
| Extend build_canonical_products.mjs Phase B to check brand_part_number going forward | 🔵 Future — otherwise the gap reopens for every newly ingested product |

---

## ⚠️ PHASE 11 — CHECKOUT + PAYMENT (Stripe Wired Interim — Page Rebuild Pending)

**Session 69 architecture decision:** the live `checkout/page.jsx` was discovered to be running on an entirely separate, abandoned Supabase architecture (own routing engine, own Stripe Checkout Sessions flow, own orders schema) with no connection to `canonical_products`/the fulfillment optimizer. Decided: Postgres is canonical going forward, old Supabase checkout stack (`checkout/create-session`, `checkout/create-order`, `webhooks/stripe`) is being retired. Auth only stays on Supabase.

| Item | Status |
|------|--------|
| orders / order_items / vendor_orders schema + triggers | ✅ |
| Auto order numbers SS-YYYYMMDD-NNNN | ✅ |
| CartContext (localStorage, canonical_sku-based) | ✅ Fixed session 69 — was never actually populated; see filter_roadmap session 69 note |
| CartProvider wired into root layout | ✅ |
| Checkout page skeleton — address form + MAP pricing | ⚠️ Old version still live, on retired Supabase architecture — full rebuild is next session's first job |
| app/api/checkout/prepare/route.ts — validates cart, runs optimizer, points preview | ✅ Updated session 69 with points discount calc |
| app/api/stripe/create-intent/route.ts — Stripe PaymentIntent, points-aware | ✅ Session 69 (rewritten — old version used dead pricing engine) |
| app/api/orders/create/route.ts — Stripe charge verification, atomic order write, points debit/credit, fulfillment dispatch | ✅ Session 69 |
| app/api/account/points/route.ts — balance lookup | ✅ Session 69 |
| customer_points table + orders points columns | ⏳ Migration written (`migrate_add_points.sql`), **not yet run** |
| **Payment gateway decision** — Stripe wired as interim; Braintree still the long-term recommendation | ⚠️ PENDING MERCHANT MEETING |
| Order confirmation page (/checkout/success) | ⏳ Exists on old architecture, needs rebuild alongside checkout page |
| Tax calculation (TaxJar or flat rate) | ⏳ |
| Shipping estimate (UPS/FedEx API or zone table) | ⏳ |
| PU + WPS API credentials for order submission | ⏳ |
| `userId` server-side verification (currently client-trusted in points-aware routes) | ⏳ Flagged session 69 — fine for demo, not for real money |

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
| oem_supersession review | 283 original inferred pairs pending — `SELECT * FROM oem_supersession_review LIMIT 30`; 202 vtwin hardware pairs are solid (source catalog); **delete 2 wrong cable-type pairs flagged session 67** |
| oem_supersession PDP timeline | Show chain on OEM tab: "replaced X in [year]" |
| OemPartTimeline modal animation | Removed framer-motion (transform conflict). Re-add with ReactDOM.createPortal approach to avoid centering issue |
| OemPartTimeline — same-year siblings display | When many products share an OEM#, left panel can get long. Consider max-height scroll or "show all" toggle |
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
| oem_supersession | 283 original inferred pairs confidence=1 still pending review. **2 flagged wrong session 67:** `56308-88→56309-96` (Throttle→Idle cable mismatch) and `56324-81A→56356-92` (wrong cable length) | ⏳ |
| catalog_variant_candidates | 62 groups pending human review | ⏳ |
| OemPartTimeline | framer-motion removed from modal — no enter/exit animation. Can re-add with portal approach when desired. | 🔵 Future |
| **catalog_unified flat fitment columns** | Must re-run `node scripts/ingest/sync_fitment_flat_columns.mjs` after any script writes to catalog_fitment_v2, before every Typesense reindex — nothing does this automatically yet. Was 0% populated catalog-wide until session 68. | ⏳ Needs automation |
| **Colony brand fitment data** | User believed a Colony dataset was already loaded into the DB this session — never found (searched every table). Colony fitment was instead sourced fresh from Colony's own 2026 catalog PDF. If the originally-intended dataset turns up later, check for conflicts against `colony_2026_catalog` fitment rows before merging. | ⏳ Awaiting user |
| **PU/VTWIN/WPS remaining no-fitment/no-OEM gap** | Post session 68: PU brand-XML corpus and Colony/Eastern catalogs both exhausted of easily-parseable signal (42/84/606 products recovered respectively — most of the 133 PU brand files and Colony's/Eastern's catalogs simply don't name a bike-specific model+year for the remaining SKUs). VTWIN gap list exported (`vtwin_no_fitment_2026-07-02.csv`, 15,511 rows) for external scraper. | 🔵 No further script-mineable signal without new vendor feeds |

---

*Last updated July 3, 2026 · Session 69 (see HANDOFF_LOG.md "SIXTY-NINTH PASS" for full session detail)*
