#!/usr/bin/env node
/**
 * audit_missing_variant_vocab.cjs — catalog-wide scan for missing
 * ATTRIBUTE_RULES vocabulary, generalizing the manual process that found
 * "smoke"/"tinted"/"dark smoke" (session 74): cluster ungrouped products by
 * (source_vendor, brand, category, name-with-last-word-removed), and for any
 * cluster where 2+ members have a DIFFERENT trailing word that
 * extractAttribute() doesn't recognize, tally that word across the whole
 * catalog. A word that shows up as "the differentiator" across many distinct
 * product lines is strong, low-risk evidence it belongs in ATTRIBUTE_RULES —
 * a word that only shows up once might be a real word but is higher risk of
 * being a false-positive trap (see "Solar": genuine tint color in one
 * product line, but also "Solar-Reflective Leather" material and a literal
 * "Solar Panel" product in others — ambiguous, correctly left alone).
 *
 * This is a read-only report. It does not modify the database or the
 * ATTRIBUTE_RULES list — it produces a ranked candidate list for a human
 * (or a follow-up session) to review before adding anything.
 *
 * Usage: node audit_missing_variant_vocab.cjs [--min-clusters=3]
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../../.env.local') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../.env') }); } catch {}

const { Pool } = require('pg');
if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const MIN_CLUSTERS = parseInt((process.argv.find(a => a.startsWith('--min-clusters=')) || '').split('=')[1] || '3', 10);

// ── Copied from build_variant_groups.cjs (kept in sync manually — this is a
// read-only audit tool, not worth the coupling risk of a shared import) ──
const ATTRIBUTE_RULES = [
  { pattern: /([+-]0\.0\d{2,3}|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b)/i },
  { pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i },
  { pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LGE?|LRG|MED|MD|SM|XS|\dX(?:-?L)?)\b/i },
  { pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i },
  { pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i },
  { pattern: /\b(brushed ss|brushed stainless|brushed|raw ss|raw stainless|matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated)\b/i },
  { pattern: /\bthrottle\b/i }, // placeholder — Throttle rule not needed for this audit's purpose
  { pattern: /\b(?:(bright|dark|light)\s+)?(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|pink|burgundy|gr[ae]y|clear|natural|stainless|smoke|tinted|tint|\bSS\b)\b/i },
];
function isRecognized(word) {
  return ATTRIBUTE_RULES.some(r => r.pattern.test(word));
}

function stripPackIndicators(name) {
  return (name ?? '')
    .replace(/\s*\d+\s*\/\s*P[CK]\b/gi, '')
    .replace(/\s*\d+\s*-?\s*PACK\b/gi, '')
    .replace(/\s*\bSET\s+OF\s+\d+\b/gi, '')
    .replace(/\s*\d+\s*P(?:CS?|CE?|K)\b/gi, '')
    .replace(/\s*\bPAIR\b/gi, '')
    .replace(/\s*\bSINGLE\b/gi, '')
    .replace(/\s*\bOE\s*#[\w\-]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, name, brand, source_vendor, category
      FROM catalog_unified
      WHERE is_active = true AND variant_group_id IS NULL AND is_kit IS NOT TRUE
    `);
    console.log(`Scanning ${rows.length} ungrouped active products...\n`);

    // Cluster by (vendor|brand|category|name-minus-last-word)
    const clusters = new Map();
    for (const row of rows) {
      const clean = stripPackIndicators(row.name);
      const words = clean.split(/\s+/);
      if (words.length < 2) continue;
      const lastWord = words[words.length - 1].replace(/[.,;:!?"']+$/, '');
      const stem = words.slice(0, -1).join(' ').toLowerCase();
      const key = `${row.source_vendor}|${row.brand}|${row.category}|${stem}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push({ id: row.id, name: row.name, lastWord });
    }

    // For clusters with 2+ distinct last words where NONE are recognized,
    // tally each unrecognized word across all clusters it appears in.
    const wordTally = new Map(); // word (lowercase) -> { count, clusters: Set, examples: [] }
    for (const [key, members] of clusters) {
      if (members.length < 2) continue;
      const distinctWords = new Set(members.map(m => m.lastWord.toLowerCase()));
      if (distinctWords.size < 2) continue; // all same last word — not a variant cluster
      const unrecognized = members.filter(m => !isRecognized(m.lastWord));
      if (unrecognized.length < 2) continue; // need at least 2 members with an unrecognized word to matter
      for (const m of unrecognized) {
        const w = m.lastWord.toLowerCase();
        if (!wordTally.has(w)) wordTally.set(w, { count: 0, clusterKeys: new Set(), examples: [] });
        const t = wordTally.get(w);
        t.count++;
        t.clusterKeys.add(key);
        if (t.examples.length < 3) t.examples.push(m.name);
      }
    }

    const ranked = [...wordTally.entries()]
      .map(([word, t]) => ({ word, distinctClusters: t.clusterKeys.size, totalProducts: t.count, examples: t.examples }))
      .filter(r => r.distinctClusters >= MIN_CLUSTERS)
      .sort((a, b) => b.distinctClusters - a.distinctClusters);

    console.log(`=== Candidate missing vocabulary words (appear as the differentiator in >= ${MIN_CLUSTERS} distinct product-line clusters) ===\n`);
    for (const r of ranked) {
      console.log(`  "${r.word}" — ${r.distinctClusters} distinct clusters, ${r.totalProducts} products`);
      r.examples.forEach(ex => console.log(`      e.g. "${ex}"`));
    }
    console.log(`\n${ranked.length} candidate words found. Review before adding to ATTRIBUTE_RULES — a word appearing in many DIFFERENT clusters is lower-risk than one appearing narrowly, but check for ambiguous/overloaded meanings (like "Solar") before adding.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
