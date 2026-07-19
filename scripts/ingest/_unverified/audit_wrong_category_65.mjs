// audit_wrong_category_65.mjs
//
// Re-surfaces the 65 wrong-category candidates flagged (but never touched)
// during the "Subcategory pass for 5 categories" work: rows sitting in
// Foot Controls or Suspension whose product name indicates they're actually
// a different top-level category's item entirely (not just missing a
// subcategory).
//
// Per project memory, these were identified via specific vocabulary at the
// time (Wyatt Gatling exhaust/fishtail/luggage items + O-ring kits in Foot
// Controls; Clutch/Spring Kit + Spring Fork Brake Kit items in Suspension).
// This script re-derives the same candidate set from current data (rows may
// have shifted since then) rather than trusting the old count blindly.
//
// Read-only. No writes.
//
// Run: node audit_wrong_category_65.mjs

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
    // --- Foot Controls: exhaust/fishtail/luggage/O-ring items ---
    const fcPatterns = [
      B('EXHAUST'),
      B('FISHTAIL'),
      B('MUFFLER'),
      B('SADDLEBAG'),
      B('SISSY'),
      `${B('O')}-?${B('RING')}`,
      B('WYATT'),
    ];
    const fcWhere = fcPatterns.map((_, i) => `name ~* $${i + 1}`).join(' OR ');
    const fcRes = await client.query(
      `
      SELECT id, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Foot Controls'
        AND is_active = true
        AND (${fcWhere})
      ORDER BY name
      `,
      fcPatterns
    );
    console.log(`=== Foot Controls candidates (exhaust/fishtail/luggage/o-ring): ${fcRes.rows.length} ===`);
    for (const r of fcRes.rows) {
      console.log(`  [${r.id}] ${r.name} (current subcat: ${r.display_subcategory ?? 'NULL'})`);
    }

    // --- Suspension: clutch/spring kit / brake kit items ---
    const susPatterns = [
      B('CLUTCH'),
      `${B('SPRING')}.*${B('BRAKE')}`,
      `${B('BRAKE')}.*${B('SPRING')}`,
      B('SPRING KIT'.replace(' ', '\\s+')),
    ];
    const susWhere = susPatterns.map((_, i) => `name ~* $${i + 1}`).join(' OR ');
    const susRes = await client.query(
      `
      SELECT id, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Suspension'
        AND is_active = true
        AND (${susWhere})
      ORDER BY name
      `,
      susPatterns
    );
    console.log(`\n=== Suspension candidates (clutch/spring-brake kit): ${susRes.rows.length} ===`);
    for (const r of susRes.rows) {
      console.log(`  [${r.id}] ${r.name} (current subcat: ${r.display_subcategory ?? 'NULL'})`);
    }

    console.log(`\n=== Total candidates found: ${fcRes.rows.length + susRes.rows.length} ===`);
    console.log('(Expected ~65 total per project memory -- 47 Foot Controls + 18 Suspension. Flag if this drifted.)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
