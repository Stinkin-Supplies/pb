/**
 * find_part_number_dupes.mjs
 *
 * Finds products that exist in multiple vendor tables (WPS, PU, VTwin)
 * by matching on manufacturer/brand part number:
 *   WPS   → supplier_item_id
 *   PU    → vendor_part_number
 *   VTwin → vendor_part_no
 *
 * Match rules:
 *   1. Normalised part number must be >= MIN_PART_LEN chars (filters out short
 *      catalog sequence numbers like "1010", "2005" that collide across brands)
 *   2. At least one pair in the cluster must share the same normalised brand name
 *      (filters out accidental numeric collisions across unrelated products)
 *
 * Run: node scripts/ingest/find_part_number_dupes.mjs
 * Add --merge to also generate scripts/data/merge_plan.sql (dry run, no writes).
 */

import pg from 'pg';
import fs from 'fs';

const { Client } = pg;
const MERGE_MODE = process.argv.includes('--merge');

// Tune these to adjust strictness
const MIN_PART_LEN = 5;   // normalised part number must be at least this long
const REQUIRE_BRAND_MATCH = true; // at least one cross-vendor pair must share brand

const DB_URL = 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';
const db = new Client({ connectionString: DB_URL });
await db.connect();

console.log('── Phase 1: pull part numbers from each vendor table ──\n');

const wpsRes = await db.query(`
  SELECT
    id,
    sku                  AS vendor_sku,
    supplier_item_id     AS part_no,
    brand,
    product_name         AS title,
    list_price::numeric  AS price
  FROM wps_catalog
  WHERE supplier_item_id IS NOT NULL AND supplier_item_id != ''
`);

const puRes = await db.query(`
  SELECT
    id,
    sku                                   AS vendor_sku,
    vendor_part_number                    AS part_no,
    brand,
    COALESCE(product_name, name)          AS title,
    COALESCE(msrp, dealer_price)::numeric AS price
  FROM pu_catalog
  WHERE vendor_part_number IS NOT NULL AND vendor_part_number != ''
`);

const vtRes = await db.query(`
  SELECT
    id,
    sku                   AS vendor_sku,
    vendor_part_no        AS part_no,
    manufacturer          AS brand,
    name                  AS title,
    retail_price::numeric AS price
  FROM vtwin_catalog
  WHERE vendor_part_no IS NOT NULL AND vendor_part_no != ''
`);

console.log(`WPS rows with supplier_item_id  : ${wpsRes.rows.length.toLocaleString()}`);
console.log(`PU  rows with vendor_part_number: ${puRes.rows.length.toLocaleString()}`);
console.log(`VT  rows with vendor_part_no    : ${vtRes.rows.length.toLocaleString()}\n`);

// ── Build lookup map ──────────────────────────────────────────────────────────

const normalise     = s => s.toUpperCase().replace(/[\s\-]/g, '');
const normaliseBrand = s => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

const byPartNo = new Map();

const addRows = (rows, vendor) => {
  for (const row of rows) {
    const key = normalise(row.part_no);
    if (key.length < MIN_PART_LEN) continue; // skip short/ambiguous part numbers
    if (!byPartNo.has(key)) byPartNo.set(key, []);
    byPartNo.get(key).push({ vendor, row });
  }
};

addRows(wpsRes.rows, 'WPS');
addRows(puRes.rows,  'PU');
addRows(vtRes.rows,  'VTwin');

// ── Find valid multi-vendor clusters ──────────────────────────────────────────

const clusters = [];

for (const [normKey, entries] of byPartNo) {
  // Need at least 2 different vendors
  const vendors = new Set(entries.map(e => e.vendor));
  if (vendors.size < 2) continue;

  if (REQUIRE_BRAND_MATCH) {
    // Check that at least one cross-vendor pair shares a normalised brand
    let hasBrandMatch = false;
    outer: for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].vendor === entries[j].vendor) continue;
        const b1 = normaliseBrand(entries[i].row.brand);
        const b2 = normaliseBrand(entries[j].row.brand);
        if (b1 && b2 && b1 === b2) { hasBrandMatch = true; break outer; }
      }
    }
    if (!hasBrandMatch) continue;
  }

  // Within a valid cluster, keep only the entries that are part of a matching pair
  // (drop the "noise" rows from unrelated products that happened to share a part number)
  const matchedEntries = entries.filter(e => {
    const myBrand = normaliseBrand(e.row.brand);
    return entries.some(other =>
      other.vendor !== e.vendor &&
      normaliseBrand(other.row.brand) === myBrand
    );
  });

  if (new Set(matchedEntries.map(e => e.vendor)).size < 2) continue;

  clusters.push({ normKey, entries: matchedEntries });
}

clusters.sort((a, b) => b.entries.length - a.entries.length);

// Randomised sample for preview — shuffle a copy, keep clusters sorted for merge
const shuffled = [...clusters].sort(() => Math.random() - 0.5);

// ── Stats ─────────────────────────────────────────────────────────────────────

const pairsWPS_PU   = clusters.filter(c => c.entries.some(e=>e.vendor==='WPS') && c.entries.some(e=>e.vendor==='PU')).length;
const pairsWPS_VT   = clusters.filter(c => c.entries.some(e=>e.vendor==='WPS') && c.entries.some(e=>e.vendor==='VTwin')).length;
const pairsPU_VT    = clusters.filter(c => c.entries.some(e=>e.vendor==='PU')  && c.entries.some(e=>e.vendor==='VTwin')).length;
const tripleMatches = clusters.filter(c => new Set(c.entries.map(e=>e.vendor)).size === 3).length;

console.log('── Phase 2: confirmed duplicate clusters (part# + brand match) ──\n');
console.log(`Total confirmed clusters  : ${clusters.length.toLocaleString()}`);
console.log(`  WPS ↔ PU               : ${pairsWPS_PU.toLocaleString()}`);
console.log(`  WPS ↔ VTwin            : ${pairsWPS_VT.toLocaleString()}`);
console.log(`  PU  ↔ VTwin            : ${pairsPU_VT.toLocaleString()}`);
console.log(`  All three vendors       : ${tripleMatches.toLocaleString()}`);

// ── Sample preview ────────────────────────────────────────────────────────────

console.log('\n── Sample (first 15 clusters) ──\n');
for (const { normKey, entries } of shuffled.slice(0, 15)) {
  console.log(`  Part# ${entries[0].row.part_no}  (norm: ${normKey})`);
  for (const { vendor, row } of entries) {
    console.log(`    [${vendor.padEnd(5)}] sku=${row.vendor_sku}  brand="${row.brand}"  $${Number(row.price??0).toFixed(2)}  "${String(row.title??'').slice(0,55)}"`);
  }
  console.log();
}

// ── CSV export ────────────────────────────────────────────────────────────────

const csvLines = ['part_no_norm,part_no_raw,vendor,vendor_sku,brand,price,title'];
for (const { normKey, entries } of clusters) {
  for (const { vendor, row } of entries) {
    const safe = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    csvLines.push([normKey, row.part_no, vendor, row.vendor_sku, row.brand, row.price, row.title].map(safe).join(','));
  }
}
fs.writeFileSync('scripts/data/part_number_dupes.csv', csvLines.join('\n'));
console.log(`\nCSV written → scripts/data/part_number_dupes.csv  (${clusters.length} clusters, ${csvLines.length - 1} rows)`);

// ── Merge plan SQL (--merge flag) ─────────────────────────────────────────────

if (MERGE_MODE) {
  console.log('\n── Phase 3: merge plan SQL ──\n');

  const PRIORITY = { PU: 0, WPS: 1, VTwin: 2 };

  const sqlLines = [
    '-- merge_plan.sql  — generated by find_part_number_dupes.mjs',
    '-- DRY RUN: review before executing.',
    '-- Canonical vendor priority: PU > WPS > VTwin',
    '-- Non-canonical rows deactivated; their vendor_offers migrated to canonical.',
    '',
    'BEGIN;',
    '',
  ];

  // catalog_unified.vendor_sku = the vendor's own SKU (e.g. WPS "133-3003").
  // The manufacturer part number (supplier_item_id / vendor_part_number / vendor_part_no)
  // is NOT in catalog_unified — it only lives in the vendor tables.
  //
  // Lookup chain:
  //   WPS:   part_no → wps_catalog.supplier_item_id → wps_catalog.sku → catalog_unified.vendor_sku
  //   PU:    part_no → pu_catalog.vendor_part_number → pu_catalog.sku → catalog_unified.vendor_sku
  //          (PU vendor_sku in catalog_unified = normalised pu_catalog.sku, dashes stripped)
  //   VTwin: part_no → vtwin_catalog.vendor_part_no  → vtwin_catalog.sku → catalog_unified.vendor_sku

  // Build: part_no → vendor_sku for each vendor (via their respective vendor tables)
  const wpsPartToVendorSku = new Map(); // norm(supplier_item_id) → wps sku
  const wpsMapQ = await db.query(`SELECT sku, supplier_item_id FROM wps_catalog WHERE supplier_item_id IS NOT NULL AND supplier_item_id != ''`);
  for (const r of wpsMapQ.rows) wpsPartToVendorSku.set(r.supplier_item_id.toUpperCase().replace(/[\s-]/g,''), r.sku);

  // PU: catalog_unified.vendor_sku = norm(vendor_part_number), not the sku column.
  // e.g. vendor_part_number='DSPT-1' → vendor_sku='DSPT1'. Map norm(part_no) → norm(part_no).
  const puPartToVendorSku = new Map(); // norm(vendor_part_number) → norm(vendor_part_number)
  const puMapQ = await db.query(`SELECT vendor_part_number FROM pu_catalog WHERE vendor_part_number IS NOT NULL AND vendor_part_number != ''`);
  for (const r of puMapQ.rows) {
    const n = r.vendor_part_number.toUpperCase().replace(/[\s-]/g,'');
    puPartToVendorSku.set(n, n); // vendor_sku in catalog_unified IS the normalised part number
  }

  const vtPartToVendorSku = new Map(); // norm(vendor_part_no) → vtwin sku
  const vtMapQ = await db.query(`SELECT sku, vendor_part_no FROM vtwin_catalog WHERE vendor_part_no IS NOT NULL AND vendor_part_no != ''`);
  for (const r of vtMapQ.rows) vtPartToVendorSku.set(r.vendor_part_no.toUpperCase().replace(/[\s-]/g,''), r.sku);

  // catalog_unified indexed by vendor_sku per source
  const cuRes = await db.query(`SELECT internal_sku, vendor_sku, source_vendor FROM catalog_unified`);
  const cuByVendorSku = new Map(); // 'SOURCE|vendor_sku' → internal_sku
  for (const r of cuRes.rows) {
    if (r.vendor_sku) cuByVendorSku.set(`${r.source_vendor}|${r.vendor_sku}`, r.internal_sku);
    // PU: also index by normalised vendor_sku (pu stores dashes-stripped sku as vendor_sku)
    if (r.source_vendor === 'PU' && r.vendor_sku) {
      cuByVendorSku.set(`PU|${r.vendor_sku.toUpperCase().replace(/[\s-]/g,'')}`, r.internal_sku);
    }
  }

  const norm = s => s.toUpperCase().replace(/[\s-]/g, '');

  const getInternalSku = (vendor, partNo) => {
    const n = norm(partNo);
    if (vendor === 'WPS') {
      const vendorSku = wpsPartToVendorSku.get(n);
      return vendorSku ? cuByVendorSku.get(`WPS|${vendorSku}`) : undefined;
    }
    if (vendor === 'PU') {
      const normSku = puPartToVendorSku.get(n); // normalised sku
      return normSku ? cuByVendorSku.get(`PU|${normSku}`) : undefined;
    }
    if (vendor === 'VTwin') {
      const vendorSku = vtPartToVendorSku.get(n);
      return vendorSku ? cuByVendorSku.get(`VTWIN|${vendorSku}`) : undefined;
    }
  };

  // Debug: check first 5 clusters
  console.log('\n── DEBUG: lookup check on first 5 clusters ──');
  for (const { entries } of clusters.slice(0, 5)) {
    for (const { vendor, row } of entries) {
      const n = norm(row.part_no);
      const vendorSku = vendor === 'WPS' ? wpsPartToVendorSku.get(n)
                      : vendor === 'PU'  ? puPartToVendorSku.get(n)
                      : vtPartToVendorSku.get(n);
      const result = getInternalSku(vendor, row.part_no);
      console.log(`  [${vendor}] part_no=${row.part_no}  norm=${n}  vendorSku=${vendorSku||'MISS'}  internal=${result||'MISS'}`);
    }
    console.log();
  }

  let mergeCount = 0;
  for (const { entries } of clusters) {
    const sorted = [...entries].sort((a, b) => PRIORITY[a.vendor] - PRIORITY[b.vendor]);
    const canonical = sorted[0];
    const rest = sorted.slice(1);

    const canonicalInternal = getInternalSku(canonical.vendor, canonical.row.part_no);
    if (!canonicalInternal) continue;

    sqlLines.push(`-- Part# ${canonical.row.part_no}  |  canonical: ${canonicalInternal} (${canonical.vendor})`);

    for (const { vendor, row } of rest) {
      const dupInternal = getInternalSku(vendor, row.part_no);
      if (!dupInternal) continue;

      // vendor_offers uses catalog_product_id + vendor_code — skip for now, repopulate separately

      // Merge oem_numbers — COALESCE guards against null arrays
      sqlLines.push(`UPDATE catalog_unified`);
      sqlLines.push(`  SET oem_numbers = array(SELECT DISTINCT unnest(`);
      sqlLines.push(`    COALESCE((SELECT oem_numbers FROM catalog_unified WHERE internal_sku = '${canonicalInternal}'), '{}') ||`);
      sqlLines.push(`    COALESCE((SELECT oem_numbers FROM catalog_unified WHERE internal_sku = '${dupInternal}'), '{}')))`);
      sqlLines.push(`  WHERE internal_sku = '${canonicalInternal}';`);

      sqlLines.push(`UPDATE catalog_unified SET is_active = false WHERE internal_sku = '${dupInternal}';`);
      sqlLines.push('');
      mergeCount++;
    }
  }

  sqlLines.push('COMMIT;');
  fs.writeFileSync('scripts/data/merge_plan.sql', sqlLines.join('\n'));
  console.log(`Merge plan written → scripts/data/merge_plan.sql  (${mergeCount} rows to deactivate)`);
}

await db.end();
console.log('\nDone.');
