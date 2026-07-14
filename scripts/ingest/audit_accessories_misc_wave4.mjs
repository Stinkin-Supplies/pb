// audit_accessories_misc_wave4.mjs
//
// Read-only audit of the 735 rows still sitting in Accessories & Misc with
// display_subcategory IS NULL, after waves 1-3 (3,203 -> 2,200 -> 1,119 -> 735).
//
// Goal: figure out whether a wave-4 classification pass is worth running, or
// whether the remaining 735 should be accepted as permanently held-back
// long-tail (same convention as every other category's held-back list in
// this project).
//
// This script makes NO writes. It only reports:
//   1. Total current count (sanity check against the 735 figure in the log)
//   2. Leading-word frequency tally (same technique as the wave-2 audit)
//   3. A flagged-ambiguous vs. rest split, using the same ambiguous-keyword
//      list from wave-2/wave-3 (parts manuals, wall art, scale models, etc.)
//   4. A random-ish alphabetical sample of the non-flagged remainder, so we
//      can eyeball whether any real pattern is still hiding in there.
//
// Run: node audit_accessories_misc_wave4.mjs

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Project convention: try repo-root .env.local, then .env
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local / .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

// Same ambiguous-keyword list built up across wave-2 and wave-3 (held-back,
// not force-classified): parts manuals, product guides, scale models, wall
// art, engine plaques, tuning packs, promo packs, novelty/merch-adjacent
// items that aren't really "merchandise" either.
const AMBIGUOUS_PATTERNS = [
  /PARTS?\s+MANUAL/i,
  /PRODUCT\s+GUIDE/i,
  /SHOP\s+(DOPE\s+)?MANUAL/i,
  /SCALE\s+MODEL/i,
  /MODEL\s+CAR/i,
  /WALL\s+ART/i,
  /ENGINE\s+PLAQUE/i,
  /TUNING\s+PACK/i,
  /PROMO\s+PACK/i,
  /DEALER\s+MARKETING/i,
  /CHROME\s+CONCHO/i,
  /BAR\s+STOOL/i,
  /RIDING\s+GLOVES?/i,
  /PUB\s+TABLE/i,
  /DISPLAY\s+MODEL/i,
  /TOKEN/i,
];

async function main() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query(`
      SELECT COUNT(*)::int AS n
      FROM catalog_unified
      WHERE display_category = 'Accessories & Misc'
        AND display_subcategory IS NULL
        AND is_active = true
    `);
    const total = totalRes.rows[0].n;
    console.log(`\n=== Current NULL count in Accessories & Misc: ${total} ===`);
    console.log('(Expected ~735 per HANDOFF_LOG session 82 — flag if this drifted)\n');

    const rowsRes = await client.query(`
      SELECT id, name
      FROM catalog_unified
      WHERE display_category = 'Accessories & Misc'
        AND display_subcategory IS NULL
        AND is_active = true
      ORDER BY name
    `);
    const rows = rowsRes.rows;

    // Leading-word frequency tally (same technique as wave-2 audit)
    const leadWordCounts = new Map();
    for (const r of rows) {
      const firstWord = (r.name || '').trim().split(/\s+/)[0]?.toUpperCase();
      if (!firstWord) continue;
      leadWordCounts.set(firstWord, (leadWordCounts.get(firstWord) || 0) + 1);
    }
    const topLeadWords = [...leadWordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    console.log('=== Top 30 leading words (frequency) ===');
    for (const [word, count] of topLeadWords) {
      console.log(`  ${count.toString().padStart(4)}  ${word}`);
    }

    // Ambiguous flag split
    const flagged = [];
    const rest = [];
    for (const r of rows) {
      const isAmbiguous = AMBIGUOUS_PATTERNS.some((p) => p.test(r.name || ''));
      if (isAmbiguous) flagged.push(r);
      else rest.push(r);
    }

    console.log(`\n=== Ambiguous-flagged (known unresolvable pattern): ${flagged.length} ===`);
    console.log(`=== Remainder (candidates for a real wave-4 pattern): ${rest.length} ===\n`);

    // Alphabetical sample of the remainder — every 1-in-N to spread across
    // the alphabet rather than just the first 150 rows.
    const sampleSize = 150;
    const step = Math.max(1, Math.floor(rest.length / sampleSize));
    const sample = rest.filter((_, i) => i % step === 0).slice(0, sampleSize);

    console.log(`=== Alphabetical sample of remainder (n=${sample.length}, every ${step}th row) ===`);
    for (const r of sample) {
      console.log(`  [${r.id}] ${r.name}`);
    }

    console.log('\n=== Summary ===');
    console.log(`Total NULL: ${total}`);
    console.log(`Ambiguous-flagged: ${flagged.length}`);
    console.log(`Remainder: ${rest.length}`);
    console.log('\nNo writes made. Review the leading-word tally and sample above,');
    console.log('then decide whether a wave-4 fix script is worth writing.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
