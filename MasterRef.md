# Stinkin' Supplies — Master Reference
**Last Updated:** June 27, 2026 (Sixty-First Pass)
**Database:** Hetzner Postgres — stinkin_catalog @ 5.161.100.176:5432

**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Homepage rebuilt ✅ | Font system locked ✅ | ModelFinder built ✅ | FilterSidebar updated ✅ | VariantSelector fitment+color mode ✅ | Variant groups merged ✅ | browse.ts name-grouping ✅ | VTwin SKU dupes resolved ✅ | Filtering system audit complete ✅ | MODEL_ALIASES expanded ✅ | VTwin scraper round 2+3 complete ✅ | CategoryBentoGrid built ✅ | display_subcategory taxonomy COMPLETE ✅ | Canonical merges DRAINED ✅ | PU vendor_sku fully corrected ✅ | product_details JSONB live ✅ | Multi-image galleries live ✅ | OEM supersession table live ✅ | VTwin fitment 55.8% ✅ | HD model reference audited (2026 catalog) ✅ | OEM crossref expanded ✅ | VTwin attributes bug fixed ✅ | EBC brake fitment ingested ✅ | HD battery fitment ingested ✅ | bike_specs table populated ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (active) | **89,153** | ✅ PU 34,994 / VTwin 38,315 / WPS 15,844 |
| catalog_fitment_v2 | ~3.9M+ rows | ✅ +86,833 VTwin (session 58) + 3,005 EBC (session 60) |
| catalog_oem_crossref | **65,434 rows** | ✅ +5,511 vtwin_scrape + 63 HD_OEM battery (session 60) |
| catalog_variant_groups | 7,556+ (+ 148 MULTI pack-size groups) | ✅ |
| catalog_variant_members | ~29,031+ | ✅ |
| catalog_media | ~35,990 rows | ✅ PU multi-image from 133 brand XML files |
| product_details | ~59,253 rows (~66.5% coverage) | ✅ VTwin attributes fixed session 60 |
| canonical_products | 89,153 rows — all merges drained | ✅ 2,407 applied, 1,772 rejected |
| catalog_variant_candidates | 62 pending human review | ⏳ |
| oem_supersession | **485 pairs** (283 original inferred + 202 vtwin hardware) | ⏳ 283 original pairs confidence=1 pending review |
| mv_oem_fitment_coverage | 683K rows | ✅ Refreshed session 59 |
| vtwin_scrape_data | ~31,000+ rows | ✅ +12,398 from scrape_vtwin_missing.mjs |
| harley_model_years | **~2,090 rows** | ✅ +28 gap rows added session 61 (XL883L 2005-09, FXST 2020, FXLR gaps, FLTRXS 2024-25, RA1250 2025, VRSCB 2006, FLH 1966-71/73-77) |
| harley_models | **~365 rows** | ✅ 6 new 2026 codes added (FLHXL, FLHXLSE, FLHXSTSE, FLHLT, FLHLTSE, RA1250L); 1 orphan removed |
| ebc_brake_fitment | **528 rows** | ✅ NEW session 60 — EBC 2026 catalog, 14 H-D families |
| hd_battery_fitment | **22 rows** | ✅ NEW session 60 — 7 OEM battery SKUs, model/year fitment |
| bike_specs | **1,288 rows** | ✅ NEW session 61 — DS FatBook 2026 + DS OldBook 2026; battery/plugs/belt/sprockets/tires/shock per model+year |
| Typesense | **89,153 docs** | ✅ Reindexed session 60 |

### Fitment Coverage (June 26, 2026 — Session 60)

| Vendor | Total Active | With Fitment | Coverage | Change |
|--------|-------------|--------------|----------|--------|
| PU | 34,994 | ~17,200 | ~49% | — ceiling reached (no new feed) |
| VTwin | 38,315 | **21,390** | **55.8%** | — session 58 |
| WPS | 15,844 | ~6,463 | ~41% | — correct as-is (non-HD products confirmed) |
| EBC (via PU/WPS/VTwin) | 554 matched | ~491 with fitment | ~89% | ✅ NEW session 60 via ebc_catalog source |

**EBC fitment (session 60):** 528 fitment records from EBC 2026 catalog → 9,066 product+year pairs prepared → 3,005 net-new rows inserted (6,061 already covered by other sources). fitment_source='ebc_catalog'.

---

## DATABASE CONNECTION

```
Host:       5.161.100.126 (IPv4 — ALWAYS use this)
Port:       5432
Database:   stinkin_catalog
User:       catalog_app
Password:   smelly
SSH Alias:  ssh stinkdb
psql:       psql "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog"
Vercel env: CATALOG_DATABASE_URL
```

⚠️ NEVER use IPv6 2a01:4ff:f0:fa6f::1 in Vercel code — Vercel cannot resolve it.
⚠️ catalog_app is NOT superuser — use `\copy` not `COPY TO file` in psql.
⚠️ catalog_oem_crossref joins on `sku` column, NOT product_id.
⚠️ getCatalogDb() returns a shared pool — never call .end() in API routes.
⚠️ Postgres word boundary: use `(\s|$)` not `\b` in regex patterns.
⚠️ catalog_fitment_v2 must NEVER be truncated — always use DELETE WHERE or ON CONFLICT.
⚠️ catalog_fitment_v2 has NO confidence column — do not include in INSERT statements.

---

## FONT SYSTEM

| CSS Variable | Font | Use |
|---|---|---|
| `--font-tanker` | Tanker Regular (`public/fonts/Tanker-Regular.ttf`) | Primary display — era names, headings, kinetic text, CTAs |
| `--font-bespoke` | Bespoke Serif Variable (`public/fonts/BespokeSerif-Variable.ttf`) | Editorial/secondary — section headers, prices, tab labels |
| `--font-stencil` | Share Tech Mono | UI labels, mono badges, SKUs, year ranges |
| `--font-sailor` | → alias for --font-tanker | Legacy compat |
| `--font-caesar` | → alias for --font-bespoke | Legacy compat |

Bebas Neue — removed. No longer used.

---

## COLOR PALETTE

| Token | Value | Use |
|---|---|---|
| Gold | `#C9A84C` | Primary accent — CTAs, borders, highlights |
| Cream | `#F2EAD3` / `#f5f0e8` | Page backgrounds |
| Deep dark | `#1A1208` / `#170f04` | Text, dark backgrounds |
| Admin cream | `#f5f0e8` bg / `#fffdf8` cards | Admin pages (session 48 restyling) |

---

## KEY TABLE SUMMARY

### catalog_unified
Single source of truth. 89,153 active rows.
- `source_vendor` always uppercase: `PU`, `WPS`, `VTWIN`
- Internal SKU format: `CAT######.p` / `.w` / `.v`
- `vendor_sku` = PU's actual catalog number (sku column) = WPS ordering # = VTwin bare SKU
- `brand_part_number` = manufacturer's cross-reference (JGI, Cometic, Feuling, etc.) for PU; same as vendor_sku for WPS/VTwin
- `pack_qty` INTEGER DEFAULT 1 — units per listing; 2,171 rows > 1
- `is_kit` BOOLEAN DEFAULT false — kits excluded from OEM matching
- `product_details` JSONB — description, features, attributes (GIN index)
- `display_category` / `display_subcategory` — taxonomy for browse + Typesense facets
- Era booleans: `era_flathead` through `era_chopper`
- `canonical_product_id` FK → canonical_products.id

### catalog_fitment_v2
~3.9M+ rows. Never truncate.
- FK: `product_id → catalog_unified.id`, `model_year_id → harley_model_years.id`
- Sources: JW Boon NOS, PU parsed, WPS API, VTwin scraper (rounds 1+2+3), EBC catalog
- `fitment_source` values: 'jw_boon', 'pu_parsed', 'wps', 'vtwin_scrape', 'vtwin_fitment_raw', 'canonical_merge_sync', 'ebc_catalog', 'manual'
- ⚠️ NO `confidence` column — do not include in INSERT statements
- Composite indexes: idx_cfv2_product_modelyear + idx_cfv2_modelyear_product

### catalog_oem_crossref
**65,434 rows.** Canonical OEM ↔ product bridge.
- Join on `sku` column (matches catalog_unified.sku)
- Sources: oldbook_crossref, fatbook_crossref, VTWIN_SCRAPE, PU_PIES, vtwin_scrape_r2, wps, vtwin_scrape (session 60), HD_OEM (session 60 — battery OEM numbers)
- `expanded_from` BOOL — denormalized variants (filter: expanded_from=FALSE for canonical)
- `oem_format` generated column — valid filter: `oem_format IN ('hd_oem','hd_oem_nodash')`

### oem_supersession
**485 pairs** total. 283 original inferred pairs (confidence=1, pending review) + 202 vtwin hardware pairs (session 59, source='vtwin').
- `normalize_oem()` function strips dashes/spaces/uppercases
- `from_oem_norm` / `to_oem_norm` are **GENERATED columns** — do NOT include in INSERT. They auto-compute. INSERT only: `from_oem, to_oem, source, confidence, notes`
- `source` CHECK constraint: must be one of `'fatbook'|'oldbook'|'vtwin'|'wps'|'inferred'|'manual'`
- UNIQUE constraint on `(from_oem_norm, to_oem_norm)`
- `mv_oem_fitment_coverage` materialized view (683K rows) — recursive forward+backward chain
- Refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage`

### ebc_brake_fitment ← NEW session 60
**528 rows.** EBC 2026 H-D brake pad fitment staging table.
- Source: EBC_HARLEY_406_2026_WEB.pdf (Issue 406)
- Columns: `position` (FRONT/REAR), `hd_family`, `model`, `year_from`, `year_to`, `fa_pn`, `v_pn`, `hh_pn`, `epfa_pn`, `rotor_design`, `bolt_kit`, `requires_two_sets`, `source`
- 14 H-D families: Electric, X Series, Adventure Touring, Street, Sportster, S Series, RH Series, Dyna, Softail, Touring, Grand American Touring, Trike, CVO, V-Rod
- Cross-referenced into catalog_fitment_v2 via import_ebc_fitment.mjs (3,005 net-new rows, fitment_source='ebc_catalog')
- Parser: scripts/ingest/parse_ebc.py — reusable for future EBC catalog editions

### hd_battery_fitment ← NEW session 60
**22 rows.** H-D OEM AGM battery fitment staging table.
- Source: H-D OEM Battery Reference 2026
- 7 OEM battery SKUs: 65989-97E, 65958-04C, 66010-97E, 65948-00C, 65991-82B, 66010-82B, 65989-90B
- Columns: `pn_us`, `pn_intl`, `pn_emea`, `pn_chn`, `hd_family`, `model_desc`, `year_from`, `year_to`, `notes`
- BCI group bridge: import_battery_oem_crossref.mjs matched 64 battery products → 63 HD_OEM entries in catalog_oem_crossref
- 65989-90B (YB16CL-B, Dyna/Softail '91-'96) — no matching products in catalog; discontinued at distributor level

### bike_specs ← NEW session 61
**1,288 rows.** DS FatBook 2026 + DS OldBook 2026 quick-reference spec data per model+year.
- FK: `model_year_id → harley_model_years.id`
- `source` values: `'DS_FATBOOK_2026'` (1986–2025) or `'DS_OLDBOOK_2026'` (1936–1999)
- Columns: battery, spark_plug_ngk, spark_plug_champ, belt_pitch, belt_teeth (also used for chain link count), sprocket_front, sprocket_rear, tire_front, tire_rear, shock_length_in
- Chain drives: belt_pitch='530' (chain size), belt_teeth=link count
- UNIQUE(model_year_id, source) — idempotent re-run safe
- Script: `scripts/ingest/import_bike_specs.mjs`

### canonical_products / product_vendors
- canonical_products: 89,153 rows, one per active catalog_unified product
- product_vendors: 89,153 rows — `vendor_sku` = correct ordering number for all vendors
- All 2,407 confirmed merges applied and drained
- `match_confidence`: 'single' (1:1 unmerged) or 'oem_match' (confirmed merge)

### catalog_variant_groups / catalog_variant_members
- 7,556+ regular groups + 148 MULTI pack-size cross-vendor groups
- `group_id` (not variant_group_id) as FK column in catalog_variant_members
- `source_vendor='MULTI'` for pack-size groups, `option_1_name='Pack Size'`

### vtwin_scrape_data
~31,000+ rows (was ~19,000 before session 58).
- `fitment_raw` — pipe-separated MODEL_CODE YEAR-YEAR or YEAR-UP segments
- `oem_no` — OEM number; imported into catalog_oem_crossref (source='vtwin_scrape', session 60)
- Upsert-safe: `ON CONFLICT (sku) DO UPDATE`

---

## VENDOR SKU RULES (CRITICAL)

| Vendor | Correct source for vendor_sku | Notes |
|--------|-------------------------------|-------|
| **PU** | `catalog_unified.sku` | DS######, 8-digit numeric OldBook/FatBook, or other PU formats. `brand_part_number` = manufacturer's cross-ref ONLY. Migrations 007+010 fixed 28,428 rows. |
| **WPS** | `catalog_unified.vendor_sku` (matches sku) | 100% populated, correct as-is from WPS feed |
| **VTwin** | `catalog_unified.sku` with VT- prefix stripped | bare form e.g. "12-0903" from "VT-12-0903" |

⚠️ `catalog_unified.vendor_sku` now equals `catalog_unified.sku` for ALL active PU rows after migration 010. `brand_part_number` is manufacturer cross-reference only.

---

## SCRIPTS INVENTORY (KEY)

| Script | Purpose |
|--------|---------|
| `scripts/ingest/build_canonical_products.mjs` | Phase A (1:1 init) + Phase B (OEM cross-vendor matching) |
| `scripts/ingest/build_variant_groups.cjs` | Name-based variant grouping for PU/VTwin/WPS |
| `scripts/ingest/build_pack_size_groups.mjs` | Cross-vendor pack-size variant groups (MULTI) |
| `scripts/ingest/scan_pack_qty_from_names.mjs` | Auto-detects pack qty from product names |
| `scripts/ingest/build_product_details.mjs` | Normalizes product details into JSONB column. VTwin now JS-based (session 60) — handles stringified attributes + extra_attributes fallback |
| `scripts/ingest/extract_pu_images.mjs` | Parses 133 PU brand XML files → catalog_media + descriptions + OEM entries |
| `scripts/ingest/parse_vtwin_fitment_raw.mjs` | Re-parses fitment_raw from vtwin_scrape_data → catalog_fitment_v2 |
| `scripts/ingest/scrape_vtwin_missing.mjs` | GraphQL url_key discovery + HTML FITS scrape for never-scraped VTwin SKUs |
| `scripts/ingest/infer_vtwin_categories.mjs` | Maps VTwin source categories → display_category; 566 products |
| `scripts/ingest/generate_vtwin_skus.js` | Allocates internal_sku from sku_counter table for VTwin products |
| `scripts/ingest/import_vtwin_oem_crossref.mjs` | Imports vtwin_scrape_data.oem_no → catalog_oem_crossref (session 60, 5,511 rows) |
| `scripts/ingest/parse_ebc.py` | Parses EBC catalog PDF → ebc_brake_fitment staging table. Reusable for future editions. |
| `scripts/ingest/import_ebc_fitment.mjs` | Cross-references ebc_brake_fitment → catalog_unified → catalog_fitment_v2 |
| `scripts/ingest/import_bike_specs.mjs` | DS FatBook 2026 + OldBook 2026 → bike_specs. 296 raw rows, 47-entry expansion map, century-aware year logic, --dry-run flag. 1288 rows inserted. |
| `scripts/ingest/import_hd_battery_fitment.mjs` | Creates hd_battery_fitment table and inserts 7 OEM battery SKUs × 22 fitment rows |
| `scripts/ingest/import_battery_oem_crossref.mjs` | Bridges battery products to H-D OEM numbers via BCI group → catalog_oem_crossref |
| `scripts/ingest/index_unified.js` | Typesense reindex — uses product_details as primary source |

---

## HOMEPAGE LAYOUT

Section order (app/page.jsx):
1. SmokeBackground (canvas, lazy loaded)
2. VideoHero — R2 CDN video
3. ModelFinder — era → model → /browse (year slider removed session 46)
4. ScrollVelocity band
5. CategoryBentoGrid (19 categories — excludes Riding Gear & Tools)
6. BrandRolodex

---

## ADMIN PAGES

| Page | URL | Notes |
|------|-----|-------|
| Product Manager | /admin/products | Grid, inline edit, pack_qty column, EditModal |
| Product Detail | /admin/products/[id] | Cream/gold/black theme, full edit form |
| Canonical Matches | /admin/canonical-matches?token=... | OEM match review — confirm/reject/flag/edit/manual-match |
| Variant Candidates | /admin/variant-candidates?token=... | 62 groups pending variant_group_id building |
| Database Snapshot | /admin/database | Stats |
| Fitment & OEM | /admin/fitment | Fitment management |

Auth: `?token=` URL param or `X-Admin-Token` header matching `ADMIN_SECRET` env var.
⚠️ ADMIN_SECRET not yet added to Vercel production — add with `npx vercel env add ADMIN_SECRET`.

---

## PDP ARCHITECTURE

`app/browse/[slug]/page.jsx` — server component.
- `getProduct()` SQL: catalog_unified + canonical_products + catalog_fitment_v2 + catalog_media (lateral, all_urls array) + product_details
- Image resolution: `CASE WHEN array_length(cu.image_urls,1) > 0 THEN cu.image_urls ELSE cm.all_urls END` — VTwin reads image_urls column; PU reads catalog_media
- Image proxy: `app/api/image-proxy/route.ts` — fflate-based, Referer-spoofing for LeMans zips, 1-year edge cache
- `ProductImageGallery.jsx` — client component, thumbnail strip for multi-image products
- Layout: ProductDetailsSection → DataTabs (Fitment + OEM)
- OemAlternativesPanel: removed session 57
- `PDPTabs.jsx` — DetailsContent reads `product_details.attributes` directly as object (JSON.parse workaround removed session 60)

---

## KNOWN BUGS / WORKAROUNDS ACTIVE

| Bug | Workaround | Real fix |
|-----|------------|---------|
| scrape_vtwin_missing.mjs pg deprecation warning | Not failing — concurrent queries on single client instead of pool | Use `pool.query()` in worker |
| oem_supersession 283 original confidence=1 rows | Not yet promoted or rejected | Manual review via `SELECT * FROM oem_supersession_review LIMIT 30` |

*Note: VTwin extra_attributes stringified JSON bug (was #22 on chase list) — FIXED session 60 at source in build_product_details.mjs. Workaround in PDPTabs.jsx also removed.*

---

*Master Reference — Last updated June 27, 2026 · Session 61*
