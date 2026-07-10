/**
 * fix_cables_taxonomy.mjs
 *
 * Cables — NEW top-level display_category (the 22nd).
 *
 * Unlike every prior taxonomy script (Seating, Exhaust, Carburetion & Fuel),
 * this one MOVES ROWS ACROSS CATEGORIES into a category that does not yet
 * exist. Consequences:
 *   - Candidates are selected by SOURCE SIGNAL, not by display_category,
 *     because nothing is sitting in 'Cables' yet.
 *   - The UPDATE writes display_category, display_subcategory, AND
 *     display_subcategory_detail.
 *   - There is a REROUTE list: rows caught by the candidate net that do NOT
 *     belong in Cables at all and get sent to their correct home instead.
 *
 * Target structure (8 subcategories):
 *   Throttle Cables | Idle Cables | Clutch Cables | Choke Cables |
 *   Speedometer & Tachometer Cables | Hydraulic Clutch Lines |
 *   Cable & Line Kits | Cable Hardware
 *
 * Details:
 *   Cable & Line Kits -> Handlebar Installation Kits | Cable & Brake Line Kits
 *                        | Throttle & Idle Cable Sets | Cable-Only Kits
 *   Cable Hardware    -> Clamps & Guides | Brackets | Covers | Component Parts
 *
 * Decisions locked with Laken:
 *   - LINE = hydraulic, CABLE = mechanical. Applied uniformly across all three
 *     vendors. This is why Goodridge "Stainless Steel Clutch Line" lands in
 *     Hydraulic Clutch Lines even though PU files it under CABLES-CLUTCH —
 *     the raw subcategory is simply wrong, the name is right.
 *   - Brakes untouched. Brake lines/hoses stay in the Brakes category.
 *   - Electrical untouched. Battery cables, spark plug wires, speaker cable
 *     stay in Electrical.
 *   - Speedometer cables ARE pulled out of Instrumentation.
 *   - Cable hardware is consolidated as aggressively as possible — clamps,
 *     brackets, guides, clips, covers pulled from Accessories & Misc,
 *     Carburetion & Fuel, Transmission & Clutch, Instrumentation.
 *   - Throttle & Idle Cable Sets are a KIT detail, not Throttle Cables.
 *
 * Vendor selection asymmetry (this tripped us up mid-design):
 *   - PU has clean cable raw subcategories -> deterministic selection.
 *   - WPS 'CABLE, CLUTCH CONTROL' is a GENERIC cable bucket despite the name.
 *     It holds throttle, idle, choke, hydraulic clutch lines, a Burly control
 *     kit, and a bulk hose roll. Selected by raw category, then keyword-
 *     classified like VTWIN.
 *   - VTWIN subcategory is NULL catalog-wide -> name-keyword selection only.
 *
 * Bugs found in the shape-audit pass, fixed here:
 *   - Bare "Clutch Line" (PU HOSE HYDRAULIC CLUTCH, ~50 rows) has no
 *     "hydraulic" token in the name. Raw subcategory must win for that bucket.
 *   - "KARBONFIBR Braided Idle/Cruise Cable" — the slash defeats an adjacent
 *     "IDLE CABLE" phrase match. Use IDLE .* CABLE instead.
 *   - "XR Handlebar Installation Ki" — vendor typo, missing trailing 't'.
 *     Match on INSTALLATION KI.
 *   - Hardware keywords (CLAMP/BRACKET/GUIDE/CLIP) must run LAST, not mid-
 *     list, or they steal cables that merely mention an included bracket.
 *
 * Pattern: audit -> dry run -> sample review -> apply -> sync -> reindex.
 *
 * Usage:
 *   node fix_cables_taxonomy.mjs                 # dry run
 *   node fix_cables_taxonomy.mjs --sample=50     # bigger dry-run sample
 *   node fix_cables_taxonomy.mjs --apply         # writes
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Absolute path, not bare .env.local — cwd-dependent dotenv bug, see
// filter_roadmap.md (sync_fitment_flat_columns.mjs).
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 25;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const NEW_CATEGORY = 'Cables';

// PU raw subcategories that define the candidate net for PU.
const PU_CABLE_SUBCATS = [
  'CABLES-CLUTCH',
  'CABLES-THROTTLE',
  'CABLES-IDLE',
  'CABLES-CHOKE',
  'CABLES-SPEEDOMETER',
  'CABLES-TACHOMETER',
  'CLUTCH & BRAKE CABLE/HOSE KITS',
  'HOSE HYDRAULIC CLUTCH',
  'CABLE CLAMPS & GUIDES',
  'CABLE COVERS',
  'CABLE COMPONENT PARTS',
];

// Categories that are OFF LIMITS. Brakes and Electrical were explicitly ruled
// out of scope. Rows in them are never candidates, even on a name match.
const EXCLUDED_CATEGORIES = ['Brakes', 'Electrical'];

// ---------------------------------------------------------------------------
// EXCLUDE — name-level guards. Rows matching these are LEFT ENTIRELY ALONE.
// The display_category exclusion (Brakes, Electrical) is not enough on its own:
// brake and ignition parts were sitting in Accessories & Misc and Carburetion
// & Fuel, so they slipped past a category-only filter and landed in Cables on
// dry run 1. Guard on the name, not just the current category.
// ---------------------------------------------------------------------------
const EXCLUDE_RULES = [
  {
    // Brakes stay in Brakes. "Brake Handle Cable Kit", "Front Brake Cable
    // Adjuster", "Rear Wheel Brake Rod and Cable Adjusting Nut".
    // NOT excluded: "Cable/Brake Line Kit" — a handlebar kit that bundles a
    // brake line, which Laken confirmed belongs in Cables. That phrasing is
    // whitelisted below.
    reason: 'brake part — Brakes category is out of scope',
    test: (n) => {
      if (/\bCABLE\/BRAKE LINE\b/.test(n)) return false;       // handlebar kit
      if (/\bCABLE AND BRAKE LINE\b/.test(n)) return false;    // handlebar kit
      if (/\bBRAKE\/CLUTCH LINE\b/.test(n)) return false;      // extension -> Kits, per Laken
      return /\bBRAKE\b/.test(n);
    },
  },
  {
    // Ignition. Spark control cable and timer cable belong to Electrical.
    reason: 'spark / timer — ignition part, belongs in Electrical',
    test: (n) => /\bSPARK\b/.test(n) || /\bTIMERS?\b/.test(n),
  },
];

// ---------------------------------------------------------------------------
// REROUTE — caught by the net, does NOT belong in Cables. Moved to its
// correct home. Checked after EXCLUDE, before the Cables classifier.
// ---------------------------------------------------------------------------
const REROUTE_RULES = [
  {
    // Clutch actuators and adjusters. "Servi Clutch Arm and Cable Kit" and
    // "XL Clutch Worm/Cable Kit" include a cable but ARE a clutch actuator —
    // Laken: reroute to clutch. "ClLUTCH CONTROL" is a vendor typo (Mueller
    // hydraulic actuator).
    reason: 'clutch actuator / arm / worm / adjuster — not a cable',
    category: 'Transmission & Clutch',
    subcategory: 'Clutch Kits & Components',
    test: (n) =>
      /\bCLUTCH ADJUSTERS?\b/.test(n) ||
      /\bCL?LUTCH CONTROL\b/.test(n) ||
      (/\bCLUTCH\b/.test(n) && /\b(ARMS?|WORMS?)\b/.test(n)),
  },
  {
    // Throttle assemblies and twist grips are Handlebar & Controls. A
    // REPLACEMENT CABLE **for** an assembly is still a cable and falls through.
    reason: 'throttle assembly / twist grip — Handlebar & Controls',
    category: 'Handlebar & Controls',
    subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware',
    test: (n) => {
      if (/\bREPLACEMENT (THROTTLE |IDLE )?CABLE\b/.test(n)) return false;
      return /\bTHROTTLE ASSEMBL(Y|IES)\b/.test(n) || /\bTWIST GRIPS?\b/.test(n);
    },
  },
  {
    // Bulk stock. Two shapes: the word ROLL, or a foot-length like 50' / 100'
    // ("CABLE HOUSING BLACK 7MMX50'", "INNER WIRE 1.5MMX100'"). Dry run 1's
    // bulk rule keyed on ROLL only and missed every Motion Pro housing/wire row.
    reason: 'bulk stock by the roll/foot — chopper/bulk section pending',
    category: 'Accessories & Misc',
    subcategory: null,
    test: (n) => {
      const isRoll = /\bROLLS?\b/.test(n) || /\bBULK\b/.test(n) || /\bPER FOOT\b/.test(n) || /\bBY THE FOOT\b/.test(n);
      const isFootLength = /\d+\s*'/.test(n);   // 50' 100' 25' 6'
      return (isRoll || isFootLength) && !/\bKITS?\b/.test(n);
    },
  },
  {
    reason: 'springer fork part — not a control cable',
    category: 'Suspension',
    subcategory: null,
    test: (n) => /\b(SPRING|SPRINGER) FORK\b/.test(n),
  },
];

const FLAG_RULES = [
  {
    reason: 'ambiguous: throttle cable OR spark plug wire',
    test: (n) => /\bTHROTTLE OR SPARK\b/.test(n),
  },
];

// ---------------------------------------------------------------------------
// Classification — first match wins.
//
// ORDER IS LOAD-BEARING, and the order is the REVERSE of what dry run 1 used.
//
// Dry run 1 ran hardware LAST, on the theory that CLAMP/BRACKET/GUIDE are
// promiscuous keywords that would steal real cables. Wrong, and backwards.
// In these product names the hardware word is the PRODUCT NOUN and the cable
// type is a QUALIFIER: "Die-Cast Cable Clamp - Clutch" is a clamp, not a
// clutch cable. "Speedometer Cable Adapter" is an adapter. "Carburetor Choke
// Cable Bracket" is a bracket. Running hardware last sent all of them into
// cable-type buckets. Hardware runs FIRST now.
//
// Remaining order after that:
//   2. Kits and sets — a "Cable/Brake Line Kit" names both cable and line.
//   3. Hydraulic lines — LINE beats CABLE (Laken: LINE = hydraulic).
//   4. Single cables by type.
// ---------------------------------------------------------------------------
const RULES = [
  // === 1. HARDWARE — FIRST. The hardware noun wins over the cable qualifier.
  {
    subcategory: 'Cable Hardware',
    detail: 'Covers',
    // Before the other hardware rules: "Cable Guide Cover" is a cover, and
    // would otherwise be grabbed by the GUIDE keyword below.
    test: (n, b, rawSub) =>
      rawSub === 'CABLE COVERS' ||
      /\bCABLE COVERS?\b/.test(n) ||
      /\bDRESS-?UP KITS?\b/.test(n) ||
      /\bCOVERINGS?\b/.test(n) ||
      (/\bCABLE\b/.test(n) && /\bCOVERS?\b/.test(n)),
  },
  {
    subcategory: 'Cable Hardware',
    detail: 'Brackets',
    test: (n) => /\bBRACKETS?\b/.test(n) || /\bFRAME TABS?\b/.test(n),
  },
  {
    subcategory: 'Cable Hardware',
    detail: 'Clamps & Guides',
    test: (n, b, rawSub) =>
      rawSub === 'CABLE CLAMPS & GUIDES' ||
      /\bCLAMPS?\b/.test(n) ||
      /\bGUIDES?\b/.test(n) ||
      /\bCLIPS?\b/.test(n) ||
      /\bHOLDERS?\b/.test(n),
  },
  {
    subcategory: 'Cable Hardware',
    detail: 'Component Parts',
    // Ferrules, cable ends, sleeves, adapters, bushings, adjusters, and the
    // OUTER housing (sold as a finished part, not bulk — the bulk rolls were
    // already rerouted above).
    test: (n, b, rawSub) =>
      rawSub === 'CABLE COMPONENT PARTS' ||
      /\bFERRULES?\b/.test(n) ||
      /\bBUSHINGS?\b/.test(n) ||
      /\bOUTER (CONTROL )?CABLES?\b/.test(n) ||
      /\bCABLE HOUSINGS?\b/.test(n) ||
      (/\bCABLE\b/.test(n) && /\b(ENDS?|SLEEVES?|ADAPTERS?|ADJUSTERS?|BLOCK|BLOCK ENDS?)\b/.test(n)),
  },

  // === 2. KITS AND SETS
  {
    subcategory: 'Cable & Line Kits',
    detail: 'Throttle & Idle Cable Sets',
    // Guard: "Replacement Idle Cable for Dual-Cable Throttle Assembly Kits"
    // contains THROTTLE + IDLE + KITS but is a SINGLE replacement cable.
    test: (n) => {
      if (/\bREPLACEMENT\b/.test(n)) return false;
      return /\bTHROTTLE\b/.test(n) && /\bIDLE\b/.test(n) && /\b(SETS?|KITS?)\b/.test(n);
    },
  },
  {
    subcategory: 'Cable & Line Kits',
    detail: 'Handlebar Installation Kits',
    // INSTALLATION KI — no trailing T. "XR Handlebar Installation Ki" is a real
    // vendor typo. Guard: "Installation Kit - Hydraulic Clutch" is a hydraulic
    // kit, not a handlebar kit — it goes to Cable-Only Kits below, so exclude
    // HYDRAULIC here.
    test: (n) => {
      if (/\bHYDRAULIC\b/.test(n)) return false;
      return /\bINSTALLATION KI/.test(n) || /\bCONTROL KITS?\b/.test(n) || /\bCNTRL KITS?\b/.test(n);
    },
  },
  {
    subcategory: 'Cable & Line Kits',
    detail: 'Cable & Brake Line Kits',
    // Whitelisted past the brake EXCLUDE guard above — a handlebar kit that
    // bundles a brake line. Also catches the Fat Baggers "Hydraulic Brake/
    // Clutch Line Extension" (Laken: put with kits).
    test: (n) =>
      /\bCABLE\/BRAKE LINE\b/.test(n) ||
      /\bCABLE AND BRAKE LINE\b/.test(n) ||
      /\bCABLE\/LINE\b/.test(n) ||
      /\bBRAKE\/CLUTCH LINE\b/.test(n) ||
      (/\bCABLES?\b/.test(n) && /\bBRAKE LINES?\b/.test(n)),
  },
  {
    subcategory: 'Cable & Line Kits',
    detail: 'Cable-Only Kits',
    // BYO guard: "BYO Control Cable Kit - Throttle/Idle" already went to
    // Throttle & Idle Sets above. "BYO Control Cable Kit - Idle - 45" is a
    // SINGLE-type kit — Laken wants it with Idle Cables, so it falls through.
    // EZ INSTALL guard: "EZ Install Upper Clutch Cable" (singular) is one
    // cable, not a kit.
    test: (n) => {
      if (/\bBYO\b/.test(n) || /\bBUILD YOUR OWN\b/.test(n)) return false;
      if (/\bEZ INSTALL\b/.test(n) && !/\bKITS?\b/.test(n)) return false;
      return (
        /\bCABLE KITS?\b/.test(n) ||
        /\bEZ INSTALL KITS?\b/.test(n) ||
        /\bPLUG-AND-PLAY CABLE\b/.test(n) ||
        (/\bINSTALLATION KI/.test(n) && /\bHYDRAULIC\b/.test(n))
      );
    },
  },

  // === 3. HYDRAULIC LINES — LINE beats CABLE.
  {
    subcategory: 'Hydraulic Clutch Lines',
    detail: null,
    test: (n, b, rawSub) => {
      // PU's own bucket is authoritative — bare "Clutch Line" carries no
      // hydraulic token at all (~50 rows).
      if (rawSub === 'HOSE HYDRAULIC CLUTCH') return true;
      return /\bCLUTCH LINES?\b/.test(n) || (/\bHYDRAULIC\b/.test(n) && /\bCLUTCH\b/.test(n));
    },
  },

  // === 4. SINGLE CABLES BY TYPE
  {
    subcategory: 'Speedometer & Tachometer Cables',
    detail: null,
    // SPEEDO COAT is a vendor typo for SPEEDO CABLE (Motion Pro "Armor Coat
    // Speedo Coat", 7 rows) — confirmed with Laken.
    test: (n, b, rawSub) =>
      rawSub === 'CABLES-SPEEDOMETER' ||
      rawSub === 'CABLES-TACHOMETER' ||
      /\bSPEEDO COAT\b/.test(n) ||
      ((/\bSPEEDO(METER)?\b/.test(n) || /\bTACH(OMETER)?\b/.test(n)) && /\bCABLES?\b/.test(n)),
  },
  {
    subcategory: 'Choke Cables',
    detail: null,
    test: (n, b, rawSub) => rawSub === 'CABLES-CHOKE' || (/\bCHOKE\b/.test(n) && /\bCABLES?\b/.test(n)),
  },
  {
    subcategory: 'Idle Cables',
    detail: null,
    // IDLE .* CABLE, not the adjacent phrase — "Idle/Cruise Cable" has a slash
    // between the tokens. Also lands the single-type "BYO ... Kit - Idle".
    test: (n, b, rawSub) => rawSub === 'CABLES-IDLE' || (/\bIDLE\b/.test(n) && /\bCABLES?\b/.test(n)),
  },
  {
    subcategory: 'Throttle Cables',
    detail: null,
    test: (n, b, rawSub) => rawSub === 'CABLES-THROTTLE' || (/\bTHROTTLE\b/.test(n) && /\bCABLES?\b/.test(n)),
  },
  {
    subcategory: 'Clutch Cables',
    detail: null,
    // Reached only after Hydraulic Clutch Lines claimed anything saying LINE.
    // TOP HALF ... CABLE (Motion Pro, OE#3720xxx) are upper clutch cables —
    // confirmed with Laken.
    // LW = Motion Pro "Light Weight".
    test: (n, b, rawSub) =>
      rawSub === 'CABLES-CLUTCH' ||
      /\bTOP HALF\b.*\bCABLE\b/.test(n) ||
      /\bBLACKOUTCABLE\b/.test(n) ||          // vendor typo, no space
      (/\bCLUTCH\b/.test(n) && /\bCABLES?\b/.test(n)),
  },
];

// Brands deliberately NOT given a bare-brand match — multi-category brands
// elsewhere in this catalog. Surfaced as a diagnostic rather than silently
// classified.
//   GOODRIDGE  — hydraulic lines, but also a confirmed BRAKE line brand
//   MOTION PRO — cables, but also tools and chemicals
//   MAGNUM SHIELDING / LA CHOPPERS / BURLY BRAND / FAT BAGGERS — kit brands
//   BARNETT    — cables, but also clutch plates
const FLAGGED_BRANDS = ['GOODRIDGE', 'MOTION PRO', 'BARNETT', 'MAGNUM SHIELDING', 'LA CHOPPERS', 'BURLY BRAND', 'FAT BAGGERS'];

// No blanket fallback here, unlike fix_fuel_air_taxonomy.mjs. That script
// operated INSIDE an existing category where every row had to come out with
// some subcategory. This one is pulling rows INTO a new category — a row that
// matches nothing has not earned its way in, and force-assigning it would
// import garbage into a clean category. Unmatched rows are LEFT WHERE THEY
// ARE and reported.
const NO_FALLBACK = true;

function classify(name, brand, rawSub) {
  const n = (name || '').toUpperCase();
  const b = (brand || '').toUpperCase();
  const s = (rawSub || '').toUpperCase();

  // FLAG before EXCLUDE: "Throttle or Spark Cable" is ambiguous, not an
  // ignition part. The spark guard would otherwise swallow it silently.
  for (const rule of FLAG_RULES) {
    if (rule.test(n, b, s)) return { action: 'flag', reason: rule.reason };
  }
  for (const rule of EXCLUDE_RULES) {
    if (rule.test(n, b, s)) return { action: 'exclude', reason: rule.reason };
  }
  for (const rule of REROUTE_RULES) {
    if (rule.test(n, b, s)) {
      return { action: 'reroute', category: rule.category, subcategory: rule.subcategory, reason: rule.reason };
    }
  }
  for (const rule of RULES) {
    if (rule.test(n, b, s)) {
      return { action: 'assign', category: NEW_CATEGORY, subcategory: rule.subcategory, detail: rule.detail };
    }
  }
  return { action: 'unmatched' };
}

async function main() {
  const client = await pool.connect();
  try {
    // -----------------------------------------------------------------
    // AUDIT — where do the candidates currently live?
    // -----------------------------------------------------------------
    console.log(`\n=== AUDIT: candidate rows by current display_category ===`);
    const audit = await client.query(
      `SELECT source_vendor,
              COALESCE(display_category, '(blank)') AS cat,
              COALESCE(display_subcategory, '(blank)') AS subcat,
              COUNT(*)
       FROM catalog_unified
       WHERE is_active = true
         AND (display_category IS NULL OR display_category <> ALL($2::text[]))
         AND (
           (source_vendor = 'PU'  AND subcategory = ANY($1::text[]))
           OR (source_vendor = 'WPS' AND category = 'CABLE, CLUTCH CONTROL')
           OR (source_vendor = 'VTWIN' AND (name ILIKE '%cable%' OR name ILIKE '%clutch line%'))
         )
       GROUP BY 1,2,3 ORDER BY 4 DESC`,
      [PU_CABLE_SUBCATS, EXCLUDED_CATEGORIES],
    );
    console.table(audit.rows);

    console.log(`\n=== AUDIT: does '${NEW_CATEGORY}' already exist? ===`);
    const existing = await client.query(
      `SELECT COUNT(*) AS n FROM catalog_unified WHERE display_category = $1`,
      [NEW_CATEGORY],
    );
    console.log(`Rows already in '${NEW_CATEGORY}': ${existing.rows[0].n}`);

    // -----------------------------------------------------------------
    // CANDIDATES
    // -----------------------------------------------------------------
    const candidates = await client.query(
      `SELECT id, name, brand, source_vendor,
              COALESCE(subcategory, '') AS raw_subcategory,
              COALESCE(display_category, '') AS display_category,
              COALESCE(display_subcategory, '') AS display_subcategory
       FROM catalog_unified
       WHERE is_active = true
         AND (display_category IS NULL OR display_category <> ALL($2::text[]))
         AND (
           (source_vendor = 'PU'  AND subcategory = ANY($1::text[]))
           OR (source_vendor = 'WPS' AND category = 'CABLE, CLUTCH CONTROL')
           OR (source_vendor = 'VTWIN' AND (name ILIKE '%cable%' OR name ILIKE '%clutch line%'))
         )`,
      [PU_CABLE_SUBCATS, EXCLUDED_CATEGORIES],
    );
    console.log(`\nTotal candidate rows: ${candidates.rows.length}`);

    const assigned = {};   // "Subcat || Detail" -> rows
    const rerouted = {};   // "Category || Subcat" -> rows
    const flagged = [];
    const excluded = {};  // reason -> rows
    const unmatched = [];
    const flaggedBrandUnmatched = [];
    const fromCategory = {}; // source display_category -> count pulled into Cables

    for (const row of candidates.rows) {
      const res = classify(row.name, row.brand, row.raw_subcategory);

      if (res.action === 'exclude') {
        (excluded[res.reason] = excluded[res.reason] || []).push(row);
        continue;
      }
      if (res.action === 'flag') {
        flagged.push({ ...row, reason: res.reason });
        continue;
      }
      if (res.action === 'reroute') {
        const key = `${res.category} || ${res.subcategory || '(unchanged)'}`;
        (rerouted[key] = rerouted[key] || []).push({ ...row, reason: res.reason, targetCategory: res.category, targetSubcategory: res.subcategory });
        continue;
      }
      if (res.action === 'unmatched') {
        unmatched.push(row);
        if (FLAGGED_BRANDS.includes((row.brand || '').toUpperCase())) {
          flaggedBrandUnmatched.push(row);
        }
        continue;
      }

      const key = `${res.subcategory} || ${res.detail || '(none)'}`;
      (assigned[key] = assigned[key] || []).push({ ...row, newSubcategory: res.subcategory, newDetail: res.detail });
      const src = row.display_category || '(blank)';
      fromCategory[src] = (fromCategory[src] || 0) + 1;
    }

    // -----------------------------------------------------------------
    // REPORT
    // -----------------------------------------------------------------
    console.log(`\n=== SOURCE CATEGORY -> Cables (rows being pulled out) ===`);
    console.table(Object.entries(fromCategory).map(([cat, count]) => ({ from_category: cat, rows_pulled: count })).sort((a, b) => b.rows_pulled - a.rows_pulled));

    console.log(`\n=== ASSIGNED TO '${NEW_CATEGORY}' (dry run) ===`);
    const summary = Object.entries(assigned)
      .map(([key, rows]) => {
        const [subcat, detail] = key.split(' || ');
        return { subcategory: subcat, detail, count: rows.length };
      })
      .sort((a, b) => b.count - a.count);
    console.table(summary);
    console.log(`Total assigned: ${Object.values(assigned).reduce((s, r) => s + r.length, 0)}`);

    for (const [key, rows] of Object.entries(assigned)) {
      console.log(`\n--- ${key}: ${rows.length} rows ---`);
      console.table(
        rows.slice(0, SAMPLE_SIZE).map((r) => ({
          id: r.id,
          v: r.source_vendor,
          name: (r.name || '').slice(0, 62),
          brand: r.brand,
          raw_sub: (r.raw_subcategory || '').slice(0, 28),
          was: `${r.display_category} / ${r.display_subcategory}`.slice(0, 40),
        })),
      );
    }

    console.log(`\n=== REROUTED (caught by the net, do NOT belong in Cables) ===`);
    const rerouteCount = Object.values(rerouted).reduce((s, r) => s + r.length, 0);
    console.log(`Total rerouted: ${rerouteCount}`);
    for (const [key, rows] of Object.entries(rerouted)) {
      console.log(`\n--- -> ${key}: ${rows.length} rows (${rows[0].reason}) ---`);
      console.table(
        rows.slice(0, SAMPLE_SIZE).map((r) => ({
          id: r.id,
          v: r.source_vendor,
          name: (r.name || '').slice(0, 62),
          brand: r.brand,
          was: `${r.display_category} / ${r.display_subcategory}`.slice(0, 40),
        })),
      );
    }

    console.log(`\n=== EXCLUDED — name-level guard fired, LEFT ENTIRELY ALONE ===`);
    const excludedCount = Object.values(excluded).reduce((s, r) => s + r.length, 0);
    console.log(`Total excluded: ${excludedCount}`);
    for (const [reason, rows] of Object.entries(excluded)) {
      console.log(`\n--- ${reason}: ${rows.length} rows ---`);
      console.table(
        rows.slice(0, SAMPLE_SIZE).map((r) => ({
          id: r.id,
          v: r.source_vendor,
          name: (r.name || '').slice(0, 62),
          brand: r.brand,
          was: `${r.display_category} / ${r.display_subcategory}`.slice(0, 40),
        })),
      );
    }

    console.log(`\n=== FLAGGED — ambiguous, NOT touched, manual review: ${flagged.length} ===`);
    console.table(flagged.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, v: r.source_vendor, name: r.name, brand: r.brand, reason: r.reason })));

    console.log(`\n=== UNMATCHED — no rule fired, LEFT WHERE THEY ARE: ${unmatched.length} ===`);
    console.log('No blanket fallback in this script. A row that matches nothing has not earned');
    console.log('its way into a brand-new category. Review these — each is either a missing');
    console.log('rule, a reroute candidate, or correctly not a cable.');
    console.table(
      unmatched.slice(0, SAMPLE_SIZE).map((r) => ({
        id: r.id,
        v: r.source_vendor,
        name: (r.name || '').slice(0, 62),
        brand: r.brand,
        raw_sub: (r.raw_subcategory || '').slice(0, 28),
        was: `${r.display_category} / ${r.display_subcategory}`.slice(0, 40),
      })),
    );

    console.log(`\n⚠️  Unmatched rows carrying a FLAGGED brand (${FLAGGED_BRANDS.join(', ')}): ${flaggedBrandUnmatched.length}`);
    console.table(flaggedBrandUnmatched.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, v: r.source_vendor, name: (r.name || '').slice(0, 62), brand: r.brand, raw_sub: r.raw_subcategory })));

    if (!APPLY) {
      console.log('\nDry run only — no rows written. Re-run with --apply once the samples look right.');
      return;
    }

    // -----------------------------------------------------------------
    // APPLY
    // -----------------------------------------------------------------
    console.log('\n=== APPLYING ===');
    await client.query('BEGIN');
    let totalAssigned = 0;
    let totalRerouted = 0;

    for (const [key, rows] of Object.entries(assigned)) {
      const ids = rows.map((r) => r.id);
      const { newSubcategory, newDetail } = rows[0];
      const res = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1,
             display_subcategory = $2,
             display_subcategory_detail = $3,
             updated_at = now()
         WHERE id = ANY($4::int[])`,
        [NEW_CATEGORY, newSubcategory, newDetail, ids],
      );
      console.log(`  Cables / ${key}: ${res.rowCount} rows`);
      totalAssigned += res.rowCount;
    }

    for (const [key, rows] of Object.entries(rerouted)) {
      const ids = rows.map((r) => r.id);
      const { targetCategory, targetSubcategory } = rows[0];
      // Null subcategory means "move the category, leave subcategory alone."
      const res = targetSubcategory
        ? await client.query(
            `UPDATE catalog_unified
             SET display_category = $1, display_subcategory = $2, updated_at = now()
             WHERE id = ANY($3::int[])`,
            [targetCategory, targetSubcategory, ids],
          )
        : await client.query(
            `UPDATE catalog_unified
             SET display_category = $1, updated_at = now()
             WHERE id = ANY($2::int[])`,
            [targetCategory, ids],
          );
      console.log(`  REROUTE -> ${key}: ${res.rowCount} rows`);
      totalRerouted += res.rowCount;
    }

    await client.query('COMMIT');
    console.log(`\nAssigned to Cables: ${totalAssigned}`);
    console.log(`Rerouted elsewhere: ${totalRerouted}`);
    console.log(`Excluded (guard), untouched: ${Object.values(excluded).reduce((s, r) => s + r.length, 0)}`);
    console.log(`Flagged, untouched: ${flagged.length}`);
    console.log(`Unmatched, untouched: ${unmatched.length}`);
    console.log('\nNext:');
    console.log('  node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  node scripts/ingest/index_unified.js --recreate');
    console.log('\nAlso: Cables is a NEW display_category. Check anything that hardcodes the');
    console.log('21-category list — CategoryBentoGrid, browse filters, nav.');
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
