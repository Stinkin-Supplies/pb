/**
 * build_vtwin_crossref.mjs
 *
 * Parses the VTwin fitment PDF cross-reference (extracted to text first)
 * and populates vtwin_oem_crossref(hd_oem_number, vt_part_number).
 *
 * Usage:
 *   pdftotext -layout vtwin_fit_ment.pdf /tmp/vtwin.txt
 *   node scripts/ingest/build_vtwin_crossref.mjs
 *
 * The script is idempotent — safe to re-run. Uses ON CONFLICT DO NOTHING.
 * Does NOT use page numbers from the PDF (they may be outdated).
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: false,
});

// ── Path to extracted text file ──────────────────────────────────────────────
const TXT_PATH = process.env.VTWIN_TXT_PATH || '/tmp/vtwin.txt';

// ── Parse the extracted text into [oem, vtwin] pairs ─────────────────────────
function parseCrossRef(txtPath) {
  const text = fs.readFileSync(txtPath, 'utf8');
  const lines = text.split('\n');
  const pairs = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Skip section markers like "1.17.11"
    if (/^\d+\.\d+\.\d+$/.test(line)) continue;

    // Skip garbled repeated-char headers ("O OE EM M", "AG GE E", etc.)
    if (/[A-Z] [A-Z]{2} [A-Z]{2} [A-Z]/.test(line)) continue;
    if (/^[A-Z]{1,2}( [A-Z]{1,3}){3,}$/.test(line)) continue;

    // Match: OEM_NUMBER  VTWIN_PART_NUMBER  (optional trailing page number)
    // OEM examples:  25216-65  16688-90A  9986-8  18522-53PG
    // VTwin examples: 10-0026  9989-4  11-1468
    const m = line.match(/^([A-Z0-9][\w\-]+?)\s+(\d+[-]\d+)\b/);
    if (!m) continue;

    const oem   = m[1].toUpperCase().trim();
    const vtwin = m[2].trim();

    const key = `${oem}|${vtwin}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pairs.push({ oem, vtwin });
  }

  return pairs;
}

// ── Ensure table exists ───────────────────────────────────────────────────────
async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS vtwin_oem_crossref (
      id              SERIAL PRIMARY KEY,
      hd_oem_number   TEXT NOT NULL,
      vt_part_number  TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (hd_oem_number, vt_part_number)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_vtwin_oem_crossref_oem
      ON vtwin_oem_crossref (hd_oem_number)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_vtwin_oem_crossref_vt
      ON vtwin_oem_crossref (vt_part_number)
  `);
  console.log('✓ Table vtwin_oem_crossref ready');
}

// ── Batch insert ──────────────────────────────────────────────────────────────
async function insertBatch(client, batch) {
  if (batch.length === 0) return 0;

  const values = batch.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const params = batch.flatMap(({ oem, vtwin }) => [oem, vtwin]);

  const result = await client.query(`
    INSERT INTO vtwin_oem_crossref (hd_oem_number, vt_part_number)
    VALUES ${values}
    ON CONFLICT (hd_oem_number, vt_part_number) DO NOTHING
  `, params);

  return result.rowCount ?? 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('━'.repeat(60));
  console.log('VTwin OEM Cross-Reference Ingest');
  console.log('━'.repeat(60));

  if (!fs.existsSync(TXT_PATH)) {
    console.error(`\n✗ Text file not found: ${TXT_PATH}`);
    console.error('  Run: pdftotext -layout vtwin_fit_ment.pdf /tmp/vtwin.txt\n');
    process.exit(1);
  }

  console.log(`\n→ Parsing ${TXT_PATH}...`);
  const pairs = parseCrossRef(TXT_PATH);
  console.log(`  Found ${pairs.length} unique OEM→VTwin pairs`);

  // Quick stats
  const oems  = new Set(pairs.map(p => p.oem));
  const vtwins = new Set(pairs.map(p => p.vtwin));
  console.log(`  Unique OEM numbers:   ${oems.size}`);
  console.log(`  Unique VTwin numbers: ${vtwins.size}`);

  const client = await pool.connect();
  try {
    await ensureTable(client);

    // Existing row count before insert
    const { rows: [{ count: before }] } = await client.query(
      'SELECT COUNT(*) FROM vtwin_oem_crossref'
    );
    console.log(`\n→ Existing rows in vtwin_oem_crossref: ${before}`);

    // Insert in batches of 500
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);
      inserted += await insertBatch(client, batch);
      process.stdout.write(`\r  Inserted ${inserted} new rows (${Math.min(i + BATCH, pairs.length)}/${pairs.length} processed)...`);
    }
    console.log(`\n\n✓ Done — ${inserted} new rows inserted`);

    const { rows: [{ count: after }] } = await client.query(
      'SELECT COUNT(*) FROM vtwin_oem_crossref'
    );
    console.log(`✓ Total rows in vtwin_oem_crossref: ${after}`);

    // ── Yield check — how many VTWIN products in catalog_unified
    //    have at least one OEM number that matches this crossref?
    console.log('\n→ Running yield check against catalog_unified...');
    const { rows: [yield_row] } = await client.query(`
      SELECT
        COUNT(DISTINCT cu.sku) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM vtwin_oem_crossref x
            WHERE x.hd_oem_number = ANY(cu.oem_numbers)
          )
        ) AS matched_skus,
        COUNT(DISTINCT cu.sku) FILTER (
          WHERE cu.vendor = 'VTWIN'
          AND cu.oem_numbers IS NOT NULL
          AND array_length(cu.oem_numbers, 1) > 0
        ) AS vtwin_with_oem,
        COUNT(DISTINCT cu.sku) FILTER (
          WHERE cu.vendor = 'VTWIN'
        ) AS vtwin_total
      FROM catalog_unified cu
      WHERE cu.vendor = 'VTWIN'
    `);

    console.log('\n  YIELD CHECK:');
    console.log(`  VTWIN total SKUs:           ${yield_row.vtwin_total}`);
    console.log(`  VTWIN SKUs with OEM numbers: ${yield_row.vtwin_with_oem}`);
    console.log(`  VTWIN SKUs matched via crossref: ${yield_row.matched_skus}`);

    if (yield_row.vtwin_with_oem > 0) {
      const pct = ((yield_row.matched_skus / yield_row.vtwin_total) * 100).toFixed(1);
      console.log(`  Coverage: ${pct}% of all VTWIN SKUs`);
    }

  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n' + '━'.repeat(60));
  console.log('Next step: join vtwin_oem_crossref → catalog_fitment_v2');
  console.log('  hd_oem_number → catalog_unified.oem_numbers[]');
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  process.exit(1);
});
