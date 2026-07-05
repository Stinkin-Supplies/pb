# Stinkin' Supplies — Filtering System Roadmap
**Created:** June 5, 2026 · **Last Updated:** July 3, 2026 (Session 69)
**Scope:** browse.ts · FilterSidebar · Fitment data · Typesense facets · display_subcategory taxonomy

---

## Status: COMPLETE ✅

All filter architecture phases complete. display_subcategory taxonomy complete across all 20 categories.

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

### ⚠️ Session 68 — critical facet-pipeline fix: flat fitment columns were never populated

`catalog_unified.is_harley_fitment`, `fitment_year_start/end`, `fitment_hd_families`, `fitment_hd_models`, `fitment_hd_codes`, `fitment_year_ranges` — the columns Typesense actually indexes for fitment facets and `fitment_text` search — were **0% populated across the entire 97,277-row table**, despite `catalog_fitment_v2` (the real join-table source) having data for 45,659 of those products going back years. Only `/era/[slug]` and the by-model browse API queried `catalog_fitment_v2` directly; everything else (main product API, Typesense) showed zero fitment info catalog-wide until this session.

Fixed via new **`scripts/ingest/sync_fitment_flat_columns.mjs`** (idempotent aggregation from catalog_fitment_v2) — synced all 45,659 products, followed by a full Typesense reindex (90,629 docs, 0 errors). This script must be re-run after any future script writes to `catalog_fitment_v2`, before the next Typesense reindex — nothing does this automatically yet.

## Phase 4 — Facet Alignment ✅ NON-ISSUE
Facets are Postgres-computed via same fitmentJoin + WHERE. No divergence.

## Phase 5 — display_subcategory Taxonomy ✅ COMPLETE

All 20 categories mapped. Subcategory facets live in Typesense.

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
| app/api/products/route.ts | Third product-fetching path (used by brands page) — unknown whether it has the same `canonical_sku` gap as /api/search | ⏳ Unconfirmed as of session 69 — first check next session |

---

*Filter Roadmap — Last updated July 3, 2026 · Session 69 (see HANDOFF_LOG.md "SIXTY-NINTH PASS" for full session detail)*
