// lookup_torque_linkage.mjs
//
// Pull full available detail for the 2 "Wyatt Gatling Touring Torque
// Linkage System" rows -- vendor_sku plus any other descriptive columns
// that might exist -- to figure out what system this part actually
// belongs to before deciding where to route it.
//
// Read-only. No writes.
//
// Run: node lookup_torque_linkage.mjs

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
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

async function main() {
  const client = await pool.connect();
  try {
    // First find out what columns actually exist on catalog_unified
    const colsRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'catalog_unified'
      ORDER BY ordinal_position
    `);
    console.log('=== catalog_unified columns ===');
    for (const r of colsRes.rows) {
      console.log(`  ${r.column_name}`);
    }

    // Then pull everything for these 2 specific rows using select *
    const rowRes = await client.query(`
      SELECT *
      FROM catalog_unified
      WHERE id IN (81205, 81206)
    `);
    console.log('\n=== Full row data for 81205, 81206 ===');
    for (const r of rowRes.rows) {
      console.log(JSON.stringify(r, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Lookup failed:', err);
  process.exit(1);
});
