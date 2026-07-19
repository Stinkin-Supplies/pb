/**
 * enrich_vtwin_from_scrape.mjs
 *
 * Full enrichment of the VTwin catalog from the completed scraper output.
 * Safe to re-run at any time — all updates are upsert/targeted.
 *
 * What this does:
 *   1. Upsert raw scrape data → vtwin_scrape_data
 *   2. Enrich catalog_unified  (description, msrp, oem_part_number, uom,
 *                               country_of_origin, manufacturer_brand,
 *                               special_instructions, pdp_payload)
 *   3. Enrich vtwin_catalog    (oem_xref1, manufacturer, country_of_origin,
 *                               this_yr_catpage)
 *   4. Upsert oem_no → catalog_oem_crossref
 *   5. Delete + reinsert fitment_source='vtwin_partial' rows
 *   6. Re-run VTwin OEM bridge (3 passes → catalog_fitment_v2)
 *
 * Usage:
 *   node scripts/ingest/enrich_vtwin_from_scrape.mjs [path/to/csv] [--dry-run]
 */

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const DRY_RUN  = process.argv.includes('--dry-run');
const CSV_PATH = process.argv.find(a => a.endsWith('.csv'))
  || './scripts/ingest/vtwin_fitment_missing.csv';
const DB_URL   = process.env.CATALOG_DATABASE_URL
  || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';

const CURRENT_YEAR = new Date().getFullYear();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bar(label, n, total) {
  const pct    = Math.round((n / total) * 100);
  const filled = Math.round(pct / 5);
  const b      = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r[${b}] ${pct}% — ${n}/${total}  ${label}    `);
  if (n === total) process.stdout.write('\n');
}

function parsePrice(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

function parseCatalogPage(raw) {
  if (!raw) return null;
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) ? null : n;
}

function parseExtraAttributes(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Fitment parser ───────────────────────────────────────────────────────────

function parseFitmentRaw(raw) {
  if (!raw?.trim()) return [];
  const results = [];
  for (const segment of raw.split('|')) {
    const seg = segment.trim();
    if (!seg) continue;
    if (/^(replacement|custom|application|fits|use with|note)/i.test(seg)) continue;
    const m = seg.match(/^([A-Z][A-Z0-9]*)\s+(\d{4})(?:-(\d{4}|UP))?\s*(.*)?$/i);
    if (!m) continue;
    const model_code   = m[1];
    const year_start   = parseInt(m[2], 10);
    const year_end_raw = m[3];
    const qualifier    = (m[4] || '').trim().replace(/["]+/g, '').trim();
    let year_end;
    if (!year_end_raw)            year_end = year_start;
    else if (/^up$/i.test(year_end_raw)) year_end = CURRENT_YEAR;
    else                          year_end = parseInt(year_end_raw, 10);
    if (year_start < 1900 || year_start > CURRENT_YEAR + 2) continue;
    if (year_end < year_start) continue;
    results.push({ model_code, year_start, year_end, notes: qualifier || null });
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  VTwin Full Enrichment from Scrape Data`);
  console.log(`    CSV:     ${CSV_PATH}`);
  console.log(`    Dry run: ${DRY_RUN}\n`);

  // ── Load & deduplicate CSV ──
  const raw     = fs.readFileSync(CSV_PATH, 'utf8');
  const allRows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });

  const skuMap = new Map();
  for (const row of allRows) {
    const sku = row.sku?.trim();
    if (!sku || row.source === 'not_found' || row.error) continue;
    if (!skuMap.has(sku)) skuMap.set(sku, row);
  }
  const rows = [...skuMap.values()];

  console.log(`📄  CSV rows: ${allRows.length}  →  unique valid SKUs: ${rows.length}`);
  console.log(`    Has description:      ${rows.filter(r => r.description?.trim()).length}`);
  console.log(`    Has price:            ${rows.filter(r => r.price?.trim()).length}`);
  console.log(`    Has oem_no:           ${rows.filter(r => r.oem_no?.trim()).length}`);
  console.log(`    Has manufacturer:     ${rows.filter(r => r.manufacturer?.trim()).length}`);
  console.log(`    Has finish:           ${rows.filter(r => r.finish?.trim()).length}`);
  console.log(`    Has extra_attributes: ${rows.filter(r => r.extra_attributes?.trim()).length}`);
  console.log(`    Has fitment_raw:      ${rows.filter(r => r.fitment_raw?.trim()).length}`);
  console.log();

  if (DRY_RUN) {
    console.log('[DRY RUN] No DB writes. Remove --dry-run to execute.\n');
    return;
  }

  const pool   = new pg.Pool({ connectionString: DB_URL });
  const client = await pool.connect();

  try {

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1 — Upsert vtwin_scrape_data
    // ════════════════════════════════════════════════════════════════════════
    console.log('━━━ Step 1/6: Upsert vtwin_scrape_data ━━━');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vtwin_scrape_data (
        sku               TEXT PRIMARY KEY,
        product_name      TEXT,
        product_url       TEXT,
        price_raw         TEXT,
        oem_no            TEXT,
        fitment_raw       TEXT,
        description       TEXT,
        uom               TEXT,
        finish            TEXT,
        manufacturer      TEXT,
        origin            TEXT,
        catalog_pages     TEXT,
        replacement_items TEXT,
        tech_note         TEXT,
        extra_attributes  TEXT,
        scraped_at        TIMESTAMPTZ DEFAULT now()
      )
    `);

    let s1 = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(`
        INSERT INTO vtwin_scrape_data (
          sku, product_name, product_url, price_raw, oem_no, fitment_raw,
          description, uom, finish, manufacturer, origin, catalog_pages,
          replacement_items, tech_note, extra_attributes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (sku) DO UPDATE SET
          product_name      = EXCLUDED.product_name,
          product_url       = EXCLUDED.product_url,
          price_raw         = EXCLUDED.price_raw,
          oem_no            = EXCLUDED.oem_no,
          fitment_raw       = EXCLUDED.fitment_raw,
          description       = EXCLUDED.description,
          uom               = EXCLUDED.uom,
          finish            = EXCLUDED.finish,
          manufacturer      = EXCLUDED.manufacturer,
          origin            = EXCLUDED.origin,
          catalog_pages     = EXCLUDED.catalog_pages,
          replacement_items = EXCLUDED.replacement_items,
          tech_note         = EXCLUDED.tech_note,
          extra_attributes  = EXCLUDED.extra_attributes,
          scraped_at        = now()
      `, [
        r.sku,
        r.product_name   || null, r.product_url  || null, r.price        || null,
        r.oem_no         || null, r.fitment_raw  || null, r.description  || null,
        r.uom            || null, r.finish        || null, r.manufacturer || null,
        r.origin         || null, r.catalog_pages || null, r.replacement_items || null,
        r.tech_note      || null, r.extra_attributes || null,
      ]);
      s1++;
      if (i % 500 === 0 || i === rows.length - 1) bar('scrape_data', i + 1, rows.length);
    }
    console.log(`   ✓ ${s1} rows upserted into vtwin_scrape_data\n`);


    // ════════════════════════════════════════════════════════════════════════
    // STEP 2 — Enrich catalog_unified
    // ════════════════════════════════════════════════════════════════════════
    console.log('━━━ Step 2/6: Enrich catalog_unified ━━━');

    // Load existing catalog_unified VTwin rows into memory for pdp_payload merge
    const { rows: cuRows } = await client.query(`
      SELECT id, sku, pdp_payload
      FROM catalog_unified
      WHERE source_vendor = 'VTWIN'
    `);
    // Strip VT- prefix for lookup
    const cuMap = new Map(cuRows.map(r => [r.sku.replace(/^VT-/, ''), { id: r.id, pdp: r.pdp_payload }]));
    console.log(`   Loaded ${cuMap.size} VTwin rows from catalog_unified`);

    let s2_updated = 0;
    let s2_skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r   = rows[i];
      const cu  = cuMap.get(r.sku);
      if (!cu) { s2_skipped++; bar('catalog_unified', i + 1, rows.length); continue; }

      // Build updated pdp_payload by merging into existing
      const existingPdp = cu.pdp || {};
      const newPdp = { ...existingPdp };
      if (r.finish?.trim())             newPdp.finish             = r.finish.trim();
      if (r.replacement_items?.trim())  newPdp.replacement_items  = r.replacement_items.trim();
      if (r.catalog_pages?.trim())      newPdp.catalog_pages      = r.catalog_pages.trim();
      if (r.tech_note?.trim())          newPdp.tech_note           = r.tech_note.trim();
      const extraAttrs = parseExtraAttributes(r.extra_attributes);
      if (extraAttrs)                   newPdp.attributes         = extraAttrs;

      await client.query(`
        UPDATE catalog_unified SET
          description         = COALESCE(NULLIF($2,''), description),
          msrp                = COALESCE($3, msrp),
          oem_part_number     = COALESCE(NULLIF($4,''), oem_part_number),
          uom                 = COALESCE(NULLIF($5,''), uom),
          country_of_origin   = COALESCE(NULLIF($6,''), country_of_origin),
          manufacturer_brand  = COALESCE(NULLIF($7,''), manufacturer_brand),
          special_instructions = CASE
            WHEN $8::text IS NOT NULL AND $8::text <> '' THEN $8::text
            ELSE special_instructions
          END,
          pdp_payload         = $9::jsonb,
          updated_at          = now()
        WHERE id = $1
      `, [
        cu.id,
        r.description?.trim()   || null,
        parsePrice(r.price),
        r.oem_no?.trim()        || null,
        r.uom?.trim()           || null,
        r.origin?.trim()        || null,
        r.manufacturer?.trim()  || null,
        r.tech_note?.trim()     || null,
        JSON.stringify(newPdp),
      ]);

      s2_updated++;
      if (i % 500 === 0 || i === rows.length - 1) bar('catalog_unified', i + 1, rows.length);
    }
    console.log(`   ✓ ${s2_updated} rows updated in catalog_unified`);
    console.log(`   ⚠  ${s2_skipped} SKUs not found in catalog_unified\n`);


    // ════════════════════════════════════════════════════════════════════════
    // STEP 3 — Enrich vtwin_catalog
    // ════════════════════════════════════════════════════════════════════════
    console.log('━━━ Step 3/6: Enrich vtwin_catalog ━━━');

    const { rows: vcRows } = await client.query(`SELECT id, sku FROM vtwin_catalog`);
    const vcMap = new Map(vcRows.map(r => [r.sku, r.id]));
    console.log(`   Loaded ${vcMap.size} rows from vtwin_catalog`);

    let s3_updated = 0, s3_skipped = 0;
    for (let i = 0; i < rows.length; i++) {
      const r  = rows[i];
      const id = vcMap.get(r.sku);
      if (!id) { s3_skipped++; bar('vtwin_catalog', i + 1, rows.length); continue; }

      await client.query(`
        UPDATE vtwin_catalog SET
          oem_xref1         = COALESCE(NULLIF($2,''), oem_xref1),
          manufacturer      = COALESCE(NULLIF($3,''), manufacturer),
          country_of_origin = COALESCE(NULLIF($4,''), country_of_origin),
          this_yr_catpage   = COALESCE($5, this_yr_catpage),
          updated_at        = now()
        WHERE id = $1
      `, [
        id,
        r.oem_no?.trim()        || null,
        r.manufacturer?.trim()  || null,
        r.origin?.trim()        || null,
        parseCatalogPage(r.catalog_pages),
      ]);

      s3_updated++;
      if (i % 500 === 0 || i === rows.length - 1) bar('vtwin_catalog', i + 1, rows.length);
    }
    console.log(`   ✓ ${s3_updated} rows updated in vtwin_catalog`);
    console.log(`   ⚠  ${s3_skipped} SKUs not found in vtwin_catalog\n`);


    // ════════════════════════════════════════════════════════════════════════
    // STEP 4 — Upsert oem_no → catalog_oem_crossref
    // ════════════════════════════════════════════════════════════════════════
    console.log('━━━ Step 4/6: Upsert catalog_oem_crossref ━━━');

    // Need catalog_unified id for the FK — reuse cuMap
    let s4_inserted = 0, s4_skipped = 0;
    const oemRows = rows.filter(r => r.oem_no?.trim());
    console.log(`   ${oemRows.length} SKUs have oem_no`);

    for (let i = 0; i < oemRows.length; i++) {
      const r  = oemRows[i];
      const cu = cuMap.get(r.sku);
      if (!cu) { s4_skipped++; bar('oem_crossref', i + 1, oemRows.length); continue; }

      // Normalize: strip leading A- (Eastern Motorcycle Parts convention)
      const oem_clean = r.oem_no.trim().replace(/^A-/i, '');

      await client.query(`
        INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
        VALUES ($1, $2, $3, 'vtwin_scrape')
        ON CONFLICT (sku, oem_number) DO UPDATE SET
          oem_manufacturer = COALESCE(EXCLUDED.oem_manufacturer, catalog_oem_crossref.oem_manufacturer),
          source_file      = EXCLUDED.source_file
      `, [
        'VT-' + r.sku,
        oem_clean,
        'Harley-Davidson',
      ]);

      // Also update oem_numbers[] on catalog_unified
      await client.query(`
        UPDATE catalog_unified
        SET oem_numbers = (
          SELECT array_agg(DISTINCT x ORDER BY x)
          FROM unnest(
            COALESCE(oem_numbers, '{}') || ARRAY[$2::text]
          ) x
        )
        WHERE id = $1
      `, [cu.id, oem_clean]);

      s4_inserted++;
      if (i % 200 === 0 || i === oemRows.length - 1) bar('oem_crossref', i + 1, oemRows.length);
    }
    console.log(`   ✓ ${s4_inserted} OEM numbers upserted into catalog_oem_crossref`);
    console.log(`   ✓ oem_numbers[] updated on catalog_unified`);
    console.log(`   ⚠  ${s4_skipped} SKUs not found in catalog_unified\n`);


    // ════════════════════════════════════════════════════════════════════════
    // STEP 5 — Fitment: delete vtwin_partial + reinsert
    // ════════════════════════════════════════════════════════════════════════
    console.log('━━━ Step 5/6: Rebuild vtwin_partial fitment ━━━');

    // Load harley_models
    const { rows: modelRows } = await client.query(
      `SELECT model_code, id FROM harley_models ORDER BY model_code`
    );
    const modelMap = new Map(modelRows.map(r => [r.model_code, r.id]));
    console.log(`   Loaded ${modelMap.size} model codes`);

    // Identify unknown model codes
    const unknownCodes = new Set();
    for (const row of rows) {
      for (const { model_code } of parseFitmentRaw(row.fitment_raw)) {
        if (!modelMap.has(model_code)) unknownCodes.add(model_code);
      }
    }
    if (unknownCodes.size > 0) {
      console.log(`   ⚠  Unknown model codes (skipped): ${[...unknownCodes].sort().join(', ')}`);
    }

    const { rowCount: deleted } = await client.query(
      `DELETE FROM catalog_fitment_v2 WHERE fitment_source = 'vtwin_partial'`
    );
    console.log(`   🗑  Cleared ${deleted} existing vtwin_partial fitment rows`);

    let s5_inserted = 0, s5_no_product = 0, s5_no_model = 0, s5_no_fitment = 0;
    const BATCH = 500;
    let batch = [];

    const flush = async () => {
      if (!batch.length) return;
      const placeholders = batch.map((_, i) => {
        const b = i * 5;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5})`;
      }).join(',');
      await client.query(`
        INSERT INTO catalog_fitment_v2
          (product_id, harley_model_id, year_start, year_end, fitment_source)
        VALUES ${placeholders}
        ON CONFLICT DO NOTHING
      `, batch.flat());
      s5_inserted += batch.length;
      batch = [];
    };

    for (let i = 0; i < rows.length; i++) {
      const row        = rows[i];
      const cu         = cuMap.get(row.sku);
      if (!cu) { s5_no_product++; continue; }

      const parsed = parseFitmentRaw(row.fitment_raw);
      if (!parsed.length) { s5_no_fitment++; continue; }

      for (const { model_code, year_start, year_end } of parsed) {
        const harley_model_id = modelMap.get(model_code);
        if (!harley_model_id) { s5_no_model++; continue; }
        batch.push([cu.id, harley_model_id, year_start, year_end, 'vtwin_partial']);
        if (batch.length >= BATCH) await flush();
      }
      if (i % 500 === 0 || i === rows.length - 1) bar('fitment rows', i + 1, rows.length);
    }
    await flush();

    console.log(`   ✓ ${s5_inserted} fitment rows inserted`);
    console.log(`   ⚠  Skipped — no catalog match: ${s5_no_product}`);
    console.log(`   ⚠  Skipped — unknown model:    ${s5_no_model}`);
    console.log(`   ⚠  Skipped — no fitment data:  ${s5_no_fitment}\n`);


    // ════════════════════════════════════════════════════════════════════════
    // STEP 6 — VTwin OEM bridge: re-run all 3 passes into catalog_fitment_v2
    // ════════════════════════════════════════════════════════════════════════
    console.log('━━━ Step 6/6: VTwin OEM bridge (3 passes) ━━━');

    // Pass 1 — direct OEM match + model code + year filter
    const { rowCount: p1 } = await client.query(`
      INSERT INTO catalog_fitment_v2
        (product_id, harley_model_id, year_start, year_end, fitment_source, confidence_score)
      SELECT DISTINCT
        cu.id,
        hm.id,
        hmy.year,
        hmy.year,
        'oem_catalog',
        0.92
      FROM catalog_unified cu
      JOIN catalog_oem_crossref cor
        ON cor.oem_number = ANY(cu.oem_numbers)
        OR cor.oem_number = replace(cu.oem_part_number, 'A-', '')
      JOIN oem_fitment of_ ON of_.oem_part_number = cor.oem_number
      JOIN harley_models hm ON hm.model_code = ANY(of_.model_codes)
      JOIN harley_model_years hmy
        ON hmy.model_id = hm.id
        AND hmy.year BETWEEN of_.year_start AND of_.year_end
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.is_active = true
        AND of_.year_start IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    console.log(`   Pass 1 (model code + year):    ${p1} rows`);

    // Pass 2 — fits_all_models universal
    const { rowCount: p2 } = await client.query(`
      INSERT INTO catalog_fitment_v2
        (product_id, harley_model_id, year_start, year_end, fitment_source, confidence_score)
      SELECT DISTINCT
        cu.id,
        hmy.model_id,
        hmy.year,
        hmy.year,
        'oem_catalog_universal',
        0.75
      FROM catalog_unified cu
      JOIN catalog_oem_crossref cor
        ON cor.oem_number = ANY(cu.oem_numbers)
        OR cor.oem_number = replace(cu.oem_part_number, 'A-', '')
      JOIN oem_fitment of_ ON of_.oem_part_number = cor.oem_number AND of_.fits_all_models = true
      JOIN harley_model_years hmy
        ON hmy.year BETWEEN of_.year_start AND of_.year_end
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.is_active = true
      ON CONFLICT DO NOTHING
    `);
    console.log(`   Pass 2 (fits_all_models):       ${p2} rows`);

    // Pass 3 — implied family from catalog filename
    const { rowCount: p3 } = await client.query(`
      INSERT INTO catalog_fitment_v2
        (product_id, harley_model_id, year_start, year_end, fitment_source, confidence_score)
      SELECT DISTINCT
        cu.id,
        hmy.model_id,
        hmy.year,
        hmy.year,
        'oem_catalog_family',
        0.80
      FROM catalog_unified cu
      JOIN catalog_oem_crossref cor
        ON cor.oem_number = ANY(cu.oem_numbers)
        OR cor.oem_number = replace(cu.oem_part_number, 'A-', '')
      JOIN oem_fitment of_ ON of_.oem_part_number = cor.oem_number
        AND of_.fits_all_models IS NOT TRUE
        AND of_.model_codes IS NULL
        AND of_.catalog_source IS NOT NULL
      JOIN harley_models hm ON (
        (of_.catalog_source ILIKE '%touring%'   AND hm.family ILIKE '%touring%')   OR
        (of_.catalog_source ILIKE '%softail%'   AND hm.family ILIKE '%softail%')   OR
        (of_.catalog_source ILIKE '%dyna%'      AND hm.family ILIKE '%dyna%')      OR
        (of_.catalog_source ILIKE '%sportster%' AND hm.family ILIKE '%sportster%') OR
        (of_.catalog_source ILIKE '%xl%'        AND hm.family ILIKE '%sportster%') OR
        (of_.catalog_source ILIKE '%fx%'        AND hm.family ILIKE '%fx%')
      )
      JOIN harley_model_years hmy
        ON hmy.model_id = hm.id
        AND hmy.year BETWEEN of_.year_start AND of_.year_end
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.is_active = true
      ON CONFLICT DO NOTHING
    `);
    console.log(`   Pass 3 (implied family):        ${p3} rows\n`);


    // ════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════════════════════════════════
    const { rows: [{ count: totalFitment }] } = await client.query(`
      SELECT COUNT(*) FROM catalog_fitment_v2
      WHERE fitment_source IN ('vtwin_partial','oem_catalog','oem_catalog_universal','oem_catalog_family')
    `);
    const { rows: [{ count: totalCrossref }] } = await client.query(`
      SELECT COUNT(*) FROM catalog_oem_crossref WHERE source_file = 'vtwin_scrape'
    `);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅  DONE');
    console.log(`    vtwin_scrape_data upserted:        ${s1}`);
    console.log(`    catalog_unified enriched:          ${s2_updated}`);
    console.log(`    vtwin_catalog enriched:            ${s3_updated}`);
    console.log(`    catalog_oem_crossref upserted:     ${s4_inserted}  (source=vtwin_scrape)`);
    console.log(`    vtwin_partial fitment rows:        ${s5_inserted}`);
    console.log(`    OEM bridge new rows (3 passes):    ${p1 + p2 + p3}`);
    console.log(`      └ pass1 oem_catalog:             ${p1}`);
    console.log(`      └ pass2 oem_catalog_universal:   ${p2}`);
    console.log(`      └ pass3 oem_catalog_family:      ${p3}`);
    console.log(`    Total VTwin-related fitment rows:  ${totalFitment}`);
    console.log(`    Total vtwin_scrape OEM crossrefs:  ${totalCrossref}`);
    if (unknownCodes.size > 0) {
      console.log(`\n    ⚠  ${unknownCodes.size} unknown model codes were skipped from fitment.`);
      console.log(`       ${[...unknownCodes].sort().join(', ')}`);
    }
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Next steps:');
    console.log('  node scripts/ingest/build_variant_groups.cjs');
    console.log('  node scripts/ingest/index_unified.js --recreate\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
