# STINKIN' SUPPLIES — HANDOFF LOG

> **Note:** Sessions 57–58 are detailed in `HANDOFF_PATCH.md`. Sessions 49–56 are summarized below.
> Full per-session detail for sessions 41–47 is in the original HANDOFF_LOG. This file consolidates forward.

---

# ——— FIFTY-EIGHTH PASS (June 25, 2026) ———

## WHERE WE ARE

VTwin fitment coverage expanded from 41.1% → 55.8% via two new scripts. PDP window function crash fixed. PU fitment gap confirmed unfixable without a new feed. Typesense reindex needed.

⚠️ Payment gateway still undecided — BLOCKING checkout.
⚠️ 62 variant candidates still pending manual review.
⚠️ VTwin build_product_details.mjs attributes bug: extra_attributes stored as stringified JSON. Workaround active in ProductDetailsSection (#22 on chase list).
⚠️ scrape_vtwin_missing.mjs pg deprecation warning (concurrent queries on single client) — not failing.

## What Was Done

### PDP Window Function Crash Fixed ✅
`app/browse/[slug]/page.jsx` — `MIN(priority) OVER ()` inside FILTER clause was illegal in Postgres window context. Replaced the entire lateral with `array_agg(url ORDER BY priority ASC)` nested subquery; `urls[1]` = primary, `urls` = all_urls.

### Fitment Gap Analysis ✅
Full investigation of 47,531 products with no fitment. Title parsing: ~90 products, dead end. PU gap: 17,796 products — all in FatBook/OldBook but pu_fitment_parsed never produced fitment for these pages (no model-specific tables). Unfixable without PU API. WPS gap: 9,345 — confirmed non-HD/universal products, correct as-is. VTwin gap: 20,376 — addressed via scraper.

### `parse_vtwin_fitment_raw.mjs` — New ✅
Parses `fitment_raw` strings from vtwin_scrape_data for VTwin products with scrape data but no catalog_fitment_v2 rows. Pattern: `MODEL_CODE YEAR-YEAR` or `YEAR-UP`, pipe-separated. Skips Indian/Excelsior/Custom/DLX/Hummer. FXBFS typo fixed to FXFBS. ~86,833 rows inserted total across all runs (fitment_source=`vtwin_fitment_raw`, confidence=0.80). Dry-run default, `--apply` flag.

### `scrape_vtwin_missing.mjs` — New ✅
Two-phase scraper. Phase 1: GraphQL batches of 50 SKUs → url_key; 31,288 SKUs queried, 12,398 url_keys found, 18,890 not on vtwinmfg.com (discontinued). Phase 2: 8-concurrent HTML fetch of `{url_key}.html`, parses `<td data-th="FITS">` + OEM No. + description + attrs, upserts vtwin_scrape_data. 12,265/12,398 had fitment (99% hit rate). Checkpoint saved to vtwin_scrape_checkpoint.json. Runtime ~25 min.

### Net Result
VTwin fitment: 15,741 products (41.1%) → **21,390 products (55.8%)**. vtwin_scrape_data: ~19,000 → ~31,000+ rows.

## DB State After Session 58

| Table/Column | State |
|---|---|
| catalog_unified total active | **89,153** |
| catalog_fitment_v2 VTwin coverage | **21,390 products (55.8%)** |
| catalog_fitment_v2 new rows | ~86,833 (vtwin_fitment_raw source) |
| vtwin_scrape_data | **~31,000+ rows** (+12,398) |
| Typesense | **Reindex needed** — 89,153 docs currently indexed but fitment additions not yet reflected |

---

# ——— FIFTY-SEVENTH PASS (June 24, 2026) ———

## What Was Done

### infer_vtwin_categories.mjs — Updated + Run ✅
VTWIN_CATEGORY_TO_DISPLAY map (28 VTwin source categories → 21 display values). Live UPDATE sets both `category` and `display_category` in one pass. Run: 566 products, 100% match, 0 unmatched.

### generate_vtwin_skus.js — Full Rewrite ✅
Old script referenced non-existent schemas (vendor.vtwin_sku_staging, etc.) and had hardcoded credentials. Rewritten to: read catalog_unified WHERE source_vendor='VTWIN' AND internal_sku IS NULL; map display_category → SKU prefix; allocate from sku_counter; write internal_sku directly with .v suffix. Dry-run default, --apply flag.

### Browse ?category= Filter Stuck Bug ✅
CategoryBentoGrid and PDP breadcrumb were linking to `?category=Engine` (legacy) instead of `?display_category=Engine`. page.jsx filter init now folds old param into display_category. Removed category/subcategory from API params, URL builder, clear-all. Breadcrumb link on PDP fixed.

### OEM Number Search ✅
browse.ts ILIKE fallback extended to `unnest(cu.oem_numbers)`. Each word now also searches OEM arrays. Query `16779-99` went from 1 → 3 results.

### ProductImageGallery.jsx — New ✅
Client component. Builds image list from primaryUrl + imageUrls[], deduplicates. Single image → renders as before. Multiple → 1:1 hero + 64px thumbnail strip, gold border on active, per-image onError, horizontally scrollable. PU reads from catalog_media.all_urls; VTwin reads from cu.image_urls. getProduct() SQL updated: cu.image_urls added; catalog_media lateral fetches all images as array.

### PDP Layout + OEM Panel ✅
ProductDetailsSection moved above DataTabs (was below). OemAlternativesPanel removed entirely (import, parallel fetch, render).

### VTwin Attributes JSON Parse Fix ✅
ProductDetailsSection in page.jsx: attributes field now parsed with JSON.parse() if typeof === 'string'. Real fix in build_product_details.mjs is #22 on chase list.

### extract_pu_images.mjs — New ✅
Parses 133 PU brand XML files in scripts/data/pu_pricefile/brand_files/. Two schemas: PIES (DigitalAssets → URI) + Catalog_Content (partImage compound URL → base64 decode → comma-split). SKU matching normalized to no-dash on both sides. Results: 22,253 PU products with multi-image; 33,740 catalog_media rows inserted; 8,828 PU descriptions added; 15,330 OEM crossref entries (source=PU_PIES). Idempotent.

Typesense reindex: 89,153 docs, 0 errors.

---

# ——— FIFTY-SIXTH PASS (June 23, 2026) ———

## What Was Done

### build_pack_size_groups.mjs — Sync + Dedup ✅
dedupByPackQty() added (PU wins ties). Sync/evict on re-run. Fixed canonical query dropping variant_group_id IS NULL filter. canonical:91278 fixed. 148 total MULTI groups.

### scan_pack_qty_from_names.mjs — New ✅
12 auto-apply patterns + 3 review-only. 254 corrections applied. pack_qty>1 products: 1,917 → 2,171.

### product_details JSONB Column — New ✅
build_product_details.mjs normalizes PU features + WPS HTML→bullets + VTwin description/pdp_payload. 59,765/89,153 = 67% coverage initially. GIN index. index_unified.js updated: uses product_details as primary source, WPS HTML stripped from Typesense.

### PDP — ProductDetailsSection ✅
Description, gold-bulleted features, tech note callout, attributes grid.

### VTwin Catalog Refresh ✅
import_vtwin_catalog.js + ingest_vtwin_unified.js fixed. 38,160 products loaded, 411 new. 566 new SKUs assigned (MSC999973–1000538). VTwin OEM crossref: 8,426 → 16,752. VTwin scrape data synced: 87 descriptions + 3,165 pdp_payload entries. sku_counter table created and seeded.

Typesense reindex: 89,153 docs, 0 errors.

---

# ——— FIFTY-FIFTH PASS (June 22–23, 2026) ———

## What Was Done

- Credential rotation — WPS_TOKEN + DB password rotated, process.env references confirmed
- **Canonical merges fully drained** — 2,407 applied / 0 pending / 1,772 rejected
- WPS pack_qty: 1,070 corrected from WPS inventory data
- build_pack_size_groups.mjs new — cross-vendor pack-size variant groups, 145 groups initially
- WPS OEM crossref: 1,665 entries imported from wps-cross-fitment.csv
- VTwin OEM crossref: 8,426 entries from vtwin_catalog.oem_numbers
- 4× Typesense reindexes

---

# ——— FIFTY-FOURTH PASS (June 22, 2026) ———

## What Was Done

- Fulfillment pipeline: optimizer.ts, triggerFulfillment.ts, checkout/prepare, orders/create
- build_variant_groups.cjs: non-distinguishing axis bug fixed — 994 false groups where both members had same axis value (e.g. Chrome vs Chrome) dissolved
- Blast radius: 668 groups / 1,768 members before fix. All dissolved via rebuild
- Variant rebuild + reindex

---

# ——— FIFTY-THIRD PASS (June 16–22, 2026) ———

## What Was Done

- browse.ts: structural params fix (shared-array bug causing per-query param contamination)
- Canonical: Phase B mismatch-filtering rebuilt (pack qty + finish/color false-positive filters)
- Sweep script: auto-rejects queued proposals failing mismatch checks; all 2,407 pending proposals drained
- Orphan-fix SQL for chain-merge stragglers
- Image proxy: fflate-based route wired into ProductCard.jsx and ProductImage.jsx via resolveImageSrc()
- PU image contamination: 31,730 products nulled, 31,396 bad catalog_media rows deleted
- PU image URLs restored from pu_brand_enrichment
- OEM badge on PDP sourced from catalog_oem_crossref only

---

# ——— FIFTIETH PASS (June 15, 2026) ———

## What Was Done

- Browse OEM chain: pre-fetches chain product IDs (1.3ms warm) when year+model set
- ProductCard.jsx extracted as separate client component; selected/onSelect props; OEM chain badge
- InlinePanel.jsx — three parallel queries (variants, fitment year ranges, OEM crossref traversal)
- Browse inline panel API route
- Variant rebuild

---

# ——— FORTY-NINTH PASS (June 14, 2026) ———

## What Was Done

- **OEM supersession system**: oem_supersession table (283 pairs, confidence=1 pending review)
- normalize_oem() function (strips dashes/spaces/uppercases)
- from_oem_norm / to_oem_norm generated columns
- oem_supersession_review view
- mv_oem_fitment_coverage matview (683K rows, recursive forward+backward chain)
- browse.ts pre-fetch for OEM chain products
- Variant groups: Fits axis removed from WPS variant members
- normalizeAxisName() mapping (Finish→Color etc.)
- getChronologicalNeighbors updated with optional displaySubcategory param

---

# ——— FORTY-EIGHTH PASS (June 12–13, 2026) ———

## What Was Done

Full detail in HANDOFF_LOG.md (original). Summary:
- CRITICAL: PU vendor_sku completely fixed — all 36,396 active PU rows: vendor_sku = sku (PU's ordering number). brand_part_number retained as manufacturer cross-reference.
- Migrations: 005 (is_kit), 006 (pack_qty), 007 (DS###### PU rows), 010 (all remaining PU rows), 011 (variant_candidates table)
- Canonical match review tool expanded to v16 — inline editor, manual match, mismatch badges, variant flagging, variant candidates page
- admin/products/[id]/page.jsx: cream/gold/black restyling
- admin/products/[id]/route.ts: GENERIC_FIELD_MAP for ProductManager flat-body PATCHes
- ProductManager.jsx: pack_qty column
- admin/products list route: internal_sku + brand_part_number in search

---

# ——— FORTY-SEVENTH PASS (June 11–12, 2026) ———

## What Was Done

- Fulfillment architecture locked (drop-ship PU+WPS, VTwin manual PO, own merchant gateway TBD)
- canonical_products / product_vendors / canonical_match_proposals / orders tables created
- Phase A+B canonical pipeline: 89,153 products → 1:1 canonical entries; 469 OEM groups / 1,537 proposals
- CartContext, optimizer.ts, triggerFulfillment.ts, checkout/prepare, checkout/charge routes
- Initial vendor_sku fix (PU side found backwards in session 48 and re-fixed)

---

# ——— PASSES 41–46 (June 5–8, 2026) ———

Covered: display_subcategory taxonomy complete (all 20 categories, 87–97% coverage). VTwin round-2 scrape (22,583 rows). CategoryBentoGrid + ModelFinder redesign. browse.ts disjunctive faceting + count fix + variant dedup. FilterSidebar. VariantSelector Mode A. Font system locked (Tanker + Bespoke Serif Variable + Share Tech Mono). FlowingMenu + /models page. OEM cleanup (4,122 PU catalog numbers removed). VTwin OEM sync (15,723 products). mat view refresh.
