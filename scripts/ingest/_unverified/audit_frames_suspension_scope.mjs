// audit_frames_suspension_scope.mjs
// READ-ONLY scoping audit for the new "Frames & Suspension" top-level category.
// No writes. No classification rules applied yet.
//
// IMPORTANT — per Laken's call: this is a NEW third category, not a merge.
// The existing `Frame & Hardware` and `Suspension` categories stay in place,
// untouched, as their own display_category values. This audit checks how much
// of their content ALSO matches the new spec (i.e. candidates to copy/move
// into Frames & Suspension), plus other likely source categories.
//
// Laken's spec for Frames & Suspension (verbatim buckets, grouped by theme):
//   Trike:        TRIKE CONVERSION KITS
//   Frame:        FRAME, SWINGARM, STRUTS & STABILIZER KIT, HARDTAIL, WELD-ON,
//                 BOLT ON, RIGID FRAME, FRAME & FORK KIT, FRAME HARDWARE,
//                 FRAME TAB, FRAME MOUNT, SEAT TABS, SEAT BAR, FRAME COMPONENT,
//                 WISHBONE, RETRO RIGID, STRAIGHT LEG FRAME, PANHEAD FRAME,
//                 ROLLING CHASSIS KIT, KNUCKLEHEAD FRAME, SWINGARM PIVOT,
//                 STRUTS, STRUT COVERS
//   Springer:     SPRINGER FORK ASSEMBLIES AND COMPONENTS
//   Triple Trees: TOP NUT, NECK KIT, RAKED KIT, NECK POST, STEERING STEM NUT
//   Forks:        FORK LOWER LEGS, LOWER LEG COVERS, FORK TUBES, GLIDE FORK
//                 ASSEMBLY, ADJUSTABLE FORK, GLIDE DRUM BRAKE FORK, DUAL DISC
//                 FORK, BARE FORK, FORK PLUG, 35mm/33.5MM/41MM FORK, FORK
//                 DAMPER, FORK INTERNAL, FORK DRAIN PLUG, FORK BOOT, FORK
//                 SPRING, FORK SEAL, FORK BRACE, FORK DUST COVER, FORK TIN,
//                 SPRINGS, FORK PRELOAD, REBUILD KITS
//   Shocks:       REAR SHOCKS, LOWERING KITS, SHOCK BUSHINGS, HARDWARE, SHOCK
//                 STUD, SHOCK COVER, HEIGHT ADJUSTABLE, LEGEND REVO,
//                 PIGGYBACK, COIL SUSPENSION, 444/990/944 FST SERIES,
//                 STILETTO, AIR SUSPENSION, 422 SERIES, SLAMMER KIT, REAR
//                 LOWERING KIT
//   General:      SIDE COVER FXR, CHIN SPOILERS, SKID PLATES, FRONT FORK AIR
//                 BAFFLE, LOWER FILLERS, HIGHWAY BARS, TRAILER HITCH
//
// Note: several words here are dangerously generic on their own — "HARDWARE",
// "SPRINGS", "REBUILD KITS", "SEAT TABS", "SEAT BAR" — flagged for overlap
// checks against Foot Controls, Seating, Fenders & Body before trusting them.
//
// Run: node audit_frames_suspension_scope.mjs > frames_suspension_audit.txt 2>&1

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

// Keyword buckets — loose ILIKE patterns for visibility only, not classification yet.
const KEYWORD_BUCKETS = {
  'Trike Conversion Kits':      [`%TRIKE CONVERSION%`, `%TRIKE KIT%`],
  'Frame (general)':            [`%FRAME%`],
  'Swingarm':                   [`%SWINGARM%`],
  'Struts / Stabilizer':        [`%STRUT%`, `%STABILIZER%`],
  'Hardtail / Rigid':           [`%HARDTAIL%`, `%RIGID FRAME%`],
  'Weld-On / Bolt On':          [`%WELD-ON%`, `%WELD ON%`, `%BOLT ON%`],
  'Rolling Chassis':            [`%ROLLING CHASSIS%`],
  'Wishbone':                   [`%WISHBONE%`],
  'Panhead / Knucklehead Frame':[`%PANHEAD FRAME%`, `%KNUCKLEHEAD FRAME%`],
  'Straight Leg Frame':         [`%STRAIGHT LEG%`, `%STRAIGT LEG%`], // includes spec's own typo
  'Seat Tabs / Seat Bar':       [`%SEAT TAB%`, `%SEAT BAR%`], // flagged — check Seating overlap
  'Springer Fork':              [`%SPRINGER FORK%`, `%SPRINGER%`],
  'Triple Trees':               [`%TRIPLE TREE%`, `%TOP NUT%`, `%NECK KIT%`, `%RAKED KIT%`, `%NECK POST%`, `%STEERING STEM NUT%`],
  'Fork (general)':             [`%FORK%`],
  'Fork Seal / Boot / Brace':   [`%FORK SEAL%`, `%FORK BOOT%`, `%FORK BRACE%`, `%FORK DUST COVER%`, `%FORK TIN%`],
  'Fork Springs':               [`%FORK SPRING%`], // narrower than bare "SPRINGS" — check bare SPRINGS separately
  'Bare "Springs"':             [`%SPRING%`], // flagged — extremely generic, likely huge overlap with Engine/Suspension
  'Rebuild Kits':                [`%REBUILD KIT%`], // flagged — generic, could hit many categories
  'Rear Shocks':                 [`%SHOCK%`],
  'Lowering Kits':               [`%LOWERING KIT%`, `%SLAMMER KIT%`],
  'Air Suspension':              [`%AIR SUSPENSION%`],
  'Coil Suspension':             [`%COIL SUSPENSION%`],
  'Series (444/990/944/422)':    [`%444 SERIES%`, `%990 SERIES%`, `%944 FST%`, `%422 SERIES%`],
  'Stiletto / Legend Revo':      [`%STILETTO%`, `%LEGEND REVO%`, `%PIGGYBACK%`],
  'Side Cover FXR':              [`%SIDE COVER%`],
  'Chin Spoiler':                [`%CHIN SPOILER%`],
  'Skid Plate':                  [`%SKID PLATE%`],
  'Front Fork Air Baffle':       [`%FORK AIR BAFFLE%`, `%AIR BAFFLE%`],
  'Lower Fillers':               [`%LOWER FILLER%`],
  'Highway Bars':                [`%HIGHWAY BAR%`],
  'Trailer Hitch':               [`%TRAILER HITCH%`],
  'Bare "Hardware"':              [`%HARDWARE%`], // flagged — extremely generic
};

// Likely source categories. Frame & Hardware and Suspension are the obvious
// primary sources (per Laken: stay untouched as categories, but their matching
// ROWS get copied/moved into the new Frames & Suspension category).
// Accessories & Misc and Fenders & Body checked per established pattern
// (VTWIN COMMON MISC dumping ground, prior Tanks & Body / Dashes & Gauges spillover).
const SOURCE_CATEGORIES = [
  'Frame & Hardware',
  'Suspension',
  'Accessories & Misc',
  'Fenders & Body',
  'Foot Controls', // "Highway Bars" / generic hardware could live here
  'Seating',       // "Seat Tabs" / "Seat Bar" overlap check
];

async function main() {
  console.log('=== FRAMES & SUSPENSION — SCOPING AUDIT (read-only) ===');
  console.log(new Date().toISOString());
  console.log('');

  // 1. Baseline: current Frame & Hardware and Suspension breakdowns
  for (const cat of ['Frame & Hardware', 'Suspension']) {
    console.log(`--- 1. Current ${cat} category (baseline) ---`);
    const breakdown = await db.query(
      `SELECT display_subcategory, COUNT(*) AS n
       FROM catalog_unified
       WHERE display_category = $1 AND is_active = true
       GROUP BY display_subcategory
       ORDER BY n DESC`,
      [cat]
    );
    console.table(breakdown.rows);
    const total = breakdown.rows.reduce((s, r) => s + Number(r.n), 0);
    console.log(`${cat} total (active): ${total}`);
    console.log('');
  }

  // 2. Per-source, per-keyword-bucket counts
  for (const source of SOURCE_CATEGORIES) {
    console.log(`--- 2. Source category: ${source} ---`);

    const totalRes = await db.query(
      `SELECT COUNT(*) AS n FROM catalog_unified WHERE display_category = $1 AND is_active = true`,
      [source]
    );
    console.log(`${source} total (active): ${totalRes.rows[0].n}`);

    const nullRes = await db.query(
      `SELECT COUNT(*) AS n FROM catalog_unified WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true`,
      [source]
    );
    console.log(`${source} NULL subcategory: ${nullRes.rows[0].n}`);
    console.log('');

    for (const [bucketName, patterns] of Object.entries(KEYWORD_BUCKETS)) {
      const orClauses = patterns.map((_, i) => `name ILIKE $${i + 2}`).join(' OR ');
      const res = await db.query(
        `SELECT COUNT(*) AS n
         FROM catalog_unified
         WHERE display_category = $1
           AND is_active = true
           AND (${orClauses})`,
        [source, ...patterns]
      );
      const n = Number(res.rows[0].n);
      if (n > 0) {
        console.log(`  ${bucketName}: ${n}`);
      }
    }
    console.log('');
  }

  // 3. Overlap check within Frame & Hardware + Suspension combined
  console.log('--- 3. Cross-bucket overlap sample (Frame & Hardware + Suspension) ---');
  const allPatterns = Object.values(KEYWORD_BUCKETS).flat();
  const overlapRes = await db.query(
    `
    SELECT source_vendor, display_category, name, display_subcategory, COUNT(*) OVER () AS total_matches
    FROM catalog_unified
    WHERE display_category IN ('Frame & Hardware', 'Suspension')
      AND is_active = true
      AND (
        ${allPatterns.map((_, i) => `name ILIKE $${i + 1}`).join(' OR ')}
      )
    ORDER BY name
    LIMIT 25
    `,
    allPatterns
  );
  console.table(overlapRes.rows);
  console.log('');

  // 4. Generic-keyword sanity checks — these are the riskiest patterns in the
  // spec (SPRING, HARDWARE, REBUILD KIT) and need to be seen in context before
  // any classification rule is written, to avoid sweeping in unrelated parts.
  for (const [label, pattern] of [
    ['Bare "SPRING" — sample across ALL categories', '%SPRING%'],
    ['Bare "HARDWARE" — sample across ALL categories', '%HARDWARE%'],
    ['"REBUILD KIT" — sample across ALL categories', '%REBUILD KIT%'],
    ['"SEAT TAB" / "SEAT BAR" — sample across ALL categories', null], // handled specially below
  ]) {
    if (pattern === null) continue;
    console.log(`--- 4. ${label} ---`);
    const res = await db.query(
      `SELECT display_category, COUNT(*) AS n
       FROM catalog_unified
       WHERE name ILIKE $1 AND is_active = true
       GROUP BY display_category
       ORDER BY n DESC`,
      [pattern]
    );
    console.table(res.rows);
    console.log('');
  }

  console.log('--- 4b. "SEAT TAB" / "SEAT BAR" — sample across ALL categories ---');
  const seatRes = await db.query(`
    SELECT display_category, COUNT(*) AS n
    FROM catalog_unified
    WHERE (name ILIKE '%SEAT TAB%' OR name ILIKE '%SEAT BAR%')
      AND is_active = true
    GROUP BY display_category
    ORDER BY n DESC
  `);
  console.table(seatRes.rows);
  console.log('');

  // 5. Null-subcategory rows in Frame & Hardware / Suspension not matching any bucket
  for (const cat of ['Frame & Hardware', 'Suspension']) {
    console.log(`--- 5. ${cat} rows matching NO keyword bucket (sample) ---`);
    const unmatchedRes = await db.query(
      `
      SELECT source_vendor, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = $1
        AND is_active = true
        AND NOT (${allPatterns.map((_, i) => `name ILIKE $${i + 2}`).join(' OR ')})
      ORDER BY name
      LIMIT 30
      `,
      [cat, ...allPatterns]
    );
    console.table(unmatchedRes.rows);
    console.log(`(showing up to 30 of possibly more — this is what stays OUT of Frames & Suspension)`);
    console.log('');
  }

  console.log('=== AUDIT COMPLETE — no writes performed ===');
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('AUDIT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
