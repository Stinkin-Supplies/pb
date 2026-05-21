# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 20, 2026 — Twenty-Fourth Pass (Evening)**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Promote pu_fitment → catalog_fitment_v2 | pu_fitment_expanded done (1.64M rows). Join pu_fitment_parsed → catalog_unified on sku, insert to catalog_fitment_v2. Script TBD |
| 2 | Re-run build_variant_groups.cjs after fitment promote | Cable variant labels will populate from fitment data |
| 3 | VTwin fitment pipeline | vtwin_oem_crossref (12,278 pairs) → catalog_fitment_v2. Script TBD |
| 4 | WPS fitment files | Pending from rep since April 30 — follow up |
| 5 | Fix TwoAxisSelector data scope bug | References `data` out of scope for group display name — harmless but messy |
| 6 | Verify sidebar filter end-to-end | subcategory + modelCodes params flowing through API correctly |

---

## ✅ DONE MAY 20 — TWENTY-FOURTH PASS (EVENING)

| Area | What Was Done |
|------|---------------|
| WPS product ID backfill | backfill_wps_product_ids.cjs — 22,184 SKUs filled, 5,764 distinct product groups |
| Variant groups | build_variant_groups.cjs — 2,887 groups, 19,464 members |
| Variant option labels | 17,762 members populated from name variation, 4,080 split into Color+Size |
| VariantSelector UI | Two-axis (Color+Size pills) + single-axis (fitment list) — auto-detects mode |
| Variants API route | app/api/browse/variants/[productId]/route.ts |
| ProductDetailClient | Cleaned — VariantSelector integrated, styled-jsx removed, proxyImg fixed |
| page.jsx (PDP) | unified_id fix — product.id now always catalog_unified.id |
| Era columns backfill | 12,721 products tagged across 10 era_* columns |
| Typesense reindex | 90,276 docs, 0 errors, era columns live |
| VTwin category cleanup | GROUP suffix stripped from 74,287 rows |
| pu_fitment_expanded | Completed — 1,640,065 rows |

## ✅ DONE MAY 20 — TWENTY-FOURTH PASS (EARLIER)

| Area | What Was Done |
|------|---------------|
| vendor_offers | Rebuilt from wps_catalog — 22,278 rows, all priced, 15,921 in stock |
| catalog_unified rebuild | New merge_catalog_unified.js — 96,711 rows (WPS+PU+VTwin), 0 errors |
| VTwin categories | 37,749 rows, 100% match |
| Typesense reindex | 90,276 docs, 0 errors |
| vendor_offers re-run | Re-ran after rebuild to refresh PKs |
| PU fitment scrape ingest | New script ingest_pu_fitment_scrape.cjs — 13,913 SKUs, 393K parsed rows, 1.64M expanded |
| OEM badge | Gold ribbon SVG on product cards when oem_numbers present |
| ProductDetailClient rewrite | Cream/gold theme, vertical gallery, placeholder cart, product modal, tabs |
| FilterSidebar component | Standalone component — collapsible, Model Family with sub-models, Era, Category, Subcategory, Brand, Price |
| browse.ts + route.ts | subcategory facet, modelCodes[] array filter support |
| BrandRolodex fix | position bug fixed, height reduced, logos centered |

---

## 🔴 HIGH PRIORITY

| Task | Notes |
|------|-------|
| Promote pu_fitment → catalog_fitment_v2 | 1.64M expanded rows ready — script TBD to insert into v2 |
| VTwin fitment pipeline | vtwin_oem_crossref → catalog_fitment_v2 — 12,278 pairs ready |
| WPS fitment files | Pending from rep since April 30 — cable variant labels blocked on this |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| TwoAxisSelector data scope bug | References `data` out of scope — harmless, fix next pass |
| Sidebar filter end-to-end verify | subcategory + modelCodes params |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products before full run |
| WPS vehicle scopes | Request vehicle:read + vehiclemodel:read from WPS for fitment data |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Cron jobs | Hold until stable |
| flathead.webp | Missing from public/images/eras/ |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| harley_families slug column | No slug column — derived via CASE. Consider adding |
| catalog_media WPS images | Only PU images in catalog_media — WPS served via CDN proxy |
| PU multi-image | image_zip column has multiple angles — not yet fetched |
| Cart wiring | Placeholder only — CartContext / addItem needs real implementation |
| catalog_unified category map | MasterRef still shows GROUP suffix — update display labels |
