/**
 * assign-internal-skus.js
 *
 * Assigns vendor-blind internal SKUs (e.g. ENG-100142) to every row in
 * catalog_products that doesn't have one yet, then propagates to catalog_unified.
 *
 * Also populates:
 *   display_brand      — what the storefront shows the customer
 *   manufacturer_brand — the actual maker
 *
 * Run:
 *   CATALOG_DATABASE_URL="postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog" \
 *     node scripts/ingest/assign-internal-skus.js
 *
 * Safe to re-run: skips products that already have an internal_sku.
 * Kill-safe: counter is saved to DB after every batch — restart picks up exactly where it left off.
 */

'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: false,
  max: 5,
});

// Larger batch = fewer round-trips. Bulk unnest() keeps memory reasonable.
const BATCH = 2000;

// =============================================================================
// PREFIX ASSIGNMENT
// Rules are checked top-to-bottom; first match wins.
// Checks: product name (uppercase), then category, then brand.
// =============================================================================

/** @type {Array<{test: (name:string, cat:string, brand:string)=>boolean, prefix:string}>} */
const PREFIX_RULES = [

  // ── WHEELS / TIRES ────────────────────────────────────────────────────────
  { prefix: 'WHL', test: (n) => /\bTIRE\b/.test(n) },
  { prefix: 'WHL', test: (n) => /\bWHEEL\b/.test(n) && !/WHEEL(IE)?\s+(KIT|STAND)/.test(n) },
  { prefix: 'WHL', test: (n) => /\b(RIM|SPOKE|HUB|TUBE|INNER\sTUBE)\b/.test(n) },

  // ── BRAKES ────────────────────────────────────────────────────────────────
  { prefix: 'BRK', test: (n) => /\bBRAKE\b/.test(n) },
  { prefix: 'BRK', test: (n) => /\b(ROTOR|CALIPER|BRAKE\s(PAD|LINE|FLUID|DISC|DRUM))\b/.test(n) },
  { prefix: 'BRK', test: (n,_,b) => /\bEBC\b/.test(b) },

  // ── EXHAUST ───────────────────────────────────────────────────────────────
  { prefix: 'EXH', test: (n) => /\b(EXHAUST|MUFFLER|PIPE|HEADER|SLIP-?ON|SLIP ON)\b/.test(n) },
  { prefix: 'EXH', test: (n) => /\bEXHAUST\s(WRAP|CLAMP|MOUNT|HEAT|SHIELD)\b/.test(n) },

  // ── SUSPENSION ────────────────────────────────────────────────────────────
  { prefix: 'SUS', test: (n) => /\b(SHOCK|FORK|SPRING|SUSPENSION|LOWERING\sKIT|PROGRESSIVE)\b/.test(n) },
  { prefix: 'SUS', test: (n) => /\b(FORK\s(SEAL|OIL|TUBE|SLIDER|LEG|SPRING|BRACE))\b/.test(n) },

  // ── LIGHTING ──────────────────────────────────────────────────────────────
  { prefix: 'LIG', test: (n) => /\b(HEADLIGHT|HEAD\sLIGHT|TAILLIGHT|TAIL\sLIGHT|TURN\sSIGNAL)\b/.test(n) },
  { prefix: 'LIG', test: (n) => /\b(LED|LIGHT\s(KIT|BAR|STRIP)|RUNNING\sLIGHT|MARKER\sLIGHT)\b/.test(n) },
  { prefix: 'LIG', test: (n) => /\b(BULB|LAMP|SPOTLIGHT|PASSING\sLAMP)\b/.test(n) },
  { prefix: 'LIG', test: (n) => /^LIGHT\b/.test(n) },

  // ── ELECTRICAL ────────────────────────────────────────────────────────────
  { prefix: 'ELC', test: (n) => /\b(STARTER|STATOR|REGULATOR|RECTIFIER|COIL|IGNITION)\b/.test(n) },
  { prefix: 'ELC', test: (n) => /\b(BATTERY|SPARK\sPLUG|PLUG\sWIRE|CDI|ECU|SWITCH)\b/.test(n) },
  { prefix: 'ELC', test: (n) => /\b(WIRING|HARNESS|RELAY|FUSE|VOLTAGE|ALTERNATOR)\b/.test(n) },
  { prefix: 'ELC', test: (n,_,b) => /\b(CYCLE\sELECTRIC|ACCEL|DYNA|TRANSPO)\b/.test(b) },

  // ── STEERING / CONTROLS ───────────────────────────────────────────────────
  { prefix: 'STR', test: (n) => /\b(HANDLEBAR|HANDLE\sBAR|RISER|CLIP-?ON|APE\sHANGER)\b/.test(n) },
  { prefix: 'STR', test: (n) => /\b(GRIP|THROTTLE|LEVER|MIRROR|CONTROL(S)?|PERCH)\b/.test(n) },
  { prefix: 'STR', test: (n) => /\b(CABLE|CLUTCH\sCLAMP|MASTER\sCYLINDER)\b/.test(n) },

  // ── SEATING ───────────────────────────────────────────────────────────────
  { prefix: 'SEA', test: (n) => /\b(SEAT|SADDLE|BACKREST|PASSENGER\s(SEAT|PAD))\b/.test(n) },

  // ── FENDERS ───────────────────────────────────────────────────────────────
  { prefix: 'FEN', test: (n) => /\b(FENDER|MUDGUARD|FRONT\sFENDER|REAR\sFENDER|FENDER\sSTRUT)\b/.test(n) },

  // ── FUEL SYSTEM ───────────────────────────────────────────────────────────
  { prefix: 'FUL', test: (n) => /\b(CARB(URETOR)?|CARBURETOR|PETCOCK|FUEL\s(FILTER|PUMP|TANK|LINE|CAP|VALVE))\b/.test(n) },
  { prefix: 'FUL', test: (n) => /\b(JET\sKIT|NEEDLE|THROTTLE\sBODY|INJECTOR|EFI|FI\s(KIT|TUNER))\b/.test(n) },
  { prefix: 'FUL', test: (n) => /\b(MIKUNI|DYNOJET|POWER\sCOMMANDER|FUEL\sMOTO)\b/.test(n) },
  { prefix: 'FUL', test: (n,_,b) => /\b(MIKUNI|DYNOJET|EDELBROCK)\b/.test(b) },

  // ── DRIVETRAIN ────────────────────────────────────────────────────────────
  { prefix: 'DRV', test: (n) => /\b(CHAIN|SPROCKET|BELT|CLUTCH|PRIMARY|TRANSMISSION)\b/.test(n) },
  { prefix: 'DRV', test: (n) => /\b(DRIVE\sBELT|DRIVE\sCHAIN|FINAL\sDRIVE|GEARBOX)\b/.test(n) },
  { prefix: 'DRV', test: (n) => /\b(CLUTCH\s(KIT|PLATE|BASKET|SPRING|COVER|CABLE))\b/.test(n) },

  // ── BODY / TRIM ───────────────────────────────────────────────────────────
  { prefix: 'BDY', test: (n) => /\b(FAIRING|TANK\sCOVER|SIDE\sCOVER|TANK\sPANEL|BODY\s(KIT|PANEL))\b/.test(n) },
  { prefix: 'BDY', test: (n) => /\b(TRIM|DASH|CONSOLE|WINDSHIELD|WINDSCREEN)\b/.test(n) },
  { prefix: 'BDY', test: (n) => /\b(LUGGAGE\sRACK|SADDLEBAG|TOUR\sPAK|TOUR-?PAK)\b/.test(n) },

  // ── FOOTWEAR / FOOT CONTROLS ──────────────────────────────────────────────
  { prefix: 'FTR', test: (n) => /\b(FOOT\s?(PEG|BOARD|REST|CONTROL)|FLOORBOARD|HEEL\s?TOE|PEG|FOOTPEG)\b/.test(n) },
  { prefix: 'FTR', test: (n) => /\b(SHIFT\s(LEVER|PEG|LINKAGE)|BRAKE\s(PEDAL|ROD|LEVER\sTIP))\b/.test(n) },

  // ── ENGINE INTERNALS (broad — catch-all before ACC) ───────────────────────
  { prefix: 'ENG', test: (n) => /\b(GASKET|PISTON|RING|VALVE|CAM|LIFTER|PUSHROD|CYLINDER)\b/.test(n) },
  { prefix: 'ENG', test: (n) => /\b(OIL\s(FILTER|PUMP|PAN|COOLER|LINE|DRAIN)|AIR\sFILTER|K&N)\b/.test(n) },
  { prefix: 'ENG', test: (n) => /\b(BEARING|SEAL|O-?RING|REBUILD\sKIT|ENGINE\s(KIT|CASE|COVER))\b/.test(n) },
  { prefix: 'ENG', test: (n) => /\b(FILTER|RADIATOR|COOLANT|THERMOSTAT|WATER\sPUMP)\b/.test(n) },
  { prefix: 'ENG', test: (n,_,b) => /\b(COMETIC|JAMES\sGASKETS?|KIBBLE\s?WHITE|WISECO|NAMURA|VERTEX|ATHENA)\b/.test(b) },

  // ── ACCESSORIES / APPAREL / EVERYTHING ELSE ───────────────────────────────
  { prefix: 'ACC', test: () => true },
];

function assignPrefix(name, category, brand) {
  const n = (name     ?? '').toUpperCase();
  const c = (category ?? '').toUpperCase();
  const b = (brand    ?? '').toUpperCase();
  for (const rule of PREFIX_RULES) {
    if (rule.test(n, c, b)) return rule.prefix;
  }
  return 'ACC';
}

// =============================================================================
// DISPLAY BRAND RULES
// =============================================================================

const DISTRIBUTOR_NAMES = new Set([
  'WPS', 'WESTERN POWER SPORTS',
  'PARTS UNLIMITED', 'LEMANS',
  'TUCKER ROCKY', 'TUCKER POWERSPORTS',
  'DRAG SPECIALTIES MFG',
]);

const BRAND_DISPLAY_MAP = {
  'DRAG SPECIALTIES':     'DS',
  'DS':                   'DS',
  'HARDDRIVE':            'HardDrive',
  'HARD DRIVE':           'HardDrive',
  'PARTS UNLIMITED':      null,
  'WPS':                  null,
  'ALL BALLS':            'All Balls',
  'ALL BALLS RACING':     'All Balls',
  'COMETIC':              'Cometic',
  'JAMES GASKETS':        'James Gaskets',
  'KIBBLE WHITE':         'Kibble White',
  'KIBBLE-WHITE':         'Kibble White',
  'K&N':                  'K&N',
  'K AND N':              'K&N',
  'EBC':                  'EBC',
  'EBC BRAKES':           'EBC',
  'MOTION PRO':           'Motion Pro',
  'NAMZ':                 'NAMZ',
  'CYCLE ELECTRIC':       'Cycle Electric',
  'CYCLE PRO':            'Cycle Pro',
  'COLONY':               'Colony',
  'SMP':                  'SMP',
  'CARLISLE':             'Carlisle',
  'DIAMOND CHAIN':        'Diamond Chain',
  'AUTOLITE':             'Autolite',
  'NGK':                  'NGK',
  'HIFLO':                'HiFloFiltro',
  'UNI FILTER':           'Uni Filter',
  'ACCEL':                'Accel',
  'FLY RACING':           'Fly Racing',
  'ALPINESTARS':          'Alpinestars',
  'SCORPION EXO':         'Scorpion EXO',
  'WISECO':               'Wiseco',
  'DYNOJET':              'Dynojet',
  'MIKUNI':               'Mikuni',
  'SHINKO':               'Shinko',
  'METZELER':             'Metzeler',
  'DUNLOP':               'Dunlop',
  'BRIDGESTONE':          'Bridgestone',
  'MICHELIN':             'Michelin',
  'PIRELLI':              'Pirelli',
  'D.I.D':               'DID',
  'DID':                  'DID',
  'JT':                   'JT Sprockets',
  'SUNSTAR':              'Sunstar',
  'VORTEX':               'Vortex',
  'PRO-WHEEL':            'Pro-Wheel',
  'DUBYA':                'Dubya',
};

function resolveDisplayBrand(brand, name) {
  if (!brand || !brand.trim()) {
    return { displayBrand: null, manufacturerBrand: null };
  }
  const key = brand.trim().toUpperCase();
  if (DISTRIBUTOR_NAMES.has(key)) {
    return { displayBrand: null, manufacturerBrand: null };
  }
  if (key in BRAND_DISPLAY_MAP) {
    const mapped = BRAND_DISPLAY_MAP[key];
    return {
      displayBrand:      mapped,
      manufacturerBrand: mapped ?? brand.trim(),
    };
  }
  const cleaned = titleCase(brand.trim());
  return { displayBrand: cleaned, manufacturerBrand: cleaned };
}

function titleCase(str) {
  const small = new Set(['A','AN','THE','AND','OR','BUT','IN','ON','AT','TO','FOR','OF','WITH','BY']);
  return str.toLowerCase().replace(/\b\w+/g, (w, i) =>
    (i === 0 || !small.has(w.toUpperCase())) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  );
}

// =============================================================================
// SLUG GENERATION
// =============================================================================

function generateSlug(name, internalSku, brand) {
  let n = (name ?? '').trim();
  if (brand) {
    const brandParts = brand.trim().split(/\s+/);
    const nameWords  = n.split(/\s+/);
    let match = 0;
    for (let i = 0; i < brandParts.length && i < nameWords.length; i++) {
      if (nameWords[i].toLowerCase() === brandParts[i].toLowerCase()) match++;
      else break;
    }
    if (match === brandParts.length) n = nameWords.slice(match).join(' ');
  }
  const slug = n
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
  const skuPart = internalSku.toLowerCase();
  return slug ? `${slug}-${skuPart}` : skuPart;
}

// =============================================================================
// MAIN
// =============================================================================

async function run() {
  console.log('\n🏷️   Internal SKU Assignment  (bulk mode)');
  console.log('─'.repeat(55));

  const client = await pool.connect();
  try {
    // Verify migration ran
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'catalog_products' AND column_name = 'internal_sku'
    `);
    if (colCheck.rowCount === 0) {
      console.error('\n❌  Column internal_sku not found on catalog_products.');
      console.error('    Run migration-120-internal-sku.sql first.\n');
      return;
    }

    const { rows: [{ pending }] } = await client.query(
      `SELECT COUNT(*) AS pending FROM catalog_products WHERE internal_sku IS NULL`
    );
    console.log(`    Products needing SKU : ${Number(pending).toLocaleString()}`);

    if (Number(pending) === 0) {
      console.log('    ✓ All products already have internal SKUs.\n');
      return;
    }

    // Initialize counters from the ACTUAL max assigned values in catalog_products.
    // This is always correct even if sku_counter was never saved (e.g. after a killed run).
    const { rows: counters } = await client.query(
      `SELECT prefix, last_val FROM sku_counter ORDER BY prefix`
    );
    const counterMap = {};
    counters.forEach(r => { counterMap[r.prefix] = Number(r.last_val); });

    // Override with real maximums from already-assigned SKUs (authoritative source)
    const { rows: realMaxes } = await client.query(`
      SELECT
        SUBSTRING(internal_sku, 1, 3)              AS prefix,
        MAX(CAST(SUBSTRING(internal_sku, 5) AS INTEGER)) AS max_val
      FROM catalog_products
      WHERE internal_sku IS NOT NULL
        AND internal_sku ~ '^[A-Z]{3}-[0-9]+$'
      GROUP BY 1
    `);
    realMaxes.forEach(r => {
      const real = Number(r.max_val);
      if (real > (counterMap[r.prefix] ?? 0)) {
        counterMap[r.prefix] = real;
        console.log(`    Counter sync  ${r.prefix}: sku_counter was stale → advanced to ${real}`);
      }
    });

    let processed  = 0;
    let skuErrors  = 0;
    const startedAt = Date.now();

    console.log(`    Batch size           : ${BATCH.toLocaleString()} rows`);
    console.log('\n    Processing…\n');

    while (true) {
      // Always fetch the next unassigned batch — no OFFSET needed because
      // committed rows become internal_sku IS NOT NULL and drop out of the WHERE.
      const { rows } = await client.query(`
        SELECT id, sku, name, category, brand
        FROM catalog_products
        WHERE internal_sku IS NULL
        ORDER BY id
        LIMIT $1
      `, [BATCH]);

      if (rows.length === 0) break;

      // ── Build update arrays in JS ──────────────────────────────────────────
      const ids               = [];
      const internalSkus      = [];
      const displayBrands     = [];
      const manufacturerBrands = [];
      const slugs             = [];
      const vendorSkus        = [];   // for catalog_unified join

      // Track which prefixes change in this batch (for counter updates)
      const batchCounterChanges = {};

      for (const row of rows) {
        const prefix = assignPrefix(row.name, row.category, row.brand);
        counterMap[prefix] = (counterMap[prefix] ?? 100000) + 1;
        batchCounterChanges[prefix] = counterMap[prefix];

        const internalSku = `${prefix}-${counterMap[prefix]}`;
        const { displayBrand, manufacturerBrand } = resolveDisplayBrand(row.brand, row.name);
        const slug = generateSlug(row.name, internalSku, row.brand);

        ids.push(row.id);
        internalSkus.push(internalSku);
        displayBrands.push(displayBrand);
        manufacturerBrands.push(manufacturerBrand);
        slugs.push(slug);
        vendorSkus.push(row.sku);
      }

      // ── Single transaction: 2 bulk UPDATEs + counter saves ────────────────
      await client.query('BEGIN');
      try {
        // 1. Bulk UPDATE catalog_products via unnest()
        await client.query(`
          UPDATE catalog_products AS t
          SET internal_sku       = v.internal_sku,
              display_brand      = v.display_brand,
              manufacturer_brand = v.manufacturer_brand,
              slug               = v.slug,
              updated_at         = NOW()
          FROM (
            SELECT
              unnest($1::int[])  AS id,
              unnest($2::text[]) AS internal_sku,
              unnest($3::text[]) AS display_brand,
              unnest($4::text[]) AS manufacturer_brand,
              unnest($5::text[]) AS slug
          ) AS v
          WHERE t.id = v.id AND t.internal_sku IS NULL
        `, [ids, internalSkus, displayBrands, manufacturerBrands, slugs]);

        // 2. Bulk UPDATE catalog_unified via unnest()
        await client.query(`
          UPDATE catalog_unified AS t
          SET internal_sku       = v.internal_sku,
              display_brand      = v.display_brand,
              manufacturer_brand = v.manufacturer_brand,
              slug               = v.slug,
              updated_at         = NOW()
          FROM (
            SELECT
              unnest($1::text[]) AS sku,
              unnest($2::text[]) AS internal_sku,
              unnest($3::text[]) AS display_brand,
              unnest($4::text[]) AS manufacturer_brand,
              unnest($5::text[]) AS slug
          ) AS v
          WHERE t.sku = v.sku AND t.internal_sku IS NULL
        `, [vendorSkus, internalSkus, displayBrands, manufacturerBrands, slugs]);

        // 3. Persist counter values — saved with the batch so kill-safe
        for (const [prefix, val] of Object.entries(batchCounterChanges)) {
          await client.query(
            `UPDATE sku_counter SET last_val = $1 WHERE prefix = $2`,
            [val, prefix]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n  ⚠  Batch error (offset ~${processed}):`, err.message);
        skuErrors += rows.length;
        // Re-sync counterMap from DB so the next batch doesn't reuse failed SKUs
        const { rows: freshCounters } = await client.query(
          `SELECT prefix, last_val FROM sku_counter ORDER BY prefix`
        );
        freshCounters.forEach(r => { counterMap[r.prefix] = Number(r.last_val); });
        break; // stop on error — re-run will skip already-assigned rows
      }

      processed += rows.length;

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      const pct = ((processed / Number(pending)) * 100).toFixed(1);
      process.stdout.write(
        `\r    ${processed.toLocaleString()} / ${Number(pending).toLocaleString()}  (${pct}%)  ${elapsed}s elapsed`
      );
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const { rows: [{ total_with_sku }] } = await client.query(
      `SELECT COUNT(*) AS total_with_sku FROM catalog_products WHERE internal_sku IS NOT NULL`
    );
    const { rows: breakdown } = await client.query(`
      SELECT SUBSTRING(internal_sku, 1, 3) AS prefix, COUNT(*) AS count
      FROM catalog_products
      WHERE internal_sku IS NOT NULL
      GROUP BY 1 ORDER BY count DESC
    `);

    const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('\n\n' + '─'.repeat(55));
    console.log(`✅  Done in ${totalSec}s`);
    console.log(`    Products with internal SKU : ${Number(total_with_sku).toLocaleString()}`);
    if (skuErrors) console.log(`    ⚠  Errors (not assigned)  : ${skuErrors}`);
    console.log('\n    Breakdown by prefix:');
    breakdown.forEach(r => {
      console.log(`      ${r.prefix}  ${Number(r.count).toLocaleString().padStart(7)}`);
    });
    console.log('─'.repeat(55) + '\n');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  pool.end();
  process.exit(1);
});
