// scripts/ingest/build_oem_part_timeline.mjs
//
// Populates oem_part_timeline from catalog_oem_crossref.
// Read-only against catalog_oem_crossref - only ever INSERTs into
// the new oem_part_timeline table. Safe to re-run (ON CONFLICT DO
// NOTHING on oem_number).
//
// Usage:
//   node scripts/ingest/build_oem_part_timeline.mjs            (dry-run, prints summary only)
//   node scripts/ingest/build_oem_part_timeline.mjs --apply    (actually inserts)
//
// Confirmed-source catalogs are treated as the trustworthy ones;
// everything else lands as 'likely'. Edit CONFIRMED_SOURCES below
// if you want to promote/demote a source.

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Sources that come straight from Harley's own catalogs.
// Everything else (vtwin scrapes, eastern, blank, etc.) is 'likely'.
const CONFIRMED_SOURCES = ['fatbook', 'oldbook', 'oem_catalog_hd', 'oem_catalog', 'ds_fatbook_2026', 'ds_oldbook_2026'];

function confidenceFor(source) {
  if (!source) return 'likely';
  const s = source.toLowerCase();
  return CONFIRMED_SOURCES.some((c) => s.includes(c)) ? 'confirmed' : 'likely';
}

function progressBar(done, total, width = 30) {
  const pct = total === 0 ? 0 : done / total;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  process.stdout.write(`\r[${bar}] ${(pct * 100).toFixed(1)}% — ${done}/${total}`);
}

async function main() {
  console.log(APPLY ? 'Running in APPLY mode — rows will be inserted.' : 'Running in DRY-RUN mode — no writes will happen.');

  const { rows } = await pool.query(`
    SELECT DISTINCT oem_number, source, product_id
    FROM catalog_oem_crossref
    WHERE oem_format = 'hd_oem'
      AND oem_number ~ '^\\d+-\\d{2}[A-Za-z]*$'
  `);

  console.log(`Found ${rows.length} candidate hd_oem rows in catalog_oem_crossref.`);

  const parsed = [];
  const skipped = [];

  for (const row of rows) {
    const dashIdx = row.oem_number.indexOf('-');
    const baseNumber = row.oem_number.slice(0, dashIdx);
    const rest = row.oem_number.slice(dashIdx + 1);
    const match = rest.match(/^(\d{2})([A-Za-z]*)$/);
    if (!match) {
      skipped.push(row.oem_number);
      continue;
    }
    const [, yy, letterSuffix] = match;
    const yyNum = parseInt(yy, 10);
    const baseLen = baseNumber.length;
    let computedYear;
    if (baseLen <= 4) {
      computedYear = 1900 + yyNum;
    } else if (yyNum <= 26) {
      computedYear = 2000 + yyNum;
    } else {
      computedYear = 1900 + yyNum;
    }

    parsed.push({
      base_number: baseNumber,
      oem_number: row.oem_number,
      letter_suffix: letterSuffix || null,
      computed_year: computedYear,
      confidence_tier: confidenceFor(row.source),
      source: row.source,
      product_id: row.product_id,
    });
  }

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} rows that didn't match the expected pattern (first 5: ${skipped.slice(0, 5).join(', ')})`);
  }

  // Summary before doing anything
  const families = new Set(parsed.map((p) => p.base_number));
  const confirmed = parsed.filter((p) => p.confidence_tier === 'confirmed').length;
  const likely = parsed.length - confirmed;

  console.log('\n--- Summary ---');
  console.log(`Rows to insert:     ${parsed.length}`);
  console.log(`Distinct families:  ${families.size}`);
  console.log(`Confirmed-tier:     ${confirmed}`);
  console.log(`Likely-tier:        ${likely}`);

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to insert into oem_part_timeline.');
    await pool.end();
    return;
  }

  console.log('\nInserting...');
  let inserted = 0;
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    await pool.query(
      `INSERT INTO oem_part_timeline
         (base_number, oem_number, letter_suffix, computed_year, confidence_tier, source, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (oem_number, product_id) DO NOTHING`,
      [p.base_number, p.oem_number, p.letter_suffix, p.computed_year, p.confidence_tier, p.source, p.product_id]
    );
    inserted++;
    if (inserted % 250 === 0 || inserted === parsed.length) {
      progressBar(inserted, parsed.length);
    }
  }
  console.log('\nDone.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
