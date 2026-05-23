#!/usr/bin/env node
/**
 * generate_fitment_tag_tree.cjs
 * 
 * Queries catalog_fitment_v2 and builds a nested JSON:
 *   Family → Model → Category → [ { years, oem_numbers, era } ]
 * 
 * Uses the tags.numbers tag list as the canonical category set.
 * Year ranges are collapsed (consecutive years grouped).
 * 
 * Run: node generate_fitment_tag_tree.cjs > fitment_tag_tree.json
 */

const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: 'smelly',
});

// ── Canonical tag list from tags.numbers ──────────────────────────────────────
const CANONICAL_TAGS = [
  // ── New tags added for WPS catalog coverage ──
  "Helmets","Apparel","Riding Gear","Chemicals & Maintenance",
  "Tools & Shop Equipment","Audio & Communication","Security",
  "Tires & Wheels","Accessories",
  // ── Original OEM fiche tags ──
  "ABS MODULE","Air Cleaner","AIR DEFLECTORS","AIR FILTER, ENGINE",
  "AIR TEMPERATURE SENSOR & GAUGE","Alternator","ALTERNATOR AND REGULATOR",
  "AMPLIFIER - SIDE CAR","ANTENNA","AUXILIARY/FOG LAMPS & FRONT TURN SIGNALS",
  "AXLE, FRONT","AXLE, REAR - CAST","AXLE, REAR - LACED & profile laced",
  "BALANCER ASSEMBLY - Milwaukee-eight™ 107","BALANCER ASSEMBLY - Milwaukee-eight™ 114",
  "Battery","BATTERY, TRAY & CABLES","BEARING HOUSING, TRANSMISSION","BELT GUARD",
  "BELT, CHAIN AND SPROCKETS","BELTS & SPROCKETS","BRACKET, HORN",
  "BRACKET, LICENSE PLATE","BRACKET, LOWER STEERING HEAD",
  "BRACKET, SPEEDOMETER - 883,883l,883r,1200l,1200r","Brake - front","Brake - rear",
  "BRAKE CALIPER, FRONT","BRAKE CALIPER, REAR","BRAKE CONTROL, FRONT",
  "BRAKE CONTROL, REAR","Brake Disc ","BRAKE DISC, FRONT","BRAKE DISC, FRONT CAST",
  "BRAKE DISC, FRONT LACED","BRAKE DISC, REAR","BRAKE DISC, REAR - CAST WHEEL",
  "BRAKE DISC, REAR - LACED WHEEL","BRAKE LEVER, FRONT","BRAKE LEVER, REAR",
  "BRAKE LINE, REAR","BRAKE LINES AND MODULE, REAR - ABS","BRAKE LINES, FRONT",
  "BRAKE LINES, FRONT - ABS","BRAKE MASTER CYLINDER, FRONT","BRAKE MASTER CYLINDER, REAR",
  "BRAKE MODULE, ABS","BRAKELINE, FRONT","BRAKELINE, REAR","BULB, FRONT TURN SIGNAL",
  "BULB, FRONT TURN SIGNALS ","BULB, FRONT TURN SIGNALS - FLHX AND FLHXS",
  "BULB, FRONT TURN SIGNALS - FLTRK, FLTRX AND FLTRXS","BULB, REAR TURN SIGNALS",
  "BUSHINGS, CAM","CABLE, CLUTCH CONTROL","CABLES, BATTERY",
  "CALIFORNIA EVAPORATIVE EMISSIONS","CALIPER, FRONT","CALIPER, REAR","Cam Gears ",
  "Cam position sensor","CAMSHAFT COVER","CAMSHAFT SUPPORT PLATE","CAMSHAFTS & GEAR COVER",
  "CAMSHAFTS AND CAMSHAFT COVER ","Capacitor","CARBON CANISTER","Carburetor",
  "Center Stand","Chain Guards","Chain Oiler","CHAIN, PRIMARY","Chains",
  "CHECK VALVE, OIL PRESSURE","Choke","Circuit Breaker","CLAMPS, HANDLEBAR UPPER & LOWER",
  "CLUTCH","Clutch & Control ","CLUTCH CONTROL HAND LEVER","CLUTCH LEVER ASSEMBLY",
  "COIL, IGNITION","COMPLETE ENGINE - TWIN CAM 88™","Condenser","Connecting Rods ",
  "CONSOLE, FUEL TANK ","CONTROL MODULE - FUEL INJECTED","COOLANT DISTRIBUTION - AIR-COOLED",
  "COOLANT DISTRIBUTION - TWIN-COOLED™","COOLANT HOSES, RADIATOR",
  "COOLANT PUMP , TWIN-COOLED™","COOLING SYSTEM, ENGINE, AIR-COOLED",
  "COOLING SYSTEM, ENGINE, TWIN-COOLED™","COVER, ELECTRICAL CADDY","COVER, PUSHRODS",
  "COVERS AND AIR DEFLECTORS","Covers, ","Covers. rocker arm ","CRANKCASE",
  "CRANKCASE & ENGINE OIL FILTER - TWIN CAM 88","CRANKCASE & GEARCASE","CRANKCASE BEARINGS",
  "Crankcases","CRANKSHAFT - Milwaukee-eight™ 107","Crankshaft position sensor ",
  "Cruise controL ","CYLINDER HEADS","Cylinders","Cylinders, engine ",
  "CYLINDERS, HEADS AND VALVES","Cylinders. engine ","DEBRIS COLLECTOR","DEBRIS DEFLECTOR",
  "DECALS, FUEL TANK","Decals. fuel tank ","DIPSTICK, OIL TANK","Disc Brake",
  "DRIVE GEAR, OIL PUMP","Electrical connectors ","Electrical, miscellaneous..",
  "ELECTRONIC CONTROL MODULE (ECM) AND COIL","ELECTRONIC IGNITION SYSTEM","Engine .",
  "Engine guard ","ENGINE MOUNTS","ENGINE MOUNTS & STABILIZER LINKS",
  "ENGINE SENSORS AND SWITCHES","EVAPORATIVE EMISSIONS COMPONENTS",
  "Evaporative emissions kit","EXHAUST SYSTEM","Fairing","Fairing lowers ",
  "FAIRING, INNER ","FAIRING, LOWERS, TWIN-COOLED","FAIRING, OUTER",
  "FAN ASSEMBLY , RADIATOR","Fender Supports, rear ","FENDER, FRONT","FENDER, REAR",
  "Fenders","FILTER, AIR ","FILTER, FUEL ","Flasher","FLYWHEEL","FOG LAMPS",
  "Footboards","FOOTBOARDS AND FOOTPEGS, PASSENGER","FOOTBOARDS, OPERATOR",
  "FOOTPEGS, PASSENGER","FOOTRESTS","FORK BRACKETS, FRONT","FORK LOCK","Fork Rockers",
  "FORK, FRONT","FORK, REAR","Frame","Frame & Rear Fork",
  "FRAME AND FORK, REAR AND TOUR-PAK SUPPORT","FRAME AND JIFFY STAND",
  "FRONT BRAKE CALIPER","FRONT BRAKE CONTROL","FRONT FENDER","Front Fender Lamp",
  "FRONT FORK","FRONT WHEEL","FRONT WHEEL - CAST","FRONT WHEEL - LACED","FUEL CAP",
  "FUEL FILTER ","FUEL GAUGE","FUEL INJECTOR","FUEL LEVEL SENDER","FUEL PUMP",
  "FUEL PUMP, FUEL INJECTED","FUEL TANK","FUEL TANK & TRIM","FUEL TANK CONSOLE",
  "FUEL TANK INSTRUMENTS","FUEL TANK TRIM","FUEL TANK, CARBURETED",
  "FUEL TANK, FUEL INJECTED","Fuse Board","Fuse box ","FUSES","Gas Tank Trim",
  "Gas Tanks","GASKET KIT, CAM SERVICE","GASKET KIT, ENGINE OVERHAUL",
  "GASKET KIT, front MASTER CYLINDER","GASKET KIT, INNER PRIMARY",
  "GASKET KIT, REAR MASTER CYLINDER","GASKET KIT, ROCKER COVERS","GASKET KIT, TOP END",
  "Gasket Sets","GAUGE, FUEL","GAUGE, VOLTMETER","Gauges","GEAR SHIFTER","Gearcase",
  "GEARCASE & COVER","GEARS, TRANSMISSION","Generator","GLOVE BOX","GRIPS, HANDLEBAR",
  "GUARD, ENGINE","GUARDS, SADDLEBAG","HAND LEVER, CLUTCH CONTROL","HANDLEBAR",
  "HANDLEBAR & THROTTLE CONTROL","HANDLEBAR GRIPS","HANDLEBAR SWITCHES",
  "Hardware Listing","HEAD, CYLINDER","HEADLAMP","HEADLAMP & MIRROR","HEADS, CYLINDER",
  "Highway Bar.","Horn","HOUSING, SPEEDOMETER","IGNITION COIL","Ignition module",
  "IGNITION MODULE & COIL","IGNITION SWITCH WIRING HARNESS","Ignition System",
  "Indicator Lamps","INDUCTION MODULE","INDUCTION MODULE - FUEL INJECTED","INNER FAIRING",
  "INSPECTION COVER & PRIMARY COVER","INSTRUMENT CLUSTER","INSTRUMENTS",
  "ISOLATOR, REAR WHEEL","JET, PISTON COOLING","JIFFY STAND","KEY FOB","Kick Starter",
  "LAMPS & SPEAKER HOUSINGS","LED, AUXILIARY/FOG LAMPS","LED, HEADLAMP","LEVER, shifter",
  "LICENSE PLATE HOLDER","LIFTER, HYDRAULIC","LIGHT, REAR FENDER","LOCK, SADDLEBAG",
  "LOCKSET","LOWER FAIRINGS","LUGGAGE BOX","Luggage Carrier","LUGGAGE RACK, TOUR-PAK",
  "Magneto","MAIN FUSE","MAIN WIRING HARNESS","MASTER CYLINDER ASSEMBLY, front",
  "MASTER CYLINDER assembly, REAR","MASTER CYLINDER W/ HAND LEVER, FRONT",
  "MASTER CYLINDER, BRAKE, FRONT","MASTER CYLINDER, BRAKE, REAR",
  "MASTER CYLINDER, REAR","MASTER CYLINDER, W/ HAND LEVER (FRONT)","MIRRORS",
  "Module, ignition ","MODULE, LOW FUEL","MODULE, SECURITY SYSTEM",
  "MODULE, SECURITY SYSTEM/TURN SIGNAL CANCELLER","MODULE, TURN SIGNAL CANCELLER",
  "Module. ignition ","Module. induction - fuel injected models ","Module. low fueL",
  "Module. turn signal canceller ","MOUNTS, ENGINE","Mufflers","Nacelle ",
  "Oil Cooler","OIL COOLER, AIR-COOLED","Oil Filter","OIL FILTER, ENGINE",
  "OIL PAN, TRANSMISSION","Oil Pressure Switch","Oil Pump.","Oil Tank ",
  "OIL TANK & FILTER","PADS, FRONT BRAKE","PADS, REAR BRAKE","Passing lamps",
  "PISTON COOLING, JET","Piston Rings.","Pistons","PISTONS & FLYWHEEL ASSEMBLY",
  "Pistons & piston rings","PISTONS AND FLYWHEEL ASSEMBLY - Milwaukee-eight™ 107",
  "PISTONS, CONNECTING RODS & FLYWHEELS","Points","PRIMARY COVER","PRIMARY HOUSING",
  "PUMP , COOLANT, TWIN-COOLED™","pump, oil","PUSH RODS",
  "RADIATOR, COOLANT HOSES AND BOTTLE - TWIN-COOLED™","Radio",
  "RADIO CONTROL, PASSENGER","REAR BRAKE CALIPER","REAR BRAKE MASTER CYLINDER",
  "REAR FENDER","REAR FENDER & BELT GUARD","REAR FORK",
  "REAR SHOCK ABSORBERS & AIR SUSPENSION SYSTEM","REAR WHEEL","REAR WHEEL - CAST",
  "REAR WHEEL - LACED","REFLECTOR, FRONT FORK - STANDARD",
  "REFLECTOR, LICENSE PLATE BRACKET","REFLECTOR, SADDLEBAG","Regulator ",
  "REGULATOR, VOLTAGE","RELAY, STARTER","RELAYS","REMOTE CONTROL FOB",
  "RESERVOIR, RADIATOR","RISER, HANDLEBAR ","ROCKER ARM ASSEMBLY AND PUSHRODS",
  "Rocker arms","ROCKER ARMS, COVERS & PUSHRODS","ROTOR, ENGINE","Rotor, ignition ",
  "SADDLEBAG GUARDS","SADDLEBAG SUPPORTS","SADDLEBAGS","SEATS",
  "SECURITY SYSTEM, ANTENNA MODULE","Sensor Assembly ","SENSOR, AMBIENT TEMPERATURE",
  "SENSOR, BAROMETRIC PRESSURE","SENSOR, COOLANT TEMPERATURE",
  "SENSOR, CRANKSHAFT POSITION","SENSOR, ENGINE TEMP","SENSOR, IMU","SENSOR, KNOCK",
  "SENSOR, TEMPERATURE MANIFOLD ABSOLUTE PRESSURE (TMAP)","SENSOR, TIRE PRESSURE, FRONT",
  "SENSOR, WHEEL SPEED, FRONT, CAST","SENSOR, WHEEL SPEED, REAR",
  "SENSORS AND SWITCHES, ENGINE","SHIFTER","SHIFTER CAMSHAFT","SHIFTER FORK",
  "SHIFTER LEVER","Shifter Linkage","SHIFTER, GEAR","SHOCK ABSORBERS","SIDE COVER",
  "SIDECAR ","SIDECAR BRAKE","SIDECAR CHASSIS","SIDECAR CONNECTION KIT","SIDECAR FENDER",
  "SIDECAR TAIL LAMP","SIDECAR TURN SIGNAL","SIDECAR WHEEL","Sissy bar",
  "SOLENOID, AUTO COMPRESSION RELEASE (ACR)","SOLENOID, PURGE","SOUND SYSTEM",
  "SPARK PLUGS","SPEAKER","Speaker housing. rear ","SPEEDOMETER","Spokes","Spotlamp",
  "SPROCKET - REAR 66T","SPROCKET, BELT","SPROCKET, TRANSMISSON",
  "STABILIZER LINK, ENGINE","STARTER MOTOR","Starter Shaft and Housing",
  "Starter Solenoid","STATOR","STEERING HEAD BRACKET ASSEMBLY","SWINGARM",
  "SWITCH - CRUISE CONTROL","SWITCH ASSEMBLY, directional","SWITCH, IGNITION",
  "SWITCH, NEUTRAL INDICATOR","SWITCH, OIL PRESSURE","SWITCH, STOP LAMP",
  "Switchers, Handlebar","SWITCHES","SWITCHES & CIRCUIT BREAKERS","Switches, ignition",
  "Switches, Ignition & Headlamp","SWITCHES, SENSORS & ELECTRICAL CONNECTORS",
  "Switches, Starter","TACHOMETER","Tachometer","TAIL LAMP",
  "TAIL LAMP AND TURN SIGNALS, REAR","Tappets","Terminal Plates","TETHER, TOUR-PAK",
  "THROTTLE CONTROL","TIMER COVER","TIRE, FRONT, CAST","TIRE, REAR","TOOL KIT",
  "Tools ","Tour-Pak","Transmission","TRANSMISSION BEARINGS","TRANSMISSION GEARS",
  "TRANSMISSION HOUSING & OIL TANK ","TRANSMISSION HOUSING, COVER AND OIL PAN",
  "TRAY, BATTERY","Trim ","TRIPLE CLAMP","Turn Signal Canceller","TURN SIGNALS",
  "TURN SIGNALS, FRONT ","TURN SIGNALS, REAR","Valves ","VALVES AND GUIDES",
  "VEHICLE SPEED SENSOR","VOLTAGE REGULATOR","VOLTAGE REGULATOR BRACKET, AIR-COOLED",
  "VOLTAGE REGULATOR BRACKET, TWIN-COOLED™","VOLTMETER","WHEEL, FRONT","WHEEL, REAR",
  "WINDSHIELD ","WINDSHIELD, FAIRING AND HEADLAMP","WIRING HARNESS",
  "WIRING HARNESS, RADIATOR"
];

// Normalise a category string for matching
function normalise(s) {
  return s.trim().toUpperCase().replace(/\s+/g, ' ').replace(/,\s*$/, '').replace(/.\s*$/, '');
}

// Build lookup: normalised tag → canonical tag
const TAG_NORM_MAP = {};
for (const t of CANONICAL_TAGS) {
  TAG_NORM_MAP[normalise(t)] = t;
}

// Match a DB category to a canonical tag (exact normalised match, then substring)
function matchTag(dbCat) {
  if (!dbCat) return null;
  const n = normalise(dbCat);
  if (TAG_NORM_MAP[n]) return TAG_NORM_MAP[n];
  // Try substring match — DB cat contained inside a canonical tag or vice versa
  for (const [norm, canonical] of Object.entries(TAG_NORM_MAP)) {
    if (norm.includes(n) || n.includes(norm)) return canonical;
  }
  return null;
}

// Collapse a sorted list of years into ranges like "2006-2011"
function collapseYears(years) {
  if (!years.length) return [];
  const sorted = [...new Set(years)].map(Number).sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges;
}

async function main() {
  const client = await pool.connect();

  try {
    process.stderr.write('Querying fitment data...\n');

    // Main query: per (family, model_code, category, product_id) get all years,
    // vendor SKU, aggregated real OEM part numbers from oem_fitment, and era flags
    const { rows } = await client.query(`
      SELECT
        hf.name                                     AS family,
        hm.model_code,
        hm.name                                     AS model_name,
        hmy.year,
        cu.category,
        cu.id                                       AS product_id,
        cu.vendor_sku,
        cu.source_vendor,
        -- Real HD OEM part numbers from the JW Boon extracted table
        ARRAY(
          SELECT DISTINCT of2.oem_part_no
          FROM oem_fitment of2
          WHERE of2.matched_product_id = cu.id
            AND of2.oem_part_no IS NOT NULL
          ORDER BY of2.oem_part_no
        )                                           AS hd_oem_numbers,
        cu.era_ironhead,
        cu.era_evo_sportster,
        cu.era_evolution,
        cu.era_twin_cam,
        cu.era_milwaukee8,
        cu.era_chopper,
        cu.era_knucklehead,
        cu.era_panhead,
        cu.era_shovelhead,
        cu.era_flathead
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models hm       ON hm.id  = hmy.model_id
      JOIN harley_families hf     ON hf.id  = hm.family_id
      JOIN catalog_unified cu     ON cu.id  = cfv.product_id
      WHERE cu.is_active = true
        AND cu.category IS NOT NULL
      ORDER BY hf.name, hm.model_code, cu.category, hmy.year
    `);

    process.stderr.write(`Got ${rows.length} rows. Building tree...\n`);

    // Era label helper
    function eraLabel(row) {
      const eras = [];
      if (row.era_flathead)     eras.push('flathead');
      if (row.era_knucklehead)  eras.push('knucklehead');
      if (row.era_panhead)      eras.push('panhead');
      if (row.era_shovelhead)   eras.push('shovelhead');
      if (row.era_ironhead)     eras.push('ironhead');
      if (row.era_evolution)    eras.push('evolution');
      if (row.era_twin_cam)     eras.push('twin_cam');
      if (row.era_milwaukee8)   eras.push('milwaukee8');
      if (row.era_evo_sportster) eras.push('evo_sportster');
      if (row.era_chopper)      eras.push('chopper');
      return eras;
    }

    // Build nested structure:
    // tree[family][model_code][category][product_id] = { years:Set, oem_numbers, eras, model_name }
    const tree = {};

    for (const row of rows) {
      const tag = matchTag(row.category) || row.category;
      const family = row.family;
      const mc = row.model_code;
      const pid = row.product_id;

      if (!tree[family]) tree[family] = {};
      if (!tree[family][mc]) tree[family][mc] = { model_name: row.model_name, categories: {} };
      const cats = tree[family][mc].categories;
      if (!cats[tag]) cats[tag] = {};
      if (!cats[tag][pid]) {
        cats[tag][pid] = {
          years: new Set(),
          vendor_sku: row.vendor_sku || null,
          source_vendor: row.source_vendor || null,
          hd_oem: row.hd_oem_numbers || [],
          eras: eraLabel(row),
        };
      }
      cats[tag][pid].years.add(row.year);
    }

    // Serialise: collapse years, group by year-range+era+oem combo
    // Final shape per category:
    //   [ { years: "2006-2011", oem: ["1800-2097", ...], era: "twin_cam" }, ... ]
    const output = {};

    for (const [family, models] of Object.entries(tree)) {
      output[family] = {};
      for (const [mc, { model_name, categories }] of Object.entries(models)) {
        output[family][mc] = { model_name, categories: {} };
        for (const [tag, products] of Object.entries(categories)) {
          // Group products by (collapsed_years_string, era_string, oem_key)
          // We want one entry per distinct (year_range, era, oem_set)
          const groups = {};
          for (const [, { years, vendor_sku, source_vendor, hd_oem, eras }] of Object.entries(products)) {
            const yearStr = collapseYears([...years]).join(', ');
            const eraStr = eras.sort().join('+') || 'unknown';
            const key = `${yearStr}::${eraStr}::${vendor_sku || ''}`;
            if (!groups[key]) {
              groups[key] = {
                years: yearStr,
                vendor_sku: vendor_sku || null,
                source_vendor: source_vendor || null,
                hd_oem: hd_oem,   // real HD OEM part numbers e.g. "63731-99A"
                era: eras,
              };
            }
          }
          output[family][mc].categories[tag] = Object.values(groups)
            .sort((a, b) => {
              // Sort by first year desc
              const ay = parseInt(a.years.split('-')[0]) || 0;
              const by = parseInt(b.years.split('-')[0]) || 0;
              return ay - by;
            });
        }
      }
    }

    process.stdout.write(JSON.stringify(output, null, 2));
    process.stderr.write('\nDone.\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  process.stderr.write('Error: ' + err.message + '\n');
  process.exit(1);
});
