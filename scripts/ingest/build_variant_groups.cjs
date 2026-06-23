#!/usr/bin/env node
/**
 * build_variant_groups.cjs — complete rebuild, June 2026
 *
 * Hard invariants:
 *   1. is_kit=true products never enter any variant group
 *   2. Names containing kit-like words ("kit", "assembly", "service kit") are excluded
 *   3. pack_qty must be uniform within a Color/Size/Finish group
 *      (a 5-pk Black and a 1-pk Chrome are TWO problems, not a color variant)
 *   4. Pack Size IS a valid axis — but only when member base names match
 *      after stripping pack indicators (1/PK, 5/PK, SET OF 5, etc.)
 *   5. WPS members must share a meaningful base name after stripping the
 *      variant attribute — catches kits/unrelated SKUs sharing a wps_product_id
 *   6. Groups > MAX_VARIANT_MEMBERS are product lines, not variants → dissolved
 *   7. (Added June 18) A detected axis must produce at least 2 distinct values
 *      across members — otherwise it isn't really distinguishing anything
 *      (e.g. fitment-only SKUs that all happen to share one color word in the
 *      name) and the group is dissolved rather than shown as a fake variant set
 *
 * Usage:
 *   node build_variant_groups.cjs            # live run
 *   node build_variant_groups.cjs --dry      # inspect only, no writes
 *   node build_variant_groups.cjs --nuke     # wipe ALL existing data first (implied by live run)
 */

const { Pool } = require('pg');

const DRY              = process.argv.includes('--dry');
const MAX_VARIANT_MEMBERS = 20;
const WPS_TOKEN = process.env.WPS_TOKEN;
const WPS_BASE         = 'http://api.wps-inc.com';

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: process.env.CATALOG_DB_PASSWORD,
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

// ── String helpers ────────────────────────────────────────────────────────────

function toTitleCase(s) {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip pack-size indicators and OEM refs for base-name comparison.
 * "BIG TWIN CAM COVER GASKET 5/PK OE#25225-93" → "BIG TWIN CAM COVER GASKET"
 */
function stripPackIndicators(name) {
  return (name ?? '')
    .replace(/\s*\d+\s*\/\s*P[CK]\b/gi, '')      // 5/PK, 10/PC
    .replace(/\s*\d+\s*-?\s*PACK\b/gi, '')         // 5-PACK, 10 PACK
    .replace(/\s*\bSET\s+OF\s+\d+\b/gi, '')        // SET OF 5
    .replace(/\s*\d+\s*P(?:CS?|CE?|K)\b/gi, '')    // 5PCS, 5PC, 5PK
    .replace(/\s*\bPAIR\b/gi, '')                   // PAIR → implied 2
    .replace(/\s*\bSINGLE\b/gi, '')                 // SINGLE → implied 1
    .replace(/\s*\bOE\s*#[\w\-]+\b/gi, '')          // OE#25225-93
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract pack quantity from a product name. Returns null if not found. */
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

/**
 * Returns true when a product name strongly implies a kit or assembly.
 * Used as an additional guard beyond the is_kit DB column.
 */
function nameImpliesKit(name) {
  if (!name) return false;
  return /\b(?:kit|assembly|assm?y|complete\s+set|service\s+kit|rebuild\s+kit)\b/i.test(name);
}

/** Jaccard similarity on word sets (0–1). Used for base-name comparison. */
function wordSimilarity(a, b) {
  const sa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const sb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union  = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

// ── Attribute extraction ──────────────────────────────────────────────────────

const ATTRIBUTE_RULES = [
  // OVERSIZE/UNDERSIZE — exact decimal precision prevents matching "+10" cable lengths
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b)/i,
    extract: m => m[1].toUpperCase() },
  // BRAKE COMPOUND
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: m => toTitleCase(m[1]) },
  // APPAREL SIZE — before Color so "BLACK 2X" → Apparel Size
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LGE?|LRG|MED|SM|XS|\dX(?:-?L)?)\b/i,
    extract: m => m[1].toUpperCase()
      .replace('LGE','LG').replace('LRG','LG').replace('MED','M').replace('SM','S') },
  // GAUGE — before Color
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: m => m[1] + ' Gauge' },
  // RISE — handlebar height, before Color
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: m => m[1] + '" Rise' },
  // FINISH — multi-word phrases before plain Color
  { name: 'Finish',
    pattern: /\b(brushed ss|brushed stainless|brushed|raw ss|raw stainless|matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated)\b/i,
    extract: m => {
      const v = m[1].toLowerCase();
      if (v === 'brushed ss')        return 'Brushed SS';
      if (v === 'raw ss')            return 'Raw SS';
      if (v === 'brushed stainless') return 'Brushed Stainless';
      if (v === 'raw stainless')     return 'Raw Stainless';
      if (v === 'brushed')           return 'Brushed';
      return toTitleCase(m[1]);
    } },
  // THROTTLE
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: m => toTitleCase(m[1]) },
  // COLOR — last so Finish rules above win on e.g. "Matte Black"
  { name: 'Color',
    pattern: /\b(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|gr[ae]y|clear|natural|stainless|\bSS\b)\b/i,
    extract: m => m[1].toUpperCase() === 'SS' ? 'Stainless' : toTitleCase(m[1]) },
];

function extractAttribute(name) {
  if (!name) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (m) return { name: rule.name, value: rule.extract(m) };
  }
  return null;
}

// Finish and Color describe the same physical dimension
function normalizeAxisName(name) {
  return name === 'Finish' ? 'Color' : name;
}

function detectGroupAxis(attrs) {
  const types = attrs.filter(Boolean).map(a => normalizeAxisName(a.name));
  if (!types.length) return null;
  const counts = {};
  types.forEach(t => counts[t] = (counts[t] || 0) + 1);
  const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return top[1] / attrs.length >= 0.5 ? top[0] : null;
}

// ── Group classification ──────────────────────────────────────────────────────

/**
 * Classify a candidate set of product rows into a valid variant group, or null.
 *
 * Returns { axis, members, memberAttrs } or null.
 * `members` is the filtered, validated subset (kits removed, etc.)
 */
function classifyGroup(candidates) {
  // Hard exclusion: remove kits (DB flag OR name heuristic)
  const members = candidates.filter(m => !m.is_kit && !nameImpliesKit(m.name));
  if (members.length < 2 || members.length > MAX_VARIANT_MEMBERS) return null;

  // ── Try named attribute axis (Color, Size, Compound, etc.) ────────────────
  const attrs = members.map(m => extractAttribute(m.name));
  const axis  = detectGroupAxis(attrs);

  if (axis) {
    // Pack qty must be uniform — a group of "5-pk Black" and "1-pk Chrome"
    // mixes two variant dimensions. Reject; don't try to salvage.
    const packQtys = new Set(
      members.map(m => m.pack_qty ?? nameExtractPackQty(m.name) ?? 1)
    );
    if (packQtys.size > 1) return null;

    // Base name similarity: strip the variant value and check that remaining
    // text is sufficiently alike across all members.
    // This catches WPS product groups that bundle unrelated SKUs.
    const baseNames = members.map((m, i) => {
      const attr = attrs[i];
      if (!attr) return stripPackIndicators(m.name).toLowerCase();
      let b = m.name;
      // Remove "-Value" and "Value" suffixes
      const segs = b.split(/\s*-\s*/);
      const filtered = segs.filter(s => s.trim().toLowerCase() !== attr.value.toLowerCase());
      if (filtered.length < segs.length) {
        b = filtered.join(' - ').trim();
      } else {
        b = b.replace(new RegExp('\\s+' + escapeRegex(attr.value) + '\\s*$', 'i'), '').trim();
      }
      return stripPackIndicators(b).replace(/\s*-\s*$/, '').toLowerCase().trim();
    });

    const anchor = baseNames[0];
    const similar = baseNames.every(b => b === anchor || wordSimilarity(b, anchor) >= 0.65);
    if (!similar) return null;

    // NEW (June 18): the axis must actually distinguish members from each other.
    // Without this check, N products that differ only by fitment — never encoded
    // in the name at all, only in catalog_fitment_v2 — all extract the SAME
    // attribute value (e.g. 12 different rear-brake-line SKUs that all say
    // "...Black") and get grouped as if Black/Black/Black/... were meaningful
    // variant options. It isn't; there's nothing for the customer to pick between.
    // Don't return a group here — fall through to the Pack Size check below, and
    // if that also fails, the members stay standalone (correct: they aren't
    // meaningfully variants of each other if nothing tells them apart).
    const distinctValues = new Set(attrs.filter(Boolean).map(a => a.value));
    if (distinctValues.size >= 2) {
      return { axis: normalizeAxisName(axis), members, memberAttrs: attrs };
    }
    if (DRY) {
      console.log(`  [non_distinguishing_axis] "${axis}"="${[...distinctValues][0]}" shared by all ${members.length} members — dissolving, trying Pack Size fallback`);
    }
  }

  // ── Try Pack Size axis ────────────────────────────────────────────────────
  // Valid only when:
  //   a. Members have distinct pack quantities
  //   b. Base names (after stripping pack indicators) are very similar
  const packQtys = members.map(m => m.pack_qty ?? nameExtractPackQty(m.name) ?? null);
  const distinctQtys = new Set(packQtys.filter(q => q != null));
  if (distinctQtys.size < 2) return null;

  const baseNames = members.map(m =>
    stripPackIndicators(m.name).toLowerCase().trim()
  );
  const anchor = baseNames[0];
  const similar = baseNames.every(b => b === anchor || wordSimilarity(b, anchor) >= 0.75);
  if (!similar) return null;

  const packAttrs = packQtys.map(qty =>
    qty != null ? { name: 'Pack Size', value: qty === 1 ? '1 Piece' : `${qty}-Pack` } : null
  );

  return { axis: 'Pack Size', members, memberAttrs: packAttrs };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ build_variant_groups ═══  [${DRY ? 'DRY RUN' : 'LIVE'}]\n`);

  // ── Ensure tables exist ────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_variant_groups (
      id             SERIAL PRIMARY KEY,
      wps_product_id INTEGER UNIQUE,
      display_name   TEXT NOT NULL,
      source_vendor  TEXT NOT NULL DEFAULT 'WPS',
      family_key     TEXT,
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
  await pool.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS variant_group_id INTEGER REFERENCES catalog_variant_groups(id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cu_variant_group ON catalog_unified(variant_group_id) WHERE variant_group_id IS NOT NULL`);
  await pool.query(`ALTER TABLE catalog_variant_groups ADD COLUMN IF NOT EXISTS family_key TEXT`);
  console.log('Tables ready.\n');

  if (!DRY) {
    // ── Nuke existing data ─────────────────────────────────────────────────
    // Full rebuild every time — avoids stale/bad groups accumulating.
    console.log('Clearing existing variant data...');
    await pool.query(`UPDATE catalog_unified SET variant_group_id = NULL`);
    await pool.query(`DELETE FROM catalog_variant_members`);
    await pool.query(`DELETE FROM catalog_variant_groups`);
    console.log('Cleared.\n');
  }

  // ── Stats counters ─────────────────────────────────────────────────────────
  let totalGroups = 0, totalMembers = 0;
  const axisStats = {};
  const skipReasons = {};
  const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — WPS: group by wps_product_id
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── Phase 1: WPS grouping by wps_product_id ──');

  const wpsGroups = await q(`
    SELECT
      w.wps_product_id,
      COUNT(DISTINCT cu.id)                              AS item_count,
      ARRAY_AGG(DISTINCT cu.id   ORDER BY cu.id)         AS unified_ids,
      MIN(cu.name)                                       AS sample_name,
      MIN(cu.brand)                                      AS brand
    FROM wps_catalog w
    JOIN catalog_unified cu
      ON  cu.vendor_sku   = w.sku
      AND cu.source_vendor = 'WPS'
      AND cu.is_active     = true
    WHERE w.wps_product_id IS NOT NULL
    GROUP BY w.wps_product_id
    HAVING COUNT(DISTINCT cu.id) BETWEEN 2 AND ${MAX_VARIANT_MEMBERS}
    ORDER BY COUNT(DISTINCT cu.id) DESC
  `);

  console.log(`Found ${wpsGroups.length} candidate WPS groups\n`);

  // Fetch WPS API product display names in batches
  const productNames = {};
  if (!DRY) {
    const productIds = wpsGroups.map(g => g.wps_product_id);
    console.log(`Fetching ${productIds.length} WPS product names...`);
    for (let i = 0; i < productIds.length; i += 50) {
      const batch = productIds.slice(i, i + 50);
      try {
        const res  = await fetch(`${WPS_BASE}/products?filter[id]=${batch.join(',')}&page[size]=50`, {
          headers: { Authorization: `Bearer ${WPS_TOKEN}`, Accept: 'application/json' },
        });
        const data = await res.json();
        if (data.data) data.data.forEach(p => { productNames[p.id] = p.name; });
      } catch (e) {
        console.error(`  name batch error at ${i}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`  Got ${Object.keys(productNames).length} names\n`);
  }

  let wpsGroups_created = 0, wpsMembers_created = 0;

  for (const g of wpsGroups) {
    // Fetch full member rows including is_kit and pack_qty
    const memberRows = await q(`
      SELECT cu.id, cu.name, cu.is_kit, cu.pack_qty
      FROM catalog_unified cu
      WHERE cu.id = ANY($1::int[])
    `, [g.unified_ids]);

    const result = classifyGroup(memberRows);

    if (!result) {
      // Log skip reason for debugging
      const hasKit  = memberRows.some(m => m.is_kit || nameImpliesKit(m.name));
      const mixedQty = new Set(memberRows.filter(m => !m.is_kit).map(m => m.pack_qty ?? 1)).size > 1;
      const reason  = hasKit ? 'has_kit' : mixedQty ? 'mixed_pack_qty' : 'no_valid_axis';
      bump(skipReasons, reason);
      if (DRY && reason === 'has_kit') {
        console.log(`  SKIP [${reason}] wps_product_id=${g.wps_product_id} "${g.sample_name}"`);
        memberRows.filter(m => m.is_kit || nameImpliesKit(m.name))
          .forEach(m => console.log(`    kit: "${m.name}"`));
      }
      continue;
    }

    bump(axisStats, result.axis);

    if (DRY) {
      console.log(`  GROUP [${result.axis}] wps_product_id=${g.wps_product_id} — ${result.members.length} members`);
      result.members.forEach((m, i) => {
        const attr = result.memberAttrs[i];
        console.log(`    ${attr?.value ?? '?'} — "${m.name}"`);
      });
      continue;
    }

    const displayName = productNames[g.wps_product_id] ?? g.sample_name;
    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES ($1, $2, 'WPS')
      ON CONFLICT (wps_product_id) DO UPDATE
        SET display_name = EXCLUDED.display_name, updated_at = NOW()
      RETURNING id
    `, [g.wps_product_id, displayName]);
    if (!grp) continue;
    wpsGroups_created++;

    for (let i = 0; i < result.members.length; i++) {
      const m    = result.members[i];
      const attr = result.memberAttrs[i];
      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (group_id, product_id) DO UPDATE
          SET option_1_name  = EXCLUDED.option_1_name,
              option_1_value = EXCLUDED.option_1_value
      `, [grp.id, m.id,
          attr ? normalizeAxisName(attr.name) : null,
          attr?.value ?? null,
          i]);
      wpsMembers_created++;
    }

    totalGroups++;
    totalMembers += result.members.length;
  }

  if (!DRY) {
    // Back-fill variant_group_id for WPS members
    await pool.query(`
      UPDATE catalog_unified cu
      SET variant_group_id = cvm.group_id
      FROM catalog_variant_members cvm
      JOIN catalog_variant_groups  cvg ON cvg.id = cvm.group_id
      WHERE cvm.product_id    = cu.id
        AND cu.source_vendor  = 'WPS'
        AND cvg.source_vendor = 'WPS'
    `);
  }

  console.log(`\nWPS result: ${wpsGroups_created} groups, ${wpsMembers_created} members`);
  console.log('Skip reasons:', skipReasons);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — PU + VTWIN: name-based grouping
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n── Phase 2: PU + VTWIN name-based grouping ──');

  // Hard exclusion of kits at query level — belt AND suspenders
  const nonWpsProducts = await q(`
    SELECT cu.id, cu.name, cu.brand, cu.source_vendor, cu.category,
           cu.is_kit, cu.pack_qty, cu.slug
    FROM catalog_unified cu
    WHERE cu.source_vendor IN ('PU', 'VTWIN')
      AND cu.is_active = true
      AND (cu.is_kit IS NULL OR cu.is_kit = false)
      AND cu.variant_group_id IS NULL
    ORDER BY cu.brand, cu.name
  `);

  console.log(`  ${nonWpsProducts.length} ungrouped PU/VTWIN products (kits excluded at query level)`);

  // Build candidate groups keyed on (vendor|brand|category|base_name)
  const nameGroups = new Map();

  for (const row of nonWpsProducts) {
    // Secondary kit filter using name heuristic
    if (nameImpliesKit(row.name)) continue;

    const attr = extractAttribute(row.name);
    if (!attr) continue;

    // Strip the variant attribute to get base name
    let baseName = row.name;
    const segs   = baseName.split(/\s*-\s*/);
    const filtered = segs.filter(s => s.trim().toLowerCase() !== attr.value.toLowerCase());
    if (filtered.length < segs.length) {
      baseName = filtered.join(' - ').trim();
    } else {
      baseName = baseName.replace(new RegExp(`\\s+${escapeRegex(attr.value)}\\s*$`, 'i'), '').trim();
    }
    baseName = stripPackIndicators(baseName).replace(/\s*-\s*$/, '').trim();

    if (!baseName || baseName.length < 4 || baseName === row.name) continue;

    const key = `${row.source_vendor}|${row.brand}|${row.category}|${baseName.toLowerCase()}`;
    if (!nameGroups.has(key)) {
      nameGroups.set(key, {
        baseName, brand: row.brand,
        source_vendor: row.source_vendor, category: row.category,
        members: [],
      });
    }
    nameGroups.get(key).members.push({ ...row, attr });
  }

  let puGroupsCreated = 0, puMembersCreated = 0;
  const puSkipReasons = {};

  for (const [, group] of nameGroups) {
    if (group.members.length < 2) continue;

    // All members in a name group share the same attribute name by construction,
    // but double-check axis coherence.
    const axes = group.members.map(m => m.attr.name);
    const dominantAxis = axes[0];
    if (!axes.every(a => a === dominantAxis)) { bump(puSkipReasons, 'mixed_axes'); continue; }

    // Apply classifyGroup for kit exclusion + pack_qty validation
    const result = classifyGroup(group.members.map(m => ({
      id: m.id, name: m.name, is_kit: m.is_kit, pack_qty: m.pack_qty,
    })));
    if (!result) { bump(puSkipReasons, 'classify_failed'); continue; }
    if (result.members.length < 2) { bump(puSkipReasons, 'too_few_after_filter'); continue; }

    bump(axisStats, result.axis);

    if (DRY) {
      console.log(`  GROUP [${result.axis}] "${group.baseName}" (${group.source_vendor}) — ${result.members.length} members`);
      result.members.forEach((m, i) => {
        const attr = result.memberAttrs[i];
        console.log(`    ${attr?.value ?? '?'} — "${m.name}"`);
      });
      continue;
    }

    // Check: skip if all already grouped
    const ids           = result.members.map(m => m.id);
    const alreadyGrpd  = await q(
      `SELECT id FROM catalog_unified WHERE id = ANY($1::int[]) AND variant_group_id IS NOT NULL`,
      [ids]
    );
    if (alreadyGrpd.length === ids.length) continue;

    // Deduplicate
    const seenIds  = new Set();
    const unique   = result.members.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });
    if (unique.length < 2) continue;

    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES (NULL, $1, $2)
      RETURNING id
    `, [group.baseName, group.source_vendor]);
    puGroupsCreated++;

    for (let i = 0; i < unique.length; i++) {
      const m    = unique[i];
      const attr = result.memberAttrs[i];
      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, sort_order)
        SELECT $1, $2, $3, $4, $5
        WHERE EXISTS (
          SELECT 1 FROM catalog_unified cu2
          JOIN catalog_variant_groups cvg ON cvg.id = $1
          WHERE cu2.id = $2 AND cu2.source_vendor = cvg.source_vendor
        )
        ON CONFLICT (group_id, product_id) DO NOTHING
      `, [grp.id, m.id,
          attr ? normalizeAxisName(attr.name) : null,
          attr?.value ?? null,
          i]);
      puMembersCreated++;
    }

    totalGroups++;
    totalMembers += unique.length;
  }

  if (!DRY) {
    // Back-fill variant_group_id for PU + VTWIN members
    await pool.query(`
      UPDATE catalog_unified cu
      SET variant_group_id = cvm.group_id
      FROM catalog_variant_members cvm
      WHERE cvm.product_id = cu.id
        AND cu.variant_group_id IS NULL
    `);
  }

  console.log(`\nPU/VTWIN result: ${puGroupsCreated} groups, ${puMembersCreated} members`);
  console.log('PU/VTWIN skip reasons:', puSkipReasons);

  // ── Final stats ────────────────────────────────────────────────────────────
  console.log('\n═══ COMPLETE ═══');
  console.log(`  Axis breakdown: ${JSON.stringify(axisStats)}`);
  console.log(`  Total groups:   ${totalGroups}`);
  console.log(`  Total members:  ${totalMembers}`);

  if (!DRY) {
    const [stats] = await q(`
      SELECT
        (SELECT COUNT(*) FROM catalog_variant_groups)                       AS groups,
        (SELECT COUNT(*) FROM catalog_variant_members)                      AS members,
        (SELECT COUNT(*) FROM catalog_unified WHERE variant_group_id IS NOT NULL) AS cu_tagged,
        (SELECT COUNT(*) FROM catalog_unified WHERE is_kit = true AND variant_group_id IS NOT NULL) AS kits_in_groups
    `);
    console.log(`  DB state: ${JSON.stringify(stats)}`);
    if (parseInt(stats.kits_in_groups) > 0) {
      console.error(`\n⚠ WARNING: ${stats.kits_in_groups} kit products still have variant_group_id set — investigate!`);
    } else {
      console.log('  ✓ No kits in variant groups');
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
