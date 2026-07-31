#!/usr/bin/env node
/**
 * merge_split_variant_groups_catalogwide.mjs
 *
 * Catalog-wide version of merge_split_variant_groups_ridinggear.mjs. That
 * script used a hardcoded regex stripping only apparel size tokens (SM, MD,
 * 2X, etc.) to find split product lines -- fine for apparel, but catalog-
 * wide the attribute vocabulary is broader (Color, Finish, Compound, Side,
 * Gauge, Rise). This reuses extractAttribute()/stripAttributeFromName()
 * (same functions as build_variant_groups_wps_catalogwide.mjs) per row
 * instead of a fixed regex, so it catches a split caused by ANY recognized
 * axis, not just apparel size.
 *
 * Usage:
 *   node scripts/ingest/merge_split_variant_groups_catalogwide.mjs            # dry run
 *   node scripts/ingest/merge_split_variant_groups_catalogwide.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

function toTitleCase(s) { return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
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
function stripAttributeFromName(name, attrValue) {
  if (!attrValue) return stripPackIndicators(name).trim();
  return stripPackIndicators(
    name.replace(new RegExp(`(?<![a-zA-Z0-9])${escapeRegex(attrValue)}"?(?![a-zA-Z0-9])`, 'i'), ' ')
  ).replace(/\s+/g, ' ').replace(/\s*-\s*-\s*/g, ' - ').replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').trim();
}
const ATTRIBUTE_RULES = [
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|(?<![\w.])\.0\d{2,3}(?!\d)|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b|\bstandard\b)/i,
    extract: m => m[1].toUpperCase() },
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Side',
    pattern: /\b(left|right)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LARGE|LGE?|LRG|MEDIUM|MED|MD|SM|XS|\dX(?:-?L)?)\b/i,
    extract: m => m[1].toUpperCase()
      .replace('LARGE','LG').replace('LGE','LG').replace('LRG','LG')
      .replace('MEDIUM','M').replace('MED','M').replace('MD','M').replace('SM','S') },
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: m => m[1] + ' Gauge' },
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: m => m[1] + '" Rise' },
  { name: 'Finish',
    pattern: /\b(brushed ss|brushed stainless|brushed|raw ss|raw stainless|matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated|polished)\b/i,
    extract: m => {
      const v = m[1].toLowerCase();
      if (v === 'brushed ss')        return 'Brushed SS';
      if (v === 'raw ss')            return 'Raw SS';
      if (v === 'brushed stainless') return 'Brushed Stainless';
      if (v === 'raw stainless')     return 'Raw Stainless';
      if (v === 'brushed')           return 'Brushed';
      return toTitleCase(m[1]);
    } },
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Color',
    pattern: /\b(?:(bright|dark|light)\s+)?(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|pink|burgundy|gr[ae]y|clear|natural|stainless|smoke|tinted|tint|blk|chr|\bSS\b)\b/i,
    extract: m => {
      const raw = m[2].toUpperCase();
      const color = raw === 'SS' ? 'Stainless' : raw === 'BLK' ? 'Black' : raw === 'CHR' ? 'Chrome' : toTitleCase(m[2]);
      return m[1] ? `${toTitleCase(m[1])} ${color}` : color;
    } },
];
function extractAttribute(name) {
  if (!name) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (m) return { name: rule.name, value: rule.extract(m), raw: m[0] };
  }
  return null;
}

async function main() {
  const rows = await q(`
    SELECT id, name, brand, display_category, variant_group_id
    FROM catalog_unified
    WHERE is_active = true AND source_vendor = 'WPS' AND variant_group_id IS NOT NULL
  `);
  console.log(`${rows.length} active grouped WPS rows scanned\n`);

  const clusters = new Map(); // key -> Set of group_ids
  for (const row of rows) {
    const attr = extractAttribute(row.name);
    if (!attr) continue;
    const baseName = stripAttributeFromName(row.name, attr.raw);
    if (!baseName || baseName.length < 4 || baseName === row.name) continue;
    const key = `${row.display_category}|${row.brand}|${baseName.toLowerCase()}`;
    if (!clusters.has(key)) clusters.set(key, { baseName, brand: row.brand, category: row.display_category, groupIds: new Set() });
    clusters.get(key).groupIds.add(row.variant_group_id);
  }

  const splits = [...clusters.values()].filter(c => c.groupIds.size > 1);
  console.log(`${splits.length} product lines split across multiple groups\n`);

  let merged = 0, membersMoved = 0, skippedDuplicate = 0;
  for (const c of splits) {
    const ids = [...c.groupIds].sort((a, b) => a - b);
    const [survivor, ...losers] = ids;
    if (ids.length > 2) {
      console.log(`  ⚠ SKIPPING "${c.baseName}" (${c.category} / ${c.brand}) — ${ids.length} groups: [${ids.join(',')}] — needs manual review`);
      continue;
    }

    // Guard against merging two groups whose UNION has a repeated attribute
    // value -- discovered live: two individually-clean 2-member groups
    // ("Black"+"Chrome" each) merged into a bogus 4-member group with two
    // "Black"s and two "Chrome"s, because their members were genuinely
    // different duplicate-SKU products sharing one name, not real variant
    // siblings. Each half alone looked fine; only the union was broken.
    const allValues = await q(`SELECT option_1_value FROM catalog_variant_members WHERE group_id = ANY($1::int[])`, [ids]);
    const nonNull = allValues.map(r => r.option_1_value).filter(Boolean);
    if (new Set(nonNull).size !== nonNull.length) {
      console.log(`  ⚠ SKIPPING "${c.baseName}" (${c.category} / ${c.brand}) — merging [${ids.join(',')}] would create duplicate attribute values`);
      skippedDuplicate++;
      continue;
    }

    console.log(`  merge ${losers.join(',')} -> ${survivor}   "${c.baseName}" (${c.category} / ${c.brand})`);

    if (!APPLY) continue;

    for (const loserId of losers) {
      const moved = await q(`
        UPDATE catalog_variant_members SET group_id = $1
        WHERE group_id = $2
          AND product_id NOT IN (SELECT product_id FROM catalog_variant_members WHERE group_id = $1)
        RETURNING id
      `, [survivor, loserId]);
      membersMoved += moved.length;
      await q(`DELETE FROM catalog_variant_members WHERE group_id = $1`, [loserId]);
      await q(`UPDATE catalog_unified SET variant_group_id = $1, updated_at = now() WHERE variant_group_id = $2`, [survivor, loserId]);
      await q(`DELETE FROM catalog_variant_groups WHERE id = $1`, [loserId]);
    }
    merged++;
  }

  console.log(`\n${APPLY ? 'Merged' : 'Would merge'}: ${merged} group pairs, ${membersMoved} members re-parented (${skippedDuplicate} skipped as would-be-duplicate)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
