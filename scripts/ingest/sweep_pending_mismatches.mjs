#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

/**
 * sweep_pending_mismatches.mjs
 *
 * One-time cleanup: checks every currently-'pending' canonical_match_proposal
 * against the same pack-qty / finish mismatch logic used in Phase B
 * (build_canonical_products.mjs) and the admin review UI badges, and
 * auto-rejects any pair that fails. This exists because Phase B's mismatch
 * filter only applies to NEW candidates it generates — proposals that were
 * reopened from 'confirmed'/'applied' back to 'pending' (during the canonical
 * match revert) were never checked against it, so the same bad pairs that
 * caused the original wrong merges would otherwise just sit in the manual
 * review queue waiting to be re-approved by mistake again.
 *
 * Auto-rejected rows are tagged via reviewed_by so they're distinguishable
 * from genuine human review:
 *   reviewed_by = 'auto:pack_qty_mismatch'
 *   reviewed_by = 'auto:finish_mismatch'
 *
 * Defaults to DRY RUN — prints what would be rejected, writes nothing.
 * Pass --apply to actually update the database.
 *
 * Run:
 *   node scripts/ingest/sweep_pending_mismatches.mjs            (dry run)
 *   node scripts/ingest/sweep_pending_mismatches.mjs --apply    (writes rejections)
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL ?? process.env.DATABASE_URL });

const APPLY = process.argv.includes('--apply');

// ─── Mismatch detection (identical to admin UI + Phase B) ─────────────────────

function parsePackQty(name) {
  const patterns = [
    /(\d+)\s*[- ]?pack/i,
    /pack\s*of\s*(\d+)/i,
    /set\s*of\s*(\d+)/i,
    /\((\d+)\)\s*$/,
    /\bx\s*(\d+)\b/i,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 1 && n <= 500) return n;
    }
  }
  return 1;
}

function effectivePackQty(packQty, name) {
  if (packQty && packQty > 1) return packQty;
  return parsePackQty(name);
}

const FINISH_KEYWORDS = [
  'wrinkle black', 'powder coat', 'gunmetal', 'titanium', 'stainless steel',
  'chrome', 'black', 'polished', 'natural', 'satin', 'zinc', 'stainless',
  'brushed', 'anodized', 'smooth', 'machine', 'gloss',
  'matte', 'billet', 'raw', 'silver', 'gold',
];

function parseFinish(name) {
  const lower = name.toLowerCase();
  for (const kw of FINISH_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(APPLY ? '── Sweeping pending proposals (APPLY MODE — will write rejections) ──'
                     : '── Sweeping pending proposals (DRY RUN — nothing will be written) ──');

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        cmp.id,
        a.id AS a_id, a.name AS a_name, a.pack_qty AS a_pack_qty,
        b.id AS b_id, b.name AS b_name, b.pack_qty AS b_pack_qty
      FROM canonical_match_proposals cmp
      JOIN catalog_unified a ON a.id = cmp.product_id_a
      JOIN catalog_unified b ON b.id = cmp.product_id_b
      WHERE cmp.status = 'pending'
    `);

    console.log(`  ${rows.length} pending proposals to check\n`);

    const packQtyRejects = [];
    const finishRejects = [];

    for (const r of rows) {
      const qtyA = effectivePackQty(r.a_pack_qty, r.a_name);
      const qtyB = effectivePackQty(r.b_pack_qty, r.b_name);
      if (qtyA !== qtyB) {
        packQtyRejects.push({ id: r.id, a: r.a_name, b: r.b_name, qtyA, qtyB });
        continue; // pack-qty mismatch already disqualifies it; don't double-count on finish
      }

      const finishA = parseFinish(r.a_name);
      const finishB = parseFinish(r.b_name);
      if (finishA && finishB && finishA !== finishB) {
        finishRejects.push({ id: r.id, a: r.a_name, b: r.b_name, finishA, finishB });
      }
    }

    console.log(`  Pack-qty mismatches found: ${packQtyRejects.length}`);
    for (const p of packQtyRejects.slice(0, 10)) {
      console.log(`    #${p.id}  [${p.qtyA}x] "${p.a}"  vs  [${p.qtyB}x] "${p.b}"`);
    }
    if (packQtyRejects.length > 10) console.log(`    ... and ${packQtyRejects.length - 10} more`);

    console.log(`\n  Finish/color mismatches found: ${finishRejects.length}`);
    for (const f of finishRejects.slice(0, 10)) {
      console.log(`    #${f.id}  [${f.finishA}] "${f.a}"  vs  [${f.finishB}] "${f.b}"`);
    }
    if (finishRejects.length > 10) console.log(`    ... and ${finishRejects.length - 10} more`);

    const totalRejects = packQtyRejects.length + finishRejects.length;
    console.log(`\n  Total to auto-reject: ${totalRejects}`);
    console.log(`  Remaining pending after sweep: ${rows.length - totalRejects}`);

    if (!APPLY) {
      console.log('\n  Dry run only — re-run with --apply to write these rejections.');
      return;
    }

    if (packQtyRejects.length > 0) {
      await client.query(`
        UPDATE canonical_match_proposals
        SET status = 'rejected', reviewed_by = 'auto:pack_qty_mismatch', reviewed_at = NOW()
        WHERE id = ANY($1)
      `, [packQtyRejects.map(p => p.id)]);
    }
    if (finishRejects.length > 0) {
      await client.query(`
        UPDATE canonical_match_proposals
        SET status = 'rejected', reviewed_by = 'auto:finish_mismatch', reviewed_at = NOW()
        WHERE id = ANY($1)
      `, [finishRejects.map(f => f.id)]);
    }

    console.log(`\n  ✓ Applied. ${totalRejects} proposals auto-rejected.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
