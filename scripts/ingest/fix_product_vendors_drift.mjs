#!/usr/bin/env node
/**
 * fix_product_vendors_drift.mjs
 *
 * catalog_unified.canonical_product_id is the source of truth for which
 * canonical entry an item belongs to. product_vendors.canonical_id is
 * supposed to mirror that, but split_false_merge_groups.mjs only updated
 * catalog_unified, not product_vendors — so the 22 split-off items from
 * tonight's run currently have drifted product_vendors rows still
 * pointing at their OLD (pre-split) canonical entry.
 *
 * This is a general reconciliation, not specific to tonight's 16 groups:
 * it finds ANY catalog_unified_id where product_vendors.canonical_id !=
 * catalog_unified.canonical_product_id and fixes it. Safe to re-run any
 * time as a consistency check.
 *
 * product_vendors.catalog_unified_id has a UNIQUE constraint (confirmed
 * via \d product_vendors), so this is a clean 1:1 update — no risk of
 * violating the (canonical_id, source_vendor) unique constraint here,
 * since we're moving one already-unique row at a time, not merging two
 * vendors' rows onto the same canonical entry.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node fix_product_vendors_drift.mjs
 *   node fix_product_vendors_drift.mjs --apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

async function main() {
  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log(APPLY ? 'MODE: APPLY (will update)' : 'MODE: DRY RUN (no writes)');

    const { rows: drift } = await client.query(`
      SELECT
        cu.id AS catalog_unified_id,
        cu.sku,
        cu.name,
        cu.source_vendor,
        cu.canonical_product_id AS correct_canonical_id,
        pv.id AS product_vendors_id,
        pv.canonical_id AS current_pv_canonical_id
      FROM catalog_unified cu
      JOIN product_vendors pv ON pv.catalog_unified_id = cu.id
      WHERE cu.canonical_product_id IS NOT NULL
        AND cu.canonical_product_id != pv.canonical_id
      ORDER BY cu.id
    `);

    console.log(`Found ${drift.length} product_vendors rows drifted from catalog_unified.canonical_product_id.\n`);

    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `product_vendors_drift_${APPLY ? 'fixed' : 'dryrun'}_${ts}.csv`);
    const headers = ['catalog_unified_id', 'sku', 'name', 'source_vendor', 'correct_canonical_id', 'product_vendors_id', 'current_pv_canonical_id'];
    const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [headers.join(',')];
    for (const r of drift) lines.push(headers.map((h) => esc(r[h])).join(','));
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`Written: ${csvPath}`);

    for (const r of drift.slice(0, 30)) {
      console.log(`  cu_id=${r.catalog_unified_id} sku=${r.sku} vendor=${r.source_vendor}: pv.canonical_id ${r.current_pv_canonical_id} -> ${r.correct_canonical_id}`);
    }
    if (drift.length > 30) console.log(`  ...and ${drift.length - 30} more (see CSV)`);

    if (!APPLY) {
      console.log('\nDry run only — no rows updated. Review, then re-run with --apply.');
      return;
    }

    let fixed = 0;
    for (const r of drift) {
      try {
        await client.query(
          `UPDATE product_vendors SET canonical_id = $1 WHERE id = $2`,
          [r.correct_canonical_id, r.product_vendors_id]
        );
        fixed++;
      } catch (err) {
        console.error(`  FAILED for product_vendors id=${r.product_vendors_id}: ${err.message}`);
      }
    }
    console.log(`\nFixed ${fixed}/${drift.length} drifted rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
