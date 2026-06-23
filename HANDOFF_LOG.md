# STINKIN' SUPPLIES — HANDOFF LOG

---

# ——— FIFTY-FOURTH PASS (June 22, 2026) ———

## WHERE WE ARE

Fulfillment pipeline fully drafted (optimizer, triggerFulfillment, checkout/prepare, orders/create) — all four files schema-confirmed against real DB, ready to drop in. Variant group non-distinguishing-axis bug fixed and rebuilt live: 994 false groups / 2,763 products dissolved, clean reindex at 89,203 docs. Canonical review continuing in background (1,263 pending, 1,956 confirmed, 0 applied). Gateway decision deferred to merchant account meeting.

⚠️ **URGENT: Rotate WPS API token and DB password** — both were hardcoded in `build_variant_groups.cjs` (now replaced with env vars), but the values are live in shell history and must be rotated: WPS token `eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO` and DB password `smelly`.
⚠️ 1,956 confirmed canonical merges sitting unapplied — click "Apply confirmed merges" before continuing review.
⚠️ Payment gateway still undecided — only blocker for checkout going live. Merchant account meeting pending.

## What Was Done This Session

### Fulfillment Pipeline — Four Files Written ✅

All four files drafted from scratch, schema-confirmed iteratively via `\d` output:

**`lib/fulfillment/optimizer.ts`**
- Reads from `product_vendors` (not `vendor_offers` — vendor_offers only has 22,278 WPS rows; product_vendors covers all three vendors, 90,605 rows).
- Priority: (1) minimize vendor count, (2) maximize margin within that, (3) stock check at resolution time, (4) VTwin always → `isManual=true`.
- Single-vendor coverage attempted first; falls back to greedy minimum-vendor-count cover (heuristic, fine for real-world order sizes).
- Returns `OptimizerResult` with `groups[]` and `unfulfillable[]`.

**`lib/fulfillment/triggerFulfillment.ts`**
- Inserts `vendor_orders` row, then dispatches to vendor adapter.
- VTwin: no adapter call, writes `status='pending'` and returns — surfaces in `/admin/fulfillment/vtwin`.
- PU/WPS: checks env vars first (`PU_API_URL/KEY`, `WPS_API_URL/KEY`); if missing, degrades to `status='manual_required'` with clear `error_message` rather than crashing.
- Adapter stubs are real plumbing around no-op bodies — swap in the actual API fetch once creds land, nothing else changes.

**`app/api/checkout/prepare/route.ts`**
- Pre-payment quote only, no DB writes, no gateway call.
- Returns customer-safe quote (no `resolvedVendor`, `unitCost`, `marginPct` in response).
- Shipping and tax both `$0` placeholder (Chase list item 17).

**`app/api/orders/create/route.ts`**
- Re-validates stock (doesn't trust the quote), refuses if anything dropped out.
- Calls `chargeGateway()` — stub that always returns failure on purpose until gateway is chosen.
- Writes `orders` + `order_items` atomically in a DB transaction; dispatches `triggerFulfillment` per group **after commit** (adapter failures don't roll back a paid order).
- Uses `client.release()` back to pool — never `.end()` on the shared pool.

All four files confirmed against: `canonical_products`, `product_vendors`, `vendor_offers`, `orders`, `order_items`, `vendor_orders`.

### `build_variant_groups.cjs` — Non-Distinguishing Axis Fix ✅

**Root cause confirmed:** `classifyGroup()` was returning a valid group any time a named attribute axis was detected, even if all members shared the *same* attribute value (e.g. 12 different rear-brake-line SKUs all named "...Black" — different fitments, but fitment isn't encoded in the name). The VariantSelector had nothing real to show, just "Black vs Black vs Black."

**Fix (invariant #7 added to file header):** After base-name similarity check, count `distinctValues` from the extracted attrs. If `< 2`, fall through to Pack Size fallback instead of returning — and if Pack Size also fails, group dissolves entirely (members stay standalone, which is correct).

**Credentials moved to env vars** in the same pass: `WPS_TOKEN` → `process.env.WPS_TOKEN`, `password: 'smelly'` → `process.env.CATALOG_DB_PASSWORD`.

**Live rebuild results:**

| | Before | After | Delta |
|--|--------|-------|-------|
| Groups | 3,757 | 2,763 | −994 |
| Members | 10,872 | 8,109 | −2,763 |
| Kits in groups | 0 | 0 | — |

**Typesense reindex:** 89,203 docs, 0 errors, 5m 7s.

Note: the Ultima Complete Cylinder Heads group (9 members: 5×Black + 4×Natural) passes correctly — it has 2 distinct values and represents genuinely distinct products. The duplicate SKUs within each color value are a pre-existing VTwin data quality issue, not a pipeline bug.

### `/api/img` Route Deleted ✅

Dead duplicate zip-extraction proxy (Node-only, AdmZip, only wired into the dead `ProductDetailClient.jsx`) removed. `/api/image-proxy` is the sole image proxy now.

### Variant Blast-Radius Confirmed ✅

668 groups / 1,768 member products had no real distinguishing axis. Distribution: 480 pairs, 88 triplets, 44 quad, 20 five-member, down to 2 groups of 12. All dissolved by the fix above.

### Canonical Review — Continued ✅

Pending queue down from 2,246 → 1,263. Pack-qty cross-vendor pairs (brand_part_number pipeline, item #8) being correctly routed to variant-candidates rather than rejected. 1,956 confirmed and queued for apply.

## DB State After This Session

| Table | State |
|-------|-------|
| `catalog_variant_groups` | 2,763 rows (was 3,757) |
| `catalog_variant_members` | 8,109 rows (was 10,872) |
| `catalog_unified.variant_group_id` | 8,109 tagged (was 10,872) |
| `canonical_match_proposals` | pending 1,263 · confirmed 1,956 · applied 0 · rejected 1,082 |
| `vendor_orders` / `orders` / `order_items` | schema unchanged, no new rows (order pipeline not live yet) |

## Files Written/Changed This Session

| File | Status |
|------|--------|
| `lib/fulfillment/optimizer.ts` | NEW — drop in, confirm `@/lib/db/catalog` import path |
| `lib/fulfillment/triggerFulfillment.ts` | NEW — drop in |
| `app/api/checkout/prepare/route.ts` | NEW — drop in |
| `app/api/orders/create/route.ts` | NEW — drop in |
| `scripts/ingest/build_variant_groups.cjs` | PATCHED — invariant #7, env vars for creds |
| `app/api/img/route.ts` | DELETED |

---

# ——— FORTY-EIGHTH PASS (June 12–13, 2026) ———

## WHERE WE ARE

Canonical match review tool now a full data-correction workbench. Critical PU vendor_sku bug fully resolved across all 36,396 active PU rows. Admin product detail page restyled. ProductManager and admin route extended with pack_qty. Variant candidates tracking system built. Review queue down to 37 groups / 187 pairs.

⚠️ PU vendor SKUs need portal verification — run 3-4 numbers through PU dealer portal to confirm ordering pipeline works end-to-end.
⚠️ Canonical match review still in progress (37 groups remaining).
⚠️ Payment gateway still undecided — only blocker for checkout going live.
⚠️ Session 43 files still pending (unchanged).

## What Was Done This Session

### CRITICAL: PU vendor_sku — Complete Fix ✅

Session 47's `004_fix_vendor_sku.sql` had the PU column precedence backwards. For PU products:
- `catalog_unified.vendor_sku` = the **manufacturer's** part number (James Gasket JGI-11100, Cometic C9603-2, Feuling 8080, etc.)
- `catalog_unified.sku` = PU's **actual catalog/ordering number** (DS######, 8-digit numeric OldBook/FatBook format, etc.)

004 preferred `vendor_sku` when populated, which was true for ~31K of ~36K active PU rows — meaning most PU products had the wrong ordering number in `product_vendors.vendor_sku`.

**Diagnosis chain:**
- `007_diagnose_drag_part_sku.sql` — confirmed 2,367 DS###### rows had wrong numbers. Identified `catalog_unified.sku` as the correct source.
- `008_diagnose_pu_oldbook_sku.sql` — found 31,114 additional rows with numeric-format SKUs differing from vendor_sku. 805 independently confirmed via catalog_oem_crossref.
- `009_verify_pu_vendor_sku_pattern.sql` — confirmed 22,648/22,796 (99.4%) have `vendor_sku` matching `brand_part_number` after normalization, proving the pattern holds catalog-wide.

**Migrations applied:**
- `007_fix_pu_drag_vendor_sku.sql` — 2,367 DS###### rows corrected. Verified 0 remaining.
- `010_fix_pu_vendor_sku_universal.sql` — 26,061 remaining rows. Updated both `product_vendors.vendor_sku` AND `catalog_unified.vendor_sku`. Verified: all 36,396 active PU rows now have `vendor_sku = sku`. `brand_part_number` retained as manufacturer cross-reference.

**Rule going forward:** For PU, `catalog_unified.sku` is always the ordering number. `vendor_sku`/`brand_part_number` are the manufacturer's cross-reference numbers only.

### DB Migrations Applied ✅

| Migration | Effect |
|-----------|--------|
| `005_add_is_kit.sql` | `catalog_unified.is_kit BOOLEAN DEFAULT false`. Kit products excluded from Phase B OEM matching. |
| `006_add_pack_qty.sql` | `catalog_unified.pack_qty INTEGER DEFAULT 1`. Bulk-populated 1,026 rows from name regex (pack/set-of/x patterns, bounds 2–500). Max confirmed: 360-packs wheel weights. |
| `007_fix_pu_drag_vendor_sku.sql` | 2,367 DS###### PU rows corrected in product_vendors + catalog_unified. |
| `010_fix_pu_vendor_sku_universal.sql` | 26,061 remaining PU rows corrected. All 36,396 active PU rows verified. |
| `011_add_variant_candidates.sql` | New table `catalog_variant_candidates` — tracks OEM groups flagged as variant sets (not duplicates) for later variant_group_id building. |

### Canonical Match Review Tool — Major Expansion ✅

Built through v3–v16 of the page/API over this session. New routes:
- `/api/admin/canonical-matches/edit-product` (POST) — inline product editor: vendor_sku, brand_part_number, oem_numbers, is_kit, name, price, image_url, pack_qty. Updates catalog_unified + product_vendors atomically. Auto-rejects stale proposals on OEM edit. Syncs canonical_products for unmerged (1:1) products.
- `/api/admin/canonical-matches/search-products` (GET) — free-text search across name, vendor_sku, brand_part_number, internal_sku, sku. Used by manual-match tool.
- `/api/admin/canonical-matches/manual-match` (POST) — creates pairwise MANUAL-{timestamp} proposals for any 2+ products selected from search.
- `/api/admin/canonical-matches/variant-candidates` (GET/POST/PATCH) — flag/list/resolve variant candidate groups.

New page: `/admin/variant-candidates` — lists flagged groups with product cards, reason badges, "Mark resolved" button, "Show resolved" toggle. Linked from canonical-matches header.

Page improvements: vendor# from corrected product_vendors column. "N items (M vendors)" label. "Confirm all (N pairs)". OEM numbers displayed per card. KIT badge. Nx pack badge. Pack mismatch badge. Price mismatch badge (≥3x). Finish/color mismatch badge (keyword list). "Flag as variant set" button on every OEM group (auto-detects reason, auto-rejects proposals, routes to variant candidates queue). Manual match shows "Manual match" in purple.

### Admin Product Detail Page — Restyled ✅

`app/admin/products/[id]/page.jsx` — cream/gold/black palette:
- Background: `#f5f0e8` cream (was `#0a0909` near-black)
- Cards: `#fffdf8` white with `#e3d6bd` borders
- Accent: `#c9a84c` gold (was `#e8621a` orange)
- Text: `#170f04` (was `#f0ebe3` on dark)
- Title: 30px (was ~20px)
- Field inputs: 14px, gold focus ring
- Labels: 11-12px (was 8-9px)
- All class names preserved — no functional changes.

### ProductManager + Admin Routes ✅

- `ProductManager.jsx` — pack_qty column (inline-editable, shows Nx), EditModal Pricing tab field, form state + save body updated. COLS now 13 entries.
- `app/api/admin/products/[id]/route.ts` — pack_qty in update action. Added `handleGenericUpdate` + `GENERIC_FIELD_MAP` for flat-body PATCH (ProductManager sends these without `action` field — was hitting "Unknown action" before). All 20 whitelisted fields push to Typesense.
- `app/api/admin/products/route.ts` (list) — search now matches `internal_sku` + `brand_part_number`. Added `pack_qty`, `price` (computed_price alias), `stock_quantity` to SELECT.

## DB State After This Session

| Table / Column | State |
|----------------|-------|
| product_vendors.vendor_sku | All PU rows corrected: now = catalog_unified.sku (PU's ordering number). WPS/VTwin unchanged (correct from session 47). |
| catalog_unified.vendor_sku | All PU rows corrected to match sku. brand_part_number retains manufacturer's number. |
| catalog_unified.is_kit | Column exists. Set to true for any product identified as a kit/assembly during review. |
| catalog_unified.pack_qty | Column exists. 1,026 rows have values > 1 (regex-populated). Editable per-product from review tool and ProductManager. |
| catalog_variant_candidates | New table. Rows written as variant groups are flagged during review. |
| canonical_match_proposals | Down from 1,537 to ~187 pending (after rejections + flags this session). |

---

# ——— FORTY-SEVENTH PASS (June 11–12, 2026) ———

## WHERE WE ARE

Fulfillment/checkout backend fully scaffolded. Canonical products layer live: 90,605 products with 1:1 canonical entries. OEM matching found 469 groups (1,536 proposals) in admin review queue. Initial vendor_sku fix applied (PU side completed in session 48).

## What Was Done This Session

### Fulfillment Architecture ✅
Drop-ship model confirmed. Own merchant gateway (TBD). Canonical product layer: one listing per real-world part, multiple vendor sources, checkout-time optimizer for vendor routing.

### DB Schema ✅
`canonical_products`, `product_vendors`, `canonical_match_proposals`, `orders`, `order_items`, `vendor_orders`. Auto SS-YYYYMMDD-NNNN order numbers via trigger. `catalog_unified.canonical_product_id` FK.

### Canonical Products Pipeline ✅
`build_canonical_products.mjs` — Phase A (1:1 init, 3,715/s bulk CTE) + Phase B (OEM matching → 469 groups / 1,537 proposals).

### Admin Canonical Match Review UI ✅ (initial)
`/admin/canonical-matches` — grouped by OEM, side-by-side vendor cards, bulk confirm/reject, apply merges, fitment range + mismatch flag, sync-fitment action.

### vendor_sku Fix (initial) ✅
All 90,605 product_vendors.vendor_sku corrected from internal_sku format. PU side discovered to be backwards in session 48 and fully re-fixed.

### Fulfillment Backend ✅
CartContext, optimizer.ts, triggerFulfillment.ts (adapters stubbed), checkout/prepare + checkout/charge routes.

---

# ——— EARLIER PASSES ———

See git history and prior HANDOFF_LOG entries (sessions 41–46) for: display_subcategory taxonomy, VTwin round-2 scrape, CategoryBentoGrid, ModelFinder, browse.ts fixes, FilterSidebar, VariantSelector, font system, FlowingMenu, /models page.

---

# ——— FORTY-NINTH PASS (June 14, 2026) ———

## WHERE WE ARE

OEM supersession system fully shipped. browse.ts pre-fetches chain product IDs for exact year+model queries, surfacing parts reachable via successor/predecessor OEM chains. Variant system fixed in two areas: Fits axis removed from WPS members, Brushed SS + axis normalization added. Chronological timeline tightened to display_subcategory. All deployed and confirmed working on Vercel.

## What Was Done This Session

### OEM Supersession System — Phase 1 Complete ✅

Built end-to-end: table, matview, browse integration.

**`oem_supersession` table** — 283 pairs (confidence=1, all pending review):
- 127 pairs from slash-notation expansion (e.g. `44082-00A/B/C/D` → individual pairs)
- 156 pairs from boundary detection inference (adjacent fitment year ranges, same base name)

**`catalog_oem_crossref` additions:**
- `oem_format` generated column — classifies OEM numbers as `hd_oem`, `hd_oem_nodash`, `hd_oem_multivariant`, `vendor_sku`, `aftermarket_ref`, `unknown`
- `expanded_from` boolean — flags slash-notation originals, excluded from chain logic
- Valid chain filter: `oem_format IN ('hd_oem','hd_oem_nodash') AND expanded_from = FALSE`

**`mv_oem_fitment_coverage`** — 683K rows, recursive forward+backward chain traversal (depth guard 10). 4 indexes. `hm.family` bug fixed (`family_id` is the actual column name). CONCURRENTLY-refreshable. 3.9ms cold / 1.3ms warm for chain pre-fetch query.

**`oem_supersession_review` view** — confidence=1 pairs pending review.

**`browse.ts` integration:**
- `effectiveModelCodes` computed early, used for both pre-fetch and conditions
- Chain pre-fetch runs when `year` + `modelCode`/`modelCodes` both set (ModelFinder path)
- `LIMIT 1` bug fixed → JOIN covers all model_year_ids for the target year+model (e.g. 1986 XLH has three: XLH1100=3158, XLH883=3159, XLH=8818)
- Both modelCode and year conditions get `OR cu.id = ANY($chainIds::int[])` escape hatch
- Non-fatal: if matview missing or query fails, `chainProductIds` stays `[]` and browse runs identically to before
- Proven working: 1984 XLH gasket search → score 1=62, score 2=7 (chain), score 3=19, score 4=3297

**Refresh command:** `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage;`
**Review queue:** `SELECT * FROM oem_supersession_review LIMIT 30;`

### Variant System Fixes ✅

**`build_variant_groups.cjs` — three fixes:**

1. **Removed Fits axis from WPS member INSERT** — was storing fitment year ranges as `option_1` (e.g. "Dyna 1991–2017, FXR 1986–1993"). Caused VariantSelector to surface year ranges as selectable dimensions. Now WPS members store only the color/finish attribute as `option_1`, `option_2` = null.

2. **Brushed SS / Brushed / Raw SS added to Finish rule** — `extractAttribute` previously couldn't match "BRUSHED SS" suffix. Added to Finish rule with longer alternatives first (`brushed ss` before `brushed`). Extract function returns `'Brushed SS'`, `'Raw SS'`, `'Brushed'` correctly. Tested against real WPS exhaust names.

3. **`normalizeAxisName()` — Finish → Color** — added function mapping `'Finish'` to `'Color'`. Used in `detectGroupAxis` (prevents 50/50 Color/Finish splits), `useAttr` check, and INSERT `option_1_name`. Ensures mixed Color/Finish groups always write `Color` as the axis name.

**DB hotfixes applied:**
- Existing `Fits` rows: `UPDATE ... SET option_1_name=option_2_name, option_1_value=option_2_value WHERE option_1_name='Fits'` — 0 rows affected (already clean)
- Group 2620 (head bolt covers): confirmed `Color: Chrome / Color: Black` — correct
- Group 1266 (softail cannon): `UPDATE ... SET option_1_name='Finish', option_1_value='Brushed SS' WHERE group_id=1266 AND option_1_value IS NULL` → then `UPDATE ... SET option_1_name='Color' WHERE group_id=1266 AND option_1_name='Finish'` — all four members now `Color` axis

**Known remaining issue:** Group 1266 has TC Softail and M8 Softail mixed under one WPS `wps_product_id`. Results in two identical-looking `Brushed SS` options in selector. Requires platform-aware dedup in the script.

**`catalog_variant_members` FK column name:** `group_id` (not `variant_group_id`).

### Chronological Timeline — Tightened to display_subcategory ✅

**`getChronologicalNeighbors` (browse.ts):**
- Added optional `displaySubcategory?: string | null` third param
- WHERE now: `($4::text IS NOT NULL AND cu.display_subcategory = $4) OR ($4::text IS NULL AND cu.category = $2)`
- Year bound moved from `$4` → `$5` (displaySubcategory occupies `$4`)
- Falls back to raw `category` when displaySubcategory not passed (backwards compat)

**`app/browse/[slug]/page.jsx`:**
- `getChronologicalNeighbors(unifiedId, productRow.category ?? null, productRow.display_subcategory ?? null)` — third arg added
- `display_subcategory` already selected in both product queries and mapped through `normalizeProductRow`

Result: timeline now shows same-subcategory neighbors only (e.g. "Heads & Valves" next to "Heads & Valves", not valve guides next to sensor covers).

## DB State After This Session

| Table / Object | State |
|----------------|-------|
| `oem_supersession` | 283 rows, all confidence=1, source='inferred', pending review |
| `oem_supersession_review` | View on confidence=1 rows |
| `mv_oem_fitment_coverage` | 683K rows, 4 indexes, forward+backward chain traversal |
| `catalog_oem_crossref.oem_format` | Generated column, all rows classified |
| `catalog_oem_crossref.expanded_from` | 306 slash-notation originals flagged |
| `catalog_variant_members` group 2620 | Color: Chrome / Color: Black — clean |
| `catalog_variant_members` group 1266 | Color: Black×2 / Color: Brushed SS×2 — clean axis, TC/M8 mix remains |

## Open Issues / Next Session

| Priority | Task |
|----------|------|
| HIGH | Review 283 confidence=1 rows in `oem_supersession_review` — bulk-promote reliable ones |
| HIGH | `oem_chain_match` badge on browse cards — surface "via OEM chain" label on score=2 results |
| MED | TC/M8 platform dedup in variant groups — split WPS groups where engine platform differs within same `wps_product_id` |
| MED | Related products on PDP still uses raw `category` — same fix as timeline |
| LOW | Re-run boundary detection after next large fitment import (query is idempotent) |


---

# ——— FIFTIETH PASS (June 15, 2026) ———

## WHERE WE ARE

Browse inline panel shipped end-to-end. ProductCard extracted into its own component with OEM chain badge + selected state. Variant groups fully rebuilt from scratch — 3,757 clean groups, zero kit contamination. All core session 49 open issues closed except oem_supersession review queue and canonical match review.

⚠️ Six files need to be deployed to Vercel (see drop-in map below).
⚠️ Typesense reindex running as of end of session — wait for completion before deploying.
⚠️ 283 oem_supersession rows still at confidence=1 — pending review.
⚠️ 37 canonical match groups / 187 pairs still pending at /admin/canonical-matches.
⚠️ Payment gateway decision due Wed June 17 — only blocker for checkout.

## What Was Done This Session

### Browse Inline Panel — Complete ✅

Built the full click-to-expand panel from the LOOK mockup. Three data sources, one fetch.

**`app/api/browse/panel/route.js`** (new file):
- Runs 3 parallel queries: variant members, fitment rows, OEM cross-reference
- Variant query: all members of the product's `variant_group_id` group
- Fitment query: raw year rows compressed server-side into ranges per `model_code`
- OEM cross-reference: two-tier CTE —
  - `direct_products`: products sharing exact OEM numbers (via `catalog_oem_crossref`)
  - `chain_products`: products one hop away via `oem_supersession` (predecessor/successor), excluded if already in direct_products
  - Tag logic: `is_kit=true` → "KIT INCLUDES OEM", `via_chain=true` → "OEM CHAIN" (chain icon), else → "EXACT OEM MATCH"
- Valid OEM filter: `oem_format IN ('hd_oem','hd_oem_nodash') AND expanded_from = FALSE`
- Non-fatal: all three queries wrapped in `Promise.allSettled`

**`components/browse/InlinePanel.jsx`** (new file):
- Fetches `/api/browse/panel?id=N` on `product.id` change
- Left column: Variants accordion (grouped by `option_1_name` axis, auto-opens first)
  - Radio-style selector per option; clicking non-current → `router.push` to that variant's slug
  - Current product highlighted with gold dot + bold
- Right column: Fitment Guide (model_code rows with year range + checkmark icon)
  - Shows 8 rows by default, "Show all N models" toggle
- Footer strip: OEM cross-reference cards (tag, name, brand, price; click navigates to PDP)
  - Hidden when no OEM cross-ref data
- Loading state: CSS shimmer skeleton

### ProductCard.jsx — Extracted + Enhanced ✅

**`components/browse/ProductCard.jsx`** (new file, was inline in `browse/page.jsx`):
- Identical rendering to the old inline component
- New props: `selected?: boolean`, `onSelect?: () => void`
  - When `onSelect` provided: card click calls `onSelect` instead of navigating to PDP
  - When `selected=true`: warm background `#fffbf0`, 2px gold border, gold glow
  - `+` button always navigates to PDP regardless (via `e.stopPropagation`)
- OEM chain badge added (bottom-right corner, free slot):
  - Shows when `product.oem_chain_match === true`
  - Dark background, gold border, chain-link SVG, "OEM CHAIN" text in `--font-stencil`
  - Matches the visual language of the variant count badge (bottom-left)

### browse/page.jsx — Panel Integration ✅

**`app/browse/page.jsx`** (updated):
- Removed inline `ProductCard` function (now imported from component file)
- Added imports: `InlinePanel`, `AnimatePresence` from framer-motion
- Added `selectedId` state + `selectedProduct` derived value
- Cards now receive `selected` and `onSelect` props
- `<AnimatePresence>` wraps `<InlinePanel>` below the product grid
- `selectedId` clears automatically on page/filter change (via `useEffect`)

### browse.ts — oem_chain_match + getChronologicalNeighbors ✅

**`lib/db/browse.ts`** (updated):
- `CatalogProduct` interface: added `oem_chain_match?: boolean`
- `browseProducts`: after limit/offset params, adds `chainParam` → pushes `chainProductIds` (or `[-1]` sentinel) as `$N`. Inner `DISTINCT ON` SELECT gains `(cu.id = ANY($N::int[])) AS oem_chain_match` computed column — rides through `d.*` to the outer query at zero join cost.
- `getChronologicalNeighbors`: added `displaySubcategory?: string | null` as third param. WHERE now uses `($3::text IS NOT NULL AND cu.display_subcategory = $3) OR ($3::text IS NULL AND cu.category = $2)`. `productId` moved to `$4`, year bound to `$5`. Backwards compatible.

### PDP page.jsx — Related Products Fix ✅

**`app/browse/[slug]/page.jsx`** (updated):
- Related products query WHERE changed from `cp.category = $1` to:
  ```sql
  WHERE (
    ($3::text IS NOT NULL AND cu.display_subcategory = $3)
    OR ($3::text IS NULL AND cp.category = $1)
  )
  AND cp.slug <> $2
  ```
- Params: `[productRow.category, slug, productRow.display_subcategory ?? null]`
- `getChronologicalNeighbors` call already had the third arg with `// ← add this` annotation (the call site was updated in session 49 but the function definition wasn't). Now both sides match.

### Variant Groups — Full Rebuild ✅

**`build_variant_groups.cjs`** (complete rewrite):

**Hard invariants enforced:**
1. `is_kit = true` products never enter any group — excluded at query level AND via `nameImpliesKit()` heuristic (catches names containing "kit", "assembly", "rebuild kit", etc.)
2. `pack_qty` must be uniform within a Color/Size group — mixed pack qty rejected
3. Pack Size IS a valid axis but only when: (a) distinct pack quantities exist, (b) base names are ≥75% similar after stripping pack indicators (1/PK, 5/PK, SET OF N, etc.)
4. Base name similarity validated via Jaccard word overlap ≥65% for color/size groups — catches unrelated SKUs sharing a WPS `wps_product_id`
5. Finish → Color axis normalization (was broken in PU/VTWIN phase — `mixed_axes` check was comparing raw axis names, not normalized)

**Results:**
- 3,757 total groups (was ~700+ with old script, many contaminated)
- 10,872 total members
- `kits_in_groups: 0` — verified by DB count
- WPS: 404 groups / 1,406 members
- PU+VTWIN: 3,353 groups / 9,466 members (was ~10 before normalization fix)
- Skip reasons: `has_kit: 273`, `no_valid_axis: 1410`, `mixed_pack_qty: 6`

**Key fix:** PU/VTWIN axes check was comparing `m.attr.name` (raw, e.g. "Finish") instead of `normalizeAxisName(m.attr.name)` (normalized, e.g. "Color") — caused 328 valid Finish/Color groups to be dropped as `mixed_axes`.

**Dry-run mode:** Prints all would-be groups (with members) and all skips (with kit names) without writing. Live run nukes all existing variant data and rebuilds from scratch — no stale groups accumulate.

## File Drop-in Map

| Output File | Destination |
|-------------|-------------|
| `panel-route.js` | `app/api/browse/panel/route.js` (new directory) |
| `InlinePanel.jsx` | `components/browse/InlinePanel.jsx` (new file) |
| `ProductCard.jsx` | `components/browse/ProductCard.jsx` (replaces earlier output) |
| `browse-page.jsx` | `app/browse/page.jsx` |
| `browse.ts` | `lib/db/browse.ts` |
| `pdp-page.jsx` | `app/browse/[slug]/page.jsx` |

All six must land together — ProductCard imports in browse-page, InlinePanel imports in browse-page, panel route is fetched by InlinePanel.

## DB State After This Session

| Table / Object | State |
|----------------|-------|
| `catalog_variant_groups` | 3,757 rows — rebuilt from scratch |
| `catalog_variant_members` | 10,872 rows — rebuilt from scratch |
| `catalog_unified.variant_group_id` | Back-filled for all 10,872 members |
| `kits_in_groups` | 0 — verified |
| `oem_supersession` | 283 rows, confidence=1, still pending review (unchanged) |
| `mv_oem_fitment_coverage` | 683K rows (unchanged) |
| Typesense | Reindex running as of session end — 89,203 docs |

## Open Issues / Next Session

| Priority | Task |
|----------|------|
| HIGH | Deploy all six files (see drop-in map above) |
| HIGH | Confirm Typesense reindex completed successfully |
| HIGH | Review 283 `oem_supersession` confidence=1 rows |
| HIGH | Canonical match review — 37 groups / 187 pairs remaining |
| BLOCKING | Payment gateway decision — due Wed June 17 |
| MED | Verify PU vendor SKUs in portal (3-4 numbers) |
| MED | TC/M8 platform dedup in WPS variant groups (group 1266 still has TC/M8 mix) |

---

# ——— FIFTY-FIRST PASS (June 16, 2026) ———

## WHERE WE ARE

Six session 50 files deployed and live. Spent most of this session debugging issues surfaced by live testing rather than building new features: a real structural bug in `browse.ts`'s shared params array (not stale cache, as several earlier symptoms in this same session turned out to be), the PDP variant-members query, search behavior, and a deep investigation into broken PU product images that traced all the way to PU's upstream feed never having shipped direct images for ~13,790 products — only zip archives.

⚠️ PU image zip cleanup (stopgap) not yet executed — needs a full non-sampled scan before nulling anything.
⚠️ PU zip extraction (real fix) is a properly scoped future project — see `PU_ZIP_EXTRACTION_TODO.md`. Step 0 (manually inspect one zip) not yet done.
⚠️ All prior open issues from session 50 (oem_supersession review, canonical match review, payment gateway, PU portal spot-check, TC/M8 dedup) remain untouched this session.

## What Was Done This Session

### browse.ts — Search Fix ✅

Multi-word search was doing one ILIKE on the whole phrase as a contiguous substring (`'%softail brake pad%'`), which essentially never matches since product names don't embed fitment text. Rewrote to split the search string into individual words and AND them — each word independently checked against `name`/`brand`/`vendor_sku`/`internal_sku`, in any order. `internal_sku` was initially included without confirming the column existed, which triggered the same connection-poisoning cascade error described below — confirmed via `information_schema.columns` and re-added correctly.

### browse.ts — Critical Structural Params Bug ✅

**Root cause finally identified for a recurring "could not determine data type of parameter $N" error** that had previously been attributed to stale dev-server cache (a real and frequent issue earlier in this session, but not the cause here). The product/count/3-facet queries shared one `fp[]` params array. Each facet query (category/subcategory/brand) dropped its own filter condition's SQL text via string matching to compute "what if this facet's filter were relaxed" — but kept passing the FULL original params array regardless. Whenever the dropped condition's `$N` placeholder no longer appeared anywhere in that specific query's text, Postgres couldn't infer its type during Parse, and the resulting connection-level failure cascaded into subsequent pooled-connection queries in the same request.

**Fixed via complete rewrite of the condition-building system:** conditions are now built as tagged `{tag, sql, values}` objects instead of raw strings pushed into a shared array. A `renderWhere()` helper takes a filtered list of conditions and produces correctly renumbered `$1, $2, $3...` SQL plus a matching params array, called separately for each of the 5 queries. The `fitmentJoin`'s own param (model year IDs) is treated as a stable leading param since that join is identical across all 5 query variants and never filtered out.

Verified via direct SQL reproduction: a Softail + Suspension + Triple Trees & Stems filter combination that previously returned 0 results (or threw the type-inference error after restart) was confirmed to correctly return 131 results once isolated and run manually — the live page just needed the corrected file deployed and the dev server restarted.

### pdp-page.jsx — getVariantMembers Bug Fixed ✅

Query referenced `$2` but never `$1` — a redundant subquery was looking up `variant_group_id` from `catalog_unified` via `$2` even though the caller already had that value and was passing it in as `$1`, unused. Simplified to filter directly on `cvm.group_id = $1`.

### ProductCard.jsx + pdp-page.jsx — Cream Theme Conversion ✅

Both converted from the dark/near-black theme to the cream palette matching the approved mockup:
- Page/card backgrounds: `#0e0b06`/`#1a1208`-family dark → `#f5f0e8`/`#ffffff`/`#fdfbf4`-family cream
- Text: light-on-dark → dark-on-light (`#d4c5a0` → `#2a2010`/`#1a1208`, etc.)
- Status badges (UNIVERSAL FIT, KIT, OEM pills) converted from dark-filled to light-tinted with colored borders/text
- "FITS X MODELS" badge replaced with one gold pill per confirmed OEM number (`oem_format` starts with `hd_oem`, `expanded_from = false`)

### ProductImage.jsx — New Component ✅

`pdp-page.jsx` is a server component, so it can't hold the `useState`-based `onError` fallback that `ProductCard.jsx` already had. Extracted a small client component (`components/browse/ProductImage.jsx`) that takes `src`/`alt`/`padding`/`placeholderFontSize` and handles the broken-image fallback internally — used for both the PDP hero image and the mini related-product cards. Also fixed a contrast bug in `ProductCard.jsx` where the "NO IMAGE" placeholder text color was unreadable against the new white background.

### catalog_media Fallback Wired In ✅

`browse.ts` (main product query, `getChronologicalNeighbors`, `getProductBySlug`) and `pdp-page.jsx` (`getProduct`, `getRelatedProducts`) all gained `LEFT JOIN LATERAL` against `catalog_media` (lowest `priority` image row), `COALESCE(image_url, cm.url)`, applied only when `image_url` is null/empty. Targets the ~3,595 PU products that have enrichment media but no `image_url` at all.

**Important caveat surfaced later in the same session:** this fallback does NOT rescue the zip-contaminated PU products (see below) — `catalog_media` rows for PU are themselves populated from `pu_brand_enrichment.image_uri`, which traced back to the exact same contaminated source.

### MAJOR FINDING — PU Image Zip Contamination ✅ (investigation complete, fix pending)

Investigation triggered by user reports of broken images on both the browse grid and PDP. Chain of discovery:

1. Built `check_dead_images.mjs` — initial version checked only HTTP status. Returned ~0.4% dead on a sample, which didn't match the visibly high broken-image rate in the browser.
2. Rewrote to check actual `Content-Type` header (ranged GET, not HEAD, for header reliability across CDNs). On a representative random sample of 500: 41.6% of unique URLs (207/497) returned `Content-Type: application/x-zip` with a healthy 200 status — invisible to any status-only check.
3. 100% of the bad-content-type rows were PU products. Confirmed at full scale: **13,790 of 36,684 active PU rows** (37.6%) have `pu_catalog.image_url <> pu_catalog.product_image`, matching the sampled rate closely.
4. Hypothesis: `product_image` was the "correct" column and a backfill bug used the wrong one. **Disproven** — re-checked `product_image`'s actual content-type for the disagreeing rows: 100% also `application/x-zip` (0% real images in a 300-row sample).
5. Found `pu_brand_enrichment` table (from `import_pu_brand_xml.js`, a separate PIES XML enrichment pipeline) with its own `image_uri`/`image_uris` columns — a structurally independent source. Checked using the correct normalized SKU join (`replace(cu.sku,'-','') = replace(replace(pbe.sku,'-',''),'.','')`, matching the real import script, not a naive exact match). **Also 100% `application/x-zip`** in a 300-row sample, both broadly and restricted to the known zip-broken subset.
6. `catalog_unified.image_urls` (plural array column) confirmed completely empty for PU rows — not a viable alternate source either.

**Conclusion:** not a column-mixup or backfill bug. PU's upstream feed genuinely never provided a direct image for these ~13,790 products — only a zip archive (likely multi-angle photography) — and that same zip reference propagated identically into every table that touches it.

**Also discovered:** `import_pu_brand_catalogs_WORKING.js`'s existing backfill only sets `catalog_unified.image_url` when it's currently `NULL` — meaning it never had a chance to "fix" these rows even if it had good data, since the bad zip URL was already non-null. (Moot here since `pu_brand_enrichment` turned out to have the same bad data anyway, but worth knowing for any future backfill logic.)

### New Diagnostic Scripts (scripts/ingest/) ✅

| Script | Purpose |
|--------|---------|
| `check_dead_images.mjs` | Rewritten — checks real Content-Type via ranged GET, not just HTTP status. Concurrency-limited, progress bar, `.env.local`/`.env` auto-loader (standalone scripts don't get Next.js's env loading). Outputs separate `dead_images_*.csv` and `bad_content_type_images_*.csv`. Flags: `--sample=N`, `--concurrency=N`, `--timeout=N`. Uses `ORDER BY random()` for representative sampling. |
| `summarize_bad_images.mjs` | Parses a bad-content-type CSV (proper quoted-CSV parser — names can contain commas) and tallies by `content_type` and `source_vendor`. |
| `check_product_image_column.mjs` | Verifies a candidate replacement image column's actual content-type before trusting it for a backfill — used to disprove the `product_image` hypothesis. |
| `check_brand_enrichment_images.mjs` | Same content-type verification against `pu_brand_enrichment.image_uri`, using the correct normalized SKU join. Has `--only-zip-broken` flag to target the known-contaminated subset specifically. |

### PU_ZIP_EXTRACTION_TODO.md — New Planning Doc ✅

Full task breakdown for the real fix (extracting images from the zip archives): manual inspection of one zip first (file count/naming/format before building anything), image-selection logic when a zip has multiple images, storage destination decision, the extraction pipeline itself (concurrency, resumability, corrupt-zip handling, post-extraction content-type re-verification, Typesense reindex, spot-checks). Framed as a separate scoped project from the immediate stopgap (null + placeholder), which is smaller and can ship independently.

## DB State After This Session

| Table / Column | State |
|----------------|-------|
| `pu_catalog.image_url` | Confirmed: 13,790 rows disagree with `product_image`; both resolve to `application/x-zip` for the same products. Unchanged by any UPDATE except one exploratory test (see below). |
| `pu_catalog.product_image` → `catalog_unified.image_url` | One exploratory `UPDATE` was run mid-session backfilling `catalog_unified.image_url` from `pu_catalog.product_image` for all 13,790 disagreeing rows, based on an unconfirmed hypothesis. **This did not fix anything** — `product_image` was independently confirmed to be equally zip-contaminated immediately after. The affected rows are not "more broken" than before, just pointing at a different bad blob. No further changes made pending the stopgap script. |
| `catalog_media` (PU rows) | Confirmed sourced from `pu_brand_enrichment.image_uri` — same contamination, does not independently rescue the broken set. |
| `catalog_unified.image_urls` | Confirmed empty for all checked PU rows — not a viable fallback source. |

## Open Issues / Next Session

| Priority | Task |
|----------|------|
| HIGH | Run a full (non-sampled) Content-Type scan across all active products' `image_url` + `catalog_media.url`, then null out confirmed zip rows so the clean placeholder renders (stopgap) |
| HIGH | Retest Softail + Suspension + Triple Trees & Stems filter combo (and ideally a broader filter regression pass) now that the params bug is fixed |
| MED | Begin PU zip extraction project per `PU_ZIP_EXTRACTION_TODO.md` — Step 0 (manually inspect one zip) first |
| MED | Review 283 confidence=1 rows in `oem_supersession_review` (carried over, untouched this session) |
| MED | Canonical match review — 37 groups / 187 pairs remaining (carried over) |
| MED | TC/M8 platform dedup in variant groups (carried over) |
| BLOCKING | Payment gateway decision — due Wed June 17 (carried over) |

---

# ——— FIFTY-SECOND PASS (June 16, 2026) ———

## WHERE WE ARE

Canonical match review fully reverted and rebuilt after discovering earlier confirms were corrupted by pack-qty/finish variant confusion — a new mismatch filter now runs at proposal-generation time, plus a one-time sweep cleaned the reopened queue. Two real route bugs found and fixed (a null-OEM crash in the review UI, wrong column names in the fitment-sync route). The PU zip stopgap from last session was finally executed at full scale — but mid-session, a previously-unused zip-extraction proxy was discovered already sitting in the codebase, validated against 6 real products, and wired into both the browse grid and PDP. Net effect: most of the ~31,700 nulled products got their real photos back instead of staying on the placeholder. A new, unrelated bug surfaced during PDP spot-checking — 668 variant groups with no real distinguishing axis between members.

⚠️ Payment gateway still undecided — reminder set for Wed June 17, only blocker for checkout going live.
⚠️ Canonical match review: 855 proposals confirmed but NOT yet applied — "Apply confirmed merges" was never clicked this session. 2,246 still pending manual review.
⚠️ NEW: 668 variant groups show no real distinguishing axis (e.g. "Chrome vs Chrome" with different fitment/price underneath) — root cause not yet confirmed, needs investigation before fixing.
⚠️ image-proxy has zero server-side caching — fine for tonight's validation traffic, needs a real persistent cache before carrying full production load.
⚠️ Browse grid never got a final visual re-confirmation after the image-proxy wiring (PDP was confirmed; grid was not).
⚠️ Unknown second match-generation pipeline still unidentified (writes `match_reason = 'upc'`/`'brand_part_number'` proposals — not from `build_canonical_products.mjs`).

## What Was Done This Session

### Canonical Match Review — Full Revert + Rebuild ✅

User reported earlier review sessions had been confirming false-positive matches caused by pack-qty and finish/color variant confusion (e.g. a 10-pack confirmed as a duplicate of a single unit). Decision: revert all confirmed/applied merges entirely and rebuild from scratch rather than attempt a row-by-row undo.

**Why a row-by-row revert wasn't viable:** `apply/route.ts`'s merge logic picks a "keeper" canonical via `Math.min(cp_a, cp_b)` at apply time but never persists which ID was the "merged" side anywhere queryable after the fact — `canonical_match_proposals` only stores the original `catalog_unified` product IDs, not the canonical IDs involved in a specific merge. Reconstructing history proposal-by-proposal would have required fragile, unreliable archaeology. A full wipe-and-rebuild was the clean path instead, since everything in `product_vendors`/`canonical_products` is fully derived from `catalog_unified` (vendor_sku recomputed deterministically, `our_cost` = `computed_price * 0.65`, `in_stock` hardcoded) — nothing authoritative lives only in those tables.

**Critical safety note for the revert:** `canonical_products` cannot be `TRUNCATE`d — Postgres refuses to truncate a table with incoming FKs from other tables (`catalog_unified`, `order_items`) regardless of row counts, and `TRUNCATE ... CASCADE` would cascade into truncating `catalog_unified` itself (the entire 90K+ row product catalog). Used `DELETE` instead, after first nulling `catalog_unified.canonical_product_id` for all rows so the delete wouldn't hit an FK violation.

**Revert executed:**
```sql
UPDATE canonical_match_proposals SET status='pending', reviewed_by=NULL, reviewed_at=NULL WHERE status IN ('confirmed','applied');  -- 3,233 reopened
UPDATE catalog_unified SET canonical_product_id = NULL;  -- 111,734 rows
TRUNCATE product_vendors;  -- safe, no incoming FKs
DELETE FROM canonical_products;  -- 90,605 rows, matches active catalog count exactly
```

**Rebuild:** `node build_canonical_products.mjs --phase=a` (89,203 unlinked active products → clean 1:1 canonicals, 22.1s) then `--phase=b` (OEM-matching candidate generation).

### build_canonical_products.mjs — Phase B Mismatch Filter (new) ✅

Ported the exact `effectivePackQty()`/`parseFinish()` logic from the admin review UI's display-only mismatch badges directly into Phase B's candidate-generation loop, so a pack-qty or finish/color mismatch never becomes a proposal at all — previously these checks were purely cosmetic (shown as a badge) and never blocked "Confirm," which is exactly how the original bad merges got approved. Fetches `name`/`pack_qty` for all candidate product IDs in one batched query rather than per-pair. Rerun result: 1,293 new proposals, 36 skipped (pack-qty mismatch), 79 skipped (finish/color mismatch).

### sweep_pending_mismatches.mjs (new script) ✅

Phase B's new filter only covers newly-generated candidates — the 3,233 proposals reopened from confirmed/applied back to pending were never checked against it. New standalone script applies the identical mismatch logic against ALL currently-pending proposals regardless of `match_reason`, dry-run by default (`--apply` to write). Auto-rejected rows tagged `reviewed_by = 'auto:pack_qty_mismatch'` / `'auto:finish_mismatch'` so they're distinguishable from human review in any future audit. Result: 206 of 3,313 pending proposals auto-rejected (172 pack-qty + 34 finish), all manually spot-checked against the printed pairs before applying — no false positives found in the sample reviewed.

### app/admin/canonical-matches/page.tsx — Null-OEM Crash Fixed ✅

Runtime crash (`Cannot read properties of null (reading 'startsWith')`) traced to `const key = p.shared_oem_number` having no fallback for proposals where that column is null — 2,433 of them, all `match_reason = 'upc'` or `'brand_part_number'`, from a second match-generation pipeline that was never identified this session (see Open Issues). These previously went straight from pending to confirmed/applied via direct SQL or some other path without ever rendering in the pending tab, which is why the bug was never hit before tonight's revert put them back in `pending` for the first time.

Fix: `groupKeyOf()` helper with a per-proposal synthetic fallback key (`__pair_${id}`), used consistently in both the grouping logic and the three post-action state filters (`selectiveAction`, `bulkAction`, `flagAsVariant`) that previously compared directly against the raw `shared_oem_number` column — those would have silently failed to clear synthetic-key groups from the UI after acting on them (a worse bug than the crash, since it fails silently). Also discovered `bulkAction` posts `shared_oem_number` to the server as the literal `WHERE`-clause match value — incompatible with synthetic keys by definition, since there's no real shared value to match on. Added `actOnGroupByIds()` using the existing proposal-ID-based `/select` endpoint instead, routed to specifically for non-real-OEM groups via a new `isRealOemGroup()` check; real-OEM groups' existing `bulkAction` flow is completely untouched.

Header badge now shows "UPC match" / "Brand part # match" (derived from `match_reason`) instead of attempting to render a null OEM number.

### app/api/admin/canonical-matches/sync-fitment/route.ts — Column Name Bug Fixed ✅

`INSERT INTO catalog_fitment_v2 (..., confidence, source)` referenced two columns that don't exist — confirmed via `\d catalog_fitment_v2` the real names are `confidence_score` and `fitment_source`. One-line fix, verified by re-running "Sync fitment" on the previously-failing group afterward.

### PU Image Zip Stopgap — Full Scan + Apply ✅

Last session's planned stopgap (full non-sampled Content-Type scan, null confirmed-bad rows) finally executed. New `scan_zip_contamination_full.mjs` extends `check_dead_images.mjs`'s approach to cover BOTH `catalog_unified.image_url` AND `catalog_media.url` in one run — the existing script only ever covered the first, which would have left the `COALESCE(image_url, catalog_media.url)` fallback silently serving the same bad zip even after nulling `image_url` alone. Classifies affected products into "rescued by a good catalog_media row" vs. "no fallback, will show placeholder" for visibility. Dry-run by default.

Dry run found 31,730 products with a bad `image_url` (0 rescued by catalog_media, all need the placeholder) and 31,396 confirmed-bad `catalog_media` rows. Applied: nulled all 31,730 `image_url` values, deleted all 31,396 bad `catalog_media` rows.

**Vendor breakdown surfaced an unexpected result:** 31,415 PU + 315 VTwin (0 WPS). The 315 VTwin products were NOT expected, since VTwin's images don't come from PU's feed at all — investigated separately (see below) and confirmed to be a real, unrelated, pre-existing VTwin data issue, not a false positive from the scan.

### VTwin's 315 Nulled Products — Investigated, Confirmed Genuinely Dead ✅

Initial hypothesis: VTwin's CDN requires a spoofed `Referer` header to bypass hotlink protection (confirmed present in `image-proxy`'s VTwin-specific code) — our scanner's plain `fetch()` sends no such header, so a hotlink-blocked-but-actually-fine image could have been misclassified as dead. **Disproven by direct testing:** `curl` against the real source URLs (pulled from `vtwin_catalog.full_pic1`, after discovering the SKU join needs `replace(cu.sku, 'VT-', '') = vtwin_catalog.sku`) returned identical `404`s with and without the Referer spoof, across 5 sample products spanning different SKUs. These are genuinely missing files on VTwin's own server — unrelated to the PU zip story, correctly nulled, no restoration possible or needed.

### PU PIES/Catalog-Content XML — Hidden Direct-Image Field Investigated, Ruled Out ✅

User recalled having downloaded all of PU's per-brand PIES/Catalog-Content XML exports (`scripts/data/pu_pricefile/brand_files/`, 136 files, two distinct schemas) and asked whether more usable image data was sitting unused in them. Investigation:

- `import_pu_brand_xml.js` line 217 (Catalog Content parser): `image_uri: str(p.partImage) || str(p.productImage) || null` — `partImage` (confirmed via base64-decoding the URL path to contain 7 comma-separated asset GUIDs) wins via `||` short-circuit whenever present, with `productImage` (decoded to a single asset reference) essentially never used despite sitting in the same record.
- Tested directly via `curl -r 0-1023 -D -` against the real `productImage` URL: **identical `Content-Type: application/x-zip`** as `partImage`. The `/z/` path on `asset.lemansnet.com` is a zip-delivery endpoint by design regardless of asset count — not a field-selection bug.
- Checked true PIES format separately (different code path, no partImage/productImage ambiguity) — same root issue at the source: `<FileName>99013666.zip</FileName>`, `<AssetType>ZZ1</AssetType>` (non-standard PIES code, reads as PU's own "this is a bundle" marker).
- `Descriptions`/`ExtendedInformation` blocks checked for unused spec/marketing data — thin on the one sample file checked (All-Balls, a low-narrative bearings/seals brand); only one uncaptured code (`EXPICode="LIF"`) found, and its value was identical across every item, so not informative. Worth a similar check on a higher-narrative brand (helmets/apparel) if pursued further, but not done this session.

**Conclusion: confirmed, not a parsing bug — PU's upstream feed genuinely never ships a direct single image for these products.** This sharpened the existing PU_ZIP_EXTRACTION_TODO.md investigation rather than finding a shortcut around it.

### MAJOR FINDING — Working Zip-Extraction Proxy Already Existed, Unwired From the Real Render Path ✅

User recalled having been able to view real PU images via a proxy at some earlier point. Found TWO separate implementations already in the codebase:

- `app/api/img/route.ts` — `AdmZip` (Node-only), disk-cached at `/tmp`, only referenced by `ProductDetailClient.jsx`.
- `app/api/image-proxy/route.ts` — `fflate` (edge-compatible), also handles WPS mixed-content piping and VTwin Referer-spoofing, more complete/recent. Wired into `ProductQuickViewModal.jsx` and `admin/products/[id]/page.jsx`, but never into the main browse grid (`ProductCard.jsx`) or the live PDP (`pdp-page.jsx` → `ProductImage.jsx`) — confirmed via `grep -rln "ProductDetailClient" app/` that `ProductDetailClient.jsx` itself is dead code, imported nowhere.

Validated "grab the first image file inside the zip" against 6 real products spanning different brands/categories — including two genuine multi-asset (2-file) zip bundles (Akrapovic, Alloy Art) where file-ordering actually mattered, not just single-asset ones. All 6 returned the correct product photo with no mismatches.

### PU image_url Restored for Rescued Products ✅

Backfilled `catalog_unified.image_url` from `pu_brand_enrichment.image_uri` for the nulled PU rows, using the same normalized-SKU join and coming-soon-placeholder exclusion already established in `import_pu_brand_xml.js`. Source tables (`pu_catalog`, `pu_brand_enrichment`) were never touched by the null/delete pass, making this a safe, fully lossless restore regardless of which URL (zip or otherwise) ends up there — the proxy sorts that out at render time. 31,396 of 31,415 restored; 19 had no usable source value either (no match, null, or excluded as a placeholder) and stay on the "NO IMAGE" placeholder.

### image-proxy Wired Into the Real Render Path ✅

`ProductCard.jsx` (browse grid) and `ProductImage.jsx` (PDP hero + mini cards) both got an identical small `resolveImageSrc()` helper — checks `hostname === 'asset.lemansnet.com'` (matching `image-proxy`'s own allowlist exactly) and routes through `/api/image-proxy?url=...` if so; every other vendor's URL renders exactly as it did before, since that path was never broken. Deployed. PDP visually confirmed live with two different real chrome exhaust kit photos, correct fitment/pricing per SKU. Browse grid itself was not separately re-confirmed by screenshot before session end (carried to next session, see Open Issues).

### NEW FINDING — Variant Groups With No Distinguishing Axis ✅ (investigation complete, fix pending)

Surfaced incidentally while spot-checking the PDP image fix: VT-29-1169 ("True Dual Exhaust Pipe System Chrome," fits FLST/FXST 1995–1999, $416.43) and VT-29-1190 (same name, fits FLST/FXST 2000–2006, $382.68) are grouped as Color variants of each other (`catalog_variant_members` group 34089), both with `option_1_name='Color'`/`option_1_value='Chrome'` and no `option_2` at all — the PDP color picker showed two indistinguishable "CHROME" pills for genuinely different products with no visual way to tell them apart.

Confirmed systemic, not a one-off: `SELECT group_id, COUNT(*) FROM catalog_variant_members GROUP BY group_id HAVING COUNT(DISTINCT option_1_value)=1 AND bool_and(option_2_name IS NULL OR option_2_name='') AND COUNT(*)>1` returns **668 groups** (group sizes range from 2 up to 12 members). Product-count total not yet pulled this session.

Root cause not yet confirmed — likely mixed: session 49's deliberate removal of the Fits/fitment axis from `build_variant_groups.cjs` (to stop year-range data showing up as a confusing variant option) may have left fitment-only-differentiated products with nothing left to display, and/or some groups may be unrelated bad Jaccard name-similarity matches (a 12-member group with zero distinguishing axis is suspicious on its own, independent of the Fits-axis theory). Needs root-cause investigation before any fix is written.

## DB State After This Session

| Table / Column | State |
|----------------|-------|
| `canonical_products` / `product_vendors` | Fully rebuilt from scratch — 89,203 clean 1:1 canonicals, then OEM-matched. Pre-revert merge history is gone by design (not recoverable, not needed — see revert rationale above). |
| `canonical_match_proposals` | 3,233 reopened to pending, 206 auto-rejected by the mismatch sweep, 1,293 new from the rebuilt Phase B. Live queue per last admin check: pending 2,246 · confirmed 855 (NOT YET APPLIED) · applied 0 · rejected 1,081. |
| `catalog_unified.image_url` (PU) | 31,415 nulled, then 31,396 restored from `pu_brand_enrichment.image_uri` (same URLs as before — proxy now handles rendering). 19 PU products have no recoverable value at all. |
| `catalog_unified.image_url` (VTwin) | 315 nulled, confirmed genuinely dead on VTwin's own server, NOT restored — no good source exists. |
| `catalog_media` | 31,396 confirmed-bad rows deleted (PU + VTwin combined, not yet broken down separately). |
| `app/api/image-proxy/route.ts` | Now load-bearing for the browse grid and PDP, not just the quick-view modal/admin page it was originally wired into. Still has zero persistent caching. |

## Open Issues / Next Session

| Priority | Task |
|----------|------|
| BLOCKING | Payment gateway decision — due Wed June 17 (carried over) |
| HIGH | Apply the 855 already-confirmed canonical match merges (never clicked "Apply confirmed merges" this session) |
| HIGH | Investigate root cause of the 668 no-distinguishing-axis variant groups before fixing — Fits-axis removal vs. bad Jaccard matches, or both |
| MED | Add a persistent cache layer (Blob/S3/R2) to `image-proxy` before it carries full production traffic |
| MED | Visually re-confirm the browse grid (`/browse`) renders PU photos correctly post-deploy — only the PDP was confirmed this session |
| MED | Identify the unknown script generating `match_reason='upc'`/`'brand_part_number'` proposals — check whether it has the same pack-qty/finish blind spot Phase B had before tonight's fix |
| MED | Decide whether to delete `app/api/img/route.ts` now that `image-proxy` is the one actually load-bearing |
| LOW | Pull the list of 19 PU products with no recoverable image anywhere, for awareness |
| LOW | Continue canonical match manual review — 2,246 pending |
| LOW | Review 283 confidence=1 rows in `oem_supersession_review` (carried over, untouched again this session) |
| LOW | TC/M8 platform dedup in variant groups (carried over) |

