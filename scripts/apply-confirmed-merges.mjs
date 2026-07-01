/**
 * scripts/apply-confirmed-merges.mjs
 *
 * Run after you've confirmed matches in the admin UI:
 *   node scripts/apply-confirmed-merges.mjs
 *
 * Applies every 'confirmed' canonical_match_proposal:
 *   - Merges product_vendors onto the lower canonical_id (the "keeper")
 *   - Repoints catalog_unified.canonical_product_id to the keeper
 *   - Deactivates the merged canonical_products row
 *   - Marks the proposal 'applied'
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Count confirmed
    const { rows: [{ n }] } = await client.query(
      `SELECT COUNT(*) AS n FROM canonical_match_proposals WHERE status = 'confirmed'`
    );
    console.log(`\n${n} confirmed proposal(s) to apply.\n`);
    if (Number(n) === 0) {
      console.log('Nothing to do. Confirm some matches in the admin UI first.');
      return;
    }

    // Load confirmed proposals where both sides have different canonicals
    const { rows: confirmed } = await client.query(`
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

    let merged = 0;
    const errors = [];

    for (const row of confirmed) {
      const keepId  = Math.min(row.cp_a, row.cp_b);
      const mergeId = Math.max(row.cp_a, row.cp_b);

      try {
        await client.query('BEGIN');

        // Move product_vendors that don't already exist on the keeper
        await client.query(`
          UPDATE product_vendors
          SET canonical_id = $1
          WHERE canonical_id = $2
            AND source_vendor NOT IN (
              SELECT source_vendor FROM product_vendors WHERE canonical_id = $1
            )
        `, [keepId, mergeId]);

        // Delete any remaining duplicate vendor rows on the merged canonical
        await client.query(`DELETE FROM product_vendors WHERE canonical_id = $1`, [mergeId]);

        // Repoint catalog_unified
        await client.query(`
          UPDATE catalog_unified SET canonical_product_id = $1 WHERE canonical_product_id = $2
        `, [keepId, mergeId]);

        // Mark keeper as oem-matched
        await client.query(`
          UPDATE canonical_products SET match_confidence = 'oem', updated_at = NOW() WHERE id = $1
        `, [keepId]);

        // Deactivate merged canonical
        await client.query(`
          UPDATE canonical_products SET is_active = false, updated_at = NOW() WHERE id = $1
        `, [mergeId]);

        // Mark proposal applied
        await client.query(`
          UPDATE canonical_match_proposals SET status = 'applied' WHERE id = $1
        `, [row.proposal_id]);

        await client.query('COMMIT');
        merged++;
        process.stdout.write(`  ✓ merged canonical ${mergeId} → ${keepId} (proposal ${row.proposal_id})\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        const msg = `  ✗ proposal ${row.proposal_id}: ${err.message}`;
        errors.push(msg);
        console.error(msg);
      }
    }

    // Mark proposals where both sides already share a canonical as applied (already done)
    const { rowCount: alreadySame } = await client.query(`
      UPDATE canonical_match_proposals cmp
      SET status = 'applied'
      WHERE cmp.status = 'confirmed'
        AND EXISTS (
          SELECT 1 FROM catalog_unified a, catalog_unified b
          WHERE a.id = cmp.product_id_a AND b.id = cmp.product_id_b
            AND a.canonical_product_id IS NOT NULL
            AND a.canonical_product_id = b.canonical_product_id
        )
    `);

    // Auto-reject confirmed proposals where a product has no canonical or is inactive
    const { rowCount: autoRejected } = await client.query(`
      UPDATE canonical_match_proposals cmp
      SET status = 'rejected', reviewed_by = 'auto-cleanup-no-canonical', reviewed_at = NOW()
      FROM catalog_unified a, catalog_unified b
      WHERE a.id = cmp.product_id_a AND b.id = cmp.product_id_b
        AND cmp.status = 'confirmed'
        AND (a.canonical_product_id IS NULL OR b.canonical_product_id IS NULL
             OR NOT a.is_active OR NOT b.is_active)
    `);

    console.log(`\n── Done ──────────────────────────────────`);
    console.log(`  Merged:           ${merged}`);
    console.log(`  Already same:     ${alreadySame ?? 0} (marked applied)`);
    console.log(`  Auto-rejected:    ${autoRejected ?? 0} (no canonical / inactive)`);
    if (errors.length) {
      console.log(`  Errors:           ${errors.length}`);
      errors.forEach(e => console.log(e));
    }
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
