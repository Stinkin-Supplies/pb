/**
 * generate_vtwin_skus.js
 * Assigns internal_sku values to VTwin products that don't have one yet.
 * Reads display_category → prefix mapping, allocates from sku_counter,
 * and writes directly to catalog_unified.internal_sku.
 *
 * Usage:
 *   node scripts/ingest/generate_vtwin_skus.js            # dry run
 *   node scripts/ingest/generate_vtwin_skus.js --apply    # writes to DB
 */

import pg from 'pg';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');

const db = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

// display_category → SKU prefix
// Verify these match your sku_counter.prefix rows before running --apply.
const DISPLAY_CATEGORY_TO_PREFIX = {
  'Engine':                 'ENG',
  'Exhaust':                'EXH',
  'Brakes':                 'BRK',
  'Electrical':             'ELC',
  'Suspension':             'SUS',
  'Transmission & Clutch':  'DRV',
  'Wheels & Tires':         'WHL',
  'Fenders & Body':         'BDY',
  'Handlebar & Controls':   'HBR',
  'Lighting':               'LGT',
  'Carburetion & Fuel':     'FUL',
  'Frame & Hardware':       'FRM',
  'Foot Controls':          'FTC',
  'Seating':                'STG',
  'Instrumentation':        'INS',
  'Luggage & Racks':        'LUG',
  'Security & Covers':      'SEC',
  'Accessories & Misc':     'ACC',
  'Riding Gear & Apparel':  'RGA',
  'Tools & Chemicals':      'TLC',
};

const FALLBACK_PREFIX = 'MSC'; // used when display_category is null or unmapped

async function main() {
  console.log(`=== VTwin SKU Generation (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  // Step 1: Products needing SKUs
  const { rows: products } = await db.query(`
    SELECT id, name, display_category
    FROM catalog_unified
    WHERE source_vendor = 'VTWIN'
      AND is_active = true
      AND internal_sku IS NULL
    ORDER BY id
  `);
  console.log(`Products needing SKUs: ${products.length.toLocaleString()}`);

  if (products.length === 0) {
    console.log('Nothing to do.');
    await db.end();
    return;
  }

  // Step 2: Load current sku_counter values
  const { rows: counterRows } = await db.query(
    `SELECT prefix, last_val FROM sku_counter ORDER BY prefix`
  );
  const counters = Object.fromEntries(counterRows.map(r => [r.prefix.trim(), r.last_val]));
  console.log(`Loaded ${Object.keys(counters).length} sku_counter prefixes: ${Object.keys(counters).join(', ')}\n`);

  // Step 3: Assign SKUs in memory
  const assignments = [];
  const fallbackRows = [];

  for (const p of products) {
    const prefix = DISPLAY_CATEGORY_TO_PREFIX[p.display_category] ?? FALLBACK_PREFIX;
    if (!DISPLAY_CATEGORY_TO_PREFIX[p.display_category]) {
      fallbackRows.push({ name: p.name, display_category: p.display_category });
    }
    counters[prefix] = (counters[prefix] ?? 100000) + 1;
    assignments.push({
      id:           p.id,
      internal_sku: `${prefix}${counters[prefix]}.v`,
      prefix,
    });
  }

  // Step 4: Summary
  const byPrefix = {};
  for (const a of assignments) byPrefix[a.prefix] = (byPrefix[a.prefix] ?? 0) + 1;

  console.log('SKUs to assign by prefix:');
  for (const [pfx, cnt] of Object.entries(byPrefix).sort()) {
    console.log(`  ${pfx.padEnd(6)} ${cnt.toLocaleString()}`);
  }

  if (fallbackRows.length > 0) {
    console.log(`\n⚠️  ${fallbackRows.length} products have null/unmapped display_category → assigned ${FALLBACK_PREFIX}`);
    fallbackRows.slice(0, 10).forEach(p =>
      console.log(`     [${p.display_category ?? 'NULL'}] ${p.name}`)
    );
    if (fallbackRows.length > 10) console.log(`     … and ${fallbackRows.length - 10} more`);
    console.log('  → Run infer_vtwin_categories.mjs --live first to fix this.');
  }

  // Step 5: Validate all prefixes exist in sku_counter
  const missingPrefixes = Object.keys(byPrefix).filter(p => !(p in counters));
  if (missingPrefixes.length > 0) {
    console.error(`\n❌ Prefixes missing from sku_counter: ${missingPrefixes.join(', ')}`);
    console.error('   Add them with: INSERT INTO sku_counter (prefix, last_val) VALUES (\'XXX\', 100000);');
    if (APPLY) {
      await db.end();
      process.exit(1);
    }
  }

  if (!APPLY) {
    console.log('\nDry run — pass --apply to write to DB.');
    await db.end();
    return;
  }

  // Step 6: Write SKUs + update counters in a transaction
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const BATCH = 500;
    let updated = 0;
    for (let i = 0; i < assignments.length; i += BATCH) {
      const batch  = assignments.slice(i, i + BATCH);
      const cases  = batch.map((_, j) => `WHEN id = $${j * 2 + 1} THEN $${j * 2 + 2}`).join(' ');
      const ids    = batch.map((_, j) => `$${j * 2 + 1}`).join(', ');
      const flat   = batch.flatMap(a => [a.id, a.internal_sku]);
      const res    = await client.query(
        `UPDATE catalog_unified SET internal_sku = CASE ${cases} END WHERE id IN (${ids})`, flat
      );
      updated += res.rowCount ?? 0;
      process.stdout.write(`  … ${Math.min(i + BATCH, assignments.length)} / ${assignments.length}\r`);
    }
    console.log(`\n  catalog_unified updated: ${updated.toLocaleString()} rows`);

    // Upsert sku_counter for all touched prefixes
    for (const [prefix, newVal] of Object.entries(counters)) {
      await client.query(
        `INSERT INTO sku_counter (prefix, last_val, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (prefix) DO UPDATE SET last_val = $2, updated_at = now()`,
        [prefix, newVal]
      );
    }
    console.log('  sku_counter updated ✅');

    await client.query('COMMIT');
    console.log('\n✅ Done.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await db.end();
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
