# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 23, 2026 — Fifty-Fifth Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | **Payment gateway decision** | Authorize.net / NMI / Braintree / Heartland. ⚠️ BLOCKING — pending merchant account meeting. Only blocker for checkout going live. Recommendation: Braintree (no monthly fee, best API, direct signup). |
| 2 | **Pack-size variant dedup edge case** | `canonical:91278` (Cam Cover Gasket) has 3 members: PU 1pk + VTwin 1pk + WPS 5pk. VariantSelector may show two "1" buttons. Fix in `build_pack_size_groups.mjs` canonical mode: when multiple products share the same pack_qty, prefer PU as representative member and skip the rest. |
| 3 | **Build OEM "all options" panel on PDP** | Data layer complete — all three vendors now linked via `catalog_oem_crossref`. Build a PDP section: given current product's OEM numbers, surface all catalog products sharing that OEM. Group by function (throttle-only vs. set, material, brand). This is the "multiple vendors sell the same Cometic gasket" UX. Query pattern documented in HANDOFF_LOG session 55. |
| 4 | **PU image-proxy: add a persistent cache layer** | `app/api/image-proxy/route.ts` has zero server-side caching — every unique zip gets downloaded + unzipped fresh from LeMans on first request. Fine for now; needs Vercel Blob/S3/R2-backed cache before this carries full browse-grid production traffic for 31,000+ products. |
| 5 | **PU image-proxy: confirm browse grid visually** | PDP confirmed working. `ProductCard.jsx` got the identical fix but was not visually re-confirmed on `/browse` itself. Quick spot check needed. |
| 6 | **Find the unknown match-generation pipeline** | Canonical match revert surfaced proposals with `match_reason = 'upc'` or `'brand_part_number'` and null `shared_oem_number` — neither comes from `build_canonical_products.mjs` Phase B. Some other script generates these; never identified. |
| 7 | **Review oem_supersession confidence=1 rows** | `SELECT * FROM oem_supersession_review LIMIT 30;` — 283 pairs pending, untouched. Bulk-promote reliable ones, reject false positives. |
| 8 | **Confirm Softail + Suspension + Triple Trees & Stems filter fix** | Still untested since session 51 structural params fix — retest this exact combo returns 131 results, not 0. |
| 9 | **Verify PU vendor SKUs in portal** | Run `09344715`, `09251068`, `10101765`, `DS196011` through PU's ordering portal to confirm migration 010 fixed the ordering pipeline. |
| 10 | **Variant candidates — 62 remaining** | `/admin/variant-candidates?token=...` — finish/size/length groups flagged during canonical review. Need human judgment: are these genuine size variants (build a group) or different parts (reject)? |
| 11 | Wire `<CartProvider>` into root layout | `lib/cart/CartContext.jsx` ready — wrap `app/layout.tsx`, then `useCart()` everywhere |
| 12 | Build cart drawer UI | Uses `useCart()` — items, addItem, removeItem, updateQty, subtotal |
| 13 | Build checkout page UI | Address form + order summary + payment form → `/api/checkout/prepare` then `/api/orders/create` |
| 14 | Wire real PU + WPS API credentials | `lib/fulfillment/triggerFulfillment.ts` — need `PU_API_URL/KEY`, `WPS_API_URL/KEY` env vars |
| 15 | Shipping + tax calculation | Both `$0` placeholders in `app/api/checkout/prepare/route.ts` and `app/api/orders/create/route.ts` |
| 16 | Drop remaining session 43 files | globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts |
| 17 | Add ADMIN_SECRET to Vercel | `npx vercel env add ADMIN_SECRET` |
| 18 | Fix Framer Motion transparent errors | `FRAMER_TRANSPARENT_FIX.md` — palette rgba() replacements, not yet applied |
| 19 | Add remaining model images | 9 images at `public/images/models/{slug}.jpg` (400×160px) |
| 20 | TC/M8 platform dedup in variant groups | WPS `wps_product_id` groups can mix Twin Cam and Milwaukee-8 platform variants. Need platform-aware split in `build_variant_groups.cjs`. |
| 21 | PU products with no recoverable image | 3,573 active PU products have no source photo anywhere — stay on NO IMAGE placeholder. Low priority, no fix possible without new PU vendor data. |
| 22 | Backfill vendor_offers from product_vendors | PU and VTwin cost/stock needs to flow into `vendor_offers` (currently only 22,278 WPS rows). Optimizer currently reads `product_vendors` as workaround — swap to `vendor_offers` once backfilled. |
| 23 | PU zip extraction project (deprioritized) | `PU_ZIP_EXTRACTION_TODO.md` offline pipeline is moot — `image-proxy` does live zip extraction. Keep as reference only. |
| 24 | WPS OEM crossref — 662 unmatched rows | 662 WPS crossref entries have no matching active product (discontinued/never stocked). 81 exist as inactive products. Revisit after next WPS catalog ingest to recover any that become active. |

## Files to Drop In — Session 43 (still pending)

| File | Destination |
|------|-------------|
| globals.css | app/globals.css |
| layout.tsx | app/layout.tsx |
| BespokeSerif-Variable.ttf | public/fonts/ |
| FilterSidebar.jsx | components/browse/ |
| ProductQuickViewModal.jsx | components/browse/ |
| BrowseBackButton.jsx | components/pdp/ |
| products-slug-route.ts | app/api/products/[slug]/route.ts |

## ✅ DONE JUNE 22–23 — FIFTY-FIFTH PASS

| Area | What Was Done |
|------|---------------|
| **Credential rotation** | WPS API token + DB password rotated. No longer live in shell history. |
| **Canonical merges — fully drained** | 2,407 total applied across multiple rounds (was 0 at session start). Vercel 30-second timeout required 3–4 passes per round. Recurring straggler pattern (14 proposals per round with `cp_a IS NULL`) fixed each time with direct SQL repoint. Also bulk-rejected 86 pending proposals where both products already shared `variant_group_id`. Final: **2,407 applied / 0 confirmed / 0 pending / 1,772 rejected**. |
| **WPS pack_qty — 1,070 products corrected** | Two-pass fix. Pass 1 (slash format `\d+\s*/\s*pk`): 972 products. Pass 2 (no-slash `\d+pk(\s|$)`): 98 more. The `\b` word boundary doesn't work in Postgres regex — replaced with `(\s|$)`. |
| **`build_pack_size_groups.mjs` — new script** | Two modes: default (candidate-based) and `--canonical` (canonical_product_id-based). Dry-run by default, `--apply` to write. Idempotent — checks `family_key` before inserting. `source_vendor='MULTI'`, `option_1_name='Pack Size'`. |
| **145 pack-size variant groups built** | 88 from candidate pipeline + 27 from canonical matching + 19 from pending proposals (rejected + re-queued). Confirmed working on PDP: Derby Cover Gasket 5-Hole shows "1 / 5" selector. |
| **86 pending canonical proposals bulk-rejected** | Both products in each pair already had same `variant_group_id` — not duplicates, already linked. |
| **3 final pending proposals cleared** | All rejected. Two (`__pack_3096`, `__pack_3106`) queued as variant candidates and built. One (`2473`) was a different-parts pair, rejected only. |
| **WPS OEM crossref — 1,665 entries** | Imported from `scripts/data/wps-cross-fitment.csv` (2,273 rows). Join: `vendor_sku = WPS#`. 71% match rate. Source='WPS', `oem_manufacturer` = distributor brand (Cometic, James, Colony, etc.). 11 WPS products rebranded HARDDRIVE → Carlisle from crossref data. |
| **VTwin OEM crossref — 8,426 entries** | Extracted from `VTwin-OEM.pdf` (267 pages, 11,575 rows) using pdfplumber. Saved to `scripts/data/vtwin-oem-crossref.csv`. Join: `sku = 'VT-' || vt_number`. Source='VTWIN'. Unique constraint is `(sku, oem_number)` — not 3-column. |
| **OEM "all options" query — verified** | OEM `56327-90` now returns 8 products across PU (5), WPS (2), VTwin (1) — Drag Specialties, Barnett, Magnum Shielding, Motion Pro all surfaced. Foundation for PDP "all options" panel. |
| **4× Typesense reindexes** | All 89,203 docs, 0 errors. |

## ✅ DONE JUNE 22 — FIFTY-FOURTH PASS

| Area | What Was Done |
|------|---------------|
| **`lib/fulfillment/optimizer.ts` — written** | Resolves vendor routing from `product_vendors`. Minimizes vendor count first, breaks ties by margin, routes VTwin to `isManual=true`. |
| **`lib/fulfillment/triggerFulfillment.ts` — written** | VTwin: `status='pending'`, surfaces in admin queue. PU/WPS: degrades to `status='manual_required'` if creds missing. |
| **`app/api/checkout/prepare/route.ts` — written** | Pre-payment quote, no gateway call, no cost/margin leakage in response. |
| **`app/api/orders/create/route.ts` — written** | Re-validates stock, charges via stub, writes orders atomically, dispatches fulfillment after commit. |
| **`build_variant_groups.cjs` — non-distinguishing axis fix** | Invariant #7: ≥2 distinct values required. 994 false groups / 2,763 products dissolved. Credentials moved to env vars. |
| **Variant rebuild + reindex** | 2,763 groups / 8,109 members. 89,203 docs, 0 errors. |
| **`/api/img` deleted** | Dead duplicate proxy removed. `/api/image-proxy` is sole proxy. |
| **Canonical review — continued** | Pending 2,246 → 1,263. 1,956 confirmed, 0 applied at session end. |

## ✅ DONE JUNE 16 — FIFTY-SECOND PASS

| Area | What Was Done |
|------|---------------|
| **Canonical match review — full revert + rebuild** | All confirmed/applied merges reverted. Phase A + B rebuilt. `DELETE` not `TRUNCATE` (FK cascade). |
| **Phase B mismatch filter** | `effectivePackQty` + `parseFinish` logic ported from UI into candidate generation. |
| **sweep_pending_mismatches.mjs** | One-time sweep: 206 auto-rejected (172 pack-qty + 34 finish). |
| **Null-OEM crash fixed** | `groupKeyOf()` helper with synthetic fallback key. |
| **Sync-fitment column name bug** | `confidence`/`source` → `confidence_score`/`fitment_source`. |
| **PU image zip stopgap** | 31,730 nulled, 31,396 bad catalog_media rows deleted. |
| **image-proxy wired into real render path** | `ProductCard.jsx` + `ProductImage.jsx` via `resolveImageSrc()`. |

## ✅ DONE JUNE 16 — FIFTY-FIRST PASS
browse.ts structural params bug fixed. pdp-page.jsx getVariantMembers fix. Cream theme conversion. catalog_media fallback wired. OEM badge on PDP. PU zip contamination discovered.

## ✅ DONE JUNE 15 — FIFTIETH PASS
browse.ts OEM chain. ProductCard.jsx extracted. InlinePanel.jsx. Panel API route. build_variant_groups.cjs complete rebuild (3,757 groups / 10,872 members). Typesense reindex.

## ✅ DONE JUNE 14 — FORTY-NINTH PASS
OEM supersession system. mv_oem_fitment_coverage matview. Browse OEM chain. Variant Fits axis removed. Brushed SS + axis normalization.

## ✅ DONE JUNE 12–13 — FORTY-EIGHTH PASS
PU vendor_sku complete fix. is_kit + pack_qty columns. catalog_variant_candidates table. Canonical match review workbench.

## ✅ DONE JUNE 11–12 — FORTY-SEVENTH PASS
Fulfillment architecture. canonical_products / product_vendors / orders tables. Canonical pipeline Phase A+B. CartContext, optimizer.ts, checkout routes.

## ✅ DONE JUNE 5–8 — PASSES 41–46
display_subcategory taxonomy. VTwin round-2 scrape. CategoryBentoGrid + ModelFinder. browse.ts fixes. FilterSidebar. VariantSelector Mode A. Font system. FlowingMenu. /models page.

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing live | PU + WPS API credentials needed |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| Browse/Brand tabs | Data ready, UI unbuilt |
| flathead.webp | Missing from public/images/eras/ |
| Hard Drive book crossref | Import when file available |
| Harden admin auth | Replace ?token= with session cookie |
| /models in nav | Add to main nav + home page tile |
| Reindex automation | Wire as post-step in ingest scripts |
| Accessories & Misc subcategory | 3,809 NULL — catch-all; low ROI |
| Tools & Chemicals coverage | 547 NULL — WPS abbreviations; low ROI |
| WPS vendor_sku portal check | Spot-check a few WPS numbers against their portal |
| oem_supersession PDP timeline | Show supersession chain on OEM tab: "this part replaced X in [year], was itself replaced by Y in [year]" |
| Auto-reject variant proposals on apply | When canonical merges applied, auto-reject pending proposals where both products share same variant_group_id — eliminates the manual bulk-reject step needed this session. |
