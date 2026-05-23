# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 23, 2026 — Twenty-Eighth Pass (Addendum)**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | Verify VTwin images load | Deploy `app/api/img/route.ts` fix. Test on `/browse/1000cc-piston-ring-set-050-oversize-msc689413-v` |
| 2 | Wire OEM numbers to PDP | `catalog_unified.oem_numbers[]` is rebuilt and correct — display on product detail page |
| 3 | Verify filter bottom sheet on mobile | subcategory + modelCodes params flowing through API end-to-end |

---

## ✅ DONE MAY 23 — TWENTY-EIGHTH PASS (ADDENDUM)

| Area | What Was Done |
|------|---------------|
| FatBook crossref import | `import_fatbook_crossref.cjs` — 3,940 rows into catalog_oem_crossref, fatbook_page column added, 95.5% match rate |
| OldBook crossref import | `import_oldbook_crossref.cjs` — 2,643 rows into catalog_oem_crossref, oldbook_page column added, 96.1% match rate |
| oem_numbers[] full rebuild | Wiped incorrect data, rebuilt from catalog_oem_crossref — 33,890 products have verified OEM arrays |

---

## ✅ DONE MAY 23 — TWENTY-EIGHTH PASS

| Area | What Was Done |
|------|---------------|
| Browse search bar | Added inline to `app/browse/page.jsx` — debounced, feeds existing Typesense pipeline |
| browse.ts facet 500 fix | `facetParams` snapshot moved before `array_position` push — fixed 500 on all search queries |
| PDP image proxy fix | Removed `http→https` rewrite in `normalizeProductRow` — LeMans URLs now proxied correctly |
| Image proxy VTwin support | Expanded ALLOWED_HOSTS, added `isPlainImage` check for non-ZIP vendors |
| Variant sibling ILIKE bug | Removed name-prefix fallback — siblings only via explicit `family_key` |
| Piston ring `family_key` | Set `vtwin-1000cc-piston-ring-set` on groups 13242–13246 |
| Cross-vendor variant purge | 97 VTWIN products removed from WPS groups — both verify counts = 0 |
| build_variant_groups.cjs | 3 vendor guards added — won't recreate cross-vendor contamination on re-run |
| Admin retheme | layout.jsx + ProductManager.jsx — cream/gold/stencil to match site aesthetic |
| ProductManager upgrades | Native scroll virtualization, inline cell editing, expanded EditModal (5 tabs), Fitment Data tab |
| WPS fitment gap fix | SPLIT_PART model_code match — +98,410 rows, catalog_fitment_v2 now 2,245,762 |
| Era backfill remapped | Correct family→era mapping using year ranges — 17,808 products tagged |
| Next.js 15 param fixes | `await searchParams`, `await params`, `defaultValue` on selects |
| Typesense reindex | 90,276 docs, 0 errors, 4m 59s |

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

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing | cross_vendor_products table + resolve_cart_fulfillment() + cart integration |
| Cart wiring | CartContext / addItem is placeholder only |
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
| Hard Drive book crossref | Same pattern as FatBook/OldBook — import when file available |
