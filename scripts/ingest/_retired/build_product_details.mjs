#!/usr/bin/env node
/**
 * build_product_details.mjs
 *
 * Normalizes product detail content from all three vendors into a single
 * `product_details JSONB` column on catalog_unified.
 *
 * Normalized shape:
 *   {
 *     description: "plain text or null",
 *     features:    ["bullet", "bullet", ...],
 *     attributes:  { "Size": "10mm", "Finish": "Chrome" },
 *     tech_note:   "plain text or null"
 *   }
 *
 * Sources by vendor:
 *   PU    — catalog_unified.features (already clean text arrays from brand XML)
 *   WPS   — wps_catalog.product_features (HTML → parsed bullets) + product_description
 *   VTwin — catalog_unified.description + pdp_payload (attributes + tech_note)
 *
 * Usage:
 *   node build_product_details.mjs              # dry run — show coverage stats
 *   node build_product_details.mjs --apply      # write product_details
 *   node build_product_details.mjs --vendor PU  # single vendor dry run
 *   node build_product_details.mjs --vendor WPS --apply
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool    = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const DRY_RUN = !process.argv.includes('--apply');
const VENDOR  = (() => {
  const idx = process.argv.indexOf('--vendor');
  return idx !== -1 ? process.argv[idx + 1]?.toUpperCase() : null;
})();

// ── HTML feature parser (WPS) ─────────────────────────────────────────────────
// WPS product_features is a single HTML blob: <ul><li>...</li><li>...</li></ul>
// Extract clean text from each <li>, strip all remaining tags.
function parseHtmlFeatures(html) {
  if (!html || !html.trim()) return [];
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const bullets = [];
  let match;
  while ((match = liPattern.exec(html)) !== null) {
    const text = match[1]
      .replace(/<[^>]+>/g, '')   // strip nested tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) bullets.push(text);
  }
  // Fallback: if no <li> found, strip all tags and use as single bullet
  if (bullets.length === 0) {
    const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped) bullets.push(stripped);
  }
  return bullets;
}

/**
 * Safely parse an attributes value from VTwin pdp_payload.
 *
 * The scraper can leave attributes in several states:
 *   1. A proper JS object (already parsed by pg JSONB driver)     → use as-is
 *   2. A stringified JSON object e.g. '{"Size":"10mm"}'           → JSON.parse()
 *   3. A doubly-stringified string e.g. '"{\\"Size\\":\\"10mm\\"}"' → JSON.parse() twice
 *   4. null / undefined / empty string / '{}'                     → return null
 *
 * Returns a plain object or null.
 */
function parseVtwinAttributes(raw) {
  if (raw === null || raw === undefined) return null;

  // Already a proper object from the pg JSONB driver
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.keys(raw).length > 0 ? raw : null;
  }

  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}' || trimmed === 'null') return null;

  // First parse attempt
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null; // not valid JSON at all
  }

  // If first parse gave us a string, it was double-encoded — parse again
  if (typeof parsed === 'string') {
    const inner = parsed.trim();
    if (!inner || inner === '{}' || inner === 'null') return null;
    try {
      parsed = JSON.parse(inner);
    } catch {
      return null;
    }
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return Object.keys(parsed).length > 0 ? parsed : null;
  }

  return null;
}

// ── Ensure column exists ──────────────────────────────────────────────────────
async function ensureColumn(client) {
  await client.query(`
    ALTER TABLE catalog_unified
    ADD COLUMN IF NOT EXISTS product_details JSONB
  `);
  // GIN index for future jsonb queries
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cu_product_details_gin
    ON catalog_unified USING gin(product_details)
    WHERE product_details IS NOT NULL
  `);
  console.log('  ✅ product_details column ready\n');
}

// ── PU Pass — SQL only (features already clean) ──────────────────────────────
async function processPU(client) {
  console.log('── PU ───────────────────────────────────────────────────────────');

  const { rows: [stats] } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE array_length(features,1) > 0) AS has_features,
      COUNT(*) AS total
    FROM catalog_unified
    WHERE source_vendor = 'PU' AND is_active = true
  `);
  console.log(`  ${stats.has_features} / ${stats.total} active PU products have features`);

  if (DRY_RUN) {
    console.log(`  ⚠️  DRY RUN — would populate product_details for ${stats.has_features} PU products\n`);
    return { updated: 0, skipped: Number(stats.total) - Number(stats.has_features) };
  }

  // Write product_details from existing clean features array.
  // If a product already has product_details (e.g. from a prior run), overwrite.
  const { rowCount } = await client.query(`
    UPDATE catalog_unified
    SET product_details = jsonb_build_object('features', to_jsonb(features))
    WHERE source_vendor = 'PU'
      AND is_active = true
      AND features IS NOT NULL
      AND array_length(features, 1) > 0
  `);

  // Null out product_details for PU products with no data (clean slate)
  await client.query(`
    UPDATE catalog_unified
    SET product_details = NULL
    WHERE source_vendor = 'PU'
      AND is_active = true
      AND (features IS NULL OR array_length(features, 1) = 0)
  `);

  console.log(`  ✅ ${rowCount} PU products updated\n`);
  return { updated: rowCount, skipped: Number(stats.total) - rowCount };
}

// ── WPS Pass — JS parsing for HTML features ───────────────────────────────────
async function processWPS(client) {
  console.log('── WPS ──────────────────────────────────────────────────────────');

  const { rows: products } = await client.query(`
    SELECT
      cu.id,
      wps.product_description,
      wps.product_features
    FROM catalog_unified cu
    JOIN wps_catalog wps ON wps.sku = cu.vendor_sku
    WHERE cu.source_vendor = 'WPS'
      AND cu.is_active = true
      AND (
        (wps.product_description IS NOT NULL AND wps.product_description <> '')
        OR (wps.product_features  IS NOT NULL AND wps.product_features  <> '')
      )
  `);

  console.log(`  ${products.length} WPS products with source data`);

  if (DRY_RUN) {
    // Show a few parsed examples
    const sample = products.slice(0, 3);
    for (const p of sample) {
      const bullets = parseHtmlFeatures(p.product_features);
      console.log(`  Sample id=${p.id}: ${bullets.length} bullets, desc=${!!p.product_description}`);
      if (bullets[0]) console.log(`    "${bullets[0].slice(0, 80)}..."`);
    }
    console.log(`  ⚠️  DRY RUN — would populate product_details for ${products.length} WPS products\n`);
    return { updated: 0, skipped: 0 };
  }

  // Batch update in chunks of 500
  const BATCH = 500;
  let updated = 0;

  for (let i = 0; i < products.length; i += BATCH) {
    const chunk = products.slice(i, i + BATCH);
    const values = chunk.map(p => {
      const features    = parseHtmlFeatures(p.product_features);
      const description = p.product_description?.trim() || null;
      const details     = {};
      if (description) details.description = description;
      if (features.length > 0) details.features = features;
      return { id: p.id, details: Object.keys(details).length > 0 ? details : null };
    });

    // Build parameterized update using unnest
    const ids     = values.map(v => v.id);
    const details = values.map(v => JSON.stringify(v.details));

    await client.query(`
      UPDATE catalog_unified cu
      SET product_details = v.details::jsonb
      FROM (
        SELECT unnest($1::int[]) AS id,
               unnest($2::text[]) AS details
      ) v
      WHERE cu.id = v.id
    `, [ids, details]);

    updated += chunk.length;
    if (products.length > BATCH) {
      process.stdout.write(`\r  Processed ${Math.min(updated, products.length)} / ${products.length}...`);
    }
  }

  // Null out WPS products with no data
  await client.query(`
    UPDATE catalog_unified cu
    SET product_details = NULL
    FROM wps_catalog wps
    WHERE wps.sku = cu.vendor_sku
      AND cu.source_vendor = 'WPS'
      AND cu.is_active = true
      AND (wps.product_description IS NULL OR wps.product_description = '')
      AND (wps.product_features    IS NULL OR wps.product_features    = '')
  `);

  console.log(`\n  ✅ ${updated} WPS products updated\n`);
  return { updated, skipped: 0 };
}

// ── VTwin Pass — JS-based (handles stringified attributes + key variants) ─────
//
// FIX (was: pure SQL CASE with ::jsonb cast):
//   The scraper can store pdp_payload.attributes as a stringified JSON string,
//   causing product_details.attributes to land as a JSONB string value instead
//   of an object. The frontend workaround (JSON.parse if typeof==='string') is
//   removed once this script is re-run with --apply.
//
//   Key changes vs prior version:
//   • Data fetched in JS, not updated in a single SQL statement
//   • parseVtwinAttributes() handles object / string / double-string / null
//   • Falls back to pdp_payload.extra_attributes if pdp_payload.attributes absent
//   • Batch-writes via unnest just like processWPS
async function processVTwin(client) {
  console.log('── VTwin ────────────────────────────────────────────────────────');

  const { rows: products } = await client.query(`
    SELECT
      id,
      description,
      pdp_payload
    FROM catalog_unified
    WHERE source_vendor = 'VTWIN'
      AND is_active = true
      AND (
        (description IS NOT NULL AND description <> '')
        OR (pdp_payload IS NOT NULL AND pdp_payload <> '{}')
      )
  `);

  console.log(`  ${products.length} VTwin products with source data`);

  // Tally what we have in the raw data
  let hasDesc = 0, hasAttrs = 0, hasTechNote = 0, attrWasString = 0;

  const prepared = products.map(p => {
    const desc    = p.description?.trim() || null;
    const payload = p.pdp_payload || {};

    // Prefer 'attributes', fall back to 'extra_attributes'
    const rawAttrs = payload.attributes ?? payload.extra_attributes ?? null;

    // Track how many were stringified (for reporting)
    if (typeof rawAttrs === 'string' && rawAttrs.trim()) attrWasString++;

    const attrs    = parseVtwinAttributes(rawAttrs);
    const techNote = payload.tech_note?.trim() || null;

    if (desc)     hasDesc++;
    if (attrs)    hasAttrs++;
    if (techNote) hasTechNote++;

    const details = {};
    if (desc)     details.description = desc;
    if (attrs)    details.attributes  = attrs;
    if (techNote) details.tech_note   = techNote;

    return {
      id:      p.id,
      details: Object.keys(details).length > 0 ? details : null,
    };
  });

  console.log(`  Has description: ${hasDesc}`);
  console.log(`  Has attributes:  ${hasAttrs}  (${attrWasString} were stringified — now fixed)`);
  console.log(`  Has tech_note:   ${hasTechNote}`);

  if (DRY_RUN) {
    // Show a few samples including an attrs example if available
    const withAttrs = prepared.filter(p => p.details?.attributes);
    if (withAttrs.length > 0) {
      const ex = withAttrs[0];
      const keys = Object.keys(ex.details.attributes).slice(0, 3).join(', ');
      console.log(`  Sample attrs (id=${ex.id}): { ${keys} }`);
    }
    console.log(`  ⚠️  DRY RUN — would populate product_details for ${prepared.filter(p => p.details).length} VTwin products\n`);
    return { updated: 0, skipped: 0 };
  }

  // Batch write
  const BATCH = 500;
  let updated = 0;

  for (let i = 0; i < prepared.length; i += BATCH) {
    const chunk = prepared.slice(i, i + BATCH);
    const ids     = chunk.map(r => r.id);
    const details = chunk.map(r => JSON.stringify(r.details));

    await client.query(`
      UPDATE catalog_unified cu
      SET product_details = v.details::jsonb
      FROM (
        SELECT unnest($1::int[]) AS id,
               unnest($2::text[]) AS details
      ) v
      WHERE cu.id = v.id
    `, [ids, details]);

    updated += chunk.length;
    if (prepared.length > BATCH) {
      process.stdout.write(`\r  Processed ${Math.min(updated, prepared.length)} / ${prepared.length}...`);
    }
  }

  // Null out VTwin products with no data
  await client.query(`
    UPDATE catalog_unified
    SET product_details = NULL
    WHERE source_vendor = 'VTWIN'
      AND is_active = true
      AND (description IS NULL OR description = '')
      AND (pdp_payload IS NULL OR pdp_payload = '{}')
  `);

  console.log(`\n  ✅ ${updated} VTwin products updated\n`);
  return { updated, skipped: 0 };
}

// ── Coverage report ───────────────────────────────────────────────────────────
async function reportCoverage(client) {
  const { rows } = await client.query(`
    SELECT
      source_vendor,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE product_details IS NOT NULL)                              AS has_details,
      COUNT(*) FILTER (WHERE product_details ? 'features')                             AS has_features,
      COUNT(*) FILTER (WHERE product_details ? 'description')                          AS has_description,
      COUNT(*) FILTER (WHERE product_details ? 'attributes')                           AS has_attributes,
      COUNT(*) FILTER (WHERE product_details ? 'tech_note')                            AS has_tech_note
    FROM catalog_unified
    WHERE is_active = true
    GROUP BY source_vendor
    ORDER BY source_vendor
  `);

  console.log('── Coverage after build ─────────────────────────────────────────');
  console.log('  Vendor  Total   Details  Features  Desc  Attrs  TechNote');
  for (const r of rows) {
    const pct = ((r.has_details / r.total) * 100).toFixed(0);
    console.log(
      `  ${r.source_vendor.padEnd(6)}  ${String(r.total).padStart(5)}  ` +
      `${String(r.has_details).padStart(5)} (${pct}%)  ` +
      `${String(r.has_features).padStart(5)}  ` +
      `${String(r.has_description).padStart(5)}  ` +
      `${String(r.has_attributes).padStart(5)}  ` +
      `${String(r.has_tech_note).padStart(5)}`
    );
  }

  const { rows: [total] } = await client.query(`
    SELECT
      COUNT(*) AS all_products,
      COUNT(*) FILTER (WHERE product_details IS NOT NULL) AS with_details
    FROM catalog_unified WHERE is_active = true
  `);
  const overallPct = ((total.with_details / total.all_products) * 100).toFixed(1);
  console.log(`\n  Overall: ${total.with_details} / ${total.all_products} active products have details (${overallPct}%)\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧 Build Product Details — ${DRY_RUN ? 'DRY RUN' : '⚠️  APPLYING'}${VENDOR ? ` · vendor=${VENDOR}` : ''}\n`);

  const client = await pool.connect();
  try {
    if (!DRY_RUN) {
      await ensureColumn(client);
    } else {
      console.log('  (Dry run — column migration skipped)\n');
    }

    const vendors = VENDOR ? [VENDOR] : ['PU', 'WPS', 'VTWIN'];

    for (const v of vendors) {
      if (v === 'PU')    await processPU(client);
      if (v === 'WPS')   await processWPS(client);
      if (v === 'VTWIN') await processVTwin(client);
    }

    if (!DRY_RUN) {
      await reportCoverage(client);
    }

    if (DRY_RUN) {
      console.log(`⚠️  Dry run complete. Pass --apply to write product_details.\n`);
    } else {
      console.log(`✅ Done. Re-run after each vendor ingest to keep product_details current.\n`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
