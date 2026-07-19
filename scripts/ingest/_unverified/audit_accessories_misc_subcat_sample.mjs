// audit_accessories_misc_subcat_sample.mjs
//
// Pulls a larger sample (default 40/bucket) of the 195 rows that were just
// moved out of Accessories & Misc into their new top-level category but
// left with subcategory = NULL, so real subcategory patterns can be
// designed from actual vocabulary rather than the original 5-row samples.
//
// These are the five buckets from fix_accessories_misc_taxonomy.mjs:
//   Electrical (98), Foot Controls (43), Handlebar & Controls (38),
//   Transmission & Clutch (15), Suspension (1)
//
// Read-only. No writes. Run with: node audit_accessories_misc_subcat_sample.mjs

import 'dotenv-x/config'; // placeholder — replace with actual project db client import
import pg from 'pg';

const SAMPLE_SIZE = Number(process.argv[2]) || 40;

const TARGET_CATEGORIES = [
  'Electrical',
  'Foot Controls',
  'Handlebar & Controls',
  'Transmission & Clutch',
  'Suspension',
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('='.repeat(78));
  console.log('ACCESSORIES & MISC MOVED ROWS — SUBCATEGORY SAMPLE PULL');
  console.log('='.repeat(78));
  console.log(`Sample size per bucket: ${SAMPLE_SIZE}`);
  console.log('Scope: display_category IN (' + TARGET_CATEGORIES.join(', ') + ')');
  console.log('       AND display_subcategory IS NULL');
  console.log('       (rows just moved by fix_accessories_misc_taxonomy.mjs)\n');

  // NOTE: this assumes the moved rows are identifiable as
  // display_category = <target> AND display_subcategory IS NULL.
  // If other legitimately-null rows already existed in these categories
  // before this move, this query will pull those too — worth confirming
  // against the known pre-move null counts if the total looks too high.

  for (const category of TARGET_CATEGORIES) {
    const countRes = await client.query(
      `SELECT COUNT(*) FROM catalog_unified
       WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true`,
      [category]
    );
    const total = Number(countRes.rows[0].count);

    console.log('-'.repeat(78));
    console.log(`${category}  (${total} NULL-subcategory rows total)`);
    console.log('-'.repeat(78));

    const sampleRes = await client.query(
      `SELECT sku, name FROM catalog_unified
       WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true
       ORDER BY name
       LIMIT $2`,
      [category, SAMPLE_SIZE]
    );

    for (const row of sampleRes.rows) {
      console.log(`    [${row.sku}] ${row.name}`);
    }
    console.log('');
  }

  await client.end();
  console.log('='.repeat(78));
  console.log('SAMPLE PULL COMPLETE — read-only, no rows modified.');
  console.log('='.repeat(78));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
