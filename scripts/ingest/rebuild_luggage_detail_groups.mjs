#!/usr/bin/env node
/**
 * rebuild_luggage_detail_groups.mjs
 *
 * Retroactive application of the session-89 "General bucket policy" to
 * Saddlebags, Sissy Bars & Luggage (completed in session 89, before the
 * policy existed):
 *   1. Rename the 95-row "General" catch-all -> "Bags, Packs & Duffels"
 *      (sampled content: almost entirely tank bags/tail bags/duffels/
 *      backpacks/roll bags -- soft travel bags distinct from Saddlebags).
 *   2. Add display_subcategory_detail groupings to every bucket over
 *      ~150 rows: Sissy Bars Sideplates & Hardware (492), Saddlebags Lids
 *      & Covers (340), Sissy Bar Pads & Bags (219), Luggage Racks (214),
 *      Saddlebag Latches Mounts & Hardware (173).
 *
 * Usage:
 *   node scripts/ingest/rebuild_luggage_detail_groups.mjs            # dry run
 *   node scripts/ingest/rebuild_luggage_detail_groups.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Saddlebags, Sissy Bars & Luggage';

const GENERAL_RENAME = { from: 'General', to: 'Bags, Packs & Duffels' };

// Ordered rule lists per subcategory -- first match wins.
const DETAIL_RULES = {
  'Sissy Bars, Sideplates & Hardware': [
    [/backrests?|docking kit.*backrest/i, 'Detachable Backrests'],
    [/side ?plates?|docking hardware|latch kit|bushings?/i, 'Side Plates & Docking Hardware'],
    [/luggage rack/i, 'Sissy Bar + Rack Combos'],
    [/sticks?|inserts?|medallion/i, 'Sticks & Inserts'],
    [/sissy ?bar|arm chair|hand ?rail/i, 'Complete Sissy Bars'],
  ],
  'Saddlebags, Lids & Covers': [
    [/lids?\b/i, 'Lids & Lid Hardware'],
    [/covers?\b/i, 'Covers & Rain Gear'],
    [/liners?\b/i, 'Liners'],
    [/latch(es)?|locks?/i, 'Latches & Locks'],
    [/trim|led lamp/i, 'Trim & Lighting Accessories'],
    [/swing ?arm bag|tool pouch|multi-use pouch/i, 'Swing Arm Bags & Pouches'],
    [/brackets?|grommets?|bumpers?|rivets?|hinges?|backing plate|guide plate|wear plates?|seal set|strike set|tether set|studs?|bolt kit|fasteners?|receptacles?|clip kit/i, 'Mounting Hardware & Fasteners'],
    [/slant|ranger|fleetside|warrior|raptor|throw-?over|cowhide|leather|cordura|composite|deluxe|braided|studded/i, 'Soft & Leather Saddlebags'],
    [/saddlebags?|side case|top case/i, 'Complete Saddlebags & Cases'],
  ],
  'Sissy Bar Pads & Bags': [
    [/pads?\b/i, 'Sissy Bar Pads'],
    [/bags?\b/i, 'Sissy Bar Bags'],
    [/brackets?/i, 'Pad Mounting Hardware'],
  ],
  'Luggage Racks': [
    [/docking hardware|bushings?/i, 'Docking Hardware'],
    [/detach|docking|two-up|quick detach/i, 'Detachable & Docking Racks'],
    [/cover dock|lift kit|tour box mount|nets?\b/i, 'Rack Accessories'],
    [/luggage rack|racks?\b/i, 'Fixed Luggage Racks'],
  ],
  'Saddlebag Latches, Mounts & Hardware': [
    [/latch(es)?|locks?/i, 'Latches & Locks'],
    [/docking hardware|bushing/i, 'Docking Hardware'],
    [/support|brackets?|rails?\b|bareback/i, 'Support Brackets & Rails'],
    [/mounts?|hardware kit|fastener|yoke/i, 'Mounting Kits'],
  ],
};

function classify(name, rules) {
  for (const [re, label] of rules) {
    if (re.test(name)) return label;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    // ── Part 1: General -> Bags, Packs & Duffels ────────────────────────
    const genRes = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
      [CAT, GENERAL_RENAME.from]
    );
    console.log(`\n[General rename] ${genRes.rows.length} rows: "${GENERAL_RENAME.from}" -> "${GENERAL_RENAME.to}"`);

    // ── Part 2: detail groupings ─────────────────────────────────────────
    const detailPlan = {}; // subcategory -> { label -> count }
    const detailUpdates = []; // { id, label }

    for (const [subcat, rules] of Object.entries(DETAIL_RULES)) {
      const res = await client.query(
        `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
        [CAT, subcat]
      );
      const tally = {};
      let stragglers = 0;
      for (const row of res.rows) {
        const label = classify(row.name, rules);
        if (label) {
          tally[label] = (tally[label] || 0) + 1;
          detailUpdates.push({ id: row.id, label });
        } else {
          stragglers++;
        }
      }
      detailPlan[subcat] = { total: res.rows.length, tally, stragglers };
    }

    console.log('\n=== Detail grouping plan ===');
    for (const [subcat, plan] of Object.entries(detailPlan)) {
      console.log(`\n${subcat} (${plan.total} total)`);
      for (const [label, count] of Object.entries(plan.tally).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${label}: ${count}`);
      }
      console.log(`  (ungrouped stragglers): ${plan.stragglers}`);
    }

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');

    const renameResult = await client.query(
      `UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = $2 AND display_subcategory = $3`,
      [GENERAL_RENAME.to, CAT, GENERAL_RENAME.from]
    );
    console.log(`\nRenamed ${renameResult.rowCount} rows.`);

    let updated = 0;
    for (const { id, label } of detailUpdates) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`,
        [label, id]
      );
      updated++;
    }
    console.log(`Applied display_subcategory_detail to ${updated} rows.`);

    await client.query('COMMIT');
    console.log('\nCommitted.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
