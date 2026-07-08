# Category/Subcategory Rebuild — Plan v1
**Goal:** replace whatever's currently assigning `display_category`/`display_subcategory` (looks like several overlapping passes from different sessions) with one deterministic, auditable pipeline. Full reset — nothing carries forward from old passes.

---

## 1. Keep the 20-category shell
The category *names* are sound (confirmed against the full raw-category breakdown). The problem is 100% in the assignment logic, not the taxonomy. Rebuilding the category list from zero would be throwing away something that isn't broken. Recommend keeping it, with two real changes below.

## 2. Two structural changes worth making during the reset
- **`SADDLEBAGS` (WPS) → move from Seating to Luggage & Racks.** Confirmed bug, not a judgment call.
- **Split `TANK` / `TANK GROUP-GAS AND OIL`** by keyword into Fenders & Body > Gas Tanks (gas/fuel tank) vs Transmission & Clutch > Oil System (oil tank), instead of one fixed category per raw value.

## 3. Deterministic mapping table (≈95% of volume — no ambiguity in the data)
Built directly from the raw_category → display_category breakdown you pasted, using the dominant (>90%) outcome per raw value:

| Raw category (any vendor) | → display_category |
|---|---|
| BRAKING, Brake - front, BRAKE LEVER FRONT | Brakes |
| CARBURETION-FUEL, Carburetor, Intake/Carb/Fuel System, AIR FILTER ENGINE | Carburetion & Fuel |
| ELECTRICAL SYSTEM, ELECTRONICS, Battery, SWITCHES*, SPARK PLUGS, STARTER MOTOR, Audio & Communication, HEADLAMP*→see Lighting below | Electrical |
| ENGINE, Engine, ENGINE MOUNTS, Gasket Sets, Oil Filter, Pistons & piston rings, Connecting Rods | Engine |
| EXHAUST, EXHAUST SYSTEM, EXHAUST GROUP | Exhaust |
| FENDER, WINDSHIELD*, DECALS FUEL TANK, FUEL CAP | Fenders & Body |
| FOOTBOARDS OPERATOR, FOOT CONTROLS (PU only — see VTWIN exception below) | Foot Controls |
| FRAME AND BODY, HARDWARE*, Hardware Listing | Frame & Hardware |
| HANDLEBAR*, CABLE CLUTCH CONTROL, CLAMPS HANDLEBAR*, MIRRORS, RISER HANDLEBAR, THROTTLE CONTROL, Hand Controls | Handlebar & Controls |
| INSTRUMENT*, Gauges | Instrumentation |
| HEADLAMP, LIGHTING-LICENSE | Lighting |
| LUGGAGE*, SISSY BAR-BACKREST-RACK, SADDLEBAGS (corrected) | Luggage & Racks |
| Helmets, HELMET AND SHIELD, Apparel, Riding Gear | Riding Gear & Apparel |
| SEATING, SEATS | Seating |
| Security, SECURITY-COVERS-SHELTERS | Security & Covers |
| FORK FRONT, SHOCK ABSORBERS, SUSPENSION GROUP-FRONT/REAR, TRIPLE CLAMP | Suspension |
| BELT CHAIN SPROCKETS, Chains, CLUTCH, DRIVE TRAIN, SPROCKET BELT, TRANSMISSION-CLUTCH | Transmission & Clutch |
| TOOLS*, Chemicals & Maintenance, Tools & Shop Equipment | Tools & Chemicals |
| TIRE AND TUBE, Tires & Wheels, WHEEL AND RIM | Wheels & Tires |
| TRANSPORTATION, PROMOTIONAL ITEMS, GRAPHICS | Accessories & Misc |

(`*` = all variants incl. "GROUP" suffixes and case variants)

## 4. Needs a keyword classifier, not a fixed mapping (raw category is inherently mixed)
| Raw category | Why | Approach |
|---|---|---|
| VTWIN `COMMON MISC` / `COMMON MISC GROUP` (3,300+ rows) | Genuine grab-bag — wheels, brake hardware, switches, seats all present | Classify by product name keywords against the full category list; only fall back to Accessories & Misc if nothing matches |
| VTWIN `ENGINE` spillover (~1,200 rows going to Electrical/Carb/Tools/Brakes) | Raw category too broad — ignition coils, regulators etc. filed as "ENGINE" | Keyword override wins over raw-category default when there's a strong signal (e.g. "coil", "stator", "regulator" → Electrical even if raw says ENGINE) |
| VTWIN `FOOT CONTROLS` → Exhaust (213 rows) | Looks like bundled kit products (forward control + exhaust bracket kits) tagged under one vendor category | Needs eyeball review — flagging rather than guessing |
| WPS `Covers,` (477 rows, all currently NULL) | Generic name, could be engine covers, seat covers, fork covers, etc. | Full keyword classification, no default |
| WPS `Accessories` (mixed Riding Gear/Fenders/null) | Vendor dumped multiple product types under one label | Keyword split: helmet/jacket/glove → Riding Gear; else evaluate per keyword |
| `TANK` / `TANK GROUP-GAS AND OIL` | See §2 | gas/fuel → Fenders & Body; oil → Transmission & Clutch |

## 5. Decisions needed from you before I finalize the script
1. **Kickstands** currently splits Foot Controls (278) / Frame & Hardware (139). Pick one canonical home, or split by product type (e.g. jiffy-stand assemblies → Foot Controls, kickstand mounting hardware/springs → Frame & Hardware)?
2. **Gas Caps & Petcocks** splits Carburetion & Fuel / Fenders & Body. Same question — one home, or split gas caps (bodywork) from petcocks (fuel system)?
3. Once I see the null-category root-cause query results — some of those 2,028 rows may share a raw_category value nobody ever mapped. Might reveal a 6th bucket needing a decision.

## 6. Safety approach for the actual migration
Given the session 73 incident where an unfiltered rebuild step wiped 6 ADMIN-curated groups: this rebuild will write to **shadow columns** (`display_category_v2`, `display_subcategory_v2`) first, never touching the live columns until you've spot-checked the output. Only after verification does a single `UPDATE ... SET display_category = display_category_v2` promote it live. Nothing is destructive until that final step, and that step is your call to run.

## 7. Third tier — branching below display_subcategory

Worth adding, but only where a subcategory is both large and genuinely hiding multiple distinct product groups — not uniformly across all ~124 subcategories. A third tier under a subcategory that's already tight (e.g. Instrumentation > Dash & Trim, 95 rows) just adds noise.

**Data model:** add `display_subcategory_detail` as a third flat column, following the exact pattern already established by `display_category`/`display_subcategory` (CASE-mapped, synced by script, indexed as its own Typesense facet field). A proper parent/child tree table would be more "correct" in the abstract, but it breaks from every existing convention in this codebase (flat CASE-mapped columns, flat Typesense facets) for no real benefit at this catalog's size — recommend staying consistent.

**Candidates identified from volume alone** (subcategories >700 rows are the ones where a single facet is plausibly doing too much work — see `tier3_candidate_finder.sql` query 1 for the full ranked list):
- Handlebar & Controls > Cables & Lines (4,117)
- Engine > Gaskets & Seals (3,052)
- Frame & Hardware > Hardware & Fasteners (1,980)
- Transmission & Clutch > Clutch Plates & Kits (1,757)
- Brakes > Brake Lines & Hoses (2,275)

`tier3_candidate_finder.sql` includes a prefix-frequency query (finds natural clusters from real name text, no guessing) plus hypothesis-tests for the first three candidates above — run these and we'll see the real split before committing to keyword lists, same discipline as the category-level fix.

**Stopping rule:** only promote a tier-3 split to production if each resulting bucket clears roughly 50–100 products — below that, it's a filter option nobody will meaningfully use, and it's better left flat.

**UI implication:** in the Shop Manual nav redesign, this reads naturally as an indented tree inside the Subcategory dropdown panel (Category → Subcategory → Detail), styled like a parts index rather than a third row of pills — keeps the "ledger" feel instead of turning into a mega-menu maze.

---
*Next: run `null_category_rootcause.sql` and `tier3_candidate_finder.sql`, and give me your call on Kickstands / Gas Caps & Petcocks. Then I'll write the actual `.mjs` rebuild script — mapping table + keyword classifier + shadow-column safety + tier-3 split where warranted — ready to execute in Claude Code (I don't have DB access from this chat session).*
