/**
 * fix_fl_el_pre1936_misattribution.mjs
 *
 * catalog_fitment_v2 has ~55,633 rows pointing at harley_model_years for
 * model_id=321 (FL/ELECTRA GLIDE) and model_id=379 (EL/KNUCKLEHEAD) at years
 * before either model actually existed -- e.g. "1943 Electra Glide" (the
 * Electra Glide name/electric start didn't exist until 1965; see
 * import_vtwin_ds_fitment_scraper.mjs history for how this surfaced).
 *
 * This is NOT junk data to discard -- spot-checking showed real parts (e.g.
 * a Linkert Carburetor Rebuild Kit genuinely fitting 1941-1959) correctly
 * scraped, just linked to the wrong model record for those years. The fix
 * re-points each row at the model that actually existed for that year:
 *   - FL, 1941-1947 -> model_id=484 (KNUCKLEHEAD 74CI, added alongside this fix)
 *   - FL, 1948-1964 -> model_id=417 (PANHEAD 74CI, pre-existing)
 *   - FL, before 1941 / EL, before 1936 -> no valid model exists for that
 *     year at all (neither code existed yet); these ~503 rows have no
 *     correct target and are deleted.
 *
 * Re-pointing (not blind UPDATE) checks for an existing correct row first --
 * if (product_id, correct_model_year_id) already exists from another source,
 * the wrong row is a pure duplicate and gets deleted instead of UPDATEd,
 * avoiding a unique constraint violation on catalog_fitment_v2.
 *
 * Every affected row is exported to a CSV backup before any write.
 *
 * Usage:
 *   node scripts/ingest/fix_fl_el_pre1936_misattribution.mjs            # dry run
 *   node scripts/ingest/fix_fl_el_pre1936_misattribution.mjs --apply    # writes
 */
'use strict';

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const BACKUP_PATH = '/Users/home/Desktop/backup_fl_el_pre1936_fitment_v2.csv';

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function run() {
  const client = await pool.connect();
  try {
    // All affected rows, with the corrected target model worked out per-row.
    const { rows: affected } = await client.query(`
      SELECT
        cf.id AS fitment_id, cf.product_id, cf.model_year_id, cf.fitment_source, cf.confidence_score,
        hmy.year, hmy.model_id AS wrong_model_id, cu.sku, cu.name,
        CASE
          WHEN hmy.model_id = 321 AND hmy.year BETWEEN 1941 AND 1947 THEN 484
          WHEN hmy.model_id = 321 AND hmy.year BETWEEN 1948 AND 1964 THEN 417
          ELSE NULL
        END AS target_model_id
      FROM catalog_fitment_v2 cf
      JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
      JOIN catalog_unified cu ON cu.id = cf.product_id
      WHERE (hmy.model_id = 321 AND hmy.year < 1965)
         OR (hmy.model_id = 379 AND hmy.year < 1936)
    `);

    console.log(`Found ${affected.length} affected catalog_fitment_v2 rows${APPLY ? '' : '  [DRY RUN]'}`);

    // Backup before anything else -- always written, dry run or not.
    const cols = ['fitment_id', 'product_id', 'sku', 'name', 'model_year_id', 'wrong_model_id', 'year', 'target_model_id', 'fitment_source', 'confidence_score'];
    const lines = [cols.join(','), ...affected.map((r) => cols.map((c) => csvEscape(r[c])).join(','))];
    fs.writeFileSync(BACKUP_PATH, lines.join('\n'));
    console.log(`Backed up ${affected.length} rows to ${BACKUP_PATH}`);

    // Preload harley_model_years for the two correct target models so we can
    // resolve (target_model_id, year) -> model_year_id without a query per row.
    const { rows: targetYears } = await client.query(`SELECT id, model_id, year FROM harley_model_years WHERE model_id IN (417, 484)`);
    const targetYearMap = new Map(); // "modelId:year" -> model_year_id
    for (const ty of targetYears) targetYearMap.set(`${ty.model_id}:${ty.year}`, ty.id);

    // Preload existing (product_id, model_year_id) pairs so we can tell a
    // genuine duplicate (correct row already exists elsewhere) from a clean re-point.
    const { rows: existingPairs } = await client.query(`SELECT product_id, model_year_id FROM catalog_fitment_v2`);
    const existingSet = new Set(existingPairs.map((p) => `${p.product_id}:${p.model_year_id}`));

    const toDelete = [];   // fitment_id -- no valid target, or a duplicate of an already-correct row
    const toRepoint = [];  // { fitment_id, newModelYearId }

    for (const r of affected) {
      if (!r.target_model_id) {
        toDelete.push(r.fitment_id);
        continue;
      }
      const targetModelYearId = targetYearMap.get(`${r.target_model_id}:${r.year}`);
      if (!targetModelYearId) {
        // Shouldn't happen (both target models' years were populated alongside
        // this fix), but fail safe rather than silently drop real fitment.
        console.warn(`  No harley_model_years row for model ${r.target_model_id} year ${r.year} (fitment_id ${r.fitment_id}) -- leaving untouched.`);
        continue;
      }
      const key = `${r.product_id}:${targetModelYearId}`;
      if (existingSet.has(key)) {
        toDelete.push(r.fitment_id); // correct row already exists elsewhere -- this one's a pure duplicate
      } else {
        toRepoint.push({ fitment_id: r.fitment_id, newModelYearId: targetModelYearId });
        existingSet.add(key); // claim it so two wrong rows don't both try to re-point to the same target
      }
    }

    console.log(`  Re-point: ${toRepoint.length}`);
    console.log(`  Delete (duplicate of existing correct row, or no valid target): ${toDelete.length}`);

    if (!APPLY) {
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.');
      return;
    }

    await client.query('BEGIN');

    const CHUNK = 5000;
    let repointed = 0;
    for (let i = 0; i < toRepoint.length; i += CHUNK) {
      const chunk = toRepoint.slice(i, i + CHUNK);
      const res = await client.query(
        `UPDATE catalog_fitment_v2 cf
         SET model_year_id = v.new_model_year_id
         FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS new_model_year_id) v
         WHERE cf.id = v.id`,
        [chunk.map((c) => c.fitment_id), chunk.map((c) => c.newModelYearId)]
      );
      repointed += res.rowCount;
      process.stdout.write(`\r  re-pointed: ${repointed}/${toRepoint.length}`);
    }
    console.log();

    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK);
      const res = await client.query(`DELETE FROM catalog_fitment_v2 WHERE id = ANY($1::int[])`, [chunk]);
      deleted += res.rowCount;
      process.stdout.write(`\r  deleted: ${deleted}/${toDelete.length}`);
    }
    console.log();

    await client.query('COMMIT');
    console.log(`\nDone. Re-pointed ${repointed}, deleted ${deleted}.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Fatal, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
