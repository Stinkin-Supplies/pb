# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 22, 2026 — Twenty-Seventh Pass**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Fix PU product images | `ProductDetailClient.jsx` gallery not running `cu.image_url` through `proxyImg()`. LeMans URLs need `/api/img?u=` proxy. |
| 2 | Verify filter bottom sheet end-to-end on mobile | subcategory + modelCodes params flowing through API |
| 3 | git commit everything | WPS fitment scripts + large uncommitted changeset from May 21 |

---

## ✅ DONE MAY 22 — TWENTY-SEVENTH PASS

| Area | What Was Done |
|------|---------------|
| WPS vehicle master | Loaded 44,709 rows into wps_vehicles table from 1779424242-1856360.csv |
| import_wps_fitment.mjs | New script — paginates taxonomyterms/196/items?include=vehicles, resolves vehicle IDs, stores JSONB in wps_catalog.fitment. 5,810 items with Harley fitment |
| promote_wps_fitment.cjs | New script — promotes wps_catalog.fitment harley_vehicles[] → catalog_fitment_v2. 702,633 rows inserted |
| catalog_fitment_v2 | Now at 2,147,352 rows (up from 1,442,872) |
| Era backfill | Re-run post WPS promote. 18,793 products tagged (up from 13,773) |
| Typesense | Reindexed — 90,276 docs, 0 errors |

---

## ✅ DONE MAY 21 — TWENTY-SIXTH PASS

| Area | What Was Done |
|------|---------------|
| promote_pu_fitment.cjs | Fixed 3-table join. 1,339,680 PU fitment rows inserted |
| ingest_vtwin_fitment.cjs | Fixed catalog_oem_crossref join + VT- SKU prefix. 19,934 VTWIN rows inserted |
| ERA backfill | Re-run post-promote. 13,773 products tagged |
| build_variant_groups.cjs | Added 7-axis attribute extraction (Size, Compound, Apparel Size, Gauge, Rise, Finish, Throttle, Color) |
| build_pu_variant_groups.cjs | New script — PU wire spool name-based grouping. 6 groups, 83 members |
| WPS group 27 split | Split into 18g (8686) + 20g (8687). Labels fixed. family_key set |
| 25' GXL groups | family_key = 'namz-wire-spool-25ft-gxl' set on 4 groups |
| catalog_variant_groups.family_key | New column — links related groups cross-vendor for gauge tabs |
| browse.ts | DISTINCT ON variant dedup. ~78,357 deduplicated cards. Filter URL sync. Back button restores state |
| Variants API route | DISTINCT ON dedup, image fallback to cu.image_url, siblingGroups for gauge tabs |
| VariantSelector | Gauge tabs, currentProductId fix, alpha sort, tab dedup |
| Browse variants badge | Gold pill badge "26 OPTIONS" on grouped product cards |
| BottomNav | Desktop HOME restored on /browse pages |
| Home page | Cream grid background, EraKineticTile text fix, ScrollVelocity color + size fix, ModelSearch mobile overflow fix |
| Fulfillment routing | Architecture discussed — deferred to future sprint |

---

## 🔴 HIGH PRIORITY

| Task | Notes |
|------|-------|
| Fix PU product images | Gallery not proxying LeMans CDN URLs. Most PU products show "No Image" on PDP |
| git commit everything | Large uncommitted changeset from May 21 + WPS fitment scripts from May 22 |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| WPS fitment unresolved models | 19,810 vehicle records didn't match harley_model_years — chase model name mismatches |
| Fulfillment routing | cross_vendor_products table + resolve_cart_fulfillment() + cart integration |
| Cart wiring | CartContext / addItem is placeholder only |
| Verify filter bottom sheet on mobile | subcategory + modelCodes params |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Cron jobs | Hold until stable |
| flathead.webp | Missing from public/images/eras/ |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| PU multi-image | image_zip column has multiple angles — not yet fetched |
| Expand build_pu_variant_groups whitelist | Add grips, mirrors, pegs once confirmed as color/size variants |
| catalog_unified category map | Display labels still show old GROUP suffix |
| harley_families slug column | No slug column — derived via CASE. Consider adding |
