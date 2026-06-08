/**
 * import_vtwin_fitment_partial.mjs
 * 
 * Ingests vtwin_fitment_partial.csv into:
 *   1. catalog_unified / catalog_products — upserts product data for new VTwin SKUs
 *   2. catalog_fitment_v2 — structured fitment rows per SKU × model × year
 * 
 * Usage:
 *   node import_vtwin_fitment_partial.mjs --dry      # preview only
 *   node import_vtwin_fitment_partial.mjs            # live run
 * 
 * Dedup strategy: CSV has 20,340 rows but only 6,677 unique SKUs.
 * All duplicates are byte-identical — we keep the first occurrence.
 * 
 * Fitment parsing:
 *   - "MODEL YYYY-YYYY | MODEL YYYY-UP | ..." → structured rows
 *   - "All models" / "All"                    → universal flag, no fitment rows
 *   - "Custom application…" / "Replacement…"  → tech_note only, no fitment rows
 *   - null / blank                            → no fitment rows
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

// ── Config ────────────────────────────────────────────────────────────────────

const DB_URL = process.env.CATALOG_DATABASE_URL
  || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';

const CSV_PATH = process.env.VTWIN_CSV
  || path.resolve('./vtwin_fitment_partial.csv');

const DRY_RUN      = process.argv.includes('--dry');
const SKIP_EXISTING = process.argv.includes('--skip-existing');
const UP_YEAR = 2026;   // "UP" in year ranges resolves to this
const BATCH   = 500;    // INSERT batch size

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanPrice(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Classify a fitment_raw string.
 * Returns: 'structured' | 'universal' | 'custom_text' | 'none'
 */
function classifyFitment(raw) {
  if (!raw || String(raw).trim() === '') return 'none';
  const s = String(raw).trim();
  if (s === 'All models' || s === 'All') return 'universal';
  if (/^(Custom|Replacement|All W)/i.test(s)) return 'custom_text';
  return 'structured';
}

/**
 * Parse "MODEL YYYY-YYYY | MODEL YYYY-UP | ..." into an array of objects.
 * Segments that don't match the pattern are silently skipped.
 */
function parseFitmentRaw(sku, raw) {
  if (classifyFitment(raw) !== 'structured') return [];
  const SEG = /^([A-Z][A-Z0-9\-]*)\s+(\d{4})-(\d{4}|UP)$/;
  return String(raw)
    .split('|')
    .map(s => s.trim())
    .flatMap(seg => {
      const m = seg.match(SEG);
      if (!m) return [];
      return [{
        sku,
        model_code: m[1],
        year_start: parseInt(m[2], 10),
        year_end:   m[3] === 'UP' ? UP_YEAR : parseInt(m[3], 10),
      }];
    });
}

/** Chunk an array into batches of size n */
function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Minimal progress logger */
function log(msg) { process.stdout.write(msg + '\n'); }

// ── Progress bar ──────────────────────────────────────────────────────────────

function progressBar(label, current, total, extra = '') {
  const width = 30;
  const pct = total === 0 ? 1 : current / total;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const pctStr = String(Math.round(pct * 100)).padStart(3) + '%';
  process.stdout.write(`\r  ${label} [${bar}] ${pctStr}  ${current.toLocaleString()}/${total.toLocaleString()}  ${extra}    `);
  if (current >= total) process.stdout.write('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(DRY_RUN ? '🔍  DRY RUN — no writes' : '🚀  LIVE RUN');
  if (SKIP_EXISTING) log('⏭️   --skip-existing: will skip SKUs already in catalog_unified');
  log(`📂  CSV: ${CSV_PATH}`);

  // ── 1. Load & deduplicate CSV ────────────────────────────────────────────

  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const allRows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  log(`\n📄  Raw rows: ${allRows.length.toLocaleString()}`);

  const seen = new Set();
  const rows = [];
  const skuToOem = new Map(); // bare_sku → oem_number
  for (const r of allRows) {
    if (!seen.has(r.sku)) { seen.add(r.sku); rows.push(r); }
    if (r.oem_no && r.oem_no.trim() && !skuToOem.has(r.sku)) {
      skuToOem.set(r.sku, r.oem_no.trim());
    }
  }
  log(`✅  After dedup: ${rows.length.toLocaleString()} unique SKUs (removed ${(allRows.length - rows.length).toLocaleString()} duplicates)`);
  log(`🔑  OEM numbers found: ${skuToOem.size.toLocaleString()} SKUs have OEM data`);

  // ── 1b. Optional: skip SKUs already in DB ───────────────────────────────

  let skippedExisting = 0;
  if (SKIP_EXISTING) {
    const pool0 = new pg.Pool({ connectionString: DB_URL });
    const c0 = await pool0.connect();
    const skuList0 = rows.map(r => r.sku);
    const res0 = await c0.query(
      `SELECT sku FROM catalog_unified WHERE source_vendor = 'VTWIN' AND sku = ANY($1::text[])`,
      [skuList0]
    );
    c0.release();
    await pool0.end();
    const existingSkus = new Set(res0.rows.map(r => r.sku));
    const before = rows.length;
    rows.splice(0, rows.length, ...rows.filter(r => !existingSkus.has(r.sku)));
    skippedExisting = before - rows.length;
    log(`⏭️   Skipped ${skippedExisting.toLocaleString()} existing VTWIN SKUs — ${rows.length.toLocaleString()} new SKUs to process`);
    if (rows.length === 0) {
      log('\n✅  Nothing new to import.');
      process.exit(0);
    }
  }

  // ── 2. Parse fitment ────────────────────────────────────────────────────

  let fitmentRows = [];
  let universalCount = 0;
  let customTextCount = 0;
  let noFitmentCount = 0;

  for (const r of rows) {
    const cls = classifyFitment(r.fitment_raw);
    if (cls === 'structured') {
      fitmentRows.push(...parseFitmentRaw(r.sku, r.fitment_raw));
    } else if (cls === 'universal') {
      universalCount++;
    } else if (cls === 'custom_text') {
      customTextCount++;
    } else {
      noFitmentCount++;
    }
  }

  const structuredCount = rows.length - universalCount - customTextCount - noFitmentCount;
  log(`\n📊  Fitment breakdown:`);
  log(`    Structured (parseable):  ${structuredCount.toLocaleString()} SKUs → ${fitmentRows.length.toLocaleString()} fitment rows`);
  log(`    Universal ("All models"): ${universalCount.toLocaleString()} SKUs`);
  log(`    Custom text (skipped):   ${customTextCount.toLocaleString()} SKUs`);
  log(`    No fitment data:         ${noFitmentCount.toLocaleString()} SKUs`);

  if (DRY_RUN) {
    log('\n✋  Dry run complete — exiting before any DB writes.');
    log('\nTo run live:  node import_vtwin_fitment_partial.mjs');
    process.exit(0);
  }

  // ── 3. Connect to DB ────────────────────────────────────────────────────

  const pool = new pg.Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  log('\n🔌  Connected to DB');

  try {
    await client.query('BEGIN');

    // ── 4. Upsert into catalog_products (vtwin staging table) ──────────

    // First, figure out which SKUs already exist in catalog_unified (source_vendor='VTWIN')
    // so we can skip or update rather than blindly insert.
    //
    // VTwin SKUs in catalog_unified are stored as-is (original part numbers like "16-1839").
    // The "700001+" numbering in MasterRef is the internal surrogate id — not the SKU.

    log('\n📥  Upserting products into catalog_unified…');

    // Pre-load which bare SKUs already have an active VT- prefixed counterpart.
    // For those, we upsert using the VT- prefixed SKU so we hit the canonical row.
    // For SKUs with no VT- counterpart, we use the bare SKU as before.
    const skuListForCheck = rows.map(r => r.sku);
    const prefixCheckRes = await client.query(`
      SELECT REPLACE(sku, 'VT-', '') as bare_sku
      FROM catalog_unified
      WHERE source_vendor = 'VTWIN'
        AND is_active = true
        AND sku LIKE 'VT-%'
        AND REPLACE(sku, 'VT-', '') = ANY($1::text[])
    `, [skuListForCheck]);
    const hasVtPrefix = new Set(prefixCheckRes.rows.map(r => r.bare_sku));
    log(`    ${hasVtPrefix.size.toLocaleString()} SKUs have active VT- prefixed counterpart — will upsert with prefix`);

    let insertedProducts = 0;
    let updatedProducts  = 0;
    let processedProducts = 0;

    const productBatches = chunks(rows, BATCH);
    for (const batch of productBatches) {
      for (const r of batch) {
        const price = cleanPrice(r.price);
        const fitmentClass = classifyFitment(r.fitment_raw);

        // Build tech_note: include custom fitment text + any existing tech_note
        const techParts = [];
        if (fitmentClass === 'custom_text' && r.fitment_raw) techParts.push(r.fitment_raw.trim());
        if (r.tech_note && r.tech_note.trim()) techParts.push(r.tech_note.trim());
        const techNote = techParts.length ? techParts.join(' | ') : null;
        const isUniversal = fitmentClass === 'universal';

        // Use VT- prefixed SKU if a canonical prefixed row exists, bare SKU otherwise
        const upsertSku = hasVtPrefix.has(r.sku) ? 'VT-' + r.sku : r.sku;

        const res = await client.query(`
          INSERT INTO catalog_unified (
            source_vendor, sku, name, description,
            msrp, computed_price,
            brand, country_of_origin,
            special_instructions,
            fits_all_models,
            is_active, in_stock, in_vtwinmfg
          ) VALUES (
            'VTWIN', $1, $2, $3,
            $4, $4,
            $5, $6,
            $7,
            $8,
            true, true, true
          )
          ON CONFLICT (sku) DO UPDATE SET
            name                 = EXCLUDED.name,
            description          = EXCLUDED.description,
            msrp                 = COALESCE(EXCLUDED.msrp, catalog_unified.msrp),
            computed_price       = COALESCE(EXCLUDED.computed_price, catalog_unified.computed_price),
            brand                = COALESCE(EXCLUDED.brand, catalog_unified.brand),
            country_of_origin    = COALESCE(EXCLUDED.country_of_origin, catalog_unified.country_of_origin),
            special_instructions = COALESCE(EXCLUDED.special_instructions, catalog_unified.special_instructions),
            fits_all_models      = CASE WHEN EXCLUDED.fits_all_models = true THEN true ELSE catalog_unified.fits_all_models END,
            in_vtwinmfg          = true,
            updated_at           = NOW()
          RETURNING (xmax = 0) AS inserted
        `, [
          upsertSku,
          r.product_name || r.sku,
          r.description  || null,
          price,
          r.manufacturer || null,
          r.origin       || null,
          techNote,
          isUniversal,
        ]);

        if (res.rows[0]?.inserted) insertedProducts++;
        else updatedProducts++;
        processedProducts++;
        progressBar('products', processedProducts, rows.length, `+${insertedProducts} new`);
      }
    }
    log(`    Inserted: ${insertedProducts.toLocaleString()} new  |  Updated: ${updatedProducts.toLocaleString()} existing`);

    // ── 5. Resolve SKU → catalog_unified.id ───────────────────────────
    //
    // VTwin SKUs in catalog_unified exist in two forms:
    //   bare:    "10-0030"   (imported via this script — no prefix)
    //   prefixed: "VT-10-0030" (imported via the main catalog merge)
    // We try both forms and map the CSV bare SKU → product id either way.

    log('\n🔗  Resolving SKU → product IDs…');
    const skuList = rows.map(r => r.sku);
    const skuListPrefixed = skuList.map(s => 'VT-' + s);

    const idRes = await client.query(`
      SELECT id, sku FROM catalog_unified
      WHERE source_vendor = 'VTWIN'
        AND is_active = true
        AND (sku = ANY($1::text[]) OR sku = ANY($2::text[]))
    `, [skuList, skuListPrefixed]);

    // Map bare CSV sku → id, preferring prefixed (VT-) rows over bare rows.
    // Prefixed rows are the canonical catalog entries; bare rows are legacy orphans.
    const skuToId = new Map();
    for (const row of idRes.rows) {
      const bareSku = row.sku.startsWith('VT-') ? row.sku.slice(3) : row.sku;
      // Only overwrite if we don't already have a prefixed entry for this SKU
      if (!skuToId.has(bareSku) || row.sku.startsWith('VT-')) {
        skuToId.set(bareSku, row.id);
      }
    }
    log(`    Resolved ${skuToId.size.toLocaleString()} SKUs (bare + VT- prefix match, active only)`);

    // ── 6. Resolve model_code → harley_model_years rows ────────────────
    //
    // catalog_fitment_v2 stores (product_id, model_year_id) pairs.
    // We need to expand each (model_code, year_start, year_end) range into
    // individual harley_model_years rows.

    // Alias map: VTwin uses shorthand/generic codes that expand to multiple specific models.
    // Safe to list targets that don't exist in harley_model_years — they resolve to []
    // and are silently skipped. Dedup step removes any duplicate (product_id, model_year_id) pairs.
    const MODEL_ALIASES = {
      // Vintage / Knucklehead
      'E':      ['EL', 'ELH'],
      // Sportster
      'XL1200': ['XL1200C','XL1200CX','XL1200L','XL1200N','XL1200NS','XL1200R','XL1200S','XL1200T','XL1200V','XL1200X','XL1200XS'],
      'XL883':  ['XL883','XL883C','XL883L','XL883N','XL883R'],
      // Road King — VTwin uses FLHR generically for all Road King variants
      'FLHR':   ['FLHR','FLHRI','FLHRC','FLHRCI','FLHRS','FLHRSI','FLHRSE','FLHRSEI','FLHRSCI','FLHRXS'],
      // Street Glide — VTwin uses FLHX generically
      'FLHX':   ['FLHX','FLHXI','FLHXSE','FLHXS'],
      // Fat Boy (pre-2018 Softail platform)
      'FLSTF':  ['FLSTF','FLSTFI','FLSTFSE','FLSTFB','FLSTFBS'],
      // Night Train
      'FXSTB':  ['FXSTB','FXSTBI','FXSTBSE'],
      // Wide Glide
      'FXDWG':  ['FXDWG','FXDWGI','FXDWG3','FXDWGS'],
    };

    log('\n📅  Resolving model codes → harley_model_years…');
    const rawModelCodes = [...new Set(fitmentRows.map(r => r.model_code))];

    // Expand aliases so we query all concrete codes in one shot
    const expandedCodes = [...new Set(rawModelCodes.flatMap(c => MODEL_ALIASES[c] ?? [c]))];

    const hymRes = await client.query(`
      SELECT hmy.id, hm.model_code, hmy.year
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
      WHERE hm.model_code = ANY($1::text[])
      ORDER BY hm.model_code, hmy.year
    `, [expandedCodes]);

    // Index: model_code → [{id, year}]
    const hymByModel = new Map();
    for (const row of hymRes.rows) {
      if (!hymByModel.has(row.model_code)) hymByModel.set(row.model_code, []);
      hymByModel.get(row.model_code).push({ id: row.id, year: parseInt(row.year, 10) });
    }

    // Build a resolved lookup: original code → merged [{id, year}] entries
    // Aliases point to the union of all their target models' year entries.
    const resolvedByCode = new Map();
    for (const code of rawModelCodes) {
      const targets = MODEL_ALIASES[code] ?? [code];
      const entries = targets.flatMap(t => hymByModel.get(t) ?? []);
      if (entries.length) resolvedByCode.set(code, entries);
    }

    // Find model codes not in harley_model_years (after alias expansion)
    const unknownModels = rawModelCodes.filter(m => !resolvedByCode.has(m));
    if (unknownModels.length > 0) {
      log(`\n⚠️  ${unknownModels.length} model codes not found in harley_model_years (will be skipped):`);
      log(`    ${unknownModels.join(', ')}`);
    }
    const aliasesUsed = rawModelCodes.filter(m => MODEL_ALIASES[m] && resolvedByCode.has(m));
    if (aliasesUsed.length > 0) {
      log(`    Aliases expanded: ${aliasesUsed.map(m => m + ' → [' + MODEL_ALIASES[m].join(', ') + ']').join(' | ')}`);
    }

    // ── 7. Expand fitment rows to (product_id, model_year_id) pairs ────

    log('\n🔧  Expanding fitment ranges…');

    const fitmentInserts = []; // { product_id, model_year_id }

    for (const row of fitmentRows) {
      const productId = skuToId.get(row.sku);
      if (!productId) continue; // SKU not resolved (shouldn't happen)

      const yearEntries = resolvedByCode.get(row.model_code);
      if (!yearEntries) continue; // unknown model code

      for (const { id: myi, year } of yearEntries) {
        if (year >= row.year_start && year <= row.year_end) {
          fitmentInserts.push({ product_id: productId, model_year_id: myi });
        }
      }
    }

    // Deduplicate (product_id, model_year_id) pairs
    const fitmentSet = new Map();
    for (const f of fitmentInserts) {
      const key = `${f.product_id}:${f.model_year_id}`;
      fitmentSet.set(key, f);
    }
    const fitmentUnique = [...fitmentSet.values()];

    log(`    ${fitmentInserts.length.toLocaleString()} raw pairs → ${fitmentUnique.length.toLocaleString()} unique (product_id, model_year_id)`);

    // ── 8. Insert fitment rows ─────────────────────────────────────────

    log('\n💾  Inserting into catalog_fitment_v2…');

    // ON CONFLICT DO NOTHING on the INSERT handles re-run safety without wiping existing data.
    const productIds = [...skuToId.values()];

    let fitmentInserted = 0;
    const fitBatches = chunks(fitmentUnique, BATCH);

    for (const batch of fitBatches) {
      if (batch.length === 0) continue;

      // Build bulk INSERT
      const vals = [];
      const params = [];
      let idx = 1;
      for (const { product_id, model_year_id } of batch) {
        vals.push(`($${idx++}, $${idx++}, 'vtwin_partial')`);
        params.push(product_id, model_year_id);
      }

      const res = await client.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source)
        VALUES ${vals.join(',')}
        ON CONFLICT (product_id, model_year_id) DO NOTHING
      `, params);

      fitmentInserted += res.rowCount;
      progressBar('fitment ', fitmentInserted, fitmentUnique.length);
    }

    log(`    Inserted: ${fitmentInserted.toLocaleString()} fitment rows`);

    // ── 9. Upsert OEM numbers → catalog_oem_crossref → rebuild arrays ──────

    const oemRows = [];
    for (const [bareSku, oemNumber] of skuToOem) {
      const productId = skuToId.get(bareSku);
      if (productId) oemRows.push({ product_id: productId, sku: bareSku, oem_number: oemNumber });
    }

    let oemInserted = 0;
    if (oemRows.length > 0) {
      log(`\n🔑  Inserting ${oemRows.length.toLocaleString()} OEM rows into catalog_oem_crossref…`);

      for (const batch of chunks(oemRows, BATCH)) {
        const vals = [];
        const params = [];
        let idx = 1;
        for (const { product_id, sku, oem_number } of batch) {
          vals.push(`($${idx++}, $${idx++}, $${idx++}, 'VTWIN_SCRAPE')`);
          params.push(product_id, sku, oem_number);
        }
        const res = await client.query(`
          INSERT INTO catalog_oem_crossref (product_id, sku, oem_number, source)
          VALUES ${vals.join(',')}
          ON CONFLICT DO NOTHING
        `, params);
        oemInserted += res.rowCount;
      }
      log(`    Inserted: ${oemInserted.toLocaleString()} new OEM rows`);

      // Rebuild oem_numbers[] from catalog_oem_crossref (all sources) for these products
      log('\n🔄  Rebuilding oem_numbers[] from catalog_oem_crossref…');
      const oemProductIds = [...new Set(oemRows.map(r => r.product_id))];
      const rebuildRes = await client.query(`
        UPDATE catalog_unified cu
        SET oem_numbers = ARRAY(
          SELECT DISTINCT oem_number FROM catalog_oem_crossref
          WHERE product_id = cu.id
          ORDER BY oem_number
        )
        WHERE id = ANY($1::int[])
      `, [oemProductIds]);
      log(`    Rebuilt arrays for ${rebuildRes.rowCount.toLocaleString()} products`);
    } else {
      log('\nℹ️   No OEM data in this batch');
    }

    // ── 10. Commit ─────────────────────────────────────────────────────────

    await client.query('COMMIT');
    log('\n✅  Transaction committed.');

    // ── 10. Summary ────────────────────────────────────────────────────

    log('\n═══════════════════════════════════════════════════════');
    log('  IMPORT SUMMARY');
    log('═══════════════════════════════════════════════════════');
    log(`  Products inserted:           ${insertedProducts.toLocaleString()}`);
    log(`  Products updated:            ${updatedProducts.toLocaleString()}`);
    log(`  Fitment rows inserted:       ${fitmentInserted.toLocaleString()}`);
    log(`  OEM rows inserted:           ${oemInserted.toLocaleString()}`);
    log(`  Unknown model codes skipped: ${unknownModels.length}`);
    if (unknownModels.length > 0) log(`    → ${unknownModels.join(', ')}`);
    log('═══════════════════════════════════════════════════════');
    log('\nNext steps:');
    log('  1. Mark universals: run vtwin_mark_universal.sql');
    log('  2. Refresh mat view: REFRESH MATERIALIZED VIEW mv_family_product_ranges;');
    log('  3. Reindex Typesense: node scripts/ingest/index_unified.js --recreate');

  } catch (err) {
    await client.query('ROLLBACK');
    log('\n❌  ERROR — transaction rolled back');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
