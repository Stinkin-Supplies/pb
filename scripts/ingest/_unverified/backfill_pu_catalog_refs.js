/**
 * backfill_pu_catalog_refs.js
 *
 * Copies catalog page references from pu_products_filtered into catalog_unified
 * so the PDP can show "26 DRAG FATBOOK / Page 1575" style references.
 *
 * Sources in pu_products_filtered:
 *   fatbook_year      e.g. "26"       (= 2026)
 *   fatbook_code      e.g. "E"
 *   fatbook_year_page e.g. "261575"   (year+page concatenated)
 *   oldbook_year      e.g. "24"
 *   oldbook_code      e.g. "E"
 *   oldbook_year_page e.g. "241200"
 *
 * We format these into human-readable strings:
 *   "26 DRAG FATBOOK / Page 1575"
 *   "24 DRAG OLDBOOK / Page 1200"
 *
 * Destination:
 *   catalog_unified.page_reference  (text column, already exists)
 *   catalog_unified.fatbook_page    (already exists)
 *   catalog_unified.oldbook_page    (already exists)
 *
 * Also backfills:
 *   catalog_unified.in_harddrive    — from pu_products_filtered.in_harddrive if column exists
 *   catalog_unified.in_fatbook      — from fatbook_year_page IS NOT NULL
 *   catalog_unified.in_oldbook      — from oldbook_year_page IS NOT NULL
 *
 * Safe to re-run — UPDATE WHERE NULL / WHERE different value.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/backfill_pu_catalog_refs.js [--dry-run]
 */

import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

/**
 * Format a fatbook/oldbook reference into a human-readable string.
 * fatbook_year = "26", fatbook_year_page = "261575"
 * → "26 DRAG FATBOOK / Page 1575"
 */
function formatCatalogRef(type, yearStr, yearPageStr, codeStr) {
  // yearPageStr is typically year (2 digits) + page (4 digits) = 6 chars
  // e.g. "261575" → year=26, page=1575
  const catalogName = type === 'fatbook' ? 'DRAG FATBOOK' : 'DRAG OLDBOOK';
  const year = yearStr ?? yearPageStr?.slice(0, 2) ?? '';
  const page = yearPageStr?.length > 2 ? yearPageStr.slice(2) : null;
  const pagePart = page ? ` / Page ${page}` : '';
  return `${year} ${catalogName}${pagePart}`.trim();
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n📖 backfill_pu_catalog_refs.js${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

    // ── Verify columns we'll use ──────────────────────────────────────────────
    console.log('Checking available columns in pu_products_filtered...');
    const { rows: pfCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pu_products_filtered'
      ORDER BY ordinal_position
    `);
    const pfColSet = new Set(pfCols.map(r => r.column_name));
    console.log('  pu_products_filtered columns:', [...pfColSet].filter(c =>
      c.includes('book') || c.includes('fatbook') || c.includes('oldbook') || c.includes('drag') || c.includes('harley')
    ).join(', '));

    const { rows: cuCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'catalog_unified'
        AND column_name IN ('page_reference','fatbook_page','oldbook_page','in_harddrive','in_fatbook','in_oldbook','drag_part')
    `);
    const cuColSet = new Set(cuCols.map(r => r.column_name));
    console.log('  catalog_unified relevant columns:', [...cuColSet].join(', '));
    console.log();

    // ── 1. Backfill fatbook_page ────────────────────────────────────────────────
    if (pfColSet.has('fatbook_year_page') && cuColSet.has('fatbook_page')) {
      console.log('Step 1: Backfilling fatbook_page...');
      if (!DRY_RUN) {
        const r = await client.query(`
          UPDATE catalog_unified cu
          SET fatbook_page = puf.fatbook_year_page
          FROM pu_products_filtered puf
          WHERE (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
            AND cu.source_vendor = 'PU'
            AND (cu.fatbook_page IS NULL OR cu.fatbook_page = '')
            AND puf.fatbook_year_page IS NOT NULL
            AND puf.fatbook_year_page != ''
        `);
        console.log(`  ✅ fatbook_page: ${r.rowCount} rows updated`);
      } else {
        const { rows: [s] } = await client.query(`
          SELECT COUNT(*) AS would_update FROM catalog_unified cu
          JOIN pu_products_filtered puf ON (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
          WHERE cu.source_vendor = 'PU'
            AND (cu.fatbook_page IS NULL OR cu.fatbook_page = '')
            AND puf.fatbook_year_page IS NOT NULL AND puf.fatbook_year_page != ''
        `);
        console.log(`  DRY RUN: would update ${s.would_update} rows`);
      }
    }

    // ── 2. Backfill oldbook_page ────────────────────────────────────────────────
    if (pfColSet.has('oldbook_year_page') && cuColSet.has('oldbook_page')) {
      console.log('Step 2: Backfilling oldbook_page...');
      if (!DRY_RUN) {
        const r = await client.query(`
          UPDATE catalog_unified cu
          SET oldbook_page = puf.oldbook_year_page
          FROM pu_products_filtered puf
          WHERE (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
            AND cu.source_vendor = 'PU'
            AND (cu.oldbook_page IS NULL OR cu.oldbook_page = '')
            AND puf.oldbook_year_page IS NOT NULL
            AND puf.oldbook_year_page != ''
        `);
        console.log(`  ✅ oldbook_page: ${r.rowCount} rows updated`);
      } else {
        const { rows: [s] } = await client.query(`
          SELECT COUNT(*) AS would_update FROM catalog_unified cu
          JOIN pu_products_filtered puf ON (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
          WHERE cu.source_vendor = 'PU'
            AND (cu.oldbook_page IS NULL OR cu.oldbook_page = '')
            AND puf.oldbook_year_page IS NOT NULL AND puf.oldbook_year_page != ''
        `);
        console.log(`  DRY RUN: would update ${s.would_update} rows`);
      }
    }

    // ── 3. Build human-readable page_reference ──────────────────────────────────
    // Combine fatbook + oldbook refs into a single display string
    if (cuColSet.has('page_reference')) {
      console.log('Step 3: Building page_reference display strings...');
      if (!DRY_RUN) {
        // Build from fatbook_year + fatbook_year_page
        const hasFatbookYear = pfColSet.has('fatbook_year');
        const hasOldbookYear = pfColSet.has('oldbook_year');

        const fatRef = hasFatbookYear
          ? `CASE WHEN puf.fatbook_year_page IS NOT NULL AND puf.fatbook_year_page != ''
               THEN CONCAT(puf.fatbook_year, ' DRAG FATBOOK / Page ', SUBSTRING(puf.fatbook_year_page, 3))
               ELSE NULL END`
          : `CASE WHEN puf.fatbook_year_page IS NOT NULL AND puf.fatbook_year_page != ''
               THEN CONCAT(SUBSTRING(puf.fatbook_year_page, 1, 2), ' DRAG FATBOOK / Page ', SUBSTRING(puf.fatbook_year_page, 3))
               ELSE NULL END`;

        const oldRef = hasOldbookYear
          ? `CASE WHEN puf.oldbook_year_page IS NOT NULL AND puf.oldbook_year_page != ''
               THEN CONCAT(puf.oldbook_year, ' DRAG OLDBOOK / Page ', SUBSTRING(puf.oldbook_year_page, 3))
               ELSE NULL END`
          : `CASE WHEN puf.oldbook_year_page IS NOT NULL AND puf.oldbook_year_page != ''
               THEN CONCAT(SUBSTRING(puf.oldbook_year_page, 1, 2), ' DRAG OLDBOOK / Page ', SUBSTRING(puf.oldbook_year_page, 3))
               ELSE NULL END`;

        const r = await client.query(`
          UPDATE catalog_unified cu
          SET page_reference = CONCAT_WS(' | ',
            ${fatRef},
            ${oldRef}
          )
          FROM pu_products_filtered puf
          WHERE (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
            AND cu.source_vendor = 'PU'
            AND (
              (puf.fatbook_year_page IS NOT NULL AND puf.fatbook_year_page != '')
              OR (puf.oldbook_year_page IS NOT NULL AND puf.oldbook_year_page != '')
            )
        `);
        console.log(`  ✅ page_reference: ${r.rowCount} rows updated`);
      } else {
        const { rows: [s] } = await client.query(`
          SELECT COUNT(*) AS would_update FROM catalog_unified cu
          JOIN pu_products_filtered puf ON (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
          WHERE cu.source_vendor = 'PU'
            AND ((puf.fatbook_year_page IS NOT NULL AND puf.fatbook_year_page != '')
              OR (puf.oldbook_year_page IS NOT NULL AND puf.oldbook_year_page != ''))
        `);
        console.log(`  DRY RUN: would update ${s.would_update} rows`);
      }
    }

    // ── 4. Sync in_fatbook / in_oldbook flags ──────────────────────────────────
    console.log('Step 4: Syncing in_fatbook / in_oldbook flags...');
    if (!DRY_RUN) {
      if (cuColSet.has('in_fatbook') && pfColSet.has('fatbook_year_page')) {
        const r = await client.query(`
          UPDATE catalog_unified cu
          SET in_fatbook = true
          FROM pu_products_filtered puf
          WHERE (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
            AND cu.source_vendor = 'PU'
            AND cu.in_fatbook = false
            AND puf.fatbook_year_page IS NOT NULL
            AND puf.fatbook_year_page != ''
        `);
        console.log(`  ✅ in_fatbook set true: ${r.rowCount} rows`);
      }

      if (cuColSet.has('in_oldbook') && pfColSet.has('oldbook_year_page')) {
        const r = await client.query(`
          UPDATE catalog_unified cu
          SET in_oldbook = true
          FROM pu_products_filtered puf
          WHERE (cu.sku = puf.sku OR cu.sku = puf.sku_punctuated)
            AND cu.source_vendor = 'PU'
            AND cu.in_oldbook = false
            AND puf.oldbook_year_page IS NOT NULL
            AND puf.oldbook_year_page != ''
        `);
        console.log(`  ✅ in_oldbook set true: ${r.rowCount} rows`);
      }
    } else {
      console.log('  DRY RUN: skipping flag updates');
    }

    // ── 5. Summary ──────────────────────────────────────────────────────────────
    console.log('\n📊 Coverage summary:');
    const { rows: summary } = await client.query(`
      SELECT
        COUNT(*) AS total_pu,
        COUNT(CASE WHEN fatbook_page IS NOT NULL AND fatbook_page != '' THEN 1 END) AS has_fatbook_page,
        COUNT(CASE WHEN oldbook_page IS NOT NULL AND oldbook_page != '' THEN 1 END) AS has_oldbook_page,
        COUNT(CASE WHEN page_reference IS NOT NULL AND page_reference != '' THEN 1 END) AS has_page_ref,
        COUNT(CASE WHEN in_fatbook = true THEN 1 END) AS in_fatbook,
        COUNT(CASE WHEN in_oldbook = true THEN 1 END) AS in_oldbook
      FROM catalog_unified
      WHERE source_vendor = 'PU'
    `);
    console.table(summary);

    // Show sample page_references
    const { rows: samples } = await client.query(`
      SELECT sku, name, page_reference, fatbook_page, oldbook_page
      FROM catalog_unified
      WHERE source_vendor = 'PU'
        AND page_reference IS NOT NULL
        AND page_reference != ''
      LIMIT 10
    `);
    if (samples.length > 0) {
      console.log('\nSample page_reference values:');
      console.table(samples);
    }

    console.log('\n✅ backfill_pu_catalog_refs complete');
    console.log('\n⚠️  Remember to reindex Typesense after running this:');
    console.log('   TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
