#!/usr/bin/env node
/**
 * import_battery_oem_crossref.mjs
 *
 * Bridges catalog_unified battery products to H-D OEM battery part numbers
 * via BCI group code matching, then inserts into catalog_oem_crossref.
 *
 * Logic:
 *   1. BCI_MAP defines H-D OEM → BCI group(s) equivalency
 *   2. NAME_PATTERNS matches catalog_unified products to BCI groups
 *      via name/sku/brand_part_number patterns
 *   3. Each matched product gets the corresponding H-D OEM number
 *      inserted into catalog_oem_crossref (source='HD_OEM')
 *
 * Usage:
 *   node scripts/ingest/import_battery_oem_crossref.mjs           # dry run
 *   node scripts/ingest/import_battery_oem_crossref.mjs --apply   # commit
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool  = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const APPLY = process.argv.includes('--apply');

// ── BCI → H-D OEM mapping ─────────────────────────────────────────────────────
// Each BCI group maps to exactly one H-D OEM number.
// Equivalent/cross codes are listed under the same OEM.

const BCI_MAP = [
  {
    hd_oem:     '65989-97E',    // Dyna '97-'17 / Softail '97-now / VRSC '07-'17 / XL '97-'03 / RA1250 '24-now
    bci_groups: ['YTX20HL-BS', 'YTX20HLBS', 'YTX20HL'],
    // Equivalents from catalog: CTX20HL-BS (Chrome), DRGM720BH (Drag), HVTHD-12 (H-12), MBTX20UHD (MotoBatt), Ultima 1-141
    equiv_pns:  ['CTX20HL', 'CTX20HL-BS', 'DRGM720BH', 'HVTHD-12', 'MBTX20UHD', '1-141'],
  },
  {
    hd_oem:     '65958-04C',    // XL '04-now / XG '15-now / Revolution Max '21-now / XR '08-'12
    bci_groups: ['YTX14L-BS', 'YTX14LBS', 'YTX14L', 'YTX14-BS', 'YTX14BS', 'YTX14'],
    // Equivalents: CTX14L-BS (Chrome), DRGM7RH4S/DRGM7RH4L (Drag), Ultima 1-140
    equiv_pns:  ['CTX14L-BS', 'CTX14L', 'DRGM7RH4S', 'DRGM7RH4L', '1-140'],
  },
  {
    hd_oem:     '66010-97E',    // Touring '97-now / Trike '09-now
    bci_groups: ['YTX20L-BS', 'YTX20LBS', 'YTX20L', 'ETX20L'],
    // Equivalents: East Penn ETX20L, Ultima 1-142
    equiv_pns:  ['ETX20L', '1-142'],
  },
  {
    hd_oem:     '65948-00C',    // VRSC '02-'06 / VRSCR '07
    bci_groups: ['YTX20-BS', 'YTX20BS', 'YTX20'],
    // Equivalents: Ultima 1-143
    equiv_pns:  ['1-143'],
  },
  {
    hd_oem:     '65991-82B',    // XLCR '77-'78 / XL '79-'96 / FX/FXR '73-'94 / Softail '84-'90
    bci_groups: ['YB16L-A', 'YB16LA', 'YB16HL-A', 'YB16HLA'],
    // VTwin has "YB16HL-A-LM" (Deka)
    equiv_pns:  ['YB16HL-A-LM', '1-145'],
  },
  {
    hd_oem:     '66010-82B',    // Touring '80-'96 (FLHR/FLHT/FLT)
    bci_groups: ['YB30L-B', 'YB30LB', 'YB30L'],
    equiv_pns:  [],
  },
  {
    hd_oem:     '65989-90B',    // Dyna '91-'96 / Softail '91-'96
    bci_groups: ['YB16CL-B', 'YB16CLB', 'YB16CL'],
    equiv_pns:  ['1-144'],
  },
];

// Build flat lookup: any matching string → hd_oem
function buildLookup() {
  const map = new Map(); // normalized_key → hd_oem
  for (const entry of BCI_MAP) {
    for (const code of [...entry.bci_groups, ...entry.equiv_pns]) {
      map.set(normalize(code), entry.hd_oem);
    }
  }
  return map;
}

function normalize(s) {
  return s.toUpperCase().replace(/[-\s_.]/g, '');
}

// ── Match a catalog row against the BCI lookup ────────────────────────────────

function findOem(lookup, row) {
  // Fields to check: sku, brand_part_number, name tokens
  const candidates = [
    row.sku,
    row.brand_part_number,
    // Extract BCI-like tokens from the name
    ...(row.name || '').split(/[\s\-,()]+/).filter(t => /^[YC][A-Z0-9]{4,}/.test(t)),
  ].filter(Boolean);

  for (const c of candidates) {
    const key = normalize(c.trim());
    // Direct hit
    if (lookup.has(key)) return lookup.get(key);
    // Prefix match — YTX20HL-BS FT → normalize → YTX20HLBSFT → try YTX20HLBS
    for (const [mapKey, oem] of lookup) {
      if (key.startsWith(mapKey) || mapKey.startsWith(key)) {
        return oem;
      }
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  console.log(`\n=== Battery OEM Crossref Import ===`);
  console.log(`Mode: ${APPLY ? '** APPLY **' : 'DRY RUN'}\n`);

  try {
    const lookup = buildLookup();

    // Fetch all battery-type products
    const { rows: products } = await client.query(`
      SELECT cu.id, cu.sku, cu.source_vendor, cu.brand, cu.name,
             cu.brand_part_number
      FROM catalog_unified cu
      WHERE cu.is_active = true
        AND cu.display_subcategory ILIKE '%batter%'
        OR (cu.is_active = true AND cu.name ILIKE '%batter%'
            AND cu.display_category = 'Electrical')
      ORDER BY cu.source_vendor, cu.sku
    `);
    console.log(`Battery products in catalog_unified: ${products.length}`);

    // Match each product to an H-D OEM number
    const matches = [];
    const unmatched = [];

    for (const prod of products) {
      const oem = findOem(lookup, prod);
      if (oem) {
        matches.push({ ...prod, hd_oem: oem });
      } else {
        unmatched.push(prod);
      }
    }

    console.log(`  Matched:   ${matches.length}`);
    console.log(`  Unmatched: ${unmatched.length}`);

    // Group matches by OEM for reporting
    const byOem = new Map();
    for (const m of matches) {
      if (!byOem.has(m.hd_oem)) byOem.set(m.hd_oem, []);
      byOem.get(m.hd_oem).push(m);
    }

    console.log('\n── Matches by H-D OEM ───────────────────────────────────────');
    for (const [oem, prods] of [...byOem.entries()].sort()) {
      const entry = BCI_MAP.find(e => e.hd_oem === oem);
      console.log(`\n  ${oem}  (${entry?.bci_groups[0]})`);
      for (const p of prods) {
        console.log(`    [${p.source_vendor}] ${p.sku.padEnd(20)} bpn=${String(p.brand_part_number ?? '—').padEnd(16)} "${p.name?.slice(0, 50)}"`);
      }
    }

    if (unmatched.length > 0) {
      console.log('\n── Unmatched battery products ───────────────────────────────');
      for (const p of unmatched) {
        console.log(`  [${p.source_vendor}] ${p.sku.padEnd(20)} bpn=${String(p.brand_part_number ?? '—').padEnd(16)} "${p.name?.slice(0, 50)}"`);
      }
    }

    // Check existing crossref entries
    const oems = [...byOem.keys()];
    const skus  = matches.map(m => m.sku);
    let existingSet = new Set();
    if (oems.length > 0 && skus.length > 0) {
      const { rows: existing } = await client.query(`
        SELECT sku, oem_number FROM catalog_oem_crossref
        WHERE oem_number = ANY($1) AND sku = ANY($2)
      `, [oems, skus]);
      existingSet = new Set(existing.map(r => `${r.sku}||${r.oem_number}`));
    }

    const toInsert = matches
      .filter(m => !existingSet.has(`${m.sku}||${m.hd_oem}`))
      .map(m => ({ sku: m.sku, oem_number: m.hd_oem }));

    console.log(`\n── Summary ──────────────────────────────────────────────────`);
    console.log(`  New crossref rows to insert: ${toInsert.length}`);
    console.log(`  Already in crossref:         ${matches.length - toInsert.length}`);

    if (!APPLY) {
      console.log('\nDry run complete. Pass --apply to commit.\n');
      return;
    }

    if (toInsert.length === 0) {
      console.log('\nNothing new to insert.\n');
      return;
    }

    // Insert into catalog_oem_crossref
    await client.query('BEGIN');
    try {
      const skuArr = toInsert.map(r => r.sku);
      const oemArr = toInsert.map(r => r.oem_number);

      const { rowCount } = await client.query(`
        INSERT INTO catalog_oem_crossref (sku, oem_number, source, expanded_from)
        SELECT unnest($1::text[]), unnest($2::text[]), 'HD_OEM', false
        ON CONFLICT (sku, oem_number) DO NOTHING
      `, [skuArr, oemArr]);

      await client.query('COMMIT');
      console.log(`\n✅ Inserted ${rowCount} rows into catalog_oem_crossref`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Final crossref count
    const { rows: [{ total }] } = await client.query(`
      SELECT COUNT(*) AS total FROM catalog_oem_crossref WHERE source = 'HD_OEM'
    `);
    console.log(`   HD_OEM crossref total: ${total}\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
