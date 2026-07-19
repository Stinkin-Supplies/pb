#!/usr/bin/env node
/**
 * classify_brakes_holdback.mjs
 *
 * Session 79 follow-up to session 78's Brakes rebuild.
 *
 * Scope: the 96 rows held back at session 78 close
 *   (display_category='Brakes' AND display_subcategory IS NULL).
 *
 * Per Laken's call this session:
 *   - Bucket A (~76 rows, genuine brake parts, classifier gap only) -> classify
 *     into existing Brakes subcategories. THIS SCRIPT.
 *   - Bucket B (~28 rows, confirmed wrong-category: clutch levers/adjusters,
 *     shift levers/arms/shafts, air-cleaner backing plates, springer fender
 *     mounts) -> explicitly EXCLUDED here, held for a dedicated cleanup pass.
 *     Full id list logged in bucket_b_holdback_ids.json alongside this script.
 *   - Bucket C (24 ANTHEM/RACE LEVERS/SHORTY MX SKUs matching an
 *     already-classified sibling pattern) -> Laken's call: treat as genuinely
 *     ambiguous, do NOT auto-classify. EXCLUDED here, stays NULL.
 *
 * Existing Brakes subcategories (session 78): Brake Lines & Hoses,
 * Rotors & Drums, Brake Pads & Shoes, Calipers, Brake Hardware,
 * Master Cylinders, Brake Conversion Kits, Brake Pedals & Pads.
 *
 * Standing method: audit (done) -> dry run (this) -> paste for review ->
 * fix -> re-dry-run -> --apply -> sync_fitment_flat_columns.mjs ->
 * index_unified.js --recreate.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const APPLY = process.argv.includes('--apply');

// Bucket B — confirmed wrong-category, EXCLUDED from this pass entirely.
// Not touched, not moved, not classified. Held for dedicated cleanup.
const BUCKET_B_IDS = new Set([
  41302, 45873, 45874, 48816, 73706, 509248,
  53554, 53555, 53556, 53557,
  51858, 56170, 56712,
  58600, 42152, 51151, 48285, 42153, 48284, 42154, 42151,
  49331, 42155, 42157, 42156, 42159, 42158,
  41927, 41928,
  41651, 41649, 41653,
  48675, // SPRINGER FENDER MOUNTS - not brake/clutch, flagged this session
  69235, // V-Slot Exhaust Pipe Baffle Set - vendor-miscategorized as BRAKING, actually Exhaust
]);

// Bucket C — ambiguous lever-set SKUs. Laken's call: hold back, do not classify.
const BUCKET_C_IDS = new Set([
  57143, 57147, 57141, 57142, 57146, 57140, // ANTHEM LEVER/SHORTY LEVER SET (SPORTSTER/SCOUT/SOFTAIL 22-26)
  57145, 57149, 57139, 57144, 57148, 57138,
  46240, 46238, 46241, 46239, 46242, 46243, // RACE LEVERS
  57344, 57421, // SHORTY MX LEVER SET (25-26 SOFTAIL)
]);

function classify(row) {
  const n = (row.name || '').toUpperCase();

  // Truncated-name special case: DB truncation cuts these off mid-word
  // before "Disc" (e.g. "...Front Bra" should read "...Front Brake Disc").
  // Same root cause as the session-78 "mirror" row. Hardcoded by id since
  // regex can't recover truncated text.
  if (row.id === 65219 || row.id === 65220) {
    return 'Rotors & Drums';
  }

  // --- Brake Lines & Hoses ---
  if (/\bHOSE\b/.test(n) || /\bLINE\b/.test(n) || /\bBRAKE\s*TEE\b/.test(n) ||
      /\bUNION\b/.test(n) || /STRAIGHT LINE UNION/.test(n) ||
      /\bTEE\s*(ADAPTER|BAR)\b/.test(n) || /MANIFOLD/.test(n)) {
    return 'Brake Lines & Hoses';
  }

  // --- Rotors & Drums ---
  if (/\bDISC\b/.test(n) || /\bROTOR\b/.test(n)) {
    return 'Rotors & Drums';
  }

  // --- Brake Pads & Shoes ---
  if (/\bPAD(S)?\b/.test(n) || /\bSHOE(S)?\b/.test(n) || /BRAKE FLUID/.test(n)) {
    // DOT 4 Brake Fluid goes here per session precedent (consumable paired with pads/service)
    return 'Brake Pads & Shoes';
  }

  // --- Calipers ---
  if (/CALIPER/.test(n) || /\bSPIDER\b/.test(n) || /RADIAL.*REBUILD/.test(n) ||
      /\bPIST(ON)?\b.*REBUILD/.test(n)) {
    return 'Calipers';
  }

  // --- Master Cylinders ---
  if (/MASTER CYLINDER/.test(n) || /\bMSTR\b/.test(n) || /RESERVOIR/.test(n)) {
    return 'Master Cylinders';
  }

  // --- Brake Pedals & Pads (foot-side hardware) ---
  if (/PEDAL/.test(n) || /BRACKET.*FXRP/.test(n)) {
    return 'Brake Pedals & Pads';
  }

  // --- Brake Hardware (fallback for dust shields, cables/adjusters that are
  // brake-cable-specific, backing plates, springs, bolts, fittings, levers,
  // hand-control assemblies, etc.) ---
  // NOTE: LEVER(S)? not LEVER — trailing-S regex bug, same family flagged in
  // MasterRef (JET/JETS, CAMSHAFT, SWITCH(ES)?). Bare "LEVERS" plural was
  // silently missed before this fix (caught SPORTSTER LEVERS, RACING LEVERS,
  // BRAKE ADAPTER HERITAGE LEVERS this round).
  if (/DUST SHIELD/.test(n) || /BACKING PLATE/.test(n) || /BRAKE CABLE/.test(n) ||
      /\bADJUSTER\b/.test(n) || /BRAKE ROD/.test(n) || /\bCLAMP\b/.test(n) ||
      /\bLEVER(S)?\b/.test(n) || /\bFITTING\b/.test(n) || /\bBOLT\b/.test(n) ||
      /HD PAN AMERICAN/.test(n) || /\bSWITCH(ES)?\b/.test(n) || /BRAKE.*BASE/.test(n) ||
      /HANDCONTROLS?/.test(n)) {
    return 'Brake Hardware';
  }

  return null; // unclassified — should not happen if scoping was correct
}

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, source_vendor, sku, name, category AS raw_category
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND display_subcategory IS NULL AND is_active = true
      ORDER BY id
    `);

    const results = { classified: [], excluded_b: [], excluded_c: [], unclassified: [] };

    for (const row of res.rows) {
      if (BUCKET_B_IDS.has(row.id)) {
        results.excluded_b.push(row);
        continue;
      }
      if (BUCKET_C_IDS.has(row.id)) {
        results.excluded_c.push(row);
        continue;
      }
      const sub = classify(row);
      if (sub) {
        results.classified.push({ ...row, new_subcategory: sub });
      } else {
        results.unclassified.push(row);
      }
    }

    console.log(`=== DRY RUN SUMMARY ===`);
    console.log(`Total held-back rows: ${res.rows.length}`);
    console.log(`Classified (Bucket A, will write if --apply): ${results.classified.length}`);
    console.log(`Excluded — Bucket B (wrong category, untouched): ${results.excluded_b.length}`);
    console.log(`Excluded — Bucket C (ambiguous, untouched): ${results.excluded_c.length}`);
    console.log(`Unclassified (gap — needs a rule): ${results.unclassified.length}`);

    console.log(`\n=== CLASSIFIED (Bucket A) BY NEW SUBCATEGORY ===`);
    const bySub = {};
    for (const r of results.classified) {
      bySub[r.new_subcategory] = bySub[r.new_subcategory] || [];
      bySub[r.new_subcategory].push(r);
    }
    for (const [sub, rows] of Object.entries(bySub)) {
      console.log(`\n-- ${sub} (${rows.length}) --`);
      for (const r of rows) {
        console.log(`  [${r.id}] ${r.source_vendor} ${r.sku}: ${r.name}`);
      }
    }

    if (results.unclassified.length > 0) {
      console.log(`\n=== UNCLASSIFIED — NEEDS A RULE (do not apply until 0) ===`);
      for (const r of results.unclassified) {
        console.log(`  [${r.id}] ${r.source_vendor} ${r.sku} (${r.raw_category}): ${r.name}`);
      }
    }

    if (APPLY) {
      if (results.unclassified.length > 0) {
        console.log(`\nABORTING APPLY — ${results.unclassified.length} unclassified rows remain.`);
        return;
      }
      console.log(`\n=== APPLYING ${results.classified.length} updates ===`);
      let written = 0;
      for (const r of results.classified) {
        await client.query(
          `UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`,
          [r.new_subcategory, r.id]
        );
        written++;
      }
      console.log(`Wrote ${written} rows.`);
      console.log(`Bucket B (${results.excluded_b.length}) and Bucket C (${results.excluded_c.length}) left untouched, still NULL.`);
    } else {
      console.log(`\nDry run only. Re-run with --apply to write ${results.classified.length} rows.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('SCRIPT FAILED:', e);
  process.exit(1);
});
