#!/usr/bin/env node
// apply_oversize_variants.cjs
//
// Groups engine oversize/undersize variants into cross-oversize variant groups.
//
// The main build_variant_groups.cjs script strips "Oversize" as an attribute
// but leaves the decimal measurement (.010, .020…) in the base name, producing
// one tiny group per oversize rather than one group spanning all oversizes.
//
// This script:
//  1. Dissolves existing per-oversize groups (where all members share the
//     same decimal measurement — they were grouped per-oversize, not across).
//  2. Groups all oversize variants of the same base product together.
//  3. Assigns option_1_name='Oversize', option_1_value='.010'/'.020'/etc.
//
// Run:  node apply_oversize_variants.cjs [--dry]

const { Pool } = require('pg');
const DRY = process.argv.includes('--dry');
const MAX_MEMBERS = 30; // oversize families can be large

const pool = new Pool({
  host: '5.161.100.126', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

// Extract ".010 Oversize" style measurement from a product name.
// Returns { value: '.010', fullMatch: '.010 Oversize' } or null.
function extractOversize(name) {
  const m = name.match(/(\.\d{2,3})\s*(?:oversize|o\.?s\.?)\b/i);
  if (m) return { value: m[1], fullMatch: m[0].trim() };
  // Also handle: "+ 0.010" style with oversize keyword
  const m2 = name.match(/([+-]\s*0\.\d{2,3})\s*(?:oversize|o\.?s\.?)\b/i);
  if (m2) return { value: m2[1].replace(/\s/g, ''), fullMatch: m2[0].trim() };
  // Standard/STD with no measurement
  const m3 = name.match(/\b(standard)\s*$/i);
  if (m3) return { value: 'Standard', fullMatch: 'Standard' };
  return null;
}

// Strip the oversize suffix from a product name to get the base name.
function getBaseName(name, fullMatch) {
  // Try stripping as a " - segment" first
  const segments = name.split(/\s*-\s*/);
  const filtered = segments.filter(s => s.trim().toLowerCase() !== fullMatch.toLowerCase());
  if (filtered.length < segments.length) return filtered.join(' - ').trim();
  // Fallback: strip as suffix
  return name.replace(new RegExp(`\\s*${fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim();
}

async function main() {
  console.log(`\n═══ Oversize Variant Grouping ${DRY ? '[DRY RUN]' : '[LIVE]'} ═══\n`);

  // ── Step 1: Find and dissolve existing per-oversize groups ──────────────────
  // A "per-oversize" group has all members sharing the same oversize value in
  // their names (e.g., group_id 13242 contains only ".010 Oversize" products).
  console.log('Step 1: Finding per-oversize groups to dissolve…');

  const existingGroups = await q(`
    SELECT
      cvg.id AS group_id,
      cvg.display_name,
      COUNT(DISTINCT cvm.id) AS member_count,
      COUNT(DISTINCT cu.name) AS distinct_names
    FROM catalog_variant_groups cvg
    JOIN catalog_variant_members cvm ON cvm.group_id = cvg.id
    JOIN catalog_unified cu ON cu.id = cvm.product_id
    WHERE cu.name ~* '\\.\\d{2,3}\\s*(oversize|o\\.?s\\.?)'
       OR cu.name ~* '\\bstandard\\b'
    GROUP BY cvg.id, cvg.display_name
    HAVING COUNT(DISTINCT cu.name) = 1   -- all members same name → per-name group
       AND COUNT(DISTINCT cvm.id) > 0
    ORDER BY cvg.id
  `);

  console.log(`  Found ${existingGroups.length} per-oversize groups to dissolve`);

  if (existingGroups.length > 0 && !DRY) {
    const groupIds = existingGroups.map(g => g.group_id);
    // Unset variant_group_id on members
    await q(`UPDATE catalog_unified SET variant_group_id = NULL WHERE variant_group_id = ANY($1::int[])`, [groupIds]);
    // Delete member rows
    await q(`DELETE FROM catalog_variant_members WHERE group_id = ANY($1::int[])`, [groupIds]);
    // Delete groups
    await q(`DELETE FROM catalog_variant_groups WHERE id = ANY($1::int[])`, [groupIds]);
    console.log(`  Dissolved ${groupIds.length} groups`);
  }

  // ── Step 2: Scan all ungrouped products for oversize patterns ───────────────
  console.log('\nStep 2: Scanning ungrouped products for oversize variants…');

  const products = await q(`
    SELECT cu.id, cu.name, cu.brand, cu.source_vendor, cu.display_category, cu.category
    FROM catalog_unified cu
    WHERE cu.is_active = true
      AND cu.variant_group_id IS NULL
      AND (
        cu.name ~* '\\.\\d{2,3}\\s*(oversize|o\\.?s\\.?)'
        OR cu.name ~* '\\bstandard\\b'
      )
    ORDER BY cu.brand, cu.name
  `);

  console.log(`  ${products.length} ungrouped oversize products found`);

  // Build base-name groups
  const groups = new Map(); // key → { baseName, brand, source_vendor, display_category, members[] }

  for (const row of products) {
    const os = extractOversize(row.name);
    if (!os) continue;

    const baseName = getBaseName(row.name, os.fullMatch);
    if (!baseName || baseName.length < 4 || baseName === row.name) continue;

    const key = `${row.source_vendor}|${row.brand ?? ''}|${row.display_category ?? row.category ?? ''}|${baseName.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { baseName, brand: row.brand, source_vendor: row.source_vendor,
                        display_category: row.display_category ?? row.category, members: [] });
    }
    groups.get(key).members.push({ ...row, osValue: os.value });
  }

  // ── Step 3: Create groups ───────────────────────────────────────────────────
  console.log('\nStep 3: Creating cross-oversize variant groups…');

  let groupsCreated = 0, membersInserted = 0, skipped = 0;

  for (const [key, group] of groups) {
    if (group.members.length < 2) { skipped++; continue; }
    if (group.members.length > MAX_MEMBERS) {
      console.log(`  SKIP (too large: ${group.members.length}): ${group.baseName}`);
      skipped++; continue;
    }

    // Must have more than one distinct oversize value to be worth grouping
    const distinctOversizes = new Set(group.members.map(m => m.osValue.toLowerCase()));
    if (distinctOversizes.size < 2) { skipped++; continue; }

    if (DRY) {
      console.log(`  [DRY] Would create: "${group.baseName}" (${group.source_vendor}) — ${group.members.length} members, ${distinctOversizes.size} oversizes: ${[...distinctOversizes].join(', ')}`);
      groupsCreated++;
      continue;
    }

    // Insert variant group
    const [cvg] = await q(`
      INSERT INTO catalog_variant_groups (display_name, source_vendor, family_key, created_at, updated_at)
      VALUES ($1, $2, NULL, NOW(), NOW())
      RETURNING id
    `, [group.baseName, group.source_vendor]);
    const groupId = cvg.id;

    // Insert members with option values
    for (let i = 0; i < group.members.length; i++) {
      const m = group.members[i];
      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, sort_order)
        VALUES ($1, $2, 'Oversize', $3, $4)
        ON CONFLICT (group_id, product_id) DO NOTHING
      `, [groupId, m.id, m.osValue, i]);
      membersInserted++;
    }

    // Update catalog_unified
    const ids = group.members.map(m => m.id);
    await q(`UPDATE catalog_unified SET variant_group_id = $1 WHERE id = ANY($2::int[])`, [groupId, ids]);

    groupsCreated++;

    if (groupsCreated % 50 === 0) {
      console.log(`  … ${groupsCreated} groups created so far`);
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  Groups created:   ${groupsCreated}`);
  console.log(`  Members inserted: ${membersInserted}`);
  console.log(`  Skipped:          ${skipped}`);

  if (!DRY) {
    console.log('\nDone. Re-index Typesense to reflect changes.');
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
