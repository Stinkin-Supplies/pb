# Stinkin' Supplies — Filtering System Roadmap
**Created:** June 5, 2026 · **Last Updated:** July 7, 2026 (Session 75)
**Scope:** browse.ts · FilterSidebar · Fitment data · Typesense facets · display_subcategory taxonomy

---

## Status: COMPLETE ✅

All filter architecture phases complete. display_subcategory taxonomy complete across all 20 categories. **Session 74 added a tier-3 `display_subcategory_detail` layer** (Category → Subcategory → Detail) across the 37 largest subcategories, plus a category-level rebuild that closed the last 2,028 null-category gap.

### ✅ Session 75 — brand facet cleanup + fitment-tab model names + display-fixture exclusion

Three items from this session touch this doc's scope directly:

1. **Brand facet duplicates eliminated.** `catalog_unified.brand` had 51 duplicate normalized clusters live (e.g. "ARLEN NESS" and "Arlen Ness" as two separate FilterSidebar brand-facet entries for the same 1,444 combined products). Ran the (previously-drafted-but-never-executed) `normalize_brands.sql`, extended with 8 real gaps found via live audit, wired durably into `merge_catalog_unified.js`. Live: 51 clusters → 0. Typesense reindexed — brand facet now shows one clean entry per real brand instead of splitting counts across casing variants.
2. **41 PU/WPS in-store display fixtures removed from browsable inventory** (`is_active=false`) — these were dealer point-of-sale merchandising units (racks, display boards, counter displays), not real sellable products, but were previously showing up in browse/search/facet counts like any other product. Typesense synced to match (see HANDOFF_LOG session 75 for a real upsert-vs-delete indexing gap found and closed along the way).
3. **Fitment tab now shows model name alongside model code** (e.g. "Street Glide (FLHX)" instead of bare "FLHX") — a PDP display change, not a filter/facet change, but within this doc's "Fitment data" scope.

Full detail: HANDOFF_LOG.md "SEVENTY-FIFTH PASS".

---

## Phase 1 — Quick Unblocks ✅ COMPLETE
All browse.ts and fitment bugs fixed. Sessions 42+57.

## Phase 2 — Sidebar UX ✅ COMPLETE
FilterSidebar improvements shipped (sessions 42–43). `?category=` URL param sticky bug fixed (session 57).

## Phase 3 — Fitment Coverage ✅ SUBSTANTIALLY COMPLETE

| Vendor | Coverage | Session | Notes |
|--------|----------|---------|-------|
| PU | ~49% | Session 47 | Ceiling — 17,796 gap products have no fitment in pu_fitment_parsed; unfixable without new PU feed |
| WPS | ~41% | Session 47 | Correct as-is — gap confirmed to be non-HD/universal products |
| VTwin | **55.8%** | **Session 58** | Up from 41.1% (15,741) → 21,390 products. Two new scripts: parse_vtwin_fitment_raw.mjs + scrape_vtwin_missing.mjs |
| EBC (via PU/WPS/VTwin) | **~89%** | **Session 60** | 554 EBC brake products matched; 3,005 net-new catalog_fitment_v2 rows (source='ebc_catalog') |
| PU — Eastern/Colony/brand-XML | +735 products | **Session 68** | Eastern crossref finally linked (606 products), Colony 2026 catalog mined (84), full PU brand-XML corpus mined (42), GMA Engineering manual review (3). Small relative to PU's ~35K total but exhausts the easily-parseable signal in these sources — see filter_roadmap Open Issues. |

**VTwin gap remaining:** 18,890 SKUs not found on vtwinmfg.com (discontinued/removed from site). ~4,035 remain with no fitment but on-site — further scraper runs could improve this marginally. Fresh gap export as of session 68: `vtwin_no_fitment_2026-07-02.csv` (15,511 rows).

### ✅ Session 72 — catalog-wide fitment/OEM health audit + impossible-years bug fix

Ran a fresh coverage check via new `audit_fitment_oem_health.mjs` — confirmed PU/WPS/VTwin coverage still at the ceilings documented above (no regression) and flat-column drift at zero (stayed in sync since session 68's fix).

Separately, found and fixed a real bug: `harley_model_years` had 56 rows across 14 model codes (FL, FLI, FLST, FLT, FXSB, FX, FLHXXX, XLH, XLS, XLC, FLHTC, FLH, FLTRX, FLTRS) with fabricated model years extending to 2027–2030 — impossible, no H-D model year can exist 4+ years ahead of today. Traced via `created_at` timestamps to one legitimate June 10, 2026 historical-fitment-import session that otherwise populated real data correctly for dozens of codes; these 14 just carried a placeholder pattern forward to a fixed `current_year + 4` horizon instead of stopping. Deleted the 56 bogus year rows + their 3,536 `catalog_fitment_v2` rows (778 real products affected — their `fitment_year_end` was showing 2030), re-synced flat columns, reindexed.

⚠️ **Not yet resolved:** the same 14 codes show a suspicious flat/constant row-count pattern even in the 2024–2026 range (technically possible years) — e.g. `FLHTC` locks to exactly 5 rows/year from 2024 on, `FLST` locks to 240 from 2025 on. Real fitment data doesn't naturally produce identical counts 6+ years running. Needs Laken's production-history judgment (which of these codes are genuinely still in production) before touching — see Open Issues.

### ⚠️ Session 68 — critical facet-pipeline fix: flat fitment columns were never populated

`catalog_unified.is_harley_fitment`, `fitment_year_start/end`, `fitment_hd_families`, `fitment_hd_models`, `fitment_hd_codes`, `fitment_year_ranges` — the columns Typesense actually indexes for fitment facets and `fitment_text` search — were **0% populated across the entire 97,277-row table**, despite `catalog_fitment_v2` (the real join-table source) having data for 45,659 of those products going back years. Only `/era/[slug]` and the by-model browse API queried `catalog_fitment_v2` directly; everything else (main product API, Typesense) showed zero fitment info catalog-wide until this session.

Fixed via new **`scripts/ingest/sync_fitment_flat_columns.mjs`** (idempotent aggregation from catalog_fitment_v2) — synced all 45,659 products, followed by a full Typesense reindex (90,629 docs, 0 errors). This script must be re-run after any future script writes to `catalog_fitment_v2`, before the next Typesense reindex — nothing does this automatically yet.

## Phase 4 — Facet Alignment ✅ NON-ISSUE
Facets are Postgres-computed via same fitmentJoin + WHERE. No divergence.

## Phase 5 — display_subcategory Taxonomy ✅ COMPLETE

All 20 categories mapped. Subcategory facets live in Typesense.

### ✅ Session 74 — category rebuild (2,028 null-category gap closed) + tier-3 `display_subcategory_detail`

**Category-level rebuild.** `taxonomy_v2_plan.md` (a plan drafted in a prior chat session without DB access) flagged that `display_category` assignment had never been fully deterministic — root-cause query confirmed all 2,028 active products with `display_category IS NULL` mapped cleanly onto raw `category` values already covered by the plan's mapping table (mostly WPS "Covers,"/blank + PU blank), no new bucket needed. Built `scripts/ingest/rebuild_display_category_v2.mjs` with the established shadow-column safety pattern (`display_category_v2` populated first, dry-run diff reviewed, `--promote` as a separate explicit step). Scope was deliberately narrowed after the first dry-run showed a blind full recompute would silently overwrite thousands of already-correct rows (logic for those non-null assignments predates this session and isn't visible to a static rule table) — final script only touches: the 2,028 null rows, `SADDLEBAGS` (confirmed bug, was landing in `Seating`, now `Luggage & Racks`), `TANK`/`TANK GROUP-GAS AND OIL` (2-way gas/oil split replacing a messy 3-way one), and the two decisions below. Promoted live: **0 products with NULL `display_category` remain** (was 2,028).

**Two decisions (matching filter_roadmap's existing subcategory conventions, so no behavior change from the shopper's perspective):**
- Kickstands (split Foot Controls/Frame & Hardware) → single home, **Foot Controls**
- Gas Caps & Petcocks (split Carburetion & Fuel/Fenders & Body) → single home, **Fenders & Body**

**Tier-3 `display_subcategory_detail`.** Per `taxonomy_v2_plan.md` §7 — a third flat column following the exact convention of `display_category`/`display_subcategory` (flat CASE-mapped, its own Typesense facet), added for the 37 subcategories that cleared `tier3_candidate_finder.sql`'s >700-row threshold (a single facet doing too much work). Every split was built from real product-name prefix-mining, not guessed, and only shipped where each bucket cleared the plan's ~50-100-row stopping rule; buckets under that were folded or left flat rather than forced. Coverage varies a lot by subcategory on purpose — some are named by function (Pistons & Cylinders: 98% classified) and split cleanly; others are named by brand/style-line (Seats, Grips, Handlebars) and only partially classify, which is the correct outcome, not a bug (see `tier3_final_mappings.sql` for the full evidence trail and exact query per subcategory). Full list of 37 subcategories and their split buckets: `tier3_final_mappings.sql`. Two real classifier bugs were caught and fixed mid-pass: `\b` word-boundary regex silently failing before symbol-prefixed values like `+0.005"`, and "crankcase" substring-matching the "crank" check before its own (Engine > Bottom End). New column populated for **36,350 of 76,491 eligible products** (rows with both `display_category` and `display_subcategory` set); the remainder legitimately fall to the flat/no-detail state.

**UI wiring** — first 3-level nested filter in the codebase, extending the existing category→subcategory pattern exactly:
- `lib/db/browse.ts` — `subcategoryDetail` filter param, `subcategory_detail` WHERE tag, `detailFacetSql`/`whereNoDetail` facet query, `facets.subcategoryDetails` in `BrowseResult`
- `app/api/browse/products/route.ts` — `subcategory_detail` URL param parsed into `BrowseFilters`
- `app/browse/page.jsx` — `subcategory_detail` filter state, cascades to clear on category/subcategory change
- `components/browse/FilterSidebar.jsx` — new "Detail" section, indented under Subcategory, auto-opens when a subcategory is selected, gated on `filters.display_subcategory && subcategoryDetails.length > 0`
- `scripts/ingest/index_unified.js` — `display_subcategory_detail` facet field added to Typesense schema (required `--recreate`, not a plain upsert)

Verified end-to-end via a direct Typesense facet query post-reindex — `display_subcategory_detail` facet counts for Cables & Lines matched the SQL-verified numbers exactly (Clutch Cables 1,443 / Throttle & Idle Cables 1,147 / Handlebar Cable Kits 1,036 / Brake Line Kits 416 / Speedometer Cables 63).

**Separately, a tier-2 subcategory merge:** "Windshield Hardware & Parts" (267 products — trigger-lock mounts, mounting kits, bracket hardware) merged into "Windshields" per a direct call — it was legitimately windshield-related but split into its own bucket for no strong reason. `Fenders & Body > Windshields` now 1,174 products.

### Final Coverage

| Category | Subcategories | Coverage | Notes |
|----------|--------------|---------|-------|
| Instrumentation | Speedometers · Gauges · Dash & Trim | 96.5% | |
| Fenders & Body | Windshields · Gas Tanks · Fenders · Gas Caps & Petcocks · Fender Parts & Accessories · Windshield Hardware & Parts · Fairings | 95.9% | Gas Tanks moved from Carb |
| Carburetion & Fuel | Air Cleaners & Filters · Carburetors & Jets · Fuel Lines & Pumps · Fuel Injection · Throttle & Cables · Intake Manifolds | 95.8% | Oil System moved to Trans |
| Lighting | Turn Signals · Auxiliary Lighting · Bulbs · Taillights · Headlights · License Plate Lighting · Lighting Controls | 95.3% | |
| Seating | Seats · Seat Hardware · Backrests · Seat Pads & Covers | 95.0% | |
| Handlebar & Controls | Cables & Lines · Handlebars · Risers & Clamps · Levers & Controls · Mirrors · Grips · Throttle & Accessories · Switches & Wiring | 94.9% | |
| Transmission & Clutch | Clutch Plates & Kits · Transmission Internals · Oil System · Trans Covers & Cases · Sprockets · Belts & Pulleys · Drive Chains & Kits · Kickstarters & Hardware · Primary Drive | 94.8% | Oil System moved in from Carb |
| Brakes | Brake Lines & Hoses · Rotors & Drums · Brake Pads & Shoes · Calipers · Brake Hardware · Master Cylinders · Brake Conversion Kits | 94.3% | |
| Luggage & Racks | Sissy Bars · Saddlebags · Bags & Packs · Luggage Racks · Luggage Parts | 93.3% | |
| Exhaust | Exhaust Systems · Mufflers · Headers & Pipes · Exhaust Parts | 93.1% | |
| Foot Controls | Footpegs · Shifters · Floorboards · Kickstands · Highway Bars & Pegs · Forward Controls · Brake Pedals · Rearsets & Mid Controls | 92.9% | |
| Security & Covers | Security · Bike Covers · Shelters & Storage | 92.8% | |
| Wheels & Tires | Wheels · Axles & Spacers · Tires & Tubes · Hubs & Spokes · Bearings & Seals · Valves & Balancing | 92.2% | |
| Electrical | Ignition · Wiring & Harnesses · Charging & Alternators · Switches & Controls · Starters & Solenoids · Batteries · Audio & Communication · Horns | 92.1% | |
| Engine | Gaskets & Seals · Pistons & Cylinders · Cams & Valvetrain · Engine Covers · Heads & Valves · Bottom End · Oil Pumps & Lubrication · Motor Mounts · Complete Engines · Performance Kits | 91.2% | |
| Suspension | Shocks & Springs · Fork Tubes & Internals · Triple Trees & Stems · Fork Lowers & Sliders · Swingarms · Fork Seals & Boots · Lowering & Lift Kits | 87.8% | |
| Frame & Hardware | Hardware & Fasteners · Frame Parts · Kickstands · Body Panels · Protection | 87.5% | |
| Tools & Chemicals | Tools · Chemicals & Lubricants · Cleaners & Detailing | 71.3% | WPS abbreviations limit coverage |
| Riding Gear & Apparel | Helmets · Gloves · Jackets & Vests · Pants & Base Layers · Footwear · Accessories | 65.2% | Off bento grid; WPS abbreviations |
| Accessories & Misc | Books & Manuals · Trailer & Towing · Decals & Emblems · Tie-Downs & Transport · Cooling Systems | 6.1% | Catch-all by design |

### Key taxonomy decisions
- Gas Tanks & Caps → Fenders & Body (gas tanks are bodywork, not fuel system)
- Oil System → Transmission & Clutch (lubrication is drivetrain maintenance)
- Intake Manifolds + Throttle & Cables → split from Carburetors & Jets
- Brake Hardware → new subcategory (pedals, levers, springs not fitting existing buckets)
- Kickstands → in Foot Controls (where rider interacts with them)
- ~2,000+ misclassified VTwin products relocated to correct categories during cleanup passes

### Mapping approach (proven — for future use)
1. `SELECT subcategory, COUNT(*) FROM catalog_unified WHERE display_category = 'X' AND source_vendor = 'PU' GROUP BY subcategory ORDER BY count DESC`
2. Design 4–10 subcategory taxonomy
3. DRY RUN SELECT with CASE → GROUP BY source_vendor, mapped_subcategory
4. Review + fix gaps
5. `BEGIN; UPDATE ...; COMMIT;` — `WHERE display_category = 'X' AND is_active = true`
6. Verify, iterate on blanks with name-based diagnostic query
7. Reindex

---

## OEM Pipeline ✅ COMPLETE
catalog_oem_crossref is single source of truth. product_id FK added. Unique index on (sku, oem_number).
OEM supersession chain: oem_supersession table (**485 pairs** — 283 original inferred + 202 vtwin hardware added session 59) + mv_oem_fitment_coverage (683K rows, refreshed session 65). Recursive forward+backward chain traversal. browse.ts pre-fetches chain IDs when year+model set.

⚠️ oem_supersession schema note: `from_oem_norm`/`to_oem_norm` are **GENERATED columns** — do not include in INSERT statements.

**Session 60 additions to catalog_oem_crossref:**
- vtwin_scrape: +5,511 rows (import_vtwin_oem_crossref.mjs)
- HD_OEM battery: +63 rows (import_battery_oem_crossref.mjs)
- Total: **65,434 rows**

**Session 65 — OEM fitment data quality fix:**
Two systemic bugs in the OEM fitment pipeline discovered and fixed:

1. **Noise rows eliminated** — `build_oem_fitment_all.mjs` Python extractor now skips rows where `description ~ '^\d{4}$'` (year annotations grabbed as part descriptions). 130,621 rows removed; oem_fitment: 441,416 → 315,427 rows.

2. **Universal promotion family-scoped** — `promote_oem_fitment.mjs` PATH_A/B/C_UNIVERSAL now JOIN `harley_families` and filter by `oem_fitment.catalog_family`. A Softail catalog's `{ALL}` rows now expand to Softail models only, not V-Rods/Shovelheads/Trikes. `catalog_family` column added to `oem_fitment` table.

Universal row reduction: `oem_catalog_hd_universal` −75% | `oem_crossref_vtwin_universal` −69% | `oem_crossref_fatbook_universal` −70%.

catalog_fitment_v2: 6,369,578 → **5,126,957 rows** (1.24M rows removed were wrong).

**Session 72 — orphaned crossref recovery + junk cleanup + oem_numbers[] consolidation:**

Found `catalog_oem_crossref` had **17,150 rows with `product_id IS NULL`** — ~25% of the table, completely unreachable by the PDP OEM tab or `browse.ts`'s OEM search. Priority-ordered linking (exact/normalized sku → VT- prefix → exact/normalized vendor_sku → oem_number-in-array, most-specific first, only assigns when exactly one candidate resolves) recovered **15,192 rows (98.5% of non-eastern orphans)**. `eastern` source rows (1,729) only ~5% recoverable — accepted gap.

Also deleted 87 junk rows (single/double-character garbage like `"5"`, `"N"`, `"."` — some already live on real PDPs via the OEM tab). Confirmed `"+N"`-suffixed values (e.g. `"38607-87A +6"`) are legitimate manufacturer size/length specs, not junk — don't filter these.

Closed both directions of the `oem_numbers[]` ↔ crossref consolidation gap: 9,257 products got crossref data merged into their flat array (additive, not overwrite); 6,695 new crossref rows backfilled from flat-array data that had never been recorded in crossref at all. Full details: HANDOFF_LOG.md "SEVENTY-SECOND PASS".

---

## Open Issues

| Layer | Issue | Status |
|-------|-------|--------|
| Browse query | Engine+Dyna composite index | ✅ Added session 47 |
| Framer Motion | Transparent animation errors | ⏳ FRAMER_TRANSPARENT_FIX.md ready, not applied |
| Model codes | FLHRX + FLI missing | ✅ Both added session 47 |
| Model codes | 6 new 2026 codes added (session 59) | ✅ FLHXL, FLHXLSE, FLHXSTSE, FLHLT, FLHLTSE, RA1250L |
| Typesense | **Search now properly wired (session 67)** | ✅ route.ts calls Typesense server-side; fitment_text field added; --recreate reindex 89,151 docs 0 errors |
| Typesense | No reindex automation | 🔵 Future |
| display_subcategory | Accessories & Misc 94% NULL | Accepted — catch-all by design |
| Browse ?category= param | Sticky URL bug | ✅ Fixed session 57 |
| OEM number search | Not searching OEM arrays | ✅ Fixed session 57 (unnest ILIKE) |
| browse.ts ILIKE | Zero results for multi-word model-name queries ("brake rotor street glide") | ✅ Fixed session 67 — 2-word threshold for 3+ word queries |
| Softail + Suspension + Triple Trees filter | Untested since session 51 | ⏳ Retest |
| VTwin fitment | Additional ~4,035 on-site products with no fitment | 🔵 Low priority — marginal improvement |
| VTwin attributes | Stringified JSON in product_details | ✅ Fixed session 60 at source; PDPTabs workaround removed |
| VTwin OEM crossref | ~12,265 scraped OEM numbers not in crossref | ✅ Fixed session 60 — 5,511 rows imported |
| OEM fitment noise rows | 130,621 year-annotation rows in oem_fitment | ✅ Fixed session 65 — filter added to build_oem_fitment_all.mjs |
| OEM fitment universal bleed | {ALL} rows crossing family boundaries | ✅ Fixed session 65 — promote_oem_fitment.mjs universal paths family-scoped |
| OEM part timeline | Feature unbuilt | ✅ Built session 67 — oem_part_timeline table (32,570 rows), OemPartTimeline.jsx PDP component |
| catalog_unified flat fitment columns | 0% populated catalog-wide — Typesense facets/fitment_text blind to catalog_fitment_v2 data | ✅ Fixed session 68 — sync_fitment_flat_columns.mjs, 45,659 products synced, reindexed |
| catalog_oem_crossref | Eastern crossref (4,832 rows) never linked to any product since session 64 import | ✅ Fixed session 68 — linked via oem_numbers[] instead of sku, 3,103 rows |
| harley_models | 3 true duplicate Dyna rows (FXDX/FXDFSE/FXDSE) + 5 redundant generic era-bucket rows inflating catalog_fitment_v2 with redundant rows | ✅ Fixed session 68 — merged/removed, era_* flags backfilled first |
| Typesense schema | `canonical_sku` missing from index — cart items had no way to resolve `canonical_products.canonical_sku`, blocking checkout entirely | ✅ Fixed session 69 — `index_unified.js` now LEFT JOINs canonical_products; field added to schema; `--recreate` reindex 90,629 docs, 0 errors, verified live on a real hit |
| app/api/products/route.ts | Third product-fetching path (used by brands page) — unknown whether it has the same `canonical_sku` gap as /api/search | ✅ Fixed session 71 — confirmed real gap (this route uses a separate Postgres-only path via `browseProducts()`, not Typesense, so session 69's fix never reached it). `lib/db/browse.ts` now LEFT JOINs canonical_products and selects `canonical_sku`; `route.ts`'s `mapLegacyProduct()` now returns `canonicalSku`. PDP confirmed unaffected — separate inline query, already correct. |
| catalog_oem_crossref | 17,150 rows (~25% of table) had `product_id IS NULL` — completely unreachable by PDP OEM tab or browse.ts OEM search | ✅ Fixed session 72 — priority-ordered linking recovered 15,192 (98.5% of non-eastern orphans); eastern's 1,641 unmatched accepted as gap |
| catalog_oem_crossref | 87 junk values (single/double-char garbage) live in the table, some reachable via PDP OEM tab | ✅ Fixed session 72 — deleted; "+N" suffix values confirmed legitimate, not touched |
| catalog_unified.oem_numbers[] | Out of sync with catalog_oem_crossref in both directions (crossref-has-data-array-doesn't, and array-has-data-crossref-doesn't) | ✅ Fixed session 72 — 9,257 products merged (array gap), 6,695 crossref rows backfilled (crossref gap) |
| harley_model_years | 56 rows across 14 model codes had fabricated years through 2030 — impossible, attached real fitment to 778 products | ✅ Fixed session 72 — deleted, 3,536 catalog_fitment_v2 rows removed, flat columns re-synced, reindexed |
| harley_model_years | Same 14 codes show flat/constant row counts even in the technically-possible 2024-2026 range — may be more contamination pre-dating the confirmed 2027-2030 bug | ⏳ Needs Laken's production-year domain review, not a query |
| Browse grid dedup (Fender Seat Washer) | Grid showed a "10 OPTIONS" badge on one card plus 4 stray duplicate cards for what should have been one 14-way grouped product | ✅ Fixed session 73 — root cause traced to `build_variant_groups.cjs`'s Color regex (missing `pink`/`burgundy`, uncaptured `bright`/`dark` modifiers), not a `browse.ts`/`DEDUP_KEY` bug (investigated and ruled out); verified all 14 rows now share `variant_group_id = 42068` |
| display_category | 2,028 active products had `display_category IS NULL` — a real gap, not an intentional catch-all | ✅ Fixed session 74 — `rebuild_display_category_v2.mjs`, shadow-column safety pattern, 0 nulls remain |
| display_subcategory_detail (tier-3) | No third tier existed below Category → Subcategory — 37 large subcategories had a single facet doing too much work | ✅ Built session 74 — new column + Typesense facet + full FilterSidebar/browse.ts UI wiring; 36,350 products classified |
| catalog_variant_groups | Many genuine variant pairs (color/finish/side/size) were never grouped — classifier had several real gaps (Color/Finish axis-name mismatch, WPS "umbrella" product-line IDs bundling many unrelated fitments, symbol-prefixed values like `+0.005"` failing `\b` word-boundary matching, missing vocabulary for smoke/tinted/side/abbreviated colors, and an overly-blunt "kit"/"assembly" exclusion heuristic blocking 14,784 legitimate single-product names) | ✅ Fixed session 74 — see ROADMAP.md Phase 7 for full detail; total groups grew from 2,907 → 6,605 |

---

*Filter Roadmap — Last updated July 7, 2026 · Session 75 (see HANDOFF_LOG.md "SEVENTY-FIFTH PASS" for full session detail)*
