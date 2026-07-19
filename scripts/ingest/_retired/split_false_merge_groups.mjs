#!/usr/bin/env node
/**
 * split_false_merge_groups.mjs
 *
 * Splits the 16 CONFIRMED false-merge canonical_products groups
 * (identified by hand from audit_canonical_matches.mjs output —
 * distinct physical parts that got merged onto one canonical entry).
 *
 * SCOPED TIGHTLY ON PURPOSE — only processes this hardcoded list of
 * canonical_product_ids. Does NOT run the "split by normalized value"
 * rule against the full false_merges CSV, because several groups in
 * that CSV are false alarms (branding-prefix differences like "A-24002-70"
 * vs "24002-70" that ARE the same part) and a handful more are genuinely
 * ambiguous and need human judgment before splitting. Only run this
 * against groups you've confirmed are real errors.
 *
 * LOGIC per group:
 *   - Cluster members by EXACT normalized brand_part_number.
 *   - The cluster containing the lowest catalog_unified id keeps the
 *     existing canonical_product_id (minimizes churn / matches the
 *     "keep lower id" convention already used in apply/route.ts).
 *   - Every other cluster gets a NEW canonical_products row, and its
 *     catalog_unified rows get repointed to that new id.
 *
 * IMPORTANT — SCOPE OF WHAT THIS TOUCHES:
 *   - catalog_unified.canonical_product_id  -> updated (this is what
 *     drives which product card a customer sees, so this is the fix
 *     that matters most)
 *   - canonical_products                    -> new rows inserted for
 *     split-off clusters
 *   - product_vendors                        -> NOT touched by this
 *     script. I don't have full visibility into how product_vendors
 *     rows map to individual catalog_unified items (whether it's one
 *     row per vendor-per-canonical or one row per actual item), and
 *     guessing wrong here risks losing vendor/pricing data. Check
 *     product_vendors manually for these 16 canonical_ids after running
 *     this, and let me know its actual schema if it needs a follow-up
 *     script.
 *
 * ASSUMPTION FLAGGED: canonical_sku for new rows is generated as
 * 'CP-' + zero-padded(new_id + 1, 6) based on the pattern observed in
 * every single existing row (id 91071 -> CP-091072, etc). This is
 * inferred from data, not confirmed against a trigger/default definition.
 * The dry run will show you the computed sku before anything is written —
 * check it against how your admin UI actually generates these before
 * trusting it, in case there's a sequence or trigger doing something
 * slightly different.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node split_false_merge_groups.mjs
 *   node split_false_merge_groups.mjs --apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

// The 16 confirmed real-error groups (excludes branding-prefix false
// alarms and the 15 ambiguous groups still awaiting manual review).
const TARGET_CANONICAL_IDS = [
  91312, 92054, 92196, 92207, 92288, 92310, 92415, 92805,
  93022, 94020, 94910, 95364, 95366, 99451, 99501, 114143,
];

// Manual overrides for members with a NULL/missing brand_part_number
// that were confirmed by hand (checked against vtwinmfg.com OEM number)
// to belong to a specific existing cluster, rather than being split off
// as their own singleton canonical entry.
//   84575 (VT-14-0501, "V-Twin Rocker Arm O-Ring") -> OEM No 11101 on
//   the vtwinmfg.com listing matches JGI-11101 exactly. Belongs with
//   DS174290 (id 3612) in the "JGI11101" cluster under group 91312.
const NORMALIZED_KEY_OVERRIDES = {
  84575: 'JGI11101',
};

async function main() {
  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log(APPLY ? 'MODE: APPLY (will insert/update)' : 'MODE: DRY RUN (no writes)');
    console.log(`Processing ${TARGET_CANONICAL_IDS.length} confirmed false-merge groups.\n`);

    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const logRows = [];

    for (const canonicalId of TARGET_CANONICAL_IDS) {
      const { rows: members } = await client.query(
        `SELECT cu.id AS catalog_unified_id, cu.sku, cu.name, cu.brand_part_number,
                cu.source_vendor, cu.canonical_product_id
         FROM catalog_unified cu
         WHERE cu.canonical_product_id = $1 AND cu.is_active = true
         ORDER BY cu.id`,
        [canonicalId]
      );

      if (members.length < 2) {
        console.log(`  [${canonicalId}] Only ${members.length} active member(s) now — skipping (already resolved or changed since audit).`);
        continue;
      }

      const norm = (raw) => (raw ? String(raw).trim().toUpperCase().replace(/[\s-]/g, '') : null);

      const clusters = new Map();
      for (const m of members) {
        const key = NORMALIZED_KEY_OVERRIDES[m.catalog_unified_id]
          ?? norm(m.brand_part_number)
          ?? `__NULL_${m.catalog_unified_id}`;
        if (!clusters.has(key)) clusters.set(key, []);
        clusters.get(key).push(m);
      }

      if (clusters.size < 2) {
        console.log(`  [${canonicalId}] All members share the same normalized part number now — skipping.`);
        continue;
      }

      // Keeper = cluster containing the lowest catalog_unified id
      const clusterList = [...clusters.entries()];
      clusterList.sort((a, b) => {
        const minA = Math.min(...a[1].map((m) => m.catalog_unified_id));
        const minB = Math.min(...b[1].map((m) => m.catalog_unified_id));
        return minA - minB;
      });

      const [keeperKey, keeperMembers] = clusterList[0];
      console.log(`\n  [${canonicalId}] ${clusters.size} distinct part numbers found. Keeper cluster: "${keeperKey}" (${keeperMembers.length} members, stays on ${canonicalId}).`);

      for (let i = 1; i < clusterList.length; i++) {
        const [key, clusterMembers] = clusterList[i];
        console.log(`    Split-off cluster "${key}" (${clusterMembers.length} members): ${clusterMembers.map((m) => `${m.sku}(${m.catalog_unified_id})`).join(', ')}`);

        logRows.push({
          old_canonical_id: canonicalId,
          cluster_key: key,
          member_ids: clusterMembers.map((m) => m.catalog_unified_id).join('|'),
          member_skus: clusterMembers.map((m) => m.sku).join('|'),
        });

        if (!APPLY) continue;

        await client.query('BEGIN');
        try {
          const { rows: seqRows } = await client.query(
            `SELECT pg_get_serial_sequence('canonical_products', 'id') AS seq_name`
          );
          const seqName = seqRows[0].seq_name;
          if (!seqName) {
            throw new Error("Could not resolve sequence for canonical_products.id via pg_get_serial_sequence — check if 'id' is actually a serial/identity column.");
          }

          const { rows: nextIdRows } = await client.query(`SELECT nextval($1) AS new_id`, [seqName]);
          const newId = Number(nextIdRows[0].new_id);
          const newSku = `CP-${String(newId + 1).padStart(6, '0')}`;

          // display_name is NOT NULL with no default — source it from the
          // product name of the lowest-catalog_unified_id member in this
          // split-off cluster (same "keep lowest id" convention used
          // elsewhere in this script and in apply/route.ts).
          const sortedMembers = [...clusterMembers].sort((a, b) => a.catalog_unified_id - b.catalog_unified_id);
          const displayName = sortedMembers[0].name;

          await client.query(
            `INSERT INTO canonical_products (id, canonical_sku, display_name, is_active, match_confidence, created_at, updated_at)
             VALUES ($1, $2, $3, true, 'manual-split', NOW(), NOW())`,
            [newId, newSku, displayName]
          );

          const memberIds = clusterMembers.map((m) => m.catalog_unified_id);
          await client.query(
            `UPDATE catalog_unified SET canonical_product_id = $1 WHERE id = ANY($2::int[])`,
            [newId, memberIds]
          );

          await client.query('COMMIT');
          console.log(`    -> Created new canonical_products id=${newId} sku=${newSku} display_name="${displayName}", repointed ${memberIds.length} catalog_unified rows.`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`    -> FAILED for cluster "${key}" under ${canonicalId}: ${err.message}`);
        }
      }
    }

    const csvPath = path.join(outDir, `split_false_merge_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const headers = ['old_canonical_id', 'cluster_key', 'member_ids', 'member_skus'];
    const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [headers.join(',')];
    for (const r of logRows) lines.push(headers.map((h) => esc(r[h])).join(','));
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`\nWritten: ${csvPath}`);

    if (!APPLY) {
      console.log('\nDry run only — no rows written. Review the split-off clusters above, then re-run with --apply.');
    } else {
      console.log('\nDone. IMPORTANT: product_vendors was NOT touched — check it manually for these 16 canonical_ids.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
