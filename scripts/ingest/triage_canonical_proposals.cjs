#!/usr/bin/env node
// triage_canonical_proposals.cjs
//
// Smart auto-triage of canonical_match_proposals.
//
// The OEM-based matching created 972 pending pairs, but many are wrong:
//  - Same-vendor pairs (440): PU vs PU can't be canonical duplicates — reject.
//  - Consumable categories (brakes, filters, plugs): OEM# = fitment application,
//    not product identity. Many different brands/compounds share one OEM#. Reject
//    unless name similarity is very high.
//  - Hard part categories (trans, engine, suspension): OEM# = same part. Confirm
//    if cross-vendor, reject if same-vendor (those are variants).
//
// After auto-triage, remaining ambiguous pairs go into the manual review queue.
//
// Run: node triage_canonical_proposals.cjs [--dry]

const { Pool } = require('pg');

const DRY = process.argv.includes('--dry');
const pool = new Pool({
  host: '5.161.100.126', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

// Categories where OEM# = fitment app, not product identity.
// Different brands all reference the same OEM for their version of the part.
const CONSUMABLE_CATEGORIES = new Set([
  'Brakes',           // brake pads, rotors (multiple compounds per application)
  'Wheels & Tires',   // tires (many brands per size/fitment)
  'Tools & Chemicals',
  'Riding Gear & Apparel',
]);

// Normalize a product name for similarity comparison.
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(harley|davidson|harley-davidson|hd|inc|the|for|and|or|with|fits?|oem)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Simple bigram similarity (0–1).
function similarity(a, b) {
  const bigrams = (s) => {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter++;
  return (2 * inter) / (ba.size + bb.size) || 0;
}

async function main() {
  console.log(`\n═══ Canonical Proposal Triage ${DRY ? '[DRY RUN]' : '[LIVE]'} ═══\n`);

  const rows = await q(`
    SELECT
      cmp.id,
      cmp.match_reason,
      cmp.shared_oem_number,
      cmp.match_score,
      a.id AS a_id, a.name AS a_name, a.source_vendor AS a_vendor,
      COALESCE(a.display_category, a.category) AS a_cat,
      b.id AS b_id, b.name AS b_name, b.source_vendor AS b_vendor,
      COALESCE(b.display_category, b.category) AS b_cat
    FROM canonical_match_proposals cmp
    JOIN catalog_unified a ON a.id = cmp.product_id_a
    JOIN catalog_unified b ON b.id = cmp.product_id_b
    WHERE cmp.status = 'pending'
    ORDER BY cmp.id
  `);

  console.log(`Found ${rows.length} pending proposals\n`);

  const toConfirm = [], toReject = [], toManual = [];

  for (const row of rows) {
    const sameVendor   = row.a_vendor === row.b_vendor;
    const category     = row.a_cat || row.b_cat || '';
    const isConsumable = CONSUMABLE_CATEGORIES.has(category);
    const nameSim      = similarity(normalize(row.a_name), normalize(row.b_name));

    if (sameVendor) {
      // Same vendor = variant or genuine duplicate within vendor — not a canonical match.
      toReject.push({ ...row, reason: `same-vendor (${row.a_vendor})` });
    } else if (row.match_reason === 'upc') {
      // UPC is a global product code — same UPC = definitionally same product.
      toConfirm.push({ ...row, reason: `UPC match (global product code)` });
    } else if (row.match_reason === 'brand_part_number') {
      // Same brand + same manufacturer part# = same product. Vendors just name
      // things differently (WPS uses generic names, PU adds length/fitment detail).
      toConfirm.push({ ...row, reason: `brand_part_number match (${nameSim.toFixed(2)} name sim)` });
    } else if (isConsumable && nameSim < 0.55) {
      // OEM-based, consumable category + low name similarity = different products
      // sharing an OEM fitment application number (e.g. brake pads).
      toReject.push({ ...row, reason: `consumable category + low name sim (${nameSim.toFixed(2)})` });
    } else if (nameSim >= 0.65) {
      // OEM-based cross-vendor + high name similarity = same part.
      toConfirm.push({ ...row, reason: `oem match, high name sim (${nameSim.toFixed(2)})` });
    } else {
      // Ambiguous OEM match — keep for manual review.
      toManual.push({ ...row, nameSim: nameSim.toFixed(2) });
    }
  }

  console.log(`── Triage results ──`);
  console.log(`  Auto-confirm: ${toConfirm.length}`);
  console.log(`  Auto-reject:  ${toReject.length}`);
  console.log(`  Manual queue: ${toManual.length}\n`);

  // Show sample of each bucket
  if (toConfirm.length) {
    console.log(`Sample confirms:`);
    toConfirm.slice(0, 5).forEach(r =>
      console.log(`  [${r.shared_oem_number}] ${r.a_vendor}: "${r.a_name}" ↔ ${r.b_vendor}: "${r.b_name}" (${r.reason})`)
    );
    console.log('');
  }

  if (toReject.length) {
    console.log(`Sample rejects:`);
    toReject.slice(0, 5).forEach(r =>
      console.log(`  [${r.shared_oem_number}] ${r.a_vendor}: "${r.a_name}" ↔ ${r.b_vendor}: "${r.b_name}" (${r.reason})`)
    );
    console.log('');
  }

  if (toManual.length) {
    console.log(`Manual review remaining (first 10):`);
    toManual.slice(0, 10).forEach(r =>
      console.log(`  [${r.shared_oem_number}] ${r.a_vendor}: "${r.a_name}" ↔ ${r.b_vendor}: "${r.b_name}" (sim=${r.nameSim})`)
    );
    console.log('');
  }

  if (DRY) {
    console.log('Dry run — no DB changes made.');
    await pool.end();
    return;
  }

  // Apply: confirm
  if (toConfirm.length) {
    const ids = toConfirm.map(r => r.id);
    await q(
      `UPDATE canonical_match_proposals
       SET status = 'confirmed', reviewed_by = 'auto-triage', reviewed_at = NOW()
       WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`✓ Confirmed ${toConfirm.length} proposals`);
  }

  // Apply: reject
  if (toReject.length) {
    const ids = toReject.map(r => r.id);
    await q(
      `UPDATE canonical_match_proposals
       SET status = 'rejected', reviewed_by = 'auto-triage', reviewed_at = NOW()
       WHERE id = ANY($1::int[])`,
      [ids]
    );
    console.log(`✓ Rejected ${toReject.length} proposals`);
  }

  console.log(`\n${toManual.length} proposals remain in manual review queue.`);
  console.log('Run the promoter script next to merge confirmed pairs into canonical records.');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
