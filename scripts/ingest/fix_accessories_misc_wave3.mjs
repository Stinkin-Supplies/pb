#!/usr/bin/env node
// fix_accessories_misc_wave3.mjs
//
// Wave-3 classifier for the rows still in Accessories & Misc after
// wave-1 and wave-2 (1,003 + 1,081 = 2,084 rows already reclassified
// from the original 3,203). Built from audit_accessories_misc_wave3.mjs's
// leading-word tally and 200-row alphabetical sample, refined over
// multiple dry-run rounds.
//
// Same conventions as prior wave scripts: Postgres-safe B() boundary
// helper including comma in the class, ordered rule list (first match
// wins), ambiguous/no-signal rows held back not force-classified.
//
// Usage:
//   node fix_accessories_misc_wave3.mjs           (dry run)
//   node fix_accessories_misc_wave3.mjs --apply   (writes)

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

var RULES = [
  // --- Transmission & Clutch
  { category: 'Transmission & Clutch', subcat: 'Shifter Forks & Gears',
    pattern: B('SHIFTER (DRUM|BUSHING|CAM LOCK|CAM PLATE|RATCHET ARM|SUPPORT BRACKET|MOUNT|LEVER|SPACER)') + '|' + B('CAM PLUNGER KIT') + '|' + B('SHIFTER ASSIST') },
  { category: 'Transmission & Clutch', subcat: 'Primary Drive & Belt Drive',
    pattern: B('PRIMARY (BOLT|SCREW|CASE PLUG|NERF BAR)') },
  { category: 'Transmission & Clutch', subcat: 'Pulleys & Sprockets',
    pattern: B('SPROCKET (BOLT|NUT)') + '|' + B('PULLEY NUT') + '|' + B('BOLT SPROCKET SET') },

  // --- Handlebar & Controls: throttle assemblies/hardware
  { category: 'Handlebar & Controls', subcat: 'Throttle Assembly',
    pattern: B('EFI THROTTLE (SHAFT|BODY)') + '|' + B('INNER THROTTLE WIRE') + '|' + B('THROTTLE PLUNGER') + '|' + B('SNAP THROTTLE') + '|' + B('THROTTLE FERRULE') + '|' + B('THROTTLE ASSEMBLY') + '|' + B('THROTTLE BY WIRE') + '|' + B('OLD SCHOOL.*THROTTLE') + '|' + B('THROTTLE SPARK') + '|' + B('THROTTLE/SPARK') + '|' + B('IDLE SPEED ADJUSTMENT') + '|' + B('BILLET THROTTLE TUBE') },

  // --- Engine: valve/oil system internals
  { category: 'Engine', subcat: 'Valves & Valve Train',
    pattern: B('VALVE COVER') + '|' + B('VALVE STEM SEALS?') + '|' + B('MALTESE CROSS VALVE') },
  { category: 'Engine', subcat: 'Breathers & Oil System',
    pattern: B('OIL (PRESSURE SWITCH|SCREEN|PLUMP CHECK VALVE|CONTROL VALVE|LINE)') + '|' + B('FEED OIL LINE') },
  { category: 'Engine', subcat: 'Bearings & Bushings',
    pattern: B('CAM (THRUST WASHER|NEEDLE BEARING)') + '|' + B('ROTOR CAM END BEARING') + '|' + B('STANDARD ROLLER BEARINGS') + '|' + B('KOYO.*BEARING') },
  { category: 'Engine', subcat: 'Connecting Rods & Bushings',
    pattern: B('REAR ROD ONLY') },

  // --- Electrical: generator/starter/coil/battery/lens hardware
  { category: 'Electrical', subcat: 'Batteries',
    pattern: B('BLK BAT CAB KIT') + '|' + B('BATTERY CABLE') },
  { category: 'Electrical', subcat: 'Generators & Starters',
    pattern: B('GENERATOR (THRUST WASHER|SCREW|FIELD COIL)') + '|' + B('STARTER (END COVER|THRUST WASHER)') + '|' + B('3-BRUSH.*RELAY') + '|' + B('2-BRUSH RELAY') + '|' + B('SOLID STATE RELAY') + '|' + B('ACORN GENERATOR MOUNTING SCREW') },
  { category: 'Electrical', subcat: 'Ignition Coil Hardware',
    pattern: B('COIL (KIT|RELOCATION BRACKET|END PLUGS)') + '|' + B('V-FIRE COIL') },
  { category: 'Electrical', subcat: 'LED Bulbs',
    pattern: B('BULB SET') + '|' + B('MINI BULB') + '|' + B('XENON H-?4 BULB') + '|' + B('LENS (CLIP|SET)') + '|' + B('SPOTLAMP BULB') },
  { category: 'Electrical', subcat: 'Connectors & Terminals',
    pattern: B('AMP.*WIRING SOCKETS?') + '|' + B('MATE-?N-?LOCK') + '|' + B('WIRING SOCKET') },

  // --- Wheels & Tires: axle/hub hardware
  { category: 'Wheels & Tires', subcat: 'Axles & Spacers',
    pattern: B('AXLE (ADJUSTER|COLLAR|LOCK TAB|SHOULDER NUT|WHEEL SLEEVE|COVER SET)') + '|' + B('BILLET AXLE COVER') },
  { category: 'Wheels & Tires', subcat: 'Hubs & Spokes',
    pattern: B('(FRONT|REAR) HUB') + '|' + B('HUB SLEEVE') },
  { category: 'Wheels & Tires', subcat: 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
    pattern: B('WHEEL BALANCE WEIGHTS?') + '|' + B('WHEEL SEAL') + '|' + B('TUBE.*VALVE STEM') + '|' + B('RIM STRIPS?') },

  // --- Frames & Suspension
  { category: 'Frames & Suspension', subcat: 'Triple Trees & Covers',
    pattern: B('NECK CUP KIT') },

  // --- Hardware, Covers & General: bolt/screw vocabulary
  { category: 'Hardware, Covers & General', subcat: 'Bolt Kits, Hardware Assortments & Replenishment',
    pattern: B('ALLEN (HEAD SCREW|SOCKET CAP BOLT|CUP POINT SCREWS?|HEAD MACHINE SCREW|FASTENER SET)') + '|' + B('CAST BOLT') + '|' + B('CUP POINT SCREW') + '|' + B('FILLISTER SLOT SCREW') + '|' + B('HEXAGON HEAD SCREW') + '|' + B('TRUSS PHILLIPS SCREW') + '|' + B('ROUND HEAD (SLOT|MACHINE) SCREW') + '|' + B('SOCKET SHOULDER SCREWS?') + '|' + B('THUMB SCREW') + '|' + B('BANJO BOLTS?') + '|' + B('NYLON BOLT AND NUT') + '|' + B('HEX CAP BOLT') + '|' + B('KNURLED HEAD ALLEN BOLT') + '|' + B('BUTTON HEAD SCREWS?') + '|' + B('HEX SOCKET SEMS SCREW') + '|' + B('SPRING WASHER') + '|' + B('PANHEAD (PHILLIPS )?SCREW') + '|' + B('ZINC PHILLIPS.*SCREWS?') + '|' + B('LUG BOLT SET') + '|' + B('CADMIUM HEAD NUT') + '|' + B('OE WASHER') + '|' + B('MOUNTING BOLTS?') + '|' + B('FLAT HEAD SLOTTED SCREW') + '|' + B('OVAL PHILLIPS HEAD SCREW') + '|' + B('HEAD-?LESS SET SCREW') + '|' + B('BACKLITE WASHER') + '|' + B('ADAPTER SCREW') + '|' + B('ADJUSTABLE TOP TEE BOLT') + '|' + B('WASHER PARKERIZED') },
  { category: 'Hardware, Covers & General', subcat: 'Merchandising',
    pattern: B('RIDER TOY') + '|' + B('MOTORCYCLE ORNAMENT') + '|' + B('COFFEE CUP') + '|' + B('RAT FINK') + '|' + B('BOTTLE OPENER') + '|' + B('METAL SIGN') + '|' + B('DIE-?CUT MAGNET') + '|' + B('WOMEN.S V-?NECK') + '|' + B('FLOOR MAT') + '|' + B('MOTOR MODEL') + '|' + B('PARTS MANUAL') + '|' + B('SERVICE BULLETIN') + '|' + B('MOTORCYCLEPEDIA') + '|' + B('CYLINDER ART') + '|' + B('SUPERIOR SIGN') + '|' + B('MAGNETIC.*BLOCKS') + '|' + B('PIT PAD') + '|' + B('MOTOR SHOP.*CAN SET') + '|' + B('TOWEL RING') + '|' + B('SKIN FOR HD') + '|' + B('BANNER') },
];

var KNOWN_AMBIGUOUS_PATTERNS = [
  B('ROUND PUB TABLE'),
  B('MOTORSHOP COMMENTS'),
  B('TOKEN TUNING PACK'),
  B('DEALER MARKETING PROMO PACK'),
  B('CHROME CONCHO'),
  B('V-TWIN CAR'),
  B('ENGINE PLAQUE'),
  B('PARTS MANUAL'),
  B('PRODUCT GUIDE'),
  B('MOTORCYCLE MODEL'),
  B('WALL ART'),
  B('CHOPPER ART'),
  B('DISPLAY MODEL'),
  B('NUMBER PLATE SET'),
  B('DRAG DOOR/TRUCK STCKER'),
  B('UTILITY CONTAINER'),
  B('RATTLE BOMB SPRAY'),
  B('AEROSOL QUART'),
  B('SEALANT'),
  B('VHT HEAT'),
  B('BAR STOOL'),
  B('RIDING GLOVES'),
  B('SHOP DOPE MANUAL'),
];

async function main() {
  console.log('='.repeat(78));
  console.log('ACCESSORIES & MISC WAVE-3 CLASSIFIER (' + (APPLY ? 'APPLY' : 'DRY RUN') + ')');
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
    console.log('Explicit ambiguous rows (up to 50, NOT touched):');
    for (let i = 0; i < Math.min(50, ambiguous.length); i++) {
      console.log('      [' + ambiguous[i].id + '] ' + ambiguous[i].name);
    }
  }

  console.log('');
  console.log('Unmatched sample (up to 60, NOT touched):');
  for (let i = 0; i < Math.min(60, unmatched.length); i++) {
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
