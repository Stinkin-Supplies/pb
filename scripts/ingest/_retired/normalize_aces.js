/**
 * Stage 1c: Normalize ACES Fitment Data
 * Reads raw_vendor_aces → parses ACES XML → upserts into catalog_fitment
 *
 * ACES (Aftermarket Catalog Exchange Standard) XML format:
 *   <ACES>
 *     <App>
 *       <BaseVehicle><Make>Honda</Make><Model>CBR600RR</Model><Year>2015</Year></BaseVehicle>
 *       <Part>SKU123</Part>  (or <PartNumber>)
 *     </App>
 *   </ACES>
 *
 * Usage: node normalize_aces.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { sql } from '../lib/db.js';
import { getPool } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

const BATCH_SIZE = 50; // ACES files can be large; process fewer raw rows at a time

const xmlParser = new XMLParser({
  ignoreAttributes:      false,
  attributeNamePrefix:   '@_',
  isArray: (name) => ['App', 'BaseVehicle', 'Year'].includes(name),
  parseTagValue:         true,
  trimValues:            true,
});

// ── helpers ───────────────────────────────────────────────────────────────────

function getText(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'number') return String(val);
  // fast-xml-parser can wrap values in objects when mixed content
  if (typeof val === 'object' && '#text' in val) return String(val['#text']).trim() || null;
  return null;
}

/**
 * Parse an ACES XML string and return an array of fitment entries:
 * { sku, make, model, yearStart, yearEnd }
 */
function parseAcesXml(xmlString) {
  const entries = [];

  let parsed;
  try {
    parsed = xmlParser.parse(xmlString);
  } catch (e) {
    console.warn('[normalize_aces] XML parse error:', e.message);
    return entries;
  }

  // Root may be ACES or AAIA_ACES; find the App list
  const root = parsed.ACES ?? parsed.AAIA_ACES ?? parsed;
  const apps  = root?.App ?? root?.Catalog?.[0]?.App ?? [];

  for (const app of apps) {
    // Part number — field name varies across ACES versions
    const sku =
      getText(app.Part)               ??
      getText(app.PartNumber)         ??
      getText(app.part)               ??
      getText(app.ItemRef)            ??
      null;

    if (!sku) continue;

    // BaseVehicle block
    const bv = Array.isArray(app.BaseVehicle) ? app.BaseVehicle[0] : app.BaseVehicle;
    if (!bv) continue;

    const make  = getText(bv.Make  ?? bv.make)  ?? null;
    const model = getText(bv.Model ?? bv.model) ?? null;

    // Year handling: some ACES use Year inside BaseVehicle, others as sibling
    const yearRaw = bv.Year ?? bv.year ?? app.Year ?? app.year;
    const yearStr = getText(yearRaw);
    if (!yearStr) continue;

    // Year may be "2015" or a range "2015-2020"
    let yearStart = null;
    let yearEnd   = null;

    if (yearStr.includes('-')) {
      const parts = yearStr.split('-');
      yearStart = parseInt(parts[0], 10) || null;
      yearEnd   = parseInt(parts[1], 10) || null;
    } else {
      const y = parseInt(yearStr, 10);
      if (!isNaN(y)) { yearStart = y; yearEnd = y; }
    }

    if (!yearStart) continue;

    // Normalise SKU: strip dashes, uppercase
    const normSku = sku.replace(/-/g, '').toUpperCase();

    entries.push({ sku: normSku, rawSku: sku, make, model, yearStart, yearEnd });
  }

  return entries;
}

// ── main ──────────────────────────────────────────────────────────────────────

export async function normalizeAces() {
  console.log('[normalize_aces] Starting ACES fitment normalization...');

  const [{ count }] = await sql`SELECT COUNT(*) FROM raw_vendor_aces`;
  const total = Number(count);
  console.log(`[normalize_aces] ${total} raw ACES rows to process`);

  if (total === 0) {
    console.log('[normalize_aces] Nothing to do — raw_vendor_aces is empty.');
    return;
  }

  const pool = getPool();
  let offset   = 0;
  let fitted   = 0;
  let noMatch  = 0;
  let failed   = 0;

  while (offset < total) {
    const rows = await sql`
      SELECT id, payload FROM raw_vendor_aces
      ORDER BY id LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `;

    for (const row of rows) {
      // payload was stored as JSON.stringify(xmlString) → Postgres JSONB → driver returns the string
      const xmlString =
        typeof row.payload === 'string'
          ? row.payload
          : JSON.stringify(row.payload);

      const entries = parseAcesXml(xmlString);

      if (entries.length === 0) {
        offset++;
        continue;
      }

      // Resolve product IDs in one query per file (batch by unique SKUs)
      const uniqueSkus = [...new Set(entries.map(e => e.sku))];

      const productRows = await sql`
        SELECT id, sku,
               REGEXP_REPLACE(UPPER(sku), '[^A-Z0-9]', '', 'g') AS norm_sku,
               REGEXP_REPLACE(UPPER(COALESCE(manufacturer_part_number,'')), '[^A-Z0-9]', '', 'g') AS norm_mpn
        FROM catalog_products
        WHERE REGEXP_REPLACE(UPPER(sku), '[^A-Z0-9]', '', 'g') = ANY(${uniqueSkus})
           OR REGEXP_REPLACE(UPPER(COALESCE(manufacturer_part_number,'')), '[^A-Z0-9]', '', 'g') = ANY(${uniqueSkus})
      `;

      const idBySku = new Map();
      for (const p of productRows) {
        if (p.norm_sku) idBySku.set(p.norm_sku, p.id);
        if (p.norm_mpn) idBySku.set(p.norm_mpn, p.id);
      }

      // Collect fitment rows to upsert
      const fitmentProductIds = [];
      const fitmentMakes      = [];
      const fitmentModels     = [];
      const fitmentYearStarts = [];
      const fitmentYearEnds   = [];

      for (const entry of entries) {
        const productId = idBySku.get(entry.sku);
        if (!productId) { noMatch++; continue; }

        fitmentProductIds.push(productId);
        fitmentMakes.push(entry.make);
        fitmentModels.push(entry.model);
        fitmentYearStarts.push(entry.yearStart);
        fitmentYearEnds.push(entry.yearEnd);
        fitted++;
      }

      if (fitmentProductIds.length > 0) {
        try {
          const client = await pool.connect();
          try {
            await client.query(
              `
              INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end)
              SELECT * FROM unnest(
                $1::int[],
                $2::text[],
                $3::text[],
                $4::int[],
                $5::int[]
              ) AS t(product_id, make, model, year_start, year_end)
              ON CONFLICT DO NOTHING
              `,
              [fitmentProductIds, fitmentMakes, fitmentModels, fitmentYearStarts, fitmentYearEnds]
            );
          } finally {
            client.release();
          }
        } catch (e) {
          console.error(`[normalize_aces] Insert failed (row ${row.id}):`, e.message);
          failed++;
        }
      }
    }

    offset += BATCH_SIZE;
    console.log(
      `[normalize_aces] Processed ${Math.min(offset, total)}/${total} | ` +
      `fitted: ${fitted} | no match: ${noMatch} | failed: ${failed}`
    );
  }

  console.log(`[normalize_aces] Done. Fitted: ${fitted} | No match: ${noMatch} | Failed: ${failed}`);
  return { fitted, noMatch, failed };
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalizeAces().catch(err => {
    console.error('[normalize_aces] Fatal:', err);
    process.exit(1);
  });
}
