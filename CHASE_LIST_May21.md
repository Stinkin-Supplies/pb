# STINKIN' SUPPLIES
## CHASE LIST
**Last Updated: May 21, 2026 — Twenty-Fifth Pass**

---

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | `node scripts/ingest/promote_pu_fitment.cjs --dry` | Check match count first, then run live. Auto-introspects columns. |
| 2 | `node scripts/ingest/ingest_vtwin_fitment.cjs --dry` | Check strategy + sample rows. If Strategy B → 0 matches, adjust OEM col detection in script. |
| 3 | Run ERA BACKFILL SQL | After both fitment promotes. See MasterRef ERA BACKFILL SQL section. |
| 4 | `node scripts/ingest/build_variant_groups.cjs` | Re-run after fitment promote — cable groups will get fitment labels |
| 5 | `node scripts/ingest/index_unified.js --recreate` | After all above |
| 6 | Verify filter bottom sheet end-to-end on mobile | subcategory + modelCodes params flowing through API |
| 7 | WPS fitment files | Follow up with rep — pending since April 30 |

---

## ✅ DONE MAY 21 — TWENTY-FIFTH PASS

| Area | What Was Done |
|------|---------------|
| ProductDetailClient redesign | Sticky gallery, price+stock on same row, cart above fold, compact trust badges, fitment year dedup fixed |
| VariantSelector fixes | `data` scope bug fixed (group passed as explicit prop), navigation loading state, current-item `← HERE` label |
| BottomNav filter toggle | Hamburger on /browse fires `stinkin:filterToggle` window event; hidden on desktop ≥769px |
| Browse page mobile-first | Event listener for filter toggle, desktop-sidebar / mobile-only split, floating filter pill above nav |
| FilterSidebar bottom sheet | `mobileSheet` prop — spring animation, drag handle, body scroll lock, "Show Results" button |
| FilterContent extracted | Shared sub-component used by both desktop sidebar and mobile sheet — no duplication |
| promote_pu_fitment.cjs | New script — column introspection, dry run, batch insert 10K/batch, is_harley_fitment backfill |
| ingest_vtwin_fitment.cjs | New script — dual strategy (direct year/model or OEM cross-ref copy), dry run, is_harley_fitment backfill |

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
| Run promote_pu_fitment.cjs | Script ready. `--dry` first, then live. |
| Run ingest_vtwin_fitment.cjs | Script ready. `--dry` first — check Strategy A or B fires correctly. |
| ERA BACKFILL SQL | Re-run after both fitment promotes |
| Re-run build_variant_groups.cjs | After fitment promote — cable labels will populate |
| Typesense reindex | After all fitment + era work |
| WPS fitment files | Pending from rep since April 30 |

---

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Verify filter bottom sheet end-to-end | subcategory + modelCodes params on mobile |
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
| catalog_unified category map | MasterRef category display labels still show old GROUP suffix |
