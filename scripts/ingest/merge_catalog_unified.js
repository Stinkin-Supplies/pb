#!/usr/bin/env node
// merge_catalog_unified.js
// Merges pu_catalog, wps_catalog, vtwin_catalog into catalog_unified
// Generates internal SKUs in format: CAT123456.p / .w / .v

import pg from 'pg';
import { normalizeBrand } from './brandNormalizationMap.mjs';
const { Pool } = pg;

// PU catalog-number range 9903-xxxx is PU's own dedicated department for
// in-store merchandising fixtures (POP racks, slatwall graphics, clip strips,
// fixture kits, counter displays) spanning many brands — not sellable parts.
// Verified live against pu_catalog (2026-07-07): 10 rows under this prefix.
const PU_DISPLAY_FIXTURE_SKU_RE = /^9903/;

// Neither PU nor WPS confines all merchandising fixtures to one SKU range, so
// also match on name — deliberately tight keywords chosen to catch clear
// fixtures (display racks/boards/stands, slatwall, clip strips, fixture kits,
// counter/POP displays, header cards) while NOT catching legitimately
// sellable products that merely contain the word "display" as a product
// attribute (e.g. Dakota Digital gauges with a "Blue Display", Dynojet
// "Pod-300 Digital Display", Magnum Shielding "Softail Display Clamp").
// Verified live (2026-07-07): 15 PU rows + 26 WPS rows match, all confirmed
// dealer point-of-sale/merchandising units by cross-checking price
// (loaded gasket-assortment display boards run $70-240, consistent with
// containing real stock, not just an empty fixture — still a dealer
// merchandising unit, not something an end customer buys individually).
const DISPLAY_FIXTURE_NAME_RE =
  /\b(DISPLAY\s+RACK|COUNTER\s+DISPLAY|POP\s+DISPLAY|SLATWALL|CLIP\s+STRIP|FIXTURE\s+KIT|DISPLAY\s+SHELF|DISPLAY\s+STAND|DISPLAY\s+BOARD|HEADER\s+CARD)\b/i;

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// ─── Category → 3-letter code maps ───────────────────────────────────────────

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
  'Forks':                     'SUS',
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

// ─── Display category mapping ──────────────────────────────────────────────────
// Maps raw vendor category strings → clean unified display_category values.
// Run after every merge so catalog_unified.display_category stays consistent.

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

// ─── SKU generator ─────────────────────────────────────────────────────────────

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

// ─── Progress bar ──────────────────────────────────────────────────────────────

function progress(label, done, total, errors) {
  const pct = Math.floor((done / total) * 100);
  const filled = Math.floor(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  ${label} [${bar}] ${pct}% — ${done}/${total}, ${errors} errors`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  try {
    // Drop FK constraints before truncate
    console.log('Dropping FK constraints...');
    await client.query(`
      ALTER TABLE IF EXISTS catalog_fitment_v2 DROP CONSTRAINT IF EXISTS catalog_fitment_v2_product_id_fkey;
      ALTER TABLE IF EXISTS product_fitment_year_model DROP CONSTRAINT IF EXISTS product_fitment_year_model_unified_id_fkey;
      ALTER TABLE IF EXISTS vendor_offers DROP CONSTRAINT IF EXISTS vendor_offers_catalog_product_id_fkey;
      DROP VIEW IF EXISTS v_catalog_fitment;
    `);

    await client.query('TRUNCATE catalog_unified RESTART IDENTITY CASCADE');
    console.log('catalog_unified truncated');

    // ── PU ──────────────────────────────────────────────────────────────────
    console.log('\nLoading pu_catalog...');
    const puRows = await client.query(`SELECT * FROM pu_catalog`);
    const puTotal = puRows.rows.length;
    console.log(`  ${puTotal} rows`);

    let inserted = 0, errors = 0;

    for (const r of puRows.rows) {
      const catCode = getCategoryCode(r.commodity_category, 'PU');
      const internalSku = generateInternalSku(catCode, 'p');
      const slug = slugify(r.name, internalSku);
      const displayCategory = mapDisplayCategory('PU', r.commodity_category);
      const isDisplayFixture = PU_DISPLAY_FIXTURE_SKU_RE.test(r.sku || '') ||
        DISPLAY_FIXTURE_NAME_RE.test(r.name || '');

      try {
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
        `, [
          r.sku,                          // $1  sku
          r.sku.replace(/-/g, ''),        // $2  sku_normalized
          r.vendor_part_number,           // $3  vendor_sku
          'PU',                           // $4  source_vendor
          internalSku,                    // $5  internal_sku
          r.name,                         // $6  name
          r.description,                  // $7  description
          r.features,                     // $8  features
          normalizeBrand(r.brand),        // $9  brand
          r.brand_code,                   // $10 brand_code
          r.oem_part_number,              // $11 brand_part_number
          r.commodity_category,           // $12 category
          r.commodity_subcategory,        // $13 subcategory
          r.msrp,                         // $14 msrp
          r.original_retail,              // $15 original_retail
          null,                           // $16 cost (PU doesn't expose cost)
          r.map_price,                    // $17 map_price
          r.has_map_policy,               // $18 has_map_policy
          r.ad_policy,                    // $19 ad_policy
          r.dropship_fee,                 // $20 dropship_fee
          r.msrp,                         // $21 computed_price (default to msrp)
          r.national_availability !== '0' && r.national_availability !== 'N/A', // $22 in_stock
          null,                           // $23 stock_quantity
          r.warehouse_wi === '+' ? 21 : parseInt(r.warehouse_wi) || 0, // $24
          r.warehouse_ny === '+' ? 21 : parseInt(r.warehouse_ny) || 0, // $25
          r.warehouse_tx === '+' ? 21 : parseInt(r.warehouse_tx) || 0, // $26
          r.warehouse_nv === '+' ? 21 : parseInt(r.warehouse_nv) || 0, // $27
          r.warehouse_nc === '+' ? 21 : parseInt(r.warehouse_nc) || 0, // $28
          r.weight,                       // $29 weight
          r.height_in,                    // $30 height_in
          r.length_in,                    // $31 length_in
          r.width_in,                     // $32 width_in
          r.uom,                          // $33 uom
          r.upc,                          // $34 upc
          r.country_of_origin,            // $35 country_of_origin
          r.hazardous_code,               // $36 hazardous_code
          r.truck_only,                   // $37 truck_only
          r.no_ship_ca,                   // $38 no_ship_ca
          r.pfas,                         // $39 pfas
          r.harmonized_us,               // $40 harmonized_us
          r.image_url,                    // $41 image_url
          r.drag_part,                    // $42 drag_part
          r.closeout,                     // $43 closeout
          r.in_oldbook,                   // $44 in_oldbook
          r.in_fatbook,                   // $45 in_fatbook
          false,                          // $46 in_harddrive
          r.part_status !== 'D' && !isDisplayFixture, // $47 is_active — POP/display fixtures excluded from sellable inventory
          r.part_status === 'D',          // $48 is_discontinued
          r.oem_numbers,                  // $49 oem_numbers
          r.oem_part_number,              // $50 oem_part_number
          r.part_add_date,                // $51 part_add_date
          r.special_instructions,         // $52 special_instructions
          r.product_code,                 // $53 product_code
          slug,                           // $54 slug
          displayCategory,               // $55 display_category
        ]);
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 3) console.error(`\n  PU SKU ${r.sku}:`, e.message);
      }
      if (inserted % 500 === 0) progress('PU', inserted, puTotal, errors);
    }
    progress('PU', inserted, puTotal, errors);
    console.log(`\n  ✅ PU: ${inserted} inserted, ${errors} errors`);

    // ── WPS ─────────────────────────────────────────────────────────────────
    console.log('\nLoading wps_catalog...');
    const wpsRows = await client.query(`SELECT * FROM wps_catalog`);
    const wpsTotal = wpsRows.rows.length;
    console.log(`  ${wpsTotal} rows`);

    inserted = 0; errors = 0;

    for (const r of wpsRows.rows) {
      const catCode = getCategoryCode(r.category, 'WPS');
      const internalSku = generateInternalSku(catCode, 'w');
      const slug = slugify(r.name, internalSku);
      const displayCategory = mapDisplayCategory('WPS', r.category);
      const isDisplayFixture = DISPLAY_FIXTURE_NAME_RE.test(r.name || '');
      const stockQty =
        (r.warehouse_boise || 0) + (r.warehouse_fresno || 0) +
        (r.warehouse_elizabethtown || 0) + (r.warehouse_ashley || 0) +
        (r.warehouse_midlothian || 0) + (r.warehouse_jessup || 0) +
        (r.warehouse_midway || 0);

      try {
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
        `, [
          'WPS-' + r.sku,                 // $1
          r.sku.replace(/-/g, ''),        // $2
          r.sku,                          // $3  vendor_sku = original WPS sku
          'WPS',                          // $4
          internalSku,                    // $5
          r.name,                         // $6
          r.product_description,          // $7
          r.product_features ? [r.product_features] : null, // $8
          normalizeBrand(r.brand),        // $9
          r.category,                     // $10
          r.list_price,                   // $11 msrp
          r.dealer_price,                 // $12 cost
          r.map_price,                    // $13
          r.has_map_policy,               // $14
          r.drop_ship_fee ? parseFloat(r.drop_ship_fee) || null : null, // $15
          r.list_price,                   // $16 computed_price
          r.in_stock,                     // $17
          stockQty,                       // $18
          r.weight,                       // $19
          r.height_in,                    // $20
          r.length_in,                    // $21
          r.width_in,                     // $22
          r.uom,                          // $23
          r.upc,                          // $24
          r.country_of_origin_code,       // $25
          r.hazardous_code,               // $26
          r.truck_only,                   // $27
          false,                          // $28 no_ship_ca
          r.image_url || r.image_uri,     // $29
          r.harddrive_catalog,            // $30
          false,                          // $31 closeout
          (r.status === 'STK' || r.status === 'LTD') && !isDisplayFixture, // $32 is_active — POP/display fixtures excluded from sellable inventory
          r.status === 'NLA' || r.status === 'DSC', // $33 is_discontinued
          r.oem_numbers,                  // $34
          r.supplier_item_id,             // $35 brand_part_number
          slug,                           // $36
          displayCategory,               // $37 display_category
        ]);
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 3) console.error(`\n  WPS SKU ${r.sku}:`, e.message);
      }
      if (inserted % 500 === 0) progress('WPS', inserted, wpsTotal, errors);
    }
    progress('WPS', inserted, wpsTotal, errors);
    console.log(`\n  ✅ WPS: ${inserted} inserted, ${errors} errors`);

    // ── VTWIN ────────────────────────────────────────────────────────────────
    console.log('\nLoading vtwin_catalog...');
    const vtwinRows = await client.query(`SELECT * FROM vtwin_catalog`);
    const vtwinTotal = vtwinRows.rows.length;
    console.log(`  ${vtwinTotal} rows`);

    inserted = 0; errors = 0;

    for (const r of vtwinRows.rows) {
      const internalSku = generateInternalSku('MSC', 'v'); // no category for vtwin
      const slug = slugify(r.name, internalSku);
      const displayCategory = mapDisplayCategory('VTWIN', r.category || null);

      // Combine OEM xrefs into oem_numbers if not already set
      const oemNums = r.oem_numbers || [];
      if (r.oem_xref1 && !oemNums.includes(r.oem_xref1)) oemNums.push(r.oem_xref1.trim());
      if (r.oem_xref2 && !oemNums.includes(r.oem_xref2)) oemNums.push(r.oem_xref2.trim());
      if (r.oem_xref3 && !oemNums.includes(r.oem_xref3)) oemNums.push(r.oem_xref3.trim());

      try {
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
        `, [
          'VT-' + r.sku,                  // $1
          r.sku.replace(/-/g, ''),        // $2
          r.sku,                          // $3  vendor_sku = original VTwin sku
          'VTWIN',                        // $4
          internalSku,                    // $5
          r.name,                         // $6
          normalizeBrand(r.manufacturer), // $7 brand
          r.retail_price,                 // $8 msrp
          r.dealer_price,                 // $9 cost
          r.has_stock,                    // $10 in_stock
          r.has_stock ? 1 : 0,            // $11 stock_quantity
          r.weight_lbs,                   // $12 weight
          r.height_in,                    // $13
          r.length_in,                    // $14
          r.width_in,                     // $15
          r.uom,                          // $16
          r.country_of_origin,            // $17
          r.full_pic1 || r.thumb_pic,     // $18 image_url
          [r.full_pic1, r.full_pic2, r.full_pic3, r.full_pic4].filter(Boolean), // $19
          true,                           // $20 is_active
          oemNums.length > 0 ? oemNums : null, // $21
          oemNums[0] || null,             // $22 oem_part_number
          r.vendor_part_no,               // $23 brand_part_number
          r.date_added,                   // $24
          slug,                           // $25
          displayCategory,               // $26 display_category
        ]);
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 3) console.error(`\n  VTwin SKU ${r.sku}:`, e.message);
      }
      if (inserted % 500 === 0) progress('VTwin', inserted, vtwinTotal, errors);
    }
    progress('VTwin', inserted, vtwinTotal, errors);
    console.log(`\n  ✅ VTwin: ${inserted} inserted, ${errors} errors`);

    // ── Re-add FK constraints ────────────────────────────────────────────────
    console.log('\nRe-adding FK constraints...');
    await client.query(`
      ALTER TABLE catalog_fitment_v2 ADD CONSTRAINT catalog_fitment_v2_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
      ALTER TABLE product_fitment_year_model ADD CONSTRAINT product_fitment_year_model_unified_id_fkey
        FOREIGN KEY (unified_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
      ALTER TABLE vendor_offers ADD CONSTRAINT vendor_offers_catalog_product_id_fkey
        FOREIGN KEY (catalog_product_id) REFERENCES catalog_unified(id) ON DELETE CASCADE;
    `);

    // ── Summary ──────────────────────────────────────────────────────────────
    const summary = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source_vendor='PU' THEN 1 END) as pu,
        COUNT(CASE WHEN source_vendor='WPS' THEN 1 END) as wps,
        COUNT(CASE WHEN source_vendor='VTWIN' THEN 1 END) as vtwin,
        COUNT(CASE WHEN in_stock THEN 1 END) as in_stock,
        COUNT(image_url) as has_image,
        COUNT(oem_numbers) as has_oem
      FROM catalog_unified
    `);
    console.log('\n✅ catalog_unified summary:', summary.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
