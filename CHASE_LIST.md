# STINKIN' SUPPLIES — CHASE LIST
**Last Updated: June 12–13, 2026 — Forty-Eighth Pass**

## 🚀 NEXT SESSION — START HERE

| # | Task | Notes |
|---|------|-------|
| 1 | **Canonical match review** (IN PROGRESS) | Down to 37 groups / 187 pairs after this session's rejections + flagging. `/admin/canonical-matches?token=...`. Confirm/reject/flag per group. "Apply confirmed merges" to execute batch. |
| 2 | **Variant candidates** (new) | `/admin/variant-candidates?token=...` — groups flagged as finish/size/pack variants for later variant_group_id building. Mark resolved once variant group built. |
| 3 | Verify PU vendor SKUs in dealer portal | Run `09344715`, `09251068`, `10101765`, `DS196011` through PU's ordering portal to confirm migration 010 fixed the ordering pipeline. |
| 4 | Decide payment gateway | Authorize.net / NMI / Braintree / Heartland. Only blocker for `app/api/checkout/charge/route.ts` — single TODO block, everything else wired. |
| 5 | Wire `<CartProvider>` into root layout | `lib/cart/CartContext.jsx` ready — wrap `app/layout.tsx`, then `useCart()` everywhere |
| 6 | Build cart drawer UI | Uses `useCart()` — items, addItem, removeItem, updateQty, subtotal |
| 7 | Build checkout page UI | Address form + order summary + payment form → `/api/checkout/prepare` then `/api/checkout/charge` |
| 8 | Wire real PU + WPS API credentials | `lib/fulfillment/triggerFulfillment.ts` — need `PU_API_URL/KEY`, `WPS_API_URL/KEY` env vars |
| 9 | Shipping + tax calculation | Both $0 placeholders in `app/api/checkout/prepare/route.ts` |
| 10 | Drop remaining session 43 files | globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts |
| 11 | Add ADMIN_SECRET to Vercel | `npx vercel env add ADMIN_SECRET` — confirm matches local `.env.local` |
| 12 | Fix Framer Motion transparent errors | `FRAMER_TRANSPARENT_FIX.md` — palette rgba() replacements, not yet applied |
| 13 | Wire ProductQuickViewModal into browse page | quickView state + setQuickView(product) on card click |
| 14 | Wire BrowseBackButton into PDP | `import BrowseBackButton from "@/components/pdp/BrowseBackButton"` |
| 15 | Add remaining model images | 9 images at `public/images/models/{slug}.jpg` (400×160px) |
| 16 | Pack qty on PDP | `pack_qty` column populated. Add "Pack of N" / "Sold individually" badge. Need `/api/products/[slug]/route.ts` + PDP component uploaded. |
| 17 | AdminEditPanel pack_qty field | Route accepts it. Need `AdminEditPanel.jsx` uploaded to add UI field. |

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

## ✅ DONE JUNE 12–13 — FORTY-EIGHTH PASS

| Area | What Was Done |
|------|---------------|
| **CRITICAL: PU vendor_sku complete fix** | Session 47's 004 fix had PU backwards: `vendor_sku` = manufacturer's part# (JGI/Cometic/Feuling/etc.), `sku` = PU's actual ordering number. Diagnosed via `007_diagnose_drag_part_sku.sql`, `008_diagnose_pu_oldbook_sku.sql`, `009_verify_pu_vendor_sku_pattern.sql`. Fixed in two migrations: `007_fix_pu_drag_vendor_sku.sql` (2,367 DS###### rows) + `010_fix_pu_vendor_sku_universal.sql` (26,061 rows). All 36,396 active PU rows now have `vendor_sku = sku`. `brand_part_number` retained as manufacturer cross-reference. |
| is_kit column | `005_add_is_kit.sql` — `catalog_unified.is_kit BOOLEAN DEFAULT false`. Kits excluded from Phase B OEM matching in build_canonical_products.mjs. |
| pack_qty column | `006_add_pack_qty.sql` — `catalog_unified.pack_qty INTEGER DEFAULT 1`. Bulk-populated 1,026 rows from name regex. Used for PDP "Pack of N" display, canonical-match mismatch detection, admin editing. |
| variant_candidates table | `011_add_variant_candidates.sql` — tracks OEM groups flagged as finish/size/color variants for later variant_group_id building. |
| Canonical match review — inline editor | Edit form per card: name, price, image_url, vendor_sku, brand_part_number, oem_numbers, is_kit, pack_qty. Saves to catalog_unified + product_vendors. Auto-rejects stale proposals on OEM edit. |
| Canonical match review — manual match | Search + select 2+ products → creates MANUAL-{ts} proposals in review queue. |
| Canonical match review — mismatch badges | Pack size (name + real pack_qty), price ratio (≥3x), finish/color (chrome/zinc/stainless/black/polished/etc.). |
| Canonical match review — variant flagging | "Flag as variant set" on every OEM group. Saves to catalog_variant_candidates, auto-rejects proposals, removes from queue. Auto-detects reason from badges. |
| Variant candidates page | `/admin/variant-candidates` — lists flagged groups, product cards, reason badge, "Mark resolved". Linked from canonical-matches header. |
| Canonical match review — display fixes | vendor# from product_vendors (corrected). "N items (M vendors)" label. "Confirm all (N pairs)". OEM numbers on cards. KIT badge. Nx pack badge. Manual match purple label. |
| admin/products/[id] page | Cream/gold/black restyling. `#f5f0e8` / `#c9a84c` / `#170f04`. Larger fonts throughout. |
| admin/products/[id]/route.ts | pack_qty in update action. handleGenericUpdate + GENERIC_FIELD_MAP for flat-body PATCHes (ProductManager.jsx). Typesense sync for all fields. |
| ProductManager.jsx | pack_qty column (inline-editable, Nx display). EditModal Pricing tab pack_qty field. COLS now 13 entries. |
| admin/products list route | Search now matches internal_sku + brand_part_number. pack_qty, price, stock_quantity added to SELECT. |

## ✅ DONE JUNE 11–12 — FORTY-SEVENTH PASS

Fulfillment architecture locked. canonical_products / product_vendors / canonical_match_proposals / orders tables. Canonical pipeline Phase A+B. Admin canonical match review UI (initial). vendor_sku fix (partial — PU completed in session 48). CartContext, optimizer.ts, triggerFulfillment.ts, checkout routes.

## ✅ DONE JUNE 5–8 — PASSES 41–46

display_subcategory taxonomy complete (20 categories). VTwin round-2 scrape. CategoryBentoGrid + ModelFinder. browse.ts fixes. FilterSidebar. VariantSelector Mode A. Font system locked. FlowingMenu. /models page.

## 🔵 LOW PRIORITY / FUTURE

| Task | Notes |
|------|-------|
| Fulfillment routing live | PU + WPS API credentials needed |
| WPS API enrichment | Test features+blocks hit rate on HardDrive products |
| Browse/Brand tabs | Data ready, UI unbuilt |
| flathead.webp | Missing from public/images/eras/ |
| PU multi-image | image_zip column — not yet fetched |
| Hard Drive book crossref | Import when file available |
| Harden admin auth | Replace ?token= with session cookie |
| /models in nav | Add to main nav + home page tile |
| Reindex automation | Wire as post-step in ingest scripts |
| SKU display on PDP | internal_sku — taxonomy finalized, implement when ready |
| Accessories & Misc subcategory | 3,809 NULL — catch-all; low ROI |
| Tools & Chemicals coverage | 547 NULL — WPS abbreviations; low ROI |
| WPS vendor_sku portal check | Spot-check a few WPS numbers against their portal |
