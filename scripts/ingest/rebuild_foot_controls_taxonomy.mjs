#!/usr/bin/env node
/**
 * rebuild_foot_controls_taxonomy.mjs
 *
 * Laken's finalized spec for "Foot Controls" -> renamed "Foot Controls &
 * Pegs", 14 target subcategories. Classifies every active row in the
 * category from scratch (old subcat boundaries don't map cleanly onto the
 * new 14 -- most of them are all mixed together inside the current
 * "Footpegs, Shift Pegs, & HW" 1583-row bucket).
 *
 * Also flags (does not move) two findings from sampling:
 *   - 13 "Spring Fork Front Brake ..." rows sitting in "Brake Arm & Pedal
 *     Hardware" that are actually vintage springer-fork FRONT WHEEL brake
 *     components, not foot controls at all -- likely belong in Brakes.
 *   - The entire "Highway Bars & Pegs" bucket (353 rows: crash bars/engine
 *     guards mixed with actual highway-peg-mount items) isn't named
 *     anywhere in Laken's 14-bucket spec.
 *
 * Usage:
 *   node scripts/ingest/rebuild_foot_controls_taxonomy.mjs            # dry run, full report
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Foot Controls';
const NEW_CAT = 'Foot Controls & Pegs';

// 13 "Spring Fork Front Brake ..." rows -- vintage springer front-wheel
// brake components, not foot controls. Laken's call: move to Brakes.
const SPRING_FORK_BRAKE_RULES = [
  [/shoe/i, 'Brake Pads & Shoes'],
  [/caliper/i, 'Calipers'],
  [/front brake kit$|^spring fork brake kit$/i, 'Brake Conversion Kits'],
];
function classifySpringForkBrake(name) {
  for (const [re, label] of SPRING_FORK_BRAKE_RULES) {
    if (re.test(name)) return label;
  }
  return 'Brake Hardware';
}

const RULES = [
  [/frame mount slider/i, 'Foot Peg Mounts, Bracket, Hardware'], // SANTORO FABWORX rear-peg slider mount line -- one variant explicitly says "REAR PEG FRAME MOUNT SLIDER," same product family
  [/kickstand|jiffy stand|jiffy kickstand|side ?stand|center stand|sidestand|front stand|rear stand|fix-stand|kick stand angle/i, 'Kickstands'],
  [/forward controls?|forward c?ntrls?|forward ctrls?|controls? fwd|fwd controls?|fwrd cntrls?/i, 'Forward Control Sets'],
  [/mid[- ]control|mid-cont\b|mid cont\b/i, 'Mid Control Sets'],
  [/jockey|foot clutch/i, 'Jockey Shift Components'],
  [/heel.{0,3}toe|toe shifter|heel shifter|heel lever eliminator|heel shift eliminator|stealth (toe|heel) shifter/i, 'Shifter Lever, Shaft & Hardware'],
  [/shift linkage|shift rod|shift shaft|\blinkage\b|rod end|ball joint shifter/i, 'Shift Linkage'],
  [/shifter lever|shift lever|foot shifter|hand shift lever|foot lever|shifter shaft|shifter assembly|shifter bracket|shift spl|shift(er)? cover|shift(er)? cvr|shifter control kit|shift sleeve|shift primary|shift(er)? arm|lever shift|transmission shifter cover|shifter fork|shift sensor|linear sensor|quickshifter|county line shifter|shift kit|shifter kit|shifter pedal|shift pedal/i, 'Shifter Lever, Shaft & Hardware'],
  [/shift(er)? peg|shifter footpeg|peg shift|peg custom|peg air|peg gel|peg folding|shift\/brake peg|shifter\/brake peg/i, 'Shift Peg'],
  [/(floorboard|footboard|floor board|floo?rboard).*(mount|bracket|hinge|riser|spacer|insert|mat|rivet)/i, 'Floorboard Mounts, Bracket, Hardware'],
  [/floorboard|footboard|footbaord|flooboards?|floor board|rail board|running board|run bord|mini.*boards?|miniboards?|passenger boards?|\bf ?boards?\b/i, 'Floorboard'],
  [/heel spacer eliminator|heel eliminator|kick back plate|qualifier insert|replacement rubber pad|o-ring kit|rubber strip kit|toe rest/i, 'Accessories'],
  [/(footpeg|foot peg|peg).*(mount|bracket|clamp|clevis|yoke|extension|support|stud|screw|rubber|adapter)|peg pins?/i, 'Foot Peg Mounts, Bracket, Hardware'],
  [/brake arm|brake pedal|brake control|brake kit|brk arm|toe peg|kick pedal|kick start pedal|pedal kit|pedal rubber|pedal set|clutch lever pivot|clutch lever rod|brake plunger|brake shoe.*kit|clevis/i, 'Brake Arm & Pedals'],
  [/footpeg|foot peg|passenger peg|foot rest|footrest|\bpegs?\b/i, 'Foot Pegs & Passenger Peg'],
];

function classify(name) {
  for (const [re, label] of RULES) {
    if (re.test(name)) return label;
  }
  return 'General';
}

async function main() {
  const res = await pool.query(
    `SELECT id, name, brand, display_subcategory FROM catalog_unified WHERE is_active = true AND display_category = $1`,
    [CAT]
  );
  console.log(`Total active rows in "${CAT}": ${res.rows.length}\n`);

  const tally = {};
  const sampleByLabel = {};
  const updates = []; // { id, cat, subcat }
  let highwayBarsCount = 0;
  const springForkTally = {};

  for (const row of res.rows) {
    if (row.display_subcategory === 'Highway Bars & Pegs') {
      // Laken's call: keep as its own subcategory, carried over unchanged.
      updates.push({ id: row.id, cat: NEW_CAT, subcat: 'Highway Bars & Pegs' });
      highwayBarsCount++;
      continue;
    }
    if (/spring fork.*brake/i.test(row.name)) {
      // Laken's call: move to Brakes, not a foot control.
      const label = classifySpringForkBrake(row.name);
      springForkTally[label] = (springForkTally[label] || 0) + 1;
      updates.push({ id: row.id, cat: 'Brakes', subcat: label });
      continue;
    }
    const label = classify(row.name);
    tally[label] = (tally[label] || 0) + 1;
    sampleByLabel[label] = sampleByLabel[label] || [];
    if (sampleByLabel[label].length < 5) sampleByLabel[label].push(row.name);
    updates.push({ id: row.id, cat: NEW_CAT, subcat: label });
  }

  console.log(`Highway Bars & Pegs carried over unchanged: ${highwayBarsCount}`);
  console.log('\nSpring Fork Front Brake -> Brakes:');
  for (const [label, count] of Object.entries(springForkTally)) console.log(`  ${label}: ${count}`);

  console.log('\n=== Proposed 14-bucket mapping ===');
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`\n${label}: ${count}`);
    for (const s of sampleByLabel[label]) console.log(`  e.g. ${s}`);
  }
  console.log(`\nTotal classified: ${total} / ${res.rows.length - highwayBarsCount - 13}`);
  console.log(`Total updates staged: ${updates.length} / ${res.rows.length}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS backup_foot_controls_20260717`);
    await client.query(
      `CREATE TABLE backup_foot_controls_20260717 AS
       SELECT id, display_category, display_subcategory FROM catalog_unified
       WHERE is_active = true AND display_category = $1`,
      [CAT]
    );

    let updated = 0;
    for (const { id, cat, subcat } of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [cat, subcat, id]
      );
      updated++;
    }
    await client.query('COMMIT');
    console.log(`\nApplied ${updated} row updates. Committed. Backup table: backup_foot_controls_20260717`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
