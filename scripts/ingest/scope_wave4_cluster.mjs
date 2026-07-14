// scope_wave4_cluster.mjs
//
// Read-only scoping query for the wave-4 targeted fix. Pulls the FULL set of
// candidate rows across the three small tractable clusters spotted in the
// wave-4 audit sample (Shifter parts -> Transmission & Clutch; Wheel/disc
// hardware -> Wheels & Tires; Fuel valve -> Carburetion & Fuel), not just the
// ones that happened to land in the 1-in-4 alphabetical sample.
//
// No writes. Prints full row list per cluster plus a leftover/no-match dump
// so we can see if the cluster is bigger or smaller than the sample implied.
//
// Run: node scope_wave4_cluster.mjs

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

// Boundary helper matching project convention: (^|[\s/'-]) ... ([\s/'-]|$)
function B(word) {
  return `(^|[\\s/'-])${word}([\\s/'-]|$)`;
}

const CLUSTERS = {
  'Transmission & Clutch / Shifter Forks & Gears': [
    B('SHIFTER'),
  ],
  'Wheels & Tires / wheel-disc hardware': [
    B('AXLE'),
    `${B('WHEEL')}.*${B('SCREW')}`,
    `${B('WHEEL')}.*${B('NUT')}`,
    `${B('DISC')}.*${B('SCREW')}`,
  ],
  'Carburetion & Fuel / fuel valve': [
    B('FUEL'),
  ],
};

async function main() {
  const client = await pool.connect();
  try {
    for (const [label, patterns] of Object.entries(CLUSTERS)) {
      const whereClauses = patterns.map((_, i) => `name ~* $${i + 1}`);
      const query = `
        SELECT id, name
        FROM catalog_unified
        WHERE display_category = 'Accessories & Misc'
          AND display_subcategory IS NULL
          AND is_active = true
          AND (${whereClauses.join(' OR ')})
        ORDER BY name
      `;
      const res = await client.query(query, patterns);
      console.log(`\n=== ${label}: ${res.rows.length} rows ===`);
      for (const r of res.rows) {
        console.log(`  [${r.id}] ${r.name}`);
      }
    }

    // Combined count (dedup, since a row could theoretically match >1 cluster)
    const allPatterns = Object.values(CLUSTERS).flat();
    const combinedWhere = allPatterns.map((_, i) => `name ~* $${i + 1}`).join(' OR ');
    const combinedRes = await client.query(
      `
      SELECT COUNT(*)::int AS n
      FROM catalog_unified
      WHERE display_category = 'Accessories & Misc'
        AND display_subcategory IS NULL
        AND is_active = true
        AND (${combinedWhere})
      `,
      allPatterns
    );
    console.log(`\n=== Combined unique row count across all clusters: ${combinedRes.rows[0].n} ===`);
    console.log('No writes made — this is scoping only.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Scoping query failed:', err);
  process.exit(1);
});
