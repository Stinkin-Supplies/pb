# Stinkin' Supplies — Filtering System Roadmap
**Created:** June 5, 2026 · **Last Updated:** June 26, 2026 (Session 60)
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

**VTwin gap remaining:** 18,890 SKUs not found on vtwinmfg.com (discontinued/removed from site). ~4,035 remain with no fitment but on-site — further scraper runs could improve this marginally.

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
OEM supersession chain: oem_supersession table (**485 pairs** — 283 original inferred + 202 vtwin hardware added session 59) + mv_oem_fitment_coverage (683K rows, refreshed session 59). Recursive forward+backward chain traversal. browse.ts pre-fetches chain IDs when year+model set.

⚠️ oem_supersession schema note: `from_oem_norm`/`to_oem_norm` are **GENERATED columns** — do not include in INSERT statements.

**Session 60 additions to catalog_oem_crossref:**
- vtwin_scrape: +5,511 rows (import_vtwin_oem_crossref.mjs)
- HD_OEM battery: +63 rows (import_battery_oem_crossref.mjs)
- Total: **65,434 rows**

---

## Open Issues

| Layer | Issue | Status |
|-------|-------|--------|
| Browse query | Engine+Dyna composite index | ✅ Added session 47 |
| Framer Motion | Transparent animation errors | ⏳ FRAMER_TRANSPARENT_FIX.md ready, not applied |
| Model codes | FLHRX + FLI missing | ✅ Both added session 47 |
| Model codes | 6 new 2026 codes added (session 59) | ✅ FLHXL, FLHXLSE, FLHXSTSE, FLHLT, FLHLTSE, RA1250L |
| Typesense | No reindex automation | 🔵 Future |
| Typesense | Reindex after session 58 VTwin fitment additions | ✅ Done session 60 |
| display_subcategory | Accessories & Misc 94% NULL | Accepted — catch-all by design |
| Browse ?category= param | Sticky URL bug | ✅ Fixed session 57 |
| OEM number search | Not searching OEM arrays | ✅ Fixed session 57 (unnest ILIKE) |
| Softail + Suspension + Triple Trees filter | Untested since session 51 | ⏳ Retest |
| VTwin fitment | Additional ~4,035 on-site products with no fitment | 🔵 Low priority — marginal improvement |
| VTwin attributes | Stringified JSON in product_details | ✅ Fixed session 60 at source; PDPTabs workaround removed |
| VTwin OEM crossref | ~12,265 scraped OEM numbers not in crossref | ✅ Fixed session 60 — 5,511 rows imported |

---

*Filter Roadmap — Last updated June 26, 2026 · Session 60*
