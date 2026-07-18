# STINKIN' SUPPLIES — PROJECT ROADMAP
**Last Updated: July 18, 2026 (Session 90)**

---

## ✅ PHASE 1 — FOUNDATION (Complete)

| Item | Status |
|------|--------|
| Stack: Next.js 15 / Postgres (Hetzner 5.161.100.126) / Typesense / Vercel | ✅ |
| Three vendor staging tables: pu_catalog, wps_catalog, vtwin_catalog | ✅ |
| catalog_unified — single source of truth (**90,607 active rows**, down from 90,629 — 41 PU/WPS in-store display fixtures deactivated session 75, 2 filler-hose rows deactivated session 85) | ✅ |
| Internal SKU taxonomy (17 prefixes: ACC, BDY, BRK, DRV, ELC, ENG, EXH, etc.) | ✅ |
| harley_families / harley_models / harley_model_years (**347 models, 3,290 year rows** — audited session 59; +28 gap rows session 61; 3 duplicate Dyna models merged + 6 redundant generic-bucket rows removed session 68) | ✅ |
| Typesense schema + index (**90,629 docs, 0 errors** — reindexed session 68) | ✅ |

---

## ✅ PHASE 2 — FITMENT INFRASTRUCTURE (Complete)

| Item | Status |
|------|--------|
| catalog_fitment_v2 as canonical fitment table (model_year_id FK) | ✅ |
| JW Boon NOS import (348K rows) | ✅ |
| PU fitment pipeline (pu_fitment → pu_fitment_parsed → pu_fitment_expanded, 1.67M rows) | ✅ |
| WPS fitment via taxonomyterms API (702K rows) | ✅ |
| VTwin fitment rounds 1+2+3 (501K original + ~86,833 new from parse_vtwin_fitment_raw.mjs) | ✅ |
| **EBC brake fitment — 3,005 net-new rows** (source='ebc_catalog', session 60 via import_ebc_fitment.mjs) | ✅ |
| Era boolean columns on catalog_unified (era_flathead → era_milwaukee8) | ✅ |
| catalog_fitment_v2 composite indexes (product_id+model_year_id, reverse) | ✅ |
| `confidence_score` column EXISTS on catalog_fitment_v2 — safe to include in INSERTs (older rows NULL) | ✅ |
| **VTwin fitment coverage: 55.8%** (21,390 products) — up from 41.1% (15,741) | ✅ |
| PU fitment coverage: ~49% — ceiling reached, no new feed available | ✅ |
| WPS fitment: 41% — correct as-is (non-HD/universal products confirmed) | ✅ |
| EBC brake products: ~89% fitment via ebc_catalog source | ✅ |
| Vintage model codes (Flathead, Knucklehead, Panhead, Shovelhead, Ironhead, police, CVO, V-Rod) | ✅ |
| FLHRX + FLI model codes added | ✅ |
| FXBFS typo corrected to FXFBS in vtwin_scrape_data | ✅ |
| **`parse_vtwin_fitment_raw.mjs`** — re-parses fitment_raw from vtwin_scrape_data; ~86,833 rows inserted | ✅ |
| **`scrape_vtwin_missing.mjs`** — GraphQL url_key discovery + HTML FITS scrape for 12,398 never-scraped VTwin SKUs; 99% hit rate; upserts vtwin_scrape_data | ✅ |
| **Eastern Motorcycle Parts crossref (4,832 rows) linked to products for the first time** — 0 → 3,103 linked via oem_number = ANY(oem_numbers[]); 606 products gained fitment (session 68) | ✅ |
| **PU brand-file XML corpus mined for fitment** — all 133 brand XMLs; 42 products / 1,148 rows (session 68) | ✅ |
| **Colony Machine 2026 catalog mined for fitment** — Kit Application Index tables; 84 products / 7,887 rows (session 68) | ✅ |
| **GMA Engineering (PU brand) — 3 forward-control SKUs fitted, 27 correctly flagged is_universal instead of guessed** (session 68) | ✅ |
| **catalog_unified flat fitment columns synced catalog-wide for the first time** — was 0% populated (0/97,277); now 45,659 products synced via new `sync_fitment_flat_columns.mjs` (session 68) | ✅ |
| **Fitment/OEM catalog-wide health audit** (session 72) — `audit_fitment_oem_health.mjs`: confirmed coverage at known ceilings (no regression), confirmed flat-column drift at zero since session 68 | ✅ |
| **Impossible future model years bug found + fixed** (session 72) — 56 `harley_model_years` rows (14 model codes: FL, FLI, FLST, FLT, FXSB, FX, FLHXXX, XLH, XLS, XLC, FLHTC, FLH, FLTRX, FLTRS) had fabricated years through 2030; deleted along with 3,536 `catalog_fitment_v2` rows affecting 778 real products; flat columns re-synced, reindexed | ✅ |
| **Suspected pre-2027 data contamination on same 14 codes** — `FLHTC`/`FLH`/`FLI`/`FLTRS`/`FLST`/`FL` show non-organic flat row counts (identical for 6+ consecutive years) even in the technically-possible 2024–2026 range | ⏳ Needs domain review, see Open Issues |

---

## ✅ PHASE 3 — OEM & CATALOG ENRICHMENT (Complete)

| Item | Status |
|------|--------|
| catalog_oem_crossref — FatBook/OldBook PDFs + VTwin PDF | ✅ |
| product_id FK backfilled | ✅ |
| PU XML enrichment pipeline (catalog_media, features, dimensions) | ✅ |
| OEM cleanup: 4,122 PU catalog numbers removed from crossref | ✅ |
| **VTwin OEM crossref — 16,752 rows** (from vtwin_catalog.oem_numbers import) | ✅ |
| **WPS OEM crossref — 2,491 rows** (1,665 from wps-cross-fitment.csv + 826 from WPS/HardDrive 2026 catalog pp.1091–1104) | ✅ |
| **PU OEM crossref — 15,330 rows** (source=PU_PIES, OSP supplier numbers from brand XML) | ✅ |
| **VTwin scrape OEM import — 5,511 rows** (source='vtwin_scrape', session 60 via import_vtwin_oem_crossref.mjs) | ✅ |
| **HD_OEM battery crossref — 63 rows** (7 H-D OEM battery SKUs → 64 BCI-matched catalog products, session 60) | ✅ |
| **HD_OEM handlebar crossref — 2 rows** (56569-86 + 56082-83 already in crossref from OldBook; 3 stock-only OEMs not in catalog) | ✅ |
| **Total catalog_oem_crossref: 65,434 rows** (pre-session 64) | ✅ |
| **Eastern Motorcycle Parts crossref — 4,832 rows** (oem_manufacturer='EASTERN'; 4,364 unique HD OEM#s; 1911–present coverage; session 64 via import_eastern_crossref.mjs) | ✅ |
| **Total catalog_oem_crossref: 70,329 rows** | ✅ |
| **Eastern crossref linked to product_id for the first time** — 0 → 3,103 rows, via oem_number = ANY(cu.oem_numbers[]) instead of sku (Eastern's own catalog numbering doesn't match vendor_sku); session 68 via backfill_eastern_crossref_fitment.mjs | ✅ |
| OEM badge on PDP sourced only from catalog_oem_crossref (catalog numbers excluded) | ✅ |
| **WPS/HardDrive 2026 OEM crossref** — 826 product→OEM pairs imported from pp.1091–1104; 272 WPS# missing from wps_catalog (Kibble White, Diamond Chain, Carlisle, Alto specialty lines) | ✅ |
| **VTwin 2026 hardware supersession** — 202 old→new H-D OEM pairs in oem_supersession (source='vtwin'); vintage hardware format (nuts, bolts, washers, cotter pins, lock washers) | ✅ |
| pack_qty column — **2,171 active non-kit products with pack_qty > 1** | ✅ |
| scan_pack_qty_from_names.mjs — 12 auto-apply patterns; 254 corrections | ✅ |
| is_kit column — kits excluded from OEM matching | ✅ |
| **product_details JSONB column** — GIN index; **~59,253 populated (~66.5%)** — VTwin attributes fixed session 60 | ✅ |
| build_product_details.mjs — normalizes PU features + WPS HTML→bullets + VTwin description/pdp_payload. VTwin now JS-based (session 60); handles stringified attributes + extra_attributes fallback | ✅ |
| **extract_pu_images.mjs** — 133 brand XML files; 33,740 catalog_media rows; 8,828 PU descriptions; 15,330 OEM entries | ✅ |
| **ProductImageGallery.jsx** — multi-image thumbnail strip; reads catalog_media.all_urls (PU) or cu.image_urls (VTwin) | ✅ |
| PU image-proxy route — fflate-based, edge-compatible, Referer-spoofing for LeMans zips | ✅ |
| PU image-proxy persistent cache | ⏳ Zero server-side caching — needs Blob/S3/R2 before full browse-grid traffic |
| sku_counter table — created and seeded (24 prefixes) | ✅ |
| **oem_supersession table** — **485 pairs** (283 original inferred confidence=1 + 202 vtwin hardware session 59); normalize_oem() function; from_oem_norm/to_oem_norm are GENERATED columns | ✅ |
| **mv_oem_fitment_coverage** — 683K rows; recursive forward+backward chain traversal | ✅ |
| oem_supersession_review view — inferred confidence=1 pairs pending human review | ✅ |
| **ebc_brake_fitment staging table — 528 rows** (14 H-D families, EBC 2026 catalog, session 60) | ✅ |
| **hd_battery_fitment staging table — 22 rows** (7 H-D OEM battery SKUs × model/year fitment, session 60) | ✅ |
| **hd_handlebar_specs staging table — 89 rows** (OEM handlebar dims per model/year 2002-2013, session 60) | ✅ |
| **bike_specs table — 1,288 rows** (DS FatBook 2026 + OldBook 2026; battery/plugs/belt/chain/sprockets/tires/shock per model+year; UNIQUE(model_year_id, source); session 61 via import_bike_specs.mjs) | ✅ |
| **catalog_oem_crossref junk cleanup** (session 72) — 87 rows deleted (single/double-character garbage values like "5", "N", ".", "35" that were live on real PDPs via the OEM tab); confirmed "+N" suffix values (e.g. "38607-87A +6") are legitimate manufacturer size/length specs, not junk | ✅ |
| **catalog_oem_crossref orphaned-row recovery** (session 72) — found 17,150 rows (~25% of table) with `product_id IS NULL`, completely unreachable by any UI. Priority-ordered linking (exact/normalized sku, VT- prefix, exact/normalized vendor_sku, oem_number-in-array) recovered 15,192 (98.5% of non-`eastern` orphans). `eastern` source (1,729 rows) only ~5% recoverable — accepted gap, consistent with session 68's finding that Eastern's numbering doesn't map to anything else available | ✅ |
| **catalog_unified.oem_numbers[] ↔ catalog_oem_crossref consolidation** (session 72) — `sync_oem_numbers_from_crossref.mjs` merged crossref data into 9,257 products' flat array (additive union, not overwrite); `backfill_oem_crossref_from_flat_array.mjs` inserted 6,695 new crossref rows recovered from flat-array data that had never been recorded in crossref at all. Both directions of the gap closed to near-zero. | ✅ |
| **Brand normalization applied live** (session 75) — `normalize_brands.sql`/`brandNormalizationMap.mjs` existed in draft form but had never been run against the live catalog or wired into the ingest pipeline. Live audit found 51 duplicate normalized-brand clusters (e.g. "ARLEN NESS"/"Arlen Ness" — 1,444 combined products); extended the mapping with 8 real gaps found by cross-checking the audit output (Champion, Kreem, Race Tech, RC Components, Three Bond, Timken, Fram, a Hiflofiltro casing variant). Built a real `generate_normalize_brands_sql.mjs` generator so the `.mjs`/`.sql` pair can't drift apart again. Ran live: 97,273 rows scanned, 51 clusters → 0 remaining. Wired `normalizeBrand()` into all 3 `merge_catalog_unified.js` insert points for durability. Final map: 242 raw strings → 154 canonical brands. | ✅ |
| **PU/WPS display-fixture exclusion — verified live, corrected the estimate, applied** (session 75) — a prior draft estimated 145 active PU items under the `9903-xxxx` SKU range from an offline CSV snapshot; live query found only 10. Broadened with a tight name-keyword regex applied to both vendors (not just WPS as originally scoped), verified against `dealer_price`/`msrp` to rule out false positives (real products like Dakota Digital gauges, Dynojet "Pod-300 Digital Display" correctly stayed active). Applied live: 41 rows soft-deleted (`is_active=false`, 15 PU + 26 WPS). Wired durably into `merge_catalog_unified.js` so it can't reappear on the next full rebuild. Typesense synced to match (see Phase 5 note below). | ✅ |

---

## ▶ NEXT UP — Chopper Supplies v2 audit (still the only unaddressed taxonomy queue item); a rebuild-durability gap now spans sessions 86-90

**Sessions 89-90 (July 17-18, 2026)** — a new phase of the taxonomy project: Laken now hands over *finalized* target subcategory specs (exact names given up front) one category at a time, rather than open-ended classification. Session 89 rebuilt **Handlebars & Hand Controls** and **Saddlebags, Sissy Bars & Luggage** onto finalized specs and established a new standing rule set from that work — the **"General bucket policy"** (see `feedback-general-bucket-policy` memory): (1) any subcategory bucket over ~150 rows gets `display_subcategory_detail` groupings, size alone is the trigger; (2) catch-all "General" buckets get renamed to something category-specific, never left generic; (3) the subcategory filter-sidebar list itself gets grouped (type-choices first, alphabetical, then the rest alphabetical) via a new `SUBCATEGORY_DISPLAY_GROUPS` config + `applySubcategoryGrouping()` in `lib/db/browse.ts`, opt-in per category. Session 88 rebuilt **Gaskets & Seals** using the actual H-D OEM parts-catalog section-number chart as ground truth, and fixed 3 Seating issues.

Session 90 picked up where that left off: **retroactively applied the General-bucket policy** to the three categories finished before it existed (Gaskets & Seals, Seating, Saddlebags/Luggage) — Seating's audit turned up its own unlabeled catch-all ("Seats," not one of Laken's 12 named buckets) plus 26 misfiled rows hiding inside it. Then three full category rebuilds on the new finalized-spec workflow: **Carburetion & Fuel → "Fuel, Air & Carburetors"** (8→15 subcategories, then 3 more follow-up promotions to 18 as Laken kept spotting more mixed-in content, plus a full-read "serious audit" of the General leftover that took it from 136 rows to 9 genuine stragglers — pushed to the admin review queue rather than left silent); **Foot Controls → "Foot Controls & Pegs"** (10→15, with "Highway Bars & Pegs" — not in the named spec — kept as-is per Laken's explicit call rather than dissolved); and **Engine** (18→17, keeping 3 extra buckets — Bottom End, Complete Engines, Cylinder Heads — for genuine engine content with no name in the 14-bucket spec, all confirmed with Laken per-gap rather than defaulted to General). The Engine rebuild also caught 241 brake-caliper/seat-spring rows that had been sitting in "Pistons & Cylinders" for who knows how long (an old classifier confused engine pistons/cylinders with brake-caliper pistons and master cylinders — same word, completely different part on a different system). Closed out with a cross-category sweep prompted by the pattern these rebuilds kept surfacing: Brakes' own "Brake Pedals & Pads" (140 rows, duplicating Foot Controls & Pegs' equivalent bucket) consolidated; a catalog-wide sensor sweep moved 76 real sensors into Electrical/Sensors & Switches; Cables got a full audit and 78 misfiled rows (security locks, USB cables, battery cables, whole clutch kits, throttle body kits, lever sets) moved to their correct homes. **Verified throughout: 90,483 active rows unchanged, 0 NULL category/subcategory, Typesense reindexed clean after every pass.** See HANDOFF_LOG "Session 90" (long — six-plus sub-passes) for full detail.

**⚠️ Rebuild-durability gap now spans sessions 86-90, not just 86**: none of this taxonomy work (86 through 90) is wired into `merge_catalog_unified.js`. All of it was one-off `UPDATE` statements against already-live data. A future TRUNCATE + reinsert rebuild will silently undo five sessions of category work unless it's ported into the ingest pipeline first, or a post-rebuild reconciliation snapshot/reapply step is built. This gap has been flagged every session since 86 and keeps growing — worth prioritizing before it gets any bigger.

**Session 86 (July 15, 2026)** — a different-shaped session: interactive SQL cleanup done live in chat with Laken (no `.mjs` audit/dry-run/apply scripts), 14 passes via `scripts/ingest/category_cleanup_20260714_part1.sql` through `_part14.sql`, each with its own backup table for full rollback. **Accessories & Misc and Security & Covers both dissolved to 0 rows** (their contents routed into Hardware, Covers & General and elsewhere); **Hardware, Covers & General then split into two new categories, `Hardware` and `Accessories & Gear`**, once it became clear 3,296 bolt-kit items and 1,798 unrelated accessory items didn't belong under one "general" name. Engine's two mega-buckets got broken apart: `Engine Parts` (733→29 items) turned out to be a full dumping ground — Ultima starter motors, ignition systems, carb rebuild kits, brake/wheel/exhaust/lighting parts, generic bolts, and lubricant products all routed to their real categories; `Engine Accessories` (1,041→2 items) was NOT miscategorized the same way — almost everything genuinely was an engine cover, just needed splitting into real subcategories (Cam Covers, Rocker Box Covers, Pushrod Covers, Engine Dress-Up Kits, Inspection Covers, Cooling System), with points/timing/ignition covers correctly redirected to Electrical and derby/primary covers to Transmission & Clutch per Laken's corrections. `Windshields & Fairings > Windshields` (1,242→933) got the same treatment (Windshield Hardware/Trim/Deflector Screens split out). Also found and fixed: a Transmission & Clutch "Oil System" subcategory that was actually misfiled engine oil-pump parts, and a "Clutch Cables & Components" subcategory that turned out to be three different product types mixed together. Final verified state: **90,483 active products, 22 categories, 167 subcategories, 0 NULL anywhere**. See HANDOFF_LOG "Session 86" for the full 14-pass breakdown.

**⚠️ New gap opened this session, flag before any future full rebuild:** none of session 86's category/subcategory logic is wired into `merge_catalog_unified.js` — these were one-off `UPDATE` statements against already-live data, not durable classification rules like sessions 74-81's brand normalization or display-fixture exclusion. A future TRUNCATE + reinsert rebuild will silently undo all of it unless this gets ported into the ingest pipeline or a post-rebuild reconciliation pass is built first.

**Session 85 recap (previous):** Chopper Supplies v2 audit was the only remaining open taxonomy item after session 85's 3-category consolidation (Fenders & Body → Tanks & Body, Suspension → Frames & Suspension, Frame & Hardware split 4 ways). See below for full detail — still not run as of session 86.

**Brakes is done** (session 78 rebuild + session 79 holdback cleanup) — see HANDOFF_LOG "NEXT SESSION: START HERE" for the 54 rows still deliberately held (34 confirmed wrong-category, 20 ambiguous lever-set SKUs).

**Tanks & Body is done** (session 79) — delivered as a new top-level category, broader in scope than the original "Tanks & Oil Filters" framing: 4,131 rows from `Fenders & Body` (retired down to 137 remaining rows), `Transmission & Clutch / Oil System`, `Carburetion & Fuel / Fuel Lines & Pumps`, and `Lighting`'s license plate rows. Also surfaced and fixed 117 windshield-product stragglers that never migrated into `Windshields & Fairings` when that category was split out (session 74).

**Dashes & Gauges is done** (session 80) — rebuild of `Instrumentation` in place, 1,340 rows across 7 subcategories, plus pulls from Fenders & Body/Accessories & Misc/Handlebar & Controls. 47 rows held back. See HANDOFF_LOG for full detail.

**Frames & Suspension is done** (session 80) — NEW third top-level category, 3,390 rows pulled from `Frame & Hardware` + `Suspension` (both left in place at the time) plus scattered stragglers. 3,069 rows held back. See HANDOFF_LOG. **Update session 85:** both source categories are now fully retired — `Suspension` merged entirely into Frames & Suspension (+ small pulls to Transmission & Clutch, Lighting); `Frame & Hardware` consolidated across Hardware Covers & General/Frames & Suspension/Tanks & Body/Foot Controls. Neither exists as a standalone category anymore.

**Cables is mostly done** (session 80) — turned out to already exist with 4,253 correctly-classified rows; this session was a straggler sweep, 617 rows moved in from 9 other categories. **⚠️ 307 rows need a follow-up correction pass** — they were applied into `Cables/Universal, Build Your Own` but are actually grip/throttle-sleeve products that got misrouted (pattern gaps: reversed word order, brand-only naming). Not a simple review-later item — these are live in the wrong subcategory now. **Still outstanding as of session 81 — not touched this session.**

**Footrests & Floorboards is done** (session 80) — turned out to be a straightforward rename of `Foot Controls`'s existing 4 subcategories, not a keyword rebuild. 2,282 rows renamed. `Kickstands` (278) and `Highway Bars & Pegs` (147) intentionally left unchanged — undecided whether they fold in or stay separate. 467 NULL-subcategory rows still need their own classification pass. **Still outstanding as of session 81.**

**Wheels, Tires & Axles is done** (session 81) — in-place taxonomy cleanup, zero cross-category migration needed (confirmed by audit — unlike every other category so far). 3,089 rows: 2 subcategories renamed, 4 left unchanged, 330/335 NULL rows classified. 5 rows held back (standalone tools: jump-starter pump, air compressor, reamer/plugger kits).

**Hardware, Covers & General is done** (session 81) — NEW top-level category, third of the three originally-named queue items. 589 rows across 9 subcategories, pulled from 15+ source categories, resolved through 7 dry-run rounds (the most iteration any category build has needed) — see HANDOFF_LOG for the full bug list (Postgres `\b` support, boundary punctuation, `CLUTCHES?` trailing-S trap). Merchandising subcategory added as a same-session follow-up (156 rows) after Laken corrected the original "retail display fixture" framing to "patches/stickers/gift sets/keychains."

**Chopper Supplies — audit only, not applied** (session 81) — first broad-vocabulary audit came back almost entirely false positive (see HANDOFF_LOG for detail: "Spool" mostly means dirt-track wheels not wire spools; "chopper"/"ape hanger"/"sissy bar" vocabulary mostly hit correctly-placed existing inventory, not misc items). Laken's scope correction: ONLY genuine bulk consumables (wire, paint, raw stock) qualify — dedicated chopper-build components stay where they are. A narrowed v2 audit script is drafted but **not yet run**.

**All three originally-named queue items now addressed** — 2 complete, 1 rescoped and awaiting its narrowed audit run.

**Full catalog health check completed** (session 81) — `audit_full_catalog_health.mjs`, requested by Laken: per-category row counts + NULL-subcategory counts/percentages + subcategory breakdowns + straggler samples, catalog-wide. Result: 90,609 active rows, 6,859 NULL subcategory (7.6%), heavily concentrated in a handful of categories rather than spread evenly — see HANDOFF_LOG for the full table. **`Accessories & Misc` confirmed as the single largest gap** (3,203 NULL, 80.6%) and picked first by Laken.

**Accessories & Misc reclassification — FULLY RESOLVED** (this doc wasn't updated between sessions 81-83; see HANDOFF_LOG for full detail). `fix_accessories_misc_taxonomy.mjs` ran across several more waves after session 81 (wave-4b, batch2, final batch) — all 3,203 original NULL rows resolved to 0 by session 83 (357 recategorized + 42 deactivated in the final hand-annotated batch).

**Riding Gear & Apparel** (1,760 NULL, 41.9%) is now the largest untouched gap once Accessories & Misc is resolved — not yet investigated.

---

## ✅ PHASE 4 — TAXONOMY (Complete)

| Item | Status |
|------|--------|
| display_category (**22 confirmed values, unchanged since session 86** — Gaskets & Seals + Cables added session 77; Windshields & Fairings was already live but never recorded here; Tanks & Body added session 79; Frames & Suspension added session 80, a genuine net-new category; Dashes & Gauges and Footrests & Floorboards are in-place rebuilds of existing categories, not net-new; Hardware, Covers & General added session 81, a genuine net-new category; Wheels & Tires is an in-place rebuild, not net-new. Session 85: `Fenders & Body`, `Suspension`, and `Frame & Hardware` all retired (merged into Tanks & Body, Frames & Suspension, and a 4-way split respectively) — net -3 categories. Session 86: `Accessories & Misc` and `Security & Covers` both dissolved to 0 rows; `Hardware, Covers & General` split into `Hardware` + `Accessories & Gear` — net -1 category. **Sessions 89-90: Handlebars & Hand Controls, Saddlebags/Sissy Bars & Luggage, Gaskets & Seals, Seating, `Carburetion & Fuel`→`Fuel, Air & Carburetors`, `Foot Controls`→`Foot Controls & Pegs`, and Engine all rebuilt onto finalized specs — renames/rebuilds only, net 0 category-count change, but subcategories grew 167→209** as large detail-groups got promoted to full subcategories under the new General-bucket policy) | ✅ |
| display_subcategory across all **22** display categories — **167 total subcategories**, verified live session 86 | ✅ |
| **All active categories at 0 NULL subcategories as of session 86** (Accessories & Misc, Riding Gear & Apparel, Frame & Hardware, Tools & Chemicals, Fenders & Body, Security & Covers, Seating, Foot Controls, Exhaust, Luggage & Racks, Wheels & Tires all resolved across sessions 83-84). Session 85: `Fenders & Body`, `Suspension`, and `Frame & Hardware` retired entirely as standalone categories. **Session 86: `Accessories & Misc` and `Security & Covers` also retired entirely** (dissolved into other categories rather than merged 1:1); `Hardware, Covers & General` split into `Hardware` + `Accessories & Gear`, both confirmed 0 NULL. Session 86 also broke apart two oversized undifferentiated single-subcategory buckets that weren't "NULL" but weren't real taxonomy either — Engine's `Engine Parts` (733→29) and `Engine Accessories` (1,041→2), plus Windshields & Fairings' `Windshields` (1,242→933) — see HANDOFF_LOG "Session 86" for full detail. Only remaining open taxonomy item: Chopper Supplies (0 rows, no scheme built) | ✅ |
| infer_vtwin_categories.mjs — VTWIN_CATEGORY_TO_DISPLAY map (28 source → 21 display); 566 products updated | ⚠️ **STALE, WORSENING** — map predates Cables, Gaskets & Seals (session 77), and now also Frames & Suspension (session 80, genuine net-new category). Next VTWIN import will route cable/gasket/frame-suspension products back into their old homes (Carburetion & Fuel, Transmission & Clutch, Engine, Frame & Hardware, Suspension). Must be updated before any re-import — flagged three sessions running now |
| generate_vtwin_skus.js — full rewrite; reads catalog_unified, display_category→prefix map, writes internal_sku directly | ✅ |
| Typesense reindexed with full subcategory facets | ✅ |
| **display_category rebuild — 2,028 null-category gap closed** (session 74) — `rebuild_display_category_v2.mjs`; scope deliberately narrowed to the 2,028 null rows + 2 confirmed structural bugs (SADDLEBAGS, TANK gas/oil split) + 2 decisions (Kickstands → Foot Controls, Gas Caps & Petcocks → Fenders & Body) after a full-recompute dry run showed it would silently regress thousands of already-correct rows | ✅ |
| **display_subcategory_detail — new tier-3 column** (session 74) — Category → Subcategory → Detail, added for the 37 subcategories clearing a >700-row threshold; every split evidence-based from real name-prefix mining, not guessed; 36,350 of 76,491 eligible products classified; full FilterSidebar/browse.ts/Typesense wiring shipped as the first 3-level nested filter in the codebase | ✅ |
| Windshield Hardware & Parts merged into Windshields subcategory (267 products) | ✅ Session 74 |
| **Seating category — full rebuild** (session 76) — hardware/pad/backrest miscategorization fixed (239 hardware → Seat Hardware with new Detail buckets, 11 pad rows → Seat Pads & Covers, 2 backrest rows → Backrests); `lib/db/browse.ts` sort-order bug fixed (`detail_priority` computed column, hardware no longer outranks real products under price-ascending default); 256,143 fitment rows backfilled via new name-extraction script; 166 products' fitment corrected (FL/FX combo miscode → Softail, was wrongly Touring+Dyna) | ✅ |
| **Nine taxonomy scripts shipped** (session 77) — Engine, Transmission & Clutch, Electrical, Lighting, Handlebar & Controls rebuilt in place; Carburetion & Fuel applied (was left at dry-run stage session 76); **Gaskets & Seals** and **Cables** created as new top-level categories. All nine now at zero null subcategories | ✅ |
| **Gaskets & Seals — NEW top-level display_category** (session 77) — `audit_gaskets_seals_scope.mjs` (read-only scoping first) → `fix_gaskets_seals_migration.mjs`. 4,242 rows migrated from Engine (3,030 + scattered name-matches), Transmission & Clutch, Suspension (`Fork Seals & Boots` wholesale), Wheels & Tires (name-matched *within* `Bearings & Seals` only — dry run 1 revealed the audit's "34 rows" was the seal-named subset, not the 238-row subcategory total, so moving it wholesale would have dragged 200 unrelated bearings), Exhaust. Brakes and Tools & Chemicals deliberately untouched | ✅ |
| **Cables — NEW top-level display_category** (session 77) — `fix_cables_taxonomy.mjs`. 4,395 rows from six categories (Handlebar & Controls 3,874, Carburetion & Fuel 229, Transmission & Clutch 196, Instrumentation 60, Accessories & Misc 29, Foot Controls 3, Frame & Hardware 3, Luggage & Racks 1). 8 subcategories; Detail on Cable & Line Kits and Cable Hardware. `LINE` = hydraulic, `CABLE` = mechanical, uniform across vendors. Brakes/Electrical untouched. **⚠️ Known live bug:** the `HOSE HYDRAULIC CLUTCH` raw-subcategory shortcut misfiles 9 rows named `Clutch Cable` as hydraulic lines — hand-corrected post-apply, script not yet patched | ✅ |
| **Brakes — within-category rebuild + holdback cleanup** (sessions 78–79) — `classify_brakes.mjs` (session 78): 797 rows across 8 subcategories, new **Brake Pedals & Pads** subcategory absorbing Foot Controls' "Brake Pedals" (119 rows) + Accessories & Misc sweep (246 rows). 96 rows deliberately held back (grab-bag WPS raw category mixing brake/clutch/shifter parts). Session 79 `classify_brakes_holdback.mjs` resolved 42 of those 96 (genuine brake parts, classifier gap only); 54 remain intentionally NULL — 34 confirmed wrong-category (clutch/shift/air-cleaner parts awaiting a real destination), 20 ambiguous lever-set SKUs Laken declined to auto-classify by sibling-pattern match | ✅ |
| **Tanks & Body — NEW top-level display_category** (session 79) — `fix_tanks_body_taxonomy.mjs`. Delivered as a 4-source migration, broader than the "Tanks & Oil Filters" queue name suggested: 4,131 rows from `Fenders & Body` (entire category, retired to 137 remaining rows), `Transmission & Clutch / Oil System` (~470 rows), `Carburetion & Fuel / Fuel Lines & Pumps` (~172 rows), `Lighting` (~358 license-plate-named rows, full category-name match including combo taillight units). 11 subcategories (10 from spec + Fender Parts & Accessories catch-all). Side effect: found and fixed 117 windshield-product stragglers stuck in `Fenders & Body` since before `Windshields & Fairings` was split out (session 74) — rerouted to their real existing home, not absorbed into Tanks & Body. 145 flagged + 39 excluded rows held back, same no-blanket-fallback principle as Brakes | ✅ |
| **Dashes & Gauges — in-place rebuild of Instrumentation** (session 80) — `fix_dashes_gauges_taxonomy.mjs`. 1,340 rows across 7 subcategories (Speedometers, Gauges, Dash & Panel, Housings, Gauge Hardware, Instrument Hardware, Decals & Trim), pulled from `Instrumentation` (full rebuild) + `Fenders & Body`/`Accessories & Misc`/`Handlebar & Controls` stragglers. Round-1 bug: `\y` (Postgres syntax) used in JS regex instead of `\b`, silently broke every boundary rule (33.5% coverage until fixed). 47 rows held back (Regulator Mount excluded on purpose — follows electrical, not gauges) | ✅ |
| **Frames & Suspension — NEW top-level display_category** (session 80) — `fix_frames_suspension_taxonomy.mjs`. NEW third category (not a merge at the time) — `Frame & Hardware` and `Suspension` both remained live as their own categories; 3,390 rows pulled from them plus scattered stragglers, across 7 subcategories. Three rounds of exclusion-list fixes after discovering `Frame & Hardware`'s "Hardware & Fasteners" subcategory is a cross-system fastener bin (brake/engine/transmission bolt kits, not frame-specific) — bare HARDWARE/SPRING/FORK/SHOCK fallbacks were sweeping these in until excluded by other-system noun (BRAKE/ROTOR/ENGINE CASE/etc). Settled at 52.5% coverage by design; ~3,069 rows correctly held back as genuine cross-system fasteners | ✅ |
| **Suspension — MERGED into Frames & Suspension, retired** (session 85) — `fix_suspension_frames_merge.mjs`. All 454 rows: Shocks & Springs → Rear Shocks & Lowering Kits, Fork Tubes & Internals → Forks, Triple Trees & Stems + Steering Stem Hardware → Triple Trees & Covers, Swingarms → Frame, Ride Control & Rear Support → Rear Shocks & Lowering Kits, Lowering & Lift Kits split (Trike Conversion Kits / Rear Shocks & Lowering Kits), Fork Lowers & Sliders split (Forks / 1 stray → Lighting), Dampers & Cush Drive split (Forks / 6 → Transmission & Clutch). Duplicate-check confirmed cross-vendor overlap, not true row-level dupes — pure subcategory mapping, no dedup needed | ✅ |
| **Frame & Hardware — CONSOLIDATED across 4 destinations, retired** (session 85) — `fix_frame_hardware_consolidate.mjs`. Only its "Hardware & Fasteners" subcat (1,896 rows, the same cross-system fastener bin flagged session 80) was a genuine duplicate of Hardware, Covers & General → merged there. Frame Parts (166) → Frames & Suspension/Frame; Body Panels (46) → Tanks & Body; Protection (40, engine guards) → Foot Controls/Highway Bars & Pegs; Kickstands (4) → Foot Controls/Kickstands. Final 2 held-back "FILLER HOSE" rows deactivated per Laken's call | ✅ |
| **Fenders & Body — MERGED into Tanks & Body, retired** (session 85) — `fix_fenders_body_merge.mjs`. Final 26 rows (Gas Caps & Petcocks, Gas Tanks) moved to Tanks & Body/Gas Tanks & Gas Caps. Duplicate-check found cross-vendor near-matches only, not true dupes; 2 internal PU near-duplicate pairs flagged but left as-is per Laken's call | ✅ |
| **Cables — straggler sweep, not a fresh build** (session 80) — `fix_cables_stragglers.mjs`. Cables already existed with 4,253 correctly-classified rows (a prior session's migration not fully reflected in project memory); this session found and moved 617 more stragglers from 9 other categories. **⚠️ 307 rows need a follow-up correction** — applied into `Cables/Universal, Build Your Own` but are actually misrouted grip/throttle-sleeve products (word-order and brand-only-naming pattern gaps), not simply awaiting review | ⚠️ **307-row correction owed** |
| **Footrests & Floorboards — in-place rename of Foot Controls** (session 80) — `fix_foot_controls_taxonomy.mjs`. Turned out to be a subcategory VALUE rename/consolidation, not a keyword rebuild — the 8 existing subcategories were already clean. 2,282 rows renamed: Forward Controls→Forward Controls & HW, Rearsets & Mid Controls→Mid-Controls, Floorboards→Floorboards & HW, Footpegs+Shifters (folded)→Footpegs, Shift Pegs, & HW. `Kickstands` (278) and `Highway Bars & Pegs` (147) left unchanged, undecided; 467 NULL rows untouched, need a separate pass | ✅ |
| **Wheels, Tires & Axles — in-place taxonomy cleanup** (session 81) — `fix_wheels_tires_axles_taxonomy.mjs`. Zero cross-category migration needed (confirmed by `audit_wheels_tires_axles_scope.mjs` — the only category this whole project where the scoping audit found no stragglers elsewhere). 3,089 rows: 2 subcategory renames, 4 unchanged, 330/335 NULL rows classified (98.5%). Tire-brand vocabulary (Metzeler, Firestone, Coker, Dunlop, Michelin, Shinko, Avon) needed since many tire rows carry no generic "tire" word. Two real bugs fixed: plural-boundary miss (`\bWHEEL\b` doesn't match "WHEELS"), and vendor-feed mid-word truncation ("...Wide Whitewal") requiring a stem match. 5 rows held back (standalone tools) | ✅ |
| **Hardware, Covers & General — NEW top-level display_category** (session 81) — `fix_hardware_covers_general_taxonomy.mjs` + `fix_merchandising_taxonomy.mjs`. 589 rows across 9 subcategories from 15+ source categories, resolved through 7 dry-run rounds — the most iteration any category build has needed. Two structural bugs found and fixed, both affecting every rule in the script: (1) patterns were JS `RegExp` objects using `\b`, sent to Postgres `~*` as raw strings — Postgres doesn't support `\b` at all, so every pattern silently matched nothing on the first audit (zero hits across all 9 groupings); fixed by using plain Postgres ARE strings with `(^|\s)`/`(\s|$)` boundaries directly, no JS-RegExp translation layer. (2) vendor names use `/` and `-` as word separators ("Holeshot/Brake"), so those boundaries needed widening to `(^|[\s/'-])`/`([\s/'-]|$)` — 67 occurrences fixed in one pass, plus a 4th hidden occurrence in a dynamically-built template literal the first bulk-replace missed. Exclusion list grew to ~50 terms across 7 rounds of Laken-confirmed real sample rows. Found the `CLUTCHES?` variant of the trailing-S bug family (matched plural, silently never matched the far-more-common singular). Merchandising subcategory (156 rows) added as a same-session follow-up after Laken corrected the original vocabulary (retail display fixtures → patches/stickers/gift sets/keychains); confirmed bare "V-TWIN" and bare "PIN" are both noise-dominated and excluded as signals entirely | ✅ |
| **Chopper Supplies — scoping audit only, not applied** (session 81) — `audit_chopper_supplies_scope.mjs` (broad, round 1) found the vocabulary was mostly wrong: "Spool" mostly means dirt-track spool-hub wheels not wire spools (confirmed via targeted follow-up pulling all 43 real "Spool" rows by name); "chopper"/"hardtail"/"springer"/"ape hanger"/"sissy bar" matched 1,669 rows that are almost entirely existing, correctly-placed inventory in other categories. Laken's scope correction: ONLY genuine bulk consumables (wire, paint, raw stock) qualify. `audit_chopper_supplies_scope_v2.mjs` drafted with narrowed vocabulary but **not yet run** | ⏳ Audit v2 drafted, not run |
| **Full catalog health check** (session 81) — `audit_full_catalog_health.mjs`, requested by Laken. Read-only, catalog-wide: per-category row counts, NULL-subcategory counts/percentages, subcategory breakdowns, straggler samples. Confirmed 6,859 NULL rows catalog-wide (7.6%), heavily concentrated rather than evenly spread — see table above | ✅ |
| **Accessories & Misc reclassification — FULLY RESOLVED, 0 NULL** (sessions 81-83) — `audit_accessories_misc_nulls.mjs` + `audit_accessories_misc_crossclassify.mjs` (discovery) → `fix_accessories_misc_taxonomy.mjs`, run across multiple waves through session 83. Confirmed this was a genuine cross-CATEGORY misplacement problem (not just missing subcategories, unlike every prior category). All 3,203 original NULL rows resolved: 357 recategorized + 42 deactivated in the final hand-annotated batch (session 83). See HANDOFF_LOG for full wave-by-wave detail | ✅ |
| **Category-level migration is a different script shape than within-category rebuilds** (session 77) — no blanket fallback (an unmatched row hasn't earned its way into a new category); name-level EXCLUDE guards, because a `display_category NOT IN (...)` filter is insufficient when out-of-scope products sit in the wrong category to begin with; a REROUTE stage moving mis-netted rows to their correct home in the same transaction; a read-only scoping audit before any classification logic is written | ✅ |
| **Exhaust category — full rebuild** (session 76) — 269 blank subcategories filled, 569 new Detail assignments on Exhaust Parts bucket (Heat Shields, Baffles, Clamps & Brackets, Wrap & Packing, O2 Sensors & Bungs, etc.); 838 total rows updated; 21 cross-category miscategorizations found and flagged (15 engine valves, 5 grips, 1 brake tool) | ✅ |
| **New project phase begins (session 87)** — Laken switches from open-ended classification to handing over *finalized* target subcategory specs one category at a time. Windshields & Fairings, Dashes & Gauges, and Tanks & Body remapped onto her specs (all clean renames/merges, minimal content ambiguity); stale admin `?admin=1` inline-edit category dropdown fixed (was hardcoded, missing 8 categories created since); 3 more categories same session (Frames & Suspension, Hardware, Accessories & Gear) — found Hardware's 3,163-row "Bolt Kits, Hardware Assortments" mega-bucket was hiding ~400 system-specific hardware kits belonging to 15+ other categories, same "big dumping ground" pattern as session 86's Engine Parts | ✅ |
| **Gaskets & Seals rebuilt using the actual H-D OEM parts-catalog section-number chart** (session 88) — `rebuild_gaskets_seals_taxonomy_v2.mjs`. Laken supplied the real Harley-Davidson OEM parts-book section numbers as ground truth (James Gasket reuses bare HD numbers as its own part numbers); used as primary classification signal, keyword rules as fallback where the chart's coarser ranges proved internally mixed. 4,250 rows, 7 subcategories | ✅ |
| **Handlebars & Hand Controls + Saddlebags/Sissy Bars & Luggage rebuilt onto finalized specs; standing "General bucket policy" established** (session 89) — see `feedback-general-bucket-policy` memory for the full rule set (>150-row detail-grouping, catch-all renames, `SUBCATEGORY_DISPLAY_GROUPS` sidebar grouping). Bug caught post-apply by Laken spot-checking the live site: whole-brand catch-all rules were checked before specific style keywords, silently swallowing 151 correctly-named rows — same "spot-check catches the bug" pattern as session 87. Tools & Chemicals also fully audited same session (on-bike toolboxes found misfiled in Tools; 4 oversized buckets promoted to standalone subcategories per the new >150 policy) | ✅ |
| **Retroactive General-bucket policy applied to the 3 categories finished before it existed** (session 90) — Gaskets & Seals, Seating, Saddlebags/Luggage all retrofitted with detail-groupings + renames + `SUBCATEGORY_DISPLAY_GROUPS` entries. Seating's audit found its own unlabeled catch-all ("Seats," not one of Laken's 12 named buckets) plus 26 misfiled rows (seat-post hardware, cushion pads) inside it | ✅ |
| **Carburetion & Fuel → "Fuel, Air & Carburetors," 8→18 subcategories** (session 90) — `rebuild_fuel_air_carbs_taxonomy.mjs` + follow-ups. Full reclassification of 4,550 rows onto Laken's 15-name spec, then a full-read audit of the "General" leftover (136→9 rows after two rounds — a first regex pass alone would have stopped at 511/121, not the real floor) plus 3 more subcategory promotions (Air Cleaner Inserts & Covers, Complete Air Cleaner Kits & Assemblies, Breather Tubes) as more mixed content kept surfacing. 57 rows moved out entirely (oil-tank items, engine-crankcase breathers, merchandise, chemicals, sensors); 9 genuine stragglers pushed to the admin review queue instead of left silent | ✅ |
| **Foot Controls → "Foot Controls & Pegs," 10→15 subcategories** (session 90) — `rebuild_foot_controls_taxonomy.mjs`. Full reclassification of 3,379 rows onto Laken's 14-name spec. "Highway Bars & Pegs" (353 rows: crash bars mixed with real highway pegs) wasn't in her named list — kept as its own extra bucket per her explicit call rather than split or dissolved, same treatment given to Engine's extra buckets below | ✅ |
| **Engine — 18→17 subcategories onto Laken's 14-name spec + 3 extra buckets** (session 90) — `rebuild_engine_taxonomy.mjs`. Biggest structural-gap rebuild of this new phase — ~18% of the 8,715-row category (Bottom End 830, Complete Engines 229, Cylinder Heads 119, internal Gaskets & Seals 354) had no home in the 14 names, all resolved via explicit back-and-forth with Laken rather than defaulted to General: Bottom End/Complete Engines/Cylinder Heads kept as extra Engine buckets (genuinely engine content, just unnamed — she'd initially asked whether Bottom End belonged in Transmission instead, clarified it's mechanically distinct); internal Gaskets & Seals consolidated into the *standalone* Gaskets & Seals category instead of duplicating. Found 241 rows of brake calipers/seat springs that had been misfiled in "Pistons & Cylinders" for an unknown number of sessions — an old classifier matched "piston"/"cylinder" without knowing those exact words mean something completely different on a brake system (calipers are named by piston count; a brake master cylinder isn't an engine cylinder). Also caught 140 genuine pushrods sitting in Cam Chest instead of the renamed Pushrods bucket, and 6 misfiled rocker box covers | ✅ |
| **Cross-category cleanup sweep** (session 90) — the three rebuilds above kept surfacing the same pattern (duplicate/misfiled content across category boundaries), so it got addressed directly: Brakes' own "Brake Pedals & Pads" (140 rows, duplicating Foot Controls & Pegs' equivalent bucket) consolidated; catalog-wide sensor sweep moved 76 real sensors into Electrical/Sensors & Switches (27 O2 sensors in Exhaust — excluding ~16 bung/plug/adapter fittings, which correctly stayed put; 17 ABS sensors in Brakes; 10 crank position sensors in Engine; 3 MAP sensors the Fuel/Air/Carbs rebuild's rule-priority missed; 19 speedometer/shift sensors — this explicitly overrides the session-87 precedent of keeping gauge sensors bundled with the gauge, by Laken's direct request this time, not a permanent policy reversal); Cables category audited (not a finalized-spec handoff, an open-ended "work up an audit" ask) and found "Universal/Build Your Own" was 28% misfiled (78 of 274 rows: security cable locks, USB/phone charging cables, battery cables, whole clutch kits/covers, S&S throttle body kits, and PSR/HardDrive lever sets) — moved to their correct categories on confirmation | ✅ |
| **⚠️ Rebuild-durability gap now spans sessions 86-90** — none of this taxonomy work is wired into `merge_catalog_unified.js`; all one-off `UPDATE`s against live data. Flagged every session since 86, growing each time | ⚠️ **Not yet addressed — see Open Issues** |

---

## ✅ PHASE 5 — FRONTEND: BROWSE + SEARCH (Complete)

| Item | Status |
|------|--------|
| browse.ts — disjunctive faceting, count fix, Typesense pagination, variant dedup | ✅ |
| browse.ts — multi-word AND search across name/brand/sku | ✅ |
| browse.ts — per-query params fix (shared-array bug) | ✅ |
| browse.ts — OEM number search via `unnest(cu.oem_numbers) ILIKE` | ✅ |
| browse.ts — catalog_media image fallback | ✅ |
| browse.ts — OEM chain pre-fetch (1.3ms warm) when year+model set | ✅ |
| **browse.ts — ILIKE 2-word threshold for 3+ word queries (session 67)** — "brake rotor street glide" no longer returns 0 | ✅ |
| `?category=` URL param stuck bug fixed — old links fold into display_category; category never persists invisibly | ✅ |
| ProductCard.jsx / ProductImage.jsx — cream theme, broken-image fallback | ✅ |
| ProductCard.jsx — selected/onSelect props; OEM chain badge | ✅ |
| ProductImageGallery.jsx — multi-image thumbnail strip on PDP | ✅ |
| FilterSidebar — active chips, section indicators, mobile bottom sheet | ✅ |
| BrowseBackButton (sessionStorage) | ✅ |
| Browse inline panel — InlinePanel.jsx + panel API route | ✅ |
| Era pages — era_* boolean lookups | ✅ |
| PDP (/browse/[slug]) — LeMans image proxy, fitment tab, OEM tab | ✅ |
| PDP window function crash fixed — catalog_media lateral replaced MIN OVER with array_agg nested subquery | ✅ |
| PDP — ProductDetailsSection above fitment/OEM tabs | ✅ |
| PDP — breadcrumb link fixed (?category= → ?display_category=) | ✅ |
| PDP — VTwin attributes fixed at source (session 60) — JSON.parse workaround removed from PDPTabs.jsx | ✅ |
| **PDP — OemPartTimeline component (session 67)** — two-panel: left=options for OEM#, right=year carousel. Modal with image/brand/packQty/price. No vendor data shown. | ✅ |
| **`lib/getOemPartTimeline.ts` (session 67)** — server function; older/same_year/newer/current buckets; returns null when no family | ✅ |
| **Typesense search properly wired (session 67)** — `route.ts` now calls Typesense server-side when `?q=` present; was indexed but never called before this session | ✅ |
| **`fitment_text` Typesense field (session 67)** — combined family+model+code+year string per product; "Street Glide" in search now matches via fitment data | ✅ |
| index_unified.js — product_details as primary source; WPS HTML stripped from Typesense | ✅ |
| QuickView modal — removed; cards navigate directly to PDP | ✅ |
| getChronologicalNeighbors — tightened to display_subcategory | ✅ |
| OEM supersession chain surfaced in browse pre-fetch | ✅ |
| **Typesense reindex + upsert-vs-delete gap found and closed** (session 75) — reindexed after brand normalization + display-fixture deactivation (90,609 docs, 0 errors), but `index_unified.js`'s query is scoped `WHERE is_active=true`, so it only ever upserts active rows — never deletes a doc for a row that just flipped to inactive. Left 20 stale "still active" display-fixture docs live in search (collection count 90,629 vs. Postgres's 90,609). Deleted those 20 IDs directly via the Typesense API; confirmed counts now match exactly. **No automated fix yet** — any future `is_active` flip needs a matching explicit delete or the indexer needs a soft-delete-sync step. | ✅ Patched this instance, ⏳ needs permanent fix |

---

## ✅ PHASE 6 — FRONTEND: HOMEPAGE + NAVIGATION (Complete)

| Item | Status |
|------|--------|
| Font system: --font-tanker / --font-bespoke / --font-stencil | ✅ |
| Color palette: gold #C9A84C / cream #F2EAD3 / deep dark #1A1208 | ✅ |
| ModelFinder — era-first → year slider → model → /browse | ✅ |
| CategoryBentoGrid — bento layout, spring tile-origin animation | ✅ |
| FlowingMenu — /models page | ✅ |
| mv_family_product_ranges materialized view | ✅ |
| BottomNav — scroll-collapse to gold orb | ✅ |

---

## ✅ PHASE 7 — VARIANT SYSTEM (Complete)

| Item | Status |
|------|--------|
| catalog_variant_groups + catalog_variant_members tables | ✅ |
| build_variant_groups.cjs — name-based grouping, non-distinguishing axis fix (994 false groups dissolved), Brushed SS/Raw SS/Brushed finishes, normalizeAxisName() | ✅ |
| **build_variant_groups.cjs — DB connection bug fixed (no dotenv, broken IPv6 host); classifier gaps fixed (MD size, pink/burgundy/bright/dark colors); nuke step + candidate query + kit-invariant check made ADMIN-group-aware after a recovered data-loss incident (session 73)** | ✅ |
| **VariantSelector.jsx wired into the PDP for the first time — was fully built but orphaned, causing duplicate-pill display bugs; Mode C dedup gap fixed with dedupeByFullOption()/hasMixedSizeAndColor() (session 73)** | ✅ |
| VariantSelector Mode A/B/C/D | ✅ |
| ColorQtySelector — two radio pill sections | ✅ |
| build_pack_size_groups.mjs — 148 cross-vendor MULTI pack-size variant groups; dedupByPackQty(); sync/evict on re-run | ✅ |
| catalog_variant_candidates table — 62 finish/size/length groups pending human judgment | ⏳ |
| TC/M8 platform dedup in variant groups | 🔵 Future |
| Auto-reject variant proposals on canonical apply | 🔵 Future |
| **Color/Finish axis-name normalization bug fixed (session 74)** — the PU/VTWIN mixed-axes pre-check compared raw (non-normalized) attribute names, so pairs like "...Shocks Chrome" (Color) / "...Shocks Matte Black" (Finish) were wrongly rejected as mismatched even though Finish normalizes to Color everywhere else in the file; fix applies `normalizeAxisName()` before the comparison — unlocked 328 groups / 1,005 products | ✅ |
| **WPS "split-family" sub-partitioning added (session 74)** — a `wps_product_id` is WPS's umbrella grouping and sometimes bundles an entire product line (e.g. every lever-set style across every fitment, 58 members) rather than one variant-able product, so it always failed `MAX_VARIANT_MEMBERS`/base-name-similarity and produced nothing; new logic sub-partitions each family by attribute-stripped base name first, so e.g. "3-Hole Lever Set...FLH/FLT 08-13" (Black/Chrome) and "5-Hole Lever Set...Big Twin 96-06" (Black/Chrome) are evaluated as separate pairs — WPS groups went 291 → 1,506 across this session's runs | ✅ |
| **`stripAttributeFromName()` consolidated + fixed (session 74)** — replaced three separate copies of a segment-splitting base-name stripper (in `classifyGroup`, Phase 2's candidate bucketing, and the new WPS sub-partitioner) with one shared, more robust implementation. Fixed two real bugs found via evidence: (1) segment-equality required an *exact* match against the extracted value, so `"+0.005"` never matched `+0.005` inches with a trailing inch-mark the extractor didn't capture (Eastern Motorcycle Parts "Cam Shims" Size trio); (2) `\b` word-boundary regex silently fails right before a symbol like `+` (both sides non-word, no transition) — replaced with `(?<![a-zA-Z0-9])...(?![a-zA-Z0-9])` lookaround, which works for both symbol-prefixed and word-prefixed values | ✅ |
| **New vocabulary added from catalog-wide evidence audits (session 74)**: "smoke"/"dark smoke"/"light smoke"/"tinted"/"tint" (699 ungrouped Klock Werks windshield products with zero recognized color word), a new **Side** axis for "Left"/"Right" (85 clusters each — mirrors, mufflers, brake caliper brackets), "BLK"/"CHR" vendor abbreviations, standalone "Polished"/"Standard" (previously only recognized as part of a longer phrase or abbreviation), full-word "Large"/"Medium" apparel sizes. Deliberately did NOT add "Solar" despite real evidence — confirmed overloaded across 3 unrelated meanings (tint color, "Solar-Reflective Leather" material, literal "Solar Panel" product) | ✅ |
| **`scripts/ingest/audit_missing_variant_vocab.cjs` — new standing audit tool (session 74)** — generalizes the manual "spot a duplicate cluster, find the unrecognized word" process into a repeatable, catalog-wide sweep: clusters ungrouped products by (vendor, brand, category, name-minus-last-word), tallies unrecognized trailing words by how many distinct product-line clusters they'd unlock. Read-only report, does not modify the DB or ATTRIBUTE_RULES — human review still required (also surfaces noise: bike-model/fitment codes and generic product-type words like "kit"/"set" that are correctly NOT variant axes) | ✅ |
| **Phase 3 — brand_part_number SKU cross-reference (session 74)** — new grouping pass using manufacturer part-number adjacency (e.g. base `602-2001` + `602-2001B` suffix) to connect variant siblings that name-bucketing alone can't, because their shared generic name also matches several *other* differently-fitted products (e.g. "Backrest Kit - 14" - Chrome - Softail" is the literal name of 6 different Chrome backrests — name-bucketing can't tell which one pairs with which of 6 Black ones, but the manufacturer's part numbering can). Reuses `classifyGroup()` as the sole safety gate (same pack-qty/kit/axis/similarity checks as every other phase) — SKU adjacency only connects candidates into one evaluation, never bypasses it. Added a pairwise fallback for clusters where one coincidental/duplicate part-number match would otherwise poison an otherwise-valid pair's all-or-nothing similarity check. Delivered 401 groups / 859 members in the final run | ✅ |
| **`nameImpliesKit()` kit-exclusion heuristic narrowed (session 74)** — bare "kit"/"assembly" in a name is not a reliable bundle signal on its own; catalog-wide audit found **14,784 products** (e.g. "Taillight Kit - Chrome", "Complete Plug-and-Play Cable Kit...", "Shifter Lever Assembly Chrome") were single, cohesive products using "kit"/"assembly" as their plain product-type word, wrongly blocked from variant grouping entirely. Now only treated as a bundle when a joining word/symbol suggests two distinct components ("Nut **and** Seal Kit", "Lid Kit **W/** PH694", "Riser **&** Top Clamp Kit"), with joiners requiring real surrounding whitespace so hyphenated descriptors ("Plug-**and**-Play") and brand names ("E**&**G Carbs") don't false-positive. "complete set"/"service kit"/"rebuild kit" kept as unconditional bundle phrases (lower volume, lower ambiguity). This was the single highest-impact fix of the session. | ✅ |
| **catalog_variant_groups total: 2,907 → 6,605** (PU 2,101→3,117, VTWIN 835→1,974, WPS 291→1,506, ADMIN 8 unchanged) across four live rebuilds this session, each backed up via `pg_dump` first per the session-73 lesson | ✅ |
| **Full rebuild re-run session 75, post brand normalization** — 6,605 total (6,597 automated + 8 ADMIN), 19,083 members, essentially identical to the session-74 baseline (PU 3,117 / VTWIN 1,974 / WPS 1,506 exactly). Brand normalization did not measurably shift automated group counts — the classifier keys on name-similarity/`wps_product_id`/SKU adjacency, not brand-string equality, so casing wasn't actually a blocker at this layer. | ✅ |
| **⚠️ MULTI-group nuke bug found and fixed** (session 75) — the nuke step's `source_vendor != 'ADMIN'` exclusion never protected `source_vendor='MULTI'` (cross-vendor pack-size groups from the separate `build_pack_size_groups.mjs`), so the session-75 rebuild silently wiped all 148 pre-existing MULTI groups. Caught while pulling fresh numbers for the session write-up, not during the run itself. Re-ran `build_pack_size_groups.mjs --canonical --apply`, recovering 49 (the other ~99 aren't reproducible from current candidate data — not investigated further). **Fixed at the root**: nuke step now excludes `source_vendor IN ('ADMIN', 'MULTI')`. | ✅ |

⚠️ **Operational note (session 74):** `build_variant_groups.cjs` does a full nuke-and-rebuild on *every* live run (not incremental — "Full rebuild every time" per its own header comment), which wasn't fully internalized mid-session. One live run was launched via plain foreground `Bash` and got killed by the tool's 2-minute default timeout right after the nuke but before the rebuild finished, leaving the DB in a transient degraded state (most groups temporarily gone) until re-run to completion with proper backgrounding. No data was lost (the script is idempotent/deterministic given the same inputs), but this cost real time and a moment of user-visible alarm. **Always run this script with `run_in_background: true` (or equivalent), never assume a short foreground timeout is enough.**

---

## ✅ PHASE 8 — ADMIN TOOLING (Substantially Complete)

| Item | Status |
|------|--------|
| AdminEditPanel — inline PDP editing, catalog_review_flags | ✅ |
| admin/products/[id]/page.jsx — cream/gold/black theme, larger fonts | ✅ |
| admin/products/[id]/route.ts — update + flag + generic flat-body (GENERIC_FIELD_MAP) + pack_qty | ✅ |
| ProductManager.jsx — bulk grid, inline edit, pack_qty column, EditModal | ✅ |
| /admin/canonical-matches — full workbench (confirm/reject/flag/edit/manual-match/variant-flag/mismatch badges) | ✅ |
| /admin/variant-candidates — variant candidate tracking + resolution (images fixed via COALESCE across 3 sources) | ✅ |
| admin/products list route — search by name/sku/internal_sku/brand_part_number | ✅ |
| **/admin/parts-timeline** — OEM# span visualization per model code; category/subcat filters; colored bars with tooltip (session 64) | ✅ |
| /admin/orders — list, filter, order detail | ⏳ |
| /admin/fulfillment/vtwin — manual PO queue | ⏳ |
| /admin/inventory — per-vendor stock levels | ⏳ |
| Harden auth (?token= → session cookie) | 🔵 Future |

---

## ✅ PHASE 9 — DATA QUALITY: VENDOR SKUs (Complete)

| Item | Status |
|------|--------|
| WPS vendor_sku 100% correct | ✅ |
| VTwin vendor_sku correct (VT- prefix stripped) | ✅ |
| PU DS###### rows fixed (migration 007) | ✅ |
| PU all remaining rows fixed (migration 010) — all 36,396 active rows: vendor_sku = sku | ✅ |
| brand_part_number retained as manufacturer cross-reference only | ✅ |
| PU portal spot-check (3-4 numbers) | ⏳ Verify before treating as fully closed |

---

## ✅ PHASE 10 — CANONICAL PRODUCTS (Complete — 74 missed-merges + 61 auto-rejected proposals unverified)

| Item | Status |
|------|--------|
| canonical_products table + product_vendors table | ✅ |
| build_canonical_products.mjs Phase A + Phase B | ✅ |
| **All OEM-based merges drained** — 0 pending / 2,807 applied / 1,375 rejected (session 66) | ✅ |
| **62 variant candidates** — /admin/variant-candidates; finish/size/length groups | ⏳ |
| Backfill vendor_offers from product_vendors (PU/VTwin) | ⏳ |
| Unknown match pipeline (match_reason='upc'/'brand_part_number', null shared_oem_number) | ✅ Resolved session 70 — `match_reason='brand_part_number'` was a legitimate value already used by the admin "admin-select" manual-match path (1,440 pre-existing rows); it just had no automated generator until session 70. Root cause: Phase B only ever proposed on OEM number, never checked brand_part_number at all — 89% of duplicate-part-number pairs had literally zero proposal of any kind. |
| **Canonical match audit (session 70)** — read-only audit found 3,898 missed-merge groups (duplicate cards) + 38 false-merge groups (wrong products sharing a card) | ✅ Missed-merges → 74, false-merges → 22 after fix. See HANDOFF_LOG "SEVENTIETH PASS" for full detail. |
| 15 ambiguous false-merge groups needing Laken's parts-domain review | ✅ Reviewed session 71 — 13 false alarms, 7 groups split for real errors (16 new canonical_products rows across the 7, since `94223` split into 3). 2 of the 7 splits (`94223`, `103813`) checked against OEM crossref and **reversed/re-merged** same session — OEM crossref data showed all members were the same underlying HD part number after all. Net: 5 groups genuinely split, 10 confirmed as correctly merged (13 false alarms + 2 reversed). See HANDOFF_LOG "SEVENTY-FIRST PASS". |
| 74 remaining missed-merge groups + 61 auto-rejected proposals from session 70's batch | ⏳ Still unverified as of session 71 |
| Extend build_canonical_products.mjs Phase B to check brand_part_number **and OEM crossref** going forward | 🔵 Future — session 71 showed OEM crossref is a stronger signal than brand_part_number/pack_qty heuristics for ambiguous cases; worth checking before finalizing any manual split, not just automating brand_part_number |
| `product_vendors.canonical_id` drift from session 71 splits + re-merge | ✅ Fixed session 71 — `fix_product_vendors_drift.mjs --apply` run twice (16/16 fixed after split, 0/0 after re-merge since product_vendors still pointed at original IDs) |
| Typesense reindex after session 71 splits + re-merge | ✅ Fixed session 71 — upsert reindex run twice, 90,629 docs, 0 errors both times |
| **`canonical_sku_seq` drift bug found and fixed** (session 75) — sequence had fallen behind some historically-inserted `canonical_products` rows (sequence at 182,018 while a row already existed at `CP-180063`); `build_canonical_products.mjs` Phase A threw a duplicate-key error and aborted mid-batch on the first live run since. Fixed via `setval()` past the confirmed true max. | ✅ |
| **Phase A + Phase B re-run live** (session 75, post brand normalization) — Phase A created 2,043 new canonical products for previously-unlinked active rows (0 unlinked remain, `canonical_products` now 91,283 total). Phase B proposed **12,783 new cross-vendor OEM matches** from the now-consistent brand data. | ✅ |
| **Canonical match review queue automated 54%** (session 75) — user reported the review queue felt like re-litigating already-done work and asked for it to be automated as far as possible without manual review. Built 5 evidence-validated rules into Phase B (durable, applies to all future runs) and retroactively applied them to the existing queue: exact `brand_part_number` match, exact normalized-name match (price-gated), gasket thickness mismatch (extended to catch names without an inch mark), brake-pad friction-compound mismatch, and — the single largest lever — excluding `Brake Pads & Shoes`/`Batteries`/`Charging & Alternators` from OEM-based candidate generation entirely, since a shared OEM number in those subcategories means "family of compatible cross-brand replacements," not "same physical product" (verified directly: every sampled pair was a genuinely different brand/product line). **Pending: 12,783 → 4,468 (54% reduction)**, every disposition logged with a distinct `reviewed_by` audit tag. Two real bugs caught and fixed mid-pass (see Open Issues): a price-gap rule that wrongly treated "no part number recorded" the same as "explicitly different," and 4 stale `applied` labels on proposals already correctly fixed by a July-4 manual-split pass. Tried and explicitly rejected two more rules for insufficient evidence: a battery-designation parser (too noisy) and a brake-rotor-diameter matcher (tested at 198/198 same-diameter matches with zero discriminating power — different rotor designs commonly share a diameter). | ✅ |
| **All safely-confirmed proposals actually merged, not left in limbo** (session 75) — 63 then 247 `confirmed` proposals were executed via the same logic as `apply/route.ts` (not just left sitting as `confirmed`), followed by a Typesense reindex each time since `canonical_product_id` changes feed the `canonical_sku` field checkout depends on. | ✅ |

---

## ⚠️ PHASE 11 — CHECKOUT + PAYMENT (Stripe Wired Interim — Page Rebuild Pending)

**Session 69 architecture decision:** the live `checkout/page.jsx` was discovered to be running on an entirely separate, abandoned Supabase architecture (own routing engine, own Stripe Checkout Sessions flow, own orders schema) with no connection to `canonical_products`/the fulfillment optimizer. Decided: Postgres is canonical going forward, old Supabase checkout stack (`checkout/create-session`, `checkout/create-order`, `webhooks/stripe`) is being retired. Auth only stays on Supabase.

| Item | Status |
|------|--------|
| orders / order_items / vendor_orders schema + triggers | ✅ |
| Auto order numbers SS-YYYYMMDD-NNNN | ✅ |
| CartContext (localStorage, canonical_sku-based) | ✅ Fixed session 69 — was never actually populated; see filter_roadmap session 69 note |
| CartProvider wired into root layout | ✅ |
| Checkout page skeleton — address form + MAP pricing | ⚠️ Old version still live, on retired Supabase architecture — full rebuild is next session's first job |
| app/api/checkout/prepare/route.ts — validates cart, runs optimizer, points preview | ✅ Updated session 69 with points discount calc |
| app/api/stripe/create-intent/route.ts — Stripe PaymentIntent, points-aware | ✅ Session 69 (rewritten — old version used dead pricing engine) |
| app/api/orders/create/route.ts — Stripe charge verification, atomic order write, points debit/credit, fulfillment dispatch | ✅ Session 69 |
| app/api/account/points/route.ts — balance lookup | ✅ Session 69 |
| customer_points table + orders points columns | ⏳ Migration written (`migrate_add_points.sql`), **not yet run** |
| **Payment gateway decision** — Stripe wired as interim; Braintree still the long-term recommendation | ⚠️ PENDING MERCHANT MEETING |
| Order confirmation page (/checkout/success) | ⏳ Exists on old architecture, needs rebuild alongside checkout page |
| Tax calculation (TaxJar or flat rate) | ⏳ |
| Shipping estimate (UPS/FedEx API or zone table) | ⏳ |
| PU + WPS API credentials for order submission | ⏳ |
| `userId` server-side verification (currently client-trusted in points-aware routes) | ⏳ Flagged session 69 — fine for demo, not for real money |

---

## ✅ PHASE 12 — FULFILLMENT OPTIMIZER (Complete — awaiting API creds)

| Item | Status |
|------|--------|
| optimizer.ts — minimize vendor count, maximize margin, VTwin→manual | ✅ |
| triggerFulfillment.ts — inserts vendor_orders, dispatches adapters | ✅ |
| Live stock check at checkout via product_vendors | ✅ |
| PU API order submission | ⏳ Needs PU_API_URL/KEY |
| WPS API order submission | ⏳ Needs WPS_API_URL/KEY |
| VTwin → manual queue (vendor_orders, is_manual=true) | ✅ |

---

## ⏳ PHASE 13 — ADMIN: ORDERS & FULFILLMENT DASHBOARD

| Item | Status |
|------|--------|
| /admin/orders — list all orders; filter by status/vendor/date | ⏳ |
| /admin/orders/[id] — order detail + actions | ⏳ |
| /admin/fulfillment/vtwin — manual PO queue | ⏳ |
| /admin/inventory — per-vendor stock levels | ⏳ |
| Invoice PDF generation | ⏳ |

---

## ⏳ PHASE 14 — AUTOMATED SYNC & NOTIFICATIONS

| Item | Status |
|------|--------|
| Daily price/stock sync cron — PU + WPS | ⏳ |
| Order status webhooks — PU/WPS shipment handlers | ⏳ |
| Customer email notifications — confirmation, shipped, delivered | ⏳ |
| Typesense stock sync without full reindex | ⏳ |

---

## ⏳ PHASE 15 — FRONTEND CLEANUP

| Item | Status |
|------|--------|
| Fix Framer Motion transparent errors (FRAMER_TRANSPARENT_FIX.md ready) | ⏳ |
| Add 9 remaining model images (400×160px at public/images/models/{slug}.jpg) | ⏳ |
| /models link in main nav | ⏳ |
| Mobile layout pass /models — FlowingMenu too tall on mobile | ⏳ |
| flathead.webp missing from public/images/eras/ | ⏳ |
| ADMIN_SECRET to Vercel (`npx vercel env add ADMIN_SECRET`) | ⏳ |
| Drop session 43 files (globals.css, layout.tsx, BespokeSerif-Variable.ttf, etc.) | ⏳ |

---

## ✅ PHASE 16 — VTWIN CATALOG GAPS (Complete)

| Item | Status |
|------|--------|
| **Fix build_product_details.mjs VTwin attributes** — JS-based rewrite; parseVtwinAttributes() handles object/string/double-string; extra_attributes fallback. 2,499 products corrected. | ✅ Session 60 |
| **PDPTabs.jsx JSON.parse workaround removed** — attributes read directly as object | ✅ Session 60 |
| **Import vtwin_scrape_data.oem_no → catalog_oem_crossref** — 5,511 rows inserted (source='vtwin_scrape') | ✅ Session 60 |
| VTwin product_details gap (23K+ products) — no description/pdp_payload | 🔵 |
| Re-run scrape_vtwin_missing.mjs on newly added VTwin SKUs | 🔵 |

---

## 🔵 PHASE 17 — FUTURE / LOW PRIORITY

| Item | Notes |
|------|-------|
| PU image-proxy persistent cache | Zero server-side caching — Vercel Blob/S3/R2 needed for browse-grid scale |
| PU image-proxy browse grid spot-check | PDP confirmed; browse grid visual confirm pending |
| 3,573 PU products with no recoverable image | No source photo exists; stays on placeholder |
| Re-run extract_pu_images.mjs | After each PU XML drop — idempotent |
| Hard Drive book crossref | Import when file available |
| WPS API enrichment | Features+blocks hit rate testing |
| WPS OEM crossref — 662 unmatched rows | Revisit after next WPS ingest |
| oem_supersession review | 283 original inferred pairs pending — `SELECT * FROM oem_supersession_review LIMIT 30`; 202 vtwin hardware pairs are solid (source catalog); **delete 2 wrong cable-type pairs flagged session 67** |
| oem_supersession PDP timeline | Show chain on OEM tab: "replaced X in [year]" |
| OemPartTimeline modal animation | Removed framer-motion (transform conflict). Re-add with ReactDOM.createPortal approach to avoid centering issue |
| OemPartTimeline — same-year siblings display | When many products share an OEM#, left panel can get long. Consider max-height scroll or "show all" toggle |
| TC/M8 platform dedup in variant groups | Platform-aware split in build_variant_groups.cjs |
| Browse/Brand tabs | Data ready, UI unbuilt |
| Harden admin auth | ?token= → session cookie |
| Typesense reindex automation | Auto-run as post-step in ingest scripts |
| Unknown match pipeline | match_reason='upc'/'brand_part_number' — source never identified |
| oem_fitment table | **315,427 rows** (session 65) — 121 catalogs. `catalog_family` column added. 130K year-annotation noise rows eliminated. Universal promotion now family-scoped. Re-run `--force` after adding catalogs. |
| OCR 4 image-only PDFs | FX 1971-80, FX 1971-84, Softail 2002, WLA 1942 — need `brew install ocrmypdf` |
| Missing catalogs | 2024 Touring, Softail 2016, Sportster 1979-1985 — user still sourcing |
| Brake/battery/handlebar/spec finder pages | ebc_brake_fitment + hd_battery_fitment + hd_handlebar_specs + bike_specs staging tables ready — frontend pages unbuilt |
| EBC catalog annual refresh | parse_ebc.py reusable; run against new Issue PDF each year |
| scrape_vtwin_missing.mjs pg pool fix | Replace concurrent client queries with pool.query() |

---

## Open Issues

| Area | Issue | Status |
|------|-------|--------|
| Payment gateway | Merchant account meeting pending | ⚠️ BLOCKING |
| Framer Motion | Transparent animation errors — fix doc ready, not applied | ⏳ |
| Admin | ADMIN_SECRET not added to Vercel | ⏳ |
| PU | Portal spot-check 3-4 corrected SKUs | ⏳ Recommended |
| Browse | Softail + Suspension + Triple Trees filter combo — untested since session 51 | ⏳ Retest |
| scrape_vtwin_missing.mjs | pg deprecation warning (concurrent queries on single client) — not failing | ⏳ Low urgency |
| catalog_oem_crossref | 826 WPS 2026 catalog entries have NULL source — no source column value specified on INSERT | ⏳ Low priority |
| FLHXU 2025 | Street Glide Ultra (2025-only model, predecessor to FLHXL) has 0 WPS fitment rows | 🔵 Monitor after next WPS feed |
| oem_supersession | 283 original inferred pairs confidence=1 still pending review. **2 flagged wrong session 67:** `56308-88→56309-96` (Throttle→Idle cable mismatch) and `56324-81A→56356-92` (wrong cable length) | ⏳ |
| catalog_variant_candidates | 62 groups pending human review | ⏳ |
| OemPartTimeline | framer-motion removed from modal — no enter/exit animation. Can re-add with portal approach when desired. | 🔵 Future |
| **catalog_unified flat fitment columns** | Must re-run `node scripts/ingest/sync_fitment_flat_columns.mjs` after any script writes to catalog_fitment_v2, before every Typesense reindex — nothing does this automatically yet. Was 0% populated catalog-wide until session 68. | ⏳ Needs automation |
| **Colony brand fitment data** | User believed a Colony dataset was already loaded into the DB this session — never found (searched every table). Colony fitment was instead sourced fresh from Colony's own 2026 catalog PDF. If the originally-intended dataset turns up later, check for conflicts against `colony_2026_catalog` fitment rows before merging. | ⏳ Awaiting user |
| **PU/VTWIN/WPS remaining no-fitment/no-OEM gap** | Post session 68: PU brand-XML corpus and Colony/Eastern catalogs both exhausted of easily-parseable signal (42/84/606 products recovered respectively — most of the 133 PU brand files and Colony's/Eastern's catalogs simply don't name a bike-specific model+year for the remaining SKUs). VTWIN gap list exported (`vtwin_no_fitment_2026-07-02.csv`, 15,511 rows) for external scraper. | 🔵 No further script-mineable signal without new vendor feeds |
| **`FLHTC`/`FLH`/`FLI`/`FLTRS`/`FLST`/`FL` pre-2027 fitment data** | Same 14 model codes involved in the impossible-future-years bug (session 72) show a non-organic "flat constant row count for 6+ consecutive years" signature even in the technically-possible 2024–2026 range (e.g. `FLHTC` locks to exactly 5 rows/year from 2024 on). Needs Laken's production-history knowledge — which codes are genuinely still in production vs. long discontinued — not another automated query. | ⏳ Awaiting domain review |
| **`sync_fitment_flat_columns.mjs` fragile dotenv call** | Uses bare `dotenv.config({ path: ".env.local" })` — cwd-dependent, same failure class as the bug fixed in `fix_product_vendors_drift.mjs` this session. Hasn't bitten yet only because it's presumably always run from `scripts/ingest/`. | ⏳ Low urgency, flagged session 72 |
| **`eastern` orphaned crossref rows** | 1,641 of 1,729 `catalog_oem_crossref` rows from the `eastern` source have no `product_id` match under any tested strategy (exact/normalized sku or vendor_sku, VT- prefix, oem_number-in-array). Consistent with session 68's finding that Eastern's own numbering doesn't map cleanly to anything else available. | 🔵 Accepted gap, revisit only if a new numbering insight surfaces |
| **PDP duplicate variant pills** | `VariantSelector.jsx` (fully built, Modes A-E) was never imported — PDP used a dead flat-pill renderer with zero dedup, showing genuinely-different products as duplicate color pills | ✅ Fixed session 73 — wired into `app/browse/[slug]/page.jsx`; Mode C dedup gap also fixed (`dedupeByFullOption()` + `hasMixedSizeAndColor()` guard) |
| **`build_variant_groups.cjs` classifier gaps** | Missing `MD` size token, `pink`/`burgundy` colors, `bright`/`dark` color modifiers — caused both the PDP pill bug's "Pattern B" cases and a browse-grid duplicate-card bug (Fender Seat Washer) | ✅ Fixed session 73 — evidence-based regex additions; 2 groups too risky for regex hand-corrected + tagged `ADMIN` instead |
| **`build_variant_groups.cjs` nuke step wiped 6 ADMIN-curated groups** | Unfiltered `DELETE FROM catalog_variant_groups` during a session 73 live rebuild deleted 6 human-curated groups (26 members) along with the automated ones | ✅ Recovered in full from a `pg_dump` backup session 73; nuke step, Phase 1 candidate query, and kit-invariant check are now all `ADMIN`-aware — cannot recur |
| **Variant classifier is heuristic (regex/name-based)** | Will likely keep surfacing new edge cases as product names vary — inherent to the approach, not a specific bug | 🔵 Fix from concrete evidence only as cases surface; resist speculative vocabulary growth (lesson from session 73) |
| **display_category** | 2,028 active products had `display_category IS NULL` | ✅ Fixed session 74 — `rebuild_display_category_v2.mjs`; also fixed SADDLEBAGS/TANK structural bugs and Kickstands/Gas Caps home decisions; 0 nulls remain |
| **No tier-3 subcategory layer existed** | 37 large subcategories (>700 rows) had a single facet doing too much work | ✅ Built session 74 — `display_subcategory_detail` column + Typesense facet + full FilterSidebar/browse.ts UI wiring; 36,350 products classified; see `tier3_final_mappings.sql` for the evidence trail |
| **`build_variant_groups.cjs` — Color/Finish axis mismatch** | Mixed-axes pre-check compared raw (non-normalized) attribute names, wrongly rejecting valid Color/Finish pairs like "Chrome" vs "Matte Black" | ✅ Fixed session 74 — apply `normalizeAxisName()` before comparison; unlocked 328 groups |
| **`build_variant_groups.cjs` — WPS umbrella product-line IDs** | A single `wps_product_id` sometimes bundles an entire product line (every style × every fitment) rather than one variant-able product, so the whole family always failed size/similarity checks | ✅ Fixed session 74 — sub-partition each family by attribute-stripped base name before classifying |
| **`build_variant_groups.cjs` — symbol-prefixed values failing to strip** | `\b` word-boundary regex silently fails right before a symbol like `+` (e.g. `+0.005"`), so Size-variant siblings like Eastern Motorcycle Parts' "Cam Shims" trio never matched | ✅ Fixed session 74 — consolidated into one `stripAttributeFromName()` helper using lookaround instead of `\b` |
| **`build_variant_groups.cjs` — missing vocabulary** | "smoke"/"tinted"/"dark smoke" (699 windshield products), no "Side" axis at all for Left/Right (85 clusters each), "BLK"/"CHR" abbreviations, standalone "Polished"/"Standard", full-word "Large"/"Medium" | ✅ Fixed session 74 — evidence-based additions via new `audit_missing_variant_vocab.cjs` catalog-wide sweep tool; deliberately did NOT add "Solar" (confirmed overloaded/ambiguous across 3 meanings) |
| **`build_variant_groups.cjs` — kit-exclusion heuristic too blunt** | Bare "kit"/"assembly" in a name excluded 14,784 legitimate single-product names (e.g. "Taillight Kit - Chrome") from ever being grouped, not just real multi-part bundles | ✅ Fixed session 74 — now requires a joining word/symbol ("and"/"with"/"&"/"w/") with real surrounding whitespace to count as a bundle; single highest-impact fix of the session |
| **`build_variant_groups.cjs` — no SKU-based cross-referencing** | Products whose generic shared name matches several *other* differently-fitted products (e.g. 6 different Chrome backrests all named identically) couldn't be matched to their correct Black sibling by name alone | ✅ Built session 74 — new Phase 3 using `brand_part_number` suffix adjacency (e.g. `602-2001` + `602-2001B`), gated by the same `classifyGroup()` safety checks as every other phase; 401 groups delivered |
| **`build_variant_groups.cjs` is a full nuke-and-rebuild every live run** | Not incremental — running it in a foreground shell with a short timeout can leave the DB in a transient degraded state if killed mid-rebuild (happened once this session, self-recovered by re-running to completion, no data lost) | ⏳ Process discipline only — always background this script with no timeout; consider batching writes to reduce full-rebuild runtime as a future improvement |
| **`build_variant_groups.cjs` nuke step wiped 148 MULTI pack-size groups** | Nuke step's `ADMIN` exclusion never covered `MULTI` (cross-vendor pack-size groups from `build_pack_size_groups.mjs`) — a session-75 rebuild silently deleted all of them | ✅ Fixed session 75 — nuke step now excludes `source_vendor IN ('ADMIN', 'MULTI')`; only 49/148 reproducible via `build_pack_size_groups.mjs --canonical --apply`, remaining ~99 gap not investigated (likely normal candidate-data drift) |
| **`canonical_sku_seq` drift** | Sequence had fallen behind some historically-inserted `canonical_products` rows, causing duplicate-key errors on `build_canonical_products.mjs` Phase A | ✅ Fixed session 75 — `setval()` past the confirmed true max |
| **4,468 pending `canonical_match_proposals`** (down from 12,783) | Automated 5 evidence-based rules down to this floor session 75 (see Phase 10) — remainder is dominated by `Gaskets & Seals` (1,207, generic names like "Top End Gasket Kit" with no extractable distinguishing spec) and `Cables & Lines` (497); no safe additional automated signal found so far | ⏳ Needs richer attribute data or admin review at `/admin/canonical-matches` |
| **Phase B price-gap rule wrongly treated "no part number" as "different part number"** | An earlier version auto-rejected 423 pairs on price alone when one side simply had no `brand_part_number` recorded — not real evidence of a mismatch, since vendor markup alone explains large price gaps for the same physical part | ✅ Fixed session 75 — now only rejects on price gap when both sides have an explicit, differing part number; 423 pairs reopened to pending |
| **85 `applied` canonical_match_proposals with currently-divergent canonical IDs** | Audit found these don't reflect current reality — some (30, confirmed via `manual-split` marker) are stale labels on deliberate, already-correct fixes; 4 of those corrected session 75. The other 55 have unclear provenance | 🔵 Not investigated further — worth a look if checkout data integrity for those specific products is ever in question |
| **Typesense upsert-only indexing doesn't delete stale docs** | `index_unified.js`'s query is scoped `WHERE is_active=true` — never deletes a document for a row that flips to inactive since the last index, leaving stale docs live in search | ✅ Manually patched for session 75's 20 affected rows via direct Typesense API deletes | ⏳ No automated fix yet — will recur for any future `is_active` flip not paired with an explicit delete |
| **PU/WPS in-store display fixtures in sellable inventory** | 41 rows (15 PU + 26 WPS) were live/sellable despite being dealer point-of-sale merchandising units, not real products a customer would buy | ✅ Fixed session 75 — verified against live data (not a stale offline estimate) and price signals, soft-deleted, wired into `merge_catalog_unified.js` for durability, Typesense synced |
| **Inconsistent brand-name casing blocking grouping** | 51 duplicate normalized-brand clusters live (e.g. "ARLEN NESS" vs "Arlen Ness") — `normalize_brands.sql` existed in draft but was never run or wired into the pipeline | ✅ Fixed session 75 — extended mapping with 8 real gaps, ran live (51 → 0 clusters), wired into `merge_catalog_unified.js` for durability |
| **Fitment tab showed bare model codes with no readable name** | e.g. "FLHX" with no indication it means "Street Glide" | ✅ Fixed session 75 — `hm.name` added alongside `hm.model_code` in every fitment-tab render path |
| **browse.ts default sort put cheap hardware above real products** | Flat `price ASC` sort meant a $18 mounting bracket always outranked a $180 seat, regardless of category — caught via customer-facing screenshot on Seating | ✅ Fixed session 76 — new `detail_priority` computed SQL column as first sort key, keyword-matched against Detail (falling back to name when blank), no schema change |
| **239 Seating hardware products miscategorized as "Seats"** | Brackets, rivets, springs, pins, handrails, etc. sitting in the customer-facing seat subcategory | ✅ Fixed session 76 — `fix_seating_hardware_miscategorization.mjs`; took 5 iterative rounds (trusted-brand logic for Corbin/Bates/Mustang/Saddlemen complete seats, directional adjacency to avoid over-protecting real hardware) — see HANDOFF_LOG "SEVENTY-SIXTH PASS" §4 |
| **FL/FX combo miscoded as Touring+Dyna (physically impossible)** | `backfill_seating_name_fitment.mjs`'s multi-code splitter unioned FL(Touring)+FX(Dyna) for the combined token, when `FL/FX` together actually denotes Softail specifically | ✅ Fixed session 76 — `fix_flfx_softail_miscode.mjs` corrected 166 products; original backfill script patched for future runs |
| **26 Sissy Bar Pads + 15 Tour-Pak Backrest Pads miscategorized under Seating** | Belong in Luggage & Racks (Sissy Bars / Tour Pak subcategories, built earlier this project) | ⏳ Flagged session 76, not yet manually moved |
| **21 cross-category miscategorizations found in Exhaust** | 15 engine valve/valve-seat components (Kibblewhite/KPMI/Motorshop/Ultima — cylinder-head parts, not pipe-system), 5 Ultima grip products (matched on "end cap" wording), 1 Colony brake-shaft tool (matched on "crossover") | ⏳ Flagged session 76, not yet manually moved |
| **Product-name quote-corruption pattern** | Multiple names across categories contain literal `" inch "` text where a quote character should be (e.g. "16 inch BACK", "inchButt Bucket inch") — looks like a global find/replace corrupted embedded quotes somewhere upstream | ⏳ Flagged session 76, not investigated |
| **Taxonomy rebuild-durability gap now spans sessions 86-90** | None of the interactive SQL cleanup (session 86) or the finalized-spec category rebuilds (Handlebars, Saddlebags/Luggage, Gaskets & Seals, Seating, Fuel/Air/Carbs, Foot Controls & Pegs, Engine — sessions 87-90) are wired into `merge_catalog_unified.js`. All of it is one-off `UPDATE`s against already-live data | ⚠️ **Growing every session — a future full TRUNCATE+reinsert rebuild will silently undo 5 sessions of category work.** Needs either porting into the ingest pipeline or a post-rebuild reconciliation snapshot/reapply step, before this backlog gets any bigger |
| **Cables' 307-row grip/throttle-sleeve misroute (session 80) is still unresolved** | Separate from session 90's own Cables cleanup (which fixed a different problem — 78 rows of security-locks/USB-cables/battery-cables/clutch-kits/throttle-body-kits/lever-sets in "Universal/Build Your Own") — this older, still-open issue is grip and throttle-sleeve products misrouted into the same bucket by a session-80 pattern gap (reversed word order, brand-only naming) | ⏳ Still owed, now two sessions old |
| **General-bucket audits need at least two passes, not one** | Fuel/Air/Carbs' General leftover went 511→121→9 rows across two dedicated audit passes (session 90) — a first-pass regex tally is never sufficient evidence a "General" bucket is actually done; matches the same lesson from Handlebars (session 89, 151 mis-swallowed rows found only by Laken spot-checking the live site) | ✅ Now standard practice — see MasterRef.md Known Bugs for the durable writeup |
| **A shared keyword can mean something totally different on a different part of the bike** | Engine's "Pistons & Cylinders" bucket had 241 brake-caliper/master-cylinder rows sitting in it (brake calipers are named by piston count; a brake master cylinder isn't an engine cylinder) — an old classifier matched the words without knowing which system they described (session 90) | ✅ Fixed — moved to Brakes/Seating; flagged as a new bug-family entry in MasterRef.md Known Bugs, distinct from every prior "false positive within the same domain" lesson |

---

*Last updated July 18, 2026 · Session 90 (see HANDOFF_LOG.md "Session 90" for full session detail)*
