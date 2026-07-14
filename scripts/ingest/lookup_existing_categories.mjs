// lookup_existing_categories.mjs
//
// Before mapping the 69 hand-annotated "change_to" values from Laken's CSV
// to real display_category/display_subcategory pairs, confirm what actually
// exists in the DB. Several change_to values (Memorabilia, Chopper Supplies,
// Gas tank, Riser cover, Fork bearing guard, Saddlebag accessories, Trash
// can, Turnsignal lens, Instillation Tool, Frame- neck numbers, Gloves/Hat,
// Exhaust) don't have confirmed existing names in project memory.
//
// Read-only. No writes.
//
// Run: node lookup_existing_categories.mjs

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
    // 1. All distinct top-level categories currently in use
    const catsRes = await client.query(`
      SELECT display_category, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category IS NOT NULL
      GROUP BY display_category
      ORDER BY display_category
    `);
    console.log('=== All display_category values ===');
    for (const r of catsRes.rows) {
      console.log(`  ${r.n.toString().padStart(6)}  ${r.display_category}`);
    }

    // 2. Subcategories for the categories we're fairly confident about,
    // to confirm exact naming before use
    const checkCats = [
      'Riding Gear & Apparel',
      'Fenders & Body',
      'Lighting',
      'Luggage & Racks',
      'Frames & Suspension',
      'Exhaust',
      'Security & Covers',
      'Tools & Chemicals',
    ];
    for (const cat of checkCats) {
      const subRes = await client.query(
        `
        SELECT display_subcategory, COUNT(*)::int AS n
        FROM catalog_unified
        WHERE is_active = true AND display_category = $1 AND display_subcategory IS NOT NULL
        GROUP BY display_subcategory
        ORDER BY n DESC
        `,
        [cat]
      );
      console.log(`\n=== Subcategories under "${cat}" ===`);
      if (subRes.rows.length === 0) {
        console.log('  (none found -- category may not exist under this exact name)');
      }
      for (const r of subRes.rows) {
        console.log(`  ${r.n.toString().padStart(6)}  ${r.display_subcategory}`);
      }
    }

    // 3. Fuzzy search for "Chopper" and "Memorabilia" anywhere in category
    // or subcategory, in case they exist under slightly different names
    const fuzzyRes = await client.query(`
      SELECT DISTINCT display_category, display_subcategory
      FROM catalog_unified
      WHERE is_active = true
        AND (display_category ILIKE '%chopper%' OR display_subcategory ILIKE '%chopper%'
             OR display_category ILIKE '%memorabilia%' OR display_subcategory ILIKE '%memorabilia%'
             OR display_category ILIKE '%merch%' OR display_subcategory ILIKE '%merch%')
    `);
    console.log('\n=== Fuzzy match: chopper / memorabilia / merch ===');
    for (const r of fuzzyRes.rows) {
      console.log(`  ${r.display_category} / ${r.display_subcategory}`);
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
