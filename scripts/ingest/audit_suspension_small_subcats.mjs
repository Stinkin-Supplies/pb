// audit_suspension_small_subcats.mjs
// Audit-only. Full dump of the 5 smaller/ambiguous Suspension subcategories
// (Triple Trees & Stems, Lowering & Lift Kits, Swingarms, Dampers & Cush Drive,
// Ride Control & Rear Support, Fork Lowers & Sliders, Steering Stem Hardware)
// -- 126 rows total, small enough to review every row instead of sampling,
// per the project's established "full dump for small categories" pattern.
//
// Run: node audit_suspension_small_subcats.mjs > suspension_small_subcats.txt 2>&1

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const SUBCATS = [
  'Triple Trees & Stems',
  'Lowering & Lift Kits',
  'Swingarms',
  'Dampers & Cush Drive',
  'Ride Control & Rear Support',
  'Fork Lowers & Sliders',
  'Steering Stem Hardware',
];

async function main() {
  const client = await pool.connect();
  try {
    let grandTotal = 0;
    for (const subcat of SUBCATS) {
      const { rows } = await client.query(`
        SELECT id, sku, vendor_sku, name, source_vendor
        FROM catalog_unified
        WHERE display_category = 'Suspension' AND display_subcategory = $1 AND is_active = true
        ORDER BY name
      `, [subcat]);
      console.log(`=== ${subcat} (${rows.length} rows) ===\n`);
      for (const r of rows) {
        console.log(`[${r.id}] (${r.source_vendor}) sku=${r.sku} vendor_sku=${r.vendor_sku} | ${r.name}`);
      }
      console.log('');
      grandTotal += rows.length;
    }
    console.log(`=== TOTAL across these 7 subcats: ${grandTotal} ===`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});
