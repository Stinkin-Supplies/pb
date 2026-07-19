#!/usr/bin/env node
/**
 * import_vtwin_oem_crossref.mjs
 *
 * Imports scraped OEM numbers from vtwin_scrape_data.oem_no
 * into catalog_oem_crossref (source='vtwin_scrape').
 *
 * ~12,265 products have oem_no populated but are not yet in crossref.
 *
 * Usage:
 *   node import_vtwin_oem_crossref.mjs          # dry run (default)
 *   node import_vtwin_oem_crossref.mjs --apply  # commit inserts
 */

import pg from 'pg';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  host: '5.161.100.126',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: process.env.DB_PASSWORD ?? 'smelly',
  max: 5,
});

// ---------------------------------------------------------------------------
// OEM number cleaning
// ---------------------------------------------------------------------------

/**
 * Split and normalise a raw oem_no string from vtwin_scrape_data.
 * Raw values can look like:
 *   "45917-94"
 *   "45917-94 / 45918-94"
 *   "45917-94, 45918-94"
 *   "45917-94; 45918-94"
 *   "N/A"  "n/a"  ""  null
 *
 * Returns an array of cleaned OEM strings, empty array if nothing usable.
 */
function parseOemNo(raw) {
  if (!raw || typeof raw !== 'string') return [];

  // Split on common delimiters: " / ", ", ", "; ", " & ", whitespace-and-slash
  const parts = raw.split(/\s*[\/,;&]\s*|\s+and\s+/i);

  return parts
    .map(p => p.trim())
    .filter(p => {
      if (!p) return false;
      const upper = p.toUpperCase();
      // Skip obvious non-OEM values
      if (upper === 'N/A' || upper === 'NA' || upper === 'NONE' || upper === '-') return false;
      // Must contain at least one digit
      if (!/\d/.test(p)) return false;
      // Sanity: H-D OEM numbers are typically 5-8 digits optionally with a dash
      // But keep anything that passes the digit test — crossref is liberal
      return true;
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = await pool.connect();

  try {
    console.log(`\n=== VTwin OEM Crossref Import ===`);
    console.log(`Mode: ${APPLY ? '** APPLY **' : 'DRY RUN (pass --apply to commit)'}\n`);

    // ------------------------------------------------------------------
    // 1. Pull all vtwin_scrape_data rows with a populated oem_no,
    //    joined to catalog_unified to get the canonical sku.
    //
    //    vtwin_scrape_data.sku is the bare VTwin part number (e.g. "12-0903").
    //    catalog_unified.sku has the VT- prefix (e.g. "VT-12-0903").
    //    We join on CONCAT('VT-', vsd.sku) = cu.sku.
    // ------------------------------------------------------------------
    console.log('Fetching vtwin_scrape_data rows with oem_no...');

    const { rows: scrapeRows } = await client.query(`
      SELECT
        vsd.sku         AS vtwin_sku,
        cu.sku          AS catalog_sku,
        vsd.oem_no
      FROM vtwin_scrape_data vsd
      JOIN catalog_unified cu
        ON cu.sku = CONCAT('VT-', vsd.sku)
        AND cu.is_active = true
        AND cu.source_vendor = 'VTWIN'
      WHERE vsd.oem_no IS NOT NULL
        AND TRIM(vsd.oem_no) != ''
        AND TRIM(UPPER(vsd.oem_no)) NOT IN ('N/A', 'NA', 'NONE', '-')
      ORDER BY vsd.sku
    `);

    console.log(`  Found ${scrapeRows.length} vtwin_scrape_data rows with oem_no\n`);

    if (scrapeRows.length === 0) {
      console.log('Nothing to import. Exiting.');
      return;
    }

    // ------------------------------------------------------------------
    // 2. Fetch existing crossref entries for VTWIN source so we can
    //    report true new vs already-present.
    // ------------------------------------------------------------------
    const { rows: existingRows } = await client.query(`
      SELECT sku, oem_number
      FROM catalog_oem_crossref
      WHERE source = 'vtwin_scrape'
    `);

    const existingSet = new Set(existingRows.map(r => `${r.sku}||${r.oem_number}`));
    console.log(`  Existing vtwin_scrape entries in crossref: ${existingSet.size}`);

    // ------------------------------------------------------------------
    // 3. Build insert rows
    // ------------------------------------------------------------------
    const toInsert = []; // { sku, oem_number }
    const skipped = { noOem: 0, parseEmpty: 0, alreadyExists: 0 };
    const skuMismatches = [];

    for (const row of scrapeRows) {
      const oems = parseOemNo(row.oem_no);

      if (oems.length === 0) {
        skipped.parseEmpty++;
        continue;
      }

      for (const oem of oems) {
        const key = `${row.catalog_sku}||${oem}`;
        if (existingSet.has(key)) {
          skipped.alreadyExists++;
          continue;
        }
        toInsert.push({ sku: row.catalog_sku, oem_number: oem });
        existingSet.add(key); // prevent dupes within this run
      }
    }

    console.log(`\nPrepared ${toInsert.length} rows to insert`);
    console.log(`  Skipped — parse returned empty: ${skipped.parseEmpty}`);
    console.log(`  Skipped — already in crossref:  ${skipped.alreadyExists}`);

    // Show a sample
    if (toInsert.length > 0) {
      console.log('\nSample (first 10):');
      toInsert.slice(0, 10).forEach(r =>
        console.log(`  ${r.sku.padEnd(20)} → ${r.oem_number}`)
      );
      if (toInsert.length > 10) {
        console.log(`  ... and ${toInsert.length - 10} more`);
      }
    }

    // ------------------------------------------------------------------
    // 4. Insert (if --apply)
    // ------------------------------------------------------------------
    if (!APPLY) {
      console.log('\nDry run complete. Pass --apply to commit.\n');
      return;
    }

    console.log('\nInserting...');

    // Batch in chunks of 500
    const CHUNK = 500;
    let inserted = 0;
    let conflicts = 0;

    await client.query('BEGIN');

    try {
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);

        // Build parameterised VALUES list
        const values = [];
        const params = [];
        let p = 1;

        for (const row of chunk) {
          values.push(`($${p++}, $${p++}, 'vtwin_scrape', false)`);
          params.push(row.sku, row.oem_number);
        }

        const sql = `
          INSERT INTO catalog_oem_crossref
            (sku, oem_number, source, expanded_from)
          VALUES ${values.join(',\n          ')}
          ON CONFLICT (sku, oem_number) DO NOTHING
        `;

        const result = await client.query(sql, params);
        inserted += result.rowCount;
        conflicts += chunk.length - result.rowCount;

        process.stdout.write(`\r  Processed ${Math.min(i + CHUNK, toInsert.length)} / ${toInsert.length}`);
      }

      await client.query('COMMIT');
      console.log('\n');
      console.log(`✅ Done.`);
      console.log(`   Inserted:  ${inserted}`);
      console.log(`   Conflicts: ${conflicts} (ON CONFLICT DO NOTHING)`);

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // ------------------------------------------------------------------
    // 5. Final counts
    // ------------------------------------------------------------------
    const { rows: [{ total }] } = await client.query(`
      SELECT COUNT(*) AS total FROM catalog_oem_crossref WHERE source = 'vtwin_scrape'
    `);
    const { rows: [{ grand }] } = await client.query(`
      SELECT COUNT(*) AS grand FROM catalog_oem_crossref
    `);

    console.log(`\n--- Final crossref counts ---`);
    console.log(`   vtwin_scrape rows: ${total}`);
    console.log(`   Total crossref:    ${grand}`);
    console.log('');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
