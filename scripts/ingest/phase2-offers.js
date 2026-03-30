require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CHECKPOINT = './phase2-offers-checkpoint.json';
const BATCH_SIZE = 500;

function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — offset: ${d.offset} | processed: ${d.processed}\n`);
    return d;
  }
  return { offset: 0, processed: 0, failed: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const checkpoint = loadCheckpoint();
  let { offset, processed, failed } = checkpoint;

  console.log('▶  Phase 2.2 — Building vendor offers...\n');

  // Total catalog products to process
  const { rows: [{ total }] } = await client.query(
    'SELECT COUNT(*) AS total FROM public.catalog_products'
  );
  console.log(`   Total catalog products: ${Number(total).toLocaleString()}\n`);

  try {
    while (true) {
      // Fetch a batch of catalog products
      const { rows: catalogBatch } = await client.query(`
        SELECT id, manufacturer_part_number, sku
        FROM public.catalog_products
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (catalogBatch.length === 0) break;

      const mpns = catalogBatch.map(r => r.manufacturer_part_number).filter(Boolean);
      const idByMPN = {};
      for (const row of catalogBatch) {
        if (row.manufacturer_part_number) idByMPN[row.manufacturer_part_number] = row.id;
      }

      // Fetch all vendor rows for this batch
      const { rows: vendorRows } = await client.query(`
        SELECT
          vendor_code,
          vendor_part_number,
          manufacturer_part_number,
          wholesale_cost,
          map_price,
          msrp,
          drop_ship_fee,
          drop_ship_eligible,
          status
        FROM vendor.vendor_products
        WHERE manufacturer_part_number = ANY($1)
          AND manufacturer_part_number IS NOT NULL
      `, [mpns]);

      // Group vendor rows by MPN
      const byMPN = {};
      for (const row of vendorRows) {
        const mpn = row.manufacturer_part_number;
        if (!byMPN[mpn]) byMPN[mpn] = [];
        byMPN[mpn].push(row);
      }

      // Insert vendor offers
      for (const mpn of mpns) {
        const catalogId = idByMPN[mpn];
        if (!catalogId) continue;

        const vendorRows = byMPN[mpn] ?? [];
        for (const vrow of vendorRows) {
          try {
            await client.query(`
              INSERT INTO public.vendor_offers (
                catalog_product_id,
                vendor_code,
                vendor_part_number,
                manufacturer_part_number,
                wholesale_cost,
                map_price,
                msrp,
                drop_ship_fee,
                drop_ship_eligible,
                is_active,
                created_at,
                updated_at
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
              ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
                wholesale_cost     = EXCLUDED.wholesale_cost,
                map_price          = EXCLUDED.map_price,
                msrp               = EXCLUDED.msrp,
                drop_ship_fee      = EXCLUDED.drop_ship_fee,
                drop_ship_eligible = EXCLUDED.drop_ship_eligible,
                is_active          = EXCLUDED.is_active,
                updated_at         = NOW()
            `, [
              catalogId,
              vrow.vendor_code,
              vrow.vendor_part_number,
              vrow.manufacturer_part_number,
              vrow.wholesale_cost ?? null,
              vrow.map_price ?? null,
              vrow.msrp ?? null,
              vrow.drop_ship_fee ?? 0,
              vrow.drop_ship_eligible ?? false,
              !['DISCONTINUED', 'D', 'W'].includes((vrow.status ?? '').toUpperCase()),
            ]);
            processed++;
          } catch (err) {
            failed++;
            if (failed < 10) console.error(`  ❌  ${mpn} / ${vrow.vendor_code}: ${err.message}`);
          }
        }
      }

      offset += catalogBatch.length;
      saveCheckpoint({ offset, processed, failed });

      const pct = Math.round((offset / Number(total)) * 100);
      process.stdout.write(`\r  Progress: ${offset.toLocaleString()} / ${Number(total).toLocaleString()} products (${pct}%) | offers created: ${processed.toLocaleString()}`);
    }

    clearCheckpoint();
    console.log(`\n\n✅  Phase 2.2 complete!`);
    console.log(`   Vendor offers created: ${processed.toLocaleString()}`);
    console.log(`   Failed: ${failed}`);

    // Summary
    const { rows: summary } = await client.query(`
      SELECT vendor_code, COUNT(*) AS offers
      FROM public.vendor_offers
      GROUP BY vendor_code
      ORDER BY offers DESC
    `);
    console.log('\n   Offers by vendor:');
    for (const row of summary) {
      console.log(`     ${row.vendor_code}: ${Number(row.offers).toLocaleString()}`);
    }

  } catch (err) {
    console.error('\n❌  Phase 2.2 failed:', err.message);
    console.error('    Re-run node phase2-offers.js to resume.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
