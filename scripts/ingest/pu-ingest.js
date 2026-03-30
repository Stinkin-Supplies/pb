require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── CONFIG ────────────────────────────────────────────────────────────────────
const ZIPS_DIR      = './pu-zips';       // folder containing your PU ZIP files
const EXTRACT_DIR   = './pu-extracted';  // where ZIPs get extracted to
const CHECKPOINT    = './pu-checkpoint.json';

// ── Warehouse ID map ──────────────────────────────────────────────────────────
const WAREHOUSES = {
  'WI Availability': 'pu-wi',
  'NY Availability': 'pu-ny',
  'TX Availability': 'pu-tx',
  'CA Availability': 'pu-ca',
  'NV Availability': 'pu-nv',
  'NC Availability': 'pu-nc',
};

function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseAvailability(val) {
  if (!val || val === 'N/A') return 0;
  if (val === '+') return 10; // 10+ means at least 10
  return parseInt(val) || 0;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────
function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2));
}

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — file: ${data.currentFile}, row: ${data.row}`);
    return data;
  }
  return { completedFiles: [], currentFile: null, row: 0, inserted: 0, failed: 0 };
}

function clearCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
}

// ── Extract ZIP files ─────────────────────────────────────────────────────────
function extractZips() {
  if (!fs.existsSync(EXTRACT_DIR)) fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  const zips = fs.readdirSync(ZIPS_DIR).filter(f => f.endsWith('.zip'));
  console.log(`📦  Found ${zips.length} ZIP files — extracting...\n`);
  for (const zip of zips) {
    const zipPath = path.join(ZIPS_DIR, zip);
    const extractTo = path.join(EXTRACT_DIR, path.basename(zip, '.zip'));
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
      try {
        execSync(`unzip -q "${zipPath}" -d "${extractTo}"`);
        console.log(`  ✅  Extracted: ${zip}`);
      } catch (err) {
        console.error(`  ❌  Failed to extract ${zip}:`, err.message);
      }
    } else {
      console.log(`  ⏭️   Already extracted: ${zip}`);
    }
  }
  console.log('');
}

// ── Find all CSV files ────────────────────────────────────────────────────────
function findCSVFiles() {
  const csvFiles = [];
  const dirs = fs.readdirSync(EXTRACT_DIR);
  for (const dir of dirs) {
    const dirPath = path.join(EXTRACT_DIR, dir);
    if (fs.statSync(dirPath).isDirectory()) {
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv') || f.endsWith('.CSV'));
      for (const file of files) {
        csvFiles.push(path.join(dirPath, file));
      }
    }
  }
  return csvFiles;
}

// ── Parse one CSV row and upsert ─────────────────────────────────────────────
async function upsertRow(client, row) {
  const partNumber   = row['Part Number']?.trim();
  const vendorPart   = row['Vendor Part Number']?.trim() || row['Vendor Punctuated Part Number']?.trim();
  const description  = row['Part Description']?.trim();
  const brand        = row['Brand Name']?.trim() ?? null;
  const status       = row['Part Status']?.trim() ?? null;
  const msrp         = num(row['Original Retail']);
  const mapPrice     = num(row['Current Suggested Retail']);
  const dealerPrice  = num(row['Your Dealer Price'] ?? row['Base Dealer Price']);
  const weight       = num(row['Weight']);
  const upc          = row['UPC Code']?.trim() ?? null;
  const productType  = row['Product Code']?.trim() ?? null;
  const nationalQty  = parseAvailability(row['National Availability']);

  if (!partNumber) return null; // skip blank rows

  const attributes = {
    hazardous_code:  row['Hazardous Code']?.trim() ?? null,
    truck_part_only: row['Truck Part Only']?.trim() ?? null,
    ad_policy:       row['Ad Policy']?.trim() ?? null,
    trademark:       row['Trademark']?.trim() ?? null,
    drag_part:       row['Drag Part']?.trim() ?? null,
    country_origin:  row['Country of Origin']?.trim() ?? null,
    part_add_date:   row['Part Add Date']?.trim() ?? null,
  };

  // Build inventory array per warehouse
  const inventoryRows = [];
  for (const [field, warehouseId] of Object.entries(WAREHOUSES)) {
    const qty = parseAvailability(row[field]);
    inventoryRows.push({ warehouseId, qty });
  }

  await client.query(`
    INSERT INTO vendor.vendor_products (
      id, vendor_code,
      vendor_part_number, manufacturer_part_number,
      title, brand,
      categories_raw, attributes_raw,
      msrp, map_price, wholesale_cost,
      images_raw, fitment_raw,
      weight, upc, status, product_type,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), 'pu',
      $1, $2, $3, $4,
      $5::jsonb, $6::jsonb,
      $7, $8, $9,
      $10::jsonb, $11::jsonb,
      $12, $13, $14, $15,
      NOW(), NOW()
    )
    ON CONFLICT (vendor_part_number) DO UPDATE SET
      manufacturer_part_number = EXCLUDED.manufacturer_part_number,
      title                    = EXCLUDED.title,
      brand                    = EXCLUDED.brand,
      attributes_raw           = EXCLUDED.attributes_raw,
      msrp                     = EXCLUDED.msrp,
      map_price                = EXCLUDED.map_price,
      wholesale_cost           = EXCLUDED.wholesale_cost,
      weight                   = EXCLUDED.weight,
      upc                      = EXCLUDED.upc,
      status                   = EXCLUDED.status,
      product_type             = EXCLUDED.product_type,
      updated_at               = NOW()
  `, [
    partNumber,                           // $1  vendor_part_number
    vendorPart ?? partNumber,             // $2  manufacturer_part_number
    description ?? null,                  // $3  title
    brand,                                // $4  brand
    JSON.stringify([]),                   // $5  categories_raw
    JSON.stringify(attributes),           // $6  attributes_raw
    msrp,                                 // $7  msrp
    mapPrice,                             // $8  map_price
    dealerPrice,                          // $9  wholesale_cost
    JSON.stringify([]),                   // $10 images_raw
    JSON.stringify([]),                   // $11 fitment_raw
    weight,                               // $12 weight
    upc,                                  // $13 upc
    status,                               // $14 status
    productType,                          // $15 product_type
  ]);

  return inventoryRows;
}

// ── Upsert inventory for one row ──────────────────────────────────────────────
async function upsertInventory(client, partNumber, inventoryRows) {
  for (const { warehouseId, qty } of inventoryRows) {
    await client.query(`
      INSERT INTO vendor.vendor_inventory
        (id, vendor_code, vendor_part_number, warehouse_id, quantity_on_hand, quantity_on_order, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'pu', $1, $2, $3, 0, NOW(), NOW())
      ON CONFLICT (vendor_code, vendor_part_number, warehouse_id) DO UPDATE SET
        quantity_on_hand = EXCLUDED.quantity_on_hand,
        updated_at       = NOW()
    `, [partNumber, warehouseId, qty]);
  }
}

// ── Process one CSV file line by line ─────────────────────────────────────────
async function processCSV(client, csvPath, startRow = 0) {
  return new Promise((resolve, reject) => {
    let headers = null;
    let rowNum = 0;
    let inserted = 0;
    let failed = 0;

    const rl = readline.createInterface({
      input: fs.createReadStream(csvPath, { encoding: 'latin1' }), // PU uses latin1
      crlfDelay: Infinity,
    });

    const queue = [];
    let processing = false;

    async function processQueue() {
      if (processing) return;
      processing = true;
      while (queue.length > 0) {
        const { row, lineNum } = queue.shift();
        if (lineNum <= startRow) continue; // skip already-processed rows
        try {
          const inventoryRows = await upsertRow(client, row);
          if (inventoryRows) {
            await upsertInventory(client, row['Part Number']?.trim(), inventoryRows);
            inserted++;
          }
        } catch (err) {
          failed++;
          await client.query(
            `INSERT INTO vendor.vendor_error_log
               (id, vendor_code, vendor_part_number, error_type, error_message, created_at)
             VALUES (gen_random_uuid(), 'pu', $1, 'insert_failed', $2, NOW())`,
            [row['Part Number'] ?? 'unknown', err.message]
          ).catch(() => {});
        }
      }
      processing = false;
    }

    rl.on('line', (line) => {
      if (!line.trim()) return;
      const cols = parseCSVLine(line);
      if (!headers) {
        headers = cols;
        return;
      }
      rowNum++;
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = cols[i] ?? ''; });
      queue.push({ row, lineNum: rowNum });
      processQueue();
    });

    rl.on('close', async () => {
      // Wait for queue to drain
      while (queue.length > 0 || processing) {
        await new Promise(r => setTimeout(r, 100));
      }
      resolve({ inserted, failed, totalRows: rowNum });
    });

    rl.on('error', reject);
  });
}

// ── Simple CSV line parser (handles quoted fields) ────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Log sync ──────────────────────────────────────────────────────────────────
async function logSync(client, stats) {
  await client.query(`
    INSERT INTO vendor.vendor_sync_log
      (id, vendor_code, sync_type, status, rows_inserted, rows_failed, started_at, completed_at, notes)
    VALUES
      (gen_random_uuid(), 'pu', 'full_catalog', $1, $2, $3, $4, NOW(), $5)
  `, [stats.status, stats.inserted, stats.failed, stats.startedAt, stats.notes]);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const startedAt = new Date();
  const checkpoint = loadCheckpoint();
  let totalInserted = checkpoint.inserted;
  let totalFailed   = checkpoint.failed;

  console.log('▶  Starting PU catalog ingestion...\n');

  // Step 1: Extract all ZIPs
  extractZips();

  // Step 2: Find all CSV files
  const csvFiles = findCSVFiles();
  console.log(`📄  Found ${csvFiles.length} CSV files to process\n`);

  try {
    for (const csvPath of csvFiles) {
      const fileName = path.basename(csvPath);

      // Skip already completed files from checkpoint
      if (checkpoint.completedFiles.includes(csvPath)) {
        console.log(`  ⏭️   Skipping (already done): ${fileName}`);
        continue;
      }

      const startRow = checkpoint.currentFile === csvPath ? checkpoint.row : 0;
      console.log(`  📄  Processing: ${fileName}${startRow > 0 ? ` (resuming from row ${startRow})` : ''}`);

      const { inserted, failed, totalRows } = await processCSV(client, csvPath, startRow);
      totalInserted += inserted;
      totalFailed   += failed;

      checkpoint.completedFiles.push(csvPath);
      checkpoint.currentFile = null;
      checkpoint.row = 0;
      checkpoint.inserted = totalInserted;
      checkpoint.failed   = totalFailed;
      saveCheckpoint(checkpoint);

      console.log(`     ✅  ${fileName}: ${inserted} inserted, ${failed} failed (${totalRows} total rows)`);
    }

    await logSync(client, {
      status: totalFailed === 0 ? 'success' : 'partial',
      inserted: totalInserted, failed: totalFailed, startedAt,
      notes: `${csvFiles.length} CSV files processed.`,
    });

    clearCheckpoint();
    console.log(`\n✅  PU Done — ${totalInserted} products, ${totalFailed} errors`);

  } catch (err) {
    await logSync(client, { status: 'failed', inserted: totalInserted, failed: totalFailed, startedAt, notes: err.message });
    console.error('\n❌  PU sync failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
