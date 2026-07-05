#!/usr/bin/env node
/**
 * generate_brand_part_number_proposals.mjs
 *
 * The existing canonical matching pipeline proposes matches based on
 * OEM number groups only. It never checks brand_part_number, so pairs
 * of products from different vendors carrying the same manufacturer
 * part number — but no clean OEM crossref match — never became a
 * canonical_match_proposals row and sit as duplicate canonical entries
 * forever.
 *
 * This script finds active catalog_unified rows that:
 *   - share a normalized brand_part_number (dashes/spaces stripped, uppercased)
 *   - point to different canonical_product_id values (or one/both null)
 *   - do NOT already have ANY canonical_match_proposals row between them
 *     (regardless of status — we don't want to re-propose something
 *     already reviewed and rejected)
 *
 * and inserts new canonical_match_proposals rows with:
 *   - status = 'pending'   (NOT auto-confirmed — goes through your normal
 *     admin review queue, same as every other proposal)
 *   - match_reason = 'brand_part_number'   (so it's visually distinguishable
 *     from OEM-based proposals in the admin UI / for later analysis)
 *
 * DRY RUN BY DEFAULT. Pass --apply to actually insert.
 *
 * Usage:
 *   node generate_brand_part_number_proposals.mjs           # dry run, prints what would be inserted
 *   node generate_brand_part_number_proposals.mjs --apply   # actually inserts
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

function normalize(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.toUpperCase().replace(/[\s\-]/g, '');
}

async function main() {
  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log(APPLY ? 'MODE: APPLY (will insert rows)' : 'MODE: DRY RUN (no writes)');
    console.log('Pulling active products with a brand_part_number...\n');

    const { rows } = await client.query(`
      SELECT id, sku, brand_part_number, canonical_product_id, source_vendor
      FROM catalog_unified
      WHERE is_active = true
        AND brand_part_number IS NOT NULL
        AND brand_part_number != ''
    `);
    console.log(`Pulled ${rows.length} rows.`);

    // Group by normalized part number
    const groups = new Map();
    for (const r of rows) {
      const norm = normalize(r.brand_part_number);
      if (!norm) continue;
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm).push(r);
    }

    // Filter to groups that actually represent a duplicate-canonical situation
    const candidateGroups = [];
    for (const [norm, members] of groups) {
      if (members.length < 2) continue;
      const canonicalIds = new Set(members.map((m) => m.canonical_product_id ?? null));
      // "different" means more than one distinct value OR at least one null mixed with a real one
      const hasNull = members.some((m) => m.canonical_product_id === null);
      const distinctReal = new Set(members.filter((m) => m.canonical_product_id !== null).map((m) => m.canonical_product_id));
      if (distinctReal.size > 1 || (distinctReal.size >= 1 && hasNull)) {
        candidateGroups.push({ norm, members });
      }
    }
    console.log(`${candidateGroups.length} part-number groups look like unresolved duplicates.\n`);

    // Check existing proposals to avoid re-proposing reviewed pairs
    let toInsert = [];
    let skippedExisting = 0;
    let i = 0;

    for (const { norm, members } of candidateGroups) {
      i++;
      if (i % 500 === 0) console.log(`  ...checked ${i}/${candidateGroups.length}`);

      const ids = members.map((m) => m.id);
      const { rows: existingProposals } = await client.query(
        `SELECT product_id_a, product_id_b FROM canonical_match_proposals
         WHERE product_id_a = ANY($1::int[]) OR product_id_b = ANY($1::int[])`,
        [ids]
      );
      const existingPairs = new Set(
        existingProposals.map((p) => [p.product_id_a, p.product_id_b].sort((a, b) => a - b).join('-'))
      );

      // Propose pairwise between every combination of members not already covered
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          const idA = members[a].id;
          const idB = members[b].id;
          const pairKey = [idA, idB].sort((x, y) => x - y).join('-');
          if (existingPairs.has(pairKey)) {
            skippedExisting++;
            continue;
          }
          const [lo, hi] = [idA, idB].sort((x, y) => x - y);
          toInsert.push({
            norm,
            product_id_a: lo,
            product_id_b: hi,
            sku_a: members[a].sku,
            sku_b: members[b].sku,
            vendor_a: members[a].source_vendor,
            vendor_b: members[b].source_vendor,
          });
        }
      }
    }

    console.log(`\nSkipped (pair already has a proposal, any status): ${skippedExisting}`);
    console.log(`New proposals to ${APPLY ? 'insert' : 'WOULD insert'}: ${toInsert.length}`);

    // Write a CSV either way, so you can review before/after
    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `brand_part_number_proposals_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const headers = ['norm', 'product_id_a', 'product_id_b', 'sku_a', 'sku_b', 'vendor_a', 'vendor_b'];
    const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [headers.join(',')];
    for (const r of toInsert) lines.push(headers.map((h) => esc(r[h])).join(','));
    fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`Written: ${csvPath}`);

    if (!APPLY) {
      console.log('\nDry run only — no rows inserted. Review the CSV, then re-run with --apply.');
      return;
    }

    console.log('\nInserting proposals...');
    let inserted = 0;
    for (const r of toInsert) {
      await client.query(
        `INSERT INTO canonical_match_proposals
           (product_id_a, product_id_b, status, match_reason, created_at)
         VALUES ($1, $2, 'pending', 'brand_part_number', NOW())
         ON CONFLICT DO NOTHING`,
        [r.product_id_a, r.product_id_b]
      );
      inserted++;
      if (inserted % 500 === 0) console.log(`  ...inserted ${inserted}/${toInsert.length}`);
    }
    console.log(`\nDone. Inserted ${inserted} proposals with status='pending', match_reason='brand_part_number'.`);
    console.log('Review and confirm them through the normal admin match-review UI, then run apply/route.ts.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
