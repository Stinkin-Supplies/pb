#!/usr/bin/env node
// fix_accessories_misc_wave2.mjs
//
// Wave-2 classifier for the 2,200 rows still stuck in Accessories & Misc
// after the first pass (fix_accessories_misc_taxonomy.mjs) handled the
// ~1,003 confident matches (bolt kits, merchandising, wheels, 5
// category-only moves).
//
// Built from evidence in audit_accessories_misc_wave2.mjs's leading-word
// tally and 150-row alphabetical sample, not guesswork. Real clusters
// found: generic hardware (washers/screws/bolts), wheels/wheel hardware,
// shifter linkage, primary/belt drive, ignition/electrical, engine
// internals, merchandise/novelty, frame/body panels.
//
// Same conventions as every prior wave-2/subcat script this session:
//   - Postgres-safe boundaries: (^|[\s/'-]) / ([\s/'-]|$), no \b
//   - Multiple destinations, ordered rule list, first match wins
//   - Ambiguous/no-signal rows held back, not force-classified
//   - dotenv from repo-root .env.local/.env, CATALOG_DATABASE_URL, pg.Pool
//
// Usage:
//   node fix_accessories_misc_wave2.mjs           (dry run)
//   node fix_accessories_misc_wave2.mjs --apply   (writes)

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not found -- check .env.local / .env at repo root.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function B(s) {
  return '(^|[\\s/\',-])' + s + '([\\s/\',-]|$)';
}

// Rules in priority order -- first match wins. Each: { category, subcat, pattern }
var RULES = [
  // --- Wheels & Tires: bare wheel/rim/hub rows without a "Wheels & Tires"
  // keyword hit in the first pass (sized wheels, wheel covers, rim strips,
  // hub caps, bearings, wheel weights, wheel chocks, spoke hardware)
  { category: 'Wheels & Tires', subcat: 'Wheels',
    pattern: B('(FRONT|REAR) WHEELS?') + '|' + B('WHEEL ASSEMBLY') + '|' + B('VORTEX (FRONT|REAR) WHEELS?') + '|' + B('REVOLVER (FRONT|REAR) WHEELS?') + '|' + B('MANHATTAN (FRONT|REAR) WHEELS?') + '|' + B('KOOL KAT (FRONT|REAR) WHEELS?') + '|' + B('FLAT TRACK WHEELS?') + '|' + B('WHEEL SAMPLE') },
  { category: 'Wheels & Tires', subcat: 'Hubs & Spokes',
    pattern: B('STAR HUB') + '|' + B('HUB CAPS?') + '|' + B('HUBCAPS?') + '|' + B('SPOKE THREAD PROTECTOR') },
  { category: 'Wheels & Tires', subcat: 'Bearings & Seals',
    pattern: B('TIMKEN BEARING') + '|' + B('RADIAL BALL BEARING') },

  // --- Transmission & Clutch: belt drive / primary
  { category: 'Transmission & Clutch', subcat: 'Primary Drive & Belt Drive',
    pattern: B('BELT DRIVE') + '|' + B('PRIMARY (COVER|OIL|NERF PLATE|BREATHER)') + '|' + B('INNER PRIMARY') + '|' + B('OUTER PRIMARY') + '|' + B('THROW ?OUT BEARING') },
  { category: 'Transmission & Clutch', subcat: 'Shifter Forks & Gears',
    pattern: B('SHIFTER (CONTROL|LINKAGE|BRACKET|BALL|SHAFT|ARM|TOP LINKAGE|GATE)') + '|' + B('SHIFT(ER)? KIT') },

  // --- Electrical: ignition coil covers, connectors, generator, horns, bulbs
  { category: 'Electrical', subcat: 'Ignition Coil Hardware',
    pattern: B('COIL COVER') + '|' + B('COIL MOUNT') + '|' + B('DYNATEK.*COIL') },
  { category: 'Electrical', subcat: 'Connectors & Terminals',
    pattern: B('DEUTSCH.*CONNECTOR') + '|' + B('GROUND TERMINAL') },
  { category: 'Electrical', subcat: 'Generators & Starters',
    pattern: B('GENERATOR POLE') + '|' + B('STARTER (THRU )?BOLTS?') },
  { category: 'Electrical', subcat: 'Horns',
    pattern: B('HORNS?') },
  { category: 'Electrical', subcat: 'LED Bulbs',
    pattern: B('WATT BULB') + '|' + B('WEDGE STYLE BULB') + '|' + B('SEALED BEAM') },

  // --- Engine: valve/cam/breather/oil system internals
  { category: 'Engine', subcat: 'Valves & Valve Train',
    pattern: B('VALVE (KEEPER|STEM SEAL)') + '|' + B('INTAKE VALVE') + '|' + B('CAM BEARING') + '|' + B('ROCKER (NUT|INNER NUT)') + '|' + B('ROCKER BOX') },

  // --- Hardware, Covers & General: generic fasteners not caught by the
  // stricter first-pass Bolt Kit patterns (bare washers/screws/bolts/nuts)
  { category: 'Hardware, Covers & General', subcat: 'Bolt Kits, Hardware Assortments & Replenishment',
    pattern: B('(PLAIN|STEEL|REPLICA|ZINC|JAMES BRASS|BAKELITE|NYLON|STAR|SPLIT|FIBER) WASHERS?') + '|' + B('ALLEN (BUTTON HEAD )?SCREWS?') + '|' + B('HEX HEAD (MACHINE )?SCREWS?') + '|' + B('OVAL SLOTTED SCREW') + '|' + B('BUTTON HEAD.*SCREW') + '|' + B('SHOULDER BOLT') + '|' + B('CHROME BOLT SET') + '|' + B('PIKE NUTS?') + '|' + B('CADMIUM HEADBOLT') + '|' + B('FLAT ?HEAD (MACHINE|PHILLIPS)? ?SCREWS?') + '|' + B('COUNTERSUNK (HEAD )?SCREWS?') + '|' + B('RECESSED (TRUSS )?HEAD SCREWS?') + '|' + B('LOK-?THREAD SCREWS?') + '|' + B('12 POINT HEAD SCREWS?') + '|' + B('CARRIAGE BOLTS?') + '|' + B('ALLEN (CAPS|END PLUGS?|HOLE PLUGS?)') + '|' + B('SOCKET BOLT COVER') + '|' + B('MAGNETIC SET SCREW') + '|' + B('U-?CLAMPS?') + '|' + B('STUD INSTALLATION TOOL') + '|' + B('TIE WRAPS?') + '|' + B('BALL BEARINGS?') + '|' + B('WASHER KITS?') + '|' + B('STUD WASHER') + '|' + B('J-?CLAMPS?') },
  { category: 'Engine', subcat: 'Breathers & Oil System',
    pattern: B('BREATHER (GEAR VALVE|TUBE|BOLT)') + '|' + B('REED BREATHER VALVE') + '|' + B('OIL (PRESSURE SEAL|FEED PUMP|FILL FUNNEL)') },
  { category: 'Wheels & Tires', subcat: 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
    pattern: B('RIM STRIP') + '|' + B('DROP CENTER RIM') + '|' + B('WHEEL WEIGHTS?') + '|' + B('WHEEL COVER') + '|' + B('WHEEL CHOCK') + '|' + B('REAR RIM') + '|' + B('REPLICA WHEEL') + '|' + B('RIM (FRONT|REAR)') + '|' + B('ROLLED EDGE RIM') + '|' + B('DROP CENTER (STEEL )?RIM') + '|' + B('TUBE.*VALVE STEM') },
  { category: 'Wheels & Tires', subcat: 'Axles & Spacers',
    pattern: B('REAR (HEX )?AXLE') + '|' + B('AXLE SLEEVE') + '|' + B('FRONT HUB WASHER') },
  { category: 'Handlebar & Controls', subcat: 'Throttle Assembly',
    pattern: B('TURN (FAST )?THROTTLE KIT') },
  { category: 'Transmission & Clutch', subcat: 'Chains & Hardware',
    pattern: B('BLOCK CHAIN') },
  { category: 'Hardware, Covers & General', subcat: 'Merchandising',
    pattern: B('TIN SIGN') + '|' + B('BELT BUCKLE') + '|' + B('SHOT GLASS') + '|' + B('ANIMAL RIDER TOY') + '|' + B('HOCKEY MASK') + '|' + B('TOILET PAPER HOLDER') + '|' + B('TOWEL HOLDER') + '|' + B('MOTORCYCLEPEDIA') + '|' + B('WALL OF DEATH') + '|' + B('DOPE REFERENCE GUIDE') + '|' + B('MOTORDROMES') },
];

// Explicit hold-back: rows that showed up in the sample but genuinely
// don't fit any of the above, or need a human call.
var KNOWN_AMBIGUOUS_PATTERNS = [
  B('ROUND PUB TABLE'),         // furniture, not a motorcycle part at all
  B('MOTORSHOP COMMENTS'),      // unclear what this even is
  B('TOKEN TUNING PACK'),       // DJ 200 Token Tuning Pack -- unclear product type
  B('DEALER MARKETING PROMO PACK'),
  B('CHROME CONCHO'),           // leather/apparel hardware, unclear category fit
  B('V-TWIN CAR'),              // model car, not a motorcycle part
  B('ENGINE PLAQUE'),
  B('PARTS MANUAL'),
  B('PRODUCT GUIDE'),
  B('MOTORCYCLE MODEL'),
  B('WALL ART'),
  B('CHOPPER ART'),
  B('DISPLAY MODEL'),
  B('NUMBER PLATE SET'),
  B('DRAG DOOR/TRUCK STCKER'),
];

async function main() {
  console.log('='.repeat(78));
  console.log('ACCESSORIES & MISC WAVE-2 CLASSIFIER (' + (APPLY ? 'APPLY' : 'DRY RUN') + ')');
  console.log('='.repeat(78));

  const result = await pool.query(
    "SELECT id, sku, name FROM catalog_unified " +
    "WHERE display_category = 'Accessories & Misc' AND display_subcategory IS NULL AND is_active = true " +
    "ORDER BY name"
  );
  const rows = result.rows;

  console.log('');
  console.log('Total NULL rows: ' + rows.length);
  console.log('');

  const knownAmbiguousRe = new RegExp(KNOWN_AMBIGUOUS_PATTERNS.join('|'), 'i');

  const tally = {};
  const samples = {};
  const toUpdate = [];
  const ambiguous = [];
  const unmatched = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (knownAmbiguousRe.test(row.name)) {
      ambiguous.push(row);
      continue;
    }

    let matched = null;
    for (let j = 0; j < RULES.length; j++) {
      const rule = RULES[j];
      const re = new RegExp(rule.pattern, 'i');
      if (re.test(row.name)) {
        matched = rule;
        break;
      }
    }

    if (matched) {
      const key = matched.category + ' / ' + matched.subcat;
      tally[key] = (tally[key] || 0) + 1;
      if (!samples[key]) samples[key] = [];
      if (samples[key].length < 6) samples[key].push(row);
      toUpdate.push({ id: row.id, category: matched.category, subcat: matched.subcat });
    } else {
      unmatched.push(row);
    }
  }

  console.log('-'.repeat(78));
  console.log('Classification tally:');
  console.log('-'.repeat(78));
  const sortedKeys = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    console.log('  ' + key.padEnd(60) + ' ' + tally[key]);
  }
  console.log('  (explicit ambiguous, held back)'.padEnd(63) + ambiguous.length);
  console.log('  (unmatched, held back)'.padEnd(63) + unmatched.length);

  console.log('');
  console.log('Sample of matched rows:');
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    console.log('');
    console.log('  ' + key + ':');
    const s = samples[key];
    for (let k = 0; k < s.length; k++) {
      console.log('      [' + s[k].id + '] ' + s[k].name);
    }
  }

  if (ambiguous.length > 0) {
    console.log('');
    console.log('Explicit ambiguous rows (NOT touched):');
    for (let i = 0; i < ambiguous.length; i++) {
      console.log('      [' + ambiguous[i].id + '] ' + ambiguous[i].name);
    }
  }

  console.log('');
  console.log('Unmatched sample (up to 40, NOT touched):');
  for (let i = 0; i < Math.min(40, unmatched.length); i++) {
    console.log('      [' + unmatched[i].id + '] ' + unmatched[i].name);
  }

  console.log('');
  console.log('='.repeat(78));
  console.log('TOTAL: ' + toUpdate.length + ' matched' + (APPLY ? ' and applied' : ' (dry run, not written)') +
    ', ' + ambiguous.length + ' ambiguous held back, ' + unmatched.length + ' unmatched held back.');
  console.log('='.repeat(78));

  if (APPLY && toUpdate.length > 0) {
    for (let i = 0; i < toUpdate.length; i++) {
      const u = toUpdate[i];
      await pool.query(
        'UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now() WHERE id = $3',
        [u.category, u.subcat, u.id]
      );
    }
    console.log('');
    console.log('Applied: ' + toUpdate.length + ' rows updated.');
  }

  if (!APPLY) {
    console.log('');
    console.log('(dry run -- no rows written. Re-run with --apply to commit.)');
  }

  await pool.end();
}

main().catch(function (err) {
  console.error('Error:', err);
  process.exit(1);
});
