#!/usr/bin/env node
/**
 * fix_cables_universal_misfiles.mjs
 *
 * Cables audit (session 90) found "Universal/Build Your Own" (274 rows)
 * was 28% misfiled -- six distinct product types unrelated to control
 * cables that just happen to contain the word "cable" in the name. Moves
 * all 78 to their established homes elsewhere in the catalog.
 *
 * Usage:
 *   node scripts/ingest/fix_cables_universal_misfiles.mjs            # dry run
 *   node scripts/ingest/fix_cables_universal_misfiles.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CLUSTERS = [
  ['Security cable locks', /cable lock|disc lock.*cable|combo cable/i, 'Accessories & Gear', 'Towing Equipment'],
  ['USB/phone charging cables', /usb|lightning|inductive phone|hardwire cable.*spc/i, 'Accessories & Gear', 'Phone Accessories'],
  ['Battery cables/accessories', /batt cable|battery tender|jump pack cable|quick disconnect cable mount/i, 'Electrical', 'Batteries, Cables & Accessories'],
  ['Whole clutch kits/covers/baskets', /clutch kit|clutch basket|clutch cover|transmission side cover/i, 'Transmission & Clutch', 'Clutch Kits & Components'],
  ['Throttle body kits', /throttle body kit/i, 'Fuel, Air & Carburetors', 'Throttle Body'],
  ['Lever sets', /lever set/i, 'Handlebars & Hand Controls', 'Levers & Hand Controls'],
];

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active=true AND display_category='Cables' AND display_subcategory='Universal/Build Your Own'`
    );

    const updates = [];
    for (const [label, re, cat, subcat] of CLUSTERS) {
      const matched = res.rows.filter(r => re.test(r.name));
      console.log(`\n${label} -> ${cat} / ${subcat}: ${matched.length}`);
      for (const r of matched) {
        console.log(`  ${r.name}`);
        updates.push({ id: r.id, cat, subcat });
      }
    }
    console.log(`\nTotal to move: ${updates.length}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    for (const { id, cat, subcat } of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [cat, subcat, id]
      );
    }
    await client.query('COMMIT');
    console.log(`\nMoved ${updates.length} rows. Committed.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
