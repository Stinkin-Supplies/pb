#!/usr/bin/env node
/**
 * link_orphaned_oem_crossref.mjs
 *
 * Fixes the ~17,150 catalog_oem_crossref rows with product_id IS NULL
 * (found via test_orphan_crossref_matching.mjs) by assigning the correct
 * product_id, using a priority-ordered set of matching strategies:
 *
 *   1. exact sku = cu.sku                     (most reliable — direct match)
 *   2. normalized sku vs normalized cu.sku     (dash/space/case differences only)
 *   3. VT- prefix added = cu.sku               (VTwin bare-number format)
 *   4. exact sku = cu.vendor_sku
 *   5. normalized sku vs normalized cu.vendor_sku
 *   6. oem_number found in cu.oem_numbers[]    (least specific — an OEM
 *      number can legitimately apply to multiple superseded/compatible
 *      parts, so this is the fallback, not the first resort)
 *
 * For each orphaned row, tries strategies in this order and assigns
 * product_id from the FIRST strategy that yields EXACTLY ONE candidate
 * product. If a strategy matches multiple distinct products, that
 * strategy is skipped for this row (ambiguous) and the next one is tried.
 * If NO strategy yields a unique match, the row is left unlinked and
 * reported separately — never guessed at.
 *
 * Every linked row is tagged with WHICH strategy resolved it (printed +
 * in the CSV), so this is fully auditable/reversible after the fact.
 *
 * `eastern` rows are deliberately not targeted here — the matching test
 * showed only ~5% recoverable (consistent with session 68's finding that
 * Eastern's numbering doesn't map cleanly to anything else you have) —
 * use --source=eastern explicitly if you want to attempt it anyway.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node scripts/ingest/link_orphaned_oem_crossref.mjs
 *   node scripts/ingest/link_orphaned_oem_crossref.mjs --source=vtwin_scrape
 *   node scripts/ingest/link_orphaned_oem_crossref.mjs --apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

const { Pool } = pg;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sourceArg = args.find((a) => a.startsWith('--source='));
const SOURCE_FILTER = sourceArg ? sourceArg.split('=')[1] : null;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local/.env at the project root.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Priority order: most reliable first. Skips 'eastern' by default unless
// explicitly requested via --source=eastern.
const STRATEGIES = [
  {
    name: 'exact_sku',
    sql: `
      SELECT oc.id AS crossref_id, array_agg(DISTINCT cu.id) AS candidates
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON cu.sku = oc.sku
      WHERE oc.product_id IS NULL
        ${SOURCE_FILTER ? 'AND COALESCE(oc.source, \'(null)\') = $1' : "AND COALESCE(oc.source, '(null)') != 'eastern'"}
      GROUP BY oc.id
    `,
  },
  {
    name: 'normalized_sku',
    sql: `
      SELECT oc.id AS crossref_id, array_agg(DISTINCT cu.id) AS candidates
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu
        ON upper(regexp_replace(cu.sku, '[\\s-]', '', 'g')) = upper(regexp_replace(oc.sku, '[\\s-]', '', 'g'))
      WHERE oc.product_id IS NULL
        ${SOURCE_FILTER ? 'AND COALESCE(oc.source, \'(null)\') = $1' : "AND COALESCE(oc.source, '(null)') != 'eastern'"}
      GROUP BY oc.id
    `,
  },
  {
    name: 'vt_prefix_sku',
    sql: `
      SELECT oc.id AS crossref_id, array_agg(DISTINCT cu.id) AS candidates
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON cu.sku = ('VT-' || oc.sku)
      WHERE oc.product_id IS NULL
        ${SOURCE_FILTER ? 'AND COALESCE(oc.source, \'(null)\') = $1' : "AND COALESCE(oc.source, '(null)') != 'eastern'"}
      GROUP BY oc.id
    `,
  },
  {
    name: 'exact_vendor_sku',
    sql: `
      SELECT oc.id AS crossref_id, array_agg(DISTINCT cu.id) AS candidates
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON cu.vendor_sku = oc.sku
      WHERE oc.product_id IS NULL
        ${SOURCE_FILTER ? 'AND COALESCE(oc.source, \'(null)\') = $1' : "AND COALESCE(oc.source, '(null)') != 'eastern'"}
      GROUP BY oc.id
    `,
  },
  {
    name: 'normalized_vendor_sku',
    sql: `
      SELECT oc.id AS crossref_id, array_agg(DISTINCT cu.id) AS candidates
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu
        ON upper(regexp_replace(cu.vendor_sku, '[\\s-]', '', 'g')) = upper(regexp_replace(oc.sku, '[\\s-]', '', 'g'))
      WHERE oc.product_id IS NULL
        ${SOURCE_FILTER ? 'AND COALESCE(oc.source, \'(null)\') = $1' : "AND COALESCE(oc.source, '(null)') != 'eastern'"}
      GROUP BY oc.id
    `,
  },
  {
    name: 'oem_number_in_array',
    sql: `
      SELECT oc.id AS crossref_id, array_agg(DISTINCT cu.id) AS candidates
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON oc.oem_number = ANY(cu.oem_numbers)
      WHERE oc.product_id IS NULL
        ${SOURCE_FILTER ? 'AND COALESCE(oc.source, \'(null)\') = $1' : "AND COALESCE(oc.source, '(null)') != 'eastern'"}
      GROUP BY oc.id
    `,
  },
];

async function main() {
  console.log(APPLY ? 'MODE: APPLY (will update)' : 'MODE: DRY RUN (no writes)');
  if (SOURCE_FILTER) console.log(`Filtering to source = "${SOURCE_FILTER}"`);

  const params = SOURCE_FILTER ? [SOURCE_FILTER] : [];

  // candidateMaps[strategyName] = Map(crossref_id -> [product_ids])
  const candidateMaps = {};
  for (const s of STRATEGIES) {
    const { rows } = await pool.query(s.sql, params);
    const map = new Map();
    for (const r of rows) map.set(r.crossref_id, r.candidates);
    candidateMaps[s.name] = map;
    console.log(`  loaded ${map.size} candidate rows for strategy "${s.name}"`);
  }

  // Union of all crossref_ids seen by any strategy
  const allIds = new Set();
  for (const s of STRATEGIES) for (const id of candidateMaps[s.name].keys()) allIds.add(id);

  // Independently query the FULL target set (all orphaned rows matching the
  // filter), so rows with literally zero candidates across every strategy
  // don't silently vanish from both outputs.
  const { rows: targetRows } = await pool.query(
    `SELECT id FROM catalog_oem_crossref
     WHERE product_id IS NULL
       ${SOURCE_FILTER ? "AND COALESCE(source, '(null)') = $1" : "AND COALESCE(source, '(null)') != 'eastern'"}`,
    params
  );
  const targetIds = new Set(targetRows.map((r) => r.id));
  console.log(`\nTotal target rows (should equal resolved + unresolved below): ${targetIds.size}`);

  const resolved = [];
  const unresolved = [];

  for (const crossrefId of targetIds) {
    let picked = null;
    for (const s of STRATEGIES) {
      const candidates = candidateMaps[s.name].get(crossrefId);
      if (candidates && candidates.length === 1) {
        picked = { productId: candidates[0], via: s.name };
        break;
      }
    }
    if (picked) {
      resolved.push({ crossrefId, productId: picked.productId, via: picked.via });
    } else {
      // Collect what we saw across strategies for the review CSV — an
      // empty attempts array here means ZERO candidates from ANY strategy,
      // not just ambiguity.
      const attempts = STRATEGIES
        .map((s) => ({ strategy: s.name, candidates: candidateMaps[s.name].get(crossrefId) ?? null }))
        .filter((a) => a.candidates !== null);
      unresolved.push({ crossrefId, attempts, zeroCandidates: attempts.length === 0 });
    }
  }

  const zeroCandidateCount = unresolved.filter((u) => u.zeroCandidates).length;
  console.log(`  ...of which ${zeroCandidateCount} had ZERO candidates from any strategy (not just ambiguous)`);

  console.log(`\nResolved: ${resolved.length}  |  Unresolved: ${unresolved.length}  |  Sum: ${resolved.length + unresolved.length} (should equal target rows above)\n`);
  if (resolved.length + unresolved.length !== targetIds.size) {
    console.warn('⚠️  MISMATCH — resolved+unresolved does not equal target row count. Something is still off, do not trust these results yet.');
  }

  const byStrategy = {};
  for (const r of resolved) byStrategy[r.via] = (byStrategy[r.via] ?? 0) + 1;
  console.log('Resolved-by-strategy breakdown:');
  for (const [k, v] of Object.entries(byStrategy)) console.log(`  ${k.padEnd(24)} ${v}`);

  const outDir = path.join(process.cwd(), 'audit_output');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  const resolvedCsvPath = path.join(outDir, `oem_crossref_link_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
  const resolvedLines = ['crossref_id,product_id,matched_via'];
  for (const r of resolved) resolvedLines.push(`${r.crossrefId},${r.productId},${r.via}`);
  fs.writeFileSync(resolvedCsvPath, resolvedLines.join('\n'));
  console.log(`\nWritten: ${resolvedCsvPath}`);

  const unresolvedCsvPath = path.join(outDir, `oem_crossref_unresolved_${ts}.csv`);
  const unresolvedLines = ['crossref_id,zero_candidates,attempts_json'];
  for (const u of unresolved) unresolvedLines.push(`${u.crossrefId},${u.zeroCandidates},"${JSON.stringify(u.attempts).replace(/"/g, '""')}"`);
  fs.writeFileSync(unresolvedCsvPath, unresolvedLines.join('\n'));
  console.log(`Written: ${unresolvedCsvPath} (for manual review — includes WHY each row couldn't be auto-resolved, and flags true zero-candidate rows separately from ambiguous ones)`);

  if (!APPLY) {
    console.log('\nDry run only — no rows updated. Review both CSVs, then re-run with --apply.');
    await pool.end();
    return;
  }

  console.log('\nApplying updates...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    for (const r of resolved) {
      await client.query(
        `UPDATE catalog_oem_crossref SET product_id = $1 WHERE id = $2`,
        [r.productId, r.crossrefId]
      );
      updated++;
    }
    await client.query('COMMIT');
    console.log(`✅ Linked ${updated} rows.`);
    console.log('\nNext step: re-run sync_oem_numbers_from_crossref.mjs — these newly');
    console.log('linked products likely need an oem_numbers[] merge too.');
  } catch (err) {
    await client.query('ROLLBACK');
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
