#!/usr/bin/env node
/**
 * restore_from_typesense_snapshot.mjs
 *
 * Typesense is a separate service from Postgres -- the TRUNCATE that wiped
 * catalog_unified never touched it. Its "products" collection was built
 * 2026-07-17 (the day before the incident) with 90,483 documents, matching
 * the historical "90,483 active rows" figure from HANDOFF_LOG exactly. It
 * still has display_category, display_subcategory, display_subcategory_detail,
 * canonical_sku, oem_part_number, oem_numbers, full fitment fields, and era
 * flags -- i.e. a near-complete pre-incident snapshot of everything that was
 * lost, keyed by sku (which matches catalog_unified.sku exactly for all
 * three vendors: raw digits for PU, "WPS-" prefix, "VT-" prefix).
 *
 * This supersedes restore_display_category_full.mjs's regex-based guessing
 * for every row that has a Typesense match (the vast majority of the active
 * catalog) -- exact historical data beats reconstructed approximation. Rows
 * with no Typesense match (new products added after 2026-07-17, or inactive
 * rows never indexed) keep whatever the regex classifier assigned.
 *
 * Restores in one pass:
 *   - display_category, display_subcategory, display_subcategory_detail
 *   - oem_part_number, oem_numbers
 *   - fitment_year_start/end, fitment_hd_families/models/codes,
 *     fitment_other_makes, is_harley_fitment, is_universal
 *   - era_* flags (10 columns)
 *   - canonical_product_id (via canonical_sku -> canonical_products.id lookup)
 *
 * Usage:
 *   node restore_from_typesense_snapshot.mjs            # dry run
 *   node restore_from_typesense_snapshot.mjs --apply    # writes changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const EXPORT_PATH = path.join(__dirname, '../data/recovery/typesense_export.jsonl');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const ERA_FIELDS = [
  'era_flathead', 'era_knucklehead', 'era_panhead', 'era_shovelhead', 'era_ironhead',
  'era_evolution', 'era_evo_sportster', 'era_twin_cam', 'era_milwaukee8', 'era_chopper',
];

async function main() {
  if (!fs.existsSync(EXPORT_PATH)) {
    console.error(`Missing ${EXPORT_PATH} -- run the Typesense export first.`);
    process.exit(1);
  }

  const lines = fs.readFileSync(EXPORT_PATH, 'utf-8').split('\n').filter(Boolean);
  console.log(`Loaded ${lines.length} Typesense documents.`);

  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT id, sku FROM catalog_unified`);
    const skuToId = new Map(existing.rows.map((r) => [r.sku, r.id]));
    console.log(`catalog_unified has ${skuToId.size} rows to match against.`);

    const canon = await client.query(`SELECT id, canonical_sku FROM canonical_products WHERE canonical_sku IS NOT NULL`);
    const canonSkuToId = new Map(canon.rows.map((r) => [r.canonical_sku, r.id]));
    console.log(`canonical_products has ${canonSkuToId.size} skus to link against.`);

    let matched = 0, unmatched = 0, canonicalLinked = 0;
    const unmatchedSample = [];
    const updates = [];

    for (const line of lines) {
      const doc = JSON.parse(line);
      const cuId = skuToId.get(doc.sku);
      if (!cuId) {
        unmatched++;
        if (unmatchedSample.length < 15) unmatchedSample.push(doc.sku);
        continue;
      }
      matched++;
      const canonicalProductId = doc.canonical_sku ? canonSkuToId.get(doc.canonical_sku) ?? null : null;
      if (canonicalProductId) canonicalLinked++;

      updates.push({
        id: cuId,
        display_category: doc.display_category ?? null,
        display_subcategory: doc.display_subcategory ?? null,
        display_subcategory_detail: doc.display_subcategory_detail ?? null,
        oem_part_number: doc.oem_part_number ?? null,
        oem_numbers: doc.oem_numbers && doc.oem_numbers.length ? doc.oem_numbers : null,
        fitment_year_start: doc.fitment_year_start ?? null,
        fitment_year_end: doc.fitment_year_end ?? null,
        fitment_hd_families: doc.fitment_hd_families && doc.fitment_hd_families.length ? doc.fitment_hd_families : null,
        fitment_hd_models: doc.fitment_hd_models && doc.fitment_hd_models.length ? doc.fitment_hd_models : null,
        fitment_hd_codes: doc.fitment_hd_codes && doc.fitment_hd_codes.length ? doc.fitment_hd_codes : null,
        fitment_other_makes: doc.fitment_other_makes && doc.fitment_other_makes.length ? doc.fitment_other_makes : null,
        is_harley_fitment: doc.is_harley_fitment ?? false,
        is_universal: doc.is_universal ?? false,
        canonical_product_id: canonicalProductId,
        era: ERA_FIELDS.map((f) => doc[f] ?? false),
      });
    }

    console.log(`\n=== Match report ===`);
    console.log(`  Matched (will be restored): ${matched}`);
    console.log(`  Unmatched (no current catalog_unified row with this sku): ${unmatched}`);
    console.log(`  Canonical product links resolved: ${canonicalLinked} / ${matched}`);
    if (unmatchedSample.length) {
      console.log(`  Sample unmatched skus: ${unmatchedSample.join(', ')}`);
    }

    const withDetail = updates.filter((u) => u.display_subcategory_detail).length;
    const withFitment = updates.filter((u) => u.fitment_year_start !== null).length;
    const withOem = updates.filter((u) => u.oem_part_number).length;
    console.log(`\n  Of matched rows: ${withDetail} get subcategory detail, ${withFitment} get fitment years, ${withOem} get OEM part number`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    console.log('\nApplying (single transaction)...');
    await client.query('BEGIN');
    let done = 0, errors = 0;
    for (const u of updates) {
      try {
        await client.query('SAVEPOINT row_sp');
        await client.query(
          `UPDATE catalog_unified SET
            display_category = $1, display_subcategory = $2, display_subcategory_detail = $3,
            oem_part_number = COALESCE($4, oem_part_number),
            oem_numbers = COALESCE($5, oem_numbers),
            fitment_year_start = $6, fitment_year_end = $7,
            fitment_hd_families = $8, fitment_hd_models = $9, fitment_hd_codes = $10, fitment_other_makes = $11,
            is_harley_fitment = $12, is_universal = $13,
            canonical_product_id = COALESCE($14, canonical_product_id),
            era_flathead = $15, era_knucklehead = $16, era_panhead = $17, era_shovelhead = $18, era_ironhead = $19,
            era_evolution = $20, era_evo_sportster = $21, era_twin_cam = $22, era_milwaukee8 = $23, era_chopper = $24,
            updated_at = now()
          WHERE id = $25`,
          [
            u.display_category, u.display_subcategory, u.display_subcategory_detail,
            u.oem_part_number, u.oem_numbers,
            u.fitment_year_start, u.fitment_year_end,
            u.fitment_hd_families, u.fitment_hd_models, u.fitment_hd_codes, u.fitment_other_makes,
            u.is_harley_fitment, u.is_universal,
            u.canonical_product_id,
            ...u.era,
            u.id,
          ]
        );
        await client.query('RELEASE SAVEPOINT row_sp');
        done++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`  Error on catalog_unified id ${u.id}:`, e.message);
      }
      if ((done + errors) % 5000 === 0) process.stdout.write(`\r  ${done} updated, ${errors} errors`);
    }
    console.log(`\n  ${done} updated, ${errors} errors`);
    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Rolled back due to error:', err);
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
