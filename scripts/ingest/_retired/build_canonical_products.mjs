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
  // Session 75: pure colors were missing entirely (only finish/texture words
  // were covered) — caught 2 real mismatches (e.g. "TS CLEAR LENS" vs "Turn
  // Signal Lens Set Red") that the original list couldn't see at all.
  'red', 'blue', 'white', 'yellow', 'green', 'orange', 'purple',
  'gray', 'grey', 'clear', 'pink', 'burgundy',
];

function parseFinish(name) {
  const lower = name.toLowerCase();
  for (const kw of FINISH_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// Brake-pad friction material — a shared OEM number for brake pads legitimately
// covers several materially different compounds (organic/sintered/semi-metallic/
// ceramic/kevlar), same vocabulary already proven in build_variant_groups.cjs's
// ATTRIBUTE_RULES. Session 75: validated against real data — every sample pair
// checked was a genuinely different friction material, not a naming variant of
// the same product (e.g. "Sintered Metal" vs "Organic" vs "Street Ceramic").
function parseCompound(name) {
  const m = name.match(/\b(organic|sintered|semi.?metallic|ceramic|kevlar)\b/i);
  return m ? m[1].toLowerCase().replace(/[\s-]/g, '') : null;
}

// Normalizes a product name for exact-text comparison (case/punctuation-
// insensitive). A raw fuzzy-similarity score was tried and rejected — real
// examples like "Cam Gear Cover Oil Double Lip Seal" vs "...Single Lip Seal"
// score high on token overlap despite being a genuine functional difference,
// so only an EXACT match after normalization is trusted as a positive signal
// here. Still gated by a price-sanity check below, since even identical
// names occasionally cover different kit compositions across brands.
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// Gasket/shim thickness callouts are always written as a bare leading decimal
// (.032", .045") with NO digit before the decimal point — unlike bore/stroke/
// length specs, which always have at least one whole-number digit (3.875",
// 10.5"). Requiring a non-digit (or start-of-string) immediately before the
// '.' distinguishes "thickness" from "diameter/length" reliably without a
// false-positive on piston-kit bore specs etc. Session 75: found 4 real
// already-applied bad merges (e.g. ".043\" Head Gasket" merged with ".032\"
// Head Gasket" — two different physical thicknesses, same OEM crossref
// number) that this check would have caught.
function parseThickness(name) {
  const m1 = name.match(/(?:^|[^0-9])\.(\d{2,3})\s*["”]/);
  if (m1) return parseFloat('0.' + m1[1]);
  // Some vendor names (mostly abbreviated PU/WPS listings) drop the inch mark
  // entirely (e.g. "GASKET HEAD GASKET .045 TWIN CAM") — only safe to treat a
  // bare decimal as a thickness when the name says "gasket" somewhere, since
  // a bare ".0XX" alone is too ambiguous outside that context. Session 75:
  // found 19 more real mismatches this way (e.g. ".045" vs ".036" head
  // gaskets with no inch mark at all).
  if (/gasket/i.test(name)) {
    const m2 = name.match(/(?:^|[^0-9])\.(\d{2,3})(?:\s|$|-)/);
    if (m2) return parseFloat('0.' + m2[1]);
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

// Subcategories where "shares an OEM number" means "family of compatible
// replacements" rather than "same physical product" — sharing an OEM number
// is how the aftermarket industry lists cross-brand alternatives, not
// evidence two listings are the same item. Session 75: verified this
// directly — every sampled pair in these subcategories was a genuinely
// different brand/product line (Drag Specialties vs V-Twin vs HardDrive vs
// Duro's own Ceramic-vs-Soft compound lines), never the same physical part
// under two vendors. These three subcategories alone accounted for ~2,864 of
// the pending review queue with no reliable text signal either way (after
// every other check — part number, exact name, thickness, compound, color —
// already ran). Excluded from candidate generation entirely rather than left
// to accumulate an ever-growing, unresolvable pending pile.
const OEM_FAMILY_NOT_DUPLICATE_SUBCATEGORIES = [
  'Brake Pads & Shoes', 'Batteries', 'Charging & Alternators',
];

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
        AND (cu.display_subcategory IS NULL OR cu.display_subcategory != ALL($1::text[]))
      GROUP BY ocr.oem_number, cu.display_category
      HAVING COUNT(DISTINCT cu.source_vendor) > 1
    )
    SELECT * FROM oem_multi
    -- Exclude cases where they're already on the same canonical (already merged)
    WHERE array_length(
      ARRAY(SELECT DISTINCT u FROM unnest(canonical_ids) AS u WHERE u IS NOT NULL), 1
    ) > 1
    ORDER BY vendor_count DESC, oem_number
  `, [OEM_FAMILY_NOT_DUPLICATE_SUBCATEGORIES]);

  console.log(`  Found ${candidates.length} OEM match candidates`);

  // Fetch name + pack_qty + brand_part_number + price for every product
  // involved, once, so we can mismatch-check pairs without a query per pair.
  const allProductIds = [...new Set(candidates.flatMap(c => c.product_ids.filter(Boolean)))];
  const productInfo = new Map(); // id -> { name, pack_qty, brand_part_number, price }

  if (allProductIds.length > 0) {
    const { rows: infoRows } = await client.query(`
      SELECT id, name, pack_qty, brand_part_number, computed_price FROM catalog_unified WHERE id = ANY($1)
    `, [allProductIds]);
    for (const r of infoRows) {
      productInfo.set(r.id, { name: r.name, pack_qty: r.pack_qty, brand_part_number: r.brand_part_number, price: r.computed_price });
    }
  }

  // Normalizes a manufacturer part number for exact-match comparison
  // (strips case/punctuation/whitespace, same convention as normalizeBrand()).
  function normalizePartNumber(s) {
    if (!s) return null;
    const stripped = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return stripped || null;
  }

  let proposed = 0;
  let autoConfirmed = 0;
  let autoRejectedPriceGap = 0;
  let alreadyExists = 0;
  let skippedPackQty = 0;
  let skippedFinish = 0;
  let skippedThickness = 0;
  let skippedCompound = 0;

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

          // Skip pairs with a differing gasket/shim thickness callout in both
          // names — a shared OEM crossref number legitimately covers multiple
          // distinct physical thicknesses (e.g. a .032" and a .045" head
          // gasket both replace the same OEM part across different production
          // years), so it's not evidence of a duplicate the way pack-qty and
          // finish are.
          const thickA = parseThickness(infoA.name);
          const thickB = parseThickness(infoB.name);
          if (thickA !== null && thickB !== null && thickA !== thickB) {
            skippedThickness++;
            continue;
          }

          const compoundA = parseCompound(infoA.name);
          const compoundB = parseCompound(infoB.name);
          if (compoundA && compoundB && compoundA !== compoundB) {
            skippedCompound++;
            continue;
          }
        }

        // Two evidence-based rules requested after session 75's manual review
        // turned up both false positives sitting in the queue and clear
        // duplicates still needing a manual click:
        //
        // 1. Exact brand_part_number match (both sides non-null, normalized)
        //    is a much stronger identity signal than shared OEM alone — an
        //    OEM crossref number is one-to-many across distinct physical
        //    variants (e.g. one gasket OEM# covering three different
        //    thicknesses across decades of production), but two vendors
        //    listing the literal same manufacturer part number is near-
        //    certainly the same physical item. Auto-confirmed instead of
        //    left pending — validated against 11 real examples session 75,
        //    zero had a >3x price gap (the one signal that would suggest
        //    otherwise).
        //
        // 2. A large price gap (>=2.5x) is only meaningful as a NEGATIVE
        //    signal when BOTH sides have an explicit, differing part
        //    number — that's corroborating evidence (two named, different
        //    manufacturer parts), not just "we don't know." A missing part
        //    number on either side means we have no basis for comparison at
        //    all — price alone doesn't prove non-identity, since the same
        //    physical part is routinely priced very differently across
        //    vendors (that's normal markup variance, not evidence of a
        //    different product). Session 75: an earlier version of this rule
        //    treated "no part number" the same as "different part number"
        //    and wrongly auto-rejected 423 pairs on price alone with zero
        //    actual comparison — reopened to pending after the mistake was
        //    caught.
        let autoStatus = null;
        let autoReviewedBy = null;
        if (infoA && infoB) {
          const bpnA = normalizePartNumber(infoA.brand_part_number);
          const bpnB = normalizePartNumber(infoB.brand_part_number);
          const exactPartMatch = bpnA && bpnB && bpnA === bpnB;
          const explicitPartMismatch = bpnA && bpnB && bpnA !== bpnB;

          // Exact name match after normalization (case/punctuation-insensitive)
          // is a second, independent positive signal — validated against 249
          // real examples session 75, only 2 had a wild price gap. Still
          // gated on price ratio < 3x here as a sanity check, since a short
          // generic name ("Top End Gasket Kit") occasionally covers a
          // materially different kit composition across brands.
          let exactNameMatch = false;
          if (!exactPartMatch && infoA.price && infoB.price && infoA.price > 0 && infoB.price > 0) {
            const priceRatio = Math.max(infoA.price, infoB.price) / Math.min(infoA.price, infoB.price);
            if (priceRatio < 3 && normalizeName(infoA.name) === normalizeName(infoB.name)) {
              exactNameMatch = true;
            }
          }

          if (exactPartMatch) {
            autoStatus = 'confirmed';
            autoReviewedBy = 'auto-brand-part-number-match';
          } else if (exactNameMatch) {
            autoStatus = 'confirmed';
            autoReviewedBy = 'auto-exact-name-match';
          } else if (explicitPartMismatch && infoA.price && infoB.price && infoA.price > 0 && infoB.price > 0) {
            const gap = Math.max(infoA.price, infoB.price) / Math.min(infoA.price, infoB.price);
            if (gap >= 2.5) {
              autoRejectedPriceGap++;
              continue;
            }
          }
        }

        try {
          if (autoStatus === 'confirmed') {
            await client.query(`
              INSERT INTO canonical_match_proposals
                (product_id_a, product_id_b, match_reason, match_score, shared_oem_number, status, reviewed_by, reviewed_at)
              VALUES ($1, $2, 'oem', 0.98, $3, 'confirmed', $4, NOW())
              ON CONFLICT (product_id_a, product_id_b) DO NOTHING
            `, [a, b, c.oem_number, autoReviewedBy]);
            autoConfirmed++;
          } else {
            await client.query(`
              INSERT INTO canonical_match_proposals
                (product_id_a, product_id_b, match_reason, match_score, shared_oem_number)
              VALUES ($1, $2, 'oem', 0.92, $3)
              ON CONFLICT (product_id_a, product_id_b) DO NOTHING
            `, [a, b, c.oem_number]);
          }
          proposed++;
        } catch {
          alreadyExists++;
        }
      }
    }
  }

  console.log(`  Proposed: ${proposed} new matches (${autoConfirmed} auto-confirmed via exact brand_part_number match)`);
  console.log(`  Skipped (already exists): ${alreadyExists}`);
  console.log(`  Skipped (pack-qty mismatch): ${skippedPackQty}`);
  console.log(`  Skipped (finish/color mismatch): ${skippedFinish}`);
  console.log(`  Skipped (thickness mismatch): ${skippedThickness}`);
  console.log(`  Skipped (brake-pad compound mismatch): ${skippedCompound}`);
  console.log(`  Skipped (price gap >=2.5x, no matching part number): ${autoRejectedPriceGap}`);
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
