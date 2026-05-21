# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 21, 2026 — Twenty-Sixth Pass**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Fix PU product images | `ProductDetailClient.jsx` gallery not running `cu.image_url` through `proxyImg()`. LeMans URLs need `/api/img?u=` proxy. |
| 2 | `node scripts/ingest/index_unified.js --recreate` | Reindex after variant_group_id changes |
| 3 | WPS fitment files | Follow up with rep — pending since April 30 |
| 4 | Verify filter bottom sheet end-to-end on mobile | subcategory + modelCodes params flowing through API |

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
| Fulfillment routing | Architecture discussed — deferred to future sprint (cross_vendor_products table + resolve_cart_fulfillment()) |

---

## ✅ DONE MAY 21 — TWENTY-FIFTH PASS

| Area | What Was Done |
|------|---------------|
| ProductDetailClient redesign | Sticky gallery, price+stock on same row, cart above fold, compact trust badges, fitment year dedup fixed |
| VariantSelector fixes | data scope bug fixed, navigation loading state, current-item ← HERE label |
| BottomNav filter toggle | Hamburger on /browse fires stinkin:filterToggle event |
| Browse page mobile-first | Event listener, desktop-sidebar/mobile-only split, floating filter pill |
| FilterSidebar bottom sheet | mobileSheet prop, spring animation, drag handle, body scroll lock |
| promote_pu_fitment.cjs | New script written (had join bugs fixed in 26th pass) |
| ingest_vtwin_fitment.cjs | New script written (had join bugs fixed in 26th pass) |

---

## 🔴 HIGH PRIORITY

| Task | Notes |
|------|-------|
| Fix PU product images | Gallery not proxying LeMans CDN URLs. Most PU products show "No Image" on PDP |
| Typesense reindex | variant_group_id changes not reflected yet |
| WPS fitment files | Pending from rep since April 30 |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing | cross_vendor_products table + resolve_cart_fulfillment() + cart integration. See HANDOFF for architecture |
| Cart wiring | CartContext / addItem is placeholder only |
| Verify filter bottom sheet on mobile | subcategory + modelCodes params |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| WPS vehicle scopes | Request vehicle:read + vehiclemodel:read from WPS |
| model_alias_map additions | Road King, Street Glide, Fat Boy, Night Train, Dyna Wide Glide |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Cron jobs | Hold until stable |
| flathead.webp | Missing from public/images/eras/ |
| Evolution family page | Routes to /era/evolution — no standalone family tile |
| PU multi-image | image_zip column has multiple angles — not yet fetched |
| Expand build_pu_variant_groups whitelist | Add grips, mirrors, pegs once confirmed as color/size variants |
| catalog_unified category map | Display labels still show old GROUP suffix |
| harley_families slug column | No slug column — derived via CASE. Consider adding |
