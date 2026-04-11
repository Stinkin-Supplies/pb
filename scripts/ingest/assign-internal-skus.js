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
 *   npx dotenv -e .env.local -- node scripts/ingest/assign-internal-skus.js
 *
 * Safe to re-run: skips products that already have an internal_sku.
 * Idempotent: uses ON CONFLICT DO NOTHING for counter inserts.
 */

'use strict';

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: false,
  max: 5,
});

const BATCH = 500;

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
  // (ACC is last — true catch-all)
  { prefix: 'ACC', test: () => true },
];

/**
 * Determine the 3-letter prefix for a product.
 * @param {string} name     product name (will be uppercased internally)
 * @param {string} category category string or null
 * @param {string} brand    brand string or null
 * @returns {string} 3-letter prefix
 */
function assignPrefix(name, category, brand) {
  const n = (name    ?? '').toUpperCase();
  const c = (category ?? '').toUpperCase();
  const b = (brand   ?? '').toUpperCase();

  for (const rule of PREFIX_RULES) {
    if (rule.test(n, c, b)) return rule.prefix;
  }
  return 'ACC'; // should never reach here, but safe fallback
}

// =============================================================================
// DISPLAY BRAND RULES
// =============================================================================

/**
 * Pure distributor names — never shown to customers as a product brand.
 * These appear as source/vendor, not as the product's maker.
 */
const DISTRIBUTOR_NAMES = new Set([
  'WPS', 'WESTERN POWER SPORTS',
  'PARTS UNLIMITED', 'LEMANS',
  'TUCKER ROCKY', 'TUCKER POWERSPORTS',
  'DRAG SPECIALTIES MFG',   // the mfg entity — DS the brand is fine
]);

/**
 * Map vendor-cased brand strings to a clean display name.
 * Keys are uppercased for comparison.
 */
const BRAND_DISPLAY_MAP = {
  'DRAG SPECIALTIES':     'DS',
  'DS':                   'DS',
  'HARDDRIVE':            'HardDrive',
  'HARD DRIVE':           'HardDrive',
  'PARTS UNLIMITED':      null,   // distributor — omit
  'WPS':                  null,   // distributor — omit
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

/**
 * Return the customer-facing display brand for a product.
 * @param {string|null} brand   raw brand from vendor data
 * @param {string|null} name    product name (for house-brand detection)
 * @returns {{ displayBrand: string|null, manufacturerBrand: string|null }}
 */
function resolveDisplayBrand(brand, name) {
  if (!brand || !brand.trim()) {
    return { displayBrand: null, manufacturerBrand: null };
  }

  const key = brand.trim().toUpperCase();

  // Pure distributor — don't show
  if (DISTRIBUTOR_NAMES.has(key)) {
    return { displayBrand: null, manufacturerBrand: null };
  }

  // Known brand with explicit mapping
  if (key in BRAND_DISPLAY_MAP) {
    const mapped = BRAND_DISPLAY_MAP[key];
    return {
      displayBrand:      mapped,
      manufacturerBrand: mapped ?? brand.trim(),
    };
  }

  // Unknown brand — use as-is with title-case cleanup
  const cleaned = titleCase(brand.trim());
  return {
    displayBrand:      cleaned,
    manufacturerBrand: cleaned,
  };
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

/**
 * Generate a vendor-blind slug from a product name and internal SKU.
 * "Drag Specialties Oil Filter Chrome" + "ENG-100142"
 *   → "oil-filter-chrome-eng-100142"
 * Brand prefix stripped, internal SKU appended.
 */
function generateSlug(name, internalSku, brand) {
  let n = (name ?? '').trim();

  // Strip brand prefix from name if it starts with the brand name
  if (brand) {
    const brandParts = brand.trim().split(/\s+/);
    const nameWords  = n.split(/\s+/);
    // If name starts with brand words, strip them
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
    .slice(0, 60)               // cap name portion at 60 chars
    .replace(/-$/, '');         // no trailing dash

  const skuPart = internalSku.toLowerCase(); // e.g. "eng-100142"
  return slug ? `${slug}-${skuPart}` : skuPart;
}

// =============================================================================
// MAIN
// =============================================================================

async function run() {
  console.log('\n🏷️   Internal SKU Assignment');
  console.log('─'.repeat(55));

  const client = await pool.connect();
  try {
    // Verify columns exist
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'catalog_products'
        AND column_name = 'internal_sku'
    `);
    if (colCheck.rowCount === 0) {
      console.error('\n❌  Column internal_sku not found on catalog_products.');
      console.error('    Run migration-120-internal-sku.sql first.\n');
      return;
    }

    // Count pending
    const { rows: [{ pending }] } = await client.query(
      `SELECT COUNT(*) AS pending FROM catalog_products WHERE internal_sku IS NULL`
    );
    console.log(`    Products needing SKU: ${Number(pending).toLocaleString()}`);

    if (Number(pending) === 0) {
      console.log('    ✓ All products already have internal SKUs.\n');
      return;
    }

    // Load counter values
    const { rows: counters } = await client.query(
      `SELECT prefix, last_val FROM sku_counter ORDER BY prefix`
    );
    const counterMap = {};
    counters.forEach(r => { counterMap[r.prefix] = r.last_val; });

    // Track updates needed per prefix
    const newCounters = { ...counterMap };

    // Fetch products in batches
    let offset = 0;
    let processed = 0;
    let skuErrors = 0;

    console.log('\n    Processing…\n');

    while (true) {
      const { rows } = await client.query(`
        SELECT id, sku, name, category, brand, slug
        FROM catalog_products
        WHERE internal_sku IS NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH, offset]);

      if (rows.length === 0) break;

      // Build batch updates
      const updates = [];

      for (const row of rows) {
        const prefix      = assignPrefix(row.name, row.category, row.brand);
        newCounters[prefix] = (newCounters[prefix] ?? 100000) + 1;
        const internalSku = `${prefix}-${newCounters[prefix]}`;

        const { displayBrand, manufacturerBrand } = resolveDisplayBrand(row.brand, row.name);
        const newSlug = generateSlug(row.name, internalSku, row.brand);

        updates.push({
          id: row.id,
          internalSku,
          displayBrand,
          manufacturerBrand,
          slug: newSlug,
        });
      }

      // Batch UPDATE catalog_products
      await client.query('BEGIN');
      try {
        for (const u of updates) {
          await client.query(`
            UPDATE catalog_products
            SET internal_sku       = $1,
                display_brand      = $2,
                manufacturer_brand = $3,
                slug               = $4,
                updated_at         = NOW()
            WHERE id = $5 AND internal_sku IS NULL
          `, [u.internalSku, u.displayBrand, u.manufacturerBrand, u.slug, u.id]);
        }

        // Propagate to catalog_unified (match on sku column)
        // catalog_unified.sku is the vendor SKU = catalog_products.sku
        const cpSkus = rows.map(r => r.sku);
        if (cpSkus.length > 0) {
          const skuToInternal = {};
          updates.forEach((u, i) => { skuToInternal[rows[i].sku] = u; });

          for (const vendorSku of cpSkus) {
            const u = skuToInternal[vendorSku];
            if (!u) continue;
            await client.query(`
              UPDATE catalog_unified
              SET internal_sku       = $1,
                  display_brand      = $2,
                  manufacturer_brand = $3,
                  slug               = $4,
                  updated_at         = NOW()
              WHERE sku = $5 AND internal_sku IS NULL
            `, [u.internalSku, u.displayBrand, u.manufacturerBrand, u.slug, vendorSku]);
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n  ⚠  Batch error at offset ${offset}:`, err.message);
        skuErrors += rows.length;
      }

      processed += rows.length;
      offset    += rows.length;
      process.stdout.write(`\r    ${processed.toLocaleString()} / ${Number(pending).toLocaleString()} processed…`);
    }

    // Save updated counters back to DB
    for (const [prefix, val] of Object.entries(newCounters)) {
      await client.query(`
        UPDATE sku_counter SET last_val = $1, updated_at = NOW() WHERE prefix = $2
      `, [val, prefix]);
    }

    // Summary
    const { rows: [{ total_with_sku }] } = await client.query(
      `SELECT COUNT(*) AS total_with_sku FROM catalog_products WHERE internal_sku IS NOT NULL`
    );

    // Show prefix breakdown
    const { rows: breakdown } = await client.query(`
      SELECT
        SUBSTRING(internal_sku, 1, 3) AS prefix,
        COUNT(*) AS count
      FROM catalog_products
      WHERE internal_sku IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
    `);

    console.log('\n\n' + '─'.repeat(55));
    console.log(`✅  Done`);
    console.log(`    Products with internal SKU: ${Number(total_with_sku).toLocaleString()}`);
    if (skuErrors) console.log(`    ⚠  Errors (not assigned): ${skuErrors}`);
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
