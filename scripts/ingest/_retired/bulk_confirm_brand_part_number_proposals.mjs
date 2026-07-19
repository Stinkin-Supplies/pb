#!/usr/bin/env node
/**
 * bulk_confirm_brand_part_number_proposals.mjs
 *
 * Flips tonight's brand_part_number-sourced canonical_match_proposals
 * from 'pending' to 'confirmed', so apply/route.ts can pick them up.
 *
 * SCOPED TIGHTLY on purpose:
 *   - match_reason = 'brand_part_number'  (never touches OEM-sourced or
 *     old admin-select proposals)
 *   - status = 'pending'                  (never touches already-applied
 *     or already-rejected rows)
 *   - created_at within the exact window this session's generator
 *     script ran (passed as CLI args) — belt-and-suspenders on top of
 *     match_reason, in case that value is ever reused by something else
 *     later.
 *
 * DRY RUN BY DEFAULT — prints what would be confirmed and writes a CSV.
 * Pass --apply to actually update.
 *
 * Usage:
 *   node bulk_confirm_brand_part_number_proposals.mjs \
 *     --from "2026-07-04 05:02:54.995618+00" \
 *     --to   "2026-07-04 05:06:36.531711+00"
 *
 *   (add --apply to actually flip status)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const fromTs = getArg('--from');
const toTs = getArg('--to');

if (!fromTs || !toTs) {
  console.error('Usage: node bulk_confirm_brand_part_number_proposals.mjs --from "<ts>" --to "<ts>" [--apply]');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log(APPLY ? 'MODE: APPLY (will update status)' : 'MODE: DRY RUN (no writes)');
    console.log(`Scope: match_reason='brand_part_number', status='pending', created_at BETWEEN ${fromTs} AND ${toTs}\n`);

    const { rows } = await client.query(
      `SELECT id, product_id_a, product_id_b, created_at
       FROM canonical_match_proposals
       WHERE match_reason = 'brand_part_number'
         AND status = 'pending'
         AND created_at BETWEEN $1 AND $2`,
      [fromTs, toTs]
    );

    console.log(`Matched ${rows.length} pending proposals in scope.`);

    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `bulk_confirm_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const lines = ['id,product_id_a,product_id_b,created_at'];
    for (const r of rows) lines.push(`${r.id},${r.product_id_a},${r.product_id_b},${r.created_at.toISOString()}`);
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`Written: ${csvPath}`);

    if (!APPLY) {
      console.log('\nDry run only — no rows updated. Review the CSV, then re-run with --apply.');
      return;
    }

    const ids = rows.map((r) => r.id);
    const { rowCount } = await client.query(
      `UPDATE canonical_match_proposals
       SET status = 'confirmed', reviewed_by = 'bulk-confirm-brand-part-number', reviewed_at = NOW()
       WHERE id = ANY($1::int[])
         AND match_reason = 'brand_part_number'
         AND status = 'pending'`,
      [ids]
    );

    console.log(`\nConfirmed ${rowCount} proposals.`);
    console.log("Next step: run apply/route.ts (POST /api/admin/canonical-matches/apply) to actually merge them.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
