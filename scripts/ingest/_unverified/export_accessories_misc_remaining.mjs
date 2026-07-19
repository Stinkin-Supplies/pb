// export_accessories_misc_remaining.mjs
//
// Exports the remaining NULL-subcategory rows in Accessories & Misc after
// wave-4 (expected ~686) to a CSV file for manual review.
//
// Read-only. No writes.
//
// Run: node export_accessories_misc_remaining.mjs

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, name, vendor_sku
      FROM catalog_unified
      WHERE display_category = 'Accessories & Misc'
        AND display_subcategory IS NULL
        AND is_active = true
      ORDER BY name
    `);

    console.log(`Found ${res.rows.length} remaining NULL-subcategory rows in Accessories & Misc.`);

    const header = 'id,name,vendor_sku';
    const lines = res.rows.map(
      (r) => `${csvEscape(r.id)},${csvEscape(r.name)},${csvEscape(r.vendor_sku)}`
    );
    const csv = [header, ...lines].join('\n');

    const outPath = path.resolve(__dirname, 'accessories_misc_remaining.csv');
    fs.writeFileSync(outPath, csv, 'utf8');
    console.log(`Wrote CSV to ${outPath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
