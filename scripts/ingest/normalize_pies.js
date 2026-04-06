/**
 * Stage 1d: Normalize PIES Data
 * Reads raw_vendor_pies → parses PIES XML → writes to:
 *   - catalog_media   (DigitalAssets / DigitalFileInformation image URLs)
 *   - catalog_specs   (ExtendedAttributes)
 *   - catalog_products.description (MarketingCopy, if product description is missing)
 *
 * PIES (Product Information Exchange Standard) XML format:
 *   <PIES>
 *     <Items>
 *       <Item MaintenanceType="A">
 *         <PartNumber>ABC123</PartNumber>
 *         <MarketingCopy>...</MarketingCopy>
 *         <ExtendedAttributes>
 *           <Attribute MaintenanceType="A" PADBAttribute="true" EXPIAttribute="false">
 *             <AttributeID>Color</AttributeID>
 *             <AttributeValue>Red</AttributeValue>
 *           </Attribute>
 *         </ExtendedAttributes>
 *         <DigitalAssets>
 *           <DigitalFileInformation>
 *             <URI>http://example.com/img.jpg</URI>
 *             <FileName>img.jpg</FileName>
 *           </DigitalFileInformation>
 *         </DigitalAssets>
 *       </Item>
 *     </Items>
 *   </PIES>
 *
 * Usage: node normalize_pies.js
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

const BATCH_SIZE = 20; // PIES files can be large XML; process fewer at once

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['Item', 'Attribute', 'DigitalFileInformation', 'Description'].includes(name),
  parseTagValue:       true,
  trimValues:          true,
});

// ── helpers ───────────────────────────────────────────────────────────────────

function getText(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && '#text' in val) return String(val['#text']).trim() || null;
  return null;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif']);

function isImageUrl(urlOrFile) {
  const lower = (urlOrFile || '').toLowerCase();
  return IMAGE_EXTS.has(path.extname(lower)) && !lower.endsWith('.zip');
}

/**
 * Parse a PIES XML string and return structured data per part number:
 * {
 *   sku: string (normalised, no dashes, uppercase),
 *   description: string | null,
 *   specs: [{ attribute, value }],
 *   images: [{ url, priority }],
 * }
 */
function parsePiesXml(xmlString) {
  const results = [];

  let parsed;
  try {
    parsed = xmlParser.parse(xmlString);
  } catch (e) {
    console.warn('[normalize_pies] XML parse error:', e.message);
    return results;
  }

  // Root may be PIES or wrapped in another tag
  const root  = parsed.PIES ?? parsed;
  const items = root?.Items?.Item ?? root?.Item ?? [];

  for (const item of items) {
    const rawSku = getText(item.PartNumber ?? item.partNumber ?? item.ItemLevelGTIN);
    if (!rawSku) continue;

    const sku = rawSku.replace(/-/g, '').toUpperCase();

    // Description — MarketingCopy or Description elements with codes
    let description = null;
    const marketingCopy = getText(item.MarketingCopy);
    if (marketingCopy) {
      description = marketingCopy;
    } else {
      // Description elements: DescriptionCode "TLE" = title, "FAB" = feature bullet
      const descEls = item.Descriptions?.Description ?? item.Description ?? [];
      const bullets = [];
      let title = null;
      for (const d of descEls) {
        const code = d['@_DescriptionCode'] ?? d['@_MaintenanceType'];
        const val  = getText(d);
        if (!val) continue;
        if (code === 'TLE') title = val;
        else if (code === 'FAB' || code === 'DEF' || code === 'SHT') bullets.push(val);
      }
      if (bullets.length > 0) description = bullets.join('\n');
      else if (title) description = title;
    }

    // Specs — ExtendedAttributes
    const specs = [];
    const attrs = item.ExtendedAttributes?.Attribute ?? item.ExtendedAttribute ?? [];
    for (const attr of attrs) {
      const attrId  = getText(attr.AttributeID  ?? attr.Name  ?? attr['@_AttributeID']);
      const attrVal = getText(attr.AttributeValue ?? attr.Value ?? attr['@_AttributeValue'] ?? attr['#text']);
      if (attrId && attrVal) {
        specs.push({ attribute: attrId, value: attrVal });
      }
    }

    // Images — DigitalAssets
    const images = [];
    const assets = item.DigitalAssets?.DigitalFileInformation ?? [];
    for (let i = 0; i < assets.length; i++) {
      const asset    = assets[i];
      const uri      = getText(asset.URI ?? asset.Filename ?? asset.FileName ?? asset.URL);
      const fileName = getText(asset.FileName ?? asset.AssetFilename) ?? '';
      if (!uri) continue;
      if (!isImageUrl(uri) && !isImageUrl(fileName)) continue;
      images.push({ url: uri, priority: i });
    }

    results.push({ sku, description, specs, images });
  }

  return results;
}

// ── main ──────────────────────────────────────────────────────────────────────

export async function normalizePies() {
  console.log('[normalize_pies] Starting PIES normalization...');

  const [{ count }] = await sql`SELECT COUNT(*) FROM raw_vendor_pies`;
  const total = Number(count);
  console.log(`[normalize_pies] ${total} raw PIES rows to process`);

  if (total === 0) {
    console.log('[normalize_pies] Nothing to do — raw_vendor_pies is empty.');
    return;
  }

  const pool = getPool();
  let offset       = 0;
  let mediaInserted  = 0;
  let specsInserted  = 0;
  let descUpdated    = 0;
  let noMatch        = 0;
  let failed         = 0;

  while (offset < total) {
    const rows = await sql`
      SELECT id, payload FROM raw_vendor_pies
      ORDER BY id LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `;

    for (const row of rows) {
      const xmlString =
        typeof row.payload === 'string'
          ? row.payload
          : JSON.stringify(row.payload);

      const parts = parsePiesXml(xmlString);
      if (parts.length === 0) continue;

      // Bulk-resolve product IDs for all unique SKUs in this file
      const uniqueSkus = [...new Set(parts.map(p => p.sku))];

      const productRows = await sql`
        SELECT id,
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

      for (const part of parts) {
        const productId = idBySku.get(part.sku);
        if (!productId) { noMatch++; continue; }

        const client = await pool.connect();
        try {
          // Description — only fill if missing
          if (part.description) {
            await client.query(
              `UPDATE catalog_products
               SET description = $1, updated_at = NOW()
               WHERE id = $2 AND (description IS NULL OR description = '')`,
              [part.description, productId]
            );
            descUpdated++;
          }

          // Specs — upsert individual attributes (don't wipe existing)
          if (part.specs.length > 0) {
            const specProductIds = part.specs.map(() => productId);
            const specAttrs      = part.specs.map(s => s.attribute);
            const specVals       = part.specs.map(s => s.value);

            await client.query(
              `
              INSERT INTO catalog_specs (product_id, attribute, value)
              SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS t(product_id, attribute, value)
              ON CONFLICT DO NOTHING
              `,
              [specProductIds, specAttrs, specVals]
            );
            specsInserted += part.specs.length;
          }

          // Media — insert images, don't replace existing (PIES supplements, not overrides)
          if (part.images.length > 0) {
            const mediaProductIds = part.images.map(() => productId);
            const mediaUrls       = part.images.map(img => img.url);
            const mediaPriorities = part.images.map(img => img.priority);

            await client.query(
              `
              INSERT INTO catalog_media (product_id, url, media_type, priority)
              SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::int[])
                AS t(product_id, url, media_type, priority)
              ON CONFLICT DO NOTHING
              `,
              [mediaProductIds, mediaUrls, mediaProductIds.map(() => 'image'), mediaPriorities]
            );
            mediaInserted += part.images.length;
          }
        } catch (e) {
          console.error(`[normalize_pies] Error on SKU ${part.sku}:`, e.message);
          failed++;
        } finally {
          client.release();
        }
      }
    }

    offset += BATCH_SIZE;
    console.log(
      `[normalize_pies] Processed ${Math.min(offset, total)}/${total} | ` +
      `media: ${mediaInserted} | specs: ${specsInserted} | desc: ${descUpdated} | ` +
      `no match: ${noMatch} | failed: ${failed}`
    );
  }

  console.log(
    `[normalize_pies] Done. ` +
    `Media: ${mediaInserted} | Specs: ${specsInserted} | Desc updates: ${descUpdated} | ` +
    `No match: ${noMatch} | Failed: ${failed}`
  );
  return { mediaInserted, specsInserted, descUpdated, noMatch, failed };
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalizePies().catch(err => {
    console.error('[normalize_pies] Fatal:', err);
    process.exit(1);
  });
}
