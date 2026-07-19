#!/usr/bin/env node
/**
 * audit_gaskets_seals_scope.mjs
 *
 * Read-only scoping audit for the new Gaskets & Seals category — NO WRITES.
 *
 * This is a bigger, riskier undertaking than the previous subcategory
 * rebuilds: it's a CATEGORY-level move (display_category), not a
 * subcategory tweak within one category. Per the spec's "Gaskets/Seals -
 * Exhaust/Fork/Wheel" subcategory, the intent looks like consolidating
 * gasket/seal products from ACROSS the whole catalog — not just Engine's
 * already-known 3,030-row bucket and Transmission's 1 row — into one
 * unified category. This script surfaces the true scope before any
 * classification/migration logic gets built, so we don't accidentally
 * sweep in thousands of unexpected rows from categories we haven't looked
 * at (Suspension, Wheels & Tires, Exhaust, Brakes, Fenders & Body, etc.).
 *
 * "Seal" is treated as a much riskier bare word than "gasket" — it can
 * false-positive on brand names, "Seal of Approval"-type badging, sealant
 * chemical products, etc. Word-bounded and sampled separately so it can be
 * eyeballed before any decision is made about it.
 *
 * Usage:
 *   node audit_gaskets_seals_scope.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n=== Does "Gaskets & Seals" already exist as a display_category? ===');
    const catCheck = await client.query(
      `SELECT display_category, COUNT(*) FROM catalog_unified
       WHERE is_active = true AND display_category = 'Gaskets & Seals'
       GROUP BY 1`,
    );
    console.table(catCheck.rows);

    console.log('\n=== Known baseline: rows with OLD subcategory = \'Gaskets & Seals\', by CURRENT category ===');
    const known = await client.query(
      `SELECT display_category, COUNT(*) FROM catalog_unified
       WHERE is_active = true AND display_subcategory = 'Gaskets & Seals'
       GROUP BY 1 ORDER BY 2 DESC`,
    );
    console.table(known.rows);

    console.log('\n=== Catalog-wide: active rows whose NAME contains "gasket", by CURRENT category ===');
    const gasketWide = await client.query(
      `SELECT display_category, COUNT(*) FROM catalog_unified
       WHERE is_active = true AND name ILIKE '%gasket%'
       GROUP BY 1 ORDER BY 2 DESC`,
    );
    console.table(gasketWide.rows);

    console.log('\n=== Catalog-wide: active rows whose NAME contains "seal" (word-bounded), by CURRENT category ===');
    console.log('Riskier than "gasket" — sample below before drawing conclusions.');
    const sealWide = await client.query(
      `SELECT display_category, COUNT(*) FROM catalog_unified
       WHERE is_active = true AND name ~* '\\yseal(s)?\\y'
       GROUP BY 1 ORDER BY 2 DESC`,
    );
    console.table(sealWide.rows);

    console.log('\n=== Sample: "seal" matches OUTSIDE Engine/Transmission & Clutch (the two known sources) ===');
    const sealSample = await client.query(
      `SELECT id, name, brand, display_category, display_subcategory FROM catalog_unified
       WHERE is_active = true AND name ~* '\\yseal(s)?\\y'
         AND display_category NOT IN ('Engine', 'Transmission & Clutch')
       LIMIT 40`,
    );
    console.table(sealSample.rows);

    console.log('\n=== Sample: "gasket" matches OUTSIDE Engine/Transmission & Clutch (the two known sources) ===');
    const gasketSample = await client.query(
      `SELECT id, name, brand, display_category, display_subcategory FROM catalog_unified
       WHERE is_active = true AND name ILIKE '%gasket%'
         AND display_category NOT IN ('Engine', 'Transmission & Clutch')
       LIMIT 40`,
    );
    console.table(gasketSample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
