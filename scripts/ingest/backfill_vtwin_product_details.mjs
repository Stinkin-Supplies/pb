/**
 * backfill_vtwin_product_details.mjs
 *
 * catalog_unified.product_details is read live by the PDP "Details" tab
 * (components/browse/PDPTabs.jsx -> DetailsContent, expects
 * { description, features, tech_note, attributes }), but it was 0% filled
 * for all 38,140 VTwin products even though vtwin_scrape_data has real
 * content sitting unused: description (15,090 rows), tech_note (1,647),
 * extra_attributes (4,471, already a JSON string of key/value spec pairs).
 *
 * This backfill is additive only -- COALESCE keeps any existing
 * product_details untouched (none currently exist for VTwin, but this
 * stays safe if that changes) and only sets keys where the source data has
 * a non-blank value, so a VTwin product with no scrape data at all is left
 * with product_details = NULL rather than an empty shell object.
 *
 * Usage:
 *   node scripts/ingest/backfill_vtwin_product_details.mjs           # dry run
 *   node scripts/ingest/backfill_vtwin_product_details.mjs --apply  # writes
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const { rows: candidates } = await client.query(`
      SELECT cu.id, v.sku, v.description, v.tech_note, v.extra_attributes
      FROM catalog_unified cu
      JOIN vtwin_scrape_data v ON cu.sku = 'VT-' || v.sku
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.product_details IS NULL
        AND (
          (v.description IS NOT NULL AND v.description != '') OR
          (v.tech_note IS NOT NULL AND v.tech_note != '') OR
          (v.extra_attributes IS NOT NULL AND v.extra_attributes != '')
        )
    `);
    console.log(`Candidates with at least one field to backfill: ${candidates.length}`);

    let validAttrs = 0, invalidAttrs = 0;
    const updates = candidates.map((r) => {
      let attributes = null;
      if (r.extra_attributes) {
        try { attributes = JSON.parse(r.extra_attributes); validAttrs++; }
        catch { invalidAttrs++; }
      }
      const payload = {};
      if (r.description) payload.description = r.description;
      if (r.tech_note) payload.tech_note = r.tech_note;
      if (attributes && Object.keys(attributes).length > 0) payload.attributes = attributes;
      return { id: r.id, payload };
    }).filter((u) => Object.keys(u.payload).length > 0);

    console.log(`Rows with at least one usable field after parsing: ${updates.length} (attributes parsed OK: ${validAttrs}, failed to parse: ${invalidAttrs})`);

    if (!APPLY) {
      console.log('\nSample:', JSON.stringify(updates.slice(0, 3), null, 2));
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.\n');
      return;
    }

    const BATCH_SIZE = 500;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      await client.query(
        `UPDATE catalog_unified AS t
           SET product_details = v.payload::jsonb,
               updated_at = now()
         FROM (
           SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS payload
         ) AS v
         WHERE t.id = v.id`,
        [batch.map((u) => u.id), batch.map((u) => JSON.stringify(u.payload))]
      );
      await client.query('COMMIT');
      done += batch.length;
      process.stdout.write(`\r  ${done}/${updates.length} updated`);
    }
    console.log(`\n\nDone. ${done} catalog_unified rows backfilled with product_details.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
