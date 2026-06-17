# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 16, 2026 — Fifty-Second Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | **Payment gateway decision** | Authorize.net / NMI / Braintree / Heartland. ⚠️ BLOCKING — reminder set for Wed June 17. Only blocker for checkout going live. |
| 2 | **Variant groups missing a real distinguishing axis** (NEW) | 668 groups where every member shares an identical `option_1_value` and has no `option_2` at all — UI shows e.g. "Chrome vs Chrome" with no way to tell products apart. Found via PDP spot-check (VT-29-1169 vs VT-29-1190, "True Dual Exhaust Pipe System Chrome," different year fitment, same display name/finish). Product-count total not yet pulled — run `SUM(members)` on the affected-groups query below. Root cause likely mixed: (a) session 49's deliberate removal of the Fits axis from `build_variant_groups.cjs` left fitment-differentiated products with no remaining axis to show, and/or (b) some groups may be bad Jaccard name-similarity matches unrelated to the Fits-axis change — one group has 12 members with zero distinguishing axis, worth checking if that's even a legitimate variant set before assuming it's all the same root cause. Repro query: `SELECT group_id, COUNT(*) AS members FROM catalog_variant_members GROUP BY group_id HAVING COUNT(DISTINCT option_1_value) = 1 AND bool_and(option_2_name IS NULL OR option_2_name = '') AND COUNT(*) > 1 ORDER BY members DESC;`. Possible fixes once root cause is confirmed: re-add Fits/year-range as a fallback axis when no other axis differentiates, or route affected groups into a manual review queue like canonical-matches. |
| 3 | **Canonical match review — apply the 855 already-confirmed merges** | Queue currently: pending 2,246 · confirmed 855 · applied 0 · rejected 1,081. The 855 confirmed ones are sitting unapplied — click "Apply confirmed merges" (or confirm that's intentional before doing so) before continuing the manual pass on the remaining 2,246 pending. |
| 4 | **PU image-proxy: add a persistent cache layer** | `app/api/image-proxy/route.ts` has zero server-side caching — every unique zip gets downloaded + unzipped fresh from LeMans on first request (HTTP `Cache-Control` headers help across repeat requests for the *same* URL via Vercel's edge, but don't help the first hit per image). Fine for tonight's validation traffic; needs a real fix (Vercel Blob/S3/R2-backed cache, written once on first extraction) before this carries full browse-grid production traffic for 31,000+ products. |
| 5 | **PU image-proxy: confirm browse grid visually** | PDP (`ProductImage.jsx`) confirmed working live with real photos (two exhaust kits spot-checked). `ProductCard.jsx` got the identical fix applied and deployed but was not visually re-confirmed on `/browse` itself before session end — quick spot check needed. |
| 6 | **PU image-proxy: consolidate duplicate implementations** | Two separate zip-extraction proxies exist: `app/api/img/route.ts` (uses `AdmZip`, Node-only, disk-cached, only wired into the dead `ProductDetailClient.jsx`) and `app/api/image-proxy/route.ts` (uses `fflate`, edge-compatible, handles WPS/VTwin hotlink-protection too, now wired into `ProductCard.jsx`/`ProductImage.jsx`/quick-view/admin). Worth deciding if `/api/img` should be deleted entirely now that `/api/image-proxy` is the one actually in the critical path. |
| 7 | **PU products with no recoverable image anywhere** | 19 of the 31,415 PU products nulled tonight didn't have a usable `pu_brand_enrichment.image_uri` to restore from either (no match, null, or excluded as a coming-soon placeholder) — these stay on the "NO IMAGE" placeholder regardless of the image-proxy fix. Repro: `SELECT cu.id, cu.sku, cu.name FROM catalog_unified cu LEFT JOIN pu_brand_enrichment pbe ON replace(cu.sku,'-','') = replace(replace(pbe.sku,'-',''),'.','') WHERE cu.source_vendor='PU' AND cu.is_active=true AND cu.image_url IS NULL;` — low priority, just needs the list pulled for awareness. |
| 8 | **Find the unknown match-generation pipeline** | Canonical match revert surfaced 2,433 pending proposals with `match_reason = 'upc'` or `'brand_part_number'` and a null `shared_oem_number` — neither comes from `build_canonical_products.mjs` (Phase B only ever writes `match_reason = 'oem'`). Some other script generates these; never identified tonight. Worth finding so we know whether it has the same pack-qty/finish blind spot Phase B had before tonight's fix. |
| 9 | **Review oem_supersession confidence=1 rows** | `SELECT * FROM oem_supersession_review LIMIT 30;` — 283 pairs pending, untouched tonight. Bulk-promote reliable ones, reject false positives. |
| 10 | **Confirm Softail + Suspension + Triple Trees & Stems filter fix** | Still untested since the session 51 structural params fix — retest this exact combo returns 131 results, not 0. |
| 11 | **Verify PU vendor SKUs in portal** | Run `09344715`, `09251068`, `10101765`, `DS196011` through PU's ordering portal to confirm migration 010 fixed the ordering pipeline. |
| 12 | **Variant candidates** | `/admin/variant-candidates?token=...` — groups flagged as finish/size/pack variants. Mark resolved once variant group built. |
| 13 | Wire `<CartProvider>` into root layout | `lib/cart/CartContext.jsx` ready — wrap `app/layout.tsx`, then `useCart()` everywhere |
| 14 | Build cart drawer UI | Uses `useCart()` — items, addItem, removeItem, updateQty, subtotal |
| 15 | Build checkout page UI | Address form + order summary + payment form → `/api/checkout/prepare` then `/api/checkout/charge` |
| 16 | Wire real PU + WPS API credentials | `lib/fulfillment/triggerFulfillment.ts` — need `PU_API_URL/KEY`, `WPS_API_URL/KEY` env vars |
| 17 | Shipping + tax calculation | Both $0 placeholders in `app/api/checkout/prepare/route.ts` |
| 18 | Drop remaining session 43 files | globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts |
| 19 | Add ADMIN_SECRET to Vercel | `npx vercel env add ADMIN_SECRET` |
| 20 | Fix Framer Motion transparent errors | `FRAMER_TRANSPARENT_FIX.md` — palette rgba() replacements, not yet applied |
| 21 | Add remaining model images | 9 images at `public/images/models/{slug}.jpg` (400×160px) |
| 22 | TC/M8 platform dedup in variant groups | WPS `wps_product_id` groups can mix Twin Cam and Milwaukee-8 platform variants. Need platform-aware split in `build_variant_groups.cjs` — detect "TC"/"M8" token in names and create sub-groups. |
| 23 | PU zip extraction project (deprioritized) | `PU_ZIP_EXTRACTION_TODO.md`'s extraction pipeline is now mostly moot — `image-proxy` already does live zip extraction and was validated tonight across 6 sample products. Keep this doc around only as reference for the "which file is the real photo" selection question if image-proxy's first-file rule ever turns out wrong on a wider sample. |

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

## ✅ DONE JUNE 16 — FIFTY-SECOND PASS

| Area | What Was Done |
|------|---------------|
| **Canonical match review — full revert + rebuild** | Earlier reviews were corrupted by pack-qty/finish variant confusion (e.g. confirming a 10-pack against a single unit as a duplicate). Reverted ALL confirmed/applied merges: detached `catalog_unified.canonical_product_id`, wiped `product_vendors` + `canonical_products` (`DELETE`, not `TRUNCATE` — `canonical_products` has incoming FKs from `catalog_unified`/`order_items`, and `TRUNCATE` refuses or cascades destructively in that situation regardless of row counts). Re-ran Phase A (clean 1:1 rebuild, 89,203 products) then Phase B. |
| **build_canonical_products.mjs — Phase B mismatch filter (new)** | Ported the exact `effectivePackQty`/`parseFinish` logic from the admin review UI's badges directly into candidate generation, so a pack-qty or finish/color mismatch never becomes a proposal at all instead of relying on a reviewer to catch the badge. Result on rerun: 1,293 new proposals, 36 skipped (pack-qty), 79 skipped (finish/color). |
| **sweep_pending_mismatches.mjs (new script)** | One-time sweep applying the same mismatch logic against all *already-pending* proposals (including the 3,233 reopened from confirmed/applied), since Phase B's filter only covers newly-generated candidates. Dry-run by default, `--apply` to write. Auto-rejected rows tagged `reviewed_by = 'auto:pack_qty_mismatch'` / `'auto:finish_mismatch'` so they're distinguishable from human review. Result: 206 rejected (172 pack-qty + 34 finish) out of 3,313 checked. |
| **app/admin/canonical-matches/page.tsx — null-OEM crash fixed** | `const key = p.shared_oem_number` had no fallback; any proposal with a null `shared_oem_number` (2,433 of them — see item #8 above) grouped under a literal `null` key, then `oem.startsWith(...)` crashed on render. Added `groupKeyOf()` helper with a per-proposal synthetic fallback key, used consistently in grouping AND in the three post-action state filters (`selectiveAction`, `bulkAction`, `flagAsVariant`) that previously compared directly against `p.shared_oem_number` — those would have silently failed to clear synthetic-key groups from the UI after acting on them. Also rerouted "Confirm all"/"Reject all" to a new `actOnGroupByIds()` (proposal-ID-based, same endpoint `selectiveAction` already uses) for synthetic-key groups specifically, since the existing `bulkAction` matches server-side on `shared_oem_number` and would silently no-op when that's null. Real-OEM groups untouched. |
| **app/api/admin/canonical-matches/sync-fitment/route.ts — column name bug fixed** | `INSERT INTO catalog_fitment_v2 (..., confidence, source)` — neither column exists; real names are `confidence_score` and `fitment_source`. One-line fix. |
| **PU image zip stopgap — full scan + apply** | New `scan_zip_contamination_full.mjs`: full non-sampled Content-Type scan covering both `catalog_unified.image_url` AND `catalog_media.url` (the existing `check_dead_images.mjs` only covered the first). Classifies bad-`image_url` products into rescued-by-catalog_media vs. no-fallback, dry-run by default. Result: 31,730 products had a bad `image_url` (31,415 PU + 315 VTwin — see VTwin note below), 31,396 `catalog_media` rows confirmed bad. Applied: nulled all 31,730, deleted all 31,396 bad `catalog_media` rows. |
| **VTwin's 315 nulled products — investigated, confirmed NOT contamination** | Initially alarming since VTwin shouldn't be touched by PU's zip feed at all. Traced to VTwin's hotlink-protection requiring a spoofed `Referer` — but direct `curl` testing (with AND without the spoof) on 5 sample products all returned consistent `404`s from VTwin's own server. Genuinely dead images on VTwin's side, unrelated to PU, correctly nulled. No restoration needed. |
| **PU PIES/Catalog-Content XML investigated for a hidden direct-image field** | Hypothesis: `import_pu_brand_xml.js` line 217 (`str(p.partImage) \|\| str(p.productImage)`) prefers `partImage` (multi-asset zip bundle) over `productImage`, which might be a real single-asset link. **Disproven** — both resolve to identical `Content-Type: application/x-zip` via the same `asset.lemansnet.com/z/` endpoint regardless of asset count. True PIES files (different code path, no partImage/productImage ambiguity) show the same pattern at the source: `<FileName>99013666.zip</FileName>`, `<AssetType>ZZ1</AssetType>` — PU's own data explicitly names these zips. Confirms PU's feed never ships a direct image, full stop; not a parsing/field-selection bug. |
| **MAJOR FINDING — working zip-extraction proxy already existed, unwired from the main render path** | Two implementations found: `app/api/img/route.ts` (`AdmZip`, Node-only, disk-cached at `/tmp`, only used by the dead `ProductDetailClient.jsx`) and `app/api/image-proxy/route.ts` (`fflate`, edge-compatible, also handles WPS hotlink/mixed-content and VTwin Referer-spoofing, wired into `ProductQuickViewModal.jsx` and `admin/products/[id]/page.jsx` but never the main browse grid or live PDP). Validated "grab the first image file in the zip" against 6 real products across different brands/categories, including two genuine multi-asset (2-file) bundles — all 6 returned the correct product photo. |
| **Restored image_url for rescued PU products** | Backfilled `catalog_unified.image_url` from `pu_brand_enrichment.image_uri` for the nulled PU rows (same normalized-SKU join + coming-soon exclusion as the import script) — 31,396 of 31,415 restored; 19 have no usable source value either (see item #7 above). Source tables (`pu_catalog`, `pu_brand_enrichment`) were never touched by the null/delete pass, so this was a safe, lossless restore. |
| **image-proxy wired into the real render path** | `ProductCard.jsx` (browse grid) and `ProductImage.jsx` (PDP + mini cards) both got a small `resolveImageSrc()` helper added — routes `asset.lemansnet.com` URLs through `/api/image-proxy?url=...`, leaves WPS/VTwin/everything else rendering exactly as before. Deployed. PDP confirmed live with two real product photos (different chrome exhaust kits, correct fitment shown). Browse grid not yet visually re-confirmed (see item #5 above). |
| **NEW FINDING — variant groups with no distinguishing axis** | Found via PDP spot-check: two genuinely different products (different year fitment, different price) grouped as "Color" variants, both showing `option_1_value = 'Chrome'` with no `option_2` at all — UI displayed two indistinguishable "Chrome" pills. Confirmed systemic: 668 groups match the pattern (`COUNT(DISTINCT option_1_value) = 1` with no `option_2`, 2+ members). Full writeup at item #2 above — needs root-cause investigation next session before fixing. |

## ✅ DONE JUNE 16 — FIFTY-FIRST PASS

| Area | What Was Done |
|------|---------------|
| **Six session 50 files** | Deployed and confirmed live on Vercel. All subsequent fixes this session were applied directly to these files post-deployment. |
| **browse.ts — search fix** | Multi-word ILIKE search rewritten to split into individual words, ANDed (each word must appear somewhere in name/brand/vendor_sku/internal_sku, any order). Previously did a single ILIKE on the whole phrase, which almost never matched. |
| **browse.ts — critical structural params bug fixed** | The 5 queries (product, count, 3 facets) shared one params array (`fp[]`), but facet queries dropped certain WHERE condition strings by string-match while still passing the FULL params array — causing intermittent "could not determine data type of parameter $N" whenever a dropped condition's placeholder no longer appeared in that specific query's text. **Root cause, not stale cache** — confirmed by reproducing the exact failing query manually. **Fixed via complete rewrite**: conditions now built as tagged `{tag, sql, values}` objects; each of the 5 queries calls a `renderWhere()` helper with its own filtered condition list, producing correctly-renumbered SQL + matching params array per query, every time. |
| **pdp-page.jsx — getVariantMembers bug fixed** | Query had an unused `$1` (variantGroupId was being redundantly looked up via `$2` instead of used directly) — Postgres couldn't infer `$1`'s type. Simplified to use `cvm.group_id = $1` directly. |
| **ProductCard.jsx + pdp-page.jsx — cream theme conversion** | Both converted from the dark/black theme to the cream palette matching the approved Figma-style mockup. Page backgrounds, image boxes, tab panels, mini cards, badges all switched to white/cream with gold accents; text flipped from light-on-dark to dark-on-light. |
| **ProductImage.jsx (new)** | Small client component extracted so `pdp-page.jsx` (a server component) can still get `onError` broken-image fallback — swaps to a "NO IMAGE" placeholder instead of the browser's native broken-icon-plus-alt-text. Used for both the hero image and mini product cards. Also fixed a contrast bug in `ProductCard.jsx` where "NO IMAGE" text was unreadable against the new white background. |
| **catalog_media fallback wired in** | `browse.ts` (main product query, `getChronologicalNeighbors`, `getProductBySlug`) and `pdp-page.jsx` (`getProduct`, `getRelatedProducts`) all now `COALESCE(image_url, catalog_media.url)` when `image_url` is null/empty. **Caveat discovered later this session**: this does NOT rescue the ~13,790 zip-contaminated PU products — `catalog_media` rows for PU are themselves sourced from `pu_brand_enrichment.image_uri`, the same contaminated feed. |
| **OEM badge replaces "FITS X MODELS"** | PDP badge row near Add to Cart now shows one gold pill per confirmed OEM number (`OEM 12345-67`) instead of a fitment model count. |
| **MAJOR FINDING — PU image zip contamination** | ~13,790 active PU products (37.6% of all active PU rows) have `image_url` resolving to `Content-Type: application/x-zip`, not an image. Confirmed independently across THREE separate sources — `catalog_unified.image_url`, `pu_catalog.product_image`, and `pu_brand_enrichment.image_uri` (from PU's actual PIES XML feed) — all resolve to the same zip for the same products. **Not a column-mixup/backfill bug** — PU's upstream feed never provided a direct image for these products, only a zip archive (likely multi-angle photos). Status-only dead-link checks miss this entirely since the URLs return a healthy 200. Full plan at `PU_ZIP_EXTRACTION_TODO.md` — **superseded tonight, see Fifty-Second Pass image-proxy finding above.** |
| **New diagnostic scripts (scripts/ingest/)** | `check_dead_images.mjs` (rewritten — checks actual Content-Type, not just HTTP status; outputs separate dead vs. wrong-content-type CSVs), `summarize_bad_images.mjs` (tallies a bad-content-type CSV by content_type/vendor), `check_product_image_column.mjs` (verifies a candidate replacement column before trusting it), `check_brand_enrichment_images.mjs` (same check against `pu_brand_enrichment`, using the correct normalized SKU join from `import_pu_brand_catalogs_WORKING.js`). |

## ✅ DONE JUNE 15 — FIFTIETH PASS

| Area | What Was Done |
|------|---------------|
| **browse.ts** | `oem_chain_match?: boolean` on `CatalogProduct`. `chainParam` added after limit/offset params — `chainProductIds` (or `[-1]` sentinel) pushed as `$N`. `(cu.id = ANY($N::int[])) AS oem_chain_match` in inner SELECT. `getChronologicalNeighbors` updated: third param `displaySubcategory?: string | null`, WHERE uses `$3`/`$4`/`$5`, subcategory-first with category fallback. |
| **ProductCard.jsx** | Extracted from `browse/page.jsx`. Added `selected`/`onSelect` props (gold border/bg when selected, card click calls `onSelect` when provided). OEM chain badge added at `bottom: 8, right: 8` — dark bg, gold border, chain-link SVG. |
| **browse/page.jsx** | Inline `ProductCard` removed, import added. `selectedId` state + `AnimatePresence` + `InlinePanel` wired in. Selection auto-clears on page/filter change. |
| **PDP page.jsx** | Related products query fixed: `display_subcategory`-first with `category` fallback. Same `$3::text IS NOT NULL` guard pattern as timeline. |
| **InlinePanel.jsx** | New component. Variants accordion (auto-opens first axis), fitment guide (model/range rows, show-all toggle), OEM cross-reference footer (direct + chain tagged). Shimmer skeleton while loading. |
| **panel API route** | `app/api/browse/panel/route.js`. Three parallel queries: variant members, fitment (compressed to year ranges), OEM cross-ref (direct + chain via `oem_supersession` CTE). `via_chain` boolean tags chain products. Non-fatal `Promise.allSettled`. |
| **build_variant_groups.cjs** | Complete rebuild. Kit exclusion at query + name heuristic level. Pack qty coherence check. Pack Size as valid axis. Jaccard base-name similarity validation. Normalization fix for PU/VTWIN `mixed_axes` (was comparing raw "Finish"/"Color" instead of normalized "Color"). Result: 3,757 groups / 10,872 members / 0 kits. |
| **Typesense reindex** | Running at session end — 89,203 docs, 0 errors expected. |

## ✅ DONE JUNE 14 — FORTY-NINTH PASS

| Area | What Was Done |
|------|---------------|
| **OEM supersession system** | `oem_supersession` table (283 pairs), `mv_oem_fitment_coverage` matview (683K rows, forward+backward chain traversal). `catalog_oem_crossref.oem_format` generated column + `expanded_from` bool. `normalize_oem()` function. |
| **browse.ts OEM chain** | Pre-fetch (1.3ms warm) ORs chain product IDs into fitment conditions when year+model set. `LIMIT 1` bug fixed → JOIN covers all model_year_ids. Non-fatal fallback. Proven: 7 chain products surfaced for 1984 XLH gasket search. |
| **Variant Fits axis removed** | `build_variant_groups.cjs` WPS path no longer stores fitment year ranges as `option_1`. **Note: likely contributing root cause to the Fifty-Second Pass "no distinguishing axis" finding above — revisit when investigating that.** |
| **Brushed SS + axis normalization** | Added `brushed ss`, `brushed`, `raw ss` to Finish rule. `normalizeAxisName()` maps Finish→Color. |
| **Timeline tightened** | `getChronologicalNeighbors` now takes optional `displaySubcategory` param (session 49 added the call site; session 50 added the function signature). |
| **Deployed** | All changes live on Vercel. Confirmed working. |

## ✅ DONE JUNE 12–13 — FORTY-EIGHTH PASS

| Area | What Was Done |
|------|---------------|
| **CRITICAL: PU vendor_sku complete fix** | All 36,396 active PU rows now have `vendor_sku = sku`. `brand_part_number` retained as manufacturer cross-reference. |
| is_kit, pack_qty columns | Added to `catalog_unified`. 1,026 pack_qty rows populated via regex. |
| variant_candidates table | New table `catalog_variant_candidates`. |
| Canonical match review | Full data-correction workbench — inline editor, manual match, mismatch badges, variant flagging. |
| admin/products/[id] page | Cream/gold/black restyling. |
| ProductManager.jsx + admin routes | pack_qty column, GENERIC_FIELD_MAP, Typesense sync. |

## ✅ DONE JUNE 11–12 — FORTY-SEVENTH PASS

Fulfillment architecture. canonical_products / product_vendors / orders tables. Canonical pipeline Phase A+B. Admin canonical match review UI (initial). CartContext, optimizer.ts, checkout routes.

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
