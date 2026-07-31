#!/usr/bin/env node
/**
 * merge_split_variant_groups_ridinggear.mjs
 *
 * build_variant_groups_wps_apparel.mjs only ever creates NEW groups for
 * rows that were still variant_group_id IS NULL -- it never merges into a
 * pre-existing group. Turns out Phase 1 (wps_product_id-based grouping in
 * build_variant_groups.cjs) had already partially grouped ~277 WPS Riding
 * Gear & Apparel product lines (usually 2-3 of their sizes, the ones that
 * happened to share a wps_product_id), leaving the rest for the new script
 * to group separately. Net result: 277 product lines now show as TWO
 * variant groups instead of one (e.g. "Covert X Open-Face Helmet Kalavera"
 * split into group 992 {2X, LG, XL} and group 7318 {MD, SM}).
 *
 * This finds every (brand, size-stripped-name) with more than one distinct
 * variant_group_id among active WPS Riding Gear & Apparel rows and merges
 * them into a single group (the lowest/oldest id survives).
 *
 * Usage:
 *   node scripts/ingest/merge_split_variant_groups_ridinggear.mjs            # dry run
 *   node scripts/ingest/merge_split_variant_groups_ridinggear.mjs --apply    # live write
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

async function main() {
  const clusters = await q(`
    WITH stripped AS (
      SELECT id, variant_group_id, brand,
        regexp_replace(upper(name), '\\s+(4XL|3XL|2XL|XXL|2X|3X|4X|5X|XL|LG|MD|SM|XS)\\s*$', '') AS base
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Riding Gear & Apparel'
        AND source_vendor = 'WPS' AND variant_group_id IS NOT NULL
    )
    SELECT brand, base, array_agg(DISTINCT variant_group_id ORDER BY variant_group_id) AS group_ids
    FROM stripped
    GROUP BY brand, base
    HAVING count(DISTINCT variant_group_id) > 1
    ORDER BY brand, base
  `);

  console.log(`${clusters.length} product lines split across multiple groups\n`);

  let merged = 0, membersMoved = 0, skippedDuplicate = 0;
  for (const c of clusters) {
    const [survivor, ...losers] = c.group_ids;
    if (c.group_ids.length !== 2) {
      console.log(`  ⚠ SKIPPING "${c.base}" (${c.brand}) — ${c.group_ids.length} groups, not 2: [${c.group_ids.join(',')}] — needs manual review`);
      continue;
    }

    // Guard against merging two groups whose UNION has a repeated attribute
    // value -- found live in the catalog-wide pass: two individually-clean
    // groups can each be fine alone but turn out to be genuinely different
    // duplicate-SKU products sharing one name, not real variant siblings of
    // each other. Merging them then creates a bogus group with the same
    // size/color appearing twice.
    const allValues = await q(`SELECT option_1_value FROM catalog_variant_members WHERE group_id = ANY($1::int[])`, [c.group_ids]);
    const nonNull = allValues.map(r => r.option_1_value).filter(Boolean);
    if (new Set(nonNull).size !== nonNull.length) {
      console.log(`  ⚠ SKIPPING "${c.base}" (${c.brand}) — merging [${c.group_ids.join(',')}] would create duplicate attribute values`);
      skippedDuplicate++;
      continue;
    }

    console.log(`  merge ${losers.join(',')} -> ${survivor}   "${c.base}" (${c.brand})`);

    if (!APPLY) continue;

    for (const loserId of losers) {
      // Re-parent members. ON CONFLICT DO NOTHING guards the rare case where
      // the same product_id somehow already has a row under the survivor
      // group (shouldn't happen -- a product has one variant_group_id -- but
      // cheap insurance against the unique constraint).
      const moved = await q(`
        UPDATE catalog_variant_members SET group_id = $1
        WHERE group_id = $2
          AND product_id NOT IN (SELECT product_id FROM catalog_variant_members WHERE group_id = $1)
        RETURNING id
      `, [survivor, loserId]);
      membersMoved += moved.length;

      // Any members that couldn't move (product_id collision) just get
      // dropped from the loser group before we delete it.
      await q(`DELETE FROM catalog_variant_members WHERE group_id = $1`, [loserId]);

      await q(`UPDATE catalog_unified SET variant_group_id = $1, updated_at = now() WHERE variant_group_id = $2`, [survivor, loserId]);
      await q(`DELETE FROM catalog_variant_groups WHERE id = $1`, [loserId]);
    }
    merged++;
  }

  console.log(`\n${APPLY ? 'Merged' : 'Would merge'}: ${merged} group pairs, ${membersMoved} members re-parented (${skippedDuplicate} skipped as would-be-duplicate)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
