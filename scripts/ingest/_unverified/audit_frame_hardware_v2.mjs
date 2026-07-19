// audit_frame_hardware_v2.mjs
// READ-ONLY.
//   Part 1: full dump of the 159-row "Hardware Listing" NULL group (to spot oddities
//           beyond generic bolts/fasteners)
//   Part 2: full-bin keyword scan of the 1,743-row Hardware & Fasteners bin for
//           genuine miscategorization -- exact counts instead of extrapolating from
//           an 80-row sample
//
// Run: node audit_frame_hardware_v2.mjs > frame_hardware_v2_output.txt 2>&1

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

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Keywords suggesting the row does NOT belong in Hardware & Fasteners
const CONTAMINATION_GROUPS = [
  { label: 'Seals/Gaskets', pattern: `(SEAL|GASKET)` },
  { label: 'Mud flaps / fender-adjacent', pattern: `(MUD\\s*FLAP|FENDER)` },
  { label: 'Complete kits/covers (not just fasteners)', pattern: `(LIFT\\s*KIT|COVER\\s*SET|TOY|MOUNT(ING)?\\s*KIT)` },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`=== PART 1: Full "Hardware Listing" NULL dump (159 rows) ===\n`);
    const hlRes = await client.query(`
      SELECT id, name, source_vendor
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Frame & Hardware'
        AND display_subcategory IS NULL
        AND category = 'Hardware Listing'
      ORDER BY name
    `);
    for (const row of hlRes.rows) {
      console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
    }

    console.log(`\n=== PART 2: Full-bin keyword scan of Hardware & Fasteners (1,743 rows) ===\n`);
    let totalFlagged = 0;
    for (const g of CONTAMINATION_GROUPS) {
      const res = await client.query(
        `SELECT id, name, source_vendor FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Frame & Hardware'
           AND display_subcategory = 'Hardware & Fasteners'
           AND name ~* $1
         ORDER BY name`,
        [g.pattern]
      );
      console.log(`--- ${g.label}: ${res.rows.length} ---`);
      for (const row of res.rows) {
        console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
      }
      totalFlagged += res.rows.length;
      console.log('');
    }
    console.log(`Total flagged for review: ${totalFlagged} of 1,743`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
