// audit_brakes_scope.mjs
// READ-ONLY scoping audit for the Brakes within-category taxonomy rebuild.
// Run this FIRST. No writes. Paste full output back for rule-writing.
//
// Usage: node scripts/ingest/audit_brakes_scope.mjs > brakes_audit_output.txt 2>&1

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function section(title) {
  console.log('\n' + '='.repeat(100));
  console.log(title);
  console.log('='.repeat(100));
}

async function main() {
  // ---------------------------------------------------------------------
  // 1. BASELINE — current Brakes category shape
  // ---------------------------------------------------------------------
  section('1. BRAKES — current display_subcategory breakdown (incl. NULL)');
  {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(display_subcategory, '<<NULL>>') AS subcat,
        COUNT(*) AS n,
        COUNT(display_subcategory_detail) AS with_detail
      FROM catalog_unified
      WHERE display_category = 'Brakes'
        AND is_active = true
      GROUP BY 1
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  section('1b. BRAKES — source_vendor split');
  {
    const { rows } = await pool.query(`
      SELECT source_vendor, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
      GROUP BY 1 ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 2. RAW vendor category/subcategory vocabulary feeding into Brakes
  //    (mine old names for keyword vocabulary — MasterRef lesson)
  // ---------------------------------------------------------------------
  section('2. RAW category/subcategory values currently mapping to Brakes (by vendor)');
  {
    const { rows } = await pool.query(`
      SELECT source_vendor, category AS raw_category, subcategory AS raw_subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
      GROUP BY 1,2,3
      ORDER BY n DESC
      LIMIT 100
    `);
    console.table(rows);
  }

  section('2b. Existing display_subcategory_detail values already present in Brakes (if any)');
  {
    const { rows } = await pool.query(`
      SELECT display_subcategory, display_subcategory_detail, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
        AND display_subcategory_detail IS NOT NULL
      GROUP BY 1,2
      ORDER BY 1, n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 3. KNOWN DUPLICATE SUBCATEGORY VALUES — 'Rotors' vs 'Rotors & Drums'
  // ---------------------------------------------------------------------
  section('3. Rotors vs Rotors & Drums — orphaned duplicate check (flagged session 76)');
  {
    const { rows } = await pool.query(`
      SELECT display_subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
        AND display_subcategory ILIKE '%rotor%'
      GROUP BY 1
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 4. NULL-subcategory rows — sample for manual read + raw vocabulary
  // ---------------------------------------------------------------------
  section('4. NULL display_subcategory — sample of 60 names + raw fields');
  {
    const { rows } = await pool.query(`
      SELECT id, name, source_vendor, category AS raw_category, subcategory AS raw_subcategory, brand
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
        AND display_subcategory IS NULL
      ORDER BY random()
      LIMIT 60
    `);
    console.table(rows);
  }

  section('4b. NULL display_subcategory — raw subcategory frequency (full list, not sample)');
  {
    const { rows } = await pool.query(`
      SELECT source_vendor, COALESCE(subcategory, '<<NULL RAW SUB>>') AS raw_subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
        AND display_subcategory IS NULL
      GROUP BY 1,2
      ORDER BY n DESC
      LIMIT 100
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 5. EBC brand signal — confirm coverage/behavior inside Brakes
  // ---------------------------------------------------------------------
  section('5. EBC brand rows inside Brakes — current subcategory distribution');
  {
    const { rows } = await pool.query(`
      SELECT display_subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
        AND brand ILIKE 'EBC%'
      GROUP BY 1
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 6. STRAY BRAKE ROWS OUTSIDE BRAKES — the sweep-in candidates
  //    Named rows from HANDOFF_LOG + generic keyword net, category-scoped
  //    to Accessories & Misc and Suspension per the handoff.
  // ---------------------------------------------------------------------
  section('6a. Named stray rows called out in HANDOFF_LOG (exact/partial name match)');
  {
    const { rows } = await pool.query(`
      SELECT id, name, display_category, display_subcategory, source_vendor
      FROM catalog_unified
      WHERE is_active = true
        AND (
          name ILIKE '%Front Brake Parkerized Cable Adjuster%'
          OR name ILIKE '%Brake Cadmium Cable Adjuster%'
          OR name ILIKE '%Rear Wheel Brake Rod and Cable Adjusting Nut%'
          OR name ILIKE '%Polished%Chrome Brake Handle Cable Kit%'
          OR name ILIKE '%Chrome Brake Handle Cable Kit%'
          OR name ILIKE '%Spring Fork Brake Cable Kit%'
          OR name ILIKE '%Brake Shaft Crossover Bushing Tool%'
        )
      ORDER BY display_category, name
    `);
    console.table(rows);
  }

  section('6b. Generic brake-keyword sweep — Accessories & Misc and Suspension only');
  {
    const { rows } = await pool.query(`
      SELECT id, name, display_category, display_subcategory, source_vendor, category AS raw_category, subcategory AS raw_subcategory
      FROM catalog_unified
      WHERE is_active = true
        AND display_category IN ('Accessories & Misc', 'Suspension')
        AND name ~* '\\ybrake\\y'
      ORDER BY display_category, name
      LIMIT 200
    `);
    console.table(rows);
    console.log(`Row count above capped at 200 — re-run with COUNT(*) if near the cap.`);
  }

  section('6c. Generic brake-keyword sweep — COUNT only, ALL other categories (broad net)');
  {
    const { rows } = await pool.query(`
      SELECT display_category, COUNT(*) AS n
      FROM catalog_unified
      WHERE is_active = true
        AND display_category <> 'Brakes'
        AND name ~* '\\ybrake\\y'
      GROUP BY 1
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 7. The 6 disputed Cable Clamp rows — confirm current location/state
  // ---------------------------------------------------------------------
  section('7. Cable Clamp - Throttle/Idle/Brake rows (6 expected, PU, excluded by Cables brake guard)');
  {
    const { rows } = await pool.query(`
      SELECT id, name, display_category, display_subcategory, source_vendor, subcategory AS raw_subcategory
      FROM catalog_unified
      WHERE is_active = true
        AND name ILIKE '%Cable Clamp%Throttle%Idle%Brake%'
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 8. Foot Controls overlap — Brake Pedals already exists there per
  //    filter_roadmap.md. Confirm no accidental duplication/ambiguity
  //    with anything that might belong in Brakes / Brake Hardware.
  // ---------------------------------------------------------------------
  section('8. Foot Controls — existing Brake Pedals subcategory (context only, do not move without cause)');
  {
    const { rows } = await pool.query(`
      SELECT display_subcategory, COUNT(*) AS n
      FROM catalog_unified
      WHERE display_category = 'Foot Controls' AND is_active = true
        AND display_subcategory ILIKE '%brake%'
      GROUP BY 1
      ORDER BY n DESC
    `);
    console.table(rows);
  }

  section('8b. Foot Controls rows mentioning "pad" alongside brake — check for pedal-pad vs brake-pad ambiguity');
  {
    const { rows } = await pool.query(`
      SELECT id, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Foot Controls' AND is_active = true
        AND name ~* '\\bbrake\\y' AND name ~* '\\bpad'
      LIMIT 50
    `);
    console.table(rows);
  }

  // ---------------------------------------------------------------------
  // 9. Keyword vocabulary scan across ALL raw subcategory/category strings
  //    currently in Brakes — for building the classifier's regex vocab.
  // ---------------------------------------------------------------------
  section('9. Distinct raw subcategory tokens in Brakes (vocabulary mining)');
  {
    const { rows } = await pool.query(`
      SELECT DISTINCT subcategory AS raw_subcategory, source_vendor, COUNT(*) OVER (PARTITION BY subcategory) AS n
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND is_active = true
      ORDER BY n DESC
      LIMIT 150
    `);
    console.table(rows);
  }

  console.log('\n\nDONE. This is READ-ONLY — no rows were modified.');
  console.log('Next: paste full output back, then we write classify() + regression harness before any dry run.');
}

main()
  .catch((err) => {
    console.error('AUDIT FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
