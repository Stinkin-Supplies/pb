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

const path = require('path');
// This script had NO dotenv call at all — same failure class already found
// and fixed in fix_product_vendors_drift.mjs (session 72) and flagged as
// still-fragile in sync_fitment_flat_columns.mjs. Resolve .env.local / .env
// relative to this file's own location, not process.cwd(), so it works
// whether invoked from the repo root or from inside scripts/ingest/.
try { require('dotenv').config({ path: path.join(__dirname, '../../.env.local') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '../../.env') }); } catch {}

const { Pool } = require('pg');

const DRY              = process.argv.includes('--dry');
const MAX_VARIANT_MEMBERS = 20;
// .env.local actually defines WPS_API_KEY, not WPS_TOKEN — this was silently
// sending "Authorization: Bearer undefined" on every WPS product-name lookup
// below, caught by the surrounding try/catch and logged as a batch error
// instead of failing loudly. Falling back to WPS_TOKEN too in case a deploy
// env sets it under the old name.
const WPS_TOKEN = process.env.WPS_API_KEY || process.env.WPS_TOKEN;
const WPS_BASE         = 'http://api.wps-inc.com';

// Was hardcoded to host: '2a01:4ff:f0:fa6f::1' (the IPv6 address MasterRef.md
// explicitly warns against — "NEVER use IPv6 ... Vercel cannot resolve it";
// same problem can bite a plain laptop network too) plus a password read from
// CATALOG_DB_PASSWORD, a variable that doesn't exist anywhere in .env.local —
// only the full CATALOG_DATABASE_URL does. That combination is exactly what
// produced "SASL: ... client password must be a string": password was
// undefined. Switched to the same connectionString pattern every other
// script/route in this repo uses (see lib/db/catalog.ts).
if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env.local at the repo root.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

/**
 * Upsert every axis for one variant member into catalog_variant_member_options.
 * `axes` is the array shape produced by classifyGroup's memberAxes:
 *   [{ name, value, order }, ...]
 * Source of truth for axis count/labels going forward — the option_1 and
 * option_2 columns on catalog_variant_members are written alongside this
 * purely as a legacy mirror for anything not yet migrated to read the
 * junction table.
 */
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

/**
 * Strip a detected attribute value out of a product name to get the
 * "base name" shared by variant siblings (e.g. both "Cam Shims - +0.005" -
 * Gear #2..." and "Cam Shims - +0.010" - Gear #2..." should reduce to the
 * same base name so they're recognized as a Size-variant pair).
 *
 * A plain segment-equality check (splitting on " - " and requiring an exact
 * match against the attribute value) is too fragile: it breaks whenever the
 * value is followed by trailing punctuation the extractor didn't capture
 * (e.g. the name has +0.005" but attr.value is +0.005 with no inch mark),
 * or when the vendor's naming convention doesn't use " - " as a separator
 * at all (WPS names like "2-SLOT LEVER SET BLACK BIG TWIN 07-17" put the
 * color word mid-string with unspaced hyphens elsewhere in the name).
 * A word-boundary removal handles both conventions uniformly.
 */
function stripAttributeFromName(name, attrValue) {
  if (!attrValue) return stripPackIndicators(name).trim();
  // \b fails to match right before a symbol like "+" (e.g. "+0.005") because
  // a word boundary requires one side to be a word character — a preceding
  // space and a leading "+" are both non-word, so there's no transition for
  // \b to anchor on. Lookaround on "not alphanumeric" works for both
  // word-starting values ("Black") and symbol-starting ones ("+0.005").
  return stripPackIndicators(
    name.replace(new RegExp(`(?<![a-zA-Z0-9])${escapeRegex(attrValue)}"?(?![a-zA-Z0-9])`, 'i'), ' ')
  ).replace(/\s+/g, ' ').replace(/\s*-\s*-\s*/g, ' - ').replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').trim();
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
  // "complete set"/"service kit"/"rebuild kit" are specific enough phrases to
  // treat as an unconditional bundle signal — low volume, low ambiguity.
  if (/\b(?:complete\s+set|service\s+kit|rebuild\s+kit)\b/i.test(name)) return true;
  // Bare "kit"/"assembly" is NOT a reliable bundle signal on its own —
  // catalog-wide audit found 14,784 names (e.g. "Taillight Kit - Chrome",
  // "Complete Plug-and-Play Cable Kit...", "Shifter Lever Assembly Chrome")
  // were single, cohesive products using "kit"/"assembly" as their plain
  // product-type word, not indicating a bundle of different part types — and
  // all of them were being wrongly blocked from variant grouping entirely.
  // Only treat kit/assembly as a real multi-part bundle when a joining
  // word/symbol suggests two distinct components ("Nut and Seal Kit", "Lid
  // Kit W/ PH694", "Riser & Top Clamp Kit"). Joiners require real
  // surrounding whitespace so hyphenated compound descriptors
  // ("Plug-and-Play") and brand names ("E&G Carbs") don't false-positive.
  if (/\b(?:kit|assembly|assm?y)\b/i.test(name)) {
    return /\s(?:and|with)\s| & |\bw\/\s/i.test(name);
  }
  return false;
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
  // "standard" (full word) added from evidence: catalog-wide vocab audit found
  // 90 distinct product-line clusters differentiated only by "Standard" vs
  // another size word — only the abbreviation "STD" was previously recognized.
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b|\bstandard\b)/i,
    extract: m => m[1].toUpperCase() },
  // BRAKE COMPOUND
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: m => toTitleCase(m[1]) },
  // SIDE — added from evidence: catalog-wide vocab audit found 85 distinct
  // clusters each for "Left"/"Right" (mirrors, mufflers, brake caliper
  // brackets sold per-side) with no recognized axis at all.
  { name: 'Side',
    pattern: /\b(left|right)\b/i,
    extract: m => toTitleCase(m[1]) },
  // APPAREL SIZE — before Color so "BLACK 2X" → Apparel Size
  // "MD" added alongside "MED" — WPS names abbreviate Medium both ways
  // (e.g. "...MATTE BLACK MD"); without it those rows fell through to the
  // Finish/Color rule below and got misclassified with Color as their
  // primary axis instead of Size, which is what let genuinely different
  // Medium-sized colorways collide under a repeated "Matte Black"/"Gloss
  // Black" label with no size marker at all.
  // "Large"/"Medium" full words added from evidence: vocab audit found 41 and
  // 38 distinct clusters respectively (mostly apparel) using the spelled-out
  // word instead of an abbreviation.
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LARGE|LGE?|LRG|MEDIUM|MED|MD|SM|XS|\dX(?:-?L)?)\b/i,
    extract: m => m[1].toUpperCase()
      .replace('LARGE','LG').replace('LGE','LG').replace('LRG','LG')
      .replace('MEDIUM','M').replace('MED','M').replace('MD','M').replace('SM','S') },
  // GAUGE — before Color
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: m => m[1] + ' Gauge' },
  // RISE — handlebar height, before Color
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: m => m[1] + '" Rise' },
  // FINISH — multi-word phrases before plain Color. "polished" (standalone,
  // not just "polished chrome") added from evidence: 69 distinct clusters
  // used the bare word — listed last in the alternation so "polished chrome"
  // still wins when both words are present.
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
  // THROTTLE
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: m => toTitleCase(m[1]) },
  // COLOR — last so Finish rules above win on e.g. "Matte Black"
  // Added `pink`/`burgundy` — confirmed missing from a real Saddlemen product
  // line (Fender Seat Washer), where their total absence from this list meant
  // extractAttribute() found no match at all and those SKUs were skipped from
  // grouping entirely, not merely mis-grouped.
  // Optional (bright|dark) modifier prefix is captured as PART of the value —
  // confirmed needed by the same product line's "Bright Green"/"Dark Green"
  // members. Without it, only the bare "Green" got extracted, the base-name
  // stripper below removed just that word and left "...- Bright"/"...- Dark"
  // dangling, and each formed its own useless one-member bucket instead of
  // joining the other 10 colors' shared "Fender Seat Washer" group.
  // Scoped to just the two modifiers seen in real data — resist the urge to
  // add more (neon/pastel/metallic/etc.) without the same kind of evidence;
  // see the Bar Harness/UV2000 Cycle Cover incident for why speculative
  // vocabulary growth here is a false-positive risk across the whole catalog.
  { name: 'Color',
    // "smoke"/"tinted"/"tint" added from evidence: 699 ungrouped Klock Werks
    // windshield products ("Dark Smoke", "Light Smoke", "Tinted") had no
    // recognized color word at all and couldn't become variant candidates.
    // "light" added to the prefix group alongside bright/dark for the same reason.
    // "blk"/"chr" added from evidence: vocab audit found 82/71 distinct
    // clusters using these vendor abbreviations instead of the full word —
    // listed after the full words so e.g. "CHROME" still matches "chrome"
    // (longer/more specific) rather than accidentally short-matching "chr".
    pattern: /\b(?:(bright|dark|light)\s+)?(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|pink|burgundy|gr[ae]y|clear|natural|stainless|smoke|tinted|tint|blk|chr|\bSS\b)\b/i,
    extract: m => {
      const raw = m[2].toUpperCase();
      const color = raw === 'SS' ? 'Stainless' : raw === 'BLK' ? 'Black' : raw === 'CHR' ? 'Chrome' : toTitleCase(m[2]);
      return m[1] ? `${toTitleCase(m[1])} ${color}` : color;
    } },
];

/**
 * Find EVERY distinct attribute type present in a name — not just the first
 * or second match. A rotor named "10 Inch Drilled Stainless" can carry a
 * Size word, a Style-ish word, AND a Finish word simultaneously; this is the
 * source-of-truth extractor for the catalog_variant_member_options junction
 * table, which has no ceiling on axis count.
 *
 * Each rule contributes at most one axis (first match per rule pattern).
 * Finish and Color collapse to the same axis name (normalizeAxisName), so a
 * name can't accidentally produce both.
 */
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

/**
 * Given per-member attribute lists (from extractAllAttributes), keep only
 * the axes that actually distinguish members from each other — same guard
 * as the primary-axis check in classifyGroup. An axis where every member
 * shows the identical value isn't a real choice for the customer.
 * Returns axes in the order they should display (primaryAxisName first, if
 * present, then everything else in first-seen order).
 */
function filterDistinguishingAxes(memberAttrLists, primaryAxisName) {
  const byAxis = new Map(); // axisName -> Set of values seen
  for (const attrs of memberAttrLists) {
    for (const a of attrs) {
      if (!byAxis.has(a.name)) byAxis.set(a.name, new Set());
      byAxis.get(a.name).add(a.value);
    }
  }
  const keptAxisNames = [...byAxis.entries()]
    .filter(([, values]) => values.size >= 2)
    .map(([name]) => name);

  // Order: primary axis first (if it made the cut), then first-seen order
  // for everything else.
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
    if (m) return { name: rule.name, value: rule.extract(m) };
  }
  return null;
}

/**
 * Find a second, distinct attribute type in the same name — retained for
 * mirroring option_1/option_2 legacy columns only. The junction table
 * (extractAllAttributes + filterDistinguishingAxes) is the source of truth
 * for axis count going forward.
 */
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
    const baseNames = members.map((m, i) => stripAttributeFromName(m.name, attrs[i]?.value));

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
      const normalizedAxis = normalizeAxisName(axis);

      // Legacy mirror: option_2 (retained for catalog_variant_members columns).
      const attrs2 = members.map(m => extractSecondAttribute(m.name, normalizedAxis));
      const distinctValues2 = new Set(attrs2.filter(Boolean).map(a => a.value));
      const memberAttrs2 = distinctValues2.size >= 2 ? attrs2 : members.map(() => null);

      // Source of truth: every axis this member's name carries, filtered to
      // only the ones that actually distinguish members from each other.
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

  return {
    axis: 'Pack Size', members, memberAttrs: packAttrs, memberAttrs2: members.map(() => null),
    memberAxes: packAttrs.map(a => a ? [{ name: 'Pack Size', value: a.value, order: 0 }] : []),
  };
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_variant_member_options (
      id          SERIAL PRIMARY KEY,
      member_id   INTEGER NOT NULL REFERENCES catalog_variant_members(id) ON DELETE CASCADE,
      axis_name   TEXT NOT NULL,
      axis_value  TEXT NOT NULL,
      axis_order  INTEGER NOT NULL DEFAULT 0,
      UNIQUE (member_id, axis_name)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_member_options_member ON catalog_variant_member_options(member_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_variant_member_options_axis   ON catalog_variant_member_options(axis_name)`);
  await pool.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS variant_group_id INTEGER REFERENCES catalog_variant_groups(id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cu_variant_group ON catalog_unified(variant_group_id) WHERE variant_group_id IS NOT NULL`);
  await pool.query(`ALTER TABLE catalog_variant_groups ADD COLUMN IF NOT EXISTS family_key TEXT`);
  console.log('Tables ready.\n');

  if (!DRY) {
    // ── Nuke existing data ─────────────────────────────────────────────────
    // Full rebuild every time — avoids stale/bad groups accumulating.
    // ⚠ EXCLUDES source_vendor IN ('ADMIN', 'MULTI'):
    //   - 'ADMIN' rows are hand-curated fixes for groups this script's name-based
    //     heuristics can't classify correctly (see e.g. "Bar Harness II" /
    //     "UV2000 Cycle Cover" — width/size vocab outside the regex). A previous
    //     run of this exact DELETE with no vendor filter silently wiped 6 such
    //     groups; they had to be hand-recovered from a pg_dump backup.
    //   - 'MULTI' rows are cross-vendor pack-size groups built by the separate
    //     build_pack_size_groups.mjs script. A session-75 live run silently
    //     wiped all 148 of these (only ADMIN was excluded at the time) — only
    //     49 were reproducible by re-running that script afterward. Never
    //     remove either exclusion without a deliberate reason.
    console.log('Clearing existing variant data (preserving ADMIN-curated + MULTI pack-size groups)...');
    await pool.query(`
      UPDATE catalog_unified cu
      SET variant_group_id = NULL
      WHERE variant_group_id IS NOT NULL
        AND variant_group_id NOT IN (SELECT id FROM catalog_variant_groups WHERE source_vendor IN ('ADMIN', 'MULTI'))
    `);
    await pool.query(`
      DELETE FROM catalog_variant_members
      WHERE group_id NOT IN (SELECT id FROM catalog_variant_groups WHERE source_vendor IN ('ADMIN', 'MULTI'))
    `);
    await pool.query(`DELETE FROM catalog_variant_groups WHERE source_vendor NOT IN ('ADMIN', 'MULTI')`);
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
      -- Skip products already claimed by a hand-curated ADMIN group (e.g. a
      -- cross-vendor merge like "Regulator 74523-84A", which mixes a WPS SKU
      -- with PU/VTWIN SKUs). Without this, Phase 1 would happily fold that
      -- WPS member into a brand-new automated group and overwrite its
      -- variant_group_id, silently detaching it from the ADMIN group.
      AND cu.variant_group_id IS NULL
    WHERE w.wps_product_id IS NOT NULL
    GROUP BY w.wps_product_id
    HAVING COUNT(DISTINCT cu.id) >= 2
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

    // A wps_product_id is WPS's umbrella grouping and sometimes bundles an
    // entire product LINE (e.g. every lever-set style across every fitment)
    // rather than one variant-able product. Sub-partition by attribute-stripped
    // base name first — same technique Phase 2 uses for PU/VTWIN — so a family
    // of e.g. "3-Hole Lever Set ... FLH/FLT 08-13" (Black/Chrome) and "5-Hole
    // Lever Set ... Big Twin 96-06" (Black/Chrome) are evaluated as two
    // separate candidate pairs instead of one 58-member blob that fails
    // classifyGroup's size/similarity checks and silently produces nothing.
    const baseNameGroups = new Map();
    for (const row of memberRows) {
      const attr = extractAttribute(row.name);
      if (!attr) { // no detected axis at all — keep as its own singleton bucket
        baseNameGroups.set(`__nogroup_${row.id}`, [row]);
        continue;
      }
      // WPS names put the color/finish word wherever it falls in the string
      // (often mid-name, e.g. "2-SLOT LEVER SET BLACK BIG TWIN 07-17") rather
      // than as a trailing " - Value" suffix like PU/VTWIN — stripAttributeFromName's
      // word-boundary approach handles both conventions uniformly.
      const baseName = stripAttributeFromName(row.name, attr.value).toLowerCase();
      if (!baseNameGroups.has(baseName)) baseNameGroups.set(baseName, []);
      baseNameGroups.get(baseName).push(row);
    }
    const subPartitions = [...baseNameGroups.values()].filter(members => members.length >= 2);
    // A single sub-partition covering the whole family is the common case
    // (small families work exactly as before); 2+ means this family got split.
    const isSplit = subPartitions.length !== 1 || subPartitions[0].length !== memberRows.length;

    for (const partitionMembers of subPartitions) {
      const result = classifyGroup(partitionMembers);

      if (!result) {
        // Log skip reason for debugging
        const hasKit  = partitionMembers.some(m => m.is_kit || nameImpliesKit(m.name));
        const mixedQty = new Set(partitionMembers.filter(m => !m.is_kit).map(m => m.pack_qty ?? 1)).size > 1;
        const reason  = hasKit ? 'has_kit' : mixedQty ? 'mixed_pack_qty' : 'no_valid_axis';
        bump(skipReasons, reason);
        if (DRY && reason === 'has_kit') {
          console.log(`  SKIP [${reason}] wps_product_id=${g.wps_product_id} "${g.sample_name}"`);
          partitionMembers.filter(m => m.is_kit || nameImpliesKit(m.name))
            .forEach(m => console.log(`    kit: "${m.name}"`));
        }
        continue;
      }

      bump(axisStats, result.axis);

      if (DRY) {
        console.log(`  GROUP [${result.axis}] wps_product_id=${g.wps_product_id}${isSplit ? ' (split family)' : ''} — ${result.members.length} members`);
        result.members.forEach((m, i) => {
          const attr  = result.memberAttrs[i];
          const attr2 = result.memberAttrs2?.[i];
          const dupeWarning = (!attr2 && result.members.some((m2, j) =>
            j !== i && result.memberAttrs[j]?.value === attr?.value
          )) ? '  ⚠ duplicate value, no second axis' : '';
          console.log(`    ${attr?.value ?? '?'}${attr2 ? ` / ${attr2.value}` : ''} — "${m.name}"${dupeWarning}`);
        });
        continue;
      }

      // Only the common (non-split) case reuses wps_product_id as the group's
      // stable identity for the ON CONFLICT upsert path. A split family's
      // sub-groups have no single wps_product_id to key on, so they insert
      // fresh each time — safe because already-grouped members are excluded
      // from the candidate query on future runs (variant_group_id IS NULL).
      const groupWpsId  = isSplit ? null : g.wps_product_id;
      const displayName = isSplit ? result.members[0].name : (productNames[g.wps_product_id] ?? g.sample_name);
      const [grp] = groupWpsId
        ? await q(`
            INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
            VALUES ($1, $2, 'WPS')
            ON CONFLICT (wps_product_id) DO UPDATE
              SET display_name = EXCLUDED.display_name, updated_at = NOW()
            RETURNING id
          `, [groupWpsId, displayName])
        : await q(`
            INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
            VALUES (NULL, $1, 'WPS')
            RETURNING id
          `, [displayName]);
      if (!grp) continue;
      wpsGroups_created++;

      for (let i = 0; i < result.members.length; i++) {
        const m     = result.members[i];
        const attr  = result.memberAttrs[i];
        const attr2 = result.memberAttrs2?.[i];
        const [memberRow] = await q(`
          INSERT INTO catalog_variant_members
            (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (group_id, product_id) DO UPDATE
            SET option_1_name  = EXCLUDED.option_1_name,
                option_1_value = EXCLUDED.option_1_value,
                option_2_name  = EXCLUDED.option_2_name,
                option_2_value = EXCLUDED.option_2_value
          RETURNING id
        `, [grp.id, m.id,
            attr ? normalizeAxisName(attr.name) : null,
            attr?.value ?? null,
            attr2 ? normalizeAxisName(attr2.name) : null,
            attr2?.value ?? null,
            i]);
        if (memberRow) await upsertMemberOptions(memberRow.id, result.memberAxes?.[i]);
        wpsMembers_created++;
      }

      totalGroups++;
      totalMembers += result.members.length;
    }
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
    const baseName = stripAttributeFromName(row.name, attr.value);

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
    // but double-check axis coherence. Normalize first — Finish and Color are
    // the same axis (see normalizeAxisName) and must not be treated as a
    // mismatch just because one member's word matched the Finish pattern and
    // another's matched the Color pattern (e.g. "Chrome" vs "Matte Black").
    const axes = group.members.map(m => normalizeAxisName(m.attr.name));
    const dominantAxis = axes[0];
    if (!axes.every(a => a === dominantAxis)) {
      bump(puSkipReasons, 'mixed_axes');
      if (DRY && process.env.DEBUG_MIXED_AXES) {
        console.log(`  [mixed_axes] "${group.baseName}" (${group.source_vendor}/${group.brand}):`);
        group.members.forEach(m => console.log(`      ${m.attr.name}="${m.attr.value}"  ${m.name}`));
      }
      continue;
    }

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
        const attr  = result.memberAttrs[i];
        const attr2 = result.memberAttrs2?.[i];
        const dupeWarning = (!attr2 && result.members.some((m2, j) =>
          j !== i && result.memberAttrs[j]?.value === attr?.value
        )) ? '  ⚠ duplicate value, no second axis' : '';
        console.log(`    ${attr?.value ?? '?'}${attr2 ? ` / ${attr2.value}` : ''} — "${m.name}"${dupeWarning}`);
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

    // Build id-keyed attribute lookups BEFORE dedup filtering — `unique`'s
    // indices no longer line up with `result.memberAttrs`/`memberAttrs2`
    // once any duplicate is removed, so index into these maps by product id
    // instead of positionally.
    const attrById  = new Map(result.members.map((m, i) => [m.id, result.memberAttrs[i]]));
    const attr2ById = new Map(result.members.map((m, i) => [m.id, result.memberAttrs2?.[i]]));
    const axesById  = new Map(result.members.map((m, i) => [m.id, result.memberAxes?.[i]]));

    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES (NULL, $1, $2)
      RETURNING id
    `, [group.baseName, group.source_vendor]);
    puGroupsCreated++;

    for (let i = 0; i < unique.length; i++) {
      const m     = unique[i];
      const attr  = attrById.get(m.id);
      const attr2 = attr2ById.get(m.id);
      await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE EXISTS (
          SELECT 1 FROM catalog_unified cu2
          JOIN catalog_variant_groups cvg ON cvg.id = $1
          WHERE cu2.id = $2 AND cu2.source_vendor = cvg.source_vendor
        )
        ON CONFLICT (group_id, product_id) DO NOTHING
      `, [grp.id, m.id,
          attr ? normalizeAxisName(attr.name) : null,
          attr?.value ?? null,
          attr2 ? normalizeAxisName(attr2.name) : null,
          attr2?.value ?? null,
          i]);
      // The INSERT above is conditional (WHERE EXISTS) + ON CONFLICT DO NOTHING,
      // so it never reliably RETURNING's an id. Look the member row up instead —
      // if it's missing, either the vendor-mismatch guard rejected it (correct:
      // don't write axes for a member that was never actually linked) or nothing
      // changed on conflict but the row already existed from a prior run (fine:
      // fetch its id and upsert axes normally).
      const [memberRow] = await q(
        `SELECT id FROM catalog_variant_members WHERE group_id = $1 AND product_id = $2`,
        [grp.id, m.id]
      );
      if (memberRow) await upsertMemberOptions(memberRow.id, axesById.get(m.id));
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — brand_part_number suffix cross-reference (e.g. base "602-2001"
  // + "602-2001B"). This connects variant siblings that Phase 1/2's
  // name-bucketing missed because their shared generic name also matches
  // several OTHER, differently-fitted products — e.g. "Backrest Kit - 14" -
  // Chrome - Softail" is the literal name of 6 different Chrome backrests, so
  // name-bucketing alone can't tell which one pairs with which of the 6
  // Black ones; the manufacturer's own part numbering can.
  //
  // This is a CONNECTOR, not an override: every candidate still has to pass
  // classifyGroup()'s full safety bar (pack_qty uniformity, recognized +
  // distinguishing axis, base-name similarity) — SKU adjacency alone is not
  // sufficient. Confirmed false positives in real data if used alone:
  // coincidental suffix matches between unrelated products ("Phillips Head
  // Chrome Screws" / "Chrome Shift Gate Screw"), and material differences
  // that both happen to contain a recognized color word ("Stainless Braided
  // ... Cable Kit" / "Black Vinyl ... Cable Kit" — different material, not a
  // color choice). classifyGroup's base-name-similarity check is what's
  // relied on to reject cases like the first; cases like the second are a
  // known, bounded, pre-existing risk shared with Phase 1/2's own use of the
  // same similarity threshold, not a new risk class introduced here.
  console.log('\n── Phase 3: brand_part_number suffix cross-reference ──');

  const bpnCandidates = await q(`
    SELECT id, name, brand, source_vendor, brand_part_number, is_kit, pack_qty
    FROM catalog_unified
    WHERE is_active = true AND variant_group_id IS NULL
      AND brand_part_number IS NOT NULL AND brand_part_number != ''
      AND (is_kit IS NULL OR is_kit = false)
  `);

  // Cluster by (vendor|brand|base part number) — "base" strips one trailing
  // alphabetic character if present (602-2001B -> 602-2001), so a bare
  // "602-2001" and its "602-2001B"/"602-2001C" siblings land in one bucket.
  const bpnClusters = new Map();
  for (const row of bpnCandidates) {
    if (nameImpliesKit(row.name)) continue;
    const m = row.brand_part_number.match(/^(.+?)([A-Za-z])$/);
    const base = m ? m[1] : row.brand_part_number;
    const key = `${row.source_vendor}|${row.brand}|${base}`;
    if (!bpnClusters.has(key)) bpnClusters.set(key, []);
    bpnClusters.get(key).push(row);
  }

  let bpnGroupsCreated = 0, bpnMembersCreated = 0;
  const bpnSkipReasons = {};

  for (const [, clusterMembers] of bpnClusters) {
    if (clusterMembers.length < 2) continue;

    // Try the whole cluster first. If it fails and there are 3+ members, a
    // single contaminating outlier (e.g. a coincidentally-duplicate part
    // number on an unrelated product) can poison the base-name-similarity
    // check for the whole group even though a valid pair exists inside it
    // (confirmed in real data: "Backrest Kit ... Chrome" + "Backrest Kit ...
    // Black" is a valid pair, but a third product legitimately sharing that
    // exact part number broke the all-or-nothing similarity check). Falling
    // back to every pairwise combination recovers the valid pair without
    // ever loosening classifyGroup's own safety bar — each pair still has to
    // pass the exact same checks on its own.
    let results = [];
    const wholeResult = classifyGroup(clusterMembers);
    if (wholeResult) {
      results = [wholeResult];
    } else if (clusterMembers.length > 2) {
      const seen = new Set();
      for (let i = 0; i < clusterMembers.length; i++) {
        for (let j = i + 1; j < clusterMembers.length; j++) {
          const pairResult = classifyGroup([clusterMembers[i], clusterMembers[j]]);
          if (!pairResult) continue;
          const idKey = pairResult.members.map(m => m.id).sort().join(',');
          if (seen.has(idKey)) continue;
          seen.add(idKey);
          results.push(pairResult);
        }
      }
    }
    if (results.length === 0) { bump(bpnSkipReasons, 'classify_failed'); continue; }

    for (const result of results) {
    if (result.members.length < 2) { bump(bpnSkipReasons, 'too_few_after_filter'); continue; }

    bump(axisStats, result.axis);

    if (DRY) {
      console.log(`  GROUP [${result.axis}] "${result.members[0].name}" (${result.members[0].source_vendor}) — ${result.members.length} members [via brand_part_number]`);
      result.members.forEach((m, i) => {
        const attr = result.memberAttrs[i];
        console.log(`    ${attr?.value ?? '?'} — "${m.name}" (${m.brand_part_number})`);
      });
      continue;
    }

    const [grp] = await q(`
      INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
      VALUES (NULL, $1, $2)
      RETURNING id
    `, [result.members[0].name, result.members[0].source_vendor]);
    if (!grp) continue;
    bpnGroupsCreated++;

    for (let i = 0; i < result.members.length; i++) {
      const m     = result.members[i];
      const attr  = result.memberAttrs[i];
      const attr2 = result.memberAttrs2?.[i];
      const [memberRow] = await q(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_id, product_id) DO NOTHING
        RETURNING id
      `, [grp.id, m.id,
          attr ? normalizeAxisName(attr.name) : null,
          attr?.value ?? null,
          attr2 ? normalizeAxisName(attr2.name) : null,
          attr2?.value ?? null,
          i]);
      if (memberRow) await upsertMemberOptions(memberRow.id, result.memberAxes?.[i]);
      bpnMembersCreated++;
    }

    totalGroups++;
    totalMembers += result.members.length;
    }
  }

  if (!DRY) {
    await pool.query(`
      UPDATE catalog_unified cu
      SET variant_group_id = cvm.group_id
      FROM catalog_variant_members cvm
      WHERE cvm.product_id = cu.id
        AND cu.variant_group_id IS NULL
    `);
  }

  console.log(`\nPhase 3 (brand_part_number) result: ${bpnGroupsCreated} groups, ${bpnMembersCreated} members`);
  console.log('Phase 3 skip reasons:', bpnSkipReasons);

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
        -- Excludes ADMIN-curated groups — this invariant polices the automated
        -- classifier's own kit-exclusion logic (rule #1 at the top of this
        -- file). A human reviewer can deliberately group kit-flagged products
        -- (e.g. small hardware kits differing only by pack size) through the
        -- admin workflow, and that's a legitimate override, not a bug.
        (SELECT COUNT(*) FROM catalog_unified cu
         WHERE cu.is_kit = true AND cu.variant_group_id IS NOT NULL
           AND cu.variant_group_id NOT IN (SELECT id FROM catalog_variant_groups WHERE source_vendor = 'ADMIN')
        ) AS kits_in_groups
    `);
    console.log(`  DB state: ${JSON.stringify(stats)}`);
    if (parseInt(stats.kits_in_groups) > 0) {
      console.error(`\n⚠ WARNING: ${stats.kits_in_groups} kit products in a non-ADMIN group — investigate!`);
    } else {
      console.log('  ✓ No kits in automated (non-ADMIN) variant groups');
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
