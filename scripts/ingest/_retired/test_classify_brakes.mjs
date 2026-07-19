// test_classify_brakes.mjs
// Regression harness for classify_brakes.mjs.
// Built from every real row seen in audit_brakes_scope.mjs output (session:
// July 10 2026 Brakes rebuild) plus every known-good existing mapping.
// Run BEFORE any dry run against the live DB — a 5,881-row dry run per rule
// edit is too slow to iterate against (session-77 lesson).
//
// Usage: node scripts/ingest/test_classify_brakes.mjs

import { classify, isBrakeCandidate, SUBCATEGORIES } from './classify_brakes.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(desc, row, scope, expected) {
  const result = classify(row, scope);
  const ok = result.subcategory === expected;
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push({ desc, row, scope, expected, got: result });
  }
}

function checkCandidate(desc, row, expected) {
  const result = isBrakeCandidate(row);
  if (result === expected) {
    pass++;
  } else {
    fail++;
    failures.push({ desc, row, scope: 'candidate', expected, got: { candidate: result } });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// WITHIN-BRAKES: NULL rows from audit section 4 (sample of 60) — ground
// truth assigned by hand from the product name. scope='within'.
// ─────────────────────────────────────────────────────────────────────────

check('WPS front brake line', { id: 57197, name: 'FRONT BRAKE LINE SOFTAIL BLK SLIM 18-21 ABS +6', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('VTwin rotor spacer', { id: 64187, name: 'Rear Pulley Brake Disc Spacer Polished 15/16 inch Thickness', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.ROTORS_DRUMS);
check('VTwin stainless brake hose', { id: 64799, name: 'Stainless Steel Brake Hose 76 inch', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('VTwin black brake hose', { id: 63872, name: 'Black Stainless Steel Brake Hose 47 inch', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('WPS lever set (master cylinder lever, not pedal)', { id: 57143, name: 'ANTHEM LEVER SET BLACK 22-25 SPORTSTER', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);
check('VTwin front brake hose kit', { id: 65699, name: 'Stainless Steel Front Brake Hose Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('WPS straight banjo', { id: 41305, name: 'STRAIGHT BANJO EBONY 3/8"', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('WPS clutch master (RSC) — brand crosses into clutch but "MASTER" governs', { id: 57499, name: 'RSC FRONT CLUTCH MASTER FOR 1" BARS', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.MASTER_CYLINDERS);
check('WPS heritage clutch lever — lever, not a brake pedal', { id: 56170, name: 'HERITAGE CLUTCH LEVER `15-25 ALL SCOUTS', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);
check('WPS front brake line dyna', { id: 57202, name: 'FRONT BRAKE LINE DYNA BLK STREET BOB 06-17 NON ABS', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('WPS 45deg banjo', { id: 48521, name: '45 DEG 3/8 (10MM) BANJO', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('WPS sintered brake pads', { id: 57045, name: 'BRAKE PADS HH SINTERED FR/RR', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.PADS_SHOES);
check('WPS radial mount caliper (CAL abbrev, fixed round 2)', { id: 52609, name: '6 PIST FRT RADIAL MNT CAL L/H CHROME', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('WPS clutch lever barrel adjuster', { id: 53556, name: 'CLUTCH LEVER BARREL ADJUSTER RED', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);
check('VTwin brake pedal mount plate', { id: 497426, name: 'Brake Pedal Mount Plate Rear Zicad', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.PEDALS_PADS);
check('WPS front master cylinder rebuild', { id: 57432, name: 'FRONT MASTER CYLINDER REBUILD 41700088', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.MASTER_CYLINDERS);
check('VTwin replacement rail brake pedal rubber', { id: 68349, name: 'Replacement Rail Style Brake Pedal Rubber', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.PEDALS_PADS);
check('WPS master cyl cover', { id: 43392, name: 'MASTER CYL COVER 96-06 CHROME', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.MASTER_CYLINDERS);
check('WPS caliper rebuild kit (diff cal, CAL abbrev fixed round 2)', { id: 52626, name: '4 PIST DIFF CAL REBUILD KIT 500 SERIES', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('WPS front caliper rebuild kit', { id: 57471, name: 'FRONT CALIPER REBUILD KIT 42943-08', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('VTwin front brake disc', { id: 65902, name: '11.5 inch Revolver Front Brake Disc', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.ROTORS_DRUMS);
check('VTwin hydraulic brake pedal', { id: 65517, name: 'Stainless Steel Hydraulic Brake Pedal', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.PEDALS_PADS);
check('WPS HD brake tee', { id: 41931, name: 'HD BRAKE TEE OE# 44311-80 1 CENTER INVERTED FLARE', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('WPS rear brake master cyl cover', { id: 43437, name: 'RR BRAKE MSTR CYLINDER COVER TOURING 05-07 SOFTAIL 06-UP', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.MASTER_CYLINDERS);
check('VTwin colony dust shield — brake-adjacent hardware, brand=Colony but name has no brake keyword', { id: 91056, name: 'Upper Bearing Dust Shield Zinc Plated', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE); // FALLBACK case, flag for review
check('VTwin ultima caliper w/ bracket', { id: 65117, name: 'Ultima Brake Caliper with Rear Bracket Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('WPS race levers cable', { id: 46241, name: 'RACE LEVERS CABLE CHROME `08-13 FLH/T', source_vendor: 'WPS', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);

// ─────────────────────────────────────────────────────────────────────────
// WITHIN-BRAKES: PU raw-subcategory rows (should hit PU_RAW_SUBCATEGORY_MAP)
// ─────────────────────────────────────────────────────────────────────────

check('PU raw: brake lines stainless', { id: 1, name: 'Some Brake Line Product', source_vendor: 'PU', raw_subcategory: 'BRAKE LINES-HOSES-STAINLESS STEEL' }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('PU raw: brake rotors street', { id: 2, name: 'Some Rotor Product', source_vendor: 'PU', raw_subcategory: 'BRAKE ROTORS - STREET' }, 'within', SUBCATEGORIES.ROTORS_DRUMS);
check('PU raw: sintered pads', { id: 3, name: 'Some Pad Product', source_vendor: 'PU', raw_subcategory: 'BRAKE PADS - SINTERED METAL' }, 'within', SUBCATEGORIES.PADS_SHOES);
check('PU raw: brake line hardware', { id: 4, name: 'Some Hardware Product', source_vendor: 'PU', raw_subcategory: 'BRAKE LINE HARDWARE' }, 'within', SUBCATEGORIES.HARDWARE);
check('PU raw: caliper kits', { id: 5, name: 'Some Caliper Product', source_vendor: 'PU', raw_subcategory: 'BRAKE CALIPER-CALIPER KITS' }, 'within', SUBCATEGORIES.CALIPERS);
check('PU raw: rear master cylinders', { id: 6, name: 'Some MC Product', source_vendor: 'PU', raw_subcategory: 'REAR MASTER CYLINDERS & PARTS' }, 'within', SUBCATEGORIES.MASTER_CYLINDERS);
check('PU raw: conversion kits', { id: 7, name: 'Some Kit Product', source_vendor: 'PU', raw_subcategory: 'BRAKE CONVERSION KITS' }, 'within', SUBCATEGORIES.CONVERSION_KITS);
check('PU raw: brake drums-cylinders', { id: 8, name: 'Some Drum Product', source_vendor: 'PU', raw_subcategory: 'BRAKE DRUMS-CYLINDERS' }, 'within', SUBCATEGORIES.ROTORS_DRUMS);
check('PU raw: brake shoes', { id: 9, name: 'Some Shoe Product', source_vendor: 'PU', raw_subcategory: 'BRAKE SHOES' }, 'within', SUBCATEGORIES.PADS_SHOES);
check('PU raw: brake linings', { id: 10, name: 'Some Lining Product', source_vendor: 'PU', raw_subcategory: 'BRAKE LININGS' }, 'within', SUBCATEGORIES.PADS_SHOES);
check('PU raw: caliper covers-inserts', { id: 11, name: 'Some Cover Product', source_vendor: 'PU', raw_subcategory: 'BRAKE CALIPER COVERS-INSERTS' }, 'within', SUBCATEGORIES.CALIPERS);

// ─────────────────────────────────────────────────────────────────────────
// MIGRATION SCOPE: Accessories & Misc COMMON MISC sweep — real rows from
// audit section 6b. scope='migration' — must resolve, not fall back.
// ─────────────────────────────────────────────────────────────────────────

check('MIGRATE: 1936 mechanical brake kit -> Hardware', { id: 64754, name: '1936-1937 Style Mechanical Brake Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: EL rear brake assembly -> Hardware', { id: 79836, name: '1936 EL Rear Brake Assembly', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake tube and nut set -> Lines (tube = line hardware)', { id: 66240, name: '1949 Glide Brake Tube and Nut Set', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.BRAKE_LINES);
check('MIGRATE: brake tube clamp -> Lines', { id: 92112, name: '1949 Glide Brake Tube Clamp', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.BRAKE_LINES);
check('MIGRATE: mini brake wheel -> Rotors & Drums', { id: 81334, name: '19 inch x 1.85 inch Mini Brake Wheel', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.ROTORS_DRUMS);
check('MIGRATE: dual disc brake kit -> Rotors & Drums', { id: 87455, name: '39 MM DUAL DISC BRAKE KIT', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.ROTORS_DRUMS);
check('MIGRATE: rear brake clamp -> Hardware', { id: 81189, name: '45 inch Rear Brake Clamp', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: WL brake control kit -> Hardware', { id: 80232, name: '45 inch WL Brake Control Kit Parkerized', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: bell crank -> Hardware', { id: 94992, name: '45 WL Rear Brake Bell Crank', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake plunger -> Hardware', { id: 65602, name: 'AEE Brake Plunger', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: forward brake control kit -> Hardware', { id: 64810, name: 'AEE Forward Brake Control Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: hydraulic brake kit -> Hardware', { id: 64847, name: 'AEE Hydraulic Brake Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: shorty brake arm -> Hardware', { id: 65500, name: 'AEE Shorty Brake Arm 2008-2013 Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: billet front brake tee -> Lines', { id: 65808, name: 'Billet Front Brake Tee', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.BRAKE_LINES);
check('MIGRATE: black+shifter peg set -> Pedals & Pads', { id: 67866, name: 'Black Brake and Shifter Peg Set', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PEDALS_PADS);
check('MIGRATE: brake and shifter cross shaft bushing -> Hardware (bushing noun, not pedal)', { id: 96623, name: 'Brake and Shifter Cross Shaft Bushing Set', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake and shifter peg set (bare) -> Pedals & Pads', { id: 68034, name: 'Brake and Shifter Peg Set', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PEDALS_PADS);
check('MIGRATE: brake cadmium cable adjuster -> Hardware', { id: 96151, name: 'Brake Cadmium Cable Adjuster', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake cam lever -> Hardware', { id: 88139, name: 'Brake Cam Lever Left', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: EXCLUDE brake/clutch base ball mount', { id: 16172, name: 'BRAKE/CLUTCH BASE 1" BALL', source_vendor: 'PU', raw_subcategory: 'HANDLEBAR-MOUNTED ACCESSORIES' }, 'migration', null);
check('MIGRATE: EXCLUDE brake/clutch cover base mount', { id: 40345, name: 'BRAKE/CLUTCH COVER BASE 1" CENTERED BALL', source_vendor: 'WPS', raw_subcategory: null }, 'migration', null);
check('MIGRATE: EXCLUDE brake/clutch reservoir base w/ balls mount', { id: 40347, name: 'BRAKE/CLUTCH RESERVOIR BASE W/2 1" BALLS', source_vendor: 'WPS', raw_subcategory: null }, 'migration', null);
check('MIGRATE: EXCLUDE cup holder mount', { id: 40311, name: 'BRAKE/CLUTCH RESERVOIR MOUNT W/SELF-LEVELING CUP HOLDER', source_vendor: 'WPS', raw_subcategory: null }, 'migration', null);
check('MIGRATE: brake control kit mechanical -> Hardware', { id: 64875, name: 'Brake Control Kit Mechanical', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake control mount kit -> Hardware', { id: 82292, name: 'Brake Control Mount Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake cross shaft kit -> Hardware', { id: 81050, name: 'Brake Cross Shaft Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake fitting kit -> Lines (fitting = line hardware)', { id: 65191, name: 'Brake Fitting Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.BRAKE_LINES);
check('MIGRATE: brake handle assembly -> Hardware', { id: 66227, name: 'Brake Handle Assembly', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake light banjo bolt -> Hardware (brake-light electrical, per decision)', { id: 65289, name: 'Brake Light Banjo Bolt', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake light flasher module -> Hardware', { id: 72082, name: 'Brake Light Flasher Module', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake lining rivets -> Pads & Shoes (lining)', { id: 92894, name: 'Brake Lining Rivets Brass', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PADS_SHOES);
check('MIGRATE: EXCLUDE brake mount black (engine mounts raw cat, phone-adjacent)', { id: 51260, name: 'BRAKE MOUNT BLACK', source_vendor: 'WPS', raw_subcategory: null }, 'migration', null);
check('MIGRATE: EXCLUDE brake mount large black', { id: 56328, name: 'BRAKE MOUNT LARGE BLACK', source_vendor: 'WPS', raw_subcategory: null }, 'migration', null);
check('MIGRATE: EXCLUDE brake mount large phone black', { id: 15707, name: 'Brake Mount - Large Phone - Black', source_vendor: 'PU', raw_subcategory: 'HANDLEBAR-MOUNTED ACCESSORIES' }, 'migration', null);
check('MIGRATE: EXCLUDE brake mount phone black', { id: 15714, name: 'Brake Mount - Phone - Black', source_vendor: 'PU', raw_subcategory: 'HANDLEBAR-MOUNTED ACCESSORIES' }, 'migration', null);
check('MIGRATE: brake operating shaft lever -> Hardware', { id: 73909, name: 'Brake Operating Shaft Lever Parkerized', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake plunger assembly chrome -> Hardware', { id: 87360, name: 'Brake Plunger Assembly Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake rear pedal zinc -> Pedals & Pads', { id: 65212, name: 'Brake Rear Pedal Zinc Plated', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PEDALS_PADS);
check('MIGRATE: brake rod adjuster nut -> Hardware', { id: 92837, name: 'Brake Rod Adjuster Nut', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake shaft nut -> Hardware', { id: 82699, name: 'Brake Shaft Nut', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake side adapter plate -> Hardware', { id: 522049, name: 'Brake Side Adapter Plate', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake spring stud -> Hardware', { id: 65348, name: 'Brake Spring Stud Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake stay bar -> Hardware', { id: 95151, name: 'Brake Stay Bar Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: brake switch -> Hardware', { id: 90808, name: 'Brake Switch', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: chrome+shifter peg -> Pedals & Pads', { id: 64422, name: 'Chrome Brake and Shifter Peg', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PEDALS_PADS);
check('MIGRATE: chrome brake handle cable kit -> Hardware', { id: 74826, name: 'Chrome Brake Handle Cable Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: chrome forward brake control kit hydraulic -> Hardware', { id: 64817, name: 'Chrome Forward Brake Control Kit Hydraulic', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: dual cam brake kit -> Hardware', { id: 64899, name: 'Dual Cam Brake Kit Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: factory sample rear hydraulic brake drum -> Rotors & Drums', { id: 498225, name: 'Factory Sample Rear Hydraulic Brake Drum Black', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.ROTORS_DRUMS);
check('MIGRATE: FLST brake control kit -> Hardware', { id: 64823, name: 'FLST Brake Control Kit Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: forward brake control kit hydraulic -> Hardware', { id: 64818, name: 'Forward Brake Control Kit Hydraulic', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake adjuster -> Hardware', { id: 92025, name: 'Front Brake Adjuster', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake cam -> Hardware', { id: 87944, name: 'Front Brake Cam', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake cam washer -> Hardware', { id: 92948, name: 'Front Brake Cam Washer', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake clevis pin -> Hardware', { id: 92726, name: 'Front Brake Clevis Pin Cadmium', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake nut parkerized -> Hardware', { id: 92727, name: 'Front Brake Nut Parkerized', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake operating lever -> Hardware', { id: 88145, name: 'Front Brake Operating Lever Right Side', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake parkerized cable adjuster -> Hardware', { id: 96231, name: 'Front Brake Parkerized Cable Adjuster', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake plate cover kit -> Hardware', { id: 80280, name: 'Front Brake Plate Cover Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake rod -> Hardware', { id: 95191, name: 'Front Brake Rod 9-7/8 inch Overall Length', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake shackle stud grease nipple -> Hardware', { id: 89207, name: 'Front Brake Shackle Stud Grease Nipple', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake stabilizer extension -> Hardware', { id: 94879, name: 'Front Brake Stabilizer Extension', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: front brake tube clamp -> Lines (tube clamp = line hardware)', { id: 92547, name: 'Front Brake Tube Clamp', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.BRAKE_LINES);
check('MIGRATE EXCLUDE (manual review): front engine brake strap', { id: 81046, name: 'Front Engine Brake Strap', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', null);
check('MIGRATE: FXD brake rod chrome -> Hardware', { id: 87672, name: 'FXD 12 inch Brake Rod Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: FX mid brake control kit -> Hardware', { id: 65016, name: 'FX Mid Brake Control Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: FXR brake plunger kit -> Hardware', { id: 65495, name: 'FXR Brake Plunger Kit Zinc', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: FXRP brake pivot -> Hardware', { id: 87781, name: 'FXRP Brake Pivot', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: FXRP rear brake rod -> Hardware', { id: 87782, name: 'FXRP Rear Brake Rod Zinc Plated', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: hummer brake rod -> Hardware', { id: 87437, name: 'Hummer Brake Rod', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: hydraulic brake control kit -> Hardware', { id: 64796, name: 'Hydraulic Brake Control Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: hydraulic brake switch with flag -> Hardware', { id: 90239, name: 'Hydraulic Brake Switch With Flag', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: indian brake switch with chrome cover -> Hardware', { id: 80181, name: 'Indian Brake Switch with Chrome Cover', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: indian rear brake plate bearing spacer -> Hardware', { id: 94182, name: 'Indian Rear Brake Plate Bearing Spacer', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: lone star brake+shifter peg set -> Pedals & Pads', { id: 68032, name: 'Lone Star Brake and Shifter Peg Set Black', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PEDALS_PADS);
check('MIGRATE: long brake clevis pin -> Hardware', { id: 87330, name: 'Long Brake Clevis Pin Zinc Plated', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical brake cam kit -> Hardware', { id: 65180, name: 'Mechanical Brake Cam Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical brake kit parkerized -> Hardware', { id: 64804, name: 'Mechanical Brake Kit Parkerized', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical brake pivot kit -> Hardware', { id: 65181, name: 'Mechanical Brake Pivot Kit Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical brake rod assembly -> Hardware', { id: 65464, name: 'Mechanical Brake Rod Assembly', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical brake shaft lever -> Hardware', { id: 87498, name: 'Mechanical Brake Shaft Lever', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical brake stop light switch -> Hardware', { id: 70492, name: 'Mechanical Brake Stop Light Switch', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mechanical rear brake kit parkerized -> Hardware', { id: 64894, name: 'Mechanical Rear Brake Kit Parkerized', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mid brake control kit -> Hardware', { id: 65042, name: 'Mid Brake Control Kit Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: mini brake wheel shoe set -> Pads & Shoes (shoe noun governs)', { id: 65589, name: 'Mini Brake Wheel Shoe Set', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.PADS_SHOES);
check('MIGRATE: EXCLUDE motorcycle brake/clutch reservoir base', { id: 40348, name: 'MOTORCYCLE BRAKE/CLUTCH RESERVOIR BASE W/1" BALL', source_vendor: 'WPS', raw_subcategory: null }, 'migration', null);
check('MIGRATE: OE M8 offset brake rod -> Hardware', { id: 65409, name: 'OE M8 Offset Brake Rod', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: one man brake bleeder -> Hardware', { id: 62665, name: 'One Man Brake Bleeder', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: outer brake stay bar -> Hardware', { id: 78621, name: 'Outer Brake Stay Bar Chrome', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: parkerized brake control kit mechanical -> Hardware', { id: 64858, name: 'Parkerized Brake Control Kit Mechanical', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: parkerized brake lamp switch spacer -> Hardware', { id: 93072, name: 'Parkerized Brake Lamp Switch Spacer', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: polished brake handle cable kit -> Hardware', { id: 74825, name: 'Polished Brake Handle Cable Kit', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: pull type brake switch -> Hardware', { id: 90274, name: 'Pull Type Brake Switch', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: rear brake activator lever -> Hardware', { id: 87433, name: 'Rear Brake Activator Lever', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: rear brake backing lock plate -> Hardware', { id: 87471, name: 'Rear Brake Backing Lock Plate Black', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: rear brake banjo bolt and switch -> Hardware (light-circuit banjo, same class as 65289)', { id: 90523, name: 'Rear Brake Banjo Bolt and Switch', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: rear brake bushing side plate -> Hardware', { id: 87848, name: 'Rear Brake Bushing Side Plate', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);
check('MIGRATE: rear brake cam -> Hardware', { id: 79868, name: 'Rear Brake Cam', source_vendor: 'VTWIN', raw_subcategory: null }, 'migration', SUBCATEGORIES.HARDWARE);

// Explicit candidate-filter tests
checkCandidate('candidate: has BRAKE keyword', { id: 100, name: 'Front Brake Adjuster' }, true);
checkCandidate('candidate: no BRAKE keyword', { id: 101, name: 'Front Fork Boot' }, false);
checkCandidate('candidate: EXCLUDE mount hardware still filtered here', { id: 16172, name: 'BRAKE/CLUTCH BASE 1" BALL' }, false);
checkCandidate('candidate: EXCLUDE manual review id', { id: 81046, name: 'Front Engine Brake Strap' }, false);

// ─────────────────────────────────────────────────────────────────────────
// ROUND 2 — cases added from first live dry-run (Population 1 fallback
// sample), July 10 2026. Real bugs caught before --apply.
// ─────────────────────────────────────────────────────────────────────────

// Fix 1: "CAL" abbreviation for caliper, scoped to caliper-context words
check('DRYRUN2: 6 PIST FRT RADIAL MNT CAL -> Calipers (CAL abbrev)', { id: 52609, name: '6 PIST FRT RADIAL MNT CAL L/H CHROME', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('DRYRUN2: 6 PIST FRT RADIAL MNT CAL R/H BLACK -> Calipers', { id: 52610, name: '6 PIST FRT RADIAL MNT CAL R/H BLACK', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('DRYRUN2: 4 PIST DIFF CAL REBUILD KIT -> Calipers', { id: 52626, name: '4 PIST DIFF CAL REBUILD KIT 500 SERIES', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);

// Fix 2: brake spider / radial mount adapter bracket (caliper hardware, no CALIPER/CAL word)
check('DRYRUN2: brake spider -> Calipers', { id: 50374, name: 'FRONT BRAKE SPIDER NARROW CHROME -3AN FITTINGS', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);
check('DRYRUN2: radial mount adapt bracket -> Calipers', { id: 52632, name: 'RADIAL MOUNT ADAPT BRACKET UNIV RH/LH BLACK', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.CALIPERS);

// Fix 3: PADS without BRAKE prefix, friction-compound vocabulary present
check('DRYRUN2: PRIME SINTERED FRONT SA PADS -> Pads & Shoes', { id: 57300, name: 'PRIME SINTERED FRONT SA PADS', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.PADS_SHOES);
check('DRYRUN2: PRIME SINTERED REAR SP PADS -> Pads & Shoes', { id: 57308, name: 'PRIME SINTERED REAR SP PADS', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.PADS_SHOES);

// Fix 4: WPS "Brake - front" fitting/adapter rows with zero BRAKE keyword
check('DRYRUN2: FITTING FERRULES 6PK -> Brake Lines (WPS raw category signal)', { id: 48514, name: 'FITTING FERRULES 6PK', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('DRYRUN2: STRAIGHT 3/8 TO 12MM ADAPTOR -> Brake Lines', { id: 48524, name: 'STRAIGHT 3/8 (10MM) TO 12MM ADAPTOR', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);
check('DRYRUN2: 20 DEG 3/8 TO 12MM ADAPTOR -> Brake Lines', { id: 48525, name: '20 DEG 3/8 (10MM) TO 12MM ADAPTOR', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.BRAKE_LINES);

// Guard: the same WPS raw category must NOT sweep in confirmed non-brake
// rows (session notes #1) — these must still fall to Hardware fallback,
// not be caught by the new raw-category-scoped Lines signal.
check('DRYRUN2 GUARD: clutch lever under Brake-front raw cat -> still falls back (not a Lines false-positive)', { id: 41653, name: 'WIDE V-CUT CLUTCH LEVER CHROME XL 04-13', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);
check('DRYRUN2 GUARD: air cleaner part under Brake-front raw cat -> still falls back', { id: 73706, name: 'Ultima Air Cleaner Backing Plate Adapter', source_vendor: 'VTWIN', raw_category: 'BRAKING', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);

// DOT 4 Brake Fluid — no clean bucket, expected to land in Hardware fallback
// (flagged in BRAKES_SESSION_NOTES.md, not solved here — documents current behavior)
check('DRYRUN2: DOT 4 Brake Fluid -> Hardware fallback (documented gap, not a real fix)', { id: 93700, name: 'DOT 4 Brake Fluid', source_vendor: 'WPS', raw_category: 'Brake - front', raw_subcategory: null }, 'within', SUBCATEGORIES.HARDWARE);

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTS: ${pass}/${pass + fail} passed`);
console.log('='.repeat(70));

if (failures.length) {
  console.log(`\n${failures.length} FAILURES:\n`);
  for (const f of failures) {
    console.log(`- ${f.desc}`);
    console.log(`  id=${f.row.id} name="${f.row.name}"`);
    console.log(`  expected=${JSON.stringify(f.expected)}  got=${JSON.stringify(f.got)}`);
    console.log('');
  }
  process.exitCode = 1;
} else {
  console.log('\nAll cases passing. Safe to proceed to dry run against live DB.');
}
