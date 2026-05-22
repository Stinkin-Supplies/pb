#!/usr/bin/env node
// build_variant_groups.cjs
const { Pool } = require('pg');
const DRY = process.argv.includes('--dry');
const TOKEN = 'eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO';
const BASE  = 'http://api.wps-inc.com';
const pool = new Pool({ host: '2a01:4ff:f0:fa6f::1', port: 5432, database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly' });
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

// ─── Attribute extraction ─────────────────────────────────────────────────────
function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ATTRIBUTE_RULES = [
  // OVERSIZE/UNDERSIZE engine measurements: +0.001, +0.020, STD, OS, US
  // Must be exactly 3-4 decimal places to avoid matching "+10" cable extensions
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b)/i,
    extract: m => m[1].toUpperCase() },
  // BRAKE PAD COMPOUND — Organic, Sintered, Semi-Metallic
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: m => toTitleCase(m[1]) },
  // APPAREL SIZE — run before Color so "BLACK 2X" → Apparel Size not Color
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LGE?|LRG|MED|SM|XS|\dX(?:-?L)?)\b/i,
    extract: m => m[1].toUpperCase().replace('LGE','LG').replace('LRG','LG').replace('MED','M').replace('SM','S') },
  // GAUGE — "18 gauge", "18ga" — before color
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: m => m[1] + ' Gauge' },
  // RISE — handlebar height: '12" APE', '10" rise' — before Color so black APE bars → Rise not Color
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: m => m[1] + '" Rise' },
  // FINISH — multi-word before plain color
  { name: 'Finish',
    pattern: /\b(matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated)\b/i,
    extract: m => toTitleCase(m[1]) },
  // THROTTLE
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: m => toTitleCase(m[1]) },
  // COLOR — vinyl excluded (material not color); no number guard needed since
  // displacement numbers like "128" are just context, black/chrome IS the variant axis
  { name: 'Color',
    pattern: /\b(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|gr[ae]y|clear|natural|stainless)\b/i,
    extract: m => toTitleCase(m[1]) },
];

function extractAttribute(name) {
  if (!name) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (m) return { name: rule.name, value: rule.extract(m) };
  }
  return null;
}

function detectGroupAxis(memberAttrs) {
  const types = memberAttrs.filter(Boolean).map(a => a.name);
  if (types.length === 0) return null;
  const counts = {};
  types.forEach(t => counts[t] = (counts[t] || 0) + 1);
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return dominant[1] / memberAttrs.length >= 0.5 ? dominant[0] : null;
}



async function main() {
  console.log(`Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);

  // First — find actual brand column name in catalog_unified
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_unified' AND column_name ILIKE '%brand%' ORDER BY column_name`);
  console.log(`catalog_unified brand columns: ${cols.map(c => c.column_name).join(', ')}`);

  // Find actual slug/name column too
  const nameCols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_unified' AND column_name IN ('slug','name','product_name','title') ORDER BY column_name`);
  console.log(`catalog_unified name/slug columns: ${nameCols.map(c => c.column_name).join(', ')}`);

  const brandCol = cols[0]?.column_name ?? 'brand';

  // Groups: wps_product_id with 2+ items in catalog_unified
  const groups = await q(`
    SELECT
      w.wps_product_id,
      COUNT(DISTINCT cu.id) as item_count,
      array_agg(DISTINCT cu.id ORDER BY cu.id) as unified_ids,
      array_agg(DISTINCT cu.sku ORDER BY cu.sku) as skus,
      MIN(cu.name) as sample_name,
      MIN(cu.${brandCol}) as brand
    FROM wps_catalog w
    JOIN catalog_unified cu ON cu.vendor_sku = w.sku
    WHERE w.wps_product_id IS NOT NULL
    GROUP BY w.wps_product_id
    HAVING COUNT(DISTINCT cu.id) > 1
    ORDER BY COUNT(DISTINCT cu.id) DESC
  `);

  console.log(`\nFound ${groups.length} variant groups (2+ items each)`);
  console.log(`Total variant SKUs: ${groups.reduce((s, g) => s + parseInt(g.item_count), 0)}`);
  console.log('\nTop 20:');
  groups.slice(0, 20).forEach(g =>
    console.log(`  wps_product_id=${g.wps_product_id} — ${g.item_count} items — "${g.sample_name}" (${g.brand})`)
  );

  if (DRY) {
    console.log('\nAttribute extraction samples:');
    groups.slice(0, 20).forEach(g => {
      const attr = extractAttribute(g.sample_name);
      console.log(`  "${g.sample_name}" -> ${attr ? attr.name + ': ' + attr.value : '(no match)'}`);
    });
    const tests = [
      'GUIDE EX +0.001 BRONZE HD EVO 84-99 SPORTSTER 86-03',
      '100\' WIRE SPOOL - 18 GAUGE - BLACK',
      'MOTO-FLEX GLOVES BLACK 2X',
      'HANDLEBAR MATTE BLACK 1"',
      'THROTTLE KIT PUSH-PULL CABLE',
      'BLACK VINYL GRIP',
      '6   M8 SOFTAIL DERBY COVER 128 BLACK',
      'PISTON +0.020 OVERSIZE EVO',
    ];
    console.log('\nPattern tests:');
    tests.forEach(n => { const a = extractAttribute(n); console.log(`  "${n}" -> ${a ? a.name+': '+a.value : '(no match)'}`); });
    await pool.end();
    return;
  }

  // Create tables
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_members_product ON catalog_variant_members(product_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_members_group   ON catalog_variant_members(group_id)`);
  await pool.query(`ALTER TABLE catalog_variant_groups ADD COLUMN IF NOT EXISTS family_key TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_groups_family_key ON catalog_variant_groups(family_key) WHERE family_key IS NOT NULL`);
  console.log('\nTables ready');

  // Fetch product display names from WPS API
  const productIds = groups.map(g => g.wps_product_id);
  const productNames = {};
  console.log(`Fetching ${productIds.length} product names from WPS API...`);
  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50);
    try {
      const res = await fetch(`${BASE}/products?filter[id]=${batch.join(',')}&page[size]=50`, {
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
      });
      const data = await res.json();
      if (data.data) data.data.forEach(p => { productNames[p.id] = p.name; });
    } catch (e) { console.error(`  name fetch error at ${i}: ${e.message}`); }
    if (i % 500 === 0 && i > 0) console.log(`  ${i}/${productIds.length} names fetched`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`Got ${Object.keys(productNames).length} product names`);

  // Insert groups + members
  let groupsInserted = 0, membersInserted = 0;
  const axisStats = {};
  for (const g of groups) {
    const displayName = productNames[g.wps_product_id] || g.sample_name;
    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES ($1, $2, 'WPS')
      ON CONFLICT (wps_product_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
      RETURNING id
    `, [g.wps_product_id, displayName]);
    groupsInserted++;

    // Fetch member names and extract variant attributes
    const memberRows = await q(`SELECT id, name FROM catalog_unified WHERE id = ANY($1::int[])`, [g.unified_ids]);
    const nameMap = Object.fromEntries(memberRows.map(r => [r.id, r.name]));
    const memberAttrs = g.unified_ids.map(id => extractAttribute(nameMap[id]));
    const axis = detectGroupAxis(memberAttrs);
    if (axis) axisStats[axis] = (axisStats[axis] || 0) + 1;

    for (let idx = 0; idx < g.unified_ids.length; idx++) {
      const unifiedId = g.unified_ids[idx];
      // Try to get fitment label
      const fitRows = await q(`
        SELECT hf.name as family, MIN(hmy.year) as min_year, MAX(hmy.year) as max_year
        FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm ON hm.id = hmy.model_id
        JOIN harley_families hf ON hf.id = hm.family_id
        WHERE cfv.product_id = $1
        GROUP BY hf.name ORDER BY hf.name LIMIT 3
      `, [unifiedId]);

      const fitLabel = fitRows.length > 0
        ? fitRows.map(r => `${r.family} ${r.min_year}–${r.max_year}`).join(', ')
        : null;

      const attr = memberAttrs[idx];
      const useAttr = attr && (!axis || attr.name === axis);

      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_id, product_id) DO UPDATE SET
          option_1_name = EXCLUDED.option_1_name, option_1_value = EXCLUDED.option_1_value,
          option_2_name = EXCLUDED.option_2_name, option_2_value = EXCLUDED.option_2_value
      `, [grp.id, unifiedId, fitLabel ? 'Fits' : null, fitLabel,
          useAttr ? attr.name : null, useAttr ? attr.value : null, idx]);
      membersInserted++;
    }
    if (groupsInserted % 100 === 0) console.log(`  ${groupsInserted}/${groups.length} groups, ${membersInserted} members`);
  }

  // Back-reference on catalog_unified
  await pool.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS variant_group_id INTEGER REFERENCES catalog_variant_groups(id)`);
  await pool.query(`UPDATE catalog_unified cu SET variant_group_id = cvm.group_id FROM catalog_variant_members cvm WHERE cvm.product_id = cu.id`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cu_variant_group ON catalog_unified(variant_group_id) WHERE variant_group_id IS NOT NULL`);

  // ── NAME-BASED GROUPING — PU + VTWIN ─────────────────────────────────────────
  // WPS groups via wps_product_id (above). PU and VTWIN have no product ID,
  // so we group by stripping the variant attribute from the name and matching
  // on (base_name, brand, source_vendor, category).
  //
  // Strategy:
  //   1. For each PU/VTWIN product, extract the variant attribute from the name.
  //   2. Strip that attribute to get a "base name".
  //   3. Group products sharing the same (base_name, brand, source_vendor, category).
  //   4. Only create groups where 2+ members exist AND all share the same axis.

  console.log('\n── Name-based grouping for PU + VTWIN ──');

  const nonWpsProducts = await q(`
    SELECT cu.id, cu.name, cu.brand, cu.source_vendor, cu.category, cu.slug
    FROM catalog_unified cu
    WHERE cu.source_vendor IN ('PU', 'VTWIN')
      AND cu.is_active = true
      AND cu.variant_group_id IS NULL
    ORDER BY cu.brand, cu.name
  `);

  console.log(`  ${nonWpsProducts.length} ungrouped PU/VTWIN products to scan`);

  // Build base-name groups
  const nameGroups = new Map(); // key → [product, ...]

  for (const row of nonWpsProducts) {
    const attr = extractAttribute(row.name);
    if (!attr) continue; // no variant attribute found — skip

    // Strip the attribute value from the name to get base name.
    // Handle patterns like:
    //   "Name - Color - Model/Suffix"  → "Name"
    //   "Name Color"                   → "Name"
    //   "Name - Color"                 → "Name"
    let baseName = row.name;

    // Split on " - " and remove segments that match the attribute value
    const segments = baseName.split(/\s*-\s*/);
    const attrValLower = attr.value.toLowerCase();
    const filtered = segments.filter(s => s.trim().toLowerCase() !== attrValLower);
    if (filtered.length < segments.length) {
      // Successfully removed a segment
      baseName = filtered.join(' - ').trim();
    } else {
      // Attribute value wasn't its own segment — try stripping suffix
      baseName = baseName.replace(new RegExp(`\\s+${escapeRegex(attr.value)}\\s*$`, 'i'), '').trim();
    }
    // Strip trailing dashes/spaces
    baseName = baseName.replace(/\s*-\s*$/, '').trim();

    if (!baseName || baseName.length < 4) continue;
    if (baseName === row.name) continue; // nothing was stripped

    const key = `${row.source_vendor}|${row.brand}|${row.category}|${baseName.toLowerCase()}`;
    if (!nameGroups.has(key)) nameGroups.set(key, { baseName, brand: row.brand, source_vendor: row.source_vendor, category: row.category, members: [] });
    nameGroups.get(key).members.push({ ...row, attr });
  }

  // Filter to groups with 2+ members sharing the same axis
  let nameGroupsInserted = 0, nameMembersInserted = 0;

  for (const [key, group] of nameGroups) {
    if (group.members.length < 2) continue;

    const axes = group.members.map(m => m.attr.name);
    const dominantAxis = axes[0];
    if (!axes.every(a => a === dominantAxis)) continue; // mixed axes — skip

    // Check if ALL members are already grouped — if so skip entirely.
    // If only SOME are grouped (e.g. duplicate SKUs), still create the group
    // for the ungrouped ones.
    const ids = group.members.map(m => m.id);
    const alreadyGrouped = await q(
      `SELECT id FROM catalog_unified WHERE id = ANY($1::int[]) AND variant_group_id IS NOT NULL`,
      [ids]
    );
    if (alreadyGrouped.length === ids.length) continue; // all already grouped

    // Deduplicate members by product_id — keeps first occurrence (lowest idx)
    const seenIds = new Set();
    const uniqueMembers = group.members.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    if (uniqueMembers.length < 2) continue;

    // Insert group
    const displayName = group.baseName;
    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES (NULL, $1, $2)
      RETURNING id
    `, [displayName, group.source_vendor]);
    nameGroupsInserted++;

    for (let idx = 0; idx < uniqueMembers.length; idx++) {
      const m = uniqueMembers[idx];
      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (group_id, product_id) DO NOTHING
      `, [grp.id, m.id, m.attr.name, m.attr.value, idx]);
      nameMembersInserted++;
    }
  }

  // Back-fill variant_group_id for new members
  await pool.query(`
    UPDATE catalog_unified cu
    SET variant_group_id = cvm.group_id
    FROM catalog_variant_members cvm
    WHERE cvm.product_id = cu.id
      AND cu.variant_group_id IS NULL
  `);

  console.log(`  Name-based groups inserted: ${nameGroupsInserted}`);
  console.log(`  Name-based members inserted: ${nameMembersInserted}`);

  console.log(`\n═══ COMPLETE ═══`);
  console.log(`  Axis breakdown:`, axisStats);
  console.log(`  Groups: ${groupsInserted}  Members: ${membersInserted}`);
  const [stats] = await q(`SELECT (SELECT COUNT(*) FROM catalog_variant_groups) as groups, (SELECT COUNT(*) FROM catalog_variant_members) as members, (SELECT COUNT(*) FROM catalog_unified WHERE variant_group_id IS NOT NULL) as cu_tagged`);
  console.log(`  ${JSON.stringify(stats)}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
