#!/usr/bin/env node
/**
 * ingest_ds_xml.js
 * ----------------
 * Enriches catalog_unified PU rows using Drag Specialties catalog XML.
 *
 * DS is a PU sub-brand, NOT a separate vendor. This script only updates
 * existing PU rows — it does NOT insert new records.
 *
 * Match key: DS partNumber = catalog_unified.sku (confirmed 4,304 overlap)
 *
 * Updates (fill-only by default, --force to overwrite):
 *   name        ← productName  (more complete than PU's partDescription)
 *   description ← productName  (as base description if missing)
 *   features    ← bullet1–24 concatenated as "• bullet\n• bullet\n..."
 *   image_url   ← productImage (preferred) || partImage
 *   cost        ← yourDealerPrice
 *   msrp        ← baseRetailPrice
 *   original_retail ← originalRetailPrice
 *
 * Writes reconciliation CSV for the ~2,449 DS parts not in catalog.
 *
 * Usage:
 *   node ingest_ds_xml.js
 *   node ingest_ds_xml.js --dry-run
 *   node ingest_ds_xml.js --force
 *   node ingest_ds_xml.js --report-only   # only writes reconciliation CSV
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN     = process.argv.includes('--dry-run');
const FORCE       = process.argv.includes('--force');
const REPORT_ONLY = process.argv.includes('--report-only');

const DATA_DIR = path.resolve('scripts/data');
const XML_FILE = path.join(DATA_DIR, 'Drag-Specialties_Catalog_Content_Export.xml');
const ZIP_FILES = [
  path.resolve('scripts/ingest/pu-zips/Drag-Specialties.zip'),
  path.resolve('scripts/ingest/pu-zips/Drag-Specialties-Seats.zip'),
];
const RECON_OUT = path.join(DATA_DIR, 'ds_unmatched_parts.csv');

const BATCH = 150;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Parse DS XML ──────────────────────────────────────────────────────────────

function parseXml() {
  console.log('📂  Parsing Drag Specialties XML…');
  let xml = null;

  if (fs.existsSync(XML_FILE)) {
    xml = fs.readFileSync(XML_FILE, 'utf8');
    console.log(`   → using ${XML_FILE}`);
  } else {
    for (const zipPath of ZIP_FILES) {
      if (!fs.existsSync(zipPath)) continue;
      const zip = new AdmZip(zipPath);
      const entry =
        zip.getEntries().find(e => /Brand_Catalog_Content_Export\.xml$/i.test(e.entryName)) ??
        zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.xml'));
      if (!entry) continue;
      xml = entry.getData().toString('utf8');
      console.log(`   → using ${zipPath} :: ${entry.entryName}`);
      break;
    }
  }

  if (!xml) {
    throw new Error(
      `Could not find Drag Specialties XML. Expected ${XML_FILE} or one of: ${ZIP_FILES.join(', ')}`
    );
  }

  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
  const doc = parser.parse(xml);
  const parts = Array.isArray(doc.root.part) ? doc.root.part : [doc.root.part];

  const records = [];
  for (const p of parts) {
    // Collect non-empty bullets
    const bullets = [];
    for (let i = 1; i <= 24; i++) {
      const b = p[`bullet${i}`];
      if (b && String(b).trim()) bullets.push(String(b).trim());
    }

    const partNumber   = String(p.partNumber || '').trim();
    const productImage = String(p.productImage || '').trim() || null;
    const partImage    = String(p.partImage || '').trim() || null;

    records.push({
      part_number      : partNumber,
      sku_punctuated   : String(p.punctuatedPartNumber || '').trim(),
      status           : String(p.partStatusDescription || '').trim(),
      part_description : String(p.partDescription || '').trim(),
      product_name     : String(p.productName || '').trim(),
      image_url        : productImage || partImage,   // prefer product image
      base_dealer      : parseFloat(p.baseDealerPrice) || null,
      your_dealer      : parseFloat(p.yourDealerPrice) || null,
      base_retail      : parseFloat(p.baseRetailPrice) || null,
      original_retail  : parseFloat(p.originalRetailPrice) || null,
      supplier_num     : String(p.supplierNumber || '').trim(),
      special_instr    : String(p.specialInstructions || '').trim() || null,
      bullets,
      features_text    : bullets.map(b => `• ${b}`).join('\n'),
    });
  }

  console.log(`   → ${records.length} DS parts parsed`);
  return records;
}

// ── Write reconciliation CSV for unmatched parts ──────────────────────────────

function writeReconReport(unmatched) {
  const header = 'part_number,sku_punctuated,status,product_name,your_dealer,base_retail,bullet_count,special_instructions\n';
  const rows = unmatched.map(p => [
    p.part_number,
    p.sku_punctuated,
    p.status,
    `"${p.product_name.replace(/"/g, '""')}"`,
    p.your_dealer ?? '',
    p.base_retail ?? '',
    p.bullets.length,
    `"${(p.special_instr || '').replace(/"/g, '""')}"`,
  ].join(',')).join('\n');

  fs.writeFileSync(RECON_OUT, header + rows, 'utf8');
  console.log(`\n📄  Reconciliation report written: ${RECON_OUT}`);
  console.log(`    ${unmatched.length} unmatched DS parts — review for possible import`);
  console.log(`    Tip: filter to status=STANDARD rows and check if any fall under`);
  console.log(`         PU product codes you currently exclude (non-A/E/C codes).`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  ingest_ds_xml.js  ${DRY_RUN ? '[DRY RUN]' : ''}${FORCE ? '[FORCE]' : ''}${REPORT_ONLY ? '[REPORT ONLY]' : ''}\n`);

  const dsParts = parseXml();
  const dsMap = new Map(dsParts.map(p => [p.part_number, p]));

  const client = await pool.connect();
  try {
    // Fetch all PU rows
    console.log('\n📡  Fetching PU rows from catalog_unified…');
    const { rows: catalog } = await client.query(`
      SELECT id, sku, name, description, features, image_url,
             cost, msrp, original_retail
      FROM catalog_unified
      WHERE source_vendor = 'PU'
    `);
    console.log(`   → ${catalog.length} PU rows in catalog`);

    const catSkuSet = new Set(catalog.map(r => r.sku));
    const matched   = [];
    const unmatched = [];

    for (const [pn, p] of dsMap) {
      if (catSkuSet.has(pn)) matched.push(p);
      else unmatched.push(p);
    }

    console.log(`   → ${matched.length} DS parts matched to catalog`);
    console.log(`   → ${unmatched.length} DS parts not in catalog (see reconciliation report)`);

    // Always write the recon report
    writeReconReport(unmatched);

    if (REPORT_ONLY) {
      console.log('\n   --report-only: stopping before updates');
      return;
    }

    // Build update list
    const catBySkuMap = new Map(catalog.map(r => [r.sku, r]));
    const updates = [];
    const pb = new ProgressBar(matched.length, 'DS enrich');

    for (const ds of matched) {
      pb.increment();
      const row = catBySkuMap.get(ds.part_number);
      if (!row) continue;

      const setClauses = [];
      const params     = [];
      let   p          = 1;

      const set = (col, newVal, existing) => {
        if (!newVal) return;
        if (!FORCE && existing) return;
        setClauses.push(`${col} = $${p++}`);
        params.push(newVal);
      };

      // Only update name if DS has a better (longer) product name
      if (ds.product_name && ds.product_name.length > (row.name || '').length) {
        if (FORCE || !row.name) {
          setClauses.push(`name = $${p++}`);
          params.push(ds.product_name);
        }
      }

      set('description', ds.product_name,  row.description);
      set('features',    ds.features_text,  row.features);
      set('image_url',   ds.image_url,      row.image_url);

      // Pricing — only set if non-zero
      if (ds.your_dealer && ds.your_dealer > 0 && (FORCE || !row.cost)) {
        setClauses.push(`cost = $${p++}`);
        params.push(ds.your_dealer);
      }
      if (ds.base_retail && ds.base_retail > 0 && (FORCE || !row.msrp)) {
        setClauses.push(`msrp = $${p++}`);
        params.push(ds.base_retail);
      }
      if (ds.original_retail && ds.original_retail > 0 && (FORCE || !row.original_retail)) {
        setClauses.push(`original_retail = $${p++}`);
        params.push(ds.original_retail);
      }

      if (setClauses.length === 0) continue;
      setClauses.push(`updated_at = NOW()`);
      params.push(row.id);

      updates.push({
        sql: `UPDATE catalog_unified SET ${setClauses.join(', ')} WHERE id = $${p}`,
        params,
      });
    }
    pb.finish();

    console.log(`\n📝  ${updates.length} rows to update`);

    if (!DRY_RUN && updates.length > 0) {
      await client.query('BEGIN');
      const pb2 = new ProgressBar(updates.length, 'Writing');
      for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        for (const u of batch) await client.query(u.sql, u.params);
        pb2.update(Math.min(i + BATCH, updates.length));
      }
      await client.query('COMMIT');
      pb2.finish();
    }

    console.log('\n✅  Done.');
    console.log(`   DS parts matched + updated : ${updates.length}`);
    console.log(`   DS parts not in catalog    : ${unmatched.length}`);
    if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no changes written to DB');

  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK');
    console.error('❌  Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
