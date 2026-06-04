# STINKIN' SUPPLIES — HANDOFF LOG

---

# ——— THIRTY-EIGHTH PASS (June 4, 2026) ———

Session: Thirty-Eighth Pass · June 4, 2026

## WHERE WE ARE

Short session focused entirely on the admin inline edit system. No schema changes beyond the auto-created `catalog_review_flags` table. No catalog or fitment changes. No reindex needed.

## What Was Done This Session

### 1. AdminEditPanel Component ✅

Built `components/admin/AdminEditPanel.jsx` — a self-contained floating edit panel for the PDP. Activated by visiting any product page with `?admin=1&token=ADMIN_SECRET` in the URL.

**Edit Fields mode:** Edits `display_category` (dropdown of all 20), `display_subcategory` (freetext + quick-pick suggestion chips per category), and `fits_all_models` toggle. Shows the raw vendor category as a read-only reference. Save button greys out until a field is actually changed. On save: PATCH to `/api/admin/products/[id]` → Postgres UPDATE → single Typesense document PATCH (no full reindex).

**Flag Issue mode:** Saves to `catalog_review_flags` — nothing changes on the live product. Flag types: wrong_category, wrong_subcategory, missing_fitment, wrong_fitment, bad_image, duplicate, other. Notes field optional.

### 2. API Route ✅

`app/api/admin/products/[id]/route.ts`:
- **PATCH `{ action: "update" }`** — updates `display_category`, `display_subcategory`, `fits_all_models` on `catalog_unified`, then fires async Typesense single-doc PATCH
- **PATCH `{ action: "flag" }`** — upserts to `catalog_review_flags` (ON CONFLICT updates notes + resets resolved=false)
- **GET** — returns all unresolved flags joined to `catalog_unified` for review

Auth: `ADMIN_SECRET` env var checked against `?token=` query param or `X-Admin-Token` header.

### 3. catalog_review_flags Table ✅

Auto-created by the route on first flag submission. No migration script needed.

```sql
CREATE TABLE IF NOT EXISTS catalog_review_flags (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL,
  flag_type   TEXT NOT NULL,
  flag_notes  TEXT,
  flagged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  UNIQUE (product_id, flag_type)
);
CREATE INDEX IF NOT EXISTS idx_catalog_review_flags_unresolved
  ON catalog_review_flags (resolved, flagged_at DESC) WHERE resolved = false;
```

### 4. Next.js 15 Params Fix ✅

Route handler params signature updated from `{ params: { id: string } }` to `{ params: Promise<{ id: string }> }` with `await params` before reading `.id`. Required for Next.js 15 App Router — breaks type check otherwise.

### 5. Auth Debug ✅

Traced persistent 401 to token not being forwarded in the fetch call. Fixed by reading `window.location.search` for `?token=` and caching it in `sessionStorage('stinkin_admin_token')` — survives client-side navigation so the token only needs to be in the URL once per browser session.

## DB State After This Session

No changes to catalog data. `catalog_review_flags` table auto-created on first use (empty until flags are submitted).

## What Needs to Happen Next

| # | Task | Priority |
|---|------|----------|
| 1 | Remove console.log from isAuthorized() in route.ts | HIGH — before deploying to prod |
| 2 | Add ADMIN_SECRET to Vercel: `npx vercel env add ADMIN_SECRET` | HIGH — prod edit won't work without it |
| 3 | Drop Tanker + Bespoke fonts from Fontshare | HIGH — /models broken without them |
| 4 | Import vtwin_fitment.csv (scraper 100% complete) | HIGH |
| 5 | Add 26 missing model codes | MEDIUM |
| 6 | Verify null slug on /browse | MEDIUM |
| 7 | Verify OEM search returns 3 results for 24009-06 | MEDIUM |

---

# ——— THIRTY-SEVENTH PASS (June 3, 2026) ———

Session: Thirty-Seventh Pass · June 3, 2026

## WHERE WE ARE

Two things: (1) major /models page rebuild using FlowingMenu + materialized view fixing a 9s query, and (2) VTwin scraper completed. No fitment or catalog data changes. No reindex needed beyond what was already current.

## What Was Done This Session

### 1. mv_family_product_ranges Materialized View ✅

Created to fix a 9.5s query on `/models/[family]/parts`. Pre-aggregates per-family product year ranges from the full `catalog_fitment_v2` join. 81,332 rows. Performance: 496ms cold start, 83ms cached.

```sql
CREATE INDEX ON mv_family_product_ranges (family_name);
CREATE INDEX ON mv_family_product_ranges (family_name, display_category, display_subcategory);
```

Auto-refreshes at end of `index_unified.js --recreate`. Run manually after fitment imports that don't trigger a full reindex:
```bash
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_family_product_ranges;
```

### 2. /models Page — FlowingMenu ✅

`app/models/page.jsx` rebuilt using FlowingMenu component. Zero API calls. Static family definitions only. Families: touring · softail · dyna · sportster · fxr · shovelhead · vintage · trike · v-rod · all-makes.

"All Makes" (was "Street") routes to `/browse?universal=true` — not `/models/street`. Slug is still `street` in FAMILIES array.

Bike images at `public/images/models/{slug}.jpg` — 400x160px recommended. `touring.jpg` complete. 9 remaining images still needed.

### 3. Font System ✅

Two new CSS variables added in `layout.tsx`:
- `--font-tanker` → `public/fonts/Tanker-Regular.ttf` (Fontshare) — FlowingMenu + marquee
- `--font-bespoke` → `public/fonts/BespokeSerif-Regular.ttf` (Fontshare) — page headers + category headings

⚠️ Files not in git. Must be downloaded from Fontshare and dropped manually.

### 4. Parts Route Rewrite ✅

`app/api/models/[family]/parts/route.ts` rewritten to query `mv_family_product_ranges` instead of raw joins across 4.9M fitment rows. Era resolution moved to JS using 15 cached `hd_engine_types` rows.

### 5. ModelCatalogClient Cleanup ✅

Removed broken `@font-face /New_Sailor.ttf` (404 on every load). FONT_DISPLAY → `var(--font-stencil)`. Headings → `var(--font-bespoke)`. `/api/models/summary` route deleted (7s query, replaced with static sub labels).

### 6. VTwin Scraper Finished ✅

37,980 rows scraped, 100% complete. 34,952 fitment hits, 10,057 OEM (26.5% hit rate), 0 errors. CSV at `./scripts/ingest/vtwin_fitment.csv` — ready to import with `--skip-existing`.

## Gotchas Discovered This Session

| Issue | Solution |
|-------|----------|
| FlowingMenu hydration mismatch | Seeded random `sr()` function — never use `Math.random()` in row config |
| FlowingMenu GSAP scrollWidth | 120ms setTimeout before measuring — images need time to affect layout. Do not reduce. |
| "All Makes" slug | Still `street` in FAMILIES array — routes to browse, not /models/street |
| mat view refresh | Must run after any fitment import. Auto in index_unified.js, manual otherwise. |

## DB State After This Session

No catalog or fitment changes. `mv_family_product_ranges` created (81,332 rows).

---

# ——— THIRTY-SIXTH PASS (June 2, 2026) — SESSION 2 ———

Session: Thirty-Sixth Pass · June 2, 2026 (Second session)

## WHERE WE ARE

No schema changes. No frontend changes (except Typesense query_by fix). Pure fitment data pass: bridged oem_fitment table to catalog_fitment_v2, extracted fitment from product name strings. Fitment coverage jumped from 30.9% to 40.5% overall — PU nearly hit 50%.

## What Was Done This Session

### 1. OEM Catalog Bridge — oem_fitment → catalog_fitment_v2 ✅

The `oem_fitment` table (379,899 rows from real HD OEM parts catalog PDFs — Sportster, Touring, Softail, Dyna, FX) was never bridged to `catalog_fitment_v2`. Built 3-pass bridge:
1. Exact `model_code` + year range → `harley_models` → `harley_model_years`
2. `fits_all_models` rows → all model_years in year range
3. Catalog filename implies family (touring.pdf → Touring, softail → Softail, etc.) → family model_years filtered by year

Run for both `oem_fitment.matched_product_id` products AND direct `oem_part_number` match (VTwin) and `oem_numbers[]` match (PU/WPS). New sources: `oem_catalog` (0.90–0.95), `oem_catalog_universal` (0.75), `oem_catalog_family` (0.80).

### 2. Fitment Extracted from Product Names ✅

New script: `scripts/ingest/extract_fitment_from_names.mjs`. Parses product names for three signal tiers: (Tier 1, conf 0.85) model code + year range; (Tier 2, conf 0.80) family keyword + year; (Tier 3, conf 0.65) family keyword only. Apostrophe year: `'YY < 30 → 20YY else 19YY`. Pipe-separated segments each parsed independently. Inserted 1,552,960 fitment rows for 5,795 products. `fitment_source = 'name_extraction'`.

### 3. Typesense oem_numbers Fix ✅

`oem_numbers[]` was in Typesense schema but missing from `query_by`. Searching `24009-06` only returned 1 of 3 products. Fixed: added `oem_numbers` with weight 5 to `query_by` in `lib/typesense/client.ts`.

## DB State After This Session

`catalog_fitment_v2`: ~4,920,000 rows (was ~2,930,000). PU: 49.2%. VTwin: 34.3%. WPS: 40.8%. Overall: 40.5%.

---

# ——— THIRTY-FIFTH PASS (June 2, 2026) — SESSION 1 ———

Session: Thirty-Fifth Pass · June 2, 2026 (First session)

## WHERE WE ARE

Massive fitment data expansion. No schema changes. No frontend changes. Pure data quality: VTwin slug fixes, image backfill, OEM extraction from names, fitment from crossref, PU staging promoted.

## What Was Done This Session

### 1. VTwin Null Slug Fix ✅
31,078 `catalog_products` rows had null slugs. Root cause: `catalog_products` SKUs are raw (e.g. `33-2141`) while `catalog_unified` has `VT-` prefix (`VT-33-2141`) — join required `'VT-' || cp.sku = cu.sku`.

### 2. VTwin Image Backfill ✅
20,167 VTwin products missing images. Built `vtwin_image_backfill.py` — HEAD checks with 20 concurrent workers. 10,302 images found. 9,865 genuinely have no image.

### 3. OEM Numbers Extracted from Product Names ✅
~1,217 new OEM numbers extracted from `catalog_unified.name` using 4 progressive regex passes. Year ranges (1984-1999 etc.) correctly excluded.

### 4. Fitment Copied from OEM Crossref ✅
Products with zero fitment inherit fitment from OEM crossref matches. +5,434 products gained fitment, +~450K rows. VTwin 15.4→25.9%, PU 33.5→35.6%, WPS 35.5→36.1%.

### 5. harley_model_years Additions ✅
Added: FLH 1978-1982, FLHS 1980-1982, FLSTC 2015-2017, FXBR 2018-2019, FXBRS 2018-2020, FXLR 1988-1989.
Deleted bad rows: FLHX 1984 (Street Glide didn't exist), FLTRX 2024-2025 + FLTRXSE 2023-2025 (discontinued ~2013).

### 6. VTwin OEM Numbers Backfilled ✅
13,449 VTwin products had `oem_part_number` populated but `oem_numbers[]` empty. Fixed with UPDATE SET `oem_numbers = ARRAY[oem_part_number]`.

## DB State After This Session

| Table | Rows | Notes |
|-------|------|-------|
| catalog_unified (active) | 103,264 | 51,024 VTwin / 36,396 PU / 15,844 WPS |
| catalog_fitment_v2 | ~2,930,000+ | +~450,000 rows this session |
| catalog_oem_crossref | ~65,000+ | +10,265 VTwin OEM rows |
| harley_model_years | ~1,889 | +29 added, 6 deleted |
| Typesense | 103,264 docs | Reindexed twice |

