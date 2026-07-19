#!/usr/bin/env node
// build_wps_canonical_proposals.cjs
//
// Generates canonical_match_proposals for WPS products matched against
// PU and VTwin via two signals:
//   1. brand_part_number + brand (exact match, same manufacturer part#)
//   2. UPC (exact match)
//
// Skips pairs that already exist in canonical_match_proposals.
// Run: node build_wps_canonical_proposals.cjs [--dry]

const { Pool } = require('pg');

const DRY = process.argv.includes('--dry');
const pool = new Pool({
  host: '5.161.100.126', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

async function main() {
  console.log(`\n═══ WPS Canonical Proposal Builder ${DRY ? '[DRY RUN]' : '[LIVE]'} ═══\n`);

  // ── Signal 1: brand_part_number + brand ─────────────────────────────────────
  console.log('Signal 1: brand_part_number + brand match…');
  const brandPartMatches = await q(`
    SELECT
      LEAST(wps.id, other.id)    AS product_id_a,
      GREATEST(wps.id, other.id) AS product_id_b,
      'brand_part_number'        AS match_reason,
      0.950                      AS match_score,
      NULL                       AS shared_oem_number
    FROM catalog_unified wps
    JOIN catalog_unified other
      ON LOWER(TRIM(wps.brand_part_number)) = LOWER(TRIM(other.brand_part_number))
     AND LOWER(TRIM(wps.brand))             = LOWER(TRIM(other.brand))
     AND wps.source_vendor  = 'WPS'
     AND other.source_vendor != 'WPS'
     AND wps.brand_part_number  IS NOT NULL AND wps.brand_part_number  != ''
     AND other.brand_part_number IS NOT NULL AND other.brand_part_number != ''
    WHERE wps.is_active   = true
      AND other.is_active = true
      -- Skip if either product is a kit (kits share part#s across configs)
      AND wps.is_kit   = false
      AND other.is_kit = false
  `);
  console.log(`  Found ${brandPartMatches.length} brand_part_number matches`);

  // ── Signal 2: UPC ────────────────────────────────────────────────────────────
  console.log('Signal 2: UPC match…');
  const upcMatches = await q(`
    SELECT
      LEAST(wps.id, other.id)    AS product_id_a,
      GREATEST(wps.id, other.id) AS product_id_b,
      'upc'                      AS match_reason,
      0.980                      AS match_score,
      NULL                       AS shared_oem_number
    FROM catalog_unified wps
    JOIN catalog_unified other
      ON wps.upc = other.upc
     AND wps.source_vendor  = 'WPS'
     AND other.source_vendor != 'WPS'
     AND wps.upc  IS NOT NULL AND LENGTH(wps.upc)  >= 8
     AND other.upc IS NOT NULL AND LENGTH(other.upc) >= 8
    WHERE wps.is_active   = true
      AND other.is_active = true
  `);
  console.log(`  Found ${upcMatches.length} UPC matches`);

  // ── Deduplicate across both signals (prefer UPC > brand_part_number) ─────────
  const pairMap = new Map(); // key: "minId-maxId" → best proposal
  for (const row of [...brandPartMatches, ...upcMatches]) {
    const key = `${row.product_id_a}-${row.product_id_b}`;
    if (!pairMap.has(key) || row.match_score > pairMap.get(key).match_score) {
      pairMap.set(key, row);
    }
  }
  const proposals = [...pairMap.values()];
  console.log(`  ${proposals.length} unique pairs after dedup\n`);

  // ── Skip existing proposals ───────────────────────────────────────────────────
  const existing = await q(`
    SELECT product_id_a, product_id_b FROM canonical_match_proposals
  `);
  const existingSet = new Set(existing.map(r => `${r.product_id_a}-${r.product_id_b}`));

  const newProposals = proposals.filter(p => {
    const key = `${p.product_id_a}-${p.product_id_b}`;
    return !existingSet.has(key);
  });
  console.log(`  ${existingSet.size} existing proposals skipped`);
  console.log(`  ${newProposals.length} new proposals to insert\n`);

  if (DRY) {
    console.log('Sample new proposals:');
    for (const p of newProposals.slice(0, 10)) {
      const [a, b] = await Promise.all([
        q(`SELECT name, source_vendor FROM catalog_unified WHERE id=$1`, [p.product_id_a]),
        q(`SELECT name, source_vendor FROM catalog_unified WHERE id=$1`, [p.product_id_b]),
      ]);
      console.log(`  [${p.match_reason}] ${a[0].source_vendor}: "${a[0].name}" ↔ ${b[0].source_vendor}: "${b[0].name}"`);
    }
    console.log('\nDry run — no changes made.');
    await pool.end();
    return;
  }

  // ── Insert in batches ─────────────────────────────────────────────────────────
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < newProposals.length; i += BATCH) {
    const batch = newProposals.slice(i, i + BATCH);
    const vals  = batch.map((_, j) => {
      const base = j * 4;
      return `($${base+1},$${base+2},$${base+3},$${base+4})`;
    }).join(',');
    const params = batch.flatMap(p => [
      p.product_id_a, p.product_id_b,
      p.match_reason, p.match_score,
    ]);
    await q(
      `INSERT INTO canonical_match_proposals
         (product_id_a, product_id_b, match_reason, match_score)
       VALUES ${vals}
       ON CONFLICT (product_id_a, product_id_b) DO NOTHING`,
      params
    );
    inserted += batch.length;
    if (inserted % 1000 === 0 || inserted === newProposals.length) {
      process.stdout.write(`  Inserted ${inserted} / ${newProposals.length}\r`);
    }
  }

  console.log(`\n\n── Summary ──`);
  console.log(`  brand_part_number matches: ${brandPartMatches.length}`);
  console.log(`  UPC matches:               ${upcMatches.length}`);
  console.log(`  Unique new proposals:      ${newProposals.length}`);
  console.log(`  Inserted:                  ${inserted}`);
  console.log('\nRun triage_canonical_proposals.cjs next to auto-sort these.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
