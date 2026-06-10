# STINKIN' SUPPLIES — HANDOFF LOG

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
