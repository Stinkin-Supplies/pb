// classify_brakes.mjs
// Standalone classifier module for the Brakes taxonomy rebuild.
// Import this from both the regression harness and fix_brakes_taxonomy.mjs
// so rule edits can be tested against the harness without a live DB.
//
// Scope locked with Laken (July 10, 2026 session):
//   - 8 subcategories: Brake Lines & Hoses, Rotors & Drums, Brake Pads & Shoes,
//     Calipers, Brake Hardware, Master Cylinders, Brake Conversion Kits,
//     Brake Pedals & Pads (NEW)
//   - Migration IN from Foot Controls: "Brake Pedals" subcat (119 rows) -> Brake Pedals & Pads
//   - Migration IN from Accessories & Misc: name-matched antique VTwin COMMON MISC
//     brake-linkage rows -> Brake Hardware; peg-set rows -> Brake Pedals & Pads;
//     brake-light electrical -> Brake Hardware
//   - EXCLUDE: mount-hardware rows using "brake" as a bolt reference point
//   - EXCLUDE: "Front Engine Brake Strap" (id 81046) - flagged, manual review
//   - OUT OF SCOPE this pass: Cable Clamp rows (Handlebar & Controls),
//     Colony brake-shaft tool (Exhaust), Spring Fork Brake Cable Kit (Suspension)

export const SUBCATEGORIES = {
  BRAKE_LINES: 'Brake Lines & Hoses',
  ROTORS_DRUMS: 'Rotors & Drums',
  PADS_SHOES: 'Brake Pads & Shoes',
  CALIPERS: 'Calipers',
  HARDWARE: 'Brake Hardware',
  MASTER_CYLINDERS: 'Master Cylinders',
  CONVERSION_KITS: 'Brake Conversion Kits',
  PEDALS_PADS: 'Brake Pedals & Pads', // NEW this pass
};

// ── EXCLUDE guards (checked first, in both scopes) ──────────────────────────
// MasterRef lesson: hardware-before-type, and "brake" as a bolt reference
// point is a platform-name-style trap, not a real signal.
function isMountHardwareFalsePositive(name) {
  const n = name.toUpperCase();
  return (
    /BRAKE\s*\/\s*CLUTCH\s*(BASE|COVER|RESERVOIR)/i.test(n) ||
    /BRAKE\s*\/\s*CLUTCH\s*RESERVOIR\s*MOUNT/i.test(n) ||
    /BRAKE\s*MOUNT.*(BLACK|PHONE|GPS)/i.test(n) ||
    /\bPHONE\b.*\bMOUNT\b/i.test(n) && /BRAKE/i.test(n) ||
    /MOTORCYCLE\s*BRAKE\s*\/\s*CLUTCH\s*RESERVOIR/i.test(n)
  );
}

// Named individual exclusions requiring manual review — never auto-classify.
const MANUAL_REVIEW_IDS = new Set([
  81046, // "Front Engine Brake Strap" - ambiguous, could be engine mount strap
]);

// ── Vocabulary mined from raw subcategory + audit sample (Section 9) ────────
// PU raw subcategory is authoritative when present — use it first.
const PU_RAW_SUBCATEGORY_MAP = [
  [/BRAKE LINES-HOSES-STAINLESS STEEL/i, SUBCATEGORIES.BRAKE_LINES],
  [/BRAKE LINES-HOSES-RUBBER-PLASTIC/i, SUBCATEGORIES.BRAKE_LINES],
  [/BRAKE LINE HARDWARE/i, SUBCATEGORIES.HARDWARE],
  [/BRAKE ROTORS - STREET/i, SUBCATEGORIES.ROTORS_DRUMS],
  [/BRAKE ROTORS - OFFROAD-ATV/i, SUBCATEGORIES.ROTORS_DRUMS],
  [/BRAKE DRUMS-CYLINDERS/i, SUBCATEGORIES.ROTORS_DRUMS],
  [/BRAKE PADS - SINTERED METAL/i, SUBCATEGORIES.PADS_SHOES],
  [/BRAKE PADS - ORGANIC/i, SUBCATEGORIES.PADS_SHOES],
  [/BRAKE PADS - CERAMIC/i, SUBCATEGORIES.PADS_SHOES],
  [/BRAKE SHOES/i, SUBCATEGORIES.PADS_SHOES],
  [/BRAKE LININGS/i, SUBCATEGORIES.PADS_SHOES],
  [/BRAKE CALIPER-CALIPER KITS/i, SUBCATEGORIES.CALIPERS],
  [/BRAKE CALIPER REBUILD KITS & PARTS/i, SUBCATEGORIES.CALIPERS],
  [/BRAKE CALIPER COVERS-INSERTS/i, SUBCATEGORIES.CALIPERS],
  [/REAR MASTER CYLINDERS & PARTS/i, SUBCATEGORIES.MASTER_CYLINDERS],
  [/BRAKE CONVERSION KITS/i, SUBCATEGORIES.CONVERSION_KITS],
];

// ── Name-based classification (WPS/VTwin NULL rows have no raw subcat) ──────
// Order matters: hardware/pedal signals BEFORE generic type keywords
// (MasterRef: "hardware-before-type" lesson from Cables session 77).

// 1. Pedals & Pads (peg-sets, pedal hardware) — check FIRST, most specific noun
function matchesPedalsAndPads(name) {
  const n = name.toUpperCase();
  return (
    /BRAKE\s*(AND|&)\s*SHIFTER\s*PEG/i.test(n) ||
    /\bPEDAL\b/i.test(n) && /\bBRAKE\b/i.test(n) ||
    /\bPEG\b/i.test(n) && /\bBRAKE\b/i.test(n)
  );
}

// 2. Master Cylinders (incl. covers/rebuild kits — hardware-before-type)
function matchesMasterCylinders(name) {
  const n = name.toUpperCase();
  return (
    /MASTER\s*CYL(INDER)?/i.test(n) ||
    /\bMSTR\s*CYL(INDER)?/i.test(n) ||
    // bare "MASTER" on a brake/clutch lever or reservoir context (no CYL
    // present in the name at all, e.g. "CLUTCH MASTER FOR 1\" BARS")
    (/\bMASTER\b/i.test(n) && /(CLUTCH|BRAKE)/i.test(n))
  );
}

// 3. Calipers (incl. covers, rebuild kits, mount brackets, "CAL" abbreviation)
function matchesCalipers(name) {
  const n = name.toUpperCase();
  return (
    /CALIPER/i.test(n) ||
    // "CAL" abbreviation — scoped tightly to avoid false-matching unrelated
    // words containing CAL (e.g. "CALIBRATION"); only fires alongside a
    // caliper-context word so a bare "CAL" elsewhere won't trip it.
    (/\bCAL\b/i.test(n) && /(RADIAL|MNT|MOUNT|REBUILD\s*KIT|DIFF|PIST)/i.test(n)) ||
    // caliper mounting hardware — "spider" and mount-adapter brackets that
    // don't say CALIPER/CAL but are unambiguously caliper hardware
    /BRAKE\s*SPIDER/i.test(n) ||
    /RADIAL\s*MOUNT\s*ADAPT(ER)?\s*BRACKET/i.test(n)
  );
}

// 4. Rotors & Drums
function matchesRotorsDrums(name) {
  const n = name.toUpperCase();
  return (
    /\bROTOR/i.test(n) ||
    /\bDRUM\b/i.test(n) ||
    /BRAKE\s*DISC/i.test(n) ||
    /DISC\s*BRAKE/i.test(n) ||
    /\bMINI\s*BRAKE\s*WHEEL\b/i.test(n) // vendor-specific: mini brake wheel = drum-brake wheel assembly
  );
}

// 5. Brake Pads & Shoes (friction material only — NOT pedal pads)
//    Same adjacency trap as Hardware: vendor names often drop "BRAKE"
//    entirely (e.g. "PRIME SINTERED FRONT SA PADS") — match "PADS"/"SHOES"
//    independently when the row is already known brake-context (PU raw
//    subcategory routes there directly; for name-only rows require SINTERED/
//    ORGANIC/CERAMIC/friction-compound language alongside PADS to avoid
//    catching unrelated padding, e.g. seat pads).
function matchesPadsShoes(name) {
  const n = name.toUpperCase();
  return (
    /BRAKE\s*PADS?\b/i.test(n) ||
    /BRAKE\s*SHOES?\b/i.test(n) ||
    /BRAKE\s*LINING/i.test(n) ||
    /\bSHOE\s*SET\b/i.test(n) ||
    // friction-compound + PADS, without requiring BRAKE to be adjacent
    (/\bPADS?\b/i.test(n) && /(SINTERED|ORGANIC|CERAMIC|FRICTION)/i.test(n))
  );
}

// 6a. Brake-light electrical (switches, flashers, light-circuit banjo bolts)
//     Checked BEFORE generic Lines/Banjo — a banjo bolt that's part of a
//     brake-LIGHT circuit is electrical hardware, not a hydraulic line.
function matchesBrakeLightElectrical(name) {
  const n = name.toUpperCase();
  return (
    /BRAKE\s*(LIGHT|LAMP)\b/i.test(n) ||
    (/\bSWITCH\b/i.test(n) && /BRAKE/i.test(n)) ||
    /\bFLASHER\b/i.test(n)
  );
}

// 6b. Brake Lines & Hoses (hydraulic lines, banjo fittings/bolts, hose kits)
function matchesBrakeLines(name, sourceVendor, rawCategory) {
  const n = name.toUpperCase();
  const hasLineSignal = (
    /BRAKE\s*(LINE|HOSE)/i.test(n) ||
    /\bBANJO\b/i.test(n) ||
    /JIC\s*TO\s*-?3\s*TUBE\s*ADAPTER/i.test(n) ||
    /\bTUBE\s*ADAPTER\b/i.test(n) ||
    (/\bTUBE\s*(AND\s*NUT\s*SET|CLAMP)\b/i.test(n) && /BRAKE/i.test(n)) ||
    (/\bTEE\s*ADAPTER\b/i.test(n) && /BRAKE/i.test(n)) ||
    /BRAKE\s*(FRONT|REAR)?\s*TEE\b/i.test(n) ||
    (/\bFITTING\s*KIT\b/i.test(n) && /BRAKE/i.test(n))
  );
  if (hasLineSignal) return true;

  // No BRAKE keyword at all, but sitting under WPS's "Brake - front" raw
  // category (Goodridge hydraulic-line product family) — these are line
  // fittings/adapters/ferrules with no brake keyword in the SKU-style name.
  // Deliberately narrow vocabulary (not "does raw_category say Brake") per
  // BRAKES_SESSION_NOTES.md #1: that raw category is a grab-bag and a bare
  // category match would also sweep in clutch/shifter/air-cleaner rows.
  if (sourceVendor === 'WPS' && rawCategory === 'Brake - front') {
    return (
      /\bFITTING\s*FERRULES?\b/i.test(n) ||
      /\bADAPTOR\b/i.test(n) || // Goodridge product naming uses "ADAPTOR" spelling
      (/\bDEG\b/i.test(n) && /\b(10MM|12MM|3\/8|7\/16)\b/i.test(n))
    );
  }
  return false;
}

// 7. Brake Hardware (catch-all mechanical linkage + brake-light electrical)
//    This is deliberately broad — it's the fallback bucket for anything
//    that is clearly brake-system but not one of the above nouns.
//
//    IMPORTANT: do NOT require BRAKE to sit immediately next to the noun.
//    Real names interpose years, models, and modifiers between them:
//    "1936-1937 Style Mechanical Brake Kit", "Front Brake Stabilizer
//    Extension", "Mechanical Rear Brake Kit Parkerized". Match "has BRAKE
//    somewhere" AND "has a hardware noun somewhere" independently.
const HARDWARE_NOUN_PATTERN =
  /\b(ROD|ARM|CAM|SHAFT|PLUNGER|LEVER|SWITCH|CLEVIS|PIVOT|BUSHING|BACKING|SPRING|ANCHOR|NUT|STUD|BELL\s*CRANK|ASSEMBLY|CONTROL\s*KIT|CONTROL\s*MOUNT|MOUNT\s*KIT|KIT|STABILIZER|ADJUSTER|ADJUSTING|SHACKLE|GREASE\s*NIPPLE|HANDLE|PLATE|CROSS\s*SHAFT|FITTING\s*KIT|RESERVOIR|BLEEDER|SIDE\s*ADAPTER|WASHER|ACTIVATOR|LAMP\s*SWITCH|STOP\s*LIGHT|FLASHER|BANJO\s*BOLT|CLAMP|STAY\s*BAR)\b/i;

function matchesHardware(name) {
  const n = name.toUpperCase();
  if (isMountHardwareFalsePositive(name)) return false;
  if (!/\bBRAKE\b/i.test(n)) return false;
  return HARDWARE_NOUN_PATTERN.test(n);
}

/**
 * classify(row) -> { subcategory: string|null, matched: bool, reason: string }
 * row: { id, name, source_vendor, raw_category, raw_subcategory, brand }
 *
 * scope: 'within' (row already display_category='Brakes', needs a subcategory —
 *         may fall back) or 'migration' (row is outside Brakes, being evaluated
 *         for sweep-in — must NOT fall back; unmatched = leave alone)
 */
export function classify(row, scope = 'within') {
  const { id, name, source_vendor, raw_category, raw_subcategory } = row;

  if (MANUAL_REVIEW_IDS.has(id)) {
    return { subcategory: null, matched: false, reason: 'FLAGGED_MANUAL_REVIEW' };
  }

  if (isMountHardwareFalsePositive(name)) {
    return { subcategory: null, matched: false, reason: 'EXCLUDE_MOUNT_HARDWARE' };
  }

  // PU raw subcategory is authoritative when present
  if (source_vendor === 'PU' && raw_subcategory) {
    for (const [pattern, subcat] of PU_RAW_SUBCATEGORY_MAP) {
      if (pattern.test(raw_subcategory)) {
        return { subcategory: subcat, matched: true, reason: `PU_RAW:${raw_subcategory}` };
      }
    }
  }

  // Name-based rules, in hardware/noun-specificity order
  if (matchesPedalsAndPads(name)) {
    return { subcategory: SUBCATEGORIES.PEDALS_PADS, matched: true, reason: 'NAME:pedals_pegs' };
  }
  if (matchesMasterCylinders(name)) {
    return { subcategory: SUBCATEGORIES.MASTER_CYLINDERS, matched: true, reason: 'NAME:master_cylinder' };
  }
  if (matchesCalipers(name)) {
    return { subcategory: SUBCATEGORIES.CALIPERS, matched: true, reason: 'NAME:caliper' };
  }
  if (matchesPadsShoes(name)) {
    return { subcategory: SUBCATEGORIES.PADS_SHOES, matched: true, reason: 'NAME:pads_shoes' };
  }
  if (matchesRotorsDrums(name)) {
    return { subcategory: SUBCATEGORIES.ROTORS_DRUMS, matched: true, reason: 'NAME:rotors_drums' };
  }
  if (matchesBrakeLightElectrical(name)) {
    return { subcategory: SUBCATEGORIES.HARDWARE, matched: true, reason: 'NAME:light_electrical' };
  }
  if (matchesBrakeLines(name, source_vendor, raw_category)) {
    return { subcategory: SUBCATEGORIES.BRAKE_LINES, matched: true, reason: 'NAME:lines_hoses' };
  }
  if (matchesHardware(name)) {
    return { subcategory: SUBCATEGORIES.HARDWARE, matched: true, reason: 'NAME:hardware' };
  }

  if (scope === 'within') {
    // Within-Brakes rows cannot be left blank — force to Hardware as last resort,
    // but this should be RARE. Report every fallback for manual review.
    return { subcategory: SUBCATEGORIES.HARDWARE, matched: false, reason: 'FALLBACK_UNMATCHED' };
  }

  // Migration scope: unmatched rows have not earned their way in. Leave alone.
  return { subcategory: null, matched: false, reason: 'NO_MATCH_LEAVE_ALONE' };
}

/**
 * Migration-scope pre-filter: does this Accessories & Misc / Foot Controls row
 * even belong in the brake candidate pool? Foot Controls "Brake Pedals" rows
 * are migrated wholesale by subcategory, not by name-match.
 */
export function isBrakeCandidate(row) {
  const n = row.name.toUpperCase();
  if (isMountHardwareFalsePositive(row.name)) return false;
  if (MANUAL_REVIEW_IDS.has(row.id)) return false;
  return /\bBRAKE\b/i.test(n);
}
