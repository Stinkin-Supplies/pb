#!/usr/bin/env node
/**
 * check-no-destructive-sql.mjs
 *
 * Fails if any tracked file contains TRUNCATE or DROP TABLE against a
 * protected core table. Built after catalog_unified was TRUNCATEd to zero
 * rows by a script with no dry-run, no transaction, and no review catching
 * it before it ran. See HANDOFF_LOG.md.
 *
 * This is a blunt, dependency-free grep -- it doesn't parse SQL, so it can
 * have false positives (e.g. a comment mentioning TRUNCATE). That's the
 * right tradeoff for a safety net: a false positive costs a moment's
 * review, a false negative costs the catalog.
 *
 * Usage:
 *   node scripts/check-no-destructive-sql.mjs              # scan the whole repo
 *   node scripts/check-no-destructive-sql.mjs --staged     # scan only staged files (for pre-commit)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PROTECTED_TABLES = [
  'catalog_unified',
  'pu_catalog',
  'wps_catalog',
  'vtwin_catalog',
  'canonical_products',
  'catalog_variant_groups',
  'catalog_variant_members',
];

// Files allowed to mention TRUNCATE against a protected table -- e.g. a
// migration that's deliberately, reviewedly doing a one-time reset. Empty
// on purpose; add an entry only with a comment explaining why.
const ALLOWLIST = [];

const STAGED = process.argv.includes('--staged');

function getFilesToScan() {
  if (STAGED) {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
    return out.split('\n').filter(Boolean).filter((f) => /\.(js|mjs|cjs|ts|sql)$/.test(f));
  }
  const out = execSync('git ls-files', { encoding: 'utf-8' });
  return out.split('\n').filter(Boolean).filter((f) => /\.(js|mjs|cjs|ts|sql)$/.test(f));
}

const DESTRUCTIVE_RE = new RegExp(
  `\\b(TRUNCATE(\\s+TABLE)?|DROP\\s+TABLE)\\b[^;\\n]*\\b(${PROTECTED_TABLES.join('|')})\\b`,
  'i'
);

function main() {
  const files = getFilesToScan();
  const violations = [];

  for (const file of files) {
    if (ALLOWLIST.includes(file)) continue;
    if (!fs.existsSync(file)) continue; // staged-but-deleted files
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (DESTRUCTIVE_RE.test(line)) {
        violations.push({ file, line: i + 1, text: line.trim() });
      }
    });
  }

  if (violations.length === 0) {
    console.log(`OK -- no TRUNCATE/DROP TABLE against protected tables in ${files.length} scanned file(s).`);
    return;
  }

  console.error(`\nBLOCKED -- destructive SQL against a protected table found:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error(
    `\nProtected tables: ${PROTECTED_TABLES.join(', ')}\n` +
    `If this is genuinely intentional (a reviewed, one-time migration), add the file to\n` +
    `ALLOWLIST in scripts/check-no-destructive-sql.mjs with a comment explaining why.\n` +
    `Otherwise: use an upsert (ON CONFLICT ... DO UPDATE) instead of truncate-and-reload.\n`
  );
  process.exit(1);
}

main();
