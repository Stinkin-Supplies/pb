// audit_cables_misroutes.mjs
//
// Re-surfaces the ~307 rows moved into Cables (subcategory Universal or
// Build Your Own -- exact name TBD, will confirm) during the straggler
// sweep. Per project memory, this batch includes known grip/throttle-sleeve
// misses that were incorrectly matched on the word "CABLE" appearing in the
// product name (e.g. "CABLE THROTTLE MEMORY FOAM GRIP", "THROTTLE SLEEVE")
// but are NOT actually cable products -- they're grips/throttle components
// that belong in Handlebar & Controls.
//
// This script pulls the full current set of rows in that subcategory,
// splits them into "looks like an actual cable" vs "looks like a
// grip/throttle/sleeve/other non-cable item that slipped in", so we can
// scope the real fix before writing it.
//
// Read-only. No writes.
//
// Run: node audit_cables_misroutes.mjs

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

function B(word) {
  return `(^|[\\s/'-])${word}([\\s/'-]|$)`;
}

async function main() {
  const client = await pool.connect();
  try {
    // First confirm the real subcategory names under Cables
    const subRes = await client.query(`
      SELECT display_subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Cables' AND display_subcategory IS NOT NULL
      GROUP BY display_subcategory
      ORDER BY n DESC
    `);
    console.log('=== Subcategories under "Cables" ===');
    for (const r of subRes.rows) {
      console.log(`  ${r.n.toString().padStart(6)}  ${r.display_subcategory}`);
    }

    // Find the subcat name that matches "Universal" or "Build Your Own"
    const targetSubcat = subRes.rows.find(
      (r) => /universal/i.test(r.display_subcategory) || /build your own/i.test(r.display_subcategory)
    );
    if (!targetSubcat) {
      console.log('\nNo subcategory matching "Universal" or "Build Your Own" found -- check names above manually.');
      return;
    }
    console.log(`\nUsing subcategory: "${targetSubcat.display_subcategory}" (${targetSubcat.n} rows)`);

    const rowsRes = await client.query(
      `
      SELECT id, name
      FROM catalog_unified
      WHERE display_category = 'Cables' AND display_subcategory = $1 AND is_active = true
      ORDER BY name
      `,
      [targetSubcat.display_subcategory]
    );
    const rows = rowsRes.rows;
    console.log(`\nTotal rows in this subcategory: ${rows.length}`);

    // Flag likely-non-cable rows: grip, throttle sleeve, foam grip, signature
    // grip patterns -- these are the known misses per memory
    const nonCablePatterns = [
      new RegExp(B('GRIP'), 'i'),
      new RegExp(`${B('THROTTLE')}.*${B('SLEEVE')}`, 'i'),
      new RegExp(B('SLEEVE'), 'i'),
      new RegExp(B('SIGNATURE'), 'i'),
    ];

    const likelyMisrouted = [];
    const likelyCorrect = [];
    for (const r of rows) {
      const isNonCable = nonCablePatterns.some((p) => p.test(r.name || ''));
      if (isNonCable) likelyMisrouted.push(r);
      else likelyCorrect.push(r);
    }

    console.log(`\n=== Likely misrouted (grip/sleeve/signature vocabulary): ${likelyMisrouted.length} ===`);
    for (const r of likelyMisrouted) {
      console.log(`  [${r.id}] ${r.name}`);
    }

    console.log(`\n=== Likely correctly-placed cable items: ${likelyCorrect.length} ===`);
    console.log('(showing first 40 as a sample)');
    for (const r of likelyCorrect.slice(0, 40)) {
      console.log(`  [${r.id}] ${r.name}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
