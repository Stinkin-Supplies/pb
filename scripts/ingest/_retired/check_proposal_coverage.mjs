#!/usr/bin/env node
/**
 * check_proposal_coverage.mjs
 *
 * For each normalized brand_part_number in the missed_merges CSV, checks
 * whether canonical_match_proposals has ANY row (regardless of status)
 * connecting those catalog_unified ids.
 *
 * This confirms/denies the theory: duplicates exist because the matching
 * pipeline (OEM-number based) never generated a proposal for these pairs
 * at all — vs. proposals existing but stuck in pending/rejected.
 *
 * READ-ONLY. No writes.
 *
 * Usage:
 *   node check_proposal_coverage.mjs ./audit_output/missed_merges_<ts>.csv
 */

import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node check_proposal_coverage.mjs <missed_merges.csv>');
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ''));
    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(cur); cur = ''; }
      else cur += c;
    }
  }
  result.push(cur);
  return result;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
  const groups = new Map();
  for (const row of rows) {
    const key = row.normalized_part_number;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.catalog_unified_id);
  }
  console.log(`Checking proposal coverage for ${groups.size} part-number groups...`);

  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  const client = await pool.connect();

  let noProposalAtAll = 0;
  let hasProposalUnconfirmed = 0;
  let hasProposalConfirmedNotApplied = 0;
  const sampleNoProposal = [];

  try {
    let i = 0;
    for (const [partNumber, ids] of groups) {
      i++;
      if (i % 500 === 0) console.log(`  ...${i}/${groups.size}`);

      const { rows: proposals } = await client.query(
        `SELECT id, status, product_id_a, product_id_b
         FROM canonical_match_proposals
         WHERE product_id_a = ANY($1::int[]) OR product_id_b = ANY($1::int[])`,
        [ids.map(Number)]
      );

      if (proposals.length === 0) {
        noProposalAtAll++;
        if (sampleNoProposal.length < 20) {
          sampleNoProposal.push({ partNumber, ids });
        }
      } else if (proposals.some((p) => p.status === 'confirmed')) {
        hasProposalConfirmedNotApplied++;
      } else {
        hasProposalUnconfirmed++;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n--- PROPOSAL COVERAGE ---');
  console.log(`No proposal exists at all (never flagged as candidates):     ${noProposalAtAll}`);
  console.log(`Proposal exists, confirmed but never applied (apply-script gap): ${hasProposalConfirmedNotApplied}`);
  console.log(`Proposal exists, pending/rejected (needs review):             ${hasProposalUnconfirmed}`);
  console.log('\nSample of never-proposed part numbers (up to 20):');
  for (const s of sampleNoProposal) {
    console.log(`  ${s.partNumber} -> catalog_unified ids: ${s.ids.join(', ')}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
