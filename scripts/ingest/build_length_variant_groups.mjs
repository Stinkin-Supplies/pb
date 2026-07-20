#!/usr/bin/env node
/**
 * build_length_variant_groups.mjs
 *
 * Cable/brake-line products are frequently ingested with the EXACT SAME
 * product name across every length (e.g. brand "Magnum Shielding", name
 * "Clutch Line", 43 rows spanning 20 distinct lengths). build_variant_groups.cjs's
 * classifier extracts a variant axis from the product NAME (Color, Size,
 * Finish, ...) -- with nothing but a bare length number in a separate
 * column (length_in) to go on, it finds no axis and never groups these.
 * The browse-listing dedup fallback then silently shows one arbitrary SKU
 * per name and hides the rest.
 *
 * This script is the length-specific counterpart: it clusters by
 * (vendor, brand, category, exact name) and uses catalog_unified.length_in
 * directly as the variant axis, for the subset of products where the
 * existing name-based extractor finds nothing (kept strictly disjoint from
 * build_variant_groups.cjs's own candidate set -- see extractAttribute()
 * check below).
 *
 * Scope: Cables category, plus Brakes > Brake Lines & Hoses -- the two
 * curated-taxonomy buckets confirmed (by direct query) to contain these
 * name-collision clusters, without sweeping in unrelated products like
 * "Oil & Fuel Lines" or "Fuel Filters" that a raw name LIKE '%line%' would.
 *
 * Writes to the SAME tables build_variant_groups.cjs uses
 * (catalog_variant_groups / catalog_variant_members / catalog_variant_member_options),
 * tagged source_vendor='LENGTH' so that script's own wipe-and-rebuild never
 * touches this script's output (see the LENGTH exclusion added there).
 *
 * Usage:
 *   node build_length_variant_groups.mjs            # dry run (default)
 *   node build_length_variant_groups.mjs --apply     # writes changes
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');
const MAX_VARIANT_MEMBERS = 20; // same ceiling build_variant_groups.cjs uses

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set -- check .env.local at the repo root.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Duplicated from build_variant_groups.cjs (kept in sync manually) ──────────
// Not require()'d from that file: it's a CommonJS script that calls main() at
// load time with no module.exports -- importing it would trigger a full,
// unrelated catalog-wide variant rebuild as a side effect.

function toTitleCase(s) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// build_variant_groups.cjs:153-173 -- additional kit guard beyond the is_kit column.
function nameImpliesKit(name) {
  if (!name) return false;
  if (/\b(?:complete\s+set|service\s+kit|rebuild\s+kit)\b/i.test(name)) return true;
  if (/\b(?:kit|assembly|assm?y)\b/i.test(name)) {
    return /\s(?:and|with)\s| & |\bw\/\s/i.test(name);
  }
  return false;
}

// build_variant_groups.cjs:186-286 -- used here only to detect whether a name
// carries ITS OWN extractable axis (Color/Size/Finish/...). If it does, that
// row belongs to build_variant_groups.cjs's Phase 2, not to this script --
// see the disjointness filter below.
const ATTRIBUTE_RULES = [
  { name: 'Size',
    pattern: /([+-]0\.0\d{2,3}|(?<![\w.])\.0\d{2,3}(?!\d)|\bSTD\b|\bO\.?S\.?\b|\bU\.?S\.?\b|\boversize\b|\bundersize\b|\bstandard\b)/i,
    extract: (m) => m[1].toUpperCase() },
  { name: 'Compound',
    pattern: /\b(organic|sintered|semi.?metallic|ceramic)\b/i,
    extract: (m) => toTitleCase(m[1]) },
  { name: 'Side',
    pattern: /\b(left|right)\b/i,
    extract: (m) => toTitleCase(m[1]) },
  { name: 'Apparel Size',
    pattern: /\b(4XL|3XL|2XL|XXL|XXXL|XL|LARGE|LGE?|LRG|MEDIUM|MED|MD|SM|XS|\dX(?:-?L)?)\b/i,
    extract: (m) => m[1].toUpperCase()
      .replace('LARGE', 'LG').replace('LGE', 'LG').replace('LRG', 'LG')
      .replace('MEDIUM', 'M').replace('MED', 'M').replace('MD', 'M').replace('SM', 'S') },
  { name: 'Gauge',
    pattern: /\b(\d{1,2})\s*-?\s*(?:gauge\b|ga\b)/i,
    extract: (m) => m[1] + ' Gauge' },
  { name: 'Rise',
    pattern: /\b(\d{1,2}(?:\.\d+)?)[""]\s*(?:ape|rise|tall)/i,
    extract: (m) => m[1] + '" Rise' },
  { name: 'Finish',
    pattern: /\b(brushed ss|brushed stainless|brushed|raw ss|raw stainless|matte black|gloss black|satin black|flat black|polished chrome|show chrome|powder coat(?:ed)?|zinc(?: plated)?|cadmium(?: plated)?|nickel(?: plated)?|hard chrome|chrome plated|polished)\b/i,
    extract: (m) => {
      const v = m[1].toLowerCase();
      if (v === 'brushed ss') return 'Brushed SS';
      if (v === 'raw ss') return 'Raw SS';
      if (v === 'brushed stainless') return 'Brushed Stainless';
      if (v === 'raw stainless') return 'Raw Stainless';
      if (v === 'brushed') return 'Brushed';
      return toTitleCase(m[1]);
    } },
  { name: 'Throttle',
    pattern: /\b(push-?pull|pull-?only|single cable|dual cable|single throttle|dual throttle)\b/i,
    extract: (m) => toTitleCase(m[1]) },
  { name: 'Color',
    pattern: /\b(?:(bright|dark|light)\s+)?(black|chrome|red|blue|brown|silver|gold|white|yellow|green|orange|purple|pink|burgundy|gr[ae]y|clear|natural|stainless|smoke|tinted|tint|blk|chr|\bSS\b)\b/i,
    extract: (m) => {
      const raw = m[2].toUpperCase();
      const color = raw === 'SS' ? 'Stainless' : raw === 'BLK' ? 'Black' : raw === 'CHR' ? 'Chrome' : toTitleCase(m[2]);
      return m[1] ? `${toTitleCase(m[1])} ${color}` : color;
    } },
];

function extractAttribute(name) {
  if (!name) return null;
  for (const rule of ATTRIBUTE_RULES) {
    const m = name.match(rule.pattern);
    if (m) return { name: rule.name, value: rule.extract(m) };
  }
  return null;
}

// build_variant_groups.cjs:71-80 -- same upsert, same table, same conflict target.
async function upsertMemberOptions(client, memberId, axes) {
  for (const a of axes ?? []) {
    if (!a?.name || !a?.value) continue;
    await client.query(
      `INSERT INTO catalog_variant_member_options (member_id, axis_name, axis_value, axis_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (member_id, axis_name) DO UPDATE
         SET axis_value = EXCLUDED.axis_value, axis_order = EXCLUDED.axis_order`,
      [memberId, a.name, a.value, a.order ?? 0]
    );
  }
}

// ── Length formatting ──────────────────────────────────────────────────────
// 10.850 -> 10.85"   12.000 -> 12"   8.850 -> 8.85"
function formatLength(lengthIn) {
  const n = typeof lengthIn === 'string' ? parseFloat(lengthIn) : lengthIn;
  if (!Number.isFinite(n)) return null;
  const trimmed = n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed}"`;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ build_length_variant_groups ═══  [${APPLY ? 'APPLY' : 'DRY RUN'}]\n`);

  const client = await pool.connect();
  try {
    // Tables already exist (created by build_variant_groups.cjs), but keep
    // this idempotent per that script's own convention in case this is ever
    // the first variant script run against a fresh DB.
    await client.query(`
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
    await client.query(`
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_variant_member_options (
        id          SERIAL PRIMARY KEY,
        member_id   INTEGER NOT NULL REFERENCES catalog_variant_members(id) ON DELETE CASCADE,
        axis_name   TEXT NOT NULL,
        axis_value  TEXT NOT NULL,
        axis_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE (member_id, axis_name)
      )
    `);
    await client.query(`ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS variant_group_id INTEGER REFERENCES catalog_variant_groups(id)`);

    // ── Idempotent re-run: treat rows currently grouped by THIS script (tagged
    // 'LENGTH') as eligible again, same as ungrouped rows, so a re-run
    // reclassifies its own prior output from scratch instead of piling up
    // orphaned duplicate groups alongside it. Rows owned by any other
    // script (WPS/PU-VTWIN/ADMIN/MULTI) are never touched.
    if (APPLY) {
      console.log('Clearing previous LENGTH-tagged variant data (own output only)...');
      await client.query(`
        UPDATE catalog_unified
        SET variant_group_id = NULL
        WHERE variant_group_id IN (SELECT id FROM catalog_variant_groups WHERE source_vendor = 'LENGTH')
      `);
      await client.query(`
        DELETE FROM catalog_variant_members
        WHERE group_id IN (SELECT id FROM catalog_variant_groups WHERE source_vendor = 'LENGTH')
      `);
      await client.query(`DELETE FROM catalog_variant_groups WHERE source_vendor = 'LENGTH'`);
      console.log('Cleared.\n');
    }

    // ── Candidate rows ──────────────────────────────────────────────────────
    // Scope: Cables category, plus Brakes > Brake Lines & Hoses -- confirmed
    // via direct query to be exactly the two curated-taxonomy buckets holding
    // these length-only-differentiated clusters. The variant_group_id OR
    // clause re-admits this script's own prior groups (see wipe above; in dry
    // -run mode nothing was actually cleared, so the OR clause still needs to
    // be here to preview what a full re-rebuild would look like).
    const { rows: candidates } = await client.query(`
      SELECT cu.id, cu.sku, cu.name, cu.brand, cu.source_vendor, cu.category,
             cu.is_kit, cu.pack_qty, cu.length_in, cu.msrp,
             COALESCE(vo.total_qty, 0) AS stock_qty,
             COALESCE(vo.msrp, cu.msrp) AS offer_price
      FROM catalog_unified cu
      LEFT JOIN vendor_offers vo ON vo.catalog_product_id = cu.id
      WHERE cu.is_active = true
        AND (cu.is_kit IS NULL OR cu.is_kit = false)
        AND (
          cu.variant_group_id IS NULL
          OR cu.variant_group_id IN (SELECT id FROM catalog_variant_groups WHERE source_vendor = 'LENGTH')
        )
        AND cu.length_in IS NOT NULL
        AND (
          cu.display_category = 'Cables'
          OR (cu.display_category = 'Brakes' AND cu.display_subcategory = 'Brake Lines & Hoses')
        )
      ORDER BY cu.source_vendor, cu.brand, cu.name, cu.length_in
    `);
    console.log(`${candidates.length} candidate rows (Cables / Brake Lines & Hoses, length_in present, ungrouped or previously LENGTH-grouped).`);

    // ── Cluster by (vendor|brand|category|exact name), skipping rows whose
    // name already carries its own extractable axis -- those belong to
    // build_variant_groups.cjs's Phase 2, not here. ───────────────────────
    const clusters = new Map();
    let skippedHasAttribute = 0, skippedKit = 0;
    for (const row of candidates) {
      if (nameImpliesKit(row.name)) { skippedKit++; continue; }
      if (extractAttribute(row.name)) { skippedHasAttribute++; continue; }
      const key = `${row.source_vendor}|${row.brand}|${row.category}|${row.name.trim().toLowerCase()}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(row);
    }
    console.log(`  ${skippedHasAttribute} rows skipped (name already has a Color/Size/Finish/... axis -- Phase 2's job)`);
    console.log(`  ${skippedKit} rows skipped (kit-like name)`);
    console.log(`  ${clusters.size} candidate clusters (before size/collision filtering)\n`);

    const needsReview = [];
    let groupsCreated = 0, membersCreated = 0, groupsSkippedTooBig = 0, groupsSkippedTooSmall = 0;

    if (APPLY) await client.query('BEGIN');

    for (const [key, members] of clusters) {
      if (members.length < 2) continue;

      // Uniform pack_qty required -- a 5-pk 10" and a 1-pk 12" aren't a
      // length variant pair, they're two different products.
      const packQtys = new Set(members.map((m) => m.pack_qty ?? 1));
      if (packQtys.size > 1) {
        needsReview.push({ key, reason: 'mixed_pack_qty', members });
        continue;
      }

      // Exact duplicates: same name, identical raw length_in. Keep one
      // canonical row (in-stock first, then cheapest, then lowest id) and
      // drop the rest rather than merging two real SKUs into one option.
      const byRawLength = new Map();
      for (const m of members) {
        const raw = parseFloat(m.length_in).toFixed(3);
        if (!byRawLength.has(raw)) byRawLength.set(raw, []);
        byRawLength.get(raw).push(m);
      }
      const deduped = [];
      for (const [, dupes] of byRawLength) {
        if (dupes.length === 1) { deduped.push(dupes[0]); continue; }
        const canonical = dupes.slice().sort((a, b) => {
          const aStock = a.stock_qty > 0 ? 1 : 0;
          const bStock = b.stock_qty > 0 ? 1 : 0;
          if (aStock !== bStock) return bStock - aStock;
          const aPrice = parseFloat(a.offer_price ?? a.msrp ?? Infinity);
          const bPrice = parseFloat(b.offer_price ?? b.msrp ?? Infinity);
          if (aPrice !== bPrice) return aPrice - bPrice;
          return a.id - b.id;
        })[0];
        deduped.push(canonical);
      }

      // Rounding collisions: different raw lengths that DISPLAY the same
      // (e.g. 10.850 vs 10.847 both -> "10.85"). Don't guess -- exclude the
      // whole cluster and flag it.
      const byFormatted = new Map();
      for (const m of deduped) {
        const formatted = formatLength(m.length_in);
        if (!byFormatted.has(formatted)) byFormatted.set(formatted, []);
        byFormatted.get(formatted).push(m);
      }
      const collision = [...byFormatted.values()].some((g) => g.length > 1);
      if (collision) {
        needsReview.push({ key, reason: 'rounding_collision', members: deduped });
        continue;
      }

      if (byFormatted.size < 2) { groupsSkippedTooSmall++; continue; }
      if (byFormatted.size > MAX_VARIANT_MEMBERS) {
        needsReview.push({ key, reason: `too_many_members (${byFormatted.size} > ${MAX_VARIANT_MEMBERS})`, members: deduped });
        groupsSkippedTooBig++;
        continue;
      }

      const finalMembers = deduped
        .slice()
        .sort((a, b) => parseFloat(a.length_in) - parseFloat(b.length_in));

      if (APPLY) {
        try {
          await client.query('SAVEPOINT cluster_sp');
          const [grp] = (await client.query(
            `INSERT INTO catalog_variant_groups (wps_product_id, display_name, source_vendor)
             VALUES (NULL, $1, 'LENGTH') RETURNING id`,
            [finalMembers[0].name]
          )).rows;

          for (let i = 0; i < finalMembers.length; i++) {
            const m = finalMembers[i];
            const formatted = formatLength(m.length_in);
            const [memberRow] = (await client.query(
              `INSERT INTO catalog_variant_members
                 (group_id, product_id, option_1_name, option_1_value, sort_order)
               VALUES ($1, $2, 'Length', $3, $4)
               ON CONFLICT (group_id, product_id) DO UPDATE
                 SET option_1_name = 'Length', option_1_value = EXCLUDED.option_1_value, sort_order = EXCLUDED.sort_order
               RETURNING id`,
              [grp.id, m.id, formatted, i]
            )).rows;
            if (memberRow) {
              await upsertMemberOptions(client, memberRow.id, [{ name: 'Length', value: formatted, order: 0 }]);
            }
            membersCreated++;
          }

          await client.query(
            `UPDATE catalog_unified SET variant_group_id = $1 WHERE id = ANY($2::int[])`,
            [grp.id, finalMembers.map((m) => m.id)]
          );

          await client.query('RELEASE SAVEPOINT cluster_sp');
          groupsCreated++;
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT cluster_sp').catch(() => {});
          console.error(`  Error on cluster "${key}":`, e.message);
        }
      } else {
        groupsCreated++;
        membersCreated += finalMembers.length;
        console.log(`  GROUP [Length] "${finalMembers[0].name}" (${finalMembers[0].source_vendor}/${finalMembers[0].brand}) — ${finalMembers.length} lengths`);
        finalMembers.forEach((m) => console.log(`    ${formatLength(m.length_in)} — ${m.sku}`));
      }
    }

    if (APPLY) await client.query('COMMIT');

    console.log(`\n═══ ${APPLY ? 'APPLY' : 'DRY RUN'} SUMMARY ═══`);
    console.log(`  Groups: ${groupsCreated}`);
    console.log(`  Members: ${membersCreated}`);
    console.log(`  Skipped (too few distinct lengths after dedup): ${groupsSkippedTooSmall}`);
    console.log(`  Skipped (exceeds ${MAX_VARIANT_MEMBERS}-member cap): ${groupsSkippedTooBig}`);

    if (needsReview.length) {
      console.log(`\n  ⚠ ${needsReview.length} clusters need manual review:`);
      for (const r of needsReview) {
        console.log(`    [${r.reason}] ${r.key} (${r.members.length} rows)`);
      }
    } else {
      console.log('\n  No clusters flagged for manual review.');
    }

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
    } else {
      console.log('\nDone.');
    }
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {});
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
