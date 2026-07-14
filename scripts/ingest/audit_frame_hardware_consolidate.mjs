// audit_frame_hardware_consolidate.mjs
// Audit-only (no writes). Pulls full subcategory breakdown for both
// Frame & Hardware and Hardware, Covers & General side-by-side, plus a
// duplicate check (name similarity + sku/vendor_sku) between the two,
// to drive the consolidation mapping.
//
// Run: node audit_frame_hardware_consolidate.mjs > frame_hardware_consolidate_audit.txt 2>&1

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function subcatBreakdown(client, category) {
  const { rows } = await client.query(`
    SELECT display_subcategory, count(*) AS cnt
    FROM catalog_unified
    WHERE display_category = $1 AND is_active = true
    GROUP BY display_subcategory
    ORDER BY cnt DESC
  `, [category]);
  return rows;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== Frame & Hardware — subcategory breakdown ===\n');
    const fh = await subcatBreakdown(client, 'Frame & Hardware');
    let fhTotal = 0;
    for (const r of fh) {
      console.log(`  ${r.display_subcategory ?? 'NULL'}: ${r.cnt}`);
      fhTotal += Number(r.cnt);
    }
    console.log(`  TOTAL: ${fhTotal}\n`);

    console.log('=== Hardware, Covers & General — subcategory breakdown ===\n');
    const hcg = await subcatBreakdown(client, 'Hardware, Covers & General');
    let hcgTotal = 0;
    for (const r of hcg) {
      console.log(`  ${r.display_subcategory ?? 'NULL'}: ${r.cnt}`);
      hcgTotal += Number(r.cnt);
    }
    console.log(`  TOTAL: ${hcgTotal}\n`);

    // Sample rows per Frame & Hardware subcategory to inform mapping
    console.log('=== Frame & Hardware — 8-row sample per subcategory ===\n');
    for (const r of fh) {
      const whereSub = r.display_subcategory === null
        ? 'display_subcategory IS NULL'
        : 'display_subcategory = $2';
      const params = r.display_subcategory === null ? ['Frame & Hardware'] : ['Frame & Hardware', r.display_subcategory];
      const { rows: sample } = await client.query(`
        SELECT id, sku, name, source_vendor
        FROM catalog_unified
        WHERE display_category = $1 AND is_active = true AND ${whereSub}
        ORDER BY random()
        LIMIT 8
      `, params);
      console.log(`--- ${r.display_subcategory ?? 'NULL'} (${r.cnt} total) ---`);
      for (const s of sample) {
        console.log(`  [${s.id}] (${s.source_vendor}) sku=${s.sku} | ${s.name}`);
      }
      console.log('');
    }

    // Duplicate check: Frame & Hardware row that looks like it already
    // exists in Hardware, Covers & General
    console.log('=== Possible duplicates: Frame & Hardware row already exists in Hardware, Covers & General ===\n');
    const { rows: fhRows } = await client.query(`
      SELECT id, sku, vendor_sku, name, display_subcategory, source_vendor
      FROM catalog_unified
      WHERE display_category = 'Frame & Hardware' AND is_active = true
    `);

    let dupeCount = 0;
    for (const r of fhRows) {
      const { rows: dupes } = await client.query(`
        SELECT id, sku, name, display_subcategory, source_vendor
        FROM catalog_unified
        WHERE display_category = 'Hardware, Covers & General'
          AND is_active = true
          AND (
            sku = $1
            OR vendor_sku = $2
            OR similarity(name, $3) > 0.6
          )
        ORDER BY similarity(name, $3) DESC
        LIMIT 3
      `, [r.sku, r.vendor_sku, r.name]);

      if (dupes.length > 0) {
        dupeCount++;
        if (dupeCount <= 40) {
          console.log(`FH [${r.id}] "${r.name}" (${r.source_vendor}, ${r.display_subcategory ?? 'NULL'}) — possible match(es):`);
          for (const d of dupes) {
            console.log(`   -> HCG [${d.id}] "${d.name}" (${d.source_vendor}, sku=${d.sku}) [${d.display_subcategory}]`);
          }
          console.log('');
        }
      }
    }
    if (dupeCount > 40) console.log(`... (${dupeCount - 40} more matches not printed, see summary count) ...\n`);

    console.log(`\n=== SUMMARY ===`);
    console.log(`Frame & Hardware: ${fhTotal} rows, ${fh.length} subcats`);
    console.log(`Hardware, Covers & General: ${hcgTotal} rows, ${hcg.length} subcats`);
    console.log(`Frame & Hardware rows with a likely duplicate already in Hardware, Covers & General: ${dupeCount} of ${fhRows.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});
