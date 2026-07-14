// audit_suspension_frames_merge.mjs
// Audit-only (no writes). Pulls full subcategory breakdown for both
// Suspension and Frames & Suspension side-by-side, plus a duplicate
// check (name similarity + sku/vendor_sku) between the two categories,
// to drive the merge-mapping decision.
//
// Run: node audit_suspension_frames_merge.mjs > suspension_merge_audit.txt 2>&1

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
    console.log('=== Suspension — subcategory breakdown ===\n');
    const susp = await subcatBreakdown(client, 'Suspension');
    let suspTotal = 0;
    for (const r of susp) {
      console.log(`  ${r.display_subcategory}: ${r.cnt}`);
      suspTotal += Number(r.cnt);
    }
    console.log(`  TOTAL: ${suspTotal}\n`);

    console.log('=== Frames & Suspension — subcategory breakdown ===\n');
    const frames = await subcatBreakdown(client, 'Frames & Suspension');
    let framesTotal = 0;
    for (const r of frames) {
      console.log(`  ${r.display_subcategory}: ${r.cnt}`);
      framesTotal += Number(r.cnt);
    }
    console.log(`  TOTAL: ${framesTotal}\n`);

    // Sample rows per Suspension subcategory to inform mapping decisions
    console.log('=== Suspension — 5-row sample per subcategory ===\n');
    for (const r of susp) {
      const { rows: sample } = await client.query(`
        SELECT id, sku, name, source_vendor
        FROM catalog_unified
        WHERE display_category = 'Suspension' AND display_subcategory = $1 AND is_active = true
        ORDER BY random()
        LIMIT 5
      `, [r.display_subcategory]);
      console.log(`--- ${r.display_subcategory} (${r.cnt} total) ---`);
      for (const s of sample) {
        console.log(`  [${s.id}] (${s.source_vendor}) sku=${s.sku} | ${s.name}`);
      }
      console.log('');
    }

    // Duplicate check: Suspension rows that look like an existing
    // Frames & Suspension row already (name similarity + sku match)
    console.log('=== Possible duplicates: Suspension row already exists in Frames & Suspension ===\n');
    const { rows: suspRows } = await client.query(`
      SELECT id, sku, vendor_sku, name, display_subcategory, source_vendor
      FROM catalog_unified
      WHERE display_category = 'Suspension' AND is_active = true
    `);

    let dupeCount = 0;
    for (const r of suspRows) {
      const { rows: dupes } = await client.query(`
        SELECT id, sku, name, display_subcategory, source_vendor
        FROM catalog_unified
        WHERE display_category = 'Frames & Suspension'
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
        console.log(`SUSP [${r.id}] "${r.name}" (${r.source_vendor}, ${r.display_subcategory}) — possible match(es):`);
        for (const d of dupes) {
          console.log(`   -> F&S [${d.id}] "${d.name}" (${d.source_vendor}, sku=${d.sku}) [${d.display_subcategory}]`);
        }
        console.log('');
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Suspension: ${suspTotal} rows, ${susp.length} subcats`);
    console.log(`Frames & Suspension: ${framesTotal} rows, ${frames.length} subcats`);
    console.log(`Suspension rows with a likely duplicate already in Frames & Suspension: ${dupeCount} of ${suspRows.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(1);
});
