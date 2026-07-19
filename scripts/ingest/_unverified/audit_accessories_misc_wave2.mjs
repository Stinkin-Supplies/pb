#!/usr/bin/env node
// audit_accessories_misc_wave2.mjs
//
// Second-wave discovery audit on the 2,200 rows still stuck in
// Accessories & Misc with NULL subcategory after the first-pass script.
// Discovery only -- no writes, no rules applied.
//
// Usage:
//   node audit_accessories_misc_wave2.mjs           (summary + samples)
//   node audit_accessories_misc_wave2.mjs --full    (also prints full list)

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not found -- check .env.local / .env at repo root.');
  process.exit(1);
}

const FULL = process.argv.includes('--full');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const STOPWORD_LIST = [
  'THE', 'A', 'AN', 'FOR', 'WITH', 'AND', 'OR', 'OF', 'IN', 'ON',
  'CHROME', 'BLACK', 'BLUE', 'RED', 'WHITE', 'GOLD', 'SILVER', 'GREEN',
  'ORANGE', 'PINK', 'PURPLE', 'BRONZE', 'BRASS', 'STAINLESS', 'ZINC',
  'POLISHED', 'ANODIZED', 'PLATED', 'CADMIUM', 'PARKERIZED',
  'SMALL', 'LARGE', 'MEDIUM', 'MINI', 'STANDARD', 'UNIVERSAL',
  'NEW', 'REPLACEMENT', 'REPLICA', 'STYLE', 'SET', 'KIT'
];
const STOPWORDS = new Set(STOPWORD_LIST);

const NUMERIC_TOKEN_RE = new RegExp('^[0-9]+([.][0-9]+)?(IN|INCH|MM|CM)?$');

async function main() {
  console.log('='.repeat(78));
  console.log('ACCESSORIES & MISC WAVE-2 DISCOVERY AUDIT');
  console.log('='.repeat(78));

  const result = await pool.query(
    "SELECT id, sku, name FROM catalog_unified " +
    "WHERE display_category = 'Accessories & Misc' AND display_subcategory IS NULL AND is_active = true " +
    "ORDER BY name"
  );
  const rows = result.rows;

  console.log('');
  console.log('Total remaining NULL rows: ' + rows.length);
  console.log('');

  const leadCounts = {};
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].name.toUpperCase();
    const tokens = name.split(/\s+/).filter(function (t) { return t.length > 0; });
    let lead = null;
    for (let j = 0; j < tokens.length; j++) {
      const clean = tokens[j].replace(/[^A-Z0-9\/-]/g, '');
      if (clean && !STOPWORDS.has(clean) && !NUMERIC_TOKEN_RE.test(clean)) {
        lead = clean;
        break;
      }
    }
    if (lead) {
      leadCounts[lead] = (leadCounts[lead] || 0) + 1;
    }
  }

  const sortedLeads = Object.keys(leadCounts)
    .map(function (word) { return [word, leadCounts[word]]; })
    .sort(function (a, b) { return b[1] - a[1]; });

  console.log('-'.repeat(78));
  console.log('Top 40 leading words, for vocabulary discovery:');
  console.log('-'.repeat(78));
  for (let i = 0; i < Math.min(40, sortedLeads.length); i++) {
    const word = sortedLeads[i][0];
    const count = sortedLeads[i][1];
    console.log('  ' + word.padEnd(30) + ' ' + count);
  }

  console.log('');
  console.log('-'.repeat(78));
  const stride = Math.max(1, Math.floor(rows.length / 150));
  console.log('Sample of rows (every ' + stride + 'th row, spread across the alphabet):');
  console.log('-'.repeat(78));
  for (let i = 0; i < rows.length; i += stride) {
    const r = rows[i];
    console.log('    [' + r.id + '] ' + r.name);
  }

  if (FULL) {
    console.log('');
    console.log('='.repeat(78));
    console.log('FULL LIST:');
    console.log('='.repeat(78));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      console.log('    [' + r.id + '] ' + r.name);
    }
  }

  await pool.end();
}

main().catch(function (err) {
  console.error('Error:', err);
  process.exit(1);
});
