# Stinkin' Supplies — Filtering System Roadmap
**Created:** June 5, 2026 · **Last Updated:** June 8, 2026 (Session 45)
**Scope:** browse.ts · FilterSidebar · Fitment data · Typesense facets · display_subcategory taxonomy

---

## Status: COMPLETE ✅

All filter architecture phases complete. display_subcategory taxonomy complete across all 20 categories.

---

## Phase 1 — Quick Unblocks ✅ COMPLETE
All browse.ts and fitment bugs fixed. See session 42 notes.

## Phase 2 — Sidebar UX ✅ COMPLETE
All FilterSidebar improvements shipped. See session 42–43 notes.

## Phase 3 — Fitment Coverage ✅ COMPLETE (round 2)
VTwin 48% · PU 49% · WPS 41%. Ceiling reached — remaining products are universal/generic.

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
5. `BEGIN; UPDATE ...; COMMIT;` — `WHERE display_category = 'X' AND is_active = true` — never NULL-guard needed since CASE maps or leaves NULL
6. Verify, iterate on blanks with name-based diagnostic query
7. Reindex

### Scripts in scripts/ingest/
All subcategory mapping scripts: `apply_subcategory_{category}.sql` for each category.
Full list in HANDOFF_LOG session 44–45.

---

## OEM Pipeline ✅ COMPLETE
catalog_oem_crossref is single source of truth. product_id FK added. Unique index on (sku, oem_number).

---

## Open Issues

| Layer | Issue | Status |
|-------|-------|--------|
| Browse query | Engine+Dyna 3.5–7.6s | ⏳ Investigate catalog_fitment_v2 composite index |
| Framer Motion | transparent animation errors | ⏳ May be in computed variant values |
| Model codes | FLHRX + FLI missing | ⏳ Add to harley_models |
| Typesense | No reindex automation | ⏳ Future |
| display_subcategory | Accessories & Misc 94% NULL | Accepted — catch-all by design |

---

*Filter Roadmap — Last updated June 8, 2026 · Session 45 — display_subcategory taxonomy COMPLETE*
