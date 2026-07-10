# Stinkin' Supplies — Master Reference
**Last Updated:** July 10, 2026 (Seventy-Eighth Pass)
**Database:** Hetzner Postgres — stinkin_catalog @ 5.161.100.126:5432

**Status:** Catalog rebuilt ✅ | Fitment rebuilt ✅ | Search indexed ✅ | Homepage rebuilt ✅ | Font system locked ✅ | ModelFinder built ✅ | FilterSidebar updated ✅ | VariantSelector fitment+color mode ✅ | Variant groups merged ✅ | browse.ts name-grouping ✅ | VTwin SKU dupes resolved ✅ | Filtering system audit complete ✅ | MODEL_ALIASES expanded ✅ | VTwin scraper round 2+3 complete ✅ | CategoryBentoGrid built ✅ | display_subcategory taxonomy COMPLETE ✅ | Canonical merges DRAINED ✅ | PU vendor_sku fully corrected ✅ | product_details JSONB live ✅ | Multi-image galleries live ✅ | OEM supersession table live ✅ | VTwin fitment 55.8% ✅ | HD model reference audited (2026 catalog) ✅ | OEM crossref expanded ✅ | VTwin attributes bug fixed ✅ | EBC brake fitment ingested ✅ | HD battery fitment ingested ✅ | bike_specs table populated ✅ | HD OEM catalog fitment rebuilt (all families, 121 catalogs) ✅ | OEM fitment consolidation pipeline live ✅ | OEM crossref admin page ✅ | Eastern Motorcycle Parts crossref imported (4,832 rows) ✅ | Path C oem_numbers[] bug fixed ✅ | **OEM fitment data quality fixed (session 65): noise rows eliminated, universal promotion family-scoped** ✅ | OEM fitment promoted → catalog_fitment_v2 (5,126,957 rows) ✅ | Parts timeline admin page live ✅ | Typesense reindexed 89,151 docs ✅ | **Canonical match queue re-drained (session 66): 2,807 applied / 1,375 rejected** ✅ | **OEM part timeline table + PDP feature live (session 67)** ✅ | **Typesense search properly wired for first time (session 67)** ✅ | **fitment_text field added to Typesense (session 67); reindexed 89,151 docs** ✅ | **harley_models dupes merged + era-bucket cleanup, is_vrod column added (session 68)** ✅ | **Eastern crossref finally linked to products (3,103 rows) + Colony/PU-XML brand-file fitment backfills (session 68)** ✅ | **catalog_unified flat fitment columns synced catalog-wide for the first time ever — 45,659 products (session 68)** ✅ | **Typesense reindexed 90,629 docs, 0 errors (session 68)** ✅ | **catalog_oem_crossref orphan recovery + harley_model_years impossible-year cleanup (session 72)** ✅ | **VariantSelector.jsx wired into PDP for the first time, fixing duplicate-pill display bug (session 73)** ✅ | **build_variant_groups.cjs classifier + connection bugs fixed, ADMIN group protection added after recovering from a data-loss incident (session 73)** ✅ | **display_category rebuild — 2,028 null-category gap closed (session 74)** ✅ | **display_subcategory_detail tier-3 layer built + wired end-to-end for 37 subcategories (session 74)** ✅ | **build_variant_groups.cjs — 6 more real bugs found and fixed (axis normalization, WPS umbrella IDs, symbol-value stripping, missing vocabulary, kit-heuristic false positives) + new Phase 3 SKU cross-referencing; total groups 2,907 → 6,605 (session 74)** ✅ | **Fitment tab shows model name + code (session 75)** ✅ | **Brand normalization applied live — 51 duplicate clusters → 0 (session 75)** ✅ | **PU/WPS display-fixture exclusion verified + applied live — 41 rows deactivated (session 75)** ✅ | **canonical_sku_seq drift bug fixed; Phase A/B rebuild — 2,043 new canonical products, 12,783 new match proposals (session 75)** ✅ | **build_variant_groups.cjs MULTI-group nuke bug found and fixed (session 75)** ✅ | **Typesense upsert-vs-delete gap found and closed for is_active flips (session 75)** ✅ | **Canonical match review queue automated 54% (12,783 → 4,468 pending) via 5 evidence-validated rules — exact part/name match, thickness, compound, OEM-family-not-duplicate categories — with 2 real bugs caught and fixed mid-pass (missing-part-number-treated-as-mismatch, stale applied status) (session 75)** ✅ | **browse.ts sort-order bug fixed — hardware no longer outranks real products under price-ascending default (session 76)** ✅ | **Seating category fully rebuilt — 256,143 fitment rows backfilled, 166 products' FL/FX fitment miscode corrected, 252 hardware/pad/backrest rows reclassified out of Seats (session 76)** ✅ | **Exhaust category fully rebuilt — 838 rows (269 subcategory + 569 detail), 21 cross-category miscategorizations flagged (session 76)** ✅ | **Nine taxonomy scripts shipped — Engine, Transmission, Electrical, Lighting, Handlebar & Controls rebuilt; Carburetion & Fuel applied; Gaskets & Seals + Cables created as NEW top-level categories; display_category now 23 values, 9 categories at zero nulls (session 77)** ✅ | **Brakes rebuilt — 797 rows (430 within-category + 2 orphan merge + 119 from Foot Controls + 246 from Accessories & Misc); new Brake Pedals & Pads subcategory (8 total, was 7); 96 rows deliberately held back rather than force-assigned after WPS's "Brake - front" raw category proved to mix brake/clutch/shifter parts (session 78)** ✅

---

## EXECUTIVE SUMMARY

| Metric | Value | Status |
|--------|-------|--------|
| catalog_unified (active) | **90,609** | ✅ Reindexed to Typesense 1:1 session 75 (down from 90,629 — 41 PU/WPS in-store display fixtures deactivated session 75, see Known Bugs) |
| **catalog_unified.display_category** | **0 NULL** (was 2,028) | ✅ Fixed session 74 — `rebuild_display_category_v2.mjs`; also fixed SADDLEBAGS/TANK structural bugs |
| **catalog_unified.display_subcategory_detail** | **36,350 of 76,491 eligible products** | ✅ NEW session 74 — tier-3 column, 37 subcategories, full Typesense/FilterSidebar/browse.ts wiring |
| **Seating & Exhaust category taxonomy** | Both fully rebuilt (session 76) | ✅ Seating: 252 hardware/pad/backrest rows reclassified out of "Seats" (5 iterative rounds — trusted-brand logic + directional adjacency fix), 256,143 fitment rows backfilled, 166 products' FL/FX fitment corrected. Exhaust: 838 rows (269 subcategory + 569 Detail). 66 total cross-category miscategorizations flagged across both (not yet manually moved) — see ROADMAP Open Issues |
| catalog_fitment_v2 | **5,257,539 rows** (+256,143 Seating name-extraction backfill, net of 166 products' FL/FX rows corrected — see session 76) | ✅ +108,786 net new session 68 (eastern/colony/pu-xml/gma sources); +256,143 session 76 (Seating), see HANDOFF_LOG "SEVENTY-SIXTH PASS" §1–2 for the FL/FX correction detail |
| **catalog_unified flat fitment columns** | **45,659 products synced** | ✅ NEW session 68 — was 0% populated catalog-wide (0/97,277) until `sync_fitment_flat_columns.mjs`; now `is_harley_fitment`/`fitment_year_start`/`fitment_hd_families`/etc. actually reflect catalog_fitment_v2 |
| oem_fitment | **315,427 rows** | ✅ All families — 121 catalogs, 37.9% matched. `catalog_family` column added. 130K noise rows eliminated. |
| catalog_oem_crossref | **76,937 rows** | ✅ Session 72 — 17,150 orphaned rows found (product_id NULL), 15,192 relinked; 87 junk rows deleted; 6,695 new rows backfilled from oem_numbers[] flat-array data. Eastern's 1,641 remaining unmatched accepted as gap. |
| vtwin_oem_crossref | **12,278 rows** | ✅ 9,006 match catalog_unified via VT- prefix (discovered session 62) |
| **oem_part_timeline** | **32,570 rows** | ✅ session 67 — 7,981 base families; UNIQUE(oem_number, product_id) |
| **oem_part_timeline_sellable** | **19,824 rows** | ✅ session 67 — view: WHERE product_id IS NOT NULL |
| catalog_variant_groups | **6,654** (6,597 automated + 8 ADMIN-curated + 49 MULTI pack-size, split PU 3,117 / VTWIN 1,974 / WPS 1,506) | ✅ Full rebuild session 75 (idempotent vs. session 74 baseline — brand normalization did not measurably shift automated group counts). ⚠️ Rebuild's nuke step wiped all 148 pre-existing MULTI groups (bug — only protected ADMIN); only 49 reproducible via re-running `build_pack_size_groups.mjs --canonical --apply`; nuke step now fixed to protect MULTI too. See Known Bugs. |
| catalog_variant_members | **19,181** | ✅ |
| catalog_media | ~35,990 rows | ✅ PU multi-image from 133 brand XML files |
| product_details | ~59,253 rows (~66.5% coverage) | ✅ VTwin attributes fixed session 60 |
| canonical_products | **91,283 rows (84,161 active)** | ✅ Session 75 — Phase A created 2,043 new (0 unlinked remain); Phase B proposed 12,783 new cross-vendor matches. Review queue automated down to **4,468 pending** (from 12,783) via 5 evidence-based rules; 8,315 auto-resolved (confirmed+merged or rejected), each with a distinct `reviewed_by` audit tag — see Known Bugs / HANDOFF_LOG "SEVENTY-FIFTH PASS" §8 for full rule list and the two bugs caught mid-pass |
| catalog_variant_candidates | 62 pending human review | ⏳ |
| oem_supersession | **485 pairs** (283 original inferred + 202 vtwin hardware) | ⏳ 283 original pairs confidence=1 pending review; 2 flagged wrong (session 67) |
| mv_oem_fitment_coverage | — | ✅ Refreshed session 65 |
| vtwin_scrape_data | ~31,000+ rows | ✅ +12,398 from scrape_vtwin_missing.mjs |
| harley_model_years | **3,234 rows** | ✅ Session 72 — 56 rows across 14 model codes had fabricated years through 2030 (impossible); deleted along with 3,536 catalog_fitment_v2 rows (778 products affected). 3 true-duplicate Dyna models merged + 6 redundant generic era-bucket rows removed session 68 |
| harley_models | **347 rows** | ✅ Down from 356 session 68 — 3 duplicate Dyna rows (FXDX/FXDFSE/FXDSE) merged, 5 redundant era-bucket rows removed (era_* backfilled first), 1 redundant V-Rod bucket removed (is_vrod column backfilled first) |
| **catalog_unified.is_vrod** | **33 rows true** | ✅ NEW session 68 — plain boolean (not an era_* column); replaces the deleted generic `revolution` harley_models bucket |
| ebc_brake_fitment | **528 rows** | ✅ NEW session 60 — EBC 2026 catalog, 14 H-D families |
| hd_battery_fitment | **22 rows** | ✅ NEW session 60 — 7 OEM battery SKUs, model/year fitment |
| bike_specs | **1,288 rows** | ✅ NEW session 61 — DS FatBook 2026 + DS OldBook 2026; battery/plugs/belt/sprockets/tires/shock per model+year |
| Typesense | **90,609 docs** | ✅ Reindexed session 76 (0 errors) — count corrected from stale 90,629 figure (was never updated after session 75's 41-row display-fixture deactivation); confirmed matching Postgres active-row count both after Seating and after Exhaust rebuilds this session |

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
⚠️ catalog_fitment_v2 `confidence_score` column EXISTS — safe to include in INSERTs. (Older rows have NULL.)

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
**5,257,539 rows** (as of session 68). Never truncate.
- FK: `product_id → catalog_unified.id`, `model_year_id → harley_model_years.id`
- Sources (session 65 baseline): name_extraction (1,553K), jwboon (1,342K), wps (797K), copied_from_crossref (349K), vtwin_partial (210K), oem_catalog_hd_universal (166K), oem_catalog_hd (160K), oem_crossref_fatbook_universal (134K), oem_crossref_fatbook (110K), vtwin_fitment_raw (84K), oem_crossref_vtwin_universal (69K), oem_crossref_vtwin (68K), (none) (48K), canonical_merge_sync (35K), ebc_catalog (2.5K), pu_fitment_expanded (62), manual (43)
- **Session 68 additions:** `eastern_2022_catalog` (99,545 rows / 606 products), `colony_2026_catalog` (7,887 rows / 84 products), `pu_brand_xml_backfill` (1,148 rows / 42 products), `gma_pu_brand_export_manual` (1,206 rows / 3 products)
- `fitment_source` values include: 'name_extraction', 'jwboon', 'wps', 'vtwin_partial', 'vtwin_fitment_raw', 'copied_from_crossref', 'canonical_merge_sync', 'ebc_catalog', 'manual', 'oem_catalog_hd', 'oem_catalog_hd_universal', 'oem_catalog', 'oem_crossref_vtwin', 'oem_crossref_vtwin_universal', 'oem_crossref_fatbook', 'oem_crossref_fatbook_universal', 'oem_crossref', 'pu_fitment_expanded', 'eastern_2022_catalog', 'colony_2026_catalog', 'pu_brand_xml_backfill', 'gma_pu_brand_export_manual'
- `confidence_score` column EXISTS (some older rows have NULL) — safe to include in INSERTs
- Priority: manual (1.0) > oem_catalog_hd (0.95) > oem_crossref_vtwin (0.90) > oem_crossref_fatbook (0.88) > oem_catalog_hd_universal (0.85) > oem_crossref_vtwin_universal (0.80) > oem_crossref_fatbook_universal (0.78) > others (no score)
- Composite indexes: idx_cfv2_product_modelyear + idx_cfv2_modelyear_product
- ⚠️ Universal oem_* sources are now family-scoped (session 65) — Softail catalog {ALL} only expands to Softail models, not cross-family
- ⚠️ **This table is the source of truth, NOT `catalog_unified`'s flat fitment columns.** After any INSERT here, run `node scripts/ingest/sync_fitment_flat_columns.mjs` then reindex Typesense — those flat columns were 0% populated catalog-wide until session 68 and will silently drift out of sync again if this step is skipped.

### catalog_oem_crossref
**76,937 rows.** Canonical OEM ↔ product bridge.
- Join on `sku` column (matches catalog_unified.sku) — **except** `eastern_2022_catalog` rows, which join via `oem_number = ANY(catalog_unified.oem_numbers)` instead (Eastern's own catalog SKU scheme doesn't match `vendor_sku`)
- Sources: oldbook_crossref, fatbook_crossref, VTWIN_SCRAPE, PU_PIES, vtwin_scrape_r2, wps, vtwin_scrape (session 60), HD_OEM (session 60 — battery OEM numbers), eastern_2022_catalog (4,832 rows, session 64 — **finally linked to product_id session 68, 3,103 rows**), backfill_from_flat_array (session 72 — 6,695 rows recovered from catalog_unified.oem_numbers[] data that had never been recorded in crossref)
- `expanded_from` BOOL — denormalized variants (filter: expanded_from=FALSE for canonical)
- `oem_format` generated column — valid filter: `oem_format IN ('hd_oem','hd_oem_nodash')`
- ⚠️ **Can contain rows with `product_id IS NULL`** — session 72 found 17,150 such rows (~25% of the table at the time), completely unreachable by any UI. 15,192 relinked via priority-ordered matching (exact/normalized sku → VT- prefix → exact/normalized vendor_sku → oem_number-in-array). `eastern` source rows are the one persistent exception — only ~5% recoverable, numbering doesn't map to anything else available.
- ⚠️ Has contained junk `oem_number` values (single/double-char garbage — "5", "N", ".") reachable via the PDP OEM tab. Cleaned in session 72 (87 rows). Values with a "+N" suffix (e.g. "38607-87A +6") are legitimate manufacturer size/length specs, NOT junk — don't filter these out.

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
- canonical_products: 89,153 base rows (Phase A/B) + 22 new rows created session 70 (manual false-merge splits) = 89,175
- product_vendors: 89,153 rows — `vendor_sku` = correct ordering number for all vendors. **Schema confirmed session 70**: `catalog_unified_id` has a UNIQUE constraint (one row per actual item, NOT one row per canonical+vendor pair as previously assumed) — `(canonical_id, source_vendor)` also UNIQUE. FK `canonical_id → canonical_products.id` is `ON DELETE CASCADE`.
- `match_confidence`: 'single' (1:1 unmerged), 'oem' (confirmed OEM-based merge via apply/route.ts), or 'manual-split' (session 70 — canonical entries created by splitting a false-merge group)
- `match_reason` on `canonical_match_proposals`: 'oem' (Phase B automated) or 'brand_part_number' (admin manual-select historically; automated generator added session 70 — see HANDOFF_LOG "SEVENTIETH PASS")
- Join to catalog_unified: `catalog_unified.canonical_product_id → canonical_products.id` (direct FK, confirmed session 69). 88,585 of 90,629 active products (97.7%) have a match; 2,044 don't and can't go through checkout until matched.
- `canonical_products.canonical_sku` is what checkout (`prepare`/`create-intent`/`orders/create`) keys off of — NOT `catalog_unified.id` or `catalog_unified.sku`. Cart items didn't carry this until session 69's fix (see Known Bugs).
- ⚠️ **`canonical_products.canonical_sku` and `.display_name` are BOTH `NOT NULL` with no default** (confirmed via `\d canonical_products`, session 70). When inserting a new canonical row manually/programmatically: reserve the id first via `pg_get_serial_sequence('canonical_products','id')` + `nextval()` so `canonical_sku` can be computed and supplied in the same INSERT — insert-then-update fails on the NOT NULL constraint. Observed sku convention across all existing rows: `canonical_sku = 'CP-' + zero-padded(id+1, 6)` — inferred from data, not from a trigger definition, but held for every row checked.
- ⚠️ **`product_vendors.canonical_id` does not auto-follow `catalog_unified.canonical_product_id`** — they're two separate columns with no trigger/constraint keeping them in sync. Any script that repoints `catalog_unified.canonical_product_id` (e.g. a manual canonical split) must also update `product_vendors.canonical_id` for the same `catalog_unified_id`, or vendor/pricing lookups will resolve to the wrong canonical entry. `scripts/ingest/fix_product_vendors_drift.mjs` (session 70) is a general reconciliation — safe to re-run any time as a consistency check.

### canonical_match_proposals
- Columns include: `id`, `product_id_a`/`product_id_b` (FK → catalog_unified.id), `status` ('pending'/'confirmed'/'applied'/'rejected'), `match_reason`, `reviewed_by`, `reviewed_at`, `created_at`
- `apply/route.ts` (`app/api/admin/canonical-matches/apply/route.ts`) only acts on `status='confirmed'` rows — picks `min(canonical_product_id)` as keeper, moves/dedupes `product_vendors`, repoints `catalog_unified`, deactivates the loser, marks proposal `applied`. Also auto-marks proposals `applied` if both sides already share a canonical id, and auto-rejects proposals where either side has a null/inactive `canonical_product_id`. Confirmed safe to re-run repeatedly (session 70 — ran clean against a 4,759-row batch, 0 errors).

### customer_points ← NEW session 69
- `user_id TEXT PRIMARY KEY` (Supabase auth uuid, no cross-DB FK — just a stored reference), `points_balance INTEGER`, `updated_at`
- Rules: 1 pt/$1 order subtotal, +500 bonus on first `orders.payment_status='paid'` row, redeem at $0.01/pt
- `orders` gained `user_id`, `points_earned`, `points_redeemed`, `points_redeemed_value` columns same session
- Migration written (`migrate_add_points.sql`) — **not yet run** as of session 69
- Replaces the old Supabase `user_profiles.points_balance` column, which is now stale/unused

### catalog_variant_groups / catalog_variant_members
- **6,597 automated groups** (3,117 PU + 1,974 VTWIN + 1,506 WPS) + 8 `ADMIN`-curated groups + 49 `MULTI` pack-size cross-vendor groups = 6,654 total — full rebuild session 75, essentially unchanged automated count vs. session 74 baseline (brand normalization didn't shift grouping — classifier keys on name-similarity/`wps_product_id`/SKU adjacency, not brand string equality)
- `group_id` (not variant_group_id) as FK column in catalog_variant_members
- `source_vendor='MULTI'` for pack-size groups, `option_1_name='Pack Size'` — built by the separate `build_pack_size_groups.mjs`, NOT `build_variant_groups.cjs`
- `source_vendor='ADMIN'` = human-curated, **excluded from every nuke/rebuild step** in `build_variant_groups.cjs` as of session 73 (a prior unfiltered `DELETE` wiped 6 of these — recovered from backup, see Known Bugs)
- ⚠️ **`build_variant_groups.cjs` does a full nuke-and-rebuild on every live run — not incremental.** Always run it backgrounded with no timeout (session 74: a foreground run with the tool's 2-minute default timeout got killed mid-rebuild, leaving the DB in a transient degraded state until re-run to completion; self-recovered, no data lost, but flagging the operational lesson)
- **PATCHED session 75:** nuke step's `source_vendor != 'ADMIN'` exclusion was too narrow — didn't protect `MULTI` groups either, so a session-75 live run silently wiped all 148 pre-existing MULTI groups. Only 49 were reproducible via re-running `build_pack_size_groups.mjs --canonical --apply` afterward (~99 gap not investigated further — likely normal drift in the underlying candidate data). Nuke step now excludes `source_vendor IN ('ADMIN', 'MULTI')`; Phase 1/2 candidate queries needed no matching change since they already filter on `variant_group_id IS NULL`, which now correctly stays non-null for MULTI-claimed products.
- New **Phase 3** (session 74): cross-references `brand_part_number` suffix adjacency (e.g. base `602-2001` + `602-2001B`) to connect variant siblings Phase 1/2's name-bucketing can't, gated by the same `classifyGroup()` safety checks as every other phase — operates across all 3 vendors (not just PU/VTWIN despite the phase name), 401 groups delivered in the session-75 rebuild

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
| `scripts/ingest/build_canonical_products.mjs` | Phase A (1:1 init) + Phase B (OEM cross-vendor matching). **Session 75:** hit a `canonical_sku_seq` drift bug on first live run since — fixed via `setval` (see Known Bugs), not a code change to this script |
| `scripts/ingest/build_variant_groups.cjs` | Name-based variant grouping for PU/VTwin/WPS. **PATCHED session 73**: fixed DB connection (was hardcoded broken IPv6 host + nonexistent env var, no dotenv — now uses `CATALOG_DATABASE_URL` via root-relative dotenv); Color regex now catches `pink`/`burgundy`/`bright`/`dark` modifiers, Apparel Size regex now catches `MD`; nuke step + Phase 1 candidate query + kit-invariant check are all now `ADMIN`-group-aware (see Known Bugs). **PATCHED session 74**: `normalizeAxisName()` applied to the mixed-axes pre-check (Color/Finish no longer wrongly rejected); new `stripAttributeFromName()` shared helper replaces 3 separate buggy copies (lookaround instead of `\b`, fixes symbol-prefixed values like `+0.005"`); WPS Phase 1 now sub-partitions each `wps_product_id` family by base name instead of treating the whole umbrella ID as one candidate; new Side axis (Left/Right), BLK/CHR abbreviations, standalone Polished/Standard, full-word Large/Medium; `nameImpliesKit()` narrowed to require a real bundle-joining word, not just the bare word "kit"/"assembly" (unblocked 14,784 products); new Phase 3 does `brand_part_number`-suffix cross-referencing with a pairwise fallback for contaminated clusters. **PATCHED session 75**: nuke step now also excludes `source_vendor='MULTI'` (was wiping cross-vendor pack-size groups from `build_pack_size_groups.mjs` — see Known Bugs) |
| `scripts/ingest/build_pack_size_groups.mjs` | Cross-vendor `MULTI` pack-size variant groups — separate script/table-population from `build_variant_groups.cjs`. Two source modes: default (from `catalog_variant_candidates`) or `--canonical` (from `canonical_product_id` groupings); `--apply` to write. **Session 75:** re-run with `--canonical --apply` to restore 49 of 148 MULTI groups wiped by a `build_variant_groups.cjs` nuke-step bug |
| `scripts/ingest/merge_catalog_unified.js` | Full `catalog_unified` rebuild from `pu_catalog`/`wps_catalog`/`vtwin_catalog` (TRUNCATE + reinsert every run). **PATCHED session 75**: now imports `normalizeBrand()` from `brandNormalizationMap.mjs` and applies it at all 3 insert points (PU/WPS/VTwin) so brand casing stays normalized on every future rebuild; also computes `isDisplayFixture` (PU: `sku ~ /^9903/`; both vendors: shared `DISPLAY_FIXTURE_NAME_RE` keyword match) and folds it into `is_active` at insert time, so PU/WPS in-store merchandising fixtures never resurface as sellable on a future rebuild |
| `scripts/ingest/brandNormalizationMap.mjs` | **NEW session 75** — single source of truth for brand normalization (242 raw strings → 154 canonical brands), imported by both `merge_catalog_unified.js` (durable, applied at insert time) and generates `normalize_brands.sql` (one-off catch-up UPDATE for whatever's already loaded) |
| `scripts/ingest/generate_normalize_brands_sql.mjs` | **NEW session 75** — regenerates `normalize_brands.sql`'s CASE expression from `BRAND_NORMALIZATION_MAP` so the two files can't drift apart. Run after any edit to `brandNormalizationMap.mjs` |
| `scripts/ingest/normalize_brands.sql` | **GENERATED file** (do not hand-edit — see `generate_normalize_brands_sql.mjs`) — one-off `UPDATE catalog_unified SET brand = CASE ...` catch-up for rows already loaded before a brand-map change. Run live session 75: 97,273 rows scanned, 51 duplicate clusters → 0 |
| `scripts/ingest/audit_brand_duplicates.sql` | **NEW session 75** — read-only. Groups `catalog_unified.brand` by case/punctuation-insensitive normalized key to surface duplicate clusters; run before AND after `normalize_brands.sql` to confirm impact |
| `scripts/ingest/exclude_display_fixtures.sql` | **NEW session 75** — soft-deletes (`is_active=false`) PU/WPS in-store merchandising fixtures already loaded in `catalog_unified` (SKU-prefix + tight name-keyword match, verified against price data — see Known Bugs/HANDOFF for the false-positive risk that was checked and ruled out). Applied live: 41 rows (15 PU + 26 WPS) |
| `scripts/ingest/audit_missing_variant_vocab.cjs` | **NEW session 74** — read-only, catalog-wide sweep for missing ATTRIBUTE_RULES vocabulary. Clusters ungrouped products by (vendor, brand, category, name-minus-last-word), tallies unrecognized trailing words by how many distinct product-line clusters they'd unlock. Generalizes the manual "spot a duplicate, find the missing word" process into a repeatable tool — does not modify the DB or the classifier itself, human review still required |
| `scripts/ingest/fix_cables_taxonomy.mjs` | **NEW session 77** — creates the **Cables** display_category by pulling 4,395 rows across six existing categories. Category-level migration, so it has three stages within-category scripts don't: **EXCLUDE** (name-level guards — a `display_category NOT IN (...)` filter is insufficient, because brake/spark parts sit in Accessories & Misc), **REROUTE** (mis-netted rows moved to their correct home in the same transaction), **FLAG** (ambiguous, untouched). **No blanket fallback** — an unmatched row hasn't earned its way into a new category and is left where it is. Hardware rules run FIRST, not last: the hardware word is the product noun, the cable type is a qualifier (`Die-Cast Cable Clamp - Clutch` is a clamp). `LINE` = hydraulic, `CABLE` = mechanical, uniform across vendors. **⚠️ KNOWN LIVE BUG:** the `HOSE HYDRAULIC CLUTCH` raw-subcategory shortcut (~line 313) fires unconditionally and misfiles 9 rows named `Clutch Cable` as hydraulic lines. Hand-corrected post-apply; **script not patched — a re-run recreates it.** See HANDOFF_LOG "SEVENTY-SEVENTH PASS" |
| `scripts/ingest/fix_gaskets_seals_migration.mjs` | **NEW session 77** — creates the **Gaskets & Seals** display_category. 4,242 rows from Engine (3,030 + scattered name-matches), Transmission & Clutch, Suspension (`Fork Seals & Boots` wholesale), Wheels & Tires (name-matched *within* `Bearings & Seals` only), Exhaust. Brakes (caliper seal kits) and Tools & Chemicals (sealants, seal-install tools) deliberately untouched. `SEAL` treated as a far riskier bare word than `GASKET` — word-bounded, sampled separately. Run `audit_gaskets_seals_scope.mjs` first |
| `scripts/ingest/audit_gaskets_seals_scope.mjs` | **NEW session 77** — read-only, NO WRITES. Cross-catalog scoping audit run *before* the Gaskets & Seals migration logic was written, to avoid sweeping in unexpected rows from unexamined categories. Caught the bug that mattered: its own "34 rows" figure for Wheels & Tires `Bearings & Seals` was the seal-named subset, not the 238-row subcategory total — moving the subcategory wholesale would have dragged ~200 unrelated bearings into Gaskets & Seals |
| `scripts/ingest/fix_engine_taxonomy.mjs` | **NEW session 77** — Engine, 9,190 rows, 10 subcategories. Spec implied collapsing Pistons & Cylinders / Heads & Valves / Bottom End into one generic bucket; dry run showed that would make Engine Parts an **8,300+ row bucket**, so they stay separate (Laken's call). Gaskets & Seals (3,030) excluded and left untouched for the later migration. **Bugs:** bare `CAM` matched "Twin Cam" (a PLATFORM NAME, not a product description — stripped before matching); `Motor Mount` uncovered (only `Engine Mount` was, despite the old subcategory being literally named "Motor Mounts"); `\bCAMS?\b` doesn't match `CAMSHAFT` |
| `scripts/ingest/fix_transmission_taxonomy.mjs` | **NEW session 77** — Transmission & Clutch, 7,263 rows, 16 subcategories + fallback. `5 Speed`/`6 Speed` are NOT triggers (same platform-name trap as Twin Cam). `Chain Belts & Guards` runs before `Rear Belts & Chains` ("Rear Belt Guard" contains "Rear Belt"). No bare-brand matches — Baker/JIMS span subcategories, Diamond/RK Takasago/Regina are ambiguous chain brands; all five flagged. `Electric Shift Kits` spec'd, rule written, **zero rows** |
| `scripts/ingest/fix_electrical_taxonomy.mjs` | **NEW session 77** — Electrical, 6,731 rows, 13 subcategories. **CRITICAL bug:** `SWITCHES?` parses as SWITCH + literal `E` + optional `S`, so it matched "switches" and **never** bare "switch" — `-es` plurals need `SWITCH(ES)?`. Silently dropped most of the old 566-row Switches & Controls bucket into the fallback. Also: `Stator` not covered by "alternator"; `Breaker Plate` is points terminology that says neither "points" nor "distributor"; Audio & Communication had zero keyword coverage. `Ignition Switches` requires the exact phrase; `Sensors & Switches` is the bare catch-all and runs last among named subcategories |
| `scripts/ingest/fix_lighting_taxonomy.mjs` | **NEW session 77** — Lighting, 4,214 rows, 9 subcategories. **Bare `LIGHT` is never used** — too broad, would claim the category. Every rule compound or specific. `Reflectors & Lenses` excludes "Headlight Lens" via a NOT-HEADLIGHT check. `Lighting Components & Accessories` runs last. No brand-hit logic. `Lighting Covers` spec'd, **zero rows** |
| `scripts/ingest/fix_handlebar_controls_mirrors_taxonomy.mjs` | **NEW session 77** — Handlebar & Controls, 6,764 rows (down from 10,636; lost 3,872 to Cables), 6 subcategories + fallback. The 100+ handlebar **style names** (Ape Hangers, T-Bar, Z-Bar, Monkey Bagger, Prime Ape) are the primary signal, not bare `HANDLEBAR` (which only fires when NOT followed by RISER/CLAMP). Bare `THROTTLE` deliberately avoided to prevent collision with Carburetion & Fuel's EFI throttle bodies. Fallback bucket collapsed 2,395 → 207 |
| `scripts/ingest/rebuild_display_category_v2.mjs` | **NEW session 74** — shadow-column-safe `display_category` rebuild. Scoped to the 2,028 null-category rows + 2 confirmed structural bugs (SADDLEBAGS, TANK gas/oil split) + 2 decisions (Kickstands, Gas Caps & Petcocks), after a full-recompute dry run showed it would silently regress thousands of already-correct rows. `--write-shadow` then `--promote` as separate explicit steps |
| `scripts/ingest/rebuild_subcategory_detail.mjs` | **NEW session 74** — populates the new tier-3 `display_subcategory_detail` column for the 37 subcategories in `tier3_final_mappings.sql`. Same shadow-column safety pattern as the category rebuild |
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
| `scripts/ingest/index_unified.js` | Typesense reindex — uses product_details as primary source. **Session 67:** added `fitment_text` field (combined family+model+code+year string for search); schema change requires `--recreate`. **Session 74:** added `display_subcategory_detail` facet field (tier-3) — required `--recreate`. |
| `scripts/ingest/build_oem_part_timeline.mjs` | **NEW session 67** — populates `oem_part_timeline` from `catalog_oem_crossref`. Century-aware year logic. Dry-run default, `--apply` flag. ON CONFLICT (oem_number, product_id) DO NOTHING. |
| `scripts/confirm-and-apply-pending.mjs` | Confirms ALL pending proposals then immediately applies them. Use after UI rejection pass. --dry-run flag. |
| `scripts/apply-confirmed-merges.mjs` | Applies all 'confirmed' proposals (use if already confirmed via UI). --dry-run flag. |
| `scripts/ingest/build_oem_fitment_all.mjs` | **PATCHED session 65** — Unified HD OEM PDF catalog extractor. 121 catalogs, all families. Fixes: (1) year-annotation noise filter (`description ~ '^\d{4}$'` rows skipped at parse time); (2) `catalog_family` column now populated from `cat.family` in bulkInsert. `catalog_family` values: sportster/dyna/softail/touring/all_model/fxr/fx/vintage/police. |
| `scripts/ingest/promote_oem_fitment.mjs` | **PATCHED session 65** — PATH_A_UNIVERSAL, PATH_B_UNIVERSAL, PATH_C_UNIVERSAL now JOIN harley_families and constrain by `f.catalog_family`. A Softail catalog's {ALL} rows only expand to Softail model years. `all_model` family = unrestricted (1340cc era). ON CONFLICT keeps highest confidence. |
| `scripts/ingest/backfill_pu_brand_xml_fitment.mjs` | **NEW session 68** — mines model+year fitment from all 133 PU brand XML files (root + brand_files/, deduped). Only partDescription/productName used (bullets excluded as unreliable). Groups model_alias_map by alias_text so multi-generation phrases (e.g. "fat boy") try all candidate codes. `--dry-run` flag. |
| `scripts/ingest/backfill_colony_catalog_fitment.mjs` | **NEW session 68** — parses Colony's 2026 catalog (`scripts/data/colony/Colony_2026_Catalog.txt`, pdftotext -layout output) "Kit Application Index" tables for stock-number + model+year lines. Same-token conflict guard (skips stock numbers reused across genuinely different platforms in Colony's own catalog). `--dry-run` flag. |
| `scripts/ingest/backfill_eastern_crossref_fitment.mjs` | **NEW session 68** — links `catalog_oem_crossref` (source_file='eastern_2022_catalog') to products via `oem_number = ANY(oem_numbers[])`, then extracts fitment using the trailing `[FL]/[XL]/[WL]/[XR]` bracket as platform-lineage family signal (not a strict model code), narrowed/conflict-checked against free text. `--dry-run` flag. |
| `scripts/ingest/sync_fitment_flat_columns.mjs` | **NEW session 68** — aggregates catalog_fitment_v2 → catalog_unified's flat fitment columns (is_harley_fitment, fitment_year_start/end, fitment_hd_families/models/codes, fitment_year_ranges). Idempotent. Run after any script that writes to catalog_fitment_v2, before every Typesense reindex. |

---

## HOMEPAGE LAYOUT

Section order (app/page.jsx):
1. SmokeBackground (canvas, lazy loaded)
2. VideoHero — R2 CDN video
3. ModelFinder — era → model → /browse (year slider removed session 46)
4. ScrollVelocity band
5. CategoryBentoGrid (19 categories — excludes Riding Gear & Tools)
   - ⚠️ **NOT UPDATED for session 77.** `display_category` is now **23** values, not 21.
     **Cables** and **Gaskets & Seals** will silently vanish from any hardcoded category array
     here, in browse filters, or in nav. Needs a grep. Also stale: `infer_vtwin_categories.mjs`
     (28 source → 21 display) will re-route cable/gasket products on the next VTWIN import.
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
| OEM Crossref | /admin/oem-crossref | Inline edit crossref rows; click OEM # to manage fitment modal (2 tabs: Fitment + Products) |

Auth: `?token=` URL param or `X-Admin-Token` header matching `ADMIN_SECRET` env var.
⚠️ ADMIN_SECRET not yet added to Vercel production — add with `npx vercel env add ADMIN_SECRET`.

---

## PDP ARCHITECTURE

`app/browse/[slug]/page.jsx` — server component.
- `getProduct()` SQL: catalog_unified + canonical_products + catalog_fitment_v2 + catalog_media (lateral, all_urls array) + product_details
- Image resolution: `CASE WHEN array_length(cu.image_urls,1) > 0 THEN cu.image_urls ELSE cm.all_urls END` — VTwin reads image_urls column; PU reads catalog_media
- Image proxy: `app/api/image-proxy/route.ts` — fflate-based, Referer-spoofing for LeMans zips, 1-year edge cache
- `ProductImageGallery.jsx` — client component, thumbnail strip for multi-image products
- Layout: ProductDetailsSection → PDPTabs (Fitment + OEM) → **OemPartTimeline** → AdminEditPanel
- `PDPTabs.jsx` — DetailsContent reads `product_details.attributes` directly as object (JSON.parse workaround removed session 60)
- **Fitment tab shows model name alongside model code (session 75)** — `hm.name` added next to `hm.model_code` in every fitment-tab query/render path: `app/browse/[slug]/page.jsx`, `app/era/[slug]/page.jsx`, `app/api/browse/panel/route.js` + `InlinePanel.jsx`. Renders e.g. "Street Glide (FLHX)" instead of a bare code. Mapping already existed in `harley_models.name` — no new data needed. Edge case: `FLHX` meant "Electra Glide Special" 1984–85 before meaning "Street Glide" from 2006 on — those two eras render as separate rows, not merged under one name.
- **`OemPartTimeline.jsx`** — client component (session 67). Two panels: left = all products sharing current OEM number (clickable → modal); right = year carousel (older/current/newer). Modal: image, name, OEM#, brand, pack qty, price, new-tab link. No vendor names or confidence scores shown. Rendered only when `getOemPartTimeline()` returns non-null.
- **`lib/getOemPartTimeline.ts`** — server function (session 67). Queries `oem_part_timeline_sellable`. Returns OemPartTimeline with older/same_year/newer/current buckets, or null if product has no family.
- **`VariantSelector.jsx`** — client component, **wired into the PDP for the first time in session 73**. Was previously fully built (Modes A–E: fitment+color, fitment-only, flat options, color+qty, style+finish) but completely orphaned — never imported. Fetches its own data from `/api/browse/variants/[productId]` and self-hides when there's nothing to show. Replaced the old inline `getVariantMembers()` query + flat `<Link>`-per-row renderer in `page.jsx`, which had no dedup and was the direct cause of a duplicate-pill display bug. Mode C (flat options) now also runs `dedupeByFullOption()` (keyed on `option_1_value + option_2_value + pack_qty`) guarded by `hasMixedSizeAndColor()` so mixed size/color axes are never over-collapsed.
- catalog_media join pattern throughout PDP: `LEFT JOIN LATERAL (SELECT url FROM catalog_media WHERE product_id=... AND media_type='image' ORDER BY priority ASC LIMIT 1) cm ON true` — no `is_primary` column; always use `priority`.

---

## KNOWN BUGS / WORKAROUNDS ACTIVE

| Bug | Workaround | Real fix |
|-----|------------|---------|
| scrape_vtwin_missing.mjs pg deprecation warning | Not failing — concurrent queries on single client instead of pool | Use `pool.query()` in worker |
| oem_supersession 283 original confidence=1 rows | Not yet reviewed or corrected | Manual review via `SELECT * FROM oem_supersession_review LIMIT 30`; delete `56308-88→56309-96` and `56324-81A→56356-92` (flagged session 67 as wrong cable-type matches) |
| catalog_unified flat fitment columns drift silently | Fixed catalog-wide session 68 via sync_fitment_flat_columns.mjs | Must re-run `sync_fitment_flat_columns.mjs` after every script that writes to catalog_fitment_v2 — nothing does this automatically yet |
| ⚠️ Never run ingest scripts via `node -e "import(...)"` | N/A — process discipline only | Always invoke by file path with an explicit `--dry-run` first; an accidental unflagged `node -e` run wrote 56,913 bad rows in session 68 before being caught and deleted |
| Cart items never carried `canonical_sku` — `CartContext.addItem()` only stored `catalog_unified.id` | Fixed session 69 — join added in `index_unified.js`, field added to Typesense schema + `/api/search` normalizer + `CartContext` | Still need to check `app/api/products/route.ts` (used by brands page) for the same gap — unconfirmed as of session 69 |
| Typesense won't retroactively add a new schema field to an existing collection without `--recreate` | Documented in `index_unified.js` comments as of session 69 | Always run `--recreate` (not plain upsert) the first time after adding any new field |
| `userId` client-trusted (not session-verified) in `prepare`/`create-intent`/`orders/create`/`account/points` | None yet — fine for demo/no real customers | Verify Supabase JWT server-side before this handles real money/points |
| `fix_product_vendors_drift.mjs` had no dotenv call at all — required manual `export $(grep ...)` before running | Fixed session 72 — added script-location-relative dotenv pattern (project root `.env.local`/`.env`, not `scripts/ingest/`) | `sync_fitment_flat_columns.mjs` still uses a fragile bare `dotenv.config({ path: ".env.local" })` (cwd-dependent) — not yet patched |
| `harley_model_years` can contain impossible future years | Fixed session 72 for the 14 known-affected codes (56 rows, years 2027-2030 deleted) | Same 14 codes' 2024-2026 data shows a suspicious flat/constant-count pattern too — needs domain review before touching, not another automated fix |
| `catalog_oem_crossref` can contain rows with `product_id IS NULL`, invisible to every UI | 15,192 of 17,150 relinked session 72 | `eastern` source's 1,641 remaining unmatched rows — accepted gap, no further script-mineable signal found |
| `VariantSelector.jsx` was fully built (Modes A-E) but never imported — PDP used a dead-simple flat-pill renderer with zero dedup, causing duplicate-looking variant buttons for genuinely different products | Fixed session 73 — wired into `app/browse/[slug]/page.jsx`, dead `getVariantMembers()` removed | Also added `dedupeByFullOption()` + `hasMixedSizeAndColor()` guard for Mode C, which had no dedup of its own |
| `build_variant_groups.cjs` had no dotenv call, referenced nonexistent `CATALOG_DB_PASSWORD`, hardcoded the broken IPv6 host — `SASL` error on any live run | Fixed session 73 — switched to `CATALOG_DATABASE_URL` via root-relative dotenv (same pattern as `lib/db/catalog.ts`) | N/A |
| `build_variant_groups.cjs` classifier missed `MD` (apparel size), `pink`/`burgundy` (color), and `bright`/`dark` color modifiers — caused both PDP variant-pill duplicates ("Pattern B") and a browse-grid duplicate-card bug (Fender Seat Washer) | Fixed session 73 — regex additions made from concrete evidence only (real product names causing real bugs), not speculative vocabulary growth | 2 groups (Bar Harness II, UV2000 Cycle Cover) couldn't be safely covered by regex and were hand-corrected + tagged `ADMIN` instead |
| ⚠️ `build_variant_groups.cjs`'s nuke step (`DELETE FROM catalog_variant_groups`) had no vendor filter — wiped 6 human-curated `ADMIN` groups (26 members) during a session-73 live rebuild | Recovered in full from a `pg_dump` backup (extracted via `awk`/`grep` against the plain-SQL COPY blocks, re-inserted with fresh IDs) | Nuke step, Phase 1 WPS candidate query, and kit-invariant check are all `ADMIN`-group-aware — cannot recur. **Always `pg_dump` the variant tables before running this script live.** |
| `catalog_unified.display_category` had 2,028 `NULL` rows — root cause was raw `category` values simply never mapped, not a data problem | Fixed session 74 — `rebuild_display_category_v2.mjs`, 0 NULL remain | Also fixed SADDLEBAGS (was landing in Seating) and TANK 2-way gas/oil split |
| `build_variant_groups.cjs` mixed-axes pre-check compared raw (non-normalized) attribute names — rejected valid Color/Finish pairs like "Chrome" vs "Matte Black" as mismatched | Fixed session 74 — apply `normalizeAxisName()` before comparison | Unlocked 328 groups on its own |
| `build_variant_groups.cjs` WPS Phase 1 treated a whole `wps_product_id` (sometimes an entire product line — every style × every fitment) as one candidate, always failing size/similarity checks | Fixed session 74 — sub-partition each family by attribute-stripped base name first | WPS groups 291 → 1,506 across the session |
| **THE TRAILING-S REGEX BUG FAMILY — three occurrences, three categories, three sessions.** (1) Fuel/Air: `\bJETS?\b` silently missed the plural. (2) Engine: `\bCAMS?\b` does not match `CAMSHAFT` — there is no word boundary between the `M` and the `S`. (3) Electrical: `SWITCHES?` parses as SWITCH + literal `E` + optional `S`, so it matched "switches" and **never** bare "switch" — words pluralizing in `-es` need the whole suffix grouped: `SWITCH(ES)?` | Each fixed in its own session; **the pattern itself is the lesson.** Every countable-noun keyword gets an explicit optional trailing S from the start. Group `-es` suffixes as one unit. Never trust `\b` to sit between a word and its plural suffix | JavaScript `\b` does not split before a trailing S. Postgres has no `\b` at all — use `(\s|$)`. The Electrical case is the worst because it fails **silently and completely** on the singular, dumping a whole bucket into the fallback |
| **PLATFORM NAMES ARE NOT PRODUCT DESCRIPTIONS.** Bare `CAM` matched "Twin Cam" on every part that merely *fits* or *excludes* Twin Cam engines (Engine, session 77). Same trap with `5 Speed`/`6 Speed` in Transmission — fitment descriptors, not a signal the product is a gear set | Strip the platform name from the product name **before** keyword matching. Gear Sets requires the literal phrase "gear set" | Expect the identical trap with "Milwaukee-Eight," "Evolution," "Sportster," "Panhead," "Shovelhead" |
| **THE OLD SUBCATEGORY'S OWN NAME IS VOCABULARY YOU WILL FORGET.** Engine's `Motor Mounts` bucket never matched, because the rule only checked `ENGINE MOUNT` (session 77) | Grep the existing subcategory names for keywords before writing any classification rule | The old taxonomy is a free vocabulary list — mine it first |
| **A `display_category NOT IN (...)` FILTER IS INSUFFICIENT FOR CATEGORY-LEVEL MIGRATIONS.** Out-of-scope products don't reliably sit in their correct category. Brake adjusters and spark/timer parts were in Accessories & Misc and Carburetion & Fuel, and walked straight past the exclusion into Cables (session 77) | Add **name-level EXCLUDE guards** on top of the category filter | Corollary: when moving rows *into* a new category, **drop the blanket fallback**. A row matching no rule has not earned its way in; force-assigning imports garbage |
| **HARDWARE KEYWORDS MUST BE EVALUATED BEFORE TYPE KEYWORDS.** Ran Cable Hardware last on the theory that `CLAMP`/`BRACKET`/`GUIDE` would steal real cables. Exactly backwards — in these names the hardware word is the **product noun** and the type is a **qualifier**: `Die-Cast Cable Clamp - Clutch` is a clamp, `Speedometer Cable Adapter` is an adapter (session 77) | Hardware rules run FIRST. Cable Hardware went 63 → 180 rows | ~40 clamps/brackets/guides/adapters had been sitting in cable-type buckets |
| **EXTRACT `classify()` INTO A STANDALONE MODULE AND BUILD A REGRESSION HARNESS.** A 4,500-row dry run per rule edit is far too slow to iterate against (session 77) | Cables: 51 cases built from every dry-run-1 failure plus every rule already known good. Caught 2 bugs invisible in the dry-run samples (`REPLACEMENT` guard; FLAG needing to precede EXCLUDE) | 51/51 before apply. **Repeat this on every future category rebuild** |
| `build_variant_groups.cjs` base-name stripping used `\b` word-boundary regex, which silently fails right before a symbol like `+` (e.g. `+0.005"`) since both sides are non-word chars | Fixed session 74 — consolidated 3 separate copies into one `stripAttributeFromName()` helper using `(?<!...)/(?!...)` lookaround instead of `\b` | Also fixed a segment-equality bug where a trailing inch-mark (`"`) the extractor didn't capture caused an exact-match check to fail |
| `build_variant_groups.cjs` had zero vocabulary for "smoke"/"tinted" (699 windshield products), no "Side" axis for Left/Right at all (85 clusters each), and no recognition of "BLK"/"CHR" vendor abbreviations or standalone "Polished"/"Standard"/full-word "Large"/"Medium" | Fixed session 74 — evidence-based additions via new `audit_missing_variant_vocab.cjs` catalog-wide sweep | Deliberately did NOT add "Solar" — confirmed overloaded across 3 unrelated meanings (tint color, "Solar-Reflective Leather" material, literal "Solar Panel" product) |
| `nameImpliesKit()` treated bare "kit"/"assembly" as an automatic bundle-exclusion trigger, blocking 14,784 legitimate single-product names (e.g. "Taillight Kit - Chrome") from variant grouping entirely | Fixed session 74 — now requires a real bundle-joining word/symbol ("and"/"with"/"&"/"w/") with actual surrounding whitespace | Single highest-impact fix of the session — "complete set"/"service kit"/"rebuild kit" kept as unconditional bundle phrases (lower volume, lower ambiguity) |
| ⚠️ `build_variant_groups.cjs` does a full nuke-and-rebuild on *every* live run, not incrementally — running it in a foreground shell with a short timeout can leave the DB in a transient degraded state if killed mid-rebuild | Happened once session 74 (Bash tool's 2-minute default timeout); self-recovered by re-running to completion properly backgrounded, no data lost | **Always run this script with `run_in_background: true` (or equivalent) — never assume a short foreground timeout is enough** |
| `build_variant_groups.cjs`'s nuke step excluded `source_vendor='ADMIN'` but not `'MULTI'` — a session-75 live run silently wiped all 148 pre-existing cross-vendor pack-size groups (built by the separate `build_pack_size_groups.mjs`) | Fixed session 75 — nuke step now excludes `source_vendor IN ('ADMIN', 'MULTI')`, same pattern as the session-73 ADMIN fix | Only 49 of the 148 were reproducible via `build_pack_size_groups.mjs --canonical --apply` afterward; ~99 gap not investigated (likely normal candidate-data drift since whenever the original 148 were built) |
| `canonical_sku_seq` had drifted behind some historically-inserted `canonical_products` rows (sequence at 182,018 while a row already existed at `CP-180063`) — `build_canonical_products.mjs` Phase A threw a duplicate-key error and aborted mid-batch on first live run | Fixed session 75 — `setval('canonical_sku_seq', <true_max›+1, false)` | Sequences don't roll back on transaction failure, so a naive retry of the same batch just re-advances further without ever revisiting the stale gap — must explicitly `setval` past the confirmed true max |
| `index_unified.js`'s reindex query is scoped `WHERE cu.is_active = true`, so it only ever upserts active rows — it never deletes a Typesense document for a row that flips to `is_active = false` since the last index, leaving stale "still active" docs live in search | Manually patched for session 75's 41 PU/WPS display-fixture rows (20 needed deletion; the other 21 were already inactive pre-session, never indexed) via direct Typesense `DELETE /collections/products/documents/{id}` calls | No automated fix yet — any future `is_active` flip needs a matching explicit Typesense delete, or `index_unified.js` needs a "soft-delete sync" step / delete-then-upsert pattern |
| Nested shell/JS/SQL regex escaping is fragile and fails silently — a Postgres `~*` pattern with `\y`/`\s` typed directly in a JS template literal (itself inside a bash double-quoted `node -e "..."` command) loses its backslashes at the JS-parsing layer with no error, silently matching nothing | Hit twice in session 75 (once building the `UPDATE`, once re-querying IDs for Typesense cleanup) — both times fixed by reading the regex verbatim from the already-correct `.sql` file on disk instead of retyping it inline | **Never retype a regex pattern across shell→JS→SQL layers — always read it from a file** when more than one quoting layer is involved |
| `build_canonical_products.mjs` Phase B: 4 `applied` proposals had a real gasket-thickness mismatch (.032" vs .045") — but investigation found the underlying products were already correctly split apart by a July-4 manual review pass; only the `canonical_match_proposals.status` field was stale, not the live data | Fixed session 75 — corrected the 4 stale labels; added a `parseThickness()` mismatch check to Phase B so this class of bug can't recur | Broader audit found 85 total `applied` proposals with currently-divergent canonical IDs; only 30 have the `manual-split` marker confirming a deliberate, understood fix. The other 55 have unclear provenance and were deliberately NOT touched — see Open Items |
| `build_canonical_products.mjs` Phase B's price-gap-mismatch auto-reject rule treated "no `brand_part_number` recorded on either side" the same as "explicitly different part numbers" — both fell through to a price-based rejection | Fixed session 75 — now only rejects on price gap when both sides have an **explicit, differing** part number; reopened 423 pairs wrongly rejected under the old logic | User-caught: a missing part number is absence of evidence, not evidence of a real difference — the same physical part is routinely priced very differently across vendors (markup variance, not proof of non-identity) |
| **THE ADJACENCY-REGEX BUG, FOURTH OCCURRENCE.** Brakes classifier initially required `BRAKE` to sit immediately next to a hardware noun (`BRAKE\s*ROD`), but real names interpose years/models/modifiers: `"1936-1937 Style Mechanical Brake Kit"`, `"Front Brake Stabilizer Extension"` both went unmatched on the first live dry run (session 78) | Fixed by decoupling "name contains BRAKE somewhere" from "name contains a hardware noun somewhere" — two independent `.test()` calls ANDed together, not one adjacency-dependent pattern | Same root cause as the trailing-S family (session 77 lesson) — regex adjacency assumptions keep failing on real vendor naming, which freely reorders and interposes qualifiers. Treat "does the name contain X" and "does the name contain Y" as separable checks by default; only require adjacency when there's a real ambiguity that needs it |
| **A RAW VENDOR CATEGORY CAN ITSELF BE A GRAB-BAG, NOT A RELIABLE FILTER.** WPS's raw `category = 'Brake - front'` mixed genuine brake parts with clutch levers, shifter parts, and one air-cleaner part (session 78) — confirmed via ~96 Population-1 fallback rows that had no brake keyword because they simply aren't brake parts | Did NOT force-assign these into the fallback bucket — split the apply, held back all 96 rows with ids logged, left `display_subcategory` NULL for a dedicated follow-up pass rather than shipping known-wrong subcategory data | Corollary to "category-filters-are-insufficient" (session 77): that lesson was about `display_category NOT IN (...)` missing out-of-scope rows; this is the mirror case — a raw vendor category can't be trusted as a scope-defining filter either, even for rows already routed into the category it's supposedly authoritative for. Spot-check a raw category's actual contents before writing rules against it |
| **DON'T FORCE A FALLBACK BUCKET WHEN A MEANINGFUL FRACTION IS ACTUALLY WRONG-CATEGORY, NOT UNCLASSIFIED.** Brakes' within-category fallback started at 118/526 (22%); after fixing every real classifier gap the harness could catch, still landed at 96/526 (18%) — and the sample showed most of *those* were confirmed non-brake parts or genuinely ambiguous dual-purpose SKUs, not classifier misses (session 78) | Split the apply: 430 confident matches written, 96 held back untouched (still NULL) with ids logged at apply time for a dedicated manual/business-decision pass | A fallback rate that stays stubbornly high after real fixes is a signal to stop tuning regexes and look at what's actually in the bucket — forcing a "must resolve" population to resolve anyway just relocates the cleanup work to a later, less-informed session |

**Search architecture (session 67):** `app/api/browse/products/route.ts` now calls Typesense server-side when `?q=` present. Fallback to ILIKE in browse.ts if Typesense returns 0 or times out (3s). ILIKE fallback uses 2-word threshold for 3+ word queries — no more zero results for model-name searches like "brake rotor street glide".

**Browse filter architecture — tier-3 nesting (session 74):** first 3-level nested filter in the codebase (Category → Subcategory → Detail), built by exactly replicating the existing category→subcategory pattern rather than inventing a new one. `lib/db/browse.ts` tags each filter condition (`'category'`, `'subcategory'`, `'subcategory_detail'`) and runs one facet query per level that excludes its own tag (so counts reflect "what if I removed just this filter"); `FilterSidebar.jsx` gates each nested section's visibility on the parent level being selected (`Detail` section only renders when `filters.display_subcategory && subcategoryDetails.length > 0`) and auto-opens when its parent is chosen. Selecting a higher level clears everything below it (category → clears subcategory + detail; subcategory → clears detail). URL param: `subcategory_detail`.

*Note: VTwin extra_attributes stringified JSON bug (was #22 on chase list) — FIXED session 60 at source in build_product_details.mjs. Workaround in PDPTabs.jsx also removed.*

---

---

## SESSION 63 HANDOFF — June 28, 2026

### Work completed

**OEM fitment promotion — APPLIED** (`scripts/ingest/promote_oem_fitment.mjs`)

Two bugs fixed this session before running:
- `updated_at` column doesn't exist on catalog_fitment_v2 — removed from UPSERT_SUFFIX
- PATH_A_UNIVERSAL had FK violation (matched_product_id → deleted products) — added `JOIN catalog_unified cu ON cu.id = f.matched_product_id` to filter

Promotion results (ran against 5,062,086 baseline):

| Path | Variant | Rows Upserted |
|------|---------|--------------|
| A — direct match | model-specific (0.95) | 116,434 |
| A — direct match | universal (0.85) | 454,872 |
| B — VT- crossref | model-specific (0.90) | 103,005 |
| B — VT- crossref | universal (0.80) | 356,066 |
| C — fatbook crossref | model-specific (0.88) | 164,777 |
| C — fatbook crossref | universal (0.78) | 696,286 |
| **Total** | | **+737,995 net new** |

**catalog_fitment_v2: 5,062,086 → 5,874,564 rows** (21 distinct sources)

### Next session starting points
1. Refresh materialized view: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_oem_fitment_coverage`
2. Reindex Typesense: `node scripts/ingest/index_unified.js --recreate`
3. OCR the 4 image-only PDF catalogs (FX 1971-80, FX 1971-84, Softail 2002, WLA 1942):
   ```bash
   brew install ocrmypdf
   ocrmypdf "<path>" "<path>" --skip-text
   # then: node scripts/ingest/build_oem_fitment_all.mjs --force
   # then: node scripts/ingest/promote_oem_fitment.mjs
   ```
4. Acquire missing catalog years (Dyna 1993–97 gap is largest): microfiche.info, HD dealer portals, hdforums.com
5. Review 62 variant candidates: `/admin/variant-candidates?token=...`
6. Review 283 oem_supersession original inferred pairs: `SELECT * FROM oem_supersession_review LIMIT 30`
7. Payment gateway decision — BLOCKING checkout

---

*Master Reference — Last updated July 10, 2026 · Session 78 (see HANDOFF_LOG.md "SEVENTY-EIGHTH PASS" for full session detail)*
