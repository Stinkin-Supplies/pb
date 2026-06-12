# STINKIN' SUPPLIES — HANDOFF LOG

---

# ——— FORTY-SEVENTH PASS (June 11–12, 2026) ———

Session: Forty-Seventh Pass · June 11–12, 2026

## WHERE WE ARE

Fulfillment/checkout backend fully scaffolded — drop-ship architecture with PU + WPS API ordering, VTwin manual PO queue, fulfillment optimizer for vendor consolidation/margin routing. Canonical products layer live: all 90,605 active products have 1:1 canonical entries, OEM cross-vendor matching found 469 groups (1,536 proposals) now in admin review queue. Critical vendor_sku data bug found and fixed across all 90,605 product_vendors rows.

⚠️ User is now working through the canonical match review queue (469 groups) — in progress, ongoing across sessions.
⚠️ Payment gateway still undecided — only blocker for checkout going fully live.
⚠️ Cart drawer / checkout frontend UI not yet built (backend ready).
⚠️ Session 43 files still pending (see prior passes — unchanged).
⚠️ ADMIN_SECRET still needs adding to Vercel (local .env.local has it: confirm value before prod deploy).

## What Was Done This Session

### Fulfillment Architecture — Decisions Locked ✅
- Drop-ship model confirmed: PU + WPS via API ordering (daily inventory sync + order submission), VTwin manual PO for now
- Own credit card merchant account (gateway TBD) — invoicing/admin visibility built into admin panel
- Canonical product layer: one listing per real-world part, multiple vendor sources behind it, checkout-time optimizer resolves vendor routing for margin + shipping consolidation

### DB Schema — Canonical Products + Orders ✅
New tables, all live on stinkin_catalog:
- `canonical_products` — one row per real-world product, `canonical_sku` (CP-XXXXXX), `our_price`, `match_confidence`
- `product_vendors` — per-vendor source rows (canonical_id, catalog_unified_id, source_vendor, vendor_sku, our_cost, in_stock, stock_qty, is_preferred)
- `canonical_match_proposals` — cross-vendor match review queue (status: pending/confirmed/rejected/applied)
- `orders`, `order_items`, `vendor_orders` — gateway-agnostic order schema with auto-generated `SS-YYYYMMDD-NNNN` order numbers via trigger
- `catalog_unified.canonical_product_id` FK added

### Canonical Products Pipeline ✅
- `build_canonical_products.mjs` — Phase A (1:1 init) + Phase B (OEM matching)
- Phase A: all 90,605 active products given 1:1 canonical_products + product_vendors rows. Rewrote from per-row loop (6/s) to single bulk CTE statement per batch (3,715/s — 35,605 remaining rows done in 9.8s)
- Phase B: OEM-based cross-vendor matching — 469 OEM groups found, 1,537 pairwise proposals written to canonical_match_proposals

### Admin: Canonical Match Review UI ✅
New pages/routes, all live:
- `/admin/canonical-matches?token=...` — grouped-by-OEM review queue, side-by-side product cards (vendor badge, price, vendor#/part#/internal SKU, category, fitment range), bulk confirm/reject per group, "Apply confirmed merges" button
- `/api/admin/canonical-matches` (GET list + POST confirm/reject)
- `/api/admin/canonical-matches/bulk` (group-level confirm/reject by OEM number)
- `/api/admin/canonical-matches/apply` (executes confirmed merges — moves product_vendors, repoints catalog_unified, deactivates duplicate canonical)
- `/api/admin/canonical-matches/sync-fitment` — NEW: syncs union of fitment coverage (catalog_fitment_v2) across all products in a match group, independent of merge confirm/reject. Tags new rows `source='canonical_merge_sync'`
- Page rewritten with self-contained light theme (site's global dark/uppercase CSS was bleeding through) + fitment range display + "⚠ fitment differs" badge per group

### CRITICAL FIX: product_vendors.vendor_sku ✅
- **Bug found via user cross-check against Drag Specialties PDF catalog**: Phase A had populated `product_vendors.vendor_sku` from `catalog_unified.internal_sku` (our internal CAT###### format) — NOT a real vendor ordering number. All 90,605 rows affected.
- Root cause: catalog_unified has separate `vendor_sku` column (real per-vendor ordering #) that Phase A never read.
- Per-vendor correct source identified:
  - PU: `vendor_sku` (when populated) = `brand_part_number` with dashes stripped (e.g. `SF-904-02-2` → `SF904022`). 7,103 PU rows had empty `vendor_sku` — fallback to `sku` (e.g. `DS194976`, matches Drag Specialties PART# DS-194976 exactly)
  - WPS: `vendor_sku` 100% populated, correct as-is (e.g. `72-5444M`)
  - VTwin: `vendor_sku` populated for 37,749/38,365 — correct as-is (e.g. `12-8678`). 616 empty rows — fallback to `sku` with `VT-` prefix stripped
- `004_fix_vendor_sku.sql` — single UPDATE across all 90,605 product_vendors rows. Verified: 0 empty vendor_sku remaining, spot-checked id=7650 now shows `DS194976` matching PDF.
- `build_canonical_products.mjs` Phase A query corrected for future re-runs (new products added later won't repeat this bug)

### Fulfillment Backend — Fully Scaffolded ✅
- `lib/cart/CartContext.jsx` — real localStorage-persisted cart, canonical_sku-based, ready to wrap root layout
- `lib/fulfillment/optimizer.ts` — checkout-time vendor resolution: minimizes vendor count (shipping consolidation), maximizes margin within vendor, falls back on stock, flags VTwin as manual
- `lib/fulfillment/triggerFulfillment.ts` — vendor adapter pattern (PU/WPS/VTwin), pluggable for future vendors. PU + WPS adapters stubbed with real API call shape (need credentials wired), VTwin flags `pending_manual`
- `app/api/checkout/prepare/route.ts` — runs optimizer, creates pending order + order_items + vendor_orders, returns totals for payment step
- `app/api/checkout/charge/route.ts` — gateway-agnostic stub. ONE file to edit once payment gateway is chosen — single TODO block for the charge call, everything else (order marking, fulfillment trigger) wired

### Chase List Quick Fixes ✅
- FLI (Road Glide Limited) confirmed already present in harley_models from prior session — model years inserted
- Composite indexes added: `idx_cfv2_product_modelyear` + `idx_cfv2_modelyear_product` on catalog_fitment_v2 (Engine+Dyna slowness fix)
- "Luggage Racks" → "Racks" rename confirmed already applied from prior session
- ANALYZE run on catalog_fitment_v2
- `FRAMER_TRANSPARENT_FIX.md` reference doc created — palette-specific rgba() replacements for the Framer Motion transparent animation errors (not yet applied to components)

## DB State After This Session

| Table | Change |
|-------|--------|
| canonical_products | 90,605 rows created (1 per active catalog_unified product), 469 flagged for OEM-based merge review |
| product_vendors | 90,605 rows created. vendor_sku corrected for ALL rows (was internal_sku format, now real vendor ordering numbers) |
| canonical_match_proposals | 1,537 pending proposals across 469 OEM groups |
| catalog_unified | canonical_product_id populated for all 90,605 active rows |
| orders / order_items / vendor_orders | tables created, empty (no orders yet — gateway pending) |
| catalog_fitment_v2 | +2 composite indexes, ANALYZE run |
| harley_model_years | FLI year rows confirmed/inserted |

## What Needs to Happen Next

1. **User working through canonical match review queue** (469 groups, /admin/canonical-matches) — ongoing, multi-session. Use "Sync fitment" per group to reconcile fitment coverage regardless of merge decision.
2. Once a meaningful batch of matches reviewed → click "Apply confirmed merges" to execute
3. Decide payment gateway (Authorize.net / NMI / Braintree / etc.) — only blocker for `app/api/checkout/charge/route.ts`
4. Wire `<CartProvider>` into root layout, build cart drawer UI
5. Build checkout page UI (address form, order summary, payment form)
6. Wire real PU + WPS API credentials into `triggerFulfillment.ts` adapters (endpoints currently placeholder URLs)
7. Confirm ADMIN_SECRET value before adding to Vercel prod env
8. Drop remaining session 43 files (unchanged from prior passes)
9. Add FLI year range confirmation (2012–2013 assumed)
10. Fix Framer Motion transparent errors (reference doc ready, not applied)
11. Wire ProductQuickViewModal + BrowseBackButton (unchanged from prior passes)
12. Shipping rate calculation + tax calculation — both currently $0 placeholders in checkout/prepare

---



Session: Forty-Sixth Pass · June 10, 2026

## WHERE WE ARE

VTwin round-2 scrape fully imported (501K fitment rows, 4,255 OEMs, 6,331 universals). browse.ts has disjunctive faceting, fixed Typesense ordering, and variant count fix. CategoryBentoGrid fully wired with images. ModelFinder redesigned. OEM data cleaned. HUMMER + FLHRX added to harley_models.

⚠️ Session 43 files still need dropping: globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts
⚠️ FLI model code still needs adding to harley_models
⚠️ ADMIN_SECRET still needs adding to Vercel
⚠️ ProductQuickViewModal + BrowseBackButton still need wiring into browse/PDP

## What Was Done This Session

### CategoryBentoGrid — Subcategory Overlay ✅
Full overlay system built through multiple iterations:
- Spring animation from clicked tile center (x/y translate + scale), panel physically starts at tile and springs to left-side position
- Left-panel-only design (40% width), right tiles fully visible and interactive
- Large gold ✕ button (56px) straddling panel right edge
- Tanker-font text list with underlines (textDecorationColor dim→gold on hover)
- justifyContent: flex-start (top-aligned subcategories)
- Word-wrap fix: KineticText now groups letters into word spans so "HARLEY" never breaks mid-word
- tileOffset computed via getBoundingClientRect relative to grid container

### CategoryBentoGrid — Layout & Tile Redesign ✅
- New grid: EXHAUST tall narrow (rows 1–2), compact short-name row (LIGHT/ELEC/BRAKES/FOOT at 110px), bottom-right 2×2 HANDLEBAR secondary hero
- Row heights varied: 168/168/130/110/115/138/138px
- HANDLEBAR: deep dark bg (#170f04), gold text (inverse of ENGINE gold bg + dark text)
- Per-area font size map: exhaust ~3.8rem, brakes ~2.8rem, access ~1.25rem — wide typographic range
- 5 category images wired: engine, trans, carb, fenders, susp at public/images/cats/

### browse.ts — Multiple Fixes ✅
- **Disjunctive faceting**: catFacetConditions (no display_category/subcategory) + subcatFacetConditions (no display_subcategory) snapshots. Sidebar now shows all 20 categories.
- **Count fix**: GROUP_KEY_SQL used for COUNT(DISTINCT) — eliminates phantom extra pages.
- **Typesense fix**: page:1 always, explicit sort_by "_text_match:desc,in_stock:desc,computed_price:asc", per_page scales with browse page. Fixes same-product-always-first and broken deep pagination.
- **Variant count fix**: Removed ng LEFT JOIN (expensive full-catalog subquery). COALESCE(vc.variant_count, 1) — name-normalized groups no longer show false "X OPTIONS" badge.

### ModelFinder — Full Redesign ✅
- Text: "FIND YOUR PARTS" (was "Find Parts for Your Harley")
- Font: clamp(72px, 10vw, 144px), centered, flexWrap word-level grouping
- Color: gold palette (#c9a84c base, #ffe680 hottest) — was orange/red
- Era tiles: gridAutoRows 320px (portrait cards), height:100% removed (grid stretch handles it)
- Year slider removed entirely — clicking era navigates directly to /browse?eraSlug=X
- All year/model/step state removed — 318 lines deleted

### VTwin Round-2 Scrape Import ✅
- import_vtwin_scrape_round2.mjs written (optimised: pre-cached SKU + model-year maps, unnest batch inserts)
- 501,478 fitment rows inserted
- 4,255 OEM numbers added to catalog_oem_crossref
- 6,331 products marked is_universal = true
- 56 vintage year gap entries filled (EL, WL, G, etc.)
- HUMMER (Vintage, 1947–1958) + FLHRX (Touring, 2006–2008) added to harley_models

### OEM Data Cleanup ✅
- 4,122 PU catalog numbers (XXXX-XXXX format, source=null from OEM_Crossref_Merged.xlsx) deleted from catalog_oem_crossref
- 4,143 catalog_unified.oem_numbers arrays cleaned via regexp filter
- 15,723 VTwin products had oem_numbers synced from crossref (VT-XXXXX vs bare SKU mismatch was blocking sync)
- Reindexed after each cleanup

### Final State
- catalog_fitment_v2: ~5M rows, VACUUM ANALYZE done
- mv_family_product_ranges: refreshed
- Typesense: reindexed clean
- VTwin fitment coverage: 48.1% (ceiling — ~20K remaining have no model data available)
- OEM coverage: 22,016 products with oem_numbers across all vendors

## DB State After This Session

| Table | Change |
|-------|--------|
| catalog_fitment_v2 | +501,478 rows from VTwin round-2. VACUUM ANALYZE run. |
| catalog_oem_crossref | +4,255 VTwin OEM rows. -4,122 PU catalog numbers. |
| catalog_unified | 15,723 VTwin oem_numbers arrays synced. 6,331 is_universal=true marks. |
| harley_models | HUMMER (Vintage) + FLHRX (Touring) added with year ranges. |
| harley_model_years | 56 gap entries + 3 FLHRX years added. |

## What Needs to Happen Next

1. Drop remaining session 43 files (globals.css, layout.tsx, BespokeSerif-Variable.ttf, FilterSidebar.jsx, ProductQuickViewModal.jsx, BrowseBackButton.jsx, products-slug-route.ts)
2. Add FLI to harley_models (Road Glide Limited — confirm year range)
3. Add ADMIN_SECRET to Vercel
4. Fix Framer Motion transparent errors
5. Investigate Engine+Dyna query slowness — composite index on catalog_fitment_v2 (product_id, model_year_id)
6. Wire ProductQuickViewModal into browse page
7. Wire BrowseBackButton into PDP
8. Rename "Luggage Racks" subcategory → "Racks" in DB + CategoryBentoGrid SUBCATEGORIES map

---

# ——— FORTY-FIFTH PASS (June 8, 2026) ———

Session: Forty-Fifth Pass · June 8, 2026

## WHERE WE ARE

display_subcategory taxonomy COMPLETE across all 20 categories. ~78,000 products mapped. Final coverage 87–97% for core categories. Hundreds of misclassified products relocated to correct display_categories throughout. Typesense reindexed with full subcategory data live.

⚠️ CategoryBentoGrid + ModelCatalogClient + session 43 files still need to be dropped into codebase.
⚠️ mat view refresh + universal mark still pending.
⚠️ FLHRX + FLI model codes still need adding to harley_models.

## What Was Done This Session

### display_subcategory Taxonomy — All Remaining Categories ✅

All scripts in `scripts/ingest/`. All BEGIN/COMMIT. Each pass included gap analysis + targeted cleanup.

#### Handlebar & Controls — 9 subcategories, 95% mapped
Cables & Lines (4,182) · Handlebars (2,586) · Risers & Clamps (863) · Levers & Controls (768) · Mirrors (678) · Grips (624) · Throttle & Accessories (461) · Switches & Wiring (134) · ~562 NULL

Key: WPS uses "LW CABLE" for extended cables. "BURLY CNTRL KIT" = Burly Brand ape hanger cable kit. `%memory foam grip%` needed for WPS heated grip products.

#### Brakes — 8 subcategories, 94% mapped
Brake Lines & Hoses (2,307) · Rotors & Drums (849) · Brake Pads & Shoes (839) · Calipers (610) · Brake Hardware (414) · Master Cylinders (315) · Brake Conversion Kits (14) · ~326 NULL

Moves: PU "MISCELLANEOUS ELECTRICAL" (16 rows) moved to Electrical. Air cleaner backing plates moved to Carburetion & Fuel. Shifter levers moved to Foot Controls. "Econoline" and "Ebony" are WPS brake line brand names needing explicit patterns.

#### Suspension — 8 subcategories, 88% mapped
Fork Tubes & Internals (879) · Shocks & Springs (762) · Triple Trees & Stems (650) · Fork Lowers & Sliders (273) · Swingarms (225) · Fork Seals & Boots (212) · Lowering & Lift Kits (159) · ~438 NULL

Moves: Valve spring kits (Kibblewhite etc.) moved to Engine/Cams & Valvetrain. Spring fork fenders → Fenders & Body. Spotlamp kit → Lighting. Brake shackle bar → Brakes. "Dog bone" = lowering link.

#### Lighting — 8 subcategories, 95% mapped
Auxiliary Lighting (968) · Turn Signals (719) · Bulbs (654) · Taillights (622) · Headlights (619) · License Plate Lighting (266) · Lighting Controls (172) · ~199 NULL

Key additions: `%spotlamp%` → Auxiliary Lighting (VTwin vintage spotlight products). License plate frames/holders → License Plate Lighting. Marker/indicator lamps → Auxiliary.

#### Wheels & Tires — 7 subcategories, 92% mapped
Wheels (728) · Axles & Spacers (595) · Tires & Tubes (538) · Hubs & Spokes (385) · Bearings & Seals (238) · Valves & Balancing (140) · ~236 NULL

Key: Spoke sets were missing — only had `%wheel spoke%`, needed `%spoke set%` and `% spoke %`. WPS "FR /RR" prefix = front/rear complete wheel assemblies. Fork neck bearing moved to Suspension/Triple Trees.

#### Foot Controls — 9 subcategories, 93% mapped
Footpegs (893) · Shifters (575) · Floorboards (519) · Kickstands (278) · Highway Bars & Pegs (175) · Forward Controls (132) · Brake Pedals (122) · Rearsets & Mid Controls (93) · ~225 NULL

Moves: Wyatt Gatling exhaust → Exhaust. Luggage rack → Luggage & Racks. Solo seat → Seating.

#### Exhaust — 4 subcategories, 93% mapped
Exhaust Systems (720) · Exhaust Parts (650) · Mufflers (648) · Headers & Pipes (561) · ~192 NULL

Moves: Exhaust valves → Engine/Heads & Valves. Brake crossover → Brakes. Grip sets → Handlebar & Controls. VTwin "Shocker Pipes", "Lake Side Pipe", "Holeshot Exhaust" = complete exhaust systems.

#### Frame & Hardware — 5 subcategories, 87% mapped
Hardware & Fasteners (1,888) · Frame Parts (335) · Kickstands (152) · Body Panels (63) · Protection (53) · ~375 NULL

Moves: PU "MISCELLANEOUS ENGINE PARTS" (22 rows) moved to Engine. Rolling chassis/bike kits → Frame Parts. Shifter shaft → Transmission.

#### Seating — 4 subcategories, 95% mapped
Seats (3,186) · Seat Hardware (248) · Backrests (243) · Seat Pads & Covers (71) · ~199 NULL

#### Luggage & Racks — 5 subcategories, 93% mapped
Sissy Bars (425) · Saddlebags (314) · Bags & Packs (186) · Luggage Racks (160) · Luggage Parts (25) · ~80 NULL

#### Instrumentation — 3 subcategories, 97% mapped
Speedometers (665) · Gauges (333) · Dash & Trim (108) · ~40 NULL

#### Security & Covers — 3 subcategories, 93% mapped
Security (107) · Bike Covers (57) · Shelters & Storage (13) · ~16 NULL

#### Tools & Chemicals — 3 subcategories, 71% mapped
Tools (772) · Chemicals & Lubricants (527) · Cleaners & Detailing (63) · ~547 NULL

Moves: Transmission gear kit, electrical items, bike covers moved to correct categories. WPS specialty items (octane booster, diesel treatment) caught via product-specific patterns.

#### Riding Gear & Apparel — 6 subcategories, 65% mapped
Helmets (1,452) · Gloves (585) · Jackets & Vests (186) · Pants & Base Layers (85) · Footwear (74) · Accessories (59) · ~1,305 NULL

Moves: Switchblade lowers → Fenders & Body. Phone/handlebar mounts → Accessories & Misc. Handguards → Handlebar & Controls. Side plates → Fenders & Body. High NULL rate expected — WPS uses heavy abbreviations.

#### Accessories & Misc — 5 subcategories, 6% mapped
Books & Manuals (155) · Trailer & Towing (29) · Decals & Emblems (29) · Tie-Downs & Transport (20) · Cooling Systems (14) · ~3,809 NULL

Moves from Accessories & Misc to correct categories: Primary covers → Transmission. Belt/chain drive kits → Transmission. Shifter levers → Foot Controls. Axles → Wheels & Tires. Motor mounts → Engine. Valve kits → Engine. ABS sensors → Brakes. Brake drums → Brakes. Grip sets → Handlebar & Controls. Screws/bolts → Frame & Hardware. (~1,274 products correctly relocated)

### Final Coverage Summary
| Category | Total | Mapped | % |
|----------|-------|--------|---|
| Instrumentation | 1,146 | 1,106 | 96.5% |
| Fenders & Body | 3,908 | 3,748 | 95.9% |
| Carburetion & Fuel | 5,261 | 5,041 | 95.8% |
| Lighting | 4,219 | 4,020 | 95.3% |
| Seating | 3,947 | 3,748 | 95.0% |
| Handlebar & Controls | 11,025 | 10,463 | 94.9% |
| Transmission & Clutch | 7,738 | 7,334 | 94.8% |
| Brakes | 5,763 | 5,437 | 94.3% |
| Luggage & Racks | 1,190 | 1,110 | 93.3% |
| Exhaust | 2,771 | 2,579 | 93.1% |
| Foot Controls | 3,152 | 2,927 | 92.9% |
| Security & Covers | 222 | 206 | 92.8% |
| Wheels & Tires | 3,035 | 2,799 | 92.2% |
| Electrical | 6,674 | 6,146 | 92.1% |
| Engine | 13,060 | 11,911 | 91.2% |
| Suspension | 3,603 | 3,165 | 87.8% |
| Frame & Hardware | 2,994 | 2,619 | 87.5% |
| Tools & Chemicals | 1,909 | 1,362 | 71.3% |
| Riding Gear & Apparel | 3,746 | 2,441 | 65.2% |
| Accessories & Misc | 4,056 | 247 | 6.1% |

## DB State After This Session

| Table | Change |
|-------|--------|
| catalog_unified | display_subcategory fully mapped across all 20 categories. ~2,000+ misclassified products moved to correct display_categories during cleanup passes. |

## What Needs to Happen Next

1. Drop CategoryBentoGrid + ModelCatalogClient + session 43 files into codebase
2. Run mat view refresh + universal mark (see CHASE_LIST)
3. Add FLHRX + FLI model codes to harley_models
4. Add ADMIN_SECRET to Vercel
5. Fix Framer Motion transparent animation errors
6. Investigate browse query slowness Engine + Dyna (3.5–7.6s)
7. Wire ProductQuickViewModal + BrowseBackButton into browse/PDP pages

---

# ——— FORTY-FOURTH PASS (June 8, 2026) ———

CategoryBentoGrid built. ModelCatalogClient rebuilt. VTwin scraper round 2 imported (48% coverage). display_subcategory mapped for Engine, Electrical, Carburetion & Fuel, Fenders & Body, Transmission & Clutch. VACUUM ANALYZE run. placeholder.jpg created.

---

# ——— FORTY-THIRD PASS (June 7, 2026) ———

Font system overhaul. FilterSidebar inline search. ProductQuickViewModal 3-tab rebuild. BrowseBackButton. API route. PDP SKU fix. catalog_oem_crossref schema. VTwin scraper round 2 started.

---

# ——— FORTY-SECOND PASS (June 5, 2026) ———

Filtering audit. browse.ts fixes. FilterSidebar chips. Engine Era. 12 model codes + 5 aliases. VTwin import. Reindex 90,536.

---

# ——— FORTY-FIRST PASS (June 5, 2026) ———

Homepage rebuilt. ModelFinder. Font system. VariantSelector Mode A. 199 sub-groups merged. Reindexed ×2.

---

# ——— FORTIETH PASS (June 4, 2026) ———

VTwin SKU duplicates. import_vtwin_fitment_partial.mjs patched ×4. 185,234 fitment rows.

---

# ——— THIRTY-NINTH / THIRTY-EIGHTH PASS (June 4, 2026) ———

Fitment filter fix. OEM cleanup. Admin inline edit. catalog_review_flags. Next.js 15 params fix.

---

# ——— THIRTY-SEVENTH PASS (June 3, 2026) ———

FlowingMenu. /models page. mv_family_product_ranges mat view. Font system. VTwin scraper finished.
