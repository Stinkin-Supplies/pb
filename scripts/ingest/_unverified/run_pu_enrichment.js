/**
 * run_pu_enrichment.js
 *
 * Master runner — executes all 4 PU enrichment scripts in dependency order:
 *
 *   1. extract_pu_specs.js          — PIES/non-PIES attributes → catalog_specs
 *   2. backfill_pu_dimensions.js    — pu_brand_enrichment dims → catalog_unified
 *   3. backfill_pu_fitment_structured.js — pu_fitment → catalog_fitment
 *   4. backfill_pu_catalog_refs.js  — page refs → catalog_unified
 *
 * Then reminds you to reindex Typesense.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/run_pu_enrichment.js [--dry-run]
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const flag = DRY_RUN ? ' --dry-run' : '';

const scripts = [
  { name: '1/4 import_pu_brand_xml',             file: 'import_pu_brand_xml.js' },
  { name: '2/4 backfill_pu_dimensions',           file: 'backfill_pu_dimensions.js' },
  { name: '3/4 backfill_pu_fitment_structured',   file: 'backfill_pu_fitment_structured.js' },
  { name: '4/4 backfill_pu_catalog_refs',         file: 'backfill_pu_catalog_refs.js' },
];

function hr(label) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(`${line}\n`);
}

for (const { name, file } of scripts) {
  hr(name);
  try {
    execSync(
      `node ${path.join(__dirname, file)}${flag}`,
      { stdio: 'inherit', env: process.env }
    );
  } catch (err) {
    console.error(`\n❌ ${name} failed — aborting pipeline.`);
    console.error(err.message);
    process.exit(1);
  }
}

hr('All scripts complete');
console.log('Next step — reindex Typesense to pick up specs, fitment, and updated data:\n');
if (DRY_RUN) {
  console.log('  (dry-run — no reindex needed)\n');
} else {
  console.log('  Reindex with index_unified.js (catalog_unified only):');
  console.log('  TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate\n');
}
