# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 19, 2026 — Twenty-Third Pass**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | vendor_offers rebuild | Source from wps_catalog (not raw_vendor_wps_products — doesn't exist). Warehouse mapping: boise→id_qty, fresno→ca_qty, elizabethtown→pa_qty, ashley→in_qty, midlothian→tx_qty, jessup→ga_qty, midway→nv_qty, nc=0 |
| 2 | catalog_unified rebuild | PU enrichment landed in pu_catalog but catalog_unified has stale PU data. Run: merge_vendors.js → ingest_vtwin_unified.js → infer_vtwin_categories.mjs --live → index_unified.js --recreate |
| 3 | VTwin fitment pipeline | vtwin_oem_crossref (12,278 pairs) → catalog_fitment_v2. Big coverage win for vintage/classic parts |
| 4 | WPS fitment files | Pending from rep since April 30 — follow up |
| 5 | Product grid OEM badge | Badge on cards with oem_numbers. Hover=fitment popover. Mobile=bottom sheet |
| 6 | Verify PDP NavBar on Vercel | NavBar import added to ProductDetailClient.jsx — confirm live deploy no longer crashes |
| 7 | Category subcategory filter | Second-level filter row e.g. Lighting → Headlamps / Turn Signals / Tail Lights |

---

## ✅ DONE MAY 19 — TWENTY-THIRD PASS

| Area | What Was Done |
|------|---------------|
| STINKIN'' fix | browse/page.jsx line 563 — removed extra span apostrophe |
| Category labels | apply_category_labels.py ran — era + model pages updated |
| Typesense reindex | 87,219 docs post-category fix, 0 errors |
| PU XML enrichment | New script enrich_pu_xml_comprehensive.js — 133 XMLs parsed, 32,822 pu_catalog rows updated. All fields: features, images, OEM, pricing, dimensions, status. Overwrites stale data. 0 errors |
| pu_catalog varchar fix | Widened uom, part_status, brand_code, warehouse_code, country_of_origin, commodity_code, last_catalog, last_catalog_page — were too narrow for XML data |
| catalog_media migration | FK migrated from catalog_products → catalog_unified. Truncated 154,613 corrupted rows. Rebuilt with 32,718 clean PU image rows |
| VTwin oem consolidation | vtwin_catalog.oem_xref1/2/3 → oem_numbers[]. 13,449 rows now have OEM arrays (was 420) |
| VTwin ingest | New ingest_vtwin_unified.js sources from vtwin_catalog directly. 37,749 rows inserted, 0 errors. All active, 30,857 with images, 13,449 with OEM numbers |
| VTwin categories | infer_vtwin_categories.mjs --live — 100% match, 0 unmatched, 28 categories assigned |
| Typesense reindex | 88,234 docs (WPS 14,247 + PU 36,238 + VTWIN 37,749), 0 errors |
| ModelSearch slider | May 19 morning — year slider, GO button, catch-all routing |
| models/search API | May 19 morning — canonical join, catch-all flagging |
| Vintage model codes | May 19 morning — ELH, FL, FLH, FLF, FLHF, FLE added to DB |
| Era coverage | May 19 morning — knucklehead/panhead promoted to limited |
| SECURITY-COVERS-SHELTERS fix | May 19 morning — ~176 VTwin products moved to correct categories |
| PDP NavBar crash | May 19 morning — NavBar import added to ProductDetailClient.jsx |

---

## 🔴 HIGH PRIORITY

| Task | Notes |
|------|-------|
| vendor_offers rebuild | 0 rows — fulfillment routing broken. Source from wps_catalog |
| catalog_unified rebuild | PU enrichment not yet reflected — stale features/images/pricing in unified |
| VTwin fitment pipeline | vtwin_oem_crossref → catalog_fitment_v2 — 12,278 pairs ready |
| WPS fitment files | Pending from rep since April 30 |
| Verify PDP NavBar on Vercel | Committed — check live deploy |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Category subcategory filter | Second drill-down level on category tabs |
| Product grid OEM badge | Badge + hover popover on cards with oem_numbers |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products before full run |
| WPS vehicle scopes | Request vehicle:read + vehiclemodel:read from WPS for fitment data |
| PDP redesign | Light/gold/white theme — after fitment stable |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Cron jobs | Hold until stable |
| Expand fitment coverage | 88,234 products total, 20% fitment coverage. Need OEM source data esp. vintage |
| Panhead era coverage | 1 product — limited. Needs OEM source data |
| Flathead era coverage | 26 products — limited, banner shown. flathead.webp missing from public/images/eras/ |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| harley_families slug column | No slug column — derived via CASE in queries. Consider adding for cleanliness |
| VT-16- timing tools | 7 rows in SECURITY-COVERS-SHELTERS — small count, manually verify correct category |
| catalog_media WPS images | Only PU images in catalog_media. WPS images served via CDN proxy — consider populating catalog_media for WPS too |
| PU multi-image | Per-product LeMans zip files (image_zip column) contain multiple angles — not yet fetched |
