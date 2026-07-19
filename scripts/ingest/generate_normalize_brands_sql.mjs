// generate_normalize_brands_sql.mjs
// Regenerates normalize_brands.sql's CASE expression from BRAND_NORMALIZATION_MAP so the
// two files can't drift. Run this after editing brandNormalizationMap.mjs.
//
// Usage: node scripts/ingest/generate_normalize_brands_sql.mjs

import { BRAND_NORMALIZATION_MAP } from './brandNormalizationMap.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, 'normalize_brands.sql');

function sqlQuote(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

// Group raw brand strings by their canonical target, preserving map insertion order.
const byCanonical = new Map();
for (const [raw, canonical] of Object.entries(BRAND_NORMALIZATION_MAP)) {
  if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
  byCanonical.get(canonical).push(raw);
}

const lines = [];
for (const [canonical, rawVariants] of byCanonical) {
  const inList = rawVariants.map(sqlQuote).join(', ');
  lines.push(`  WHEN brand IN (${inList}) THEN ${sqlQuote(canonical)}`);
}

const header = `-- Brand normalization for catalog_unified
-- Canonical format: Title Case for multi-word, ALL CAPS for established brand acronyms
-- Run as a single UPDATE statement
--
-- GENERATED FILE — do not hand-edit. Edit brandNormalizationMap.mjs, then run
-- \`node scripts/ingest/generate_normalize_brands_sql.mjs\` to regenerate this file.
--
-- IMPORTANT — this is only half the fix: sync_catalog_unified.mjs imports
-- normalizeBrand() from brandNormalizationMap.mjs and applies it at insert time
-- for new products, so newly-synced rows stay normalized automatically. It does
-- NOT retroactively renormalize existing rows on every sync (it's an upsert, not
-- a truncate+rebuild — see HANDOFF_LOG.md). This .sql file is for catching up
-- whatever is already loaded right now.

UPDATE catalog_unified SET brand = CASE

${lines.join('\n')}

  ELSE brand
END
WHERE brand IS NOT NULL;
`;

fs.writeFileSync(outPath, header);
console.log(`Wrote ${outPath} (${rawVariantCount()} raw brand strings -> ${byCanonical.size} canonical brands)`);

function rawVariantCount() {
  return Object.keys(BRAND_NORMALIZATION_MAP).length;
}
