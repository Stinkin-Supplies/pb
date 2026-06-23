#!/usr/bin/env node
/**
 * build_pack_size_groups.mjs
 *
 * Reads unresolved catalog_variant_candidates and creates Pack Size variant groups
 * for product sets that differ only in pack quantity (1-pack vs 5-pack vs 10-pack etc).
 *
 * Usage:
 *   node build_pack_size_groups.mjs              # dry run (candidates source)
 *   node build_pack_size_groups.mjs --apply      # write candidates-based groups
 *   node build_pack_size_groups.mjs --canonical  # dry run (canonical_product_id source)
 *   node build_pack_size_groups.mjs --canonical --apply  # write canonical-based groups
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const DRY_RUN       = !process.argv.includes('--apply');
const CANONICAL_MODE = process.argv.includes('--canonical');

// Strip pack-size suffixes from WPS names to get a clean display name.
function stripPackSuffix(name) {
  return name
    .replace(/\s+\d+\s*\/\s*pk\b.*/i, '')
    .replace(/\s+\d+\s*pk\b.*/i, '')
    .replace(/\s+\d+[- ]?pack\b.*/i, '')
    .trim();
}

// Prefer PU name (usually cleaner title-case), fall back to first product.
function bestDisplayName(products) {
  const pu = products.find(p => p.source_vendor === 'PU');
  const base = pu || products[0];
  return stripPackSuffix(base.name);
}

// Deduplicate products by pack_qty — keep PU as representative, then first by id.
// Prevents two "1" buttons when both PU and VTwin have pack_qty=1.
function dedupByPackQty(products) {
  const seen = new Map();
  for (const p of products) {
    const qty = Number(p.pack_qty) || 1;
    if (!seen.has(qty)) {
      seen.set(qty, p);
    } else if (p.source_vendor === 'PU') {
      // PU wins over any other vendor already in the slot
      seen.set(qty, p);
    }
  }
  return [...seen.values()].sort((a, b) => (Number(a.pack_qty) || 1) - (Number(b.pack_qty) || 1));
}

// ── CANONICAL MODE ──────────────────────────────────────────────────────────
async function buildFromCanonicals(client) {
  console.log(`\n🔗 Mode: canonical-based pack size groups — ${DRY_RUN ? 'DRY RUN' : '⚠️  APPLYING'}\n`);

  const { rows: groups } = await client.query(`
    SELECT
      cu.canonical_product_id,
      array_agg(cu.id ORDER BY COALESCE(cu.pack_qty,1) ASC) AS product_ids
    FROM catalog_unified cu
    WHERE cu.is_active = true
      AND cu.canonical_product_id IN (
        SELECT canonical_product_id FROM catalog_unified
        WHERE is_active = true AND pack_qty > 1 AND source_vendor = 'WPS'
      )
    GROUP BY cu.canonical_product_id
    HAVING COUNT(*) FILTER (WHERE cu.pack_qty > 1) > 0
       AND COUNT(*) FILTER (WHERE COALESCE(cu.pack_qty,1) = 1) > 0
  `);

  console.log(`📦 ${groups.length} canonical-based groups found\n`);

  // Always preview
  for (const g of groups.slice(0, 10)) {
    const { rows: products } = await client.query(`
      SELECT id, internal_sku, name, pack_qty, source_vendor, computed_price::numeric AS price
      FROM catalog_unified WHERE id = ANY($1::int[]) ORDER BY COALESCE(pack_qty,1) ASC
    `, [g.product_ids]);
    const deduped = dedupByPackQty(products);
    const skipped = products.length - deduped.length;
    console.log(`   [canonical:${g.canonical_product_id}] "${bestDisplayName(products)}"${skipped > 0 ? ` (${skipped} dup pack_qty skipped)` : ''}`);
    for (const p of deduped) {
      console.log(`     ${p.source_vendor.padEnd(6)} ${p.internal_sku.padEnd(16)} ${String(p.pack_qty ?? 1).padEnd(4)}pk  $${Number(p.price).toFixed(2)}`);
    }
  }
  if (groups.length > 10) console.log(`\n   ... and ${groups.length - 10} more`);
  console.log();

  if (DRY_RUN) {
    console.log(`⚠️  DRY RUN — pass --canonical --apply to create ${groups.length} groups.\n`);
    return;
  }

  let created = 0;
  let synced  = 0;
  let evicted = 0;
  const errors = [];

  for (const g of groups) {
    try {
      const { rows: products } = await client.query(`
        SELECT id, internal_sku, name, pack_qty, source_vendor, computed_price::numeric AS price
        FROM catalog_unified WHERE id = ANY($1::int[]) AND is_active = true
        ORDER BY COALESCE(pack_qty,1) ASC
      `, [g.product_ids]);

      if (products.length < 2) continue;

      const members = dedupByPackQty(products);
      if (members.length < 2) continue;

      const desiredIds  = new Set(members.map(p => p.id));
      const displayName = bestDisplayName(products);
      const familyKey   = `canonical:${g.canonical_product_id}`;

      await client.query('BEGIN');

      // ── Create or reuse group ────────────────────────────────────────────────
      const { rows: existing } = await client.query(
        `SELECT id FROM catalog_variant_groups WHERE family_key = $1 LIMIT 1`,
        [familyKey]
      );

      let groupId;
      if (existing.length > 0) {
        groupId = existing[0].id;
        synced++;
      } else {
        const { rows: [newGroup] } = await client.query(`
          INSERT INTO catalog_variant_groups (display_name, source_vendor, family_key)
          VALUES ($1, 'MULTI', $2)
          RETURNING id
        `, [displayName, familyKey]);
        groupId = newGroup.id;
        created++;
      }

      // ── Evict stale members (no longer in desired set after dedup) ───────────
      // Covers: duplicate pack_qty losers, products that became inactive,
      // vendor changes that shifted the representative.
      const { rows: currentMembers } = await client.query(
        `SELECT product_id FROM catalog_variant_members WHERE group_id = $1`,
        [groupId]
      );
      const staleIds = currentMembers
        .map(r => r.product_id)
        .filter(id => !desiredIds.has(id));

      if (staleIds.length > 0) {
        await client.query(
          `DELETE FROM catalog_variant_members WHERE group_id = $1 AND product_id = ANY($2::int[])`,
          [groupId, staleIds]
        );
        await client.query(
          `UPDATE catalog_unified SET variant_group_id = NULL WHERE id = ANY($1::int[])`,
          [staleIds]
        );
        evicted += staleIds.length;
      }

      // ── Upsert desired members ───────────────────────────────────────────────
      for (let i = 0; i < members.length; i++) {
        const p = members[i];
        const packQty = Number(p.pack_qty) || 1;

        await client.query(`
          INSERT INTO catalog_variant_members
            (group_id, product_id, option_1_name, option_1_value, sort_order)
          VALUES ($1, $2, 'Pack Size', $3, $4)
          ON CONFLICT (group_id, product_id) DO UPDATE
            SET option_1_name  = EXCLUDED.option_1_name,
                option_1_value = EXCLUDED.option_1_value,
                sort_order     = EXCLUDED.sort_order
        `, [groupId, p.id, String(packQty), i]);

        await client.query(
          `UPDATE catalog_unified SET variant_group_id = $1 WHERE id = $2`,
          [groupId, p.id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      errors.push(`canonical:${g.canonical_product_id} — ${err.message}`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Groups created: ${created}`);
  console.log(`   Groups synced:  ${synced}`);
  console.log(`   Members evicted (stale): ${evicted}`);
  console.log(`   Errors:         ${errors.length}`);
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const e of errors) console.log(`   ${e}`);
  }

  const { rows: [gc] } = await client.query(
    `SELECT COUNT(*) AS groups FROM catalog_variant_groups WHERE source_vendor = 'MULTI'`
  );
  console.log(`\n   catalog_variant_groups (MULTI): ${gc.groups} total\n`);
}

// ── CANDIDATES MODE ─────────────────────────────────────────────────────────
async function buildFromCandidates(client) {
  console.log(`\n📦 Build Pack Size Variant Groups — ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : '⚠️  APPLYING'}\n`);

  const { rows: candidates } = await client.query(`
    SELECT id, group_key, product_ids, reason, notes
    FROM catalog_variant_candidates
    WHERE resolved = false
    ORDER BY array_length(product_ids, 1) DESC, id ASC
  `);

  console.log(`🔍 ${candidates.length} unresolved candidates to evaluate\n`);

  const packGroups   = [];
  const skippedOther = [];

  for (const candidate of candidates) {
    const { rows: products } = await client.query(`
      SELECT id, internal_sku, name, pack_qty, source_vendor,
             computed_price::numeric AS price
      FROM catalog_unified
      WHERE id = ANY($1::int[])
        AND is_active = true
      ORDER BY COALESCE(pack_qty, 1) ASC, id ASC
    `, [candidate.product_ids]);

    if (products.length < 2) {
      skippedOther.push({ candidate, reason: 'fewer than 2 active products' });
      continue;
    }

    const qtys = products.map(p => Number(p.pack_qty) || 1);
    const distinctQtys = [...new Set(qtys)].sort((a, b) => a - b);
    const maxQty = Math.max(...qtys);

    if (maxQty <= 1) {
      skippedOther.push({ candidate, reason: 'all pack_qty = 1' });
      continue;
    }

    const hasDuplicateQtys = distinctQtys.length < products.length;

    packGroups.push({
      candidate,
      products,
      qtys,
      distinctQtys,
      hasDuplicateQtys,
      displayName: bestDisplayName(products),
    });
  }

  const cleanGroups     = packGroups.filter(g => !g.hasDuplicateQtys);
  const ambiguousGroups = packGroups.filter(g => g.hasDuplicateQtys);

  console.log(`📊 Summary:`);
  console.log(`   ✅ Clean pack-size groups (will build):   ${cleanGroups.length}`);
  console.log(`   ⚠️  Ambiguous (duplicate qtys, skip):     ${ambiguousGroups.length}`);
  console.log(`   ⏭️  Not pack-size groups (skip):          ${skippedOther.length}`);
  console.log();

  if (ambiguousGroups.length > 0) {
    console.log('⚠️  Ambiguous groups:');
    for (const g of ambiguousGroups) {
      console.log(`   [${g.candidate.group_key}] "${g.displayName}"`);
      for (const p of g.products) {
        console.log(`     ${p.source_vendor.padEnd(6)} ${p.internal_sku.padEnd(16)} pack_qty=${String(p.pack_qty ?? 1).padEnd(4)} $${Number(p.price).toFixed(2)}`);
      }
    }
    console.log();
  }

  if (cleanGroups.length === 0) {
    console.log('No clean pack-size groups to create.');
    return;
  }

  console.log(`📋 Clean groups preview (first 10):`);
  for (const g of cleanGroups.slice(0, 10)) {
    console.log(`\n   [${g.candidate.group_key}] "${g.displayName}"`);
    for (const p of g.products) {
      console.log(`     ${p.source_vendor.padEnd(6)} ${p.internal_sku.padEnd(16)} ${String(p.pack_qty ?? 1).padEnd(4)}pk  $${Number(p.price).toFixed(2)}`);
    }
  }
  if (cleanGroups.length > 10) console.log(`\n   ... and ${cleanGroups.length - 10} more`);
  console.log();

  if (DRY_RUN) {
    console.log(`⚠️  DRY RUN — pass --apply to create ${cleanGroups.length} variant groups.\n`);
    return;
  }

  let created = 0;
  let skippedExisting = 0;
  const errors = [];

  for (const g of cleanGroups) {
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        `SELECT id FROM catalog_variant_groups WHERE family_key = $1 LIMIT 1`,
        [g.candidate.group_key]
      );

      let groupId;
      if (existing.length > 0) {
        groupId = existing[0].id;
        skippedExisting++;
      } else {
        const { rows: [newGroup] } = await client.query(`
          INSERT INTO catalog_variant_groups (display_name, source_vendor, family_key)
          VALUES ($1, 'MULTI', $2)
          RETURNING id
        `, [g.displayName, g.candidate.group_key]);
        groupId = newGroup.id;
        created++;
      }

      for (let i = 0; i < g.products.length; i++) {
        const product = g.products[i];
        const packQty = Number(product.pack_qty) || 1;

        await client.query(`
          INSERT INTO catalog_variant_members
            (group_id, product_id, option_1_name, option_1_value, sort_order)
          VALUES ($1, $2, 'Pack Size', $3, $4)
          ON CONFLICT (group_id, product_id) DO UPDATE
            SET option_1_name  = EXCLUDED.option_1_name,
                option_1_value = EXCLUDED.option_1_value,
                sort_order     = EXCLUDED.sort_order
        `, [groupId, product.id, String(packQty), i]);

        await client.query(`
          UPDATE catalog_unified SET variant_group_id = $1 WHERE id = $2
        `, [groupId, product.id]);
      }

      await client.query(`
        UPDATE catalog_variant_candidates
        SET resolved = true, resolved_at = NOW(),
            notes = COALESCE(notes || ' | ', '') || 'pack_size_group:' || $2
        WHERE id = $1
      `, [g.candidate.id, groupId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      errors.push(`[${g.candidate.group_key}] ${err.message}`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Groups created:          ${created}`);
  console.log(`   Groups already existed:  ${skippedExisting}`);
  console.log(`   Errors:                  ${errors.length}`);
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const e of errors) console.log(`   ${e}`);
  }

  const { rows: [counts] } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE resolved = false) AS still_pending,
      COUNT(*) FILTER (WHERE resolved = true)  AS resolved
    FROM catalog_variant_candidates
  `);
  console.log(`\n   catalog_variant_candidates: ${counts.resolved} resolved / ${counts.still_pending} still pending`);

  const { rows: [gc] } = await client.query(
    `SELECT COUNT(*) AS groups FROM catalog_variant_groups WHERE source_vendor = 'MULTI'`
  );
  console.log(`   catalog_variant_groups (MULTI): ${gc.groups} total\n`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    if (CANONICAL_MODE) {
      await buildFromCanonicals(client);
    } else {
      await buildFromCandidates(client);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
