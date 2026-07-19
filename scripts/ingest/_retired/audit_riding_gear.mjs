// audit_riding_gear.mjs
// READ-ONLY audit — Riding Gear & Apparel, 1,760 NULL display_subcategory rows
// Categorizes against the 6 confirmed real subcats via regex, reports counts + samples.
// No UPDATEs. Run this, review the printed samples/counts, THEN we build the dry-run apply script.
//
// Usage: node audit_riding_gear.mjs > riding_gear_audit_output.txt 2>&1

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env location/name.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

// Confirmed real subcats (from category_breakdown_report.md, session 83):
// Helmets 1451, Gloves 587, Jackets & Vests 186, Pants & Base Layers 85, Footwear 74, Accessories 63
// NULL: 1760

const CANDIDATES = [
  {
    subcat: 'Helmets',
    // Postgres: \y not \b
    pattern: `(^|\\s)(HELMET|SHIELD|VISOR|FACE\\s*SHIELD)(S)?(\\s|$)`,
  },
  {
    subcat: 'Gloves',
    pattern: `(^|\\s)(GLOVE)(S)?(\\s|$)`,
  },
  {
    subcat: 'Jackets & Vests',
    pattern: `(^|[\\s/'-])(JACKET|VEST|CHAP)(S)?([\\s/'-]|$)`,
  },
  {
    subcat: 'Pants & Base Layers',
    pattern: `(^|\\s)(PANT|JEAN|BASE\\s*LAYER|LONG\\s*JOHN)(S)?(\\s|$)`,
  },
  {
    subcat: 'Footwear',
    pattern: `(^|\\s)(BOOT|SHOE|SOCK)(S)?(\\s|$)`,
  },
  {
    subcat: 'Accessories',
    // last-resort bucket — bandana, balaclava, rain gear, etc. keep narrow, review samples closely
    pattern: `(^|\\s)(BANDANA|BALACLAVA|NECK\\s*GAITER|RAIN\\s*SUIT|RAIN\\s*GEAR|EAR\\s*PLUG)(S)?(\\s|$)`,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL`
    );
    console.log(`Total NULL rows in Riding Gear & Apparel: ${totalRes.rows[0].n}\n`);

    let matchedIds = new Set();

    for (const { subcat, pattern } of CANDIDATES) {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL
           AND name ~* $1`,
        [pattern]
      );
      console.log(`--- ${subcat}: ${countRes.rows[0].n} matches ---`);

      const sampleRes = await client.query(
        `SELECT id, name, sku, source_vendor FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL
           AND name ~* $1
         ORDER BY random()
         LIMIT 8`,
        [pattern]
      );
      for (const row of sampleRes.rows) {
        console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
        matchedIds.add(row.id);
      }
      console.log('');
    }

    // Unmatched remainder — the part that needs eyeballing to find missing vocab
    const unmatchedRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND name !~* $1 AND name !~* $2 AND name !~* $3
         AND name !~* $4 AND name !~* $5 AND name !~* $6`,
      CANDIDATES.map((c) => c.pattern)
    );
    console.log(`--- UNMATCHED (no candidate regex hit): ${unmatchedRes.rows[0].n} ---`);

    const unmatchedSample = await client.query(
      `SELECT id, name, sku, source_vendor FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND name !~* $1 AND name !~* $2 AND name !~* $3
         AND name !~* $4 AND name !~* $5 AND name !~* $6
       ORDER BY random()
       LIMIT 40`,
      CANDIDATES.map((c) => c.pattern)
    );
    for (const row of unmatchedSample.rows) {
      console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
