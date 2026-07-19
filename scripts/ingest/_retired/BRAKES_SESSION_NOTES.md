# BRAKES PASS — RUNNING NOTES
(collected during classifier iteration, July 10 2026 — review together at end of session)

## 1. WPS "Brake - front" raw category is NOT pure brakes
CONFIRMED, round 2 dry run (96 fallback rows, up from checking round 1's 118).
After fixing 4 real classifier gaps (CAL abbrev, spider/bracket, PADS
adjacency, fitting/adapter no-keyword rows), the fallback count dropped
118 -> 96, but nearly everything left is NOT a brake part at all. This is
a source-data problem, not a classifier gap — no amount of regex tuning
fixes a lever-set SKU that legitimately covers both clutch and brake.

Confirmed non-brake rows (should not be in Brakes at all — display_category
is wrong, not just display_subcategory):
  CLUTCH:
    - id 41653  'WIDE V-CUT CLUTCH LEVER CHROME XL 04-13'
    - id 41649  'WIDE V-CUT CLUTCH LEVER CHROME BIG TWIN OE# 45015-96'
    - id 41651  'WIDE V-CUT CLUTCH LEVER BLACK DYNA 07-17'
    - id 48816  'TORQ-DRIVE CLUTCH INDIAN FTR'
    - id 45874  'TORQ-DRIVE CLUTCH DYNA'
    - id 41302  'CLUTCH ACTUATOR ADAPTER CHROME'
  SHIFTER/TRANS:
    - id 41927  'TRANS SHIFT LEVER BT 85-96 FLA BIG TWIN 85-96'
    - id 42152  'INNER SHIFT ARM W/O-RINGS CHROME 33668-90B'
    - id 42153  'INNER SHIFT LEVER CHROME 33789-03'
    - id 42157  'SHIFT LEVER CHR XL `04-24 34660-04A'
    - id 42159  'SHIFT LEVER DYNA GLIDE CHROME 34564-90A'
  AIR CLEANER (totally unrelated):
    - id 73706  'Ultima Air Cleaner Backing Plate Adapter'

AMBIGUOUS — lever SETS that legitimately cover both brake and clutch sides,
sold as one SKU. Not a classification error; a genuine dual-purpose product.
Needs a business decision (split by name detail if possible, or a shared
"Levers" home, or duplicate-list into both categories?):
    - id 57145  'ANTHEM SHORTY LEVER SET BLACK 22-25 SPORTSTER'
    - id 57139  'ANTHEM SHORTY LEVER SET BLACK 25 SOFTAIL'
    - id 57421  'SHORTY MX LEVER SET BLACK 25-26 SOFTAIL'
    - id 42199  'OLD SCHOOL HANDCONTROLS BLACK'
    - id 53559  'LEVER END GOLD'
    - id 53538  'LEVER END RED'
    - id 42195  'SPORTSTER LEVERS BLACK XL `14-24'
    - id 58491  'SPORTSTER LEVERS CHROME XL `14-24'
    - id 46238  'RACE LEVERS CABLE BLACK `96-07 FLH/T'
    - id 46239  'RACE LEVERS CABLE CHROME `96-07 FLH/T'
    - id 46240  'RACE LEVERS CABLE BLACK 08-13 FLH/T'
    - id 46241  'RACE LEVERS CABLE CHROME `08-13 FLH/T'
    - id 46242  'RACE LEVERS HYDRAULIC BLACK `14-16 FLH/T'
    (likely several more RACE LEVERS variants in the remaining ~66 rows not
    yet sampled — pull the full 96-row list before deciding)

Likely correctly a rotor but name has no clean brake signal — verify:
  - id 57029  '280MM HD PAN AMERICAN'
  - id 65219  'Floating Stainless Steel Mirror Polished 11.8 inch Front Bra...'
              (name is truncated in display — full name likely ends in
              "...Front Brake Rotor" or similar; NOT actually a mirror.
              Check the untruncated name before deciding.)

Ambiguous / needs individual look:
  - id 66176  'Dust Shield Set Zinc'        (no brake keyword, could be wrong category entirely)
  - id 87936  'Reservoir Assembly Chrome'   (could be Master Cylinders if verified)
  - id 93700  'DOT 4 Brake Fluid'           (legit brake product, needs a subcategory home —
              proposed: Brake Hardware, or a future "Fluids & Chemicals" bucket)

DECISION (Laken, July 10 2026): split the apply. Populations 1b/2/3 and the
430 confident Population 1 matches apply now. The 96 held-back Population 1
rows stay NULL (not force-written to Brake Hardware) for a dedicated manual
pass — script updated (`fix_brakes_taxonomy.mjs`) to filter on `_matched`
before writing, and logs the held-back ids on apply for follow-up.

ACTION: after Brakes pass is applied, run a follow-up audit scoped to
WPS raw_category='Brake - front' AND display_subcategory='Brake Hardware'
(the fallback bucket) to catch every miscategorized clutch/shifter/misc row
in one pass, rather than patching them one at a time now.

## 2. Other categories may have the same "raw category is a grab-bag" issue
Worth checking whether other single-vendor raw categories (WPS especially)
mix unrelated part types the way "Brake - front" does, before assuming any
future within-category rebuild's raw-category signal is trustworthy.

---
(add more entries below as they come up)
