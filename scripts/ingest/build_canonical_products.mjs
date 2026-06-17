#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

/**
 * build_canonical_products.mjs
 *
 * Phase A: Creates 1:1 canonical_products for every active catalog_unified row
 *          that doesn't have one yet.
 *
 * Phase B: Finds cross-vendor matches via shared OEM numbers + same display_category.
 *          Merges them into single canonical products and writes proposals to
 *          canonical_match_proposals for admin review.
 *
 * Run:
 *   node scripts/ingest/build_canonical_products.mjs --phase=a    (init 1:1)
 *   node scripts/ingest/build_canonical_products.mjs --phase=b    (OEM matching)
 *   node scripts/ingest/build_canonical_products.mjs --phase=all  (both)
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL ?? process.env.DATABASE_URL });

const BATCH_SIZE = 2000;

// ─── Mismatch detection (ported from app/admin/canonical-matches/page.tsx) ────
// Same exact logic as the admin review UI badges, so a pair that would show
// a pack-size or finish mismatch badge never becomes a proposal at all,
// instead of relying on a reviewer to catch the badge every time.

function parsePackQty(name) {
  const patterns = [
    /(\d+)\s*[- ]?pack/i,
    /pack\s*of\s*(\d+)/i,
    /set\s*of\s*(\d+)/i,
    /\((\d+)\)\s*$/,
    /\bx\s*(\d+)\b/i,
  ];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 1 && n <= 500) return n;
    }
  }
  return 1;
}

function effectivePackQty(packQty, name) {
  if (packQty && packQty > 1) return packQty;
  return parsePackQty(name);
}

const FINISH_KEYWORDS = [
  'wrinkle black', 'powder coat', 'gunmetal', 'titanium', 'stainless steel',
  'chrome', 'black', 'polished', 'natural', 'satin', 'zinc', 'stainless',
  'brushed', 'anodized', 'smooth', 'machine', 'gloss',
  'matte', 'billet', 'raw', 'silver', 'gold',
];

function parseFinish(name) {
  const lower = name.toLowerCase();
  for (const kw of FINISH_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function progressBar(current, total, startTime) {
  const pct     = current / total;
  const filled  = Math.round(pct * 36);
  const bar     = '█'.repeat(filled) + '░'.repeat(36 - filled);
  const elapsed = (Date.now() - startTime) / 1000;
  const rate    = current / elapsed;
  const eta     = rate > 0 ? Math.round((total - current) / rate) : 0;
  const etaStr  = eta > 60
    ? `${Math.floor(eta / 60)}m ${eta % 60}s`
    : `${eta}s`;
  process.stdout.write(
    `\r  [${bar}] ${(pct * 100).toFixed(1)}%  ${current.toLocaleString()} / ${total.toLocaleString()}  ${Math.round(rate)}/s  ETA ${etaStr}  `
  );
}


// ─── PHASE A: Initialize 1:1 canonical products ──────────────────────────────

async function phaseA(client) {
  console.log('\n── Phase A: Initializing 1:1 canonical products ──');

  // Count how many still need one
  const { rows: [{ unlinked }] } = await client.query(`
    SELECT COUNT(*) AS unlinked
    FROM catalog_unified
    WHERE is_active = true
      AND canonical_product_id IS NULL
  `);
  console.log(`  ${unlinked} unlinked active products`);

  if (unlinked === '0') {
    console.log('  Nothing to do. All products already linked.');
    return;
  }

  let totalCreated = 0;
  const startTime = Date.now();

  // No offset needed — each batch picks up the next NULL rows since
  // we set canonical_product_id as part of the same statement.
  while (true) {
    const { rows: result } = await client.query(`
      WITH batch AS MATERIALIZED (
        SELECT
          cu.id,
          cu.source_vendor,
          -- Real per-vendor ordering SKU — NOT internal_sku (that's our format).
          -- vendor_sku is the correct column when populated; fall back to sku
          -- (stripping vendor prefixes/dashes) for the rows where it's empty.
          CASE
            WHEN cu.vendor_sku IS NOT NULL AND cu.vendor_sku != '' THEN cu.vendor_sku
            WHEN cu.source_vendor = 'PU'    THEN REPLACE(cu.sku, '-', '')
            WHEN cu.source_vendor = 'VTWIN' THEN REGEXP_REPLACE(cu.sku, '^VT-', '')
            WHEN cu.source_vendor = 'WPS'   THEN REGEXP_REPLACE(cu.sku, '^WPS-', '')
            ELSE cu.source_vendor || '-' || cu.id::text
          END AS vendor_sku,
          COALESCE(cu.brand, cu.brand_code)  AS brand_name,
          cu.name                            AS product_name,
          cu.display_category,
          cu.display_subcategory,
          cu.computed_price,
          cu.image_url                       AS primary_image_url,
          cu.fits_all_models,
          'CP-' || LPAD(nextval('canonical_sku_seq')::text, 6, '0') AS canonical_sku
        FROM catalog_unified cu
        WHERE cu.is_active = true
          AND cu.canonical_product_id IS NULL
        ORDER BY cu.id
        LIMIT $1
      ),
      inserted_cp AS (
        INSERT INTO canonical_products (
          canonical_sku, display_name, display_category, display_subcategory,
          brand, primary_image_url, our_price, fits_all_models, match_confidence
        )
        SELECT
          canonical_sku, product_name, display_category, display_subcategory,
          brand_name, primary_image_url, computed_price, fits_all_models, 'single'
        FROM batch
        RETURNING id, canonical_sku
      ),
      joined AS (
        SELECT b.*, icp.id AS cp_id
        FROM batch b
        JOIN inserted_cp icp ON icp.canonical_sku = b.canonical_sku
      ),
      inserted_pv AS (
        INSERT INTO product_vendors (
          canonical_id, catalog_unified_id, source_vendor, vendor_sku,
          our_cost, in_stock
        )
        SELECT
          cp_id, id, source_vendor, vendor_sku,
          ROUND(computed_price * 0.65, 2), true
        FROM joined
        RETURNING catalog_unified_id
      ),
      updated_cu AS (
        UPDATE catalog_unified cu
        SET canonical_product_id = j.cp_id
        FROM joined j
        WHERE cu.id = j.id
        RETURNING cu.id
      )
      SELECT COUNT(*) AS n FROM updated_cu
    `, [BATCH_SIZE]);

    const n = +result[0].n;
    if (n === 0) break;

    totalCreated += n;
    progressBar(totalCreated, +unlinked, startTime);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ✓ Done. ${totalCreated.toLocaleString()} canonical products created in ${elapsed}s`);
}

// ─── PHASE B: OEM-based cross-vendor matching ─────────────────────────────────

async function phaseB(client) {
  console.log('\n── Phase B: OEM-based cross-vendor matching ──');

  // Find OEM numbers shared across multiple vendors in the same display_category.
  // These are high-confidence match candidates.
  const { rows: candidates } = await client.query(`
    WITH oem_multi AS (
      SELECT
        ocr.oem_number,
        cu.display_category,
        COUNT(DISTINCT cu.source_vendor)  AS vendor_count,
        array_agg(DISTINCT cu.source_vendor ORDER BY cu.source_vendor) AS vendors,
        array_agg(DISTINCT cu.id ORDER BY cu.id) AS product_ids,
        array_agg(DISTINCT cu.canonical_product_id ORDER BY cu.canonical_product_id) AS canonical_ids
      FROM catalog_oem_crossref ocr
      JOIN catalog_unified cu ON cu.id = ocr.product_id
      WHERE cu.is_active = true
        AND ocr.oem_number IS NOT NULL
        AND ocr.oem_number != ''
        AND cu.canonical_product_id IS NOT NULL
        AND cu.is_kit = false
      GROUP BY ocr.oem_number, cu.display_category
      HAVING COUNT(DISTINCT cu.source_vendor) > 1
    )
    SELECT * FROM oem_multi
    -- Exclude cases where they're already on the same canonical (already merged)
    WHERE array_length(
      ARRAY(SELECT DISTINCT u FROM unnest(canonical_ids) AS u WHERE u IS NOT NULL), 1
    ) > 1
    ORDER BY vendor_count DESC, oem_number
  `);

  console.log(`  Found ${candidates.length} OEM match candidates`);

  // Fetch name + pack_qty for every product involved, once, so we can
  // mismatch-check pairs without a query per pair.
  const allProductIds = [...new Set(candidates.flatMap(c => c.product_ids.filter(Boolean)))];
  const productInfo = new Map(); // id -> { name, pack_qty }

  if (allProductIds.length > 0) {
    const { rows: infoRows } = await client.query(`
      SELECT id, name, pack_qty FROM catalog_unified WHERE id = ANY($1)
    `, [allProductIds]);
    for (const r of infoRows) {
      productInfo.set(r.id, { name: r.name, pack_qty: r.pack_qty });
    }
  }

  let proposed = 0;
  let alreadyExists = 0;
  let skippedPackQty = 0;
  let skippedFinish = 0;

  for (const c of candidates) {
    const productIds = c.product_ids.filter(Boolean);
    if (productIds.length < 2) continue;

    // Write a proposal for each pair
    for (let i = 0; i < productIds.length - 1; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        const a = Math.min(productIds[i], productIds[j]);
        const b = Math.max(productIds[i], productIds[j]);

        const infoA = productInfo.get(a);
        const infoB = productInfo.get(b);

        // Skip pairs that the admin UI would flag with a pack-size mismatch
        // badge — these are different sellable quantities of the same base
        // part, not duplicates.
        if (infoA && infoB) {
          const qtyA = effectivePackQty(infoA.pack_qty, infoA.name);
          const qtyB = effectivePackQty(infoB.pack_qty, infoB.name);
          if (qtyA !== qtyB) {
            skippedPackQty++;
            continue;
          }

          // Skip pairs that the admin UI would flag with a finish/color
          // mismatch badge — only skip when BOTH sides have a recognized
          // finish keyword and they differ; absence of a keyword on either
          // side isn't evidence of a mismatch, so don't exclude on that alone.
          const finishA = parseFinish(infoA.name);
          const finishB = parseFinish(infoB.name);
          if (finishA && finishB && finishA !== finishB) {
            skippedFinish++;
            continue;
          }
        }

        try {
          await client.query(`
            INSERT INTO canonical_match_proposals
              (product_id_a, product_id_b, match_reason, match_score, shared_oem_number)
            VALUES ($1, $2, 'oem', 0.92, $3)
            ON CONFLICT (product_id_a, product_id_b) DO NOTHING
          `, [a, b, c.oem_number]);
          proposed++;
        } catch {
          alreadyExists++;
        }
      }
    }
  }

  console.log(`  Proposed: ${proposed} new matches`);
  console.log(`  Skipped (already exists): ${alreadyExists}`);
  console.log(`  Skipped (pack-qty mismatch): ${skippedPackQty}`);
  console.log(`  Skipped (finish/color mismatch): ${skippedFinish}`);
  console.log(`\n  Review proposals in the admin panel at /admin/canonical-matches`);
  console.log(`  or with: SELECT * FROM canonical_match_proposals WHERE status = 'pending' LIMIT 50;`);
}

// ─── MERGE: Apply confirmed proposals ─────────────────────────────────────────

async function applyConfirmedMerges(client) {
  console.log('\n── Applying confirmed match proposals ──');

  const { rows: confirmed } = await client.query(`
    SELECT cmp.*, 
      a.canonical_product_id AS cp_a,
      b.canonical_product_id AS cp_b
    FROM canonical_match_proposals cmp
    JOIN catalog_unified a ON a.id = cmp.product_id_a
    JOIN catalog_unified b ON b.id = cmp.product_id_b
    WHERE cmp.status = 'confirmed'
      AND a.canonical_product_id != b.canonical_product_id
  `);

  console.log(`  ${confirmed.length} confirmed proposals to merge`);
  let merged = 0;

  for (const row of confirmed) {
    // Keep the lower canonical_id (PU → WPS → VTwin priority by convention)
    const keepId   = Math.min(row.cp_a, row.cp_b);
    const mergeId  = Math.max(row.cp_a, row.cp_b);

    await client.query('BEGIN');
    try {
      // Move product_vendors rows to the keeper canonical
      await client.query(`
        UPDATE product_vendors
        SET canonical_id = $1
        WHERE canonical_id = $2
          AND source_vendor NOT IN (
            SELECT source_vendor FROM product_vendors WHERE canonical_id = $1
          )
      `, [keepId, mergeId]);

      // Repoint catalog_unified
      await client.query(`
        UPDATE catalog_unified
        SET canonical_product_id = $1
        WHERE canonical_product_id = $2
      `, [keepId, mergeId]);

      // Update match_confidence on keeper
      await client.query(`
        UPDATE canonical_products
        SET match_confidence = 'oem', updated_at = NOW()
        WHERE id = $1
      `, [keepId]);

      // Deactivate the merged canonical
      await client.query(`
        UPDATE canonical_products
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
      `, [mergeId]);

      await client.query('COMMIT');
      merged++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  Failed merge ${row.cp_a}↔${row.cp_b}:`, err.message);
    }
  }

  console.log(`  Merged: ${merged} canonical products`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const phase = args.find(a => a.startsWith('--phase='))?.split('=')[1] ?? 'all';
  const applyMerges = args.includes('--apply-merges');

  const client = await pool.connect();
  try {
    if (phase === 'a' || phase === 'all') await phaseA(client);
    if (phase === 'b' || phase === 'all') await phaseB(client);
    if (applyMerges) await applyConfirmedMerges(client);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
