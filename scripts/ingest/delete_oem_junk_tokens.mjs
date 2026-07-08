#!/usr/bin/env node
/**
 * delete_oem_junk_tokens.mjs
 *
 * Deletes catalog_oem_crossref rows where oem_number is 1 OR 2 characters
 * (letter, digit, or punctuation) — confirmed junk, not real OEM numbers.
 * Covers both the single-char tokens ("5", "N", ".") and the 2-char
 * fragments ("35", "56", "57", "23") — both confirmed junk on review.
 *
 * This data is already live on real PDPs (the OEM tab reads
 * catalog_oem_crossref directly), so this is a real customer-facing
 * cleanup, not just an internal data hygiene pass.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node scripts/ingest/delete_oem_junk_tokens.mjs
 *   node scripts/ingest/delete_oem_junk_tokens.mjs --apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local/.env at the project root.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? 'MODE: APPLY (will delete)' : 'MODE: DRY RUN (no writes)');

    const { rows: toDelete } = await client.query(`
      SELECT oc.id AS crossref_id, oc.product_id, oc.oem_number, oc.source,
             cu.sku, cu.name, cu.source_vendor
      FROM catalog_oem_crossref oc
      LEFT JOIN catalog_unified cu ON cu.id = oc.product_id
      WHERE length(trim(oc.oem_number)) <= 2
      ORDER BY oc.product_id;
    `);

    console.log(`\nFound ${toDelete.length} junk rows (1-2 chars) to delete.\n`);
    for (const r of toDelete.slice(0, 20)) {
      const label = r.sku ? `sku=${r.sku} [${r.source_vendor}]` : '(no matching catalog_unified product — orphaned crossref row)';
      console.log(`  crossref_id=${r.crossref_id} product_id=${r.product_id} ${label} "${r.oem_number}" (source=${r.source ?? '(null)'})`);
    }
    if (toDelete.length > 20) console.log(`  ...and ${toDelete.length - 20} more (see CSV).`);

    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `oem_junk_delete_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const csvLines = ['crossref_id,product_id,sku,source_vendor,oem_number,source'];
    for (const r of toDelete) {
      csvLines.push([r.crossref_id, r.product_id, r.sku, r.source_vendor, `"${r.oem_number}"`, r.source ?? ''].join(','));
    }
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`\nWritten: ${csvPath}`);

    if (!APPLY) {
      console.log('\nDry run only — no rows deleted. Review the CSV, then re-run with --apply.');
      return;
    }

    console.log('\nDeleting...');
    const ids = toDelete.map((r) => r.crossref_id);
    const res = await client.query(
      `DELETE FROM catalog_oem_crossref WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`✅ Deleted ${res.rowCount} rows.`);
    console.log('\nNote: this only touches catalog_oem_crossref. If any of these junk');
    console.log('values already made it into catalog_unified.oem_numbers[] via an');
    console.log('earlier run, re-run sync_oem_numbers_from_crossref.mjs\'s dry-run to');
    console.log('confirm — that script only adds, never removes, so a manual check is');
    console.log('worth it here.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
