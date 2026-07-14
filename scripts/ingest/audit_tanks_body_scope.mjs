#!/usr/bin/env node
/**
 * audit_tanks_body_scope.mjs
 *
 * Scoping audit for the proposed "Tanks & Body" category, per Laken's spec:
 *
 *   Gas Tanks & Gas Caps (mounting hardware, legacy/rubber-mount/dash-style/
 *     smooth-top quickbob/quickbob/aero-style/legacy lynx/wasp-style/frisco
 *     style tanks; pop-up/screw-in-locking/dresser-style/vented/gas kap
 *     keeper/fuel gauge gas caps)
 *   Fuel Valves, Fuel Filters (Carb)
 *   Fuel Lines, Regulators, Filters (EFI)
 *   Oil Tank, Dipstick, Hoses
 *   Oil Filters, Filter Mounts, Oil Line Covers
 *   Fuel/Oil Line, Clamps and Finishers
 *   Front Fender & Hardware
 *   Rear Fender, Struts, Hardware
 *   Fender Trim
 *   License Plate Mounts, Frames, Lighting, Hardware
 *
 * PURPOSE: this is read-only. It answers "how many rows, and where do they
 * currently live" for each spec bucket, across the four categories that
 * could plausibly be a source:
 *   - Fenders & Body (gas tanks/caps per prior ROADMAP decision; fenders; trim)
 *   - Carburetion & Fuel (fuel valves/lines/regulators/filters - session 77 applied)
 *   - Transmission & Clutch (Oil System subcategory, 684 rows - session 77 applied)
 *   - License plate items currently wherever they landed (could be Lighting,
 *     Accessories & Misc, or Fenders & Body)
 *
 * No writes. Output is for Laken to make the pull-from-live-categories call
 * with real numbers instead of guessing.
 *
 * Run: node scripts/ingest/audit_tanks_body_scope.mjs > tanks_body_scope_audit.txt 2>&1
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function count(client, label, whereClause, params = []) {
  const res = await client.query(
    `SELECT count(*) FROM catalog_unified WHERE is_active = true AND (${whereClause})`,
    params
  );
  console.log(`${label}: ${res.rows[0].count}`);
}

async function breakdown(client, label, whereClause, params = []) {
  console.log(`\n--- ${label}: breakdown by current display_category ---`);
  const res = await client.query(
    `SELECT display_category, display_subcategory, count(*) as n
     FROM catalog_unified
     WHERE is_active = true AND (${whereClause})
     GROUP BY display_category, display_subcategory
     ORDER BY n DESC`,
    params
  );
  for (const r of res.rows) {
    console.log(`  ${r.display_category} / ${r.display_subcategory || '(null)'}: ${r.n}`);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== SECTION 1: Gas Tanks & Gas Caps ===');
    await breakdown(client, 'Gas tank/cap name match',
      `name ILIKE '%gas tank%' OR name ILIKE '%fuel tank%' OR name ILIKE '%gas cap%'
       OR name ILIKE '%tank cap%' OR name ILIKE '%quickbob%' OR name ILIKE '%wasp%tank%'
       OR name ILIKE '%frisco%tank%' OR name ILIKE '%dash%tank%' OR name ILIKE '%lynx%tank%'`
    );

    console.log('\n=== SECTION 2: Fuel Valves / Fuel Filters (carb-side) ===');
    await breakdown(client, 'Fuel valve/filter (carb) name match',
      `name ILIKE '%fuel valve%' OR name ILIKE '%petcock%' OR
       (name ILIKE '%fuel filter%' AND category NOT ILIKE '%EFI%')`
    );

    console.log('\n=== SECTION 3: Fuel Lines, Regulators, Filters (EFI-side) ===');
    await breakdown(client, 'Fuel line/regulator/EFI-filter name match',
      `name ILIKE '%fuel line%' OR name ILIKE '%fuel regulator%' OR name ILIKE '%fuel pump%'
       OR (name ILIKE '%fuel filter%' AND (category ILIKE '%EFI%' OR name ILIKE '%EFI%'))`
    );

    console.log('\n=== SECTION 4: Oil Tank, Dipstick, Hoses ===');
    await breakdown(client, 'Oil tank/dipstick/hose name match',
      `name ILIKE '%oil tank%' OR name ILIKE '%dipstick%' OR
       (name ILIKE '%oil%hose%')`
    );

    console.log('\n=== SECTION 5: Oil Filters, Filter Mounts, Oil Line Covers ===');
    await breakdown(client, 'Oil filter/mount/cover name match',
      `name ILIKE '%oil filter%' OR name ILIKE '%filter mount%' OR name ILIKE '%oil line cover%'`
    );

    console.log('\n=== SECTION 6: Fuel/Oil Line Clamps and Finishers ===');
    await breakdown(client, 'Fuel/oil line clamp/finisher name match',
      `(name ILIKE '%fuel%clamp%' OR name ILIKE '%oil%clamp%' OR name ILIKE '%line%finisher%')`
    );

    console.log('\n=== SECTION 7: Front Fender & Hardware ===');
    await breakdown(client, 'Front fender name match',
      `name ILIKE '%front fender%'`
    );

    console.log('\n=== SECTION 8: Rear Fender, Struts, Hardware ===');
    await breakdown(client, 'Rear fender/strut name match',
      `name ILIKE '%rear fender%' OR name ILIKE '%fender strut%'`
    );

    console.log('\n=== SECTION 9: Fender Trim ===');
    await breakdown(client, 'Fender trim name match',
      `name ILIKE '%fender trim%' OR (name ILIKE '%fender%' AND name ILIKE '%trim%')`
    );

    console.log('\n=== SECTION 10: License Plate Mounts, Frames, Lighting, Hardware ===');
    await breakdown(client, 'License plate name match',
      `name ILIKE '%license plate%'`
    );

    console.log('\n=== SECTION 11: Current state of the three known-affected LIVE categories ===');
    await count(client, 'Fenders & Body total active rows', `display_category = 'Fenders & Body'`);
    await count(client, 'Carburetion & Fuel total active rows', `display_category = 'Carburetion & Fuel'`);
    await count(client, 'Transmission & Clutch total active rows', `display_category = 'Transmission & Clutch'`);
    await count(client, 'Transmission & Clutch / Oil System rows',
      `display_category = 'Transmission & Clutch' AND display_subcategory = 'Oil System'`);

    console.log('\n--- Fenders & Body full subcategory breakdown (for context) ---');
    await breakdown(client, 'Fenders & Body all subcategories', `display_category = 'Fenders & Body'`);

    console.log('\n--- Carburetion & Fuel full subcategory breakdown (for context) ---');
    await breakdown(client, 'Carburetion & Fuel all subcategories', `display_category = 'Carburetion & Fuel'`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('AUDIT FAILED:', e);
  process.exit(1);
});
