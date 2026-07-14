// fix_accessories_misc_wave4.mjs
//
// Wave-4 targeted fix for Accessories & Misc. Unlike waves 1-3 (broad
// pattern sweeps), this is a small, hand-scoped cluster confirmed via
// scope_wave4_cluster.mjs: 50 rows across 3 clean categories, plus 3
// individually-routed borderline rows that don't fit the bulk pattern.
//
// The remaining ~682 rows in Accessories & Misc after this pass are accepted
// as permanently held-back long-tail (Laken's call) — no further wave
// planned unless something new turns up.
//
// Usage:
//   node fix_accessories_misc_wave4.mjs           (dry run — no writes)
//   node fix_accessories_misc_wave4.mjs --apply   (applies the updates)

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString });

function B(word) {
  return `(^|[\\s/'-])${word}([\\s/'-]|$)`;
}

// Bulk clusters, confirmed clean via scoping query — excludes the 3
// hand-identified borderline IDs (76170, 78207, 95249), which are routed
// individually below instead.
const BULK_MOVES = [
  {
    label: 'Shifter hardware -> Transmission & Clutch / Shifter Forks & Gears',
    category: 'Transmission & Clutch',
    subcategory: 'Shifter Forks & Gears',
    where: `name ~* $1 AND id NOT IN (76170)`,
    params: [B('SHIFTER')],
  },
  {
    label: 'Wheel/disc hardware -> Wheels & Tires / Axles & Spacers',
    category: 'Wheels & Tires',
    subcategory: 'Axles & Spacers',
    where: `(name ~* $1 OR name ~* $2 OR name ~* $3 OR name ~* $4) AND id NOT IN (78207, 95249)`,
    params: [B('AXLE'), `${B('WHEEL')}.*${B('SCREW')}`, `${B('WHEEL')}.*${B('NUT')}`, `${B('DISC')}.*${B('SCREW')}`],
  },
  {
    label: 'Fuel valve -> Carburetion & Fuel / Carburetors & Components',
    category: 'Carburetion & Fuel',
    subcategory: 'Carburetors & Components',
    where: `name ~* $1`,
    params: [B('FUEL')],
  },
];

// Hand-routed borderline rows — not part of the bulk pattern, don't belong
// with the bulk destination.
const INDIVIDUAL_MOVES = [
  {
    id: 76170,
    name: 'Lower Left Outer Tank shifter Tab',
    // "stays put" per Laken -- this is a tank part, but Laken's call was to
    // leave category as-is (not Transmission & Clutch). No category change;
    // still NULL subcategory. Flagging only, no UPDATE issued for this row.
    action: 'flag-only',
    note: 'Tank part, not a shifter part. Laken: leave category as-is (Accessories & Misc). No subcategory assigned this pass.',
  },
  {
    id: 78207,
    name: 'Rigid Axle Sissy Bar Mount Tab Set',
    action: 'move',
    category: 'Luggage & Racks',
    subcategory: null, // real subcategory name not yet confirmed -- see note
    note: 'Sissy bar mount hardware, not a wheel axle. Category-only move; subcategory TBD -- check real Luggage & Racks subcat names before assigning (project convention: query first, do not invent names).',
  },
  {
    id: 95249,
    name: 'Indian Kick Start Pedal Axle',
    action: 'move',
    category: 'Foot Controls',
    subcategory: null, // real subcategory name not yet confirmed -- see note
    note: 'Kickstart pedal pivot pin, not a wheel axle. Category-only move; subcategory TBD -- check real Foot Controls subcat names before assigning.',
  },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING wave-4 fixes ===\n' : '=== DRY RUN (no writes) ===\n');

    let totalBulk = 0;
    for (const move of BULK_MOVES) {
      const selectQuery = `
        SELECT id, name
        FROM catalog_unified
        WHERE display_category = 'Accessories & Misc'
          AND display_subcategory IS NULL
          AND is_active = true
          AND (${move.where})
        ORDER BY name
      `;
      const res = await client.query(selectQuery, move.params);
      console.log(`--- ${move.label}: ${res.rows.length} rows ---`);
      for (const r of res.rows) {
        console.log(`  [${r.id}] ${r.name}`);
      }
      totalBulk += res.rows.length;

      if (APPLY && res.rows.length > 0) {
        const ids = res.rows.map((r) => r.id);
        await client.query(
          `UPDATE catalog_unified
           SET display_category = $1, display_subcategory = $2
           WHERE id = ANY($3::int[])`,
          [move.category, move.subcategory, ids]
        );
        console.log(`  -> applied: moved to ${move.category} / ${move.subcategory}`);
      }
      console.log('');
    }

    console.log(`--- Individual hand-routed rows: ${INDIVIDUAL_MOVES.length} ---`);
    for (const row of INDIVIDUAL_MOVES) {
      console.log(`  [${row.id}] ${row.name}`);
      console.log(`    action: ${row.action}${row.action === 'move' ? ` -> ${row.category}${row.subcategory ? ' / ' + row.subcategory : ' (subcategory TBD)'}` : ''}`);
      console.log(`    note: ${row.note}`);

      if (APPLY && row.action === 'move') {
        await client.query(
          `UPDATE catalog_unified
           SET display_category = $1, display_subcategory = $2
           WHERE id = $3`,
          [row.category, row.subcategory, row.id]
        );
        console.log(`    -> applied`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Bulk cluster rows: ${totalBulk}`);
    console.log(`Individual rows: ${INDIVIDUAL_MOVES.length} (1 flag-only, 2 category-only moves with subcategory TBD)`);
    console.log(`Total touched this pass: ${totalBulk + INDIVIDUAL_MOVES.filter(r => r.action === 'move').length}`);
    console.log(
      APPLY
        ? '\nApplied. Remember: Typesense re-sync/reindex still needed after this.'
        : '\nDry run only. Re-run with --apply to write these changes.'
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
