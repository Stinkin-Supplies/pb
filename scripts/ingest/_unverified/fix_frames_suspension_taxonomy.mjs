// fix_frames_suspension_taxonomy.mjs
// Frames & Suspension — NEW top-level category classifier.
// Follows standing method: audit (done) -> dry-run (this script, default) ->
// sample review -> apply (--apply) -> sync -> reindex.
//
// DEFAULT MODE = DRY RUN. No writes happen unless --apply is passed.
//
// CRITICAL: Frame & Hardware and Suspension are NOT retired or renamed by this
// script — Laken's call is that Frames & Suspension is a third, new top-level
// category. Matching rows get their display_category CHANGED to
// "Frames & Suspension", which means they DO leave their old category. The
// old categories remain valid display_category values for whatever doesn't
// match (fasteners, body panels, kickstands in Frame & Hardware; whatever
// stays unclassified in Suspension).
//
// Sources checked (per audit):
//   1. Frame & Hardware   (2,906 rows) — primary source
//   2. Suspension         (3,369 rows) — primary source
//   3. Accessories & Misc (keyword matches only)
//   4. Fenders & Body     (keyword matches only)
//   5. Foot Controls      (keyword matches only — Highway Bars overlap)
//   6. Seating            (keyword matches only — Seat Tab/Seat Bar overlap)
//
// GENERIC KEYWORD SAFETY (Laken's call, round 1):
//   Bare "SPRING", "HARDWARE", and "REBUILD KIT" are dangerously generic —
//   audit showed them scattered across Engine, Transmission, Seating, Foot
//   Controls, Brakes, Carburetion & Fuel, etc. Laken's call: these three bare
//   patterns are ONLY applied when display_category is Frame & Hardware or
//   Suspension (never against Accessories & Misc, Fenders & Body, Foot
//   Controls, or Seating, even though those are checked for other keywords).
//   This is enforced by GENERIC_PATTERNS being checked separately per-row,
//   gated on source category — see classify().
//
// VENDOR ABBREVIATIONS (Laken's call, round 1): added to catch PU/WPS
// shorthand spotted in the audit's unmatched sample: "FRK TUBE" (fork tube),
// "STEERING STM CVR" (steering stem cover), "TRIPPLE TREES" (vendor typo for
// triple trees), "RAKED TREE SET".
//
// Run:
//   node fix_frames_suspension_taxonomy.mjs                 (dry run, default)
//   node fix_frames_suspension_taxonomy.mjs --apply          (live writes)
//   node fix_frames_suspension_taxonomy.mjs --sample=50       (dry run, bigger sample)

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const db = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sampleArg = args.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 20;

const NEW_CATEGORY = 'Frames & Suspension';

// Sources whose rows are ALLOWED to match the generic (bare) patterns.
// Everything else only matches the specific/compound patterns.
const GENERIC_SAFE_SOURCES = new Set(['Frame & Hardware', 'Suspension']);

// Order matters — first match wins. All boundaries use JS \b (not Postgres \y —
// see Dashes & Gauges round-1 bug for why that distinction matters here).
const SPECIFIC_RULES = [
  // --- Trike ---
  { subcategory: 'Trike Conversion Kits', pattern: /TRIKE\s+CONVERSION/i },

  // --- Triple Trees (checked before generic Frame so "Neck Kit" etc don't get swept into Frame) ---
  { subcategory: 'Triple Trees & Covers', pattern: /TRIPLE\s+TREE/i },
  { subcategory: 'Triple Trees & Covers', pattern: /TRIPPLE\s+TREE/i }, // vendor typo, round 1
  { subcategory: 'Triple Trees & Covers', pattern: /RAKED\s+TREE/i }, // round 1: "6 DEG RAKED TREE SET"
  { subcategory: 'Triple Trees & Covers', pattern: /RAKED\s+TRIPPLE\s+TREE/i }, // round 1: "4 DEG RAKED TRIPPLE TREES"
  { subcategory: 'Triple Trees & Covers', pattern: /TOP\s+NUT/i },
  { subcategory: 'Triple Trees & Covers', pattern: /NECK\s+KIT/i },
  { subcategory: 'Triple Trees & Covers', pattern: /NECK\s+POST/i },
  { subcategory: 'Triple Trees & Covers', pattern: /STEERING\s+STEM\s+NUT/i },
  { subcategory: 'Triple Trees & Covers', pattern: /STEM\s+NUT/i }, // round 1: "39mm Top Stem Nut"
  { subcategory: 'Triple Trees & Covers', pattern: /STEERING\s+ST[EM]+\s+CVR/i }, // round 1 vendor abbrev: "STEERING STM CVR"
  { subcategory: 'Triple Trees & Covers', pattern: /NARROW\s+TREE/i }, // round 1: "39mm Narrow Tree Front Axle", "41mm Narrow Tree Kit"

  // --- Springer Fork ---
  { subcategory: 'Springer Fork', pattern: /SPRINGER\s+FORK/i },
  { subcategory: 'Springer Fork', pattern: /\bSPRINGER\b/i },

  // --- Forks (specific compounds first) ---
  { subcategory: 'Forks', pattern: /FORK\s+LOWER\s+LEG/i },
  { subcategory: 'Forks', pattern: /LOWER\s+LEG\s+COVER/i },
  { subcategory: 'Forks', pattern: /FORK\s+TUBE/i },
  { subcategory: 'Forks', pattern: /\bFRK\s+TUBE/i }, // round 1 vendor abbrev: "41MM FRK TUBE", "6\" FRK TUB"
  { subcategory: 'Forks', pattern: /\bFRK\s+TUB\b/i }, // round 1 vendor abbrev truncated form
  { subcategory: 'Forks', pattern: /GLIDE\s+FORK/i },
  { subcategory: 'Forks', pattern: /ADJUSTABLE\s+FORK/i },
  { subcategory: 'Forks', pattern: /GLIDE\s+DRUM\s+BRAKE\s+FORK/i },
  { subcategory: 'Forks', pattern: /DUAL\s+DISC\s+FORK/i },
  { subcategory: 'Forks', pattern: /BARE\s+FORK/i },
  { subcategory: 'Forks', pattern: /FORK\s+PLUG/i },
  { subcategory: 'Forks', pattern: /\d{2}(\.\d+)?\s*MM\s+FORK/i }, // 35mm / 33.5MM / 41MM FORK
  { subcategory: 'Forks', pattern: /FORK\s+DAMPER/i },
  { subcategory: 'Forks', pattern: /FORK\s+INTERNAL/i },
  { subcategory: 'Forks', pattern: /FORK\s+DRAIN\s+PLUG/i },
  { subcategory: 'Forks', pattern: /FORK\s+BOOT/i },
  { subcategory: 'Forks', pattern: /FORK\s+SPRING/i },
  { subcategory: 'Forks', pattern: /FORK\s+SEAL/i },
  { subcategory: 'Forks', pattern: /FORK\s+BRACE/i },
  { subcategory: 'Forks', pattern: /FORK\s+DUST\s+COVER/i },
  { subcategory: 'Forks', pattern: /FORK\s+TIN/i },
  { subcategory: 'Forks', pattern: /FORK\s+PRELOAD/i },
  { subcategory: 'Forks', pattern: /FRONT\s+END\s+SUSPENSION/i }, // round 1: "AXEO21KO Front End Suspension"
  { subcategory: 'Forks', pattern: /\bFORK\b/i, broadFallback: true }, // broad fallback within Forks — needs cross-system exclusion guard

  // --- Rear Shocks / Lowering Kits ---
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /LOWERING\s+KIT/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /SLAMMER\s+KIT/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /REAR\s+LOWERING\s+KIT/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /SHOCK\s+BUSHING/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /SHOCK\s+STUD/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /SHOCK\s+COVER/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /HEIGHT\s+ADJUSTABLE/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /LEGEND\s+REVO/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /PIGGYBACK/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /COIL\s+SUSPENSION/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /\b(444|990|944|422)\s+(SERIES|FST)\b/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /\b944\b/i }, // round 1: "944 Ultra Low", "944 Ultra Touring" (no "SERIES"/"FST" suffix)
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /STILETTO/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /AIR\s+SUSPENSION/i },
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /AIR-A\s+SUSPENSION/i }, // round 1: "AIR-A Suspension - 13\""
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /\bSHOCK\b/i, broadFallback: true }, // broad fallback — needs cross-system exclusion guard

  // --- Frame (broad, checked after more specific rules above) ---
  { subcategory: 'Frame', pattern: /HARDTAIL/i },
  { subcategory: 'Frame', pattern: /RIGID\s+FRAME/i },
  { subcategory: 'Frame', pattern: /FRAME\s*&?\s*FORK\s+KIT/i },
  { subcategory: 'Frame', pattern: /FRAME\s+HARDWARE/i },
  { subcategory: 'Frame', pattern: /FRAME\s+TAB/i },
  { subcategory: 'Frame', pattern: /FRAME\s+MOUNT/i },
  { subcategory: 'Frame', pattern: /FRAME\s+COMPONENT/i },
  { subcategory: 'Frame', pattern: /WISHBONE/i },
  { subcategory: 'Frame', pattern: /RETRO\s+RIGID/i },
  { subcategory: 'Frame', pattern: /STRAIG?HT\s+LEG\s+FRAME/i }, // covers spec's own "STRAIGT LEG FRAME" typo
  { subcategory: 'Frame', pattern: /PANHEAD\s+FRAME/i },
  { subcategory: 'Frame', pattern: /KNUCKLEHEAD\s+FRAME/i },
  { subcategory: 'Frame', pattern: /ROLLING\s+CHASSIS/i },
  { subcategory: 'Frame', pattern: /SWINGARM\s+PIVOT/i },
  { subcategory: 'Frame', pattern: /\bSWINGARM\b/i },
  { subcategory: 'Frame', pattern: /STRUT\s+COVER/i },
  { subcategory: 'Frame', pattern: /STABILIZER\s+KIT/i },
  { subcategory: 'Frame', pattern: /WELD[\s-]?ON/i },
  { subcategory: 'Frame', pattern: /BOLT\s+ON/i },
  { subcategory: 'Frame', pattern: /SEAT\s+TAB/i },
  { subcategory: 'Frame', pattern: /SEAT\s+BAR/i },
  { subcategory: 'Frame', pattern: /\bSTRUT\b/i },
  { subcategory: 'Frame', pattern: /\bFRAME\b/i }, // broad fallback within Frame

  // --- General Accessories ---
  { subcategory: 'General Accessories', pattern: /SIDE\s+COVER\s+FXR/i },
  { subcategory: 'General Accessories', pattern: /CHIN\s+SPOILER/i },
  { subcategory: 'General Accessories', pattern: /SKID\s+PLATE/i },
  { subcategory: 'General Accessories', pattern: /FORK\s+AIR\s+BAFFLE/i },
  { subcategory: 'General Accessories', pattern: /LOWER\s+FILLER/i },
  { subcategory: 'General Accessories', pattern: /HIGHWAY\s+BAR/i },
  { subcategory: 'General Accessories', pattern: /TRAILER\s+HITCH/i },
];

// Generic/bare patterns — ONLY checked when the row's source category is
// Frame & Hardware or Suspension (see classify()).
const GENERIC_RULES = [
  { subcategory: 'Forks', pattern: /FORK\s+SPRING/i }, // redundant safety net, already in SPECIFIC_RULES
  { subcategory: 'Rear Shocks & Lowering Kits', pattern: /\bREBUILD\s+KIT\b/i },
  { subcategory: 'Frame', pattern: /\bHARDWARE\b/i },
  { subcategory: 'Forks', pattern: /\bSPRING\b/i }, // bare "Springs" — last resort, generic-safe sources only
];

// Round-2 fix: Frame & Hardware's "Hardware & Fasteners" subcategory is a
// cross-system fastener bin — bolt kits for brakes, engine, transmission, etc
// all sit there regardless of what system they belong to. The bare
// HARDWARE/SPRING/REBUILD KIT fallbacks above were sweeping these in just
// because they happened to live in Frame & Hardware or Suspension.
// Laken's call: keep the bare fallback, but exclude rows whose name mentions
// another system's parts first.
const OTHER_SYSTEM_EXCLUSIONS = /\b(BRAKE|ROTOR|CALIPER|ENGINE\s+CASE|CAM(SHAFT)?|ROCKER\s+BOX|TAPPET|PRIMARY|SPROCKET|BELT\s+PULLEY|TRANSMISSION|CLUTCH|INTAKE\s+MANIFOLD|CARBURETOR|VALVE|DOCKING|SHIFTER|STARTER|GEAR)\b/i; // round-3: DOCKING (Luggage & Racks); SHIFTER (transmission shift fork, not suspension fork), STARTER/GEAR (engine/electrical) — Laken's call: grab suspension items, hold the rest for end-of-session cleanup

// Round-3 fix: bare/broad fallback patterns (\bFORK\b, \bSHOCK\b in
// SPECIFIC_RULES; \bSPRING\b, \bHARDWARE\b, REBUILD KIT in GENERIC_RULES)
// all share the same cross-system leak risk — e.g. "Shifter Fork" is a
// transmission part, not a suspension fork; "Spring Stud - Starter" is
// engine/electrical. Laken's call: grab the real suspension items, exclude
// the rest here and review at end-of-session cleanup, same pattern as
// Dashes & Gauges' held-back list.
const BROAD_FALLBACK_SUBCATS = new Set(['Forks', 'Rear Shocks & Lowering Kits', 'Frame']);

function classify(name, sourceCategory) {
  for (const rule of SPECIFIC_RULES) {
    if (rule.pattern.test(name)) {
      // Only the broad single-word fallbacks (bare FORK/SHOCK, explicitly
      // flagged) need the cross-system exclusion guard — specific compound
      // phrases (FORK SEAL, FORK TUBE, etc) are unambiguous and skip it.
      if (rule.broadFallback && OTHER_SYSTEM_EXCLUSIONS.test(name)) continue;
      return rule.subcategory;
    }
  }
  if (GENERIC_SAFE_SOURCES.has(sourceCategory)) {
    if (OTHER_SYSTEM_EXCLUSIONS.test(name)) return null;
    for (const rule of GENERIC_RULES) {
      if (rule.pattern.test(name)) return rule.subcategory;
    }
  }
  return null;
}

const SOURCE_QUERIES = [
  {
    label: 'Frame & Hardware (primary source)',
    category: 'Frame & Hardware',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Frame & Hardware'
            AND is_active = true`,
  },
  {
    label: 'Suspension (primary source)',
    category: 'Suspension',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Suspension'
            AND is_active = true`,
  },
  {
    label: 'Accessories & Misc (keyword matches only, no generic patterns)',
    category: 'Accessories & Misc',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Accessories & Misc'
            AND is_active = true
            AND (
              name ILIKE '%TRIKE CONVERSION%' OR name ILIKE '%TRIPLE TREE%'
              OR name ILIKE '%SPRINGER%' OR name ILIKE '%FORK%'
              OR name ILIKE '%SHOCK%' OR name ILIKE '%CHIN SPOILER%'
              OR name ILIKE '%TRAILER HITCH%' OR name ILIKE '%SWINGARM%'
              OR name ILIKE '%HARDTAIL%'
            )`,
  },
  {
    label: 'Fenders & Body (keyword matches only)',
    category: 'Fenders & Body',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Fenders & Body'
            AND is_active = true
            AND (name ILIKE '%FORK%' OR name ILIKE '%STILETTO%' OR name ILIKE '%LEGEND REVO%')`,
  },
  {
    label: 'Foot Controls (keyword matches only — Highway Bars overlap)',
    category: 'Foot Controls',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Foot Controls'
            AND is_active = true
            AND (name ILIKE '%HIGHWAY BAR%' OR name ILIKE '%SIDE COVER FXR%')`,
  },
  {
    label: 'Seating (keyword matches only — Seat Tab/Seat Bar overlap)',
    category: 'Seating',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Seating'
            AND is_active = true
            AND (name ILIKE '%SEAT TAB%' OR name ILIKE '%SEAT BAR%')`,
  },
];

async function main() {
  console.log(`=== FRAMES & SUSPENSION — CLASSIFIER (${APPLY ? 'LIVE APPLY' : 'DRY RUN'}) ===`);
  console.log(new Date().toISOString());
  console.log('');

  const results = {};
  const unmatched = [];
  let totalCandidates = 0;

  for (const source of SOURCE_QUERIES) {
    const res = await db.query(source.sql);
    console.log(`--- Source: ${source.label} — ${res.rows.length} candidates ---`);
    totalCandidates += res.rows.length;

    for (const row of res.rows) {
      const subcat = classify(row.name, source.category);
      if (subcat) {
        results[subcat] = results[subcat] || [];
        results[subcat].push({ ...row, source: source.label });
      } else {
        unmatched.push({ ...row, source: source.label });
      }
    }
  }

  console.log('');
  console.log('--- Classification summary ---');
  let totalClassified = 0;
  for (const [subcat, rows] of Object.entries(results)) {
    console.log(`  ${subcat}: ${rows.length}`);
    totalClassified += rows.length;
  }
  console.log(`  UNMATCHED: ${unmatched.length}`);
  console.log(`  Total candidates: ${totalCandidates} | Classified: ${totalClassified} | Unmatched: ${unmatched.length}`);
  console.log(`  Coverage: ${((totalClassified / totalCandidates) * 100).toFixed(1)}%`);
  console.log('');

  console.log(`--- Sample rows per subcategory (first ${SAMPLE_SIZE}) ---`);
  for (const [subcat, rows] of Object.entries(results)) {
    console.log(`\n  [${subcat}] (${rows.length} total)`);
    rows.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  if (unmatched.length > 0) {
    console.log(`\n  [UNMATCHED] (${unmatched.length} total, first ${SAMPLE_SIZE})`);
    unmatched.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  console.log('');

  if (!APPLY) {
    console.log('=== DRY RUN COMPLETE — no writes performed. Review samples above, then re-run with --apply. ===');
    return;
  }

  console.log('=== APPLYING CHANGES ===');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let updatedCount = 0;
    for (const [subcat, rows] of Object.entries(results)) {
      const ids = rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2
         WHERE id = ANY($3::int[])`,
        [NEW_CATEGORY, subcat, ids]
      );
      console.log(`  Updated ${res.rowCount} rows -> ${NEW_CATEGORY} / ${subcat}`);
      updatedCount += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\n=== APPLY COMPLETE — ${updatedCount} rows updated. Unmatched (${unmatched.length}) left untouched in their original categories. ===`);
    console.log('Next: re-sync / reindex Typesense per standing pipeline.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('APPLY FAILED, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SCRIPT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
