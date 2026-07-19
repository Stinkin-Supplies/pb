#!/usr/bin/env node
/**
 * audit_canonical_matches.mjs
 *
 * READ-ONLY audit of canonical_products groupings, checked against
 * catalog_unified.brand_part_number (manufacturer/brand part number).
 *
 * Checks BOTH failure directions:
 *   1. FALSE MERGES  — same canonical_product_id, but brand_part_number
 *      disagrees after normalization. These are hiding distinct products
 *      from customers under one canonical entry right now.
 *   2. MISSED MERGES — same normalized brand_part_number, active products,
 *      but different (or null) canonical_product_id. These are the
 *      "three cards for one item" duplicates.
 *
 * Normalization: uppercase, strip dashes/spaces only. Leading zeros are
 * preserved (stripping them risks false-positive matches).
 *
 * Output: two CSVs in ./audit_output/
 *   - false_merges_<timestamp>.csv
 *   - missed_merges_<timestamp>.csv
 *
 * NO WRITES. Nothing in this script modifies the database.
 *
 * Usage:
 *   node audit_canonical_matches.mjs
 *
 * Requires CATALOG_DATABASE_URL env var (same as other ingest scripts).
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  max: 4,
});

function normalizePartNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  return s.toUpperCase().replace(/[\s\-]/g, '');
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsv(filepath, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
}

async function main() {
  const outDir = path.join(process.cwd(), 'audit_output');
  fs.mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.log('Connecting to database...');
  const client = await pool.connect();

  try {
    // ------------------------------------------------------------------
    // PART 1: FALSE MERGES
    // Products sharing a canonical_product_id whose brand_part_number
    // disagrees after normalization.
    // ------------------------------------------------------------------
    console.log('\n[1/2] Checking for FALSE MERGES (wrong products grouped together)...');

    const falseMergeQuery = `
      SELECT
        cu.canonical_product_id,
        cp.canonical_sku,
        cu.id            AS catalog_unified_id,
        cu.sku,
        cu.name,
        cu.brand_part_number,
        cu.source_vendor,
        cu.is_active
      FROM catalog_unified cu
      JOIN canonical_products cp ON cp.id = cu.canonical_product_id
      WHERE cu.is_active = true
        AND cu.brand_part_number IS NOT NULL
        AND cu.brand_part_number != ''
      ORDER BY cu.canonical_product_id, cu.source_vendor
    `;

    const { rows: falseMergeCandidates } = await client.query(falseMergeQuery);
    console.log(`  Pulled ${falseMergeCandidates.length} active rows with a brand_part_number to check.`);

    const groupsByCanonical = new Map();
    for (const row of falseMergeCandidates) {
      if (!groupsByCanonical.has(row.canonical_product_id)) {
        groupsByCanonical.set(row.canonical_product_id, []);
      }
      groupsByCanonical.get(row.canonical_product_id).push(row);
    }

    const falseMergeRows = [];
    for (const [canonicalId, members] of groupsByCanonical) {
      if (members.length < 2) continue;
      const normSet = new Set(members.map((m) => normalizePartNumber(m.brand_part_number)));
      if (normSet.size > 1) {
        for (const m of members) {
          falseMergeRows.push({
            canonical_product_id: canonicalId,
            canonical_sku: m.canonical_sku,
            catalog_unified_id: m.catalog_unified_id,
            sku: m.sku,
            name: m.name,
            brand_part_number: m.brand_part_number,
            normalized: normalizePartNumber(m.brand_part_number),
            source_vendor: m.source_vendor,
          });
        }
      }
    }

    console.log(`  Found ${new Set(falseMergeRows.map(r => r.canonical_product_id)).size} canonical groups with disagreeing part numbers (${falseMergeRows.length} rows total).`);

    const falseMergePath = path.join(outDir, `false_merges_${timestamp}.csv`);
    writeCsv(
      falseMergePath,
      ['canonical_product_id', 'canonical_sku', 'catalog_unified_id', 'sku', 'name', 'brand_part_number', 'normalized', 'source_vendor'],
      falseMergeRows
    );
    console.log(`  Written: ${falseMergePath}`);

    // ------------------------------------------------------------------
    // PART 2: MISSED MERGES
    // Active products sharing a normalized brand_part_number, but split
    // across different (or null) canonical_product_id values.
    // ------------------------------------------------------------------
    console.log('\n[2/2] Checking for MISSED MERGES (duplicate cards for the same item)...');

    const missedMergeQuery = `
      SELECT
        cu.id AS catalog_unified_id,
        cu.sku,
        cu.name,
        cu.brand_part_number,
        cu.source_vendor,
        cu.canonical_product_id,
        cp.canonical_sku
      FROM catalog_unified cu
      LEFT JOIN canonical_products cp ON cp.id = cu.canonical_product_id
      WHERE cu.is_active = true
        AND cu.brand_part_number IS NOT NULL
        AND cu.brand_part_number != ''
    `;

    const { rows: allActive } = await client.query(missedMergeQuery);
    console.log(`  Pulled ${allActive.length} active rows with a brand_part_number to check.`);

    const groupsByPartNumber = new Map();
    for (const row of allActive) {
      const norm = normalizePartNumber(row.brand_part_number);
      if (!norm) continue;
      if (!groupsByPartNumber.has(norm)) {
        groupsByPartNumber.set(norm, []);
      }
      groupsByPartNumber.get(norm).push(row);
    }

    const missedMergeRows = [];
    for (const [norm, members] of groupsByPartNumber) {
      if (members.length < 2) continue;
      const canonicalIds = new Set(members.map((m) => m.canonical_product_id ?? 'NULL'));
      if (canonicalIds.size > 1) {
        for (const m of members) {
          missedMergeRows.push({
            normalized_part_number: norm,
            catalog_unified_id: m.catalog_unified_id,
            sku: m.sku,
            name: m.name,
            brand_part_number: m.brand_part_number,
            source_vendor: m.source_vendor,
            canonical_product_id: m.canonical_product_id ?? '(none)',
            canonical_sku: m.canonical_sku ?? '(none)',
          });
        }
      }
    }

    console.log(`  Found ${new Set(missedMergeRows.map(r => r.normalized_part_number)).size} part numbers split across multiple/no canonical groups (${missedMergeRows.length} rows total).`);

    const missedMergePath = path.join(outDir, `missed_merges_${timestamp}.csv`);
    writeCsv(
      missedMergePath,
      ['normalized_part_number', 'catalog_unified_id', 'sku', 'name', 'brand_part_number', 'source_vendor', 'canonical_product_id', 'canonical_sku'],
      missedMergeRows
    );
    console.log(`  Written: ${missedMergePath}`);

    // ------------------------------------------------------------------
    console.log('\n--- SUMMARY ---');
    console.log(`False-merge groups (customers seeing WRONG shared listing): ${new Set(falseMergeRows.map(r => r.canonical_product_id)).size}`);
    console.log(`Missed-merge groups (customers seeing DUPLICATE cards):     ${new Set(missedMergeRows.map(r => r.normalized_part_number)).size}`);
    console.log('\nBoth CSVs are diagnostic only — no rows were modified.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
