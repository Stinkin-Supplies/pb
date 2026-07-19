#!/usr/bin/env node
/**
 * link_handlebar_oem.mjs
 *
 * Finds PU/VTwin handlebar products in catalog_unified that correspond
 * to the 3 unlinked H-D OEM handlebar numbers:
 *   55947-08  Touring 2008-2013 (Road King, Electra Glide, Street Glide, Ultra)
 *   55947-00  Road King Custom + Road Glide 2002-2013
 *   56079-93  Dyna Street Bob 2006-2008 + Wide Glide 2002-2005
 *
 * Usage:
 *   node scripts/ingest/link_handlebar_oem.mjs           # show candidates
 *   node scripts/ingest/link_handlebar_oem.mjs --apply   # insert confirmed rows
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool  = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const APPLY = process.argv.includes('--apply');

// ── Search definitions ────────────────────────────────────────────────────────
// Each entry: the OEM # we want to link, a description of what it is,
// and name-pattern terms that should match it in catalog_unified.

const TARGETS = [
  {
    oem:  '55947-08',
    desc: 'Touring 2008-2013 OEM handlebar (7-1/2"H, 31"W, 12-1/2" pullback)',
    // H-D sold this as the "Smooth" or "Chrome" Touring replacement bar
    terms: ['55947-08', '55947', 'touring', 'electra', 'road king', 'street glide', 'ultra'],
    dim_clues: ['31"', '7-1/2"', '12-1/2"'],
  },
  {
    oem:  '55947-00',
    desc: 'Road King Custom / Road Glide OEM handlebar (varies: 6-8.5"H, 31.5-32"W)',
    terms: ['55947-00', '55947', 'road glide', 'road king custom', 'flhrs', 'fltr'],
    dim_clues: ['32"', '31-1/2"'],
  },
  {
    oem:  '56079-93',
    desc: 'Dyna Street Bob / Wide Glide OEM handlebar (10"H, 34-1/4"W, 10" pullback)',
    terms: ['56079-93', '56079', 'street bob', 'wide glide', 'dyna', 'fxdb', 'fxdwg'],
    dim_clues: ['34-1/4"', '34"', '10"'],
  },
];

async function main() {
  const client = await pool.connect();
  console.log(`\n=== Handlebar OEM Crossref Lookup ===`);
  console.log(`Mode: ${APPLY ? '** APPLY **' : 'CANDIDATES (pass --apply to link)'}\n`);

  try {
    // What's already linked for these OEM numbers?
    const { rows: existing } = await client.query(`
      SELECT sku, oem_number FROM catalog_oem_crossref
      WHERE oem_number = ANY($1)
    `, [TARGETS.map(t => t.oem)]);
    const linkedSet = new Set(existing.map(r => `${r.sku}||${r.oem_number}`));
    console.log(`Already linked: ${existing.length} entries\n`);

    const toInsert = [];

    for (const target of TARGETS) {
      console.log(`── ${target.oem} ─────────────────────────────────────────────`);
      console.log(`   ${target.desc}`);

      // Build OR conditions for name search
      const termConditions = target.terms
        .map((_, i) => `cu.name ILIKE $${i + 2}`)
        .join(' OR ');

      const params = [
        target.oem,
        ...target.terms.map(t => `%${t}%`),
      ];

      const { rows: candidates } = await client.query(`
        SELECT
          cu.sku, cu.source_vendor, cu.brand, cu.name,
          cu.brand_part_number, cu.display_subcategory,
          -- Score: higher = better match
          (
            CASE WHEN cu.brand_part_number = $1 THEN 100 ELSE 0 END +
            CASE WHEN cu.name ILIKE '%' || $1 || '%' THEN 50 ELSE 0 END +
            CASE WHEN cu.name ILIKE '%oem%' OR cu.name ILIKE '%replacement%' OR cu.name ILIKE '%stock%' THEN 10 ELSE 0 END +
            CASE WHEN cu.name ILIKE '%chrome%' THEN 5 ELSE 0 END
          ) AS score
        FROM catalog_unified cu
        WHERE cu.is_active = true
          AND cu.display_subcategory ILIKE '%handlebar%'
          AND (${termConditions})
        ORDER BY score DESC, cu.source_vendor, cu.name
        LIMIT 20
      `, params);

      if (candidates.length === 0) {
        console.log('   No candidates found.\n');
        continue;
      }

      console.log(`   Candidates (${candidates.length}):`);
      for (const r of candidates) {
        const linked = linkedSet.has(`${r.sku}||${target.oem}`) ? ' ✓LINKED' : '';
        const score  = r.score > 0 ? ` [score:${r.score}]` : '';
        console.log(`   [${r.source_vendor}] ${r.sku.padEnd(14)} bpn=${String(r.brand_part_number ?? '—').padEnd(14)} "${r.name?.slice(0, 55)}"${score}${linked}`);
      }

      // Auto-select: rows where the OEM number appears literally in name or bpn
      const highConfidence = candidates.filter(r =>
        r.score >= 50 ||
        (r.brand_part_number ?? '').includes(target.oem.replace('-', '')) ||
        (r.name ?? '').toLowerCase().includes(target.oem.toLowerCase())
      );

      if (highConfidence.length > 0) {
        console.log(`\n   High-confidence auto-links (${highConfidence.length}):`);
        for (const r of highConfidence) {
          const key = `${r.sku}||${target.oem}`;
          if (!linkedSet.has(key)) {
            console.log(`     → ${r.sku} "${r.name?.slice(0, 50)}"`);
            toInsert.push({ sku: r.sku, oem: target.oem });
            linkedSet.add(key);
          }
        }
      } else {
        console.log(`\n   ⚠️  No high-confidence auto-links for ${target.oem}.`);
        console.log(`       Review candidates above and manually link if correct:`);
        console.log(`       INSERT INTO catalog_oem_crossref (sku, oem_number, source, expanded_from)`);
        console.log(`       VALUES ('<sku>', '${target.oem}', 'HD_OEM', false)`);
        console.log(`       ON CONFLICT (sku, oem_number) DO NOTHING;`);
      }
      console.log('');
    }

    // Summary
    console.log(`── Summary ───────────────────────────────────────────────────`);
    console.log(`   High-confidence rows to insert: ${toInsert.length}`);

    if (!APPLY || toInsert.length === 0) {
      if (toInsert.length > 0) {
        console.log('   Pass --apply to commit these.\n');
      } else {
        console.log('   Nothing to auto-link — use manual INSERT for any candidates above.\n');
      }
      return;
    }

    // Insert
    let inserted = 0;
    for (const row of toInsert) {
      const { rowCount } = await client.query(`
        INSERT INTO catalog_oem_crossref (sku, oem_number, source, expanded_from)
        VALUES ($1, $2, 'HD_OEM', false)
        ON CONFLICT (sku, oem_number) DO NOTHING
      `, [row.sku, row.oem]);
      inserted += rowCount;
    }

    console.log(`\n✅ Inserted ${inserted} handlebar OEM crossref rows.`);
    const { rows: [{ total }] } = await client.query(
      `SELECT COUNT(*) AS total FROM catalog_oem_crossref WHERE source = 'HD_OEM'`
    );
    console.log(`   HD_OEM crossref total: ${total}\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
