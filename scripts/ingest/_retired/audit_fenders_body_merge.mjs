// audit_fenders_body_merge.mjs
// Audit-only (no writes). Checks whether Fenders & Body's remaining 26 rows
// are (a) safe category-only moves into Tanks & Body, or (b) true duplicates
// of an existing Tanks & Body row (same/near-identical sku or name) that
// need dedup (deactivate one side) rather than a plain recategorize.
//
// Run: node audit_fenders_body_merge.mjs > fenders_body_merge_audit.txt 2>&1

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // 1. Full dump of current Fenders & Body rows
    const { rows: fb } = await client.query(`
      SELECT id, sku, vendor_sku, name, display_subcategory, source_vendor
      FROM catalog_unified
      WHERE display_category = 'Fenders & Body' AND is_active = true
      ORDER BY display_subcategory, name
    `);

    console.log(`=== Fenders & Body — ${fb.length} active rows ===\n`);
    for (const r of fb) {
      console.log(`[${r.id}] (${r.source_vendor}) sku=${r.sku} vendor_sku=${r.vendor_sku} | ${r.display_subcategory} | ${r.name}`);
    }

    // 2. For each Fenders & Body row, look for a likely duplicate already
    //    sitting in Tanks & Body — by sku/vendor_sku match, or close name match.
    console.log(`\n=== Possible duplicates already in Tanks & Body ===\n`);

    let dupeCount = 0;
    for (const r of fb) {
      const { rows: dupes } = await client.query(`
        SELECT id, sku, vendor_sku, name, display_subcategory, source_vendor
        FROM catalog_unified
        WHERE display_category = 'Tanks & Body'
          AND is_active = true
          AND (
            sku = $1
            OR vendor_sku = $2
            OR similarity(name, $3) > 0.5
          )
        ORDER BY similarity(name, $3) DESC
        LIMIT 5
      `, [r.sku, r.vendor_sku, r.name]);

      if (dupes.length > 0) {
        dupeCount++;
        console.log(`FB [${r.id}] "${r.name}" (${r.source_vendor}) — possible match(es):`);
        for (const d of dupes) {
          console.log(`   -> TB [${d.id}] "${d.name}" (${d.source_vendor}, sku=${d.sku}) [${d.display_subcategory}]`);
        }
        console.log('');
      }
    }

    console.log(`\n=== Tanks & Body — Gas Tanks & Gas Caps subcat, for reference ===\n`);
    const { rows: tbSubcat } = await client.query(`
      SELECT id, sku, vendor_sku, name, source_vendor
      FROM catalog_unified
      WHERE display_category = 'Tanks & Body'
        AND display_subcategory = 'Gas Tanks & Gas Caps'
        AND is_active = true
      ORDER BY name
      LIMIT 50
    `);
    for (const r of tbSubcat) {
      console.log(`[${r.id}] (${r.source_vendor}) sku=${r.sku} | ${r.name}`);
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Fenders & Body active rows: ${fb.length}`);
    console.log(`Rows with a likely duplicate already in Tanks & Body: ${dupeCount}`);
    console.log(`Rows with no likely duplicate (safe category-only move candidates): ${fb.length - dupeCount}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});
