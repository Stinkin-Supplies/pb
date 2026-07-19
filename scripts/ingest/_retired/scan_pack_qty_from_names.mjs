#!/usr/bin/env node
/**
 * scan_pack_qty_from_names.mjs
 *
 * Scans all active product names for pack-quantity signals and compares to
 * the current catalog_unified.pack_qty value.
 *
 * Usage:
 *   node scan_pack_qty_from_names.mjs              # dry run — show all matches
 *   node scan_pack_qty_from_names.mjs --apply      # write corrections
 *   node scan_pack_qty_from_names.mjs --vendor PU  # limit to one vendor
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool    = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const DRY_RUN = !process.argv.includes('--apply');
const VENDOR  = (() => {
  const idx = process.argv.indexOf('--vendor');
  return idx !== -1 ? process.argv[idx + 1]?.toUpperCase() : null;
})();

// ── Patterns ──────────────────────────────────────────────────────────────────
// Each pattern either captures a group (qty from name) or has a fixed value.
// Listed highest-specificity first — first match wins.
// "review" patterns are shown separately and never auto-applied.

const PATTERNS = [
  // High-confidence — auto-applicable
  { name: 'slash-pk',    re: /(\d+)\s*\/\s*pk\b/i },
  { name: 'bare-pk',     re: /(\d+)\s*pk(?=\s|$)/i },
  { name: 'hyphen-pack', re: /(\d+)-pack\b/i },
  { name: 'space-pack',  re: /\b(\d+)\s+pack(?=\s|$)/i },
  { name: 'per-pack',    re: /(\d+)\s*per\s*pack\b/i },
  { name: 'per-pkg',     re: /(\d+)\s*per\s*pkg\b/i },
  { name: 'pkg-of',      re: /pkg\.?\s*of\s*(\d+)\b/i },
  { name: 'pkg-slash',   re: /pkg\s*\/\s*(\d+)\b/i },
  { name: 'bag-of',      re: /bag\s*of\s*(\d+)\b/i },
  { name: 'box-of',      re: /box\s*of\s*(\d+)\b/i },
  { name: 'qty-colon',   re: /\bqty\.?\s*:?\s*(\d+)\b/i },
  { name: 'count',       re: /\b(\d+)\s*-?\s*count\b/i },

  // Review-only — flag but never auto-apply (higher false-positive risk)
  { name: 'pair',        re: /\bpair\b/i,             value: 2 },
  { name: 'set-of',      re: /\bset\s+of\s+(\d+)\b/i,            review: true },
  { name: 'piece',       re: /\b(\d+)\s*-?\s*pieces?\b/i,         review: true },
];

function extractQty(name) {
  for (const pat of PATTERNS) {
    const m = name.match(pat.re);
    if (!m) continue;
    const qty = pat.value ?? parseInt(m[1] ?? m[0], 10);
    if (isNaN(qty) || qty < 2 || qty > 500) continue; // sanity bounds
    return { qty, patternName: pat.name, review: pat.review ?? false };
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n🔍 Pack Qty Name Scanner — ${DRY_RUN ? 'DRY RUN' : '⚠️  APPLYING'}${VENDOR ? ` · vendor=${VENDOR}` : ''}\n`);

    const { rows: products } = await client.query(`
      SELECT id, internal_sku, name, source_vendor,
             COALESCE(pack_qty, 1) AS current_qty
      FROM catalog_unified
      WHERE is_active = true
        AND is_kit = false
        ${VENDOR ? `AND source_vendor = $1` : ''}
      ORDER BY source_vendor, id
    `, VENDOR ? [VENDOR] : []);

    console.log(`📦 Scanning ${products.length.toLocaleString()} active non-kit products...\n`);

    // Classify each product
    const corrections = []; // extracted qty != current_qty, not review
    const confirmations = []; // extracted qty == current_qty (already correct)
    const reviewItems = [];   // review patterns
    const byPattern = {};

    for (const p of products) {
      const result = extractQty(p.name);
      if (!result) continue;

      const { qty, patternName, review } = result;
      const currentQty = Number(p.current_qty);

      if (!byPattern[patternName]) byPattern[patternName] = [];
      byPattern[patternName].push({ ...p, extractedQty: qty });

      if (review) {
        reviewItems.push({ ...p, extractedQty: qty, patternName });
      } else if (qty !== currentQty) {
        corrections.push({ ...p, extractedQty: qty, patternName });
      } else {
        confirmations.push({ ...p, extractedQty: qty, patternName });
      }
    }

    // ── Pattern breakdown ──────────────────────────────────────────────────
    console.log('📊 Pattern breakdown:');
    for (const [pat, hits] of Object.entries(byPattern)) {
      const patDef = PATTERNS.find(p => p.name === pat);
      const tag = patDef?.review ? ' [review]' : '';
      console.log(`   ${pat.padEnd(14)} ${String(hits.length).padStart(5)} hits${tag}`);
    }
    console.log();

    // ── Corrections ────────────────────────────────────────────────────────
    console.log(`✏️  Corrections (name qty != current pack_qty): ${corrections.length}`);
    if (corrections.length > 0) {
      // Group by vendor
      const byVendor = {};
      for (const c of corrections) {
        if (!byVendor[c.source_vendor]) byVendor[c.source_vendor] = [];
        byVendor[c.source_vendor].push(c);
      }
      for (const [vendor, items] of Object.entries(byVendor)) {
        console.log(`\n   ${vendor} (${items.length}):`);
        for (const c of items.slice(0, 15)) {
          const arrow = `${c.current_qty} → ${c.extractedQty}`;
          console.log(`     [${c.patternName}] ${c.internal_sku.padEnd(18)} ${arrow.padEnd(10)}  "${c.name}"`);
        }
        if (items.length > 15) console.log(`     ... and ${items.length - 15} more`);
      }
    }
    console.log();

    // ── Confirmations ──────────────────────────────────────────────────────
    console.log(`✅ Already correct (pack_qty matches name): ${confirmations.length}`);
    if (confirmations.length > 0 && confirmations.length <= 20) {
      for (const c of confirmations) {
        console.log(`   [${c.patternName}] ${c.internal_sku.padEnd(18)} qty=${c.extractedQty}  "${c.name}"`);
      }
    }
    console.log();

    // ── Review items ───────────────────────────────────────────────────────
    console.log(`🔎 Review patterns (not auto-applied): ${reviewItems.length}`);
    if (reviewItems.length > 0) {
      for (const r of reviewItems.slice(0, 20)) {
        const arrow = r.extractedQty !== Number(r.current_qty) ? ` ← would change ${r.current_qty}→${r.extractedQty}` : ' (already correct)';
        console.log(`   [${r.patternName}] ${r.internal_sku.padEnd(18)} "${r.name}"${arrow}`);
      }
      if (reviewItems.length > 20) console.log(`   ... and ${reviewItems.length - 20} more`);
    }
    console.log();

    if (DRY_RUN) {
      console.log(`⚠️  DRY RUN — ${corrections.length} corrections ready. Pass --apply to write.\n`);
      return;
    }

    // ── Apply corrections ──────────────────────────────────────────────────
    if (corrections.length === 0) {
      console.log('Nothing to apply.\n');
      return;
    }

    console.log(`⚡ Applying ${corrections.length} corrections...`);

    // Batch by (extractedQty, patternName) for efficient updates
    const byQtyPattern = {};
    for (const c of corrections) {
      const key = `${c.extractedQty}::${c.patternName}`;
      if (!byQtyPattern[key]) byQtyPattern[key] = { qty: c.extractedQty, ids: [] };
      byQtyPattern[key].ids.push(c.id);
    }

    let updated = 0;
    for (const { qty, ids } of Object.values(byQtyPattern)) {
      const result = await client.query(
        `UPDATE catalog_unified SET pack_qty = $1 WHERE id = ANY($2::int[])`,
        [qty, ids]
      );
      updated += result.rowCount;
    }

    console.log(`\n✅ Done! ${updated} products updated.`);
    console.log(`   Review items skipped: ${reviewItems.length} (run with --vendor or inspect manually)\n`);

    // Verify
    const { rows: [counts] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE pack_qty > 1)            AS with_qty,
        COUNT(*) FILTER (WHERE COALESCE(pack_qty,1) = 1) AS single
      FROM catalog_unified WHERE is_active = true AND is_kit = false
    `);
    console.log(`   Active non-kit products with pack_qty > 1: ${counts.with_qty}`);
    console.log(`   Active non-kit products with pack_qty = 1: ${counts.single}\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
