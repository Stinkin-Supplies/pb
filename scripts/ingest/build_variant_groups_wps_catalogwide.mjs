#!/usr/bin/env node
/**
 * build_variant_groups_wps_catalogwide.mjs
 *
 * Catalog-wide version of build_variant_groups_wps_apparel.mjs (which was
 * scoped to Riding Gear & Apparel and already ran successfully: 309 groups,
 * 683 members, then 277 of those groups turned out split against pre-
 * existing Phase 1 groups and were merged by merge_split_variant_groups_
 * ridinggear.mjs). Same root cause, same fix, just without the category
 * filter -- 11,464 active WPS rows catalog-wide have no variant_group_id
 * because Phase 1 (wps_product_id-based grouping in build_variant_groups.cjs)
 * only groups sizes/colors that happen to share a wps_product_id, and
 * Phase 2's name-based fallback in that script is hardcoded to PU/VTWIN.
 *
 * Logic copied verbatim from the apparel version (including the SM/MD
 * raw-vs-normalized strip fix) -- only the query's category filter is
 * removed.
 *
 * Usage:
 *   node scripts/ingest/build_variant_groups_wps_catalogwide.mjs            # dry run
 *   node scripts/ingest/build_variant_groups_wps_catalogwide.mjs --apply    # live write
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

const MAX_VARIANT_MEMBERS = 20;

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
function nameExtractPackQty(name) {
  if (!name) return null;
  let m;
  if ((m = name.match(/(\d+)\s*\/\s*P[CK]\b/i)))   return parseInt(m[1]);
  if ((m = name.match(/(\d+)\s*-?\s*PACK\b/i)))     return parseInt(m[1]);
  if ((m = name.match(/SET\s+OF\s+(\d+)/i)))         return parseInt(m[1]);
  if ((m = name.match(/(\d+)\s*P(?:CS?|CE?|K)\b/i))) return parseInt(m[1]);
  if (/\bPAIR\b/i.test(name))   return 2;
  if (/\bSINGLE\b/i.test(name)) return 1;
  return null;
}
function nameImpliesKit(name) {
  if (!name) return false;
  if (/\b(?:complete\s+set|service\s+kit|rebuild\s+kit)\b/i.test(name)) return true;
  if (/\b(?:kit|assembly|assm?y)\b/i.test(name)) {
    return /\s(?:and|with)\s| & |\bw\/\s/i.test(name);
  }
  return false;
}
function wordSimilarity(a, b) {
  const sa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const sb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union  = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
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

function extractAllAttributes(name) {
  if (!name) return [];
  const found = [];
  const seenAxisNames = new Set();
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (!m) continue;
    const axisName = normalizeAxisName(rule.name);
    if (seenAxisNames.has(axisName)) continue;
    seenAxisNames.add(axisName);
    found.push({ name: axisName, value: rule.extract(m) });
  }
  return found;
}
function filterDistinguishingAxes(memberAttrLists, primaryAxisName) {
  const byAxis = new Map();
  for (const attrs of memberAttrLists) {
    for (const a of attrs) {
      if (!byAxis.has(a.name)) byAxis.set(a.name, new Set());
      byAxis.get(a.name).add(a.value);
    }
  }
  const keptAxisNames = [...byAxis.entries()]
    .filter(([, values]) => values.size >= 2)
    .map(([name]) => name);
  const ordered = [];
  if (primaryAxisName && keptAxisNames.includes(primaryAxisName)) ordered.push(primaryAxisName);
  for (const name of keptAxisNames) {
    if (name !== primaryAxisName) ordered.push(name);
  }
  return ordered;
}
function extractAttribute(name) {
  if (!name) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (m) return { name: rule.name, value: rule.extract(m), raw: m[0] };
  }
  return null;
}
function extractSecondAttribute(name, primaryAxisName) {
  if (!name) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const normalized = normalizeAxisName(rule.name);
    if (normalized === primaryAxisName) continue;
    const m = name.match(rule.pattern);
    if (m) return { name: normalized, value: rule.extract(m) };
  }
  return null;
}
function normalizeAxisName(name) { return name === 'Finish' ? 'Color' : name; }
function detectGroupAxis(attrs) {
  const types = attrs.filter(Boolean).map(a => normalizeAxisName(a.name));
  if (!types.length) return null;
  const counts = {};
  types.forEach(t => counts[t] = (counts[t] || 0) + 1);
  const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return top[1] / attrs.length >= 0.5 ? top[0] : null;
}

function classifyGroup(candidates) {
  const members = candidates.filter(m => !m.is_kit && !nameImpliesKit(m.name));
  if (members.length < 2 || members.length > MAX_VARIANT_MEMBERS) return null;

  const attrs = members.map(m => extractAttribute(m.name));
  const axis  = detectGroupAxis(attrs);

  if (axis) {
    const packQtys = new Set(members.map(m => m.pack_qty ?? nameExtractPackQty(m.name) ?? 1));
    if (packQtys.size > 1) return null;

    const baseNames = members.map((m, i) => stripAttributeFromName(m.name, attrs[i]?.raw));
    const anchor = baseNames[0];
    const similar = baseNames.every(b => b === anchor || wordSimilarity(b, anchor) >= 0.65);
    if (!similar) return null;

    const distinctValues = new Set(attrs.filter(Boolean).map(a => a.value));
    // Every member's value must be unique -- a real size/color/finish family
    // has exactly one product per option. Catalog-wide, fitment-specific
    // duplicate SKUs sharing one name are common (e.g. 7 different "Burly
    // Cntrl Kit 14" Ape Stainless" rows, each a different unstated HD-model
    // fitment) and would otherwise pass the ">=2 distinct values" check by
    // riding along with 2 other rise heights, merging genuinely different
    // products into one fake "14-inch" option. Reject rather than guess a
    // sub-split -- not confident enough to invent a second axis here.
    const hasDuplicateValue = distinctValues.size < attrs.filter(Boolean).length;
    if (distinctValues.size >= 2 && !hasDuplicateValue) {
      const normalizedAxis = normalizeAxisName(axis);
      const attrs2 = members.map(m => extractSecondAttribute(m.name, normalizedAxis));
      const distinctValues2 = new Set(attrs2.filter(Boolean).map(a => a.value));
      const memberAttrs2 = distinctValues2.size >= 2 ? attrs2 : members.map(() => null);

      const allAttrsPerMember = members.map(m => extractAllAttributes(m.name));
      const keptAxisNames = filterDistinguishingAxes(allAttrsPerMember, normalizedAxis);
      const memberAxes = allAttrsPerMember.map(attrList => {
        const byName = new Map(attrList.map(a => [a.name, a.value]));
        return keptAxisNames
          .filter(axisName => byName.has(axisName))
          .map((axisName, i) => ({ name: axisName, value: byName.get(axisName), order: i }));
      });

      return { axis: normalizedAxis, members, memberAttrs: attrs, memberAttrs2, memberAxes };
    }
  }

  const packQtys = members.map(m => m.pack_qty ?? nameExtractPackQty(m.name) ?? null);
  const distinctQtys = new Set(packQtys.filter(v => v != null));
  if (distinctQtys.size < 2) return null;

  const baseNames = members.map(m => stripPackIndicators(m.name).toLowerCase().trim());
  const anchor = baseNames[0];
  const similar = baseNames.every(b => b === anchor || wordSimilarity(b, anchor) >= 0.75);
  if (!similar) return null;

  const packAttrs = packQtys.map(qty => qty != null ? { name: 'Pack Size', value: qty === 1 ? '1 Piece' : `${qty}-Pack` } : null);
  return {
    axis: 'Pack Size', members, memberAttrs: packAttrs, memberAttrs2: members.map(() => null),
    memberAxes: packAttrs.map(a => a ? [{ name: 'Pack Size', value: a.value, order: 0 }] : []),
  };
}

async function upsertMemberOptions(memberId, axes) {
  for (const a of axes ?? []) {
    if (!a?.name || !a?.value) continue;
    await q(`
      INSERT INTO catalog_variant_member_options (member_id, axis_name, axis_value, axis_order)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (member_id, axis_name) DO UPDATE
        SET axis_value = EXCLUDED.axis_value, axis_order = EXCLUDED.axis_order
    `, [memberId, a.name, a.value, a.order ?? 0]);
  }
}

async function main() {
  const products = await q(`
    SELECT id, name, brand, display_category, source_vendor, is_kit, pack_qty
    FROM catalog_unified
    WHERE source_vendor = 'WPS'
      AND is_active = true
      AND (is_kit IS NULL OR is_kit = false)
      AND variant_group_id IS NULL
    ORDER BY display_category, brand, name
  `);

  console.log(`${products.length} ungrouped active WPS products catalog-wide\n`);

  const nameGroups = new Map();
  for (const row of products) {
    if (nameImpliesKit(row.name)) continue;
    const attr = extractAttribute(row.name);
    if (!attr) continue;
    const baseName = stripAttributeFromName(row.name, attr.raw);
    if (!baseName || baseName.length < 4 || baseName === row.name) continue;

    // Category included in the key -- unlike the apparel-scoped run, WPS
    // brand names aren't unique enough across the whole catalog (e.g. a
    // generic brand shared by both a helmet line and an unrelated hardware
    // line) to safely key on brand+name alone.
    const key = `${row.display_category}|${row.brand}|${baseName.toLowerCase()}`;
    if (!nameGroups.has(key)) {
      nameGroups.set(key, { baseName, brand: row.brand, category: row.display_category, members: [] });
    }
    nameGroups.get(key).members.push({ ...row, attr });
  }

  let groupsCreated = 0, membersCreated = 0;
  const skipReasons = {};
  const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };
  const previewLines = [];
  const categoryTally = {};

  for (const [, group] of nameGroups) {
    if (group.members.length < 2) continue;

    const axes = group.members.map(m => normalizeAxisName(m.attr.name));
    const dominantAxis = axes[0];
    if (!axes.every(a => a === dominantAxis)) { bump(skipReasons, 'mixed_axes'); continue; }

    const result = classifyGroup(group.members.map(m => ({ id: m.id, name: m.name, is_kit: m.is_kit, pack_qty: m.pack_qty })));
    if (!result) { bump(skipReasons, 'classify_failed'); continue; }
    if (result.members.length < 2) { bump(skipReasons, 'too_few_after_filter'); continue; }

    previewLines.push(`  GROUP [${result.axis}] "${group.baseName}" (${group.category} / ${group.brand}) — ${result.members.length} members`);
    result.members.forEach((m, i) => {
      const attr = result.memberAttrs[i];
      previewLines.push(`    ${attr?.value ?? '?'} — "${m.name}"`);
    });
    bump(categoryTally, group.category);

    if (!APPLY) continue;

    const ids = result.members.map(m => m.id);
    const alreadyGrpd = await q(`SELECT id FROM catalog_unified WHERE id = ANY($1::int[]) AND variant_group_id IS NOT NULL`, [ids]);
    if (alreadyGrpd.length === ids.length) continue;

    const seenIds = new Set();
    const unique = result.members.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });
    if (unique.length < 2) continue;

    const attrById  = new Map(result.members.map((m, i) => [m.id, result.memberAttrs[i]]));
    const attr2ById = new Map(result.members.map((m, i) => [m.id, result.memberAttrs2?.[i]]));
    const axesById  = new Map(result.members.map((m, i) => [m.id, result.memberAxes?.[i]]));

    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES (NULL, $1, 'WPS')
      RETURNING id
    `, [group.baseName]);
    groupsCreated++;

    for (let i = 0; i < unique.length; i++) {
      const m = unique[i];
      const attr = attrById.get(m.id);
      const attr2 = attr2ById.get(m.id);
      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_id, product_id) DO NOTHING
      `, [grp.id, m.id, attr ? normalizeAxisName(attr.name) : null, attr?.value ?? null,
          attr2 ? normalizeAxisName(attr2.name) : null, attr2?.value ?? null, i]);

      const [memberRow] = await q(`SELECT id FROM catalog_variant_members WHERE group_id = $1 AND product_id = $2`, [grp.id, m.id]);
      if (memberRow) await upsertMemberOptions(memberRow.id, axesById.get(m.id));
      membersCreated++;
    }
  }

  if (APPLY) {
    await pool.query(`
      UPDATE catalog_unified cu
      SET variant_group_id = cvm.group_id
      FROM catalog_variant_members cvm
      WHERE cvm.product_id = cu.id AND cu.variant_group_id IS NULL
    `);
  }

  console.log(previewLines.slice(0, 400).join('\n'));
  console.log(`\n[preview truncated to first ~400 lines of output for readability]`);
  console.log(`\n${APPLY ? 'Applied' : 'Would create'}: ${groupsCreated} groups, ${membersCreated} members`);
  console.log('By category:', categoryTally);
  console.log('Skip reasons:', skipReasons);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
