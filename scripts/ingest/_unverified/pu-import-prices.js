require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool       = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CSV_PATH   = process.argv[2] || './D00108_PriceFile.csv';
const BATCH_SIZE = 500;

// ── Parse CSV ─────────────────────────────────────────────────
function parsePriceFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split('\n');
  const map     = {}; // punctuated_part_number → dealer_price

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const punctuated = (cols[1] ?? '').trim().replace(/^"|"$/g, '');
    const price      = parseFloat((cols[2] ?? '').trim().replace(/^"|"$/g, ''));
    if (punctuated && !isNaN(price) && price > 0) {
      map[punctuated] = price;
    }
  }
  return map;
}

async function run() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌  CSV not found: ${CSV_PATH}`);
    console.error(`    Usage: node pu-import-prices.js /path/to/D00108_PriceFile.csv`);
    process.exit(1);
  }

  const client = await pool.connect();

  console.log('▶  PU Price File Import\n');
  console.log(`   CSV: ${path.resolve(CSV_PATH)}`);

  // ── 1. Parse price file ───────────────────────────────────
  console.log('\n   Parsing price file...');
  const priceMap = parsePriceFile(CSV_PATH);
  console.log(`   Loaded ${Object.keys(priceMap).length.toLocaleString()} prices\n`);

  // ── 2. Fetch PU vendor offers missing wholesale_cost ─────
  console.log('   Fetching PU offers missing price...');
  const { rows: offers } = await client.query(`
    SELECT vo.id AS offer_id, vo.vendor_part_number, cp.id AS catalog_id
    FROM public.vendor_offers vo
    JOIN public.catalog_products cp ON cp.id = vo.catalog_product_id
    WHERE vo.vendor_code = 'pu'
      AND (vo.wholesale_cost IS NULL OR vo.wholesale_cost = 0)
      AND vo.vendor_part_number IS NOT NULL
  `);
  console.log(`   Found ${offers.length.toLocaleString()} PU offers to price\n`);

  // ── 3. Match + update in batches ─────────────────────────
  let updated  = 0;
  let skipped  = 0;
  let failed   = 0;
  const affectedCatalogIds = new Set();

  for (let i = 0; i < offers.length; i += BATCH_SIZE) {
    const batch = offers.slice(i, i + BATCH_SIZE);

    for (const offer of batch) {
      const price = priceMap[offer.vendor_part_number];
      if (!price) { skipped++; continue; }

      try {
        await client.query(`
          UPDATE public.vendor_offers
          SET wholesale_cost = $1,
              updated_at     = NOW()
          WHERE id = $2
        `, [price, offer.offer_id]);
        updated++;
        affectedCatalogIds.add(offer.catalog_id);
      } catch (err) {
        failed++;
        if (failed <= 5) console.error(`\n  ❌  ${offer.vendor_part_number}: ${err.message}`);
      }
    }

    const pct = Math.round(((i + batch.length) / offers.length) * 100);
    process.stdout.write(
      `\r  Progress: ${(i + batch.length).toLocaleString()} / ${offers.length.toLocaleString()} (${pct}%) | updated: ${updated.toLocaleString()} | skipped: ${skipped.toLocaleString()}`
    );
  }

  console.log(`\n\n   Offer updates complete.`);
  console.log(`   Updated:  ${updated.toLocaleString()}`);
  console.log(`   Skipped (not in price file): ${skipped.toLocaleString()}`);
  console.log(`   Failed:   ${failed}`);

  // ── 4. Backfill catalog_products.price from wholesale_cost
  // Use MAP price if available, else mark up cost by 30% as default
  console.log(`\n   Backfilling catalog_products.price for ${affectedCatalogIds.size.toLocaleString()} products...`);

  const idList = [...affectedCatalogIds];
  let priceUpdated = 0;

  for (let i = 0; i < idList.length; i += BATCH_SIZE) {
    const batch = idList.slice(i, i + BATCH_SIZE);
    const { rowCount } = await client.query(`
      UPDATE public.catalog_products cp
      SET price = CASE
            -- Use MAP price from vendor_offers if available
            WHEN vo.map_price IS NOT NULL AND vo.map_price > 0
              THEN vo.map_price
            -- Use MSRP if available
            WHEN vo.msrp IS NOT NULL AND vo.msrp > 0
              THEN vo.msrp
            -- Fall back to wholesale_cost * 1.35 (35% margin)
            ELSE ROUND((vo.wholesale_cost * 1.35)::numeric, 2)
          END,
          updated_at = NOW()
      FROM public.vendor_offers vo
      WHERE vo.catalog_product_id = cp.id
        AND vo.vendor_code = 'pu'
        AND vo.wholesale_cost > 0
        AND (cp.price IS NULL OR cp.price = 0)
        AND cp.id = ANY($1)
    `, [batch]);
    priceUpdated += rowCount ?? 0;
  }

  console.log(`   catalog_products.price updated: ${priceUpdated.toLocaleString()}`);

  // ── 5. Summary ────────────────────────────────────────────
  const { rows: [summary] } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE price > 0) AS with_price,
      COUNT(*) AS total
    FROM public.catalog_products
    WHERE is_active = true
  `);
  const pct = Math.round(Number(summary.with_price) / Number(summary.total) * 100);

  console.log(`\n✅  PU price import complete!`);
  console.log(`   Active products with price: ${Number(summary.with_price).toLocaleString()} / ${Number(summary.total).toLocaleString()} (${pct}%)`);

  // Still no price?
  const { rows: [still] } = await client.query(`
    SELECT COUNT(*) AS no_price
    FROM public.catalog_products cp
    JOIN public.vendor_offers vo ON vo.catalog_product_id = cp.id
    WHERE vo.vendor_code = 'pu'
      AND (cp.price IS NULL OR cp.price = 0)
  `);
  console.log(`   PU products still no price: ${Number(still.no_price).toLocaleString()}`);

  client.release();
  await pool.end();
}

run().catch(err => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});
