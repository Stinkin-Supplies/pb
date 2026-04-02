/**
 * Stage 0 — Raw Vendor Capture
 * Stores raw vendor feeds unchanged into raw_vendor_* staging tables.
 * Supports: JSON files, CSV files, XML files — stored as text in payload JSONB.
 *
 * Tables written:
 *   raw_vendor_pu
 *   raw_vendor_wps_products
 *   raw_vendor_wps_inventory
 *   raw_vendor_pies
 *   raw_vendor_aces
 *
 * ON CONFLICT (source_file) DO UPDATE — safe to re-run, only updates changed files.
 */

import fs   from 'fs';
import path from 'path';
import { sql } from '../lib/db.js';

/**
 * Import all files in a folder into a raw staging table.
 * @param {string} folder - local folder path containing vendor files
 * @param {string} table  - target raw_vendor_* table name
 * @returns {{ imported: number, skipped: number, failed: number }}
 */
export async function importRaw(folder, table) {
  if (!fs.existsSync(folder)) {
    console.warn(`[Stage0] Folder not found, skipping: ${folder}`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  const files = fs.readdirSync(folder).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.json', '.csv', '.xml', '.txt'].includes(ext);
  });

  if (!files.length) {
    console.log(`[Stage0] No files found in ${folder}`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  console.log(`[Stage0] ${table} — ${files.length} files found in ${folder}`);

  let imported = 0, skipped = 0, failed = 0;

  for (const file of files) {
    const filePath = path.join(folder, file);
    try {
      const raw  = fs.readFileSync(filePath, 'utf8');
      // Store as JSON string — postgres JSONB will accept a JSON string payload
      // or a raw text payload wrapped in quotes. We normalise to a JSON-safe string.
      let payload;
      const ext = path.extname(file).toLowerCase();
      if (ext === '.json') {
        // Validate JSON before storing
        JSON.parse(raw);
        payload = raw;
      } else {
        // CSV / XML / TXT — store as JSON-encoded string so JSONB column accepts it
        payload = JSON.stringify(raw);
      }

      await sql`
        INSERT INTO ${sql(table)} (payload, source_file, imported_at)
        VALUES (${payload}::jsonb, ${file}, NOW())
        ON CONFLICT (source_file) DO UPDATE
          SET payload         = EXCLUDED.payload,
              imported_at     = NOW()
      `;

      imported++;
      if (imported % 10 === 0 || files.length <= 10) {
        console.log(`[Stage0] ${table} — ${imported}/${files.length} | ${file}`);
      }
    } catch (err) {
      console.error(`[Stage0] Failed ${file}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[Stage0] ${table} complete — imported: ${imported} | skipped: ${skipped} | failed: ${failed}`);
  return { imported, skipped, failed };
}

/**
 * Import a single WPS API response page directly (used by live sync routes).
 * Stores each page as a separate row keyed by page number + timestamp.
 */
export async function importWpsPage(pageData, pageNum, type = 'products') {
  const table = type === 'inventory' ? 'raw_vendor_wps_inventory' : 'raw_vendor_wps_products';
  const key   = `wps_page_${String(pageNum).padStart(6, '0')}_${Date.now()}`;

  await sql`
    INSERT INTO ${sql(table)} (payload, source_file, imported_at)
    VALUES (${JSON.stringify(pageData)}::jsonb, ${key}, NOW())
    ON CONFLICT (source_file) DO UPDATE
      SET payload = EXCLUDED.payload, imported_at = NOW()
  `;
}

/**
 * Import a PU price CSV row batch directly (used by live price file import).
 */
export async function importPuBatch(rows, batchKey) {
  await sql`
    INSERT INTO raw_vendor_pu (payload, source_file, imported_at)
    VALUES (${JSON.stringify(rows)}::jsonb, ${batchKey}, NOW())
    ON CONFLICT (source_file) DO UPDATE
      SET payload = EXCLUDED.payload, imported_at = NOW()
  `;
}
