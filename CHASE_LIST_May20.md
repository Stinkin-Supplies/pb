# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 20, 2026 — Twenty-Fourth Pass**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Verify pu_fitment_expanded finished | Check row count — should be ~1.67M. Then reindex Typesense |
| 2 | Promote pu_fitment → catalog_fitment_v2 | Join pu_fitment_parsed to catalog_unified on sku, insert to catalog_fitment_v2. Script TBD |
| 3 | Backfill era_* columns on catalog_unified | All 0 after rebuild — era filter in sidebar broken until done |
| 4 | VTwin fitment pipeline | vtwin_oem_crossref (12,278 pairs) → catalog_fitment_v2 |
| 5 | WPS fitment files | Pending from rep since April 30 — follow up |
| 6 | Verify sidebar filter end-to-end | subcategory + modelCodes params flowing through API correctly |

---

## ✅ DONE MAY 20 — TWENTY-FOURTH PASS

| Area | What Was Done |
|------|---------------|
| vendor_offers | Rebuilt from wps_catalog — 22,278 rows, all priced, 15,921 in stock |
| catalog_unified rebuild | New merge_catalog_unified.js — 96,711 rows (WPS+PU+VTwin), 0 errors |
| VTwin categories | 37,749 rows, 100% match |
| Typesense reindex | 90,276 docs, 0 errors |
| vendor_offers re-run | Re-ran after rebuild to refresh PKs |
| PU fitment scrape ingest | New script ingest_pu_fitment_scrape.cjs — 13,913 SKUs, 393K parsed rows, 1.67M expanded (still running) |
| OEM badge | Gold ribbon SVG on product cards when oem_numbers present |
| ProductDetailClient rewrite | Cream/gold theme, vertical gallery, placeholder cart, product modal, tabs |
| FilterSidebar component | Standalone component — collapsible, Model Family with sub-models, Era, Category, Subcategory, Brand, Price |
| browse.ts + route.ts | subcategory facet, modelCodes[] array filter support |
| BrandRolodex fix | position bug fixed, height reduced, logos centered |

---

## 🔴 HIGH PRIORITY

| Task | Notes |
|------|-------|
| pu_fitment_expanded finish | Still inserting ~1.67M rows — check before touching DB |
| Promote pu_fitment → catalog_fitment_v2 | Major fitment coverage expansion — 13,913 new SKUs |
| Backfill era_* columns | Era filter shows nothing until populated |
| VTwin fitment pipeline | vtwin_oem_crossref → catalog_fitment_v2 — 12,278 pairs ready |
| WPS fitment files | Pending from rep since April 30 |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
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
| Product modal variants | catalog_variants table doesn't exist — no real variant data yet |
| Cart wiring | Placeholder only — CartContext / addItem needs real implementation |
