// audit_foot_controls_scope.mjs
// READ-ONLY scoping audit for the Foot Controls category REBUILD IN PLACE.
// No writes. No classification rules applied yet.
//
// Laken's call: this is NOT a new category — rebuild the existing
// "Foot Controls" category in place with three new subcategories:
//   1. Forward Controls & HW
//   2. Floorboards & HW
//   3. Footpegs, Shift Pegs, & HW
//
// "& HW" in all three names signals the same cross-system-fastener risk
// seen in Frame & Hardware during the Frames & Suspension rebuild — bolt
// kits and hardware sets need checking for whether they're actually
// foot-control-specific or just generic fasteners that happen to sit here.
//
// Run: node audit_foot_controls_scope.mjs > foot_controls_audit.txt 2>&1

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

function section(title) {
  console.log('\n' + '='.repeat(100));
  console.log(title);
  console.log('='.repeat(100));
}

async function main() {
  console.log('=== FOOT CONTROLS — SCOPING AUDIT (read-only) ===');
  console.log(new Date().toISOString());

  // ---------------------------------------------------------------------
  // 1. Baseline — current Foot Controls category shape
  // ---------------------------------------------------------------------
  section('1. FOOT CONTROLS — current display_subcategory breakdown (incl. NULL)');
  {
    const { rows } = await db.query(`
      SELECT
        COALESCE(display_subcategory, '<<NULL>>') AS subcat,
        COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Foot Controls'
        AND is_active = true
      GROUP BY 1
      ORDER BY n DESC
    `);
    console.table(rows);
    const total = rows.reduce((s, r) => s + Number(r.n), 0);
    console.log(`Total (active): ${total}`);
  }

  section('1b. FOOT CONTROLS — source_vendor split');
  {
    const { rows } = await db.query(`
      SELECT source_vendor, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Foot Controls' AND is_active = true
      GROUP BY 1 ORDER BY n DESC
    `);
    console.table(rows);
  }

  section('1c. FOOT CONTROLS — PU vendor subcategory values');
  {
    const { rows } = await db.query(`
      SELECT subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Foot Controls'
        AND source_vendor = 'PU'
        AND is_active = true
      GROUP BY subcategory
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 2. Keyword bucket counts within Foot Controls for the three new subcats
  // ---------------------------------------------------------------------
  section('2. Keyword bucket counts WITHIN Foot Controls');
  {
    const buckets = {
      'Forward Controls': [`%FORWARD CONTROL%`],
      'Floorboards':       [`%FLOORBOARD%`, `%FLOOR BOARD%`],
      'Footpegs':          [`%FOOTPEG%`, `%FOOT PEG%`],
      'Shift Pegs':        [`%SHIFT PEG%`],
      'Bare "Peg"':        [`%PEG%`], // flagged — could overlap with kickstand/other pegs
      'Bare "HW"/"Hardware"': [`%HARDWARE%`],
      'Highway Pegs (?)':  [`%HIGHWAY PEG%`], // flagged — different product, verify not conflated
      'Toe/Heel Shifter':  [`%TOE SHIFTER%`, `%HEEL SHIFTER%`, `%HEEL-TOE%`],
      'Brake Pedal':       [`%BRAKE PEDAL%`], // flagged — often bundled with rear controls, verify placement
    };
    for (const [label, patterns] of Object.entries(buckets)) {
      const orClauses = patterns.map((_, i) => `name ILIKE $${i + 1}`).join(' OR ');
      const { rows } = await db.query(
        `SELECT COUNT(*) AS n FROM catalog_unified
         WHERE display_category = 'Foot Controls' AND is_active = true AND (${orClauses})`,
        patterns
      );
      console.log(`  ${label}: ${rows[0].n}`);
    }
  }

  // ---------------------------------------------------------------------
  // 3. Cross-category sweep — footpeg/floorboard/forward-control rows that
  //    might currently live OUTSIDE Foot Controls (stragglers, same pattern
  //    as Cables and Dashes & Gauges)
  // ---------------------------------------------------------------------
  section('3. Cross-category sweep — footpeg/floorboard/forward-control rows outside Foot Controls');
  {
    const { rows } = await db.query(`
      SELECT display_category, COUNT(*) AS n
      FROM catalog_unified
      WHERE is_active = true
        AND display_category != 'Foot Controls'
        AND (
          name ILIKE '%floorboard%' OR name ILIKE '%floor board%'
          OR name ILIKE '%footpeg%' OR name ILIKE '%foot peg%'
          OR name ILIKE '%forward control%'
          OR name ILIKE '%shift peg%'
        )
      GROUP BY display_category
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 4. Generic "HARDWARE"/"PEG" sanity checks across ALL categories, same
  //    pattern as the Frame & Hardware bare-keyword risk check
  // ---------------------------------------------------------------------
  for (const [label, pattern] of [
    ['Bare "HARDWARE" across ALL categories', '%HARDWARE%'],
    ['Bare "PEG" across ALL categories', '%PEG%'],
  ]) {
    section(`4. ${label}`);
    const { rows } = await db.query(
      `SELECT display_category, COUNT(*) AS n
       FROM catalog_unified
       WHERE name ILIKE $1 AND is_active = true
       GROUP BY display_category
       ORDER BY n DESC
       LIMIT 20`,
      [pattern]
    );
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 5. Unmatched sample within Foot Controls — what falls outside all three
  //    new subcategory buckets
  // ---------------------------------------------------------------------
  section('5. Foot Controls rows matching NONE of the three new-subcategory keywords (sample)');
  {
    const { rows } = await db.query(`
      SELECT source_vendor, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Foot Controls'
        AND is_active = true
        AND NOT (
          name ILIKE '%FORWARD CONTROL%'
          OR name ILIKE '%FLOORBOARD%' OR name ILIKE '%FLOOR BOARD%'
          OR name ILIKE '%FOOTPEG%' OR name ILIKE '%FOOT PEG%'
          OR name ILIKE '%SHIFT PEG%'
          OR name ILIKE '%PEG%'
        )
      ORDER BY name
      LIMIT 50
    `);
    console.table(rows);
    console.log('(showing up to 50 — this is what would stay unclassified under the current 3-subcategory spec)');
  }

  console.log('\n=== AUDIT COMPLETE — no writes performed ===');
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('AUDIT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
