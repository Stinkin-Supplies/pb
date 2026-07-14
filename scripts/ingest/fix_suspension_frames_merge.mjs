// fix_suspension_frames_merge.mjs
// Merges all 454 active Suspension rows: 440 into Frames & Suspension
// (across its existing subcats), 6 cush-drive rows out to Transmission &
// Clutch, 1 stray Turn Signal Eliminator out to Lighting. Suspension
// retires at 0 rows after this.
//
// Mapping (Laken-confirmed):
//   Shocks & Springs (230)              -> Frames & Suspension / Rear Shocks & Lowering Kits
//   Fork Tubes & Internals (98)         -> Frames & Suspension / Forks
//   Triple Trees & Stems (44)           -> Frames & Suspension / Triple Trees & Covers
//   Steering Stem Hardware (5)          -> Frames & Suspension / Triple Trees & Covers
//   Swingarms (16)                      -> Frames & Suspension / Frame
//   Ride Control & Rear Support (9)     -> Frames & Suspension / Rear Shocks & Lowering Kits
//   Lowering & Lift Kits, TRIKE CONVERSN (18) -> Frames & Suspension / Trike Conversion Kits
//   Lowering & Lift Kits, trike comfort lift w/shocks (2)  -> Frames & Suspension / Trike Conversion Kits
//   Lowering & Lift Kits, remainder (13) -> Frames & Suspension / Rear Shocks & Lowering Kits
//   Fork Lowers & Sliders, fork legs/cover (5) -> Frames & Suspension / Forks
//   Dampers & Cush Drive, steering dampers (7) -> Frames & Suspension / Forks
//   Dampers & Cush Drive, cush-drive parts (6) -> Transmission & Clutch (subcat TBD, left NULL)
//   Fork Lowers & Sliders, Turn Signal Eliminator (1)      -> Lighting (subcat TBD, left NULL)
//
// Dry run (default): node fix_suspension_frames_merge.mjs
// Apply:              node fix_suspension_frames_merge.mjs --apply

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Explicit id groups
const TRIKE_CONVERSN_IDS = [
  20615, 20605, 20606, 20616, 20614, 20618, 20607, 20608, 20619, 20617,
  20621, 20612, 20613, 20622, 20620, 20623, 20624, 20609,
];
const TRIKE_COMFORT_LIFT_IDS = [49465, 49466];
const LOWERING_REMAINDER_IDS = [
  1935, 4476, 1938, 31894, 52546, 52540, 52539, 52542, 52541, 52548, 52547,
  52549, 26121,
];
const FORK_LEGS_IDS = [16662, 12924, 5125, 4732, 12925];
const STEERING_DAMPER_TO_FORKS_IDS = [67077, 57125, 57127, 57124, 57126, 66358, 66366];
const CUSH_DRIVE_TO_TRANS_IDS = [94489, 95085, 94929, 94962, 89252, 89431];
const TURN_SIGNAL_TO_LIGHTING_ID = [3894];
const STEERING_STEM_HW_SUBCAT = 'Steering Stem Hardware';
const SWINGARMS_SUBCAT = 'Swingarms';
const TRIPLE_TREES_SUBCAT = 'Triple Trees & Stems';
const RIDE_CONTROL_SUBCAT = 'Ride Control & Rear Support';

async function runUpdate(client, label, sql, params) {
  const result = await client.query(sql, params);
  console.log(`${label}: ${result.rowCount} rows`);
  return result.rowCount;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    // Pre-flight count check
    const { rows: pre } = await client.query(`
      SELECT count(*) FROM catalog_unified WHERE display_category = 'Suspension' AND is_active = true
    `);
    console.log(`Suspension active rows before: ${pre[0].count} (expect 454)\n`);
    if (Number(pre[0].count) !== 454) {
      console.log('*** WARNING: count has drifted from the audited 454. Re-check before applying. ***\n');
    }

    if (!APPLY) {
      // Dry-run: just report counts per planned group
      const groups = [
        ['Shocks & Springs -> Rear Shocks & Lowering Kits', `display_subcategory = 'Shocks & Springs'`],
        ['Fork Tubes & Internals -> Forks', `display_subcategory = 'Fork Tubes & Internals'`],
        [`Triple Trees & Stems -> Triple Trees & Covers`, `display_subcategory = '${TRIPLE_TREES_SUBCAT}'`],
        [`Steering Stem Hardware -> Triple Trees & Covers`, `display_subcategory = '${STEERING_STEM_HW_SUBCAT}'`],
        [`Swingarms -> Frame`, `display_subcategory = '${SWINGARMS_SUBCAT}'`],
        [`Ride Control & Rear Support -> Rear Shocks & Lowering Kits`, `display_subcategory = '${RIDE_CONTROL_SUBCAT}'`],
      ];
      for (const [label, whereClause] of groups) {
        const { rows } = await client.query(`
          SELECT count(*) FROM catalog_unified
          WHERE display_category = 'Suspension' AND is_active = true AND ${whereClause}
        `);
        console.log(`${label}: ${rows[0].count} rows (dry run)`);
      }
      console.log(`TRIKE CONVERSN ids -> Trike Conversion Kits: ${TRIKE_CONVERSN_IDS.length} rows (dry run)`);
      console.log(`Trike comfort lift kits -> Trike Conversion Kits: ${TRIKE_COMFORT_LIFT_IDS.length} rows (dry run)`);
      console.log(`Lowering remainder -> Rear Shocks & Lowering Kits: ${LOWERING_REMAINDER_IDS.length} rows (dry run)`);
      console.log(`Fork legs/cover -> Forks: ${FORK_LEGS_IDS.length} rows (dry run)`);
      console.log(`Steering dampers -> Forks: ${STEERING_DAMPER_TO_FORKS_IDS.length} rows (dry run)`);
      console.log(`Cush drive -> Transmission & Clutch: ${CUSH_DRIVE_TO_TRANS_IDS.length} rows (dry run)`);
      console.log(`Turn signal -> Lighting: ${TURN_SIGNAL_TO_LIGHTING_ID.length} rows (dry run)`);
      console.log('\nDRY RUN ONLY -- no rows updated. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    let total = 0;

    total += await runUpdate(client, 'Shocks & Springs -> Rear Shocks & Lowering Kits', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Rear Shocks & Lowering Kits'
      WHERE display_category = 'Suspension' AND is_active = true AND display_subcategory = 'Shocks & Springs'
    `);

    total += await runUpdate(client, 'Fork Tubes & Internals -> Forks', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Forks'
      WHERE display_category = 'Suspension' AND is_active = true AND display_subcategory = 'Fork Tubes & Internals'
    `);

    total += await runUpdate(client, 'Triple Trees & Stems -> Triple Trees & Covers', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Triple Trees & Covers'
      WHERE display_category = 'Suspension' AND is_active = true AND display_subcategory = $1
    `, [TRIPLE_TREES_SUBCAT]);

    total += await runUpdate(client, 'Steering Stem Hardware -> Triple Trees & Covers', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Triple Trees & Covers'
      WHERE display_category = 'Suspension' AND is_active = true AND display_subcategory = $1
    `, [STEERING_STEM_HW_SUBCAT]);

    total += await runUpdate(client, 'Swingarms -> Frame', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Frame'
      WHERE display_category = 'Suspension' AND is_active = true AND display_subcategory = $1
    `, [SWINGARMS_SUBCAT]);

    total += await runUpdate(client, 'Ride Control & Rear Support -> Rear Shocks & Lowering Kits', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Rear Shocks & Lowering Kits'
      WHERE display_category = 'Suspension' AND is_active = true AND display_subcategory = $1
    `, [RIDE_CONTROL_SUBCAT]);

    total += await runUpdate(client, 'TRIKE CONVERSN ids -> Trike Conversion Kits', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Trike Conversion Kits'
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [TRIKE_CONVERSN_IDS]);

    total += await runUpdate(client, 'Trike comfort lift kits -> Trike Conversion Kits', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Trike Conversion Kits'
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [TRIKE_COMFORT_LIFT_IDS]);

    total += await runUpdate(client, 'Lowering remainder -> Rear Shocks & Lowering Kits', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Rear Shocks & Lowering Kits'
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [LOWERING_REMAINDER_IDS]);

    total += await runUpdate(client, 'Fork legs/cover -> Forks', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Forks'
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [FORK_LEGS_IDS]);

    total += await runUpdate(client, 'Steering dampers -> Forks', `
      UPDATE catalog_unified SET display_category = 'Frames & Suspension', display_subcategory = 'Forks'
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [STEERING_DAMPER_TO_FORKS_IDS]);

    total += await runUpdate(client, 'Cush drive -> Transmission & Clutch (subcat left NULL, needs follow-up)', `
      UPDATE catalog_unified SET display_category = 'Transmission & Clutch', display_subcategory = NULL
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [CUSH_DRIVE_TO_TRANS_IDS]);

    total += await runUpdate(client, 'Turn signal -> Lighting (subcat left NULL, needs follow-up)', `
      UPDATE catalog_unified SET display_category = 'Lighting', display_subcategory = NULL
      WHERE id = ANY($1::int[]) AND is_active = true
    `, [TURN_SIGNAL_TO_LIGHTING_ID]);

    await client.query('COMMIT');
    console.log(`\nAPPLIED: ${total} rows updated total (expect 454).`);

    const { rows: remaining } = await client.query(`
      SELECT count(*) FROM catalog_unified WHERE display_category = 'Suspension' AND is_active = true
    `);
    console.log(`Suspension active rows remaining: ${remaining[0].count} (should be 0 -- category now retired).`);

    // Show live subcats for Transmission & Clutch and Lighting so Laken can
    // pick a real subcat name for the 7 NULL-subcat rows without us inventing one.
    console.log('\n=== Transmission & Clutch subcats (for the 6 cush-drive rows) ===');
    const { rows: tcSubcats } = await client.query(`
      SELECT display_subcategory, count(*) FROM catalog_unified
      WHERE display_category = 'Transmission & Clutch' AND is_active = true
      GROUP BY display_subcategory ORDER BY count(*) DESC
    `);
    for (const r of tcSubcats) console.log(`  ${r.display_subcategory}: ${r.count}`);

    console.log('\n=== Lighting subcats (for the 1 turn-signal row) ===');
    const { rows: ltSubcats } = await client.query(`
      SELECT display_subcategory, count(*) FROM catalog_unified
      WHERE display_category = 'Lighting' AND is_active = true
      GROUP BY display_subcategory ORDER BY count(*) DESC
    `);
    for (const r of ltSubcats) console.log(`  ${r.display_subcategory}: ${r.count}`);

    console.log('\nNext: assign real subcats to the 7 NULL rows above, then run sync_fitment_flat_columns.mjs + index_unified.js --recreate.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('SCRIPT FAILED:', err);
  process.exit(1);
});
