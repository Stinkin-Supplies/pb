#!/usr/bin/env node
/**
 * fix_merchandising_taxonomy.mjs
 *
 * Follow-up to fix_hardware_covers_general_taxonomy.mjs — populates
 * the previously-empty "Merchandising" subcategory under the
 * "Hardware, Covers & General" top-level category.
 *
 * Original audit (session 81) used retail-fixture vocabulary
 * (DISPLAY RACK/BOARD/STAND, POP DISPLAY) and found zero hits.
 * Laken's correction: "Merchandising" means novelty/branded consumer
 * items — patches, stickers, gift boxes/sets, keychains — mostly
 * V-Twin brand product. Follow-up audit (audit_merchandising_scope.mjs)
 * confirmed real signal in 3 groups, and confirmed 2 vocabulary traps:
 *
 *   - Bare "V-TWIN" is USELESS as a signal — V-Twin is a huge parts
 *     brand (545 hits: gaskets, oil, brake rotors, handlebars — none
 *     of it merchandise). NOT used as a classifier signal at all.
 *   - Bare "PIN" is 95%+ noise — mechanical pins (wrist pin, crank
 *     pin), electrical connector pins (4-Pin, 6-Pin), not lapel pins.
 *     Laken's explicit call: drop bare PIN entirely, only match
 *     KEYCHAIN / LAPEL PIN.
 *   - "Patches" needs exclusion of mechanical/gasket products that
 *     use the word for a repair patch, not a cloth novelty patch:
 *     Exhaust Patches, Spark Plug Patches, Carburetor (Air Dam)
 *     Patches, Cam Patches. Laken's explicit call: only genuine
 *     cloth/novelty patches with no part-name attached qualify.
 *
 * Usage:
 *   node scripts/ingest/fix_merchandising_taxonomy.mjs           (dry run, default)
 *   node scripts/ingest/fix_merchandising_taxonomy.mjs --apply   (writes)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not found — check .env.local / .env at repo root.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

const NEW_CATEGORY = 'Hardware, Covers & General';
const SUBCATEGORY = 'Merchandising';

// Part-system words that disqualify a "Patches" match — if present,
// it's a mechanical/gasket repair patch, not a cloth novelty patch.
const PATCH_EXCLUSIONS = [
  'EXHAUST', 'SPARK\\s*PLUG', 'CARBURETOR', 'CARB\\b', 'AIR\\s*DAM',
  'CAM\\b', 'GASKET', 'TIRE', 'TUBE', 'INNER\\s*TUBE', 'REPAIR',
];

const RULES = [
  {
    subcategory: SUBCATEGORY,
    test: (name) => {
      const isPatch = /(^|[\s/'-])PATCHES?([\s/'-]|$)/i.test(name);
      if (isPatch) {
        const exclusionPattern = PATCH_EXCLUSIONS.map(
          (w) => `(^|[\\s/'-])${w}([\\s/'-]|$)`
        ).join('|');
        const isMechanicalPatch = new RegExp(exclusionPattern, 'i').test(name);
        if (!isMechanicalPatch) return true;
      }

      const isSticker = /(^|[\s/'-])STICKERS?([\s/'-]|$)/i.test(name);
      if (isSticker) return true;

      const isGiftItem =
        /(^|[\s/'-])GIFT\s*SET([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])GIFT\s*BOX(ES)?([\s/'-]|$)/i.test(name);
      if (isGiftItem) return true;

      // Bare PIN dropped entirely per Laken's explicit call — 95%+
      // noise (mechanical/electrical pins). Only KEYCHAIN / LAPEL PIN.
      const isKeychainOrLapelPin =
        /(^|[\s/'-])KEYCHAINS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])KEY\s*CHAINS?([\s/'-]|$)/i.test(name) ||
        /(^|[\s/'-])LAPEL\s*PINS?([\s/'-]|$)/i.test(name);
      if (isKeychainOrLapelPin) return true;

      return false;
    },
  },
];

function classify(name) {
  for (const rule of RULES) {
    if (rule.test(name)) return rule.subcategory;
  }
  return null;
}

async function main() {
  console.log('='.repeat(78));
  console.log(`MERCHANDISING — TAXONOMY BUILD  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log('='.repeat(78));
  console.log('\nScanning ALL active catalog_unified rows for novelty/merch vocabulary');
  console.log('(patches, stickers, gift sets, keychains/lapel pins). NOT using bare');
  console.log('"V-TWIN" or bare "PIN" as signals — both confirmed noise-dominated.\n');

  const allRows = await pool.query(
    `SELECT id, name, display_category, display_subcategory
     FROM catalog_unified
     WHERE is_active = true`
  );

  const matched = [];
  const bySource = {};

  for (const row of allRows.rows) {
    const target = classify(row.name);
    if (target) {
      const src = row.display_category ?? '(NULL)';
      bySource[src] = (bySource[src] ?? 0) + 1;
      matched.push({ id: row.id, name: row.name, from: row.display_category });
    }
  }

  console.log(`--- Matched rows: ${matched.length} total ---\n`);
  for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  from "${src}"  ${count}`);
  }

  console.log('\n--- Sample of matched rows (20) ---');
  for (const m of matched.slice(0, 20)) {
    console.log(`    [${m.id}] ${m.name}  (was: ${m.from ?? 'NULL'})`);
  }

  if (APPLY) {
    console.log('\nApplying updates...');
    let applied = 0;
    for (const m of matched) {
      await pool.query(
        `UPDATE catalog_unified
         SET display_category = $2, display_subcategory = $3
         WHERE id = $1`,
        [m.id, NEW_CATEGORY, SUBCATEGORY]
      );
      applied++;
    }
    console.log(`Applied: ${applied} rows moved into "${NEW_CATEGORY} / ${SUBCATEGORY}".`);
  } else {
    console.log('\n(dry run — no rows written. Re-run with --apply to commit.)');
  }

  console.log('\n' + '='.repeat(78));
  console.log('AUDIT/APPLY COMPLETE.');
  console.log('='.repeat(78));

  await pool.end();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
