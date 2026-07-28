#!/usr/bin/env node
/**
 * sync_catalog_unified.mjs
 *
 * Replaces merge_catalog_unified.js (deleted 2026-07-18 after it TRUNCATEd
 * catalog_unified with no dry-run, no transaction, and no --apply guard --
 * the truncate committed, the rebuild inserts silently failed against a
 * schema that had drifted from what the script's INSERT column list
 * expected, and catalog_unified sat at 0 rows -- along with every table
 * CASCADE-linked to it (fitment, oem crossref, media, variant groups) --
 * until this was noticed. See HANDOFF_LOG.md.
 *
 * This script never truncates and never deletes. It upserts on the unique
 * `sku` column:
 *   - New vendor SKUs (not yet in catalog_unified) are INSERTed with full
 *     vendor data + a computed display_category. All other enrichment
 *     columns (display_subcategory, display_subcategory_detail,
 *     canonical_product_id, variant_group_id, era_* flags, oem_numbers
 *     cleanup, is_kit, pack_qty, product_details, ...) are left NULL/default
 *     for the downstream taxonomy/canonical/variant/fitment scripts to fill
 *     in, exactly as new products have always entered the pipeline.
 *   - Existing SKUs are updated on ONLY the fields that must track the live
 *     vendor feed -- price, cost, stock/warehouse quantities, in_stock,
 *     is_active/is_discontinued availability, updated_at. Name, description,
 *     images, category/subcategory (raw and display), oem_numbers, and every
 *     other hand-curated or downstream-enriched column are never touched on
 *     an existing row. A buggy re-run can move a price or a stock count; it
 *     cannot wipe months of taxonomy work.
 *   - Nothing is ever deleted. If a SKU disappears from a vendor table this
 *     script does not act on it -- it's reported in the summary for a human
 *     to review, not auto-deactivated.
 *
 * Commits in batches of BATCH_COMMIT_SIZE rows (not one giant transaction)
 * -- a remote-DB connection drop partway through (this has happened several
 * times against the Hetzner-hosted catalog DB on the full ~97K-row run) only
 * loses the current batch, not every row already synced. This does trade
 * away the previous "any error rolls back everything" all-or-nothing
 * guarantee, but every write here is an idempotent upsert on the unique
 * `sku` column (see the per-row SAVEPOINT/ROLLBACK TO SAVEPOINT below too),
 * so simply re-running the script re-applies already-committed rows
 * harmlessly and picks up wherever the last successful commit left off.
 *
 * Usage:
 *   node scripts/ingest/sync_catalog_unified.mjs            # dry run (default)
 *   node scripts/ingest/sync_catalog_unified.mjs --apply    # writes rows
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeBrand } from './brandNormalizationMap.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const BATCH_COMMIT_SIZE = 1000;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ─── Category → 3-letter code maps (unchanged from merge_catalog_unified.js) ──

const PU_CATEGORY_MAP = {
  'ENGINE GROUP':                     'ENG',
  'SUSPENSION GROUP-FRONT':           'SUS',
  'SUSPENSION GROUP-REAR':            'SUS',
  'BRAKING GROUP':                    'BRK',
  'LIGHTING-LICENSE GROUP':           'LIG',
  'EXHAUST GROUP':                    'EXH',
  'ELECTRICAL SYSTEM GROUP':          'ELC',
  'HANDLEBAR-CONTROLS-MIRRORS GROUP': 'HAN',
  'FOOT CONTROLS GROUP':              'FTR',
  'TRANSMISSION-CLUTCH GROUP':        'TRN',
  'CARBURETION-FUEL GROUP':           'FUL',
  'WHEEL AND RIM GROUP':              'WHL',
  'TIRE AND TUBE GROUP':              'WHL',
  'FRAME AND BODY GROUP':             'STR',
  'HARDWARE GROUP':                   'HRD',
  'INSTRUMENT GROUP':                 'INS',
  'LUGGAGE GROUP':                    'LUG',
  'SEATING GROUP':                    'STG',
  'SISSY BAR-BACKREST-RACK GROUP':    'STG',
  'TANK GROUP-GAS AND OIL':           'TNK',
  'FENDER GROUP':                     'FND',
  'WINDSHIELD-FAIRING GROUP':         'WND',
  'GRAPHICS GROUP':                   'ELM',
  'SECURITY-COVERS-SHELTERS GROUP':   'SCR',
  'TOOLS GROUP':                      'TLS',
  'ELECTRONICS GROUP':                'ELC',
  'DRIVE TRAIN GROUP':                'TRN',
  'RADIATOR GROUP':                   'ENG',
  'HELMET AND SHIELD GROUP':          'HLM',
  'TRANSPORTATION GROUP':             'MSC',
  'PROMOTIONAL ITEMS GROUP':          'MSC',
  'MEDIA PRODUCTS GROUP':             'MSC',
  'COMMON MISC GROUP':                'MSC',
};

const WPS_CATEGORY_MAP = {
  'Engine':                    'ENG',
  'Piston kits & Components':  'ENG',
  'Engine Management':         'ENG',
  'Starters':                  'ENG',
  'Cranks':                    'ENG',
  'Suspension':                'SUS',
  'Forks':                     'SUS',
  'Steering':                  'STR',
  'Brakes':                    'BRK',
  'Illumination':              'LIG',
  'Exhaust':                   'EXH',
  'Electrical':                'ELC',
  'Batteries':                 'ELC',
  'Switches':                  'ELC',
  'Audio/Visual/Communication':'ELC',
  'Handlebars':                'HAN',
  'Hand Controls':             'HAN',
  'Grips':                     'HAN',
  'Levers':                    'HAN',
  'Risers':                    'HAN',
  'Cable/Hydraulic Control Lines': 'HAN',
  'Throttle':                  'HAN',
  'Mirrors':                   'HAN',
  'Foot Controls':             'FTR',
  'Clutch':                    'TRN',
  'Drive':                     'TRN',
  'Chains':                    'TRN',
  'Sprockets':                 'TRN',
  'Belts':                     'TRN',
  'Intake/Carb/Fuel System':   'FUL',
  'Jets':                      'FUL',
  'Air Filters':               'FUL',
  'Gas Caps':                  'TNK',
  'Fuel Tank':                 'TNK',
  'Fuel Containers':           'TNK',
  'Wheels':                    'WHL',
  'Tires':                     'WHL',
  'Tire/Wheel Accessories':    'WHL',
  'Tubes':                     'WHL',
  'Wheel Components':          'WHL',
  'Gaskets/Seals':             'GKT',
  'Hardware/Fasteners/Fittings': 'HRD',
  'Clamps':                    'HRD',
  'Mounts/Brackets':           'MNT',
  'Gauges/Meters':             'INS',
  'Luggage':                   'LUG',
  'Straps/Tie-Downs':          'LUG',
  'Racks':                     'LUG',
  'Seat':                      'STG',
  'Body':                      'FND',
  'Windshield/Windscreen':     'WND',
  'Graphics/Decals':           'ELM',
  'Security':                  'SCR',
  'Storage Covers':            'SCR',
  'Tools':                     'TLS',
  'Stands/Lifts':              'TLS',
  'Chemicals':                 'CHM',
  'Oil Filters':               'CHM',
  'Spark Plugs':               'CHM',
  'Oil Change Kit':            'CHM',
  'Helmets':                   'HLM',
  'Helmet Accessories':        'HLM',
  'Gloves':                    'HLM',
  'Jackets':                   'HLM',
  'Pants':                     'HLM',
  'Suits':                     'HLM',
  'Vests':                     'HLM',
  'Shirts':                    'HLM',
  'Hoodies':                   'HLM',
  'Footwear':                  'HLM',
  'Shoes':                     'HLM',
  'Layers':                    'HLM',
  'Headgear':                  'HLM',
  'Eyewear':                   'HLM',
  'Protective/Safety':         'HLM',
  'Guards/Braces':             'HLM',
  'Handguards':                'HLM',
  'Accessories':               'MSC',
  'Promotional':               'MSC',
  'Replacement Parts':         'MSC',
  'Food & Beverage':           'MSC',
  'Utility Containers':        'MSC',
  'Mats/Rugs':                 'MSC',
  'Trailer/Towing':            'MSC',
};

function getCategoryCode(category, vendor) {
  if (!category) return 'MSC';
  const map = vendor === 'PU' ? PU_CATEGORY_MAP : WPS_CATEGORY_MAP;
  return map[category] || 'MSC';
}

// ─── Raw vendor category → display_category (unchanged from merge_catalog_unified.js) ──
// Only used for brand-new products on first insert. Existing rows keep
// whatever display_category the taxonomy-rebuild scripts have since assigned.

function mapDisplayCategory(sourceVendor, category) {
  const v = sourceVendor?.toUpperCase();
  const c = category || '';

  if ((v==='PU'||v==='VTWIN') && c==='ENGINE') return 'Engine';
  if (v==='WPS' && ['Engine','ENGINE MOUNTS','Gasket Sets','Pistons & piston rings',
      'AIR FILTER, ENGINE','SPARK PLUGS','Oil Filter','STARTER MOTOR'].includes(c)) return 'Engine';

  if ((v==='PU'||v==='VTWIN') && c==='EXHAUST') return 'Exhaust';
  if (v==='WPS' && c==='EXHAUST SYSTEM') return 'Exhaust';

  if ((v==='PU'||v==='VTWIN') && c==='TRANSMISSION-CLUTCH') return 'Transmission & Clutch';
  if ((v==='PU'||v==='VTWIN') && c==='DRIVE TRAIN') return 'Transmission & Clutch';
  if (v==='WPS' && ['CLUTCH','BELT, CHAIN AND SPROCKETS','BELTS & SPROCKETS',
      'SPROCKET, BELT','Chains'].includes(c)) return 'Transmission & Clutch';

  if ((v==='PU'||v==='VTWIN') && c==='HANDLEBAR-CONTROLS-MIRRORS') return 'Handlebar & Controls';
  if (v==='WPS' && ['HANDLEBAR','HANDLEBAR & THROTTLE CONTROL','HANDLEBAR GRIPS',
      'RISER, HANDLEBAR','CLAMPS, HANDLEBAR UPPER & LOWER','CABLE, CLUTCH CONTROL',
      'THROTTLE CONTROL','MIRRORS','Hand Controls'].includes(c)) return 'Handlebar & Controls';

  if (v==='VTWIN' && c==='SUSPENSION') return 'Suspension';
  if ((v==='PU'||v==='VTWIN') && ['SUSPENSION GROUP-FRONT','SUSPENSION GROUP-REAR'].includes(c)) return 'Suspension';
  if (v==='WPS' && ['SHOCK ABSORBERS','FORK, FRONT','TRIPLE CLAMP'].includes(c)) return 'Suspension';

  if ((v==='PU'||v==='VTWIN') && c==='BRAKING') return 'Brakes';
  if (v==='WPS' && ['Brake - front','BRAKE LEVER, FRONT'].includes(c)) return 'Brakes';

  if ((v==='PU'||v==='VTWIN') && c==='FOOT CONTROLS') return 'Foot Controls';
  if (v==='WPS' && c==='FOOTBOARDS, OPERATOR') return 'Foot Controls';

  if ((v==='PU'||v==='VTWIN') && c==='LIGHTING-LICENSE') return 'Lighting';
  if (v==='WPS' && c==='HEADLAMP') return 'Lighting';

  if ((v==='PU'||v==='VTWIN') && ['ELECTRICAL SYSTEM','ELECTRONICS'].includes(c)) return 'Electrical';
  if (v==='WPS' && ['SWITCHES, SENSORS & ELECTRICAL CONNECTORS',
      'ELECTRONIC CONTROL MODULE (ECM) AND COIL','SWITCHES',
      'Battery','Electrical','Audio & Communication'].includes(c)) return 'Electrical';

  if ((v==='PU'||v==='VTWIN') && c==='SEATING') return 'Seating';
  if (v==='WPS' && ['SEATS','SADDLEBAGS'].includes(c)) return 'Seating';

  if ((v==='PU'||v==='VTWIN') && ['CARBURETION-FUEL','TANK GROUP-GAS AND OIL'].includes(c)) return 'Carburetion & Fuel';
  if (v==='VTWIN' && c==='TANK') return 'Carburetion & Fuel';
  if (v==='WPS' && ['Carburetor','FUEL CAP','FUEL TANK'].includes(c)) return 'Carburetion & Fuel';

  if ((v==='PU'||v==='VTWIN') && ['WHEEL AND RIM','TIRE AND TUBE'].includes(c)) return 'Wheels & Tires';
  if (v==='WPS' && ['Tires & Wheels','TIRE AND TUBE'].includes(c)) return 'Wheels & Tires';

  if ((v==='PU'||v==='VTWIN') && ['FENDER','WINDSHIELD-FAIRING'].includes(c)) return 'Fenders & Body';
  if (v==='WPS' && ['WINDSHIELD','Covers,','DECALS, FUEL TANK'].includes(c)) return 'Fenders & Body';

  if ((v==='PU'||v==='VTWIN') && ['FRAME AND BODY','HARDWARE'].includes(c)) return 'Frame & Hardware';
  if (v==='WPS' && ['Hardware Listing','ENGINE MOUNTS'].includes(c)) return 'Frame & Hardware';

  if ((v==='PU'||v==='VTWIN') && c==='INSTRUMENT') return 'Instrumentation';
  if (v==='WPS' && c==='Gauges') return 'Instrumentation';

  if ((v==='PU'||v==='VTWIN') && ['LUGGAGE','SISSY BAR-BACKREST-RACK'].includes(c)) return 'Luggage & Racks';
  if (v==='WPS' && c==='LUGGAGE RACK, TOUR-PAK') return 'Luggage & Racks';

  if ((v==='PU'||v==='VTWIN') && c==='SECURITY-COVERS-SHELTERS') return 'Security & Covers';
  if (v==='WPS' && c==='Security') return 'Security & Covers';

  if ((v==='PU'||v==='VTWIN') && c==='TOOLS') return 'Tools & Chemicals';
  if (v==='WPS' && ['Tools & Shop Equipment','Chemicals & Maintenance'].includes(c)) return 'Tools & Chemicals';

  if (v==='WPS' && ['Helmets','Riding Gear','Apparel','Accessories'].includes(c)) return 'Riding Gear & Apparel';

  if ((v==='PU'||v==='VTWIN') && ['COMMON MISC','TRANSPORTATION','PROMOTIONAL ITEMS',
      'MEDIA PRODUCTS','GRAPHICS','RADIATOR'].includes(c)) return 'Accessories & Misc';

  return null;
}

// PU catalog-number range 9903-xxxx is PU's own dedicated department for
// in-store merchandising fixtures -- not sellable parts. Verified live
// against pu_catalog (2026-07-07): 10 rows under this prefix.
const PU_DISPLAY_FIXTURE_SKU_RE = /^9903/;

// Deliberately tight keywords chosen to catch clear fixtures without
// catching legitimately sellable products that merely contain the word
// "display" as a product attribute. Verified live (2026-07-07): 15 PU rows
// + 26 WPS rows match, all confirmed dealer point-of-sale units.
const DISPLAY_FIXTURE_NAME_RE =
  /\b(DISPLAY\s+RACK|COUNTER\s+DISPLAY|POP\s+DISPLAY|SLATWALL|CLIP\s+STRIP|FIXTURE\s+KIT|DISPLAY\s+SHELF|DISPLAY\s+STAND|DISPLAY\s+BOARD|HEADER\s+CARD)\b/i;

// pu_catalog.part_status mixes single-letter codes ('D') and spelled-out
// values ('DISCONTINUED') across different import batches -- both mean the
// same thing. Verified live (2026-07-26): 833 'D' + 11 'DISCONTINUED' rows.
const PU_DISCONTINUED_STATUSES = new Set(['D', 'DISCONTINUED']);

// ─── SKU / slug generation (unchanged) ────────────────────────────────────────

const usedSkus = new Set();

function generateInternalSku(categoryCode, vendorSuffix) {
  let sku;
  do {
    const num = Math.floor(100000 + Math.random() * 900000);
    sku = `${categoryCode}${num}.${vendorSuffix}`;
  } while (usedSkus.has(sku));
  usedSkus.add(sku);
  return sku;
}

function slugify(name, sku) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80) + '-' + sku.replace(/\./g, '-').toLowerCase();
}

function progress(label, done, total) {
  const pct = Math.floor((done / total) * 100);
  const filled = Math.floor(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  ${label} [${bar}] ${pct}% — ${done}/${total}`);
}

// Commits the transaction so far and opens a fresh one -- called between rows
// (never inside an open SAVEPOINT), so a connection drop only loses rows
// processed since the last call, not the whole run. Every write is an
// idempotent upsert, so re-running the script after a failure is always safe.
async function commitBatch(client, processedInBatch) {
  if (processedInBatch % BATCH_COMMIT_SIZE !== 0) return;
  await client.query('COMMIT');
  await client.query('BEGIN');
}

// Fields updated on an EXISTING row. Deliberately excludes name, description,
// images, category/subcategory (raw and display), oem_numbers, and every
// taxonomy/canonical/variant/fitment column -- those are only ever set by
// their own dedicated scripts, never by this sync.
const SYNC_FIELDS_PU = `
  msrp = EXCLUDED.msrp,
  original_retail = EXCLUDED.original_retail,
  map_price = EXCLUDED.map_price,
  has_map_policy = EXCLUDED.has_map_policy,
  ad_policy = EXCLUDED.ad_policy,
  dropship_fee = EXCLUDED.dropship_fee,
  computed_price = EXCLUDED.computed_price,
  in_stock = EXCLUDED.in_stock,
  warehouse_wi = EXCLUDED.warehouse_wi,
  warehouse_ny = EXCLUDED.warehouse_ny,
  warehouse_tx = EXCLUDED.warehouse_tx,
  warehouse_nv = EXCLUDED.warehouse_nv,
  warehouse_nc = EXCLUDED.warehouse_nc,
  is_active = EXCLUDED.is_active,
  is_discontinued = EXCLUDED.is_discontinued,
  updated_at = now()
`;

const SYNC_FIELDS_WPS = `
  msrp = EXCLUDED.msrp,
  cost = EXCLUDED.cost,
  map_price = EXCLUDED.map_price,
  has_map_policy = EXCLUDED.has_map_policy,
  dropship_fee = EXCLUDED.dropship_fee,
  computed_price = EXCLUDED.computed_price,
  in_stock = EXCLUDED.in_stock,
  stock_quantity = EXCLUDED.stock_quantity,
  is_active = EXCLUDED.is_active,
  is_discontinued = EXCLUDED.is_discontinued,
  updated_at = now()
`;

const SYNC_FIELDS_VTWIN = `
  msrp = EXCLUDED.msrp,
  cost = EXCLUDED.cost,
  in_stock = EXCLUDED.in_stock,
  stock_quantity = EXCLUDED.stock_quantity,
  updated_at = now()
`;

async function main() {
  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT sku FROM catalog_unified`);
    const existingSkus = new Set(existing.rows.map((r) => r.sku));
    console.log(`catalog_unified currently has ${existingSkus.size} rows.\n`);

    const puRows = await client.query(`SELECT * FROM pu_catalog`);
    const wpsRows = await client.query(`SELECT * FROM wps_catalog`);
    const vtwinRows = await client.query(`SELECT * FROM vtwin_catalog`);

    const targetSkus = {
      pu: puRows.rows.map((r) => r.sku),
      wps: wpsRows.rows.map((r) => 'WPS-' + r.sku),
      vtwin: vtwinRows.rows.map((r) => 'VT-' + r.sku),
    };

    const summary = {};
    for (const [label, skus] of Object.entries(targetSkus)) {
      const newCount = skus.filter((s) => !existingSkus.has(s)).length;
      summary[label] = { total: skus.length, new: newCount, update: skus.length - newCount };
    }

    const targetSet = new Set([...targetSkus.pu, ...targetSkus.wps, ...targetSkus.vtwin]);
    const missingFromVendors = [...existingSkus].filter((s) => !targetSet.has(s)).length;

    console.log('=== Sync plan ===');
    for (const [label, s] of Object.entries(summary)) {
      console.log(`  ${label.toUpperCase().padEnd(6)} ${s.total} vendor rows -> ${s.new} new inserts, ${s.update} price/stock updates`);
    }
    if (missingFromVendors > 0) {
      console.log(`\n  NOTE: ${missingFromVendors} existing catalog_unified rows have no matching SKU in any vendor table this run.`);
      console.log(`  Not touched -- review manually if this number is unexpected.`);
    }

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    console.log(`\nApplying (committing every ${BATCH_COMMIT_SIZE} rows -- a mid-run failure only loses the current batch)...`);
    await client.query('BEGIN');

    // ── PU ──
    let done = 0, errors = 0;
    for (const r of puRows.rows) {
      const catCode = getCategoryCode(r.commodity_category, 'PU');
      const isNew = !existingSkus.has(r.sku);
      const internalSku = isNew ? generateInternalSku(catCode, 'p') : undefined;
      const slug = isNew ? slugify(r.name, internalSku) : undefined;
      const displayCategory = isNew ? mapDisplayCategory('PU', r.commodity_category) : undefined;
      const isDisplayFixture = PU_DISPLAY_FIXTURE_SKU_RE.test(r.sku || '') ||
        DISPLAY_FIXTURE_NAME_RE.test(r.name || '');
      const isActive = !PU_DISCONTINUED_STATUSES.has(r.part_status) && !isDisplayFixture;
      const inStock = r.national_availability !== '0' && r.national_availability !== 'N/A';

      try {
      await client.query('SAVEPOINT row_sp');
      await client.query(`
        INSERT INTO catalog_unified (
          sku, sku_normalized, vendor_sku, source_vendor, internal_sku,
          name, description, features, brand, brand_code, brand_part_number,
          category, subcategory,
          msrp, original_retail, cost, map_price, has_map_policy,
          ad_policy, dropship_fee, computed_price,
          in_stock, stock_quantity,
          warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc,
          weight, height_in, length_in, width_in,
          uom, upc, country_of_origin, hazardous_code,
          truck_only, no_ship_ca, pfas, harmonized_us,
          image_url,
          drag_part, closeout, in_oldbook, in_fatbook, in_harddrive,
          is_active, is_discontinued,
          oem_numbers, oem_part_number,
          part_add_date, special_instructions,
          product_code, slug, display_category
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
          $29,$30,$31,$32,$33,$34,$35,$36,
          $37,$38,$39,$40,$41,$42,$43,$44,$45,$46,
          $47,$48,$49,$50,$51,$52,$53,$54,$55
        )
        ON CONFLICT (sku) DO UPDATE SET ${SYNC_FIELDS_PU}
      `, [
        r.sku, r.sku.replace(/-/g, ''), r.vendor_part_number, 'PU', internalSku,
        r.name, r.description, r.features, normalizeBrand(r.brand), r.brand_code, r.oem_part_number,
        r.commodity_category, r.commodity_subcategory,
        r.msrp, r.original_retail, null, r.map_price, r.has_map_policy,
        r.ad_policy, r.dropship_fee, r.msrp,
        inStock, null,
        r.warehouse_wi === '+' ? 21 : parseInt(r.warehouse_wi) || 0,
        r.warehouse_ny === '+' ? 21 : parseInt(r.warehouse_ny) || 0,
        r.warehouse_tx === '+' ? 21 : parseInt(r.warehouse_tx) || 0,
        r.warehouse_nv === '+' ? 21 : parseInt(r.warehouse_nv) || 0,
        r.warehouse_nc === '+' ? 21 : parseInt(r.warehouse_nc) || 0,
        r.weight, r.height_in, r.length_in, r.width_in,
        r.uom, r.upc, r.country_of_origin, r.hazardous_code,
        r.truck_only, r.no_ship_ca, r.pfas, r.harmonized_us,
        r.image_url,
        r.drag_part, r.closeout, r.in_oldbook, r.in_fatbook, false,
        isActive, PU_DISCONTINUED_STATUSES.has(r.part_status),
        r.oem_numbers, r.oem_part_number,
        r.part_add_date, r.special_instructions,
        r.product_code, slug, displayCategory,
      ]);
      await client.query('RELEASE SAVEPOINT row_sp');
      done++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`\n  Error on PU SKU ${r.sku}:`, e.message);
      }
      if ((done + errors) % 500 === 0) progress('PU', done, puRows.rows.length);
      await commitBatch(client, done + errors);
    }
    progress('PU', done, puRows.rows.length);
    console.log(`\n  PU: ${done} synced, ${errors} errors`);

    // ── WPS ──
    done = 0; errors = 0;
    for (const r of wpsRows.rows) {
      const sku = 'WPS-' + r.sku;
      const isNew = !existingSkus.has(sku);
      const catCode = getCategoryCode(r.category, 'WPS');
      const internalSku = isNew ? generateInternalSku(catCode, 'w') : undefined;
      const slug = isNew ? slugify(r.name, internalSku) : undefined;
      const displayCategory = isNew ? mapDisplayCategory('WPS', r.category) : undefined;
      const isDisplayFixture = DISPLAY_FIXTURE_NAME_RE.test(r.name || '');
      const stockQty =
        (r.warehouse_boise || 0) + (r.warehouse_fresno || 0) +
        (r.warehouse_elizabethtown || 0) + (r.warehouse_ashley || 0) +
        (r.warehouse_midlothian || 0) + (r.warehouse_jessup || 0) +
        (r.warehouse_midway || 0);
      const isActive = (r.status === 'STK' || r.status === 'LTD') && !isDisplayFixture;

      try {
      await client.query('SAVEPOINT row_sp');
      await client.query(`
        INSERT INTO catalog_unified (
          sku, sku_normalized, vendor_sku, source_vendor, internal_sku,
          name, description, features, brand,
          category,
          msrp, cost, map_price, has_map_policy,
          dropship_fee, computed_price,
          in_stock, stock_quantity,
          weight, height_in, length_in, width_in,
          uom, upc, country_of_origin, hazardous_code,
          truck_only, no_ship_ca,
          image_url,
          in_harddrive, closeout, is_active, is_discontinued,
          oem_numbers, brand_part_number,
          slug, display_category
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,
          $27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
        )
        ON CONFLICT (sku) DO UPDATE SET ${SYNC_FIELDS_WPS}
      `, [
        sku, r.sku.replace(/-/g, ''), r.sku, 'WPS', internalSku,
        r.name, r.product_description, r.product_features ? [r.product_features] : null, normalizeBrand(r.brand),
        r.category,
        r.list_price, r.dealer_price, r.map_price, r.has_map_policy,
        r.drop_ship_fee ? parseFloat(r.drop_ship_fee) || null : null, r.list_price,
        r.in_stock, stockQty,
        r.weight, r.height_in, r.length_in, r.width_in,
        r.uom, r.upc, r.country_of_origin_code, r.hazardous_code,
        r.truck_only, false,
        r.image_url || r.image_uri,
        r.harddrive_catalog, false, isActive, r.status === 'NLA' || r.status === 'DSC',
        r.oem_numbers, r.supplier_item_id,
        slug, displayCategory,
      ]);
      await client.query('RELEASE SAVEPOINT row_sp');
      done++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`\n  Error on WPS SKU ${r.sku}:`, e.message);
      }
      if ((done + errors) % 500 === 0) progress('WPS', done, wpsRows.rows.length);
      await commitBatch(client, done + errors);
    }
    progress('WPS', done, wpsRows.rows.length);
    console.log(`\n  WPS: ${done} synced, ${errors} errors`);

    // ── VTWIN ──
    done = 0; errors = 0;
    for (const r of vtwinRows.rows) {
      const sku = 'VT-' + r.sku;
      const isNew = !existingSkus.has(sku);
      const internalSku = isNew ? generateInternalSku('MSC', 'v') : undefined;
      const slug = isNew ? slugify(r.name, internalSku) : undefined;
      const displayCategory = isNew ? mapDisplayCategory('VTWIN', r.category || null) : undefined;

      const oemNums = r.oem_numbers || [];
      if (r.oem_xref1 && !oemNums.includes(r.oem_xref1)) oemNums.push(r.oem_xref1.trim());
      if (r.oem_xref2 && !oemNums.includes(r.oem_xref2)) oemNums.push(r.oem_xref2.trim());
      if (r.oem_xref3 && !oemNums.includes(r.oem_xref3)) oemNums.push(r.oem_xref3.trim());

      try {
      await client.query('SAVEPOINT row_sp');
      await client.query(`
        INSERT INTO catalog_unified (
          sku, sku_normalized, vendor_sku, source_vendor, internal_sku,
          name, brand,
          msrp, cost,
          in_stock, stock_quantity,
          weight, height_in, length_in, width_in,
          uom, country_of_origin,
          image_url, image_urls,
          is_active,
          oem_numbers, oem_part_number,
          brand_part_number,
          part_add_date,
          slug, display_category
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$23,$24,$25,$26
        )
        ON CONFLICT (sku) DO UPDATE SET ${SYNC_FIELDS_VTWIN}
      `, [
        sku, r.sku.replace(/-/g, ''), r.sku, 'VTWIN', internalSku,
        r.name, normalizeBrand(r.manufacturer),
        r.retail_price, r.dealer_price,
        r.has_stock, r.has_stock ? 1 : 0,
        r.weight_lbs, r.height_in, r.length_in, r.width_in,
        r.uom, r.country_of_origin,
        r.full_pic1 || r.thumb_pic, [r.full_pic1, r.full_pic2, r.full_pic3, r.full_pic4].filter(Boolean),
        true,
        oemNums.length > 0 ? oemNums : null, oemNums[0] || null,
        r.vendor_part_no,
        r.date_added,
        slug, displayCategory,
      ]);
      await client.query('RELEASE SAVEPOINT row_sp');
      done++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`\n  Error on VTwin SKU ${r.sku}:`, e.message);
      }
      if ((done + errors) % 500 === 0) progress('VTwin', done, vtwinRows.rows.length);
      await commitBatch(client, done + errors);
    }
    progress('VTwin', done, vtwinRows.rows.length);
    console.log(`\n  VTwin: ${done} synced, ${errors} errors`);

    const finalCount = await client.query(`SELECT COUNT(*) FROM catalog_unified`);
    console.log(`\nCommitting. catalog_unified now has ${finalCount.rows[0].count} rows.`);
    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\nFailed -- only the current uncommitted batch (< ${BATCH_COMMIT_SIZE} rows) rolled back; everything committed in earlier batches this run is already saved. Re-run to pick up where this left off:`, err);
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
