#!/usr/bin/env node
/**
 * sync_pu_status.cjs
 *
 * Syncs Parts Unlimited part status from a fresh pricefile download.
 * Two passes:
 *   1. Update pu_catalog.part_status for every SKU in the fresh file.
 *   2. Mark catalog_unified.is_active=false / is_discontinued=true for PU
 *      parts where part_status IN ('D','DISCONTINUED','X') OR the SKU is
 *      completely absent from the fresh pricefile (PU dropped it).
 *
 * Usage:
 *   node sync_pu_status.cjs --csv=scripts/data/pu_pricefile/20260407pu-pricefile.csv
 *   node sync_pu_status.cjs --csv=... --dry
 *
 * Without --csv, downloads a fresh file from PU API first.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const DRY  = process.argv.includes('--dry');
const pool = new Pool({
  host: '5.161.100.126', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

// ── CSV arg ───────────────────────────────────────────────────────────────────
const csvArg = process.argv.find(a => a.startsWith('--csv='));
const CSV_PATH = csvArg
  ? path.resolve(process.cwd(), csvArg.slice('--csv='.length))
  : null;

// ── Download helpers ──────────────────────────────────────────────────────────
const DEALER   = process.env.PARTS_UNLIMITED_DEALER_NUMBER || 'D00108';
const USERNAME = process.env.PARTS_UNLIMITED_USERNAME      || 'website';
const PASSWORD = process.env.PARTS_UNLIMITED_PASSWORD      || 'Smelly26';

const { execSync } = require('child_process');

async function downloadFreshPricefile() {
  const outDir  = path.resolve(__dirname, '../data/pu_pricefile');
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const zipFile = path.join(outDir, `${dateStr}pu-pricefile.zip`);
  const csvFile = path.join(outDir, `${dateStr}pu-pricefile.csv`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const auth = Buffer.from(`${DEALER}/${USERNAME}:${PASSWORD}`).toString('base64');
  const body = JSON.stringify({
    dealerCodes: [DEALER],
    headersPrepended: true,
    attachingCatalogs: ['OLDBOOK', 'OLDBOOK_MIDYEAR', 'FATBOOK', 'FATBOOK_MIDYEAR'],
    auxillaryColumns: ['BRAND_NAME','UPC_CODE','PRODUCT_CODE','WEIGHT','DROPSHIP_FEE'],
  });

  console.log('Downloading fresh PU pricefile…');
  await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'dealer.parts-unlimited.com',
      path: '/api/quotes/v2/pricefile',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', d => err += d);
        res.on('end', () => reject(new Error(`PU API ${res.statusCode}: ${err}`)));
        return;
      }
      const out = fs.createWriteStream(zipFile);
      let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; out.write(chunk); process.stdout.write(`  ${(bytes/1e6).toFixed(1)} MB\r`); });
      res.on('end', () => { out.end(() => resolve()); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  console.log(`\n  Downloaded to ${zipFile}`);

  // Unzip — find the CSV inside
  const tmpDir = path.join(outDir, `_unzip_${dateStr}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  execSync(`unzip -o "${zipFile}" -d "${tmpDir}"`, { stdio: 'inherit' });

  // Find the CSV in the unzipped dir
  const files = fs.readdirSync(tmpDir);
  const csv = files.find(f => f.toLowerCase().endsWith('.csv') || f.toLowerCase().endsWith('.txt'));
  if (!csv) throw new Error(`No CSV found in zip. Files: ${files.join(', ')}`);

  const src = path.join(tmpDir, csv);
  fs.copyFileSync(src, csvFile);
  fs.rmSync(tmpDir, { recursive: true });
  console.log(`  CSV saved to ${csvFile}`);
  return csvFile;
}

// ── CSV parser ────────────────────────────────────────────────────────────────
// Handles quoted fields with embedded commas.
function parseCSVLine(line) {
  const fields = [];
  let inQ = false, cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
    else { cur += c; }
  }
  fields.push(cur);
  return fields;
}

function parsePricefile(csvPath) {
  console.log(`Parsing ${csvPath}…`);
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
  // header: Part Number(0), Punctuated Part Number(1), ..., Part Status(4)
  const skuMap = new Map(); // sku (no dashes) → {status, punctuated}
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const sku    = (fields[0] || '').replace(/"/g,'').trim();
    const status = (fields[4] || '').replace(/"/g,'').trim().toUpperCase();
    if (!sku) { skipped++; continue; }
    skuMap.set(sku, status);
  }
  console.log(`  Parsed ${skuMap.size} SKUs (${skipped} blank lines skipped)`);
  return skuMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n═══ PU Status Sync ${DRY ? '[DRY RUN]' : '[LIVE]'} ═══\n`);

  // Get/download CSV
  let csvPath = CSV_PATH;
  if (!csvPath) {
    csvPath = await downloadFreshPricefile();
  } else {
    console.log(`Using existing CSV: ${csvPath}`);
  }

  const skuMap = parsePricefile(csvPath);

  // ── Pull all active PU rows from our catalog ──────────────────────────────
  const puRows = await q(`
    SELECT cu.id, cu.vendor_sku, pc.part_status AS current_status
    FROM catalog_unified cu
    LEFT JOIN pu_catalog pc ON pc.sku = cu.vendor_sku
    WHERE cu.source_vendor = 'PU' AND cu.is_active = true
  `);
  console.log(`\nFound ${puRows.length} active PU rows in catalog_unified`);

  const DEAD_STATUSES = new Set(['D', 'DISCONTINUED', 'X', 'INACTIVE', 'O', 'OBSOLETE']);

  const toDeactivate = [];
  const reasons      = { status_d: 0, absent: 0, already_dead_in_pu: 0 };

  for (const row of puRows) {
    const freshStatus = skuMap.get(row.vendor_sku); // undefined = absent
    if (freshStatus === undefined) {
      // Not in pricefile at all — PU dropped it
      toDeactivate.push({ id: row.id, vendor_sku: row.vendor_sku, reason: 'absent from pricefile' });
      reasons.absent++;
    } else if (DEAD_STATUSES.has(freshStatus)) {
      toDeactivate.push({ id: row.id, vendor_sku: row.vendor_sku, reason: `status=${freshStatus}` });
      reasons.status_d++;
    }
    // else: 'S' = STANDARD = active, leave alone
  }

  console.log(`\n── Triage ──`);
  console.log(`  Absent from pricefile: ${reasons.absent}`);
  console.log(`  Discontinued status:   ${reasons.status_d}`);
  console.log(`  Total to deactivate:   ${toDeactivate.length}`);

  if (toDeactivate.length) {
    console.log('\nSample (first 10):');
    toDeactivate.slice(0, 10).forEach(r =>
      console.log(`  [${r.vendor_sku}] ${r.reason}`)
    );
  }

  if (DRY) {
    console.log('\nDry run — no changes made.');
    await pool.end();
    return;
  }

  if (toDeactivate.length === 0) {
    console.log('\nNothing to deactivate.');
    await pool.end();
    return;
  }

  const ids = toDeactivate.map(r => r.id);
  await q(`
    UPDATE catalog_unified
    SET is_active = false, is_discontinued = true
    WHERE id = ANY($1::int[])
  `, [ids]);
  console.log(`\n✓ Deactivated ${ids.length} PU parts in catalog_unified`);
  console.log('Run Typesense reindex next: node scripts/ingest/index_unified.js');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
