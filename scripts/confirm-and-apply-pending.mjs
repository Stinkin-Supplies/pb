/**
 * scripts/confirm-and-apply-pending.mjs
 *
 * Confirms ALL pending canonical_match_proposals and immediately applies them.
 * Use this after you've rejected the bad matches in the admin UI.
 *
 *   node scripts/confirm-and-apply-pending.mjs
 *
 * Dry-run (shows what would happen, changes nothing):
 *   node scripts/confirm-and-apply-pending.mjs --dry-run
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Count pending
    const { rows: [{ n }] } = await client.query(
      `SELECT COUNT(*) AS n FROM canonical_match_proposals WHERE status = 'pending'`
    );
    console.log(`\n${n} pending proposal(s) found.`);
    if (Number(n) === 0) {
      console.log('Nothing to do.');
      return;
    }

    if (DRY_RUN) {
      console.log('\n── DRY RUN — no changes will be made ──\n');
    }

    // Preview: show what will be merged
    const { rows: preview } = await client.query(`
      SELECT
        cmp.id,
        cmp.shared_oem_number,
        cmp.match_reason,
        cmp.match_score,
        a.name AS a_name, a.source_vendor AS a_vendor,
        b.name AS b_name, b.source_vendor AS b_vendor,
        a.canonical_product_id AS cp_a,
        b.canonical_product_id AS cp_b
      FROM canonical_match_proposals cmp
      JOIN catalog_unified a ON a.id = cmp.product_id_a
      JOIN catalog_unified b ON b.id = cmp.product_id_b
      WHERE cmp.status = 'pending'
      ORDER BY cmp.match_score DESC, cmp.shared_oem_number
      LIMIT 20
    `);

    console.log('\nSample of proposals to be applied (first 20):');
    for (const row of preview) {
      const oem = row.shared_oem_number ?? `(${row.match_reason})`;
      const merge = row.cp_a !== row.cp_b ? `canonical ${row.cp_a} ← ${row.cp_b}` : 'already same canonical';
      console.log(`  [${row.id}] ${oem}  ${row.a_vendor}:"${row.a_name.slice(0,30)}" + ${row.b_vendor}:"${row.b_name.slice(0,30)}"  → ${merge}`);
    }
    if (Number(n) > 20) console.log(`  ... and ${Number(n) - 20} more`);

    if (DRY_RUN) {
      console.log('\nRe-run without --dry-run to apply.\n');
      return;
    }

    console.log('\nConfirming all pending proposals...');

    // Step 1: confirm all pending
    const { rowCount: confirmed } = await client.query(`
      UPDATE canonical_match_proposals
      SET status = 'confirmed', reviewed_by = 'script:confirm-and-apply', reviewed_at = NOW()
      WHERE status = 'pending'
    `);
    console.log(`  Confirmed ${confirmed} proposals.`);

    // Step 2: apply confirmed proposals where canonicals differ
    const { rows: toApply } = await client.query(`
      SELECT cmp.id AS proposal_id,
             a.canonical_product_id AS cp_a,
             b.canonical_product_id AS cp_b
      FROM canonical_match_proposals cmp
      JOIN catalog_unified a ON a.id = cmp.product_id_a
      JOIN catalog_unified b ON b.id = cmp.product_id_b
      WHERE cmp.status = 'confirmed'
        AND a.canonical_product_id IS NOT NULL
        AND b.canonical_product_id IS NOT NULL
        AND a.canonical_product_id != b.canonical_product_id
    `);

    console.log(`\nApplying ${toApply.length} merge(s)...`);

    let merged = 0;
    const errors = [];

    for (const row of toApply) {
      const keepId  = Math.min(row.cp_a, row.cp_b);
      const mergeId = Math.max(row.cp_a, row.cp_b);

      try {
        await client.query('BEGIN');

        await client.query(`
          UPDATE product_vendors SET canonical_id = $1
          WHERE canonical_id = $2
            AND source_vendor NOT IN (SELECT source_vendor FROM product_vendors WHERE canonical_id = $1)
        `, [keepId, mergeId]);

        await client.query(`DELETE FROM product_vendors WHERE canonical_id = $1`, [mergeId]);

        await client.query(`
          UPDATE catalog_unified SET canonical_product_id = $1 WHERE canonical_product_id = $2
        `, [keepId, mergeId]);

        await client.query(`
          UPDATE canonical_products SET match_confidence = 'oem', updated_at = NOW() WHERE id = $1
        `, [keepId]);

        await client.query(`
          UPDATE canonical_products SET is_active = false, updated_at = NOW() WHERE id = $1
        `, [mergeId]);

        await client.query(`
          UPDATE canonical_match_proposals SET status = 'applied' WHERE id = $1
        `, [row.proposal_id]);

        await client.query('COMMIT');
        merged++;
        process.stdout.write(`  ✓ canonical ${mergeId} → ${keepId}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        errors.push(`proposal ${row.proposal_id}: ${err.message}`);
        console.error(`  ✗ proposal ${row.proposal_id}: ${err.message}`);
      }
    }

    // Mark already-same-canonical confirmed proposals as applied
    const { rowCount: alreadySame } = await client.query(`
      UPDATE canonical_match_proposals cmp SET status = 'applied'
      WHERE cmp.status = 'confirmed'
        AND EXISTS (
          SELECT 1 FROM catalog_unified a, catalog_unified b
          WHERE a.id = cmp.product_id_a AND b.id = cmp.product_id_b
            AND a.canonical_product_id IS NOT NULL
            AND a.canonical_product_id = b.canonical_product_id
        )
    `);

    // Auto-reject confirmed proposals with missing/inactive products
    const { rowCount: autoRejected } = await client.query(`
      UPDATE canonical_match_proposals cmp
      SET status = 'rejected', reviewed_by = 'auto-cleanup', reviewed_at = NOW()
      FROM catalog_unified a, catalog_unified b
      WHERE a.id = cmp.product_id_a AND b.id = cmp.product_id_b
        AND cmp.status = 'confirmed'
        AND (a.canonical_product_id IS NULL OR b.canonical_product_id IS NULL
             OR NOT a.is_active OR NOT b.is_active)
    `);

    console.log(`\n── Done ─────────────────────────────────`);
    console.log(`  Confirmed:      ${confirmed}`);
    console.log(`  Merged:         ${merged}`);
    console.log(`  Already same:   ${alreadySame ?? 0}`);
    console.log(`  Auto-rejected:  ${autoRejected ?? 0}`);
    if (errors.length) {
      console.log(`  Errors:         ${errors.length}`);
      errors.forEach(e => console.log(`    ${e}`));
    }
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
