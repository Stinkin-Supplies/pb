require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool       = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CSV_PATH   = process.argv[2] || './master-item-list.csv';
const BATCH_SIZE = 500;
const CHECKPOINT = './wps-master-item-checkpoint.json';

function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — line: ${d.line} | updated: ${d.updated}\n`);
    return d;
  }
  return { line: 0, updated: 0, skipped: 0, failed: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── Parse CSV handling quoted fields with embedded commas/quotes ──
function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function isValid(val) {
  if (!val) return false;
  const s = val.toString().trim();
  return s.length > 0 && s !== 'null' && s !== 'undefined' && s !== 'N/A' && s !== '0';
}

async function run() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌  CSV not found: ${CSV_PATH}`);
    console.error(`    Usage: node wps-master-item-import.js ./master-item-list.csv`);
    process.exit(1);
  }

  const client     = await pool.connect();
  const checkpoint = loadCheckpoint();
  let { line: startLine, updated, skipped, failed } = checkpoint;

  console.log('▶  WPS Master Item List Import\n');
  console.log(`   CSV: ${path.resolve(CSV_PATH)}`);

  const content    = fs.readFileSync(CSV_PATH, 'utf8');
  const lines      = content.split('\n');
  const headers    = parseCSVLine(lines[0]);
  const totalLines = lines.length - 1;
  console.log(`   Total rows: ${totalLines.toLocaleString()}`);
  console.log(`   Headers: ${headers.join(', ')}\n`);

  // Column indexes
  const idx = {};
  headers.forEach((h, i) => { idx[h.trim()] = i; });

  // Build SKU → catalog_product_id lookup
  console.log('   Building SKU lookup...');
  const { rows: skuRows } = await client.query(`
    SELECT vo.vendor_part_number AS sku, vo.catalog_product_id
    FROM public.vendor_offers vo
    WHERE vo.vendor_code = 'wps'
      AND vo.vendor_part_number IS NOT NULL
  `);
  const skuMap = {};
  for (const row of skuRows) skuMap[row.sku] = row.catalog_product_id;
  console.log(`   Loaded ${Object.keys(skuMap).length.toLocaleString()} WPS SKU mappings\n`);

  let batch   = [];
  let lineNum = 0;

  try {
    for (let i = 1; i < lines.length; i++) {
      lineNum = i;
      if (lineNum <= startLine) continue;

      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      const sku  = cols[idx['sku']]?.trim();
      if (!sku) { skipped++; continue; }

      const catalogProductId = skuMap[sku];
      if (!catalogProductId) { skipped++; continue; }

      const description     = cols[idx['product_description']]?.trim()  || null;
      const features        = cols[idx['product_features']]?.trim()     || null;
      const productName     = cols[idx['product_name']]?.trim()         || null;
      const productType     = cols[idx['product_type']]?.trim()         || null;

      // Only process rows that have something useful
      if (!isValid(description) && !isValid(features) && !isValid(productName)) {
        skipped++;
        continue;
      }

      batch.push({ catalogProductId, sku, description, features, productName, productType });

      if (batch.length >= BATCH_SIZE) {
        const { u, f } = await flushBatch(client, batch);
        updated += u; failed += f;
        batch = [];
        saveCheckpoint({ line: lineNum, updated, skipped, failed });

        const pct = Math.round((lineNum / totalLines) * 100);
        process.stdout.write(
          `\r  Progress: ${lineNum.toLocaleString()} / ${totalLines.toLocaleString()} (${pct}%) | updated: ${updated.toLocaleString()} | skipped: ${skipped.toLocaleString()}`
        );
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const { u, f } = await flushBatch(client, batch);
      updated += u; failed += f;
    }

    clearCheckpoint();

    console.log(`\n\n✅  WPS master item import complete!`);
    console.log(`   Updated:  ${updated.toLocaleString()}`);
    console.log(`   Skipped:  ${skipped.toLocaleString()}`);
    console.log(`   Failed:   ${failed}`);

    // Final DB summary
    const { rows: [summary] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') AS with_desc,
        COUNT(*) AS total
      FROM public.catalog_products
      WHERE is_active = true
    `);
    const pct = Math.round(Number(summary.with_desc) / Number(summary.total) * 100);
    console.log(`\n   Active products with description: ${Number(summary.with_desc).toLocaleString()} / ${Number(summary.total).toLocaleString()} (${pct}%)`);

    // Also update vendor.vendor_products description_raw for future syncs
    console.log('\n   Backfilling vendor.vendor_products.description_raw...');
    const { rowCount } = await client.query(`
      UPDATE vendor.vendor_products vp
      SET description_raw = cp_data.description
      FROM (
        SELECT vo.vendor_part_number, cp.description
        FROM public.catalog_products cp
        JOIN public.vendor_offers vo ON vo.catalog_product_id = cp.id
        WHERE vo.vendor_code = 'wps'
          AND cp.description IS NOT NULL
          AND cp.description != ''
          AND (vp.description_raw IS NULL OR vp.description_raw = '' OR vp.description_raw = 'null')
      ) cp_data
      WHERE vp.vendor_part_number = cp_data.vendor_part_number
        AND vp.vendor_code = 'wps'
    `);
    console.log(`   vendor_products.description_raw updated: ${rowCount?.toLocaleString() ?? 0}`);

  } catch (err) {
    console.error('\n❌  Import failed:', err.message);
    console.error('    Re-run to resume from checkpoint.');
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Flush batch to catalog_products ──────────────────────────
async function flushBatch(client, batch) {
  let u = 0, f = 0;

  for (const { catalogProductId, description, features, productName, productType } of batch) {
    try {
      // Build description — combine description + features if both exist
      let finalDesc = null;
      if (isValid(description) && isValid(features)) {
        finalDesc = `${description.trim()}\n\nFeatures:\n${features.trim()}`;
      } else if (isValid(description)) {
        finalDesc = description.trim();
      } else if (isValid(features)) {
        finalDesc = features.trim();
      }

      // Only update if we have something to write
      if (!finalDesc && !isValid(productName)) { continue; }

      await client.query(`
        UPDATE public.catalog_products
        SET
          description = COALESCE(
            CASE WHEN $1::text IS NOT NULL AND $1::text != '' THEN $1::text ELSE NULL END,
            description
          ),
          updated_at = NOW()
        WHERE id = $2
          AND (description IS NULL OR description = '')
      `, [finalDesc, catalogProductId]);
      u++;
    } catch (err) {
      f++;
      if (f <= 5) console.error(`\n  ❌  [${catalogProductId}]: ${err.message}`);
    }
  }

  return { u, f };
}

function isValid(val) {
  if (!val) return false;
  const s = val.toString().trim();
  return s.length > 2 && s !== 'null' && s !== 'undefined' && s !== 'N/A';
}

run();
