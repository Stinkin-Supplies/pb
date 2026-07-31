#!/usr/bin/env node
/**
 * fix_legacy_variant_duplicate_values.mjs
 *
 * One-off repair for 31 WPS variant groups discovered via a catalog-wide
 * audit, all created 2026-07-19 by the original build_variant_groups.cjs
 * Phase 1 run (predates this session entirely) -- each has the same
 * attribute value repeated across multiple members (e.g. two members both
 * "Black" in one group). Since browse.ts's DISTINCT ON dedup keys on
 * variant_group_id first, every extra same-valued member is currently
 * invisible in browse/search results (not just hidden from a swatch
 * picker) -- a real, live product-visibility bug.
 *
 * Two repair patterns, both scoped by explicit group_id list below (not a
 * general re-scan) since this is a one-time fix for a specific audited set:
 *
 * 1. BLANK_VALUE_FIXES -- 6 members have NO extracted value at all because
 *    the name uses an abbreviation/word outside the recognized vocabulary
 *    ("BLU" for Blue, bare "SATIN" for Satin, neither in ATTRIBUTE_RULES).
 *    These aren't duplicates -- assign the correct value instead of evicting
 *    a real distinct product from the group.
 *
 * 2. Everything else -- true duplicate values. For each (group, value) with
 *    more than one member, keep the lowest product_id and evict the rest
 *    (variant_group_id -> NULL, membership row removed). Evicted rows stay
 *    fully independent, standalone, browsable products -- they're just no
 *    longer part of a variant swatch picker that would have misrepresented
 *    them as identical to another product.
 *
 * Usage:
 *   node scripts/ingest/fix_legacy_variant_duplicate_values.mjs            # dry run
 *   node scripts/ingest/fix_legacy_variant_duplicate_values.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

const TARGET_GROUP_IDS = [1,2,3,4,5,6,244,245,284,412,500,520,577,607,670,695,697,698,785,818,991,1081,1142,1186,1187,6747,6772,6776,6777,6778,6779];

// product_id -> corrected value, for the blank-value members identified by audit
const BLANK_VALUE_FIXES = {
  41912: 'Blue',  // WPS-693-9620BU, "...BLU" abbreviation not in Color regex
  42686: 'Satin', // WPS-827-05062, bare "SATIN" not in Finish/Color regex
  42777: 'Satin', // WPS-827-05385
  44283: 'Satin', // WPS-827-05388
  44292: 'Satin', // WPS-827-05391
  43139: 'Satin', // WPS-827-05382
};

async function main() {
  const members = await q(`
    SELECT cvm.id AS member_id, cvm.group_id, cvm.product_id, cvm.option_1_value, cu.sku, cu.name
    FROM catalog_variant_members cvm
    JOIN catalog_unified cu ON cu.id = cvm.product_id
    WHERE cvm.group_id = ANY($1::int[])
    ORDER BY cvm.group_id, cu.id
  `, [TARGET_GROUP_IDS]);

  console.log(`${members.length} members across ${TARGET_GROUP_IDS.length} target groups\n`);

  // Apply blank-value corrections first so the dedup pass below sees the
  // real value, not a blank.
  console.log('=== Blank-value corrections ===');
  for (const m of members) {
    if (BLANK_VALUE_FIXES[m.product_id]) {
      console.log(`  ${m.sku}  "${m.name}"  (blank) -> "${BLANK_VALUE_FIXES[m.product_id]}"`);
      if (APPLY) {
        await q(`UPDATE catalog_variant_members SET option_1_value = $1 WHERE id = $2`, [BLANK_VALUE_FIXES[m.product_id], m.member_id]);
      }
      m.option_1_value = BLANK_VALUE_FIXES[m.product_id]; // reflect locally for the dedup pass below
    }
  }

  // Group by (group_id, value), evict all but the lowest product_id per bucket
  const byBucket = new Map();
  for (const m of members) {
    if (!m.option_1_value) continue; // any still-blank member (shouldn't be any) left alone
    const key = `${m.group_id}|${m.option_1_value}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(m);
  }

  const toEvict = [];
  for (const [, bucket] of byBucket) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => a.product_id - b.product_id);
    const [keep, ...extras] = bucket;
    console.log(`\n  KEEP  group ${keep.group_id}  ${keep.option_1_value}  ${keep.sku}  "${keep.name}"`);
    for (const e of extras) {
      console.log(`  EVICT group ${e.group_id}  ${e.option_1_value}  ${e.sku}  "${e.name}"`);
      toEvict.push(e);
    }
  }

  console.log(`\n${APPLY ? 'Evicting' : 'Would evict'} ${toEvict.length} duplicate-value members (returned to standalone, fully visible independently)`);
  console.log(`${APPLY ? 'Fixed' : 'Would fix'} ${Object.keys(BLANK_VALUE_FIXES).length} blank-value members`);

  if (!APPLY) { await pool.end(); return; }

  await pool.query('BEGIN');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_unified_backup_legacy_variant_dupfix_20260730 AS
      SELECT id, variant_group_id FROM catalog_unified WHERE id = ANY($1::int[])
    `, [toEvict.map(e => e.product_id)]);

    for (const e of toEvict) {
      await pool.query(`DELETE FROM catalog_variant_members WHERE id = $1`, [e.member_id]);
      await pool.query(`UPDATE catalog_unified SET variant_group_id = NULL, updated_at = now() WHERE id = $1`, [e.product_id]);
    }
    await pool.query('COMMIT');
    console.log('\nCommitted.');
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Rolled back:', err);
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
