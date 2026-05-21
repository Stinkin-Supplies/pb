# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: Fitment Promotes + Variant Grouping + Browse UX + PDP Fixes · May 21, 2026 (Twenty-Sixth Pass)**

---

## WHERE WE ARE

### What Was Built/Fixed This Session

#### 1. Fitment Pipeline — All Three Sources Live ✅
- `promote_pu_fitment.cjs` — fixed 3-table join (`pfe.model_code → harley_models.model_code → harley_model_years`). Inserted **1,339,680 PU rows** into `catalog_fitment_v2`
- `ingest_vtwin_fitment.cjs` — fixed `catalog_oem_crossref` join (uses `sku` not `product_id`), fixed VTwin SKU prefix (`VT-` prepend). Inserted **19,934 VTWIN rows**
- ERA BACKFILL SQL re-run post-promote — **13,773 products** re-tagged across 10 era columns
- `catalog_fitment_v2` now at **1,442,872 rows**

#### 2. Variant Groups — Attribute Extraction ✅
`build_variant_groups.cjs` overhauled with full attribute extraction:
- **Size** — engine oversize: `+0.001`, `+0.020`, `STD`, `OS`, `US`
- **Compound** — brake pad type: `Organic`, `Sintered`, `Semi-Metallic`
- **Apparel Size** — `2X`, `XL`, `SM` etc. Runs before Color so "BLACK 2X" → Apparel Size
- **Gauge** — `18 gauge`, `18ga`
- **Rise** — `12" APE`, `10" rise`
- **Finish** — `Matte Black`, `Gloss Black`, `Cadmium Plated` etc. (multi-word, before plain Color)
- **Throttle** — `Push-Pull`, `Single Cable`, `Dual Cable`
- **Color** — plain colors with displacement-number guard (128 BLACK → Color: Black ✅)
- Re-run result: **2,887 groups / 19,464 members**
- Axis breakdown: Color 951, Apparel Size 409, Size 24, Finish 21, Rise 17, Compound 12, Gauge 8, Throttle 4

#### 3. PU Variant Grouping — Wire Spools ✅
`scripts/ingest/build_pu_variant_groups.cjs` — new script:
- Whitelist approach: only groups `name LIKE '%wire spool%'` with no fitment rows (fitment-driven products excluded)
- Uses paired `(id, name)` row fetch — fixes `array_agg` ordering mismatch that was assigning wrong color labels
- Raw suffix used as `option_1_value` (preserves "White/Red", "Brown/Black" two-tone names)
- Idempotency: checks for existing group before inserting
- Result: **6 PU groups, 83 members** (NAMZ 18g, 20g, 25' GXL 10g/12g/14g/16g)
- DS 35' Wire Spool 16g also grouped (10 members)

#### 4. WPS Wire Spool Groups — Split + Labeled ✅
- WPS group 27 (`100-Foot OEM Color Wire Spools`) split into **18g (id=8686, 26 members)** and **20g (id=8687, 25 members)**
- `option_1_value` fixed for both: 18g via regex strip, 20g via parentheses extraction
- All 4 100ft groups linked via `family_key = 'namz-wire-spool-100ft'`
- All 4 25' GXL groups linked via `family_key = 'namz-wire-spool-25ft-gxl'`
- `catalog_variant_groups.family_key` column added with GIN index

#### 5. Browse Query — Variant Deduplication ✅
`lib/db/browse.ts`:
- `DISTINCT ON (COALESCE(variant_group_id, 'u' || id))` — one card per variant group
- Inner sort: `in_stock DESC, computed_price ASC` — best SKU represents the group
- Outer query applies user sort + pagination on top of deduped set
- Count query also deduplicates — pagination total matches visible cards
- `variant_count` window function passed through to cards
- Browse count dropped from 90,276 → **~78,357 deduplicated cards**
- All filter state now initialized from URL params on mount (subcategory, in_stock, sort, min/max price, modelCodes were previously ignored on back-navigation)
- `handleFilterChange` now calls `window.history.replaceState` — back button restores filters
- Scroll position saved to `sessionStorage` on card click, restored on mount

#### 6. Variants API Route ✅
`app/api/browse/variants/[productId]/route.ts`:
- `DISTINCT ON (option_1_value)` — deduplicates PU catalog entries with identical names (same physical product, two vendor_skus)
- Image falls back to `cu.image_url` when `catalog_media` has no entry (fixes broken images on PU products)
- Returns `currentProductId` so VariantSelector highlights the correct current option
- Returns `siblingGroups` — other groups sharing the same `family_key` for gauge tabs
- Sibling query uses `family_key` (explicit cross-vendor) or base-name prefix (auto same-vendor)

#### 7. VariantSelector — Gauge Tabs ✅
`components/browse/VariantSelector.jsx`:
- Gauge pill tabs above color list: `10g / 12g / 14g / 16g / 18g / 20g / OEM`
- `extractGaugeTab()` parses display name → short label; OEM groups → "OEM"
- `extractBaseName()` strips gauge suffix for header: "100' Wire Spool - 18 Gauge" → "100' Wire Spool"
- Tab dedup: multiple groups with same gauge label (PU + WPS both 18g) collapse to one tab, current group preferred
- Clicking a tab navigates to that group's `representativeSlug`
- `currentProductId` from API used for isCurrent (was using prop, causing wrong highlight)
- Variants sorted alphabetically by `option_1_value`, current item pinned first

#### 8. Browse Page — Variants Badge ✅
`app/browse/page.jsx`:
- Gold pill badge bottom-left of product image when `variant_count > 1`
- Style: solid gold background, black text, black dot grid icon — matches OEM badge aesthetic
- Shows count: "26 OPTIONS"
- All filter state reads from URL on init — back button now restores subcategory, sort, in_stock etc.

#### 9. BottomNav — Desktop Browse Fix ✅
`components/BottomNav.tsx`:
- Fixed: on desktop `/browse`, HOME was missing (hamburger was hidden via CSS but nothing replaced it)
- Now renders both HOME link and hamburger; CSS shows HOME on desktop, hamburger on mobile

#### 10. Home Page UI Fixes ✅
- `page.jsx` (home): SmokeBackground replaced with cream grid (`body::before` CSS grid pattern, `rgba(180,165,130,0.55)`)
- `EraKineticTile.jsx`: text blur fixed (removed `WebkitTextStroke` transparent trick → solid cream color), tile fully transparent (`background/border/backdrop: none`), z-index 10 so carousel cards fly through
- `ScrollVelocity.jsx`: solid row color changed to `#1a1610` (was cream on cream = invisible), outline row stroke boosted, all margins zeroed, font bumped to `clamp(72px, 10vw, 140px)`
- `ModelSearch.jsx`: "What are you riding?" font changed to `clamp(18px, 4.5vw, 52px)` with `whiteSpace: normal` — was overflowing on mobile

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. Product Images — PU LeMans CDN Fix (HIGH)
PU products have `image_url` set to LeMans CDN URLs (`http://asset.lemansnet.com/...`) but the gallery in `ProductDetailClient.jsx` isn't running them through `proxyImg()`. Wire spools and many other PU products show "No Image". Fix: ensure gallery images go through `/api/img?u=` proxy.

### 2. Typesense Reindex (HIGH)
`catalog_variant_groups` and `variant_group_id` changes from this session aren't reflected in Typesense yet.
```bash
node scripts/ingest/index_unified.js --recreate
```

### 3. Fulfillment Routing — Backlog (FUTURE)
Discussed architecture for cross-vendor dedup at checkout:
- **Problem**: WPS and PU both carry same physical products (e.g. NAMZ wire spools). Currently showing one card on browse (correct) but at checkout need to route to cheapest/most profitable vendor.
- **Architecture needed**:
  1. `cross_vendor_products` table — maps WPS ↔ PU SKUs for same item (OEM number matching can bootstrap)
  2. `resolve_cart_fulfillment(cart_items[])` — picks optimal vendor per line item
  3. Logic: in-stock → consolidate to fewest vendors → most profitable margin
  4. Wire into CartContext / checkout flow
- **Do NOT build now** — finish browse/PDP UI work first. `pick_fulfillment()` function already exists from earlier sprint.

### 4. WPS Fitment Files (BLOCKED — external)
Still pending from rep since April 30. Follow up again.

### 5. Cart Wiring (FUTURE)
CartContext / addItem is still placeholder only.

### 6. build_pu_variant_groups.cjs — Expand Whitelist (LOW)
Current whitelist only groups wire spools. As more PU product categories are reviewed and confirmed as genuine color/size variants (not fitment variants), add them to the whitelist:
- Grips (color variants, no fitment)
- Mirrors (left/right variants)
- Pegs (color/finish, no fitment)

---

## KEY FILES CHANGED THIS SESSION

| File | Location | Change |
|------|----------|--------|
| promote_pu_fitment.cjs | scripts/ingest/ | Fixed 3-table join for model_year_id resolution |
| ingest_vtwin_fitment.cjs | scripts/ingest/ | Fixed catalog_oem_crossref join + VT- SKU prefix |
| build_variant_groups.cjs | scripts/ingest/ | Full attribute extraction pipeline (7 axes) |
| build_pu_variant_groups.cjs | scripts/ingest/ | New — PU wire spool name-based grouping, idempotent |
| split_wps27.cjs | scripts/ingest/ | One-time — split WPS group 27 into 18g + 20g |
| fix_wps8687.cjs | scripts/ingest/ | One-time — fix 20g WPS option_1_value labels |
| browse.ts | lib/db/ | DISTINCT ON variant dedup, URL filter init, history sync |
| route.ts (variants) | app/api/browse/variants/[productId]/ | DISTINCT ON dedup, image fallback, siblingGroups |
| VariantSelector.jsx | components/browse/ | Gauge tabs, currentProductId fix, alpha sort, tab dedup |
| page.jsx (browse) | app/browse/ | Variants badge, filter URL sync, scroll restore |
| BottomNav.tsx | components/ | Desktop HOME restored on /browse |
| page.jsx (home) | app/ | Cream grid bg, SmokeBackground removed |
| EraKineticTile.jsx | components/home/ | Text blur fixed, transparent tile, z-index 10 |
| ScrollVelocity.jsx | components/home/ | Color fix, margins zeroed, font size bumped |
| ModelSearch.jsx | components/home/ | Mobile font overflow fixed |

---

## DB STATE

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified | 96,711 total / 90,276 active | ✅ |
| — WPS | 22,278 | ✅ |
| — PU | 36,684 | ✅ |
| — VTWIN | 37,749 | ✅ |
| Typesense | 90,276 docs | ⚠️ Needs reindex after variant_group_id changes |
| catalog_fitment_v2 | 1,442,872 | ✅ PU + VTWIN promoted |
| catalog_variant_groups | 2,901 | ✅ Includes PU wire spool + WPS split groups |
| catalog_variant_members | 19,557 | ✅ |
| catalog_unified.variant_group_id | 19,557 tagged | ✅ |
| catalog_variant_groups.family_key | Set on 8 groups | ✅ namz-wire-spool-100ft (4), namz-wire-spool-25ft-gxl (4) |
| catalog_oem_crossref | ~14,819 | ✅ |
| catalog_media | 32,718 | ✅ PU images only — WPS via CDN proxy |
| vendor_offers | 22,278 | ✅ |
| harley_model_years | ~2,230 | ✅ |
| harley_families | 17 | DO NOT MODIFY |
| era_* columns on catalog_unified | 13,773 products tagged | ✅ Re-run post fitment promote |
