// audit_cables_scope.mjs
// READ-ONLY scoping audit for the new "Cables" top-level category.
// No writes. No classification rules applied yet.
//
// PRIOR SESSION NOTE: the first attempt at this audit used a column named
// `raw_category`, which does not exist in catalog_unified — that query
// errored out before returning anything. This version uses `subcategory`
// (the actual vendor-native field, confirmed via the June 9 taxonomy work
// that built Handlebar & Controls) instead of guessing.
//
// Cables is a NEW top-level category (Laken's call — confirmed). Its old
// home was Handlebar & Controls -> "Cables & Lines" subcategory, 4,117 rows,
// deliberately parked there with no keyword routing during the Handlebar &
// Controls rebuild specifically so it could become its own category later.
//
// Known PU vendor subcategory values that fed "Cables & Lines" (from the
// June 9 mapping table):
//   CABLES-CLUTCH, CABLES-THROTTLE, CABLES-IDLE, CABLES-SPEEDOMETER,
//   CABLES-CHOKE, CABLES-TACHOMETER, CABLE CLAMPS & GUIDES, CABLE COVERS,
//   CABLE COMPONENT PARTS, HOSE HYDRAULIC CLUTCH (bundled in at the time —
//   open question whether hydraulic lines should stay here or go to Brakes)
//
// Planned Cables subcategories (six): Throttle, Idle, Clutch, Speedometer,
// Clamps and Covers, Universal/Build Your Own
//
// Two open questions this audit is meant to inform:
//   1. Hydraulic clutch/brake lines — Cables, or route to Brakes instead?
//   2. Clamps/covers/guides — one "Clamps and Covers" subcategory, or split?
//
// Run: node audit_cables_scope.mjs > cables_audit.txt 2>&1

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
  console.log('=== CABLES — SCOPING AUDIT (read-only) ===');
  console.log(new Date().toISOString());

  // ---------------------------------------------------------------------
  // 0. Confirm schema first — don't repeat the raw_category mistake.
  // ---------------------------------------------------------------------
  section('0. catalog_unified column check (confirming subcategory field exists)');
  {
    const { rows } = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'catalog_unified'
      ORDER BY ordinal_position
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 1. Baseline — the known old bucket: Handlebar & Controls / Cables & Lines
  // ---------------------------------------------------------------------
  section('1. Handlebar & Controls -> "Cables & Lines" subcategory (known old bucket)');
  {
    const { rows } = await db.query(`
      SELECT source_vendor, subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Handlebar & Controls'
        AND display_subcategory = 'Cables & Lines'
        AND is_active = true
      GROUP BY source_vendor, subcategory
      ORDER BY n DESC
    `);
    console.table(rows);
    const total = rows.reduce((s, r) => s + Number(r.n), 0);
    console.log(`Total (active): ${total}`);
  }

  // ---------------------------------------------------------------------
  // 2. Cross-vendor sweep — cable-related rows regardless of current
  //    display_category, since cables have historically been scattered.
  // ---------------------------------------------------------------------
  section('2. Cross-category sweep — all cable-related rows by current display_category');
  {
    const { rows } = await db.query(`
      SELECT display_category, COUNT(*) AS n
      FROM catalog_unified
      WHERE is_active = true
        AND (
          name ILIKE '%cable%'
          OR subcategory ILIKE '%cable%'
          OR name ILIKE '%hydraulic%hose%'
          OR name ILIKE '%hose kit%'
        )
      GROUP BY display_category
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 3. PU subcategory breakdown for cable-related rows (across all categories)
  // ---------------------------------------------------------------------
  section('3. PU vendor subcategory values for cable-related rows');
  {
    const { rows } = await db.query(`
      SELECT display_category, subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE source_vendor = 'PU'
        AND is_active = true
        AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')
      GROUP BY display_category, subcategory
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 4. Electrical cable check — battery/ground cables that are NOT
  //    mechanical control cables, need explicit exclusion.
  // ---------------------------------------------------------------------
  section('4. Electrical cable check — battery/ground/wiring cables (should stay Electrical)');
  {
    const { rows } = await db.query(`
      SELECT display_category, COUNT(*) AS n
      FROM catalog_unified
      WHERE is_active = true
        AND (
          name ILIKE '%battery cable%'
          OR name ILIKE '%ground cable%'
          OR name ILIKE '%ground strap%'
          OR name ILIKE '%starter cable%'
        )
      GROUP BY display_category
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 5. Hydraulic line check — the first open question. See where these
  //    currently live and how many there are before deciding routing.
  // ---------------------------------------------------------------------
  section('5. Hydraulic clutch/brake line check (open question: Cables or Brakes?)');
  {
    const { rows } = await db.query(`
      SELECT display_category, display_subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE is_active = true
        AND (
          name ILIKE '%hydraulic clutch%'
          OR name ILIKE '%hydraulic brake line%'
          OR name ILIKE '%brake line%'
          OR name ILIKE '%clutch line%'
          OR name ILIKE '%clutch hose%'
          OR name ILIKE '%brake hose%'
        )
      GROUP BY display_category, display_subcategory
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 6. Clamps/covers/guides check — second open question. How much volume,
  //    and does it cleanly separate from throttle/idle/clutch/speedo cables?
  // ---------------------------------------------------------------------
  section('6. Cable clamps / covers / guides volume check');
  {
    const { rows } = await db.query(`
      SELECT display_category, subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE is_active = true
        AND (
          name ILIKE '%cable clamp%'
          OR name ILIKE '%cable cover%'
          OR name ILIKE '%cable guide%'
          OR subcategory ILIKE '%cable clamp%'
          OR subcategory ILIKE '%cable cover%'
        )
      GROUP BY display_category, subcategory
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 7. VTWIN NULL-subcategory cable rows — need keyword classification
  // ---------------------------------------------------------------------
  section('7. VTWIN cable-related rows with NULL subcategory (need keyword classification)');
  {
    const { rows } = await db.query(`
      SELECT display_category, name
      FROM catalog_unified
      WHERE source_vendor = 'VTWIN'
        AND is_active = true
        AND subcategory IS NULL
        AND name ILIKE '%cable%'
      ORDER BY name
      LIMIT 50
    `);
    console.table(rows);
    console.log('(showing up to 50 — check total separately if this hits the cap)');
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
