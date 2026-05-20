#!/usr/bin/env node
/**
 * ingest_pu_fitment_scrape.cjs
 * Parses catalog_fitment_enriched.csv → pu_fitment, pu_fitment_parsed, pu_fitment_expanded
 * Also extracts HD OEM numbers into catalog_oem_crossref
 */

const { Pool } = require('pg');
const fs = require('fs');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

const CSV_PATH = '/Users/home/Desktop/ds-fitment-scraper/catalog_fitment_enriched.csv';
const DRY_RUN = process.argv.includes('--dry');

// ── OEM extraction ─────────────────────────────────────────────────────────────
// Valid HD OEM formats:
//   XXXXX-XX[A] (5+2, optional letter) e.g. 17955-48, 34906-85A
//   XXXX-XX[A]  (4+2, optional letter) e.g. 8991-91
//   XXXXXXX     (6-8 digit pure numeric, no dash) e.g. 2404478, 6056736
const HD_OEM_DASH_RE = /^\d{4,5}-\d{2}[A-Za-z]?$/;
const HD_OEM_NODASH_RE = /^\d{7}$/;  // exactly 7 digits — HD legacy OEM format

function extractOemNumbers(rawOem, sku) {
  if (!rawOem || !rawOem.trim()) return [];
  // Strip non-numeric/dash chars from SKU for comparison
  const skuDigits = (sku || '').replace(/[^0-9]/g, '');
  return rawOem.split(';').map(s => s.trim()).filter(s => {
    if (!s) return false;
    if (!(HD_OEM_DASH_RE.test(s) || HD_OEM_NODASH_RE.test(s))) return false;
    // Skip if the OEM number is just the SKU's digits (self-reference noise)
    const oemDigits = s.replace(/[^0-9]/g, '');
    if (skuDigits && oemDigits === skuDigits) return false;
    return true;
  });
}

// ── Fitment parsing ────────────────────────────────────────────────────────────

// HD model codes start with FL, FX, XL, VR, RA, RH, EL, KH, WL, or single letters (FL, FLH etc)
// Must be at least 2 chars, all caps/digits, may have dash
const MODEL_CODE_RE = /^(F[LX][A-Z0-9-]{0,10}|XL[A-Z0-9-]{0,6}|VR[A-Z0-9-]{0,6}|RA[A-Z0-9-]{0,6}|RH[A-Z0-9-]{0,6}|EL[A-Z0-9-]{0,4}|KH[A-Z0-9-]{0,4}|WL[A-Z0-9-]{0,4})$/i;

function cleanSegment(s) {
  // Strip tab artifacts: "Name\t-\t-" or "Name\t-"
  return s.replace(/(\t\s*[-–])+/g, '').replace(/\t/g, ' ').trim();
}

function extractModelCode(words) {
  // Try each word — take the first that looks like an HD model code
  for (const w of words) {
    const clean = w.replace(/[^A-Z0-9-]/gi, '');
    if (MODEL_CODE_RE.test(clean) && clean.length >= 2) return clean.toUpperCase();
  }
  return null;
}

const SEGMENT_RE = /^(\d{4})(?:-(\d{4}))?\s+Harley[-\s]Davidson\s+(.*)/i;

function parseSegment(raw) {
  const s = cleanSegment(raw);
  const m = s.match(SEGMENT_RE);
  if (!m) return null;

  const year_start = parseInt(m[1]);
  const year_end   = m[2] ? parseInt(m[2]) : year_start;
  const rest       = m[3].trim();

  // Split rest into words and find the model code anywhere in it
  const words = rest.split(/\s+/);
  const model_code = extractModelCode(words);
  if (!model_code) return null;

  return { year_start, year_end, model_code, raw_segment: s };
}

function parseFitmentString(str) {
  if (!str || !str.trim()) return [];
  return str.split(';').map(s => parseSegment(s.trim())).filter(Boolean);
}

// ── CSV reader ─────────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(current); current = ''; }
    else { current += ch; }
  }
  fields.push(current);
  return fields;
}

async function readCSV(path) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path) });
  let header = null;
  for await (const line of rl) {
    if (!header) { header = line.split(','); continue; }
    const fields = parseCSVLine(line);
    rows.push({
      sku:             fields[0]?.trim(),
      fitment_details: fields[1]?.trim(),
      oem_numbers:     fields[2]?.trim(),
      fitment_status:  fields[3]?.trim(),
    });
  }
  return rows;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('Reading CSV...');
  const allRows = await readCSV(CSV_PATH);
  console.log(`Total rows: ${allRows.length}`);

  const foundRows = allRows.filter(r => r.fitment_status === 'found');
  console.log(`Found rows: ${foundRows.length}`);

  const skuData = [];
  let skipped = 0, noCode = 0;

  for (const row of foundRows) {
    const segments  = parseFitmentString(row.fitment_details);
    const oemNumbers = extractOemNumbers(row.oem_numbers, row.sku);
    if (!segments.length) { skipped++; continue; }
    skuData.push({ sku: row.sku, segments, oemNumbers });
  }

  console.log(`Parsed: ${skuData.length} SKUs with fitment, skipped: ${skipped}`);

  const totalSegments = skuData.reduce((a, d) => a + d.segments.length, 0);
  let totalExpanded = 0;
  for (const d of skuData)
    for (const s of d.segments)
      totalExpanded += (s.year_end - s.year_start + 1);
  const totalOem = skuData.filter(d => d.oemNumbers.length > 0).length;

  if (DRY_RUN) {
    console.log('\nSample (first 5 SKUs):');
    for (const d of skuData.slice(0, 5)) {
      console.log(`\n  SKU: ${d.sku} (${d.segments.length} segments, OEM: [${d.oemNumbers.join(', ')}])`);
      for (const s of d.segments.slice(0, 4))
        console.log(`    ${s.year_start}-${s.year_end} ${s.model_code}  ← ${s.raw_segment.substring(0, 60)}`);
    }
    console.log(`\nWould insert:`);
    console.log(`  pu_fitment:          ${skuData.length}`);
    console.log(`  pu_fitment_parsed:   ${totalSegments}`);
    console.log(`  pu_fitment_expanded: ${totalExpanded}`);
    console.log(`  SKUs with OEM data:  ${totalOem}`);
    console.log('\nSample OEM extractions:');
    skuData.filter(d => d.oemNumbers.length).slice(0, 10).forEach(d =>
      console.log(`  ${d.sku} → [${d.oemNumbers.join(', ')}]`)
    );
    return;
  }

  const client = await pool.connect();
  try {
    console.log('\nTruncating tables...');
    await client.query(`TRUNCATE pu_fitment, pu_fitment_parsed, pu_fitment_expanded RESTART IDENTITY`);

    // ── pu_fitment ────────────────────────────────────────────────────────────
    console.log('Inserting pu_fitment...');
    let n = 0;
    for (const d of skuData) {
      const allCodes   = [...new Set(d.segments.map(s => s.model_code))];
      const yearRanges = d.segments.map(s => ({ start: s.year_start, end: s.year_end, code: s.model_code }));
      await client.query(`
        INSERT INTO pu_fitment (sku, brand, year_start, year_end, year_ranges, hd_codes, is_harley, is_universal, parsed_from)
        VALUES ($1,$2,$3,$4,$5,$6,true,false,'pu_scrape')
        ON CONFLICT (sku) DO UPDATE SET
          year_start = EXCLUDED.year_start, year_end = EXCLUDED.year_end,
          year_ranges = EXCLUDED.year_ranges, hd_codes = EXCLUDED.hd_codes,
          parsed_from = EXCLUDED.parsed_from
      `, [d.sku, 'Harley-Davidson',
          Math.min(...d.segments.map(s => s.year_start)),
          Math.max(...d.segments.map(s => s.year_end)),
          JSON.stringify(yearRanges), allCodes]);
      n++;
      if (n % 500 === 0) process.stdout.write(`\r  pu_fitment: ${n}/${skuData.length}`);
    }
    console.log(`\n  ✅ pu_fitment: ${n} rows`);

    // ── pu_fitment_parsed ─────────────────────────────────────────────────────
    console.log('Inserting pu_fitment_parsed...');
    n = 0;
    for (const d of skuData) {
      for (const seg of d.segments) {
        await client.query(`
          INSERT INTO pu_fitment_parsed (sku, year_start, year_end, model_code, raw_segment)
          VALUES ($1,$2,$3,$4,$5)
        `, [d.sku, seg.year_start, seg.year_end, seg.model_code, seg.raw_segment]);
        n++;
        if (n % 2000 === 0) process.stdout.write(`\r  pu_fitment_parsed: ${n}`);
      }
    }
    console.log(`\n  ✅ pu_fitment_parsed: ${n} rows`);

    // ── pu_fitment_expanded ───────────────────────────────────────────────────
    console.log('Inserting pu_fitment_expanded...');
    n = 0;
    const seen = new Set();
    for (const d of skuData) {
      for (const seg of d.segments) {
        for (let yr = seg.year_start; yr <= seg.year_end; yr++) {
          const key = `${d.sku}|${yr}|${seg.model_code}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await client.query(`
            INSERT INTO pu_fitment_expanded (sku, year, model_code)
            VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
          `, [d.sku, yr, seg.model_code]);
          n++;
          if (n % 5000 === 0) process.stdout.write(`\r  pu_fitment_expanded: ${n}`);
        }
      }
    }
    console.log(`\n  ✅ pu_fitment_expanded: ${n} rows`);

    // ── OEM → catalog_oem_crossref ────────────────────────────────────────────
    console.log('Inserting OEM numbers...');
    n = 0;
    for (const d of skuData) {
      for (const oem of d.oemNumbers) {
        await client.query(`
          INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
          VALUES ($1,$2,'HD','pu_scrape') ON CONFLICT DO NOTHING
        `, [d.sku, oem]);
        n++;
      }
    }
    console.log(`  ✅ catalog_oem_crossref: ${n} OEM rows`);

    // ── Summary ───────────────────────────────────────────────────────────────
    const { rows: [s] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM pu_fitment)          AS fitment_rows,
        (SELECT COUNT(*) FROM pu_fitment_parsed)   AS parsed_rows,
        (SELECT COUNT(*) FROM pu_fitment_expanded) AS expanded_rows,
        (SELECT COUNT(DISTINCT model_code) FROM pu_fitment_expanded) AS unique_models,
        (SELECT MIN(year) FROM pu_fitment_expanded) AS earliest_year,
        (SELECT MAX(year) FROM pu_fitment_expanded) AS latest_year
    `);
    console.log('\n✅ Summary:', s);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
