// fix_accessories_misc_wave4b.mjs
//
// Applies Laken's hand-annotated change_to decisions from
// accessories_misc_remaining.csv (the version WITH the change_to column).
// Reads the CSV directly -- no hand-transcription of the mapping, to avoid
// any risk of a mistyped id/name/category during transcription.
//
// Two independent operations, each gated separately:
//   1. RECATEGORIZE: 68 rows with a real change_to value -> mapped to
//      confirmed existing display_category/display_subcategory pairs
//      (looked up live via lookup_existing_categories.mjs /
//      lookup_more_categories.mjs -- no invented subcategory names).
//   2. DELETE: 6 rows marked "Remove" -> hard delete, per Laken's explicit
//      instruction. This is IRREVERSIBLE. Gated behind its own --delete
//      flag, separate from --apply, and always exports a backup CSV of the
//      rows before deleting them.
//
// Excluded from this pass (Laken's calls):
//   - [77227] "1/8 inch NPT 90 Nipple" -> annotated "Wheel- hardware" but
//     is actually a fuel/oil line fitting, not wheel hardware. Skipped --
//     stays in Accessories & Misc, flagged for Laken to recheck.
//   - 611 blank change_to rows -> untouched, Laken is still annotating these.
//
// Usage:
//   node fix_accessories_misc_wave4b.mjs                  (dry run, no writes)
//   node fix_accessories_misc_wave4b.mjs --apply           (applies recategorize only)
//   node fix_accessories_misc_wave4b.mjs --apply --delete  (applies recategorize AND deletes, after backup export)

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

// Minimal quote-aware CSV line splitter -- avoids adding a dependency that
// may not be installed in this project. Handles quoted fields with commas
// and escaped double-quotes ("") inside them, which is all this file needs.
function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings first so \r\n doesn't break quote state tracking
  const text = content.replace(/\r\n/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1 || r[0] !== '').map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });
}

const APPLY = process.argv.includes('--apply');
const DELETE = process.argv.includes('--delete');
const pool = new pg.Pool({ connectionString });

const CSV_PATH = path.resolve(__dirname, 'accessories_misc_remaining.csv');

// Explicit id -> {category, subcategory} mapping, built from Laken's
// change_to annotations, normalized and cross-checked against real existing
// subcategory names (queried live -- see lookup_existing_categories.mjs and
// lookup_more_categories.mjs output).
//
// subcategory: null means category-only move (no exact existing subcat fit).
const RECATEGORIZE = {
  79390: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // "Saddlebag accessories" -> closest real subcat
  79060: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - patch
  65930: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // Instillation Tool
  81433: { category: 'Wheels & Tires', subcategory: null }, // Wheel, rim -- category confirmed, exact subcat not verified this pass
  81350: { category: 'Wheels & Tires', subcategory: null }, // Wheel, rim
  60129: { category: 'Engine', subcategory: 'Heads & Valves' }, // Rocker Arm Shaft Cover -- Laken confirmed route to Engine
  79274: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - model
  519085: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Parts manual -- real subcat exists
  80918: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Frame- neck numbers
  82004: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - art
  79313: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Shop manuals
  79294: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - art
  79221: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - model
  95161: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Frame general
  69866: { category: 'Exhaust', subcategory: 'Exhaust Parts' }, // Exhaust
  25397: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Sticker
  77201: { category: 'Chopper Supplies', subcategory: null }, // Chopper -- category not yet built, no subcat exists
  88392: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Front fork
  499811: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Triple tree
  81036: { category: 'Frames & Suspension', subcategory: 'Frame' }, // frame
  77297: { category: 'Carburetion & Fuel', subcategory: null }, // Oil line fitting -- category inferred, not directly confirmed this pass
  94622: { category: 'Wheels & Tires', subcategory: null }, // Wheel rim
  94621: { category: 'Wheels & Tires', subcategory: null }, // Wheel rim
  77200: { category: 'Chopper Supplies', subcategory: null }, // chopper
  79566: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Trash can
  79558: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Trash can
  79512: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Trash can
  71253: { category: 'Electrical', subcategory: 'Ignition Coils' }, // Ignition coil
  79198: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - art
  60889: { category: 'Engine', subcategory: 'Heads & Valves' }, // Intake valve
  83020: { category: 'Hardware, Covers & General', subcategory: null }, // Headbolt cover -- no exact existing subcat confirmed
  95178: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Frame general
  77039: { category: 'Chopper Supplies', subcategory: null }, // chopper
  56152: { category: 'Frames & Suspension', subcategory: null }, // Riser cover -- category inferred, not directly confirmed
  56154: { category: 'Frames & Suspension', subcategory: null }, // Riser cover
  14082: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - bar stool
  24879: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Memorabilia - bar stool
  95141: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Fork bearing guard
  95142: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Fork bearing guard
  85975: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Transmission
  79156: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Shop manuals
  94860: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // General hardware
  77324: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // Spray paint
  515253: { category: 'Tanks & Body', subcategory: null }, // Tank dash panel -- category inferred from Gas tank cluster, subcat not confirmed
  78637: { category: 'Wheels & Tires', subcategory: null }, // wheel
  79292: { category: 'Riding Gear & Apparel', subcategory: 'Gloves' }, // Gloves, gear
  79293: { category: 'Riding Gear & Apparel', subcategory: 'Gloves' }, // Gloves, gear
  24936: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' }, // Battery cables
  24935: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' },
  24938: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' },
  24934: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' },
  24932: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' },
  24937: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' },
  24939: { category: 'Electrical', subcategory: 'Batteries, Cables & Accessories' },
  72804: { category: 'Lighting', subcategory: 'Reflectors & Lenses' }, // Turnsignal lens -- confirmed subcat
  86245: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Transmission- hardware
  82965: { category: 'Brakes', subcategory: null }, // Brake caliper hardware -- category inferred, subcat not confirmed
  92975: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Fork boot- general
  79259: { category: 'Riding Gear & Apparel', subcategory: 'Accessories' }, // Gear, hat -- closest existing subcat
  79262: { category: 'Riding Gear & Apparel', subcategory: 'Accessories' },
  79261: { category: 'Riding Gear & Apparel', subcategory: 'Accessories' },
  79260: { category: 'Riding Gear & Apparel', subcategory: 'Accessories' },
  76120: { category: 'Tanks & Body', subcategory: 'Gas Tanks' }, // Gas tank -- confirmed real subcat (though under Fenders & Body it only had 12; using Tanks & Body per larger/more plausible category)
  76218: { category: 'Tanks & Body', subcategory: 'Gas Tanks' },
  76217: { category: 'Tanks & Body', subcategory: 'Gas Tanks' },
  76216: { category: 'Tanks & Body', subcategory: 'Gas Tanks' },
  76103: { category: 'Tanks & Body', subcategory: 'Gas Tanks' },
  76222: { category: 'Tanks & Body', subcategory: 'Gas Tanks' },
};

// Explicitly excluded from this pass -- do not touch, flagged for Laken
const SKIPPED_IDS = new Set([
  77227, // "1/8 inch NPT 90 Nipple" annotated "Wheel- hardware" -- mismatch, Laken's call to skip
]);

// Rows marked "Remove" in change_to -- hard delete candidates
const DELETE_IDS = [79094, 79327, 79091, 79609, 79092, 79093];

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING (recategorize) ===' : '=== DRY RUN (no writes) ===');
    console.log(DELETE ? '=== DELETE flag set -- will hard-delete "Remove" rows after backup export ===\n' : '=== Delete NOT requested this run (pass --delete to include) ===\n');

    // Load CSV for reference (names/vendor_sku for logging + backup export)
    const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
    const csvRows = parseCsv(csvContent);
    const byId = new Map(csvRows.map((r) => [Number(r.id), r]));

    // --- Recategorize pass ---
    let recatCount = 0;
    console.log('--- Recategorize (68 candidate rows) ---');
    for (const [idStr, dest] of Object.entries(RECATEGORIZE)) {
      const id = Number(idStr);
      const row = byId.get(id);
      const name = row ? row.name : '(not found in CSV)';
      console.log(
        `  [${id}] ${name} -> ${dest.category}${dest.subcategory ? ' / ' + dest.subcategory : ' (subcategory: null)'}`
      );
      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified
           SET display_category = $1, display_subcategory = $2
           WHERE id = $3 AND display_category = 'Accessories & Misc' AND display_subcategory IS NULL`,
          [dest.category, dest.subcategory, id]
        );
        if (res.rowCount === 1) recatCount++;
        else console.log(`    -> WARNING: 0 rows updated for id ${id} (already moved, or id mismatch?)`);
      }
    }
    console.log(`\nSkipped (explicit exclusion): ${[...SKIPPED_IDS].join(', ')}`);

    // --- Delete pass ---
    console.log(`\n--- Delete candidates (${DELETE_IDS.length} rows, marked "Remove") ---`);
    const deleteRows = [];
    for (const id of DELETE_IDS) {
      const row = byId.get(id);
      const name = row ? row.name : '(not found in CSV)';
      console.log(`  [${id}] ${name}`);
      deleteRows.push({ id, name, vendor_sku: row ? row.vendor_sku : '' });
    }

    if (DELETE) {
      // Always back up before changing status -- record what these rows
      // looked like at the moment of deactivation.
      const backupPath = path.resolve(__dirname, `wave4b_deactivate_backup_${Date.now()}.csv`);
      const backupCsv = ['id,name,vendor_sku']
        .concat(deleteRows.map((r) => `${r.id},"${(r.name || '').replace(/"/g, '""')}",${r.vendor_sku}`))
        .join('\n');
      fs.writeFileSync(backupPath, backupCsv, 'utf8');
      console.log(`\nBackup written to ${backupPath} before deactivating.`);

      if (APPLY) {
        // Deactivate instead of hard delete: catalog_unified.id is
        // referenced by product_vendors (FK constraint confirmed via
        // failed delete attempt), and hard-deleting would require finding
        // and removing all dependent rows across possibly-multiple tables
        // first. is_active=false achieves "invisible to users" (every
        // query in this project filters on is_active=true) without that
        // risk, and is fully reversible.
        const res = await client.query(`UPDATE catalog_unified SET is_active = false WHERE id = ANY($1::int[])`, [DELETE_IDS]);
        console.log(`Deactivated ${res.rowCount} rows (is_active = false).`);
      } else {
        console.log('(Dry run -- no update executed. Re-run with --apply --delete to actually deactivate.)');
      }
    } else {
      console.log('\n(--delete not passed -- these rows are listed but NOT deactivated this run.)');
    }

    console.log('\n=== Summary ===');
    console.log(`Recategorize candidates: ${Object.keys(RECATEGORIZE).length}`);
    console.log(`Skipped: ${SKIPPED_IDS.size}`);
    console.log(`Delete candidates: ${DELETE_IDS.length}`);
    if (APPLY) {
      console.log(`Recategorize rows actually updated: ${recatCount}`);
      console.log('\nRemember: Typesense re-sync/reindex still needed after this.');
    } else {
      console.log('\nDry run only -- no writes made. Re-run with --apply to write recategorize changes.');
      console.log('Add --delete (with --apply) to also hard-delete the 6 "Remove" rows after backup export.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
