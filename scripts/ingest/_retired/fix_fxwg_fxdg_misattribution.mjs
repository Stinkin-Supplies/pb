/**
 * fix_fxwg_fxdg_misattribution.mjs
 *
 * One-off repair for two model records, verified against the H-D Service
 * Information Portal's own vehicle lookup data (serviceinfo.harley-davidson.com,
 * /sip/service/vehicle/product-variant/{id} -- the same tree that page's
 * "Choose a vehicle" dropdowns are built from):
 *
 * FXWG (Wide Glide, id 338, Shovelhead family, declared 1980-1986):
 *   H-D's own data confirms 1980-1986 is FXWG's real full production span --
 *   the model's year range is NOT wrong. But H-D's own portal files the
 *   1981-1986 Wide Glide under its SOFTAIL group, not Shovelhead, and 1985-86
 *   genuinely had Evolution engines (Shovelhead ended 1984). So the 5,734
 *   catalog_fitment_v2 rows currently on FXWG's 1985/1986 model_years (2,880
 *   + 2,854) get counted as era_shovelhead for products that are actually
 *   Evolution-era. Fix: split FXWG into two model rows at the engine
 *   boundary -- keep 1980-1984 under Shovelhead (id 338, narrowed), add a
 *   new 1985-1986 row under Softail (matching both H-D's own categorization
 *   and this DB's era_evolution family list, which already includes
 *   'Softail') -- then re-point the 5,734 fitment rows to the new
 *   model_years, matching the EL/FL repair pattern (re-point real data, not
 *   delete it).
 *
 * FXDG (Disc Glide, id 378, Shovelhead family, declared 1983-1986):
 *   H-D's own data shows FXDG was a one-year-only limited model -- 1983 ONLY.
 *   No model_years rows exist for 1984-1990 at all (never created), but 41
 *   catalog_fitment_v2 rows are wrongly attached to model_years at
 *   1991-1999 (6 distinct products, none of which lose their only fitment --
 *   each has 17-69 other fitment rows). Fix: narrow harley_models.end_year to
 *   1983, delete the 41 wrong 1991-1999 fitment rows, then delete the now
 *   orphaned 1991-1999 harley_model_years rows.
 *
 * Both fitment tables get backed up to CSV before any write, unconditionally
 * (even in dry run), same as fix_fl_el_pre1936_misattribution.mjs.
 *
 * Usage:
 *   node scripts/ingest/fix_fxwg_fxdg_misattribution.mjs           # dry run
 *   node scripts/ingest/fix_fxwg_fxdg_misattribution.mjs --apply   # writes
 */
'use strict';

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const FXWG_MODEL_ID = 338;
const FXWG_OLD_1985_MYID = 7711;
const FXWG_OLD_1986_MYID = 7712;
const SOFTAIL_FAMILY_ID = 35;

const FXDG_MODEL_ID = 378;

function toCsv(rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => JSON.stringify(r[c] ?? '')).join(','));
  }
  return lines.join('\n');
}

async function run() {
  const client = await pool.connect();
  try {
    console.log(`fix_fxwg_fxdg_misattribution${APPLY ? '' : '  [DRY RUN]'}\n`);

    // ── Backups (unconditional) ────────────────────────────────────────────
    const { rows: fxwgFitment } = await client.query(
      `SELECT * FROM catalog_fitment_v2 WHERE model_year_id IN ($1, $2)`,
      [FXWG_OLD_1985_MYID, FXWG_OLD_1986_MYID]
    );
    const { rows: fxdgFitment } = await client.query(
      `SELECT cf.* FROM catalog_fitment_v2 cf
       JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
       WHERE hmy.model_id = $1 AND hmy.year != 1983`,
      [FXDG_MODEL_ID]
    );
    fs.writeFileSync('/Users/home/Desktop/backup_fxwg_fitment_v2.csv', toCsv(fxwgFitment));
    fs.writeFileSync('/Users/home/Desktop/backup_fxdg_fitment_v2.csv', toCsv(fxdgFitment));
    console.log(`Backed up ${fxwgFitment.length} FXWG rows -> ~/Desktop/backup_fxwg_fitment_v2.csv`);
    console.log(`Backed up ${fxdgFitment.length} FXDG rows -> ~/Desktop/backup_fxdg_fitment_v2.csv`);

    console.log(`\nFXWG: will re-point ${fxwgFitment.length} fitment rows (1985+1986) to a new Softail-family model row.`);
    console.log(`FXDG: will delete ${fxdgFitment.length} wrong fitment rows (1991-1999) and narrow end_year 1986 -> 1983.`);

    if (!APPLY) {
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.');
      return;
    }

    await client.query('BEGIN');

    // ── FXWG: split at the engine boundary ────────────────────────────────
    await client.query(`UPDATE harley_models SET end_year = 1984 WHERE id = $1`, [FXWG_MODEL_ID]);

    const { rows: [newModel] } = await client.query(
      `INSERT INTO harley_models (model_code, name, family_id, start_year, end_year)
       VALUES ('FXWG', 'WIDE GLIDE', $1, 1985, 1986)
       RETURNING id`,
      [SOFTAIL_FAMILY_ID]
    );
    const newModelId = newModel.id;

    const { rows: [my1985] } = await client.query(
      `INSERT INTO harley_model_years (model_id, year) VALUES ($1, 1985) RETURNING id`,
      [newModelId]
    );
    const { rows: [my1986] } = await client.query(
      `INSERT INTO harley_model_years (model_id, year) VALUES ($1, 1986) RETURNING id`,
      [newModelId]
    );

    await client.query(`UPDATE catalog_fitment_v2 SET model_year_id = $1 WHERE model_year_id = $2`, [my1985.id, FXWG_OLD_1985_MYID]);
    await client.query(`UPDATE catalog_fitment_v2 SET model_year_id = $1 WHERE model_year_id = $2`, [my1986.id, FXWG_OLD_1986_MYID]);
    await client.query(`UPDATE bike_specs SET model_year_id = $1 WHERE model_year_id = $2`, [my1985.id, FXWG_OLD_1985_MYID]);
    await client.query(`UPDATE bike_specs SET model_year_id = $1 WHERE model_year_id = $2`, [my1986.id, FXWG_OLD_1986_MYID]);

    await client.query(`DELETE FROM harley_model_years WHERE id IN ($1, $2)`, [FXWG_OLD_1985_MYID, FXWG_OLD_1986_MYID]);

    console.log(`FXWG: created new model id=${newModelId} (Softail, 1985-1986), re-pointed ${fxwgFitment.length} fitment rows.`);

    // ── FXDG: narrow to its real single production year ──────────────────
    await client.query(`UPDATE harley_models SET end_year = 1983 WHERE id = $1`, [FXDG_MODEL_ID]);

    await client.query(
      `DELETE FROM catalog_fitment_v2 WHERE model_year_id IN (
         SELECT id FROM harley_model_years WHERE model_id = $1 AND year != 1983
       )`,
      [FXDG_MODEL_ID]
    );
    await client.query(`DELETE FROM harley_model_years WHERE model_id = $1 AND year != 1983`, [FXDG_MODEL_ID]);

    console.log(`FXDG: narrowed end_year to 1983, deleted ${fxdgFitment.length} wrong fitment rows + their orphaned model_years.`);

    await client.query('COMMIT');
    console.log('\nDone.');
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
