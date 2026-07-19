/**
 * build-product-groups.js
 *
 * Builds the product_groups and product_group_members tables that power
 * vendor-blind search deduplication and multi-brand checkout routing.
 *
 * Grouping signals applied in order (highest confidence first):
 *
 *   1. OEM crossref  — products sharing an oem_number in catalog_oem_crossref
 *                      are alternatives for the same HD OEM part → one group
 *
 *   2. UPC match     — same non-null UPC appearing across WPS + PU rows
 *                      in catalog_unified → same physical product → one group
 *
 *   3. Singleton     — no dedup signal found; every remaining unmatched product
 *                      gets its own 1-member group so search still works
 *
 * Safe to re-run: clears and rebuilds all groups from scratch each time.
 *
 * Usage:
 *   CATALOG_DATABASE_URL="postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
 *     node scripts/ingest/build-product-groups.js
 */

'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl:  false,
  max:  5,
});

const BATCH = 1000;

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeUpc(upc) {
  if (!upc) return null;
  const s = String(upc).replace(/\D/g, '');
  return s.length >= 8 ? s : null;
}

/** Pick the "best" product from a list of catalog_unified rows to be canonical.
 *  Prefers: in_stock, highest stock_quantity, most complete image, longest name. */
function pickCanonical(members) {
  return members.sort((a, b) => {
    if (b.in_stock !== a.in_stock) return b.in_stock - a.in_stock;
    if (b.stock_quantity !== a.stock_quantity) return b.stock_quantity - a.stock_quantity;
    if (!!b.image_url !== !!a.image_url) return !!b.image_url ? 1 : -1;
    return (b.name?.length ?? 0) - (a.name?.length ?? 0);
  })[0];
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔗  Product Group Builder');
  console.log('─'.repeat(60));

  const client = await pool.connect();

  try {
    // Verify tables exist
    const tableCheck = await client.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_name IN ('product_groups','product_group_members')
    `);
    if (Number(tableCheck.rows[0].count) < 2) {
      console.error('\n❌  Tables product_groups or product_group_members not found.');
      console.error('    Run migration-122-product-groups.sql first.\n');
      return;
    }

    // ── CLEAR previous build ─────────────────────────────────────────────────
    console.log('\n🗑   Clearing previous groups…');
    await client.query('TRUNCATE product_group_members, product_groups RESTART IDENTITY CASCADE');
    console.log('    Done.\n');

    // ── Load unified catalog into memory ─────────────────────────────────────
    console.log('📦  Loading catalog_unified…');
    const { rows: allProducts } = await client.query(`
      SELECT
        cu.id,
        cu.sku,
        cu.name,
        cu.brand,
        cu.display_brand,
        cu.category,
        cu.image_url,
        cu.msrp        AS msrp,
        cu.cost,
        cu.map_price,
        cu.in_stock,
        cu.stock_quantity,
        cu.warehouse_wi,
        cu.warehouse_ny,
        cu.warehouse_tx,
        cu.warehouse_nv,
        cu.warehouse_nc,
        cu.source_vendor AS vendor,
        cu.internal_sku,
        cu.slug,
        cu.upc,
        cp.id          AS product_id
      FROM catalog_unified cu
      LEFT JOIN catalog_products cp ON cp.sku = cu.sku
      WHERE cu.is_active = TRUE
      ORDER BY cu.id
    `);
    console.log(`    ${allProducts.length.toLocaleString()} active products loaded.\n`);

    // Build lookup maps
    const byId  = new Map(allProducts.map(p => [p.id, p]));
    const bySku = new Map(allProducts.map(p => [p.sku, p]));

    // Secondary lookup: manufacturer_part_number (upper-cased) → [unified product]
    // Used to widen OEM crossref groups via Brand-Part# matching.
    const byMpn = new Map();
    for (const p of allProducts) {
      // catalog_unified may have manufacturer_part_number via the catalog_products join;
      // we load it separately below. For now seed with internal_sku as fallback.
    }

    // Load manufacturer_part_number for all active catalog_products
    console.log('📦  Loading manufacturer_part_number map…');
    const { rows: mpnRows } = await client.query(`
      SELECT cp.sku, UPPER(TRIM(cp.manufacturer_part_number)) AS mpn
      FROM catalog_products cp
      WHERE cp.manufacturer_part_number IS NOT NULL
        AND btrim(cp.manufacturer_part_number) <> ''
    `);
    for (const r of mpnRows) {
      const product = bySku.get(r.sku);
      if (!product) continue;
      if (!byMpn.has(r.mpn)) byMpn.set(r.mpn, []);
      byMpn.get(r.mpn).push(product);
    }
    console.log(`    ${byMpn.size.toLocaleString()} distinct MPNs indexed.\n`);

    // Track which unified ids have been grouped already
    const grouped = new Set();

    // Collect groups to insert
    const groups  = [];  // { signal, oem_number, upc, members: [unified rows] }

    // ── SIGNAL 1: OEM crossref grouping ──────────────────────────────────────
    // Matches via:
    //   a) crossref.sku → catalog_unified.sku  (direct SKU match)
    //   b) crossref.page_reference → catalog_products.manufacturer_part_number
    //      (Brand-Part# matches the manufacturer's own part number)
    console.log('🔍  Signal 1 — OEM crossref groups…');
    const { rows: crossrefRows } = await client.query(`
      SELECT
        oem_number,
        array_agg(DISTINCT sku)            AS skus,
        array_agg(DISTINCT page_reference)
          FILTER (WHERE page_reference IS NOT NULL AND page_reference <> '') AS page_refs
      FROM catalog_oem_crossref
      WHERE oem_number IS NOT NULL AND oem_number <> ''
        AND sku        IS NOT NULL AND sku        <> ''
      GROUP BY oem_number
      HAVING COUNT(DISTINCT sku) >= 1
      ORDER BY oem_number
    `);

    let oemGroups  = 0;
    let oemSingles = 0;
    let mpnMatched = 0;

    for (const cr of crossrefRows) {
      // ── Path A: direct SKU match ─────────────────────────────────────────
      const skuMembers = cr.skus
        .map(s => bySku.get(s))
        .filter(Boolean)
        .filter(p => !grouped.has(p.id));

      // ── Path B: Brand-Part# (page_reference) → manufacturer_part_number ──
      // Catches products that share the same manufacturer part number but are
      // catalogued under a different vendor SKU (e.g. same James Gaskets part
      // from WPS vs PU, where PU uses MPN as the key).
      const mpnMembers = [];
      if (cr.page_refs && cr.page_refs.length > 0) {
        for (const ref of cr.page_refs) {
          const key = ref.trim().toUpperCase();
          const hits = byMpn.get(key) ?? [];
          for (const p of hits) {
            if (!grouped.has(p.id) && !skuMembers.includes(p)) {
              mpnMembers.push(p);
              mpnMatched++;
            }
          }
        }
      }

      const members = [...skuMembers, ...mpnMembers];
      if (members.length === 0) continue;

      if (members.length === 1) {
        oemSingles++;
      } else {
        oemGroups++;
      }

      groups.push({ signal: 'oem_crossref', oem_number: cr.oem_number, upc: null, members });
      members.forEach(p => grouped.add(p.id));
    }
    if (mpnMatched > 0) {
      console.log(`    +${mpnMatched} extra members found via Brand-Part# → MPN match.`);
    }
    console.log(`    ${oemGroups} multi-member OEM groups, ${oemSingles} crossref singletons.\n`);

    // ── SIGNAL 2: UPC match grouping ─────────────────────────────────────────
    console.log('🔍  Signal 2 — UPC match groups (cross-vendor)…');

    // Group remaining products by UPC — only care about UPCs that appear for
    // multiple VENDORS (WPS + PU), which is the dedup case we care about most.
    const upcMap = new Map(); // normalizedUpc → [product rows]
    for (const p of allProducts) {
      if (grouped.has(p.id)) continue;
      const upc = normalizeUpc(p.upc);
      if (!upc) continue;
      if (!upcMap.has(upc)) upcMap.set(upc, []);
      upcMap.get(upc).push(p);
    }

    let upcGroups = 0;

    for (const [upc, members] of upcMap) {
      // Only bother grouping if there are multiple members or multiple vendors
      const vendors = new Set(members.map(p => p.vendor));
      if (members.length < 2 && vendors.size < 2) continue;

      groups.push({ signal: 'upc_match', oem_number: null, upc, members });
      members.forEach(p => grouped.add(p.id));
      upcGroups++;
    }
    console.log(`    ${upcGroups} UPC-matched cross-vendor groups.\n`);

    // ── SIGNAL 3: Singletons — everything else ───────────────────────────────
    console.log('🔍  Signal 3 — Singletons for ungrouped products…');
    let singletons = 0;
    for (const p of allProducts) {
      if (grouped.has(p.id)) continue;
      groups.push({ signal: 'singleton', oem_number: null, upc: normalizeUpc(p.upc), members: [p] });
      grouped.add(p.id);
      singletons++;
    }
    console.log(`    ${singletons.toLocaleString()} singletons.\n`);

    console.log(`📊  Total groups to insert: ${groups.length.toLocaleString()}`);
    console.log('─'.repeat(60));

    // ── INSERT groups in batches ──────────────────────────────────────────────
    console.log('\n💾  Inserting product_groups…');

    let insertedGroups  = 0;
    let insertedMembers = 0;
    const startedAt = Date.now();

    for (let i = 0; i < groups.length; i += BATCH) {
      const batch = groups.slice(i, i + BATCH);

      await client.query('BEGIN');
      try {
        for (const g of batch) {
          const canonical = pickCanonical([...g.members]);
          const brands    = [...new Set(g.members.map(m => m.display_brand || m.brand).filter(Boolean))];
          const vendors   = [...new Set(g.members.map(m => m.vendor).filter(Boolean))];
          const prices    = g.members.map(m => m.msrp).filter(v => v != null && v > 0);
          const anyStock  = g.members.some(m => m.in_stock);

          // Derive slug for the group using canonical member's slug or build one
          const groupSlug = canonical.slug ??
            (canonical.internal_sku
              ? `${(canonical.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60).replace(/-$/,'')}-${canonical.internal_sku.toLowerCase()}`
              : null);

          const { rows: [grp] } = await client.query(`
            INSERT INTO product_groups (
              group_signal,
              oem_number,
              upc,
              canonical_name,
              canonical_brand,
              canonical_category,
              canonical_image_url,
              canonical_product_id,
              canonical_internal_sku,
              slug,
              any_in_stock,
              member_count,
              vendor_count,
              brand_count,
              price_min,
              price_max
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING id
          `, [
            g.signal,
            g.oem_number ?? null,
            g.upc ?? null,
            canonical.name,
            brands[0] ?? null,
            canonical.category ?? null,
            canonical.image_url ?? null,
            canonical.product_id ?? null,
            canonical.internal_sku ?? null,
            groupSlug ?? null,
            anyStock,
            g.members.length,
            vendors.length,
            brands.length,
            prices.length ? Math.min(...prices) : null,
            prices.length ? Math.max(...prices) : null,
          ]);

          const groupId = grp.id;

          // Insert members
          for (const m of g.members) {
            await client.query(`
              INSERT INTO product_group_members (
                group_id, product_id, unified_id, vendor, vendor_sku,
                brand, display_brand, internal_sku,
                msrp, cost, map_price,
                in_stock, stock_quantity,
                warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc,
                is_canonical
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
              ON CONFLICT (group_id, vendor_sku) DO NOTHING
            `, [
              groupId,
              m.product_id ?? null,
              m.id,
              m.vendor,
              m.sku,
              m.brand   ?? null,
              m.display_brand ?? null,
              m.internal_sku  ?? null,
              m.msrp    ?? null,
              m.cost    ?? null,
              m.map_price ?? null,
              m.in_stock ?? false,
              m.stock_quantity ?? 0,
              m.warehouse_wi ?? 0,
              m.warehouse_ny ?? 0,
              m.warehouse_tx ?? 0,
              m.warehouse_nv ?? 0,
              m.warehouse_nc ?? 0,
              m.id === canonical.id,
            ]);
            insertedMembers++;
          }
          insertedGroups++;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n  ⚠  Batch error at group ${i}:`, err.message);
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      const pct = ((insertedGroups / groups.length) * 100).toFixed(1);
      process.stdout.write(
        `\r    ${insertedGroups.toLocaleString()} / ${groups.length.toLocaleString()} groups  (${pct}%)  ${elapsed}s`
      );
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const { rows: [stats] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE group_signal = 'oem_crossref') AS oem_groups,
        COUNT(*) FILTER (WHERE group_signal = 'upc_match')    AS upc_groups,
        COUNT(*) FILTER (WHERE group_signal = 'singleton')    AS singletons,
        COUNT(*) FILTER (WHERE member_count > 1)              AS multi_member,
        COUNT(*) FILTER (WHERE vendor_count > 1)              AS cross_vendor,
        COUNT(*) FILTER (WHERE any_in_stock)                  AS in_stock_groups
      FROM product_groups
    `);

    const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('\n\n' + '─'.repeat(60));
    console.log(`✅  Done in ${totalSec}s`);
    console.log(`\n    Groups inserted     : ${insertedGroups.toLocaleString()}`);
    console.log(`    Members inserted    : ${insertedMembers.toLocaleString()}`);
    console.log(`\n    By signal:`);
    console.log(`      OEM crossref      : ${Number(stats.oem_groups).toLocaleString()}`);
    console.log(`      UPC match         : ${Number(stats.upc_groups).toLocaleString()}`);
    console.log(`      Singletons        : ${Number(stats.singletons).toLocaleString()}`);
    console.log(`\n    Multi-member groups : ${Number(stats.multi_member).toLocaleString()}  (deduped in search)`);
    console.log(`    Cross-vendor groups : ${Number(stats.cross_vendor).toLocaleString()}  (WPS+PU both have it)`);
    console.log(`    In-stock groups     : ${Number(stats.in_stock_groups).toLocaleString()}`);
    console.log('─'.repeat(60) + '\n');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  pool.end();
  process.exit(1);
});
