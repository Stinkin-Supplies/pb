/**
 * generate_vtwin_skus.js
 * Generates internal SKUs for VTwin products and populates vendor.vtwin_sku_staging
 *
 * Usage: node scripts/ingest/generate_vtwin_skus.js
 */

import pg from 'pg';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const db = new Pool({
  connectionString: 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// ---------------------------------------------------------------------------
// Step 1: Fetch all VTwin products with their resolved category + prefix
// Pre-aggregates best category per page in a CTE to avoid correlated subqueries
// ---------------------------------------------------------------------------
async function fetchProducts() {
  console.log('\n[Step 1] Fetching VTwin products with resolved categories...');

  const { rows } = await db.query(`
    WITH page_best_category AS (
      SELECT DISTINCT ON (cp.page_number)
        cp.page_number,
        m.catalog_category,
        m.sku_prefix
      FROM vendor.vtwin_category_pages cp
      JOIN vendor.vtwin_category_to_catalog m ON m.vtwin_category = cp.category
      ORDER BY cp.page_number,
        CASE cp.source WHEN 'this_yr' THEN 1 ELSE 2 END,
        cp.category
    )
    SELECT
      p.sku        AS vtwin_sku,
      pc.catalog_category,
      pc.sku_prefix
    FROM vendor.vtwinmtc_products p
    JOIN page_best_category pc ON pc.page_number = p.this_yr_catpage
  `);

  console.log(`  Found ${rows.length.toLocaleString()} products with resolved categories`);

  // Products with page=0 or unresolved pages — assign ACC as fallback
  const { rows: unmatched } = await db.query(`
    SELECT sku        AS vtwin_sku,
           'General'  AS catalog_category,
           'ACC'      AS sku_prefix
    FROM vendor.vtwinmtc_products
    WHERE this_yr_catpage NOT IN (
      SELECT page_number FROM vendor.vtwin_category_pages
    )
  `);

  console.log(`  Found ${unmatched.length.toLocaleString()} unmatched products (will use ACC)`);

  return [...rows, ...unmatched];
}

// ---------------------------------------------------------------------------
// Step 2: Load current sku_counter values
// ---------------------------------------------------------------------------
async function loadSkuCounters() {
  const { rows } = await db.query(`SELECT prefix, last_val FROM sku_counter`);
  const counters = {};
  for (const row of rows) {
    counters[row.prefix.trim()] = row.last_val;
  }
  return counters;
}

// ---------------------------------------------------------------------------
// Step 3: Generate SKUs in memory
// ---------------------------------------------------------------------------
async function generateSkus(products, counters) {
  console.log('\n[Step 2] Generating internal SKUs...');

  const bar = new ProgressBar(products.length, 'Generating');
  const staged = [];
  const finalCounters = { ...counters };

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const prefix = p.sku_prefix.trim();

    finalCounters[prefix] = (finalCounters[prefix] || 100000) + 1;

    staged.push({
      vtwin_sku:        p.vtwin_sku,
      internal_sku:     prefix + finalCounters[prefix],
      catalog_category: p.catalog_category,
      sku_prefix:       prefix,
    });

    if (i % 500 === 0 || i === products.length - 1) {
      bar.update(i + 1);
    }
  }

  bar.finish();
  return { staged, finalCounters };
}

// ---------------------------------------------------------------------------
// Step 4: Bulk insert into vtwin_sku_staging + update sku_counter
// ---------------------------------------------------------------------------
async function persistSkus(staged, finalCounters) {
  console.log('\n[Step 3] Persisting SKUs to vtwin_sku_staging...');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Truncate staging table for clean run
    await client.query('TRUNCATE vendor.vtwin_sku_staging');

    const BATCH_SIZE = 1000;
    const bar = new ProgressBar(staged.length, 'Inserting');

    for (let i = 0; i < staged.length; i += BATCH_SIZE) {
      const batch = staged.slice(i, i + BATCH_SIZE);

      const values = batch.map((_, j) => {
        const base = j * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      }).join(', ');

      const params = batch.flatMap(r => [
        r.vtwin_sku,
        r.internal_sku,
        r.catalog_category,
        r.sku_prefix,
      ]);

      await client.query(`
        INSERT INTO vendor.vtwin_sku_staging
          (vtwin_sku, internal_sku, catalog_category, sku_prefix)
        VALUES ${values}
        ON CONFLICT (vtwin_sku) DO NOTHING
      `, params);

      bar.update(Math.min(i + BATCH_SIZE, staged.length));
    }

    bar.finish();

    // Update sku_counter for all prefixes touched
    console.log('\n[Step 4] Updating sku_counter...');
    for (const [prefix, newVal] of Object.entries(finalCounters)) {
      await client.query(`
        UPDATE sku_counter
        SET last_val = $1, updated_at = now()
        WHERE prefix = $2
      `, [newVal, prefix]);
    }

    await client.query('COMMIT');
    console.log('  sku_counter updated ✅');

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Step 5: Summary
// ---------------------------------------------------------------------------
async function printSummary() {
  console.log('\n[Step 5] Summary...');

  const { rows } = await db.query(`
    SELECT sku_prefix, COUNT(*) AS products,
           MIN(internal_sku) AS first_sku,
           MAX(internal_sku) AS last_sku
    FROM vendor.vtwin_sku_staging
    GROUP BY sku_prefix
    ORDER BY sku_prefix
  `);

  const { rows: total } = await db.query(
    `SELECT COUNT(*) AS total FROM vendor.vtwin_sku_staging`
  );

  console.log('\n  SKUs generated by prefix:');
  console.log('  ' + '-'.repeat(56));
  for (const r of rows) {
    console.log(
      `  ${r.sku_prefix.trim().padEnd(6)} ${String(r.products).padStart(6)} products` +
      `  ${r.first_sku} → ${r.last_sku}`
    );
  }
  console.log('  ' + '-'.repeat(56));
  console.log(`  TOTAL: ${Number(total[0].total).toLocaleString()} SKUs generated`);

  const { rows: counters } = await db.query(
    `SELECT prefix, last_val FROM sku_counter ORDER BY prefix`
  );
  console.log('\n  Updated sku_counter:');
  for (const r of counters) {
    console.log(`  ${r.prefix.trim().padEnd(6)} last_val = ${r.last_val}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== VTwin SKU Generation ===');
  try {
    const products                   = await fetchProducts();
    const counters                   = await loadSkuCounters();
    const { staged, finalCounters }  = await generateSkus(products, counters);
    await persistSkus(staged, finalCounters);
    await printSummary();
    console.log('\n✅ Done. Ready for unified catalog merge.\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
