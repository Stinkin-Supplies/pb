# STINKIN' SUPPLIES — PROJECT ROADMAP
**Last Updated: July 8, 2026 (Seventy-Sixth Pass)**

---

## ✅ PHASE 1 — FOUNDATION (Complete)

| Item | Status |
|------|--------|
| Stack: Next.js 15 / Postgres (Hetzner 5.161.100.126) / Typesense / Vercel | ✅ |
| Three vendor staging tables: pu_catalog, wps_catalog, vtwin_catalog | ✅ |
| catalog_unified — single source of truth (**90,609 active rows**, down from 90,629 — 41 PU/WPS in-store display fixtures deactivated session 75) | ✅ |
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

## ✅ PHASE 4 — TAXONOMY (Complete)

| Item | Status |
|------|--------|
| display_category (21 confirmed values) | ✅ |
| display_subcategory across all 20 display categories | ✅ |
| Coverage 87–97% across categories | ✅ |
| infer_vtwin_categories.mjs — VTWIN_CATEGORY_TO_DISPLAY map (28 source → 21 display); 566 products updated | ✅ |
| generate_vtwin_skus.js — full rewrite; reads catalog_unified, display_category→prefix map, writes internal_sku directly | ✅ |
| Typesense reindexed with full subcategory facets | ✅ |
| **display_category rebuild — 2,028 null-category gap closed** (session 74) — `rebuild_display_category_v2.mjs`; scope deliberately narrowed to the 2,028 null rows + 2 confirmed structural bugs (SADDLEBAGS, TANK gas/oil split) + 2 decisions (Kickstands → Foot Controls, Gas Caps & Petcocks → Fenders & Body) after a full-recompute dry run showed it would silently regress thousands of already-correct rows | ✅ |
| **display_subcategory_detail — new tier-3 column** (session 74) — Category → Subcategory → Detail, added for the 37 subcategories clearing a >700-row threshold; every split evidence-based from real name-prefix mining, not guessed; 36,350 of 76,491 eligible products classified; full FilterSidebar/browse.ts/Typesense wiring shipped as the first 3-level nested filter in the codebase | ✅ |
| Windshield Hardware & Parts merged into Windshields subcategory (267 products) | ✅ Session 74 |
| **Seating category — full rebuild** (session 76) — hardware/pad/backrest miscategorization fixed (239 hardware → Seat Hardware with new Detail buckets, 11 pad rows → Seat Pads & Covers, 2 backrest rows → Backrests); `lib/db/browse.ts` sort-order bug fixed (`detail_priority` computed column, hardware no longer outranks real products under price-ascending default); 256,143 fitment rows backfilled via new name-extraction script; 166 products' fitment corrected (FL/FX combo miscode → Softail, was wrongly Touring+Dyna) | ✅ |
| **Exhaust category — full rebuild** (session 76) — 269 blank subcategories filled, 569 new Detail assignments on Exhaust Parts bucket (Heat Shields, Baffles, Clamps & Brackets, Wrap & Packing, O2 Sensors & Bungs, etc.); 838 total rows updated; 21 cross-category miscategorizations found and flagged (15 engine valves, 5 grips, 1 brake tool) | ✅ |

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

---

*Last updated July 7, 2026 · Session 75 (see HANDOFF_LOG.md "SEVENTY-FIFTH PASS" for full session detail)*
