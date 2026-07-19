// audit_riding_gear_accessories_v2.mjs
// READ-ONLY. Expanded tagging pass on the 157-row vendor-Accessories cluster.
// This is a wrong-CATEGORY problem, not a subcategory-fill problem -- most of these
// belong to entirely different display_categories. Tags map to REAL existing
// subcats confirmed in category_breakdown_report.md / project memory.
//
// Run: node audit_riding_gear_accessories_v2.mjs > riding_gear_accessories_v2_output.txt 2>&1

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env location/name.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Order matters — first match wins. label = "display_category / display_subcategory"
const GUESSES = [
  { label: 'Lighting / Reflectors & Lenses', pattern: `REFLECTOR` },
  { label: 'Handlebar & Controls / Switches & Controls', pattern: `SWITCH\\s*MOUNT` },
  { label: 'Handlebar & Controls / Risers, Clamps & Components', pattern: `(BAR\\s*MOUNT\\s*CLAMP|MOUNT\\s*HOLDER|PERCH\\s*MOUNT|REPLACEMENT\\s*MOUNT.*BARS|STRAP\\s*CLAMP)` },
  { label: 'Handlebar & Controls / Hand Control Sets, Levers', pattern: `CLUTCH\\s*PERCH\\s*UNDERMOUNT` },

  // Trailer / tie-down / transport cluster
  { label: 'Accessories & Misc / Trailer & Towing', pattern: `(TRAILER|HITCH\\s*PIN|PIT\\s*STOP)` },
  { label: 'Accessories & Misc / Tie-Downs & Transport', pattern: `(E-TRACK|AERO\\s*TRACK|TIE-DOWN|RATCHET\\s*STRAP|HOLD\\s*DOWN\\s*STRAP|ATTACHMENT\\s*STRAP(S)?|D\\s*RING\\s*MOUNT|WHEEL\\s*CHOCK|CHOCK)` },

  // Electronics
  { label: 'Accessories & Misc / Electronics & Mounts', pattern: `(USB|CHARGER|BLUETOOTH|WIRELESS\\s*HEADSET|RECHARGEABLE\\s*BATTERY|TECH\\s*GRIPPER|RADAR\\s*DETECTOR|4G\\s*UNIVERSAL\\s*TOP\\s*PLATE|CIGARETTE\\s*CHARGER)` },

  // Merchandising / novelty
  { label: 'Hardware, Covers & General / Merchandising', pattern: `(SCALE\\s*19|REPLICA|BOTTLE\\s*OPENER|TRAVEL\\s*CUP|M\\/C\\s*OIL\\s*SIGN)` },

  // Genuine parts with an obvious existing home elsewhere
  { label: 'Engine / Engine Accessories', pattern: `(BREATHER\\s*HOSE|BREATHER\\s*TUBE|OIL\\s*DIP\\s*STICK|OIL\\s*TEMP\\s*DIP\\s*STICK)` },
  { label: 'Exhaust / Exhaust Parts', pattern: `MUFFLER\\s*RUBBER\\s*MOUNT` },
  { label: 'Brakes / Brake Pedals & Pads', pattern: `BRAKE\\s*PEDAL\\s*PAD` },
  { label: 'Transmission & Clutch / Primary & Derby Covers', pattern: `INSPECTION\\s*COVER` },
  { label: 'Tanks & Body / Gas Tanks & Gas Caps', pattern: `FUEL\\s*TANK\\s*CONSOLE\\s*DOOR` },
  { label: 'Tanks & Body / Fuel/Oil Line, Clamps and Finishers', pattern: `IN\\s*TANK\\s*FUEL\\s*LINE` },
  { label: 'Dashes & Gauges / Housings', pattern: `SPEEDOMETER\\s*COWL` },
  { label: 'Windshields & Fairings / Fairings', pattern: `(FAIRING\\s*SUPPORT\\s*BAR|STEALTH\\s*3\\s*FRAME)` },
  { label: 'Windshields & Fairings / Windshields', pattern: `WINDSHIELD\\s*MOUNTING\\s*KIT` },
  { label: 'Luggage & Racks / Sissy Bars', pattern: `SISSY\\s*BAR` },
  { label: 'Luggage & Racks / Racks (flag mount)', pattern: `FLAG\\s*AND\\s*MOUNT` },
  { label: 'Frames & Suspension / General Accessories', pattern: `SWINGARM\\s*PLUG` },
  { label: 'Tanks & Body / Fender Parts & Accessories', pattern: `DETACHABLE\\s*SIDE\\s*PLATES` },
  { label: 'Tools & Chemicals / Cleaners & Detailing', pattern: `(MICROFIBER\\s*TOWEL|NO-FOG\\s*CLOTH|FIN\\s*FOAM)` },
  { label: 'Tools & Chemicals / Tools', pattern: `(FLEX\\s*&\\s*FOLD\\s*FUNNEL|POWER\\s*SPOUT|HOSE\\s*BENDER\\s*SPOUT|DELUXE\\s*HOSE.*ASSEMBLY)` },

  { label: 'UNCERTAIN — crash bar, no obvious existing subcat', pattern: `CRASH\\s*BAR` },

  // Boot clips — these ARE apparel-adjacent (bootstrap decorative clips), belongs in Riding Gear & Apparel/Footwear
  { label: 'Riding Gear & Apparel / Footwear (boot clips)', pattern: `CLIPS\\s*FOR\\s*(LACED|STIRRUP)` },
];

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, name, source_vendor
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Riding Gear & Apparel'
        AND display_subcategory IS NULL
        AND category = 'Accessories'
      ORDER BY name
    `);

    console.log(`Total rows: ${res.rows.length}\n`);

    const counts = {};
    const untagged = [];
    for (const row of res.rows) {
      let tag = 'UNTAGGED — needs manual look';
      for (const g of GUESSES) {
        const re = new RegExp(g.pattern, 'i');
        if (re.test(row.name)) {
          tag = g.label;
          break;
        }
      }
      counts[tag] = (counts[tag] || 0) + 1;
      if (tag.startsWith('UNTAGGED')) untagged.push(row);
      console.log(`[${row.id}] (${row.source_vendor}) ${row.name}  =>  ${tag}`);
    }

    console.log(`\n=== Tag summary ===`);
    for (const [tag, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(4)}  ${tag}`);
    }

    console.log(`\n=== Remaining UNTAGGED (${untagged.length}) — full list for manual review ===`);
    for (const row of untagged) {
      console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
