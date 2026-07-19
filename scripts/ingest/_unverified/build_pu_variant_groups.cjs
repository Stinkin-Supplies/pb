#!/usr/bin/env node
/**
 * build_pu_variant_groups.cjs
 *
 * Groups PU and VTWIN products by name-similarity:
 *   base_name = regexp_replace(name, ' - [^-]+$', '')
 *   group key = (base_name, brand, source_vendor)
 *
 * Products with the same base_name + brand are variants of each other.
 * Creates entries in catalog_variant_groups + catalog_variant_members
 * and backfills variant_group_id on catalog_unified.
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE.
 */
'use strict';
const { Pool } = require('pg');

const DRY        = process.argv.includes('--dry');
const BATCH_SIZE = 500;

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

// Same attribute extraction as build_variant_groups.cjs
function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const ATTRIBUTE_RULES = [
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b)/i,
    extract: m => m[1].toUpperCase() },
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LGE?|LRG|MED|SM|XS|\dX(?:-?L)?)\b/i,
    extract: m => m[1].toUpperCase().replace('LGE','LG').replace('LRG','LG').replace('MED','M').replace('SM','S') },
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: m => m[1] + ' Gauge' },
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: m => m[1] + '" Rise' },
  { name: 'Finish',
    pattern: /\b(matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: m => toTitleCase(m[1]) },
  { name: 'Length',
    pattern: /\b(\d{1,3}(?:\.\d+)?"|\+\d{1,2}")\s*$/,
    extract: m => m[1] },
  { name: 'Color',
    pattern: /\b(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|gr[ae]y|clear|natural|stainless)\b/i,
    extract: m => toTitleCase(m[1]) },
];

function extractAttribute(variantSuffix) {
  if (!variantSuffix) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const m = variantSuffix.match(rule.pattern);
    if (m) return { name: rule.name, value: rule.extract(m) };
  }
  // Fall back to the raw suffix trimmed
  return { name: 'Style', value: variantSuffix.trim() };
}

function detectGroupAxis(attrs) {
  const types = attrs.filter(Boolean).map(a => a.name);
  if (!types.length) return null;
  const counts = {};
  types.forEach(t => counts[t] = (counts[t] || 0) + 1);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top[1] / attrs.length >= 0.5 ? top[0] : null;
}

async function main() {
  console.log('=================================================');
  console.log('  build_pu_variant_groups.cjs');
  console.log(DRY ? '  [DRY RUN]' : '  [LIVE]');
  console.log('=================================================\n');

  // Whitelist approach: only group PU products from brands/categories
  // where the name suffix is ALWAYS a color/gauge/size variant, never fitment.
  // Manually verified safe categories:
  //   - Wire spools (Namz, NAMZ) — suffix is color, gauge is in base name
  //   - Wire conduit / loom (suffix is color or diameter)
  //   - Grips (suffix is color or material)
  //   - Grip accessories
  // Everything else (lever sets, seats, springs, rotors) is fitment-specific
  // even without fitment rows in catalog_fitment_v2.
  const WHITELIST_CONDITIONS = `(
    lower(name) LIKE '%wire spool%'
    OR lower(name) LIKE '%wire loom%'
    OR lower(name) LIKE '%wire conduit%'
  )`;

  // Fetch groups and their members as paired rows (not separate arrays)
  // so name and id are always correctly associated
  const groupMeta = await q(`
    SELECT
      source_vendor,
      regexp_replace(name, ' - [^-]+$', '') AS base_name,
      brand,
      COUNT(*) AS cnt
    FROM catalog_unified
    WHERE source_vendor IN ('PU', 'VTWIN')
      AND is_active = true
      AND name ~ ' - '
      AND ${WHITELIST_CONDITIONS}
    GROUP BY source_vendor, regexp_replace(name, ' - [^-]+$', ''), brand
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);

  // For each group, fetch members as paired (id, name) rows
  const groups = await Promise.all(groupMeta.map(async g => {
    const members = await q(`
      SELECT id, name FROM catalog_unified
      WHERE source_vendor = $1
        AND brand = $2
        AND regexp_replace(name, ' - [^-]+$', '') = $3
        AND is_active = true
      ORDER BY name
    `, [g.source_vendor, g.brand, g.base_name]);
    return {
      ...g,
      product_ids: members.map(m => m.id),
      names: members.map(m => m.name),
    };
  }));

  console.log(`Found ${groups.length} PU/VTWIN variant groups`);
  console.log(`Total products to group: ${groups.reduce((s, g) => s + parseInt(g.cnt), 0)}`);

  if (DRY) {
    console.log('\nTop 20 groups:');
    groups.slice(0, 20).forEach(g => {
      const suffix = g.names[0].replace(g.base_name + ' - ', '');
      const attr = extractAttribute(suffix);
      console.log(`  [${g.source_vendor}] "${g.base_name}" (${g.brand}) — ${g.cnt} variants → axis: ${attr?.name ?? '?'}: ${attr?.value ?? '?'}`);
    });
    await pool.end();
    return;
  }

  // Ensure tables exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_variant_groups (
      id             SERIAL PRIMARY KEY,
      wps_product_id INTEGER UNIQUE,
      display_name   TEXT NOT NULL,
      source_vendor  TEXT NOT NULL DEFAULT 'WPS',
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_variant_members (
      id             SERIAL PRIMARY KEY,
      group_id       INTEGER NOT NULL REFERENCES catalog_variant_groups(id) ON DELETE CASCADE,
      product_id     INTEGER NOT NULL REFERENCES catalog_unified(id) ON DELETE CASCADE,
      option_1_name  TEXT,
      option_1_value TEXT,
      option_2_name  TEXT,
      option_2_value TEXT,
      sort_order     INTEGER DEFAULT 0,
      UNIQUE (group_id, product_id)
    )
  `);
  await pool.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS variant_group_id INTEGER REFERENCES catalog_variant_groups(id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cu_variant_group ON catalog_unified(variant_group_id) WHERE variant_group_id IS NOT NULL`);

  let groupsCreated = 0, membersCreated = 0;
  const axisStats = {};

  for (const g of groups) {
    // Check for existing group before inserting to prevent duplicates on re-run
    const existing = await q(`
      SELECT id FROM catalog_variant_groups
      WHERE display_name = $1 AND source_vendor = $2 AND wps_product_id IS NULL
      LIMIT 1
    `, [g.base_name, g.source_vendor]);

    const grp = existing[0] ?? (await q(`
      INSERT INTO catalog_variant_groups (display_name, source_vendor)
      VALUES ($1, $2)
      RETURNING id
    `, [g.base_name, g.source_vendor]))[0];
    groupsCreated++;

    // Extract the raw variant suffix (everything after base_name + ' - ')
    // Use it directly as the label — two-tone colors like "White/Red" must not
    // be parsed through ATTRIBUTE_RULES which would extract only one color word.
    const memberSuffixes = g.names.map(name => {
      const suffix = name.startsWith(g.base_name + ' - ')
        ? name.slice(g.base_name.length + 3).trim()
        : null;
      return suffix;
    });

    // Detect axis name from the first non-null suffix using rules (for display only)
    const sampleAttr = memberSuffixes.find(Boolean) ? extractAttribute(memberSuffixes.find(Boolean)) : null;
    const axisName = sampleAttr?.name ?? 'Color';
    axisStats[axisName] = (axisStats[axisName] || 0) + 1;

    for (let idx = 0; idx < g.product_ids.length; idx++) {
      const productId = g.product_ids[idx];
      const suffix = memberSuffixes[idx];

      // option_1: raw suffix as the label (e.g. "White/Red", "Brown/Black")
      // option_2: fitment label if available
      const fitRows = await q(`
        SELECT hf.name AS family, MIN(hmy.year) AS min_year, MAX(hmy.year) AS max_year
        FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm ON hm.id = hmy.model_id
        JOIN harley_families hf ON hf.id = hm.family_id
        WHERE cfv.product_id = $1
        GROUP BY hf.name ORDER BY hf.name LIMIT 3
      `, [productId]);

      const fitLabel = fitRows.length > 0
        ? fitRows.map(r => `${r.family} ${r.min_year}–${r.max_year}`).join(', ')
        : null;

      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_id, product_id) DO UPDATE SET
          option_1_name = EXCLUDED.option_1_name, option_1_value = EXCLUDED.option_1_value,
          option_2_name = EXCLUDED.option_2_name, option_2_value = EXCLUDED.option_2_value
      `, [
        grp.id, productId,
        suffix ? axisName : null,
        suffix ?? null,
        fitLabel ? 'Fits' : null, fitLabel,
        idx,
      ]);
      membersCreated++;
    }

    // Backfill variant_group_id on catalog_unified
    await pool.query(
      `UPDATE catalog_unified SET variant_group_id = $1 WHERE id = ANY($2::int[])`,
      [grp.id, g.product_ids]
    );

    if (groupsCreated % 100 === 0) {
      console.log(`  ${groupsCreated}/${groups.length} groups, ${membersCreated} members`);
    }
  }

  const [stats] = await q(`
    SELECT
      (SELECT COUNT(*) FROM catalog_variant_groups) AS groups,
      (SELECT COUNT(*) FROM catalog_variant_members) AS members,
      (SELECT COUNT(*) FROM catalog_unified WHERE variant_group_id IS NOT NULL) AS cu_tagged
  `);

  console.log(`\n═══ COMPLETE ═══`);
  console.log(`  New groups: ${groupsCreated}  New members: ${membersCreated}`);
  console.log(`  Axis breakdown:`, axisStats);
  console.log(`  Total groups: ${stats.groups}  Total members: ${stats.members}  Tagged: ${stats.cu_tagged}`);

  await pool.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
