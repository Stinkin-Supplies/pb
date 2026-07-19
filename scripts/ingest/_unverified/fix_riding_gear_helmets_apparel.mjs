// fix_riding_gear_helmets_apparel.mjs
// Reclassifies the Helmets (836) and Apparel (389) vendor-category groups within
// Riding Gear & Apparel / display_subcategory IS NULL, per session-84 analysis.
//
// DRY RUN (default): node fix_riding_gear_helmets_apparel.mjs > output.txt 2>&1
// APPLY:             node fix_riding_gear_helmets_apparel.mjs --apply > output.txt 2>&1

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

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const PARTS_PATTERN = `(VISOR|SHIELD|(^|\\s)VENT(S)?(\\s|$)|CURTAIN|SKIRT|BASEPLATE|BASE\\s*PLATE|SHELL\\s*TRIM|SIDE\\s*PLATE|JAW|NECK\\s*(GATOR|TUBE)|SUNVISOR|SUN\\s*VISOR|REAR\\s*SPOILER|FACE\\s*MASK|CHIN\\s*(VENT|CURTAIN)|LINER|PINLOCK|BASEPLATE\\s*SET)`;
const WHOLE_HELMET_PATTERN = `HELMET`;
const JACKETS_PATTERN = `(JACKET|VEST|CHAP)(S)?`;
const PANTS_PATTERN = `(PANT|JEAN|BASE\\s*LAYER|LONG\\s*JOHN)(S)?`;
const CASUAL_PATTERN = `(SHIRT|FLANNEL|TEE|HOODIE|JERSEY|HENLEY|TANK\\s*TOP)(S)?`;
const RAIN_PATTERN = `RAIN\\s*(SUIT|GEAR)`;

// Manually classified from full-dump review, session 84
const HELMET_NEITHER_ACCESSORIES = [ // -> Riding Gear & Apparel / Accessories
  37555,37589,37590,37595,37593,37594,
  37607,37609,
  44819,44820,46883,46884,
  48103,48096,
  47421,47420,47417,47416,47419,47418,
  37610,37614,37624,37632,46929,37619,43910,37630,37628,37633,37623,37612,37622,37617,37611,37620,37621,37613,37629,37618,
  45165,37637,37638,37640,37642,37641,37649,53567,53566,37647,37639,37643,37648,
  37601,
  37603,
  43903,43900,43907,43904,43905,37591,37592,43909,43899,43902,37588,
  53585,
  46926,46928,53584,47792,53581,46927,53582,
  45166,45168,45167,
  45172,46921,46919,53570,45174,53569,45173,50074,46920,53568,
  50004,
  46922,46924,
  48710,48709,
  48706,48707,
  50014,
];
const HELMET_NEITHER_PARTS = [ // -> Riding Gear & Apparel / Helmet Accessories & Parts
  40620,
  48198,45261,40618,
  40580,40631,45311,40477,40396,40426,40444,45854,
  40423,45855,
  40486,
  54173,54175,51609,51634,51610,
  51660,50824,
  51251,
  51252,51253,
  54624,
  47400,46992,46993,
  56481,56314,56479,56311,56312,56482,56480,56313,56315,56309,56483,56308,
  56255,
  40528,45287,
  40523,
  40619,40546,
  40522,
  43243,
  40621,40521,
  46510,45938,46193,
  40464,40385,
  46526,
  44053,
  40672,
  40399,
  40520,
  51216,
];
const HELMET_NEITHER_AUDIO = [ // -> Electrical / Audio & Communication (category change)
  48532, 56927, 56928, 56783, 52895, 48531, 48535, 56781,
];

const APPAREL_UNMATCHED_FOOTWEAR = [ // -> Riding Gear & Apparel / Footwear
  49590,49595,49600,49611,49613,49615,49617,
  45896,45897,45898,45899,45900,45901,45903,45904,45905,
  48318,48319,48320,48322,48324,48325,48326,
  56743,56736,56737,56738,56739,56741,56742,
  53719,53712,53713,53714,53716,53717,53718,
];
const APPAREL_UNMATCHED_LEGGINGS = [ // -> Riding Gear & Apparel / Pants & Base Layers
  50000,50001,50002,50003,49987,50005,50006,50007,50008,50009,50010,
];
async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    async function regexUpdate(label, categoryFilter, pattern, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL
           AND category = $1
           AND name ~* $2`,
        [categoryFilter, pattern]
      );
      console.log(`--- ${label}: ${checkRes.rows.length} rows ---`);
      if (checkRes.rows.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified
           SET display_category = $2, display_subcategory = $3
           WHERE id = ANY($1::int[])`,
          [checkRes.rows.map((r) => r.id), newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    async function idListUpdate(label, ids, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE id = ANY($1::int[])
           AND is_active = true
           AND display_subcategory IS NULL`,
        [ids]
      );
      const foundIds = checkRes.rows.map((r) => r.id);
      const missing = ids.filter((id) => !foundIds.includes(id));
      console.log(`--- ${label}: expected ${ids.length}, found ${foundIds.length} ---`);
      if (missing.length) console.log(`  MISSING/ALREADY-CHANGED (skipped): ${missing.join(', ')}`);
      if (foundIds.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3
           WHERE id = ANY($1::int[])`,
          [foundIds, newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} ${foundIds.length} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    console.log('=== HELMETS (836) ===\n');
    await regexUpdate('Helmet parts (regex match)', 'Helmets', PARTS_PATTERN, 'Riding Gear & Apparel', 'Helmet Accessories & Parts');
    await regexUpdate('Whole helmets (remaining, has HELMET)', 'Helmets', WHOLE_HELMET_PATTERN, 'Riding Gear & Apparel', 'Helmets');
    await idListUpdate('Neither-pile: bandana/neckwear -> Accessories', HELMET_NEITHER_ACCESSORIES, 'Riding Gear & Apparel', 'Accessories');
    await idListUpdate('Neither-pile: helmet hardware (diff vocab) -> Helmet Accessories & Parts', HELMET_NEITHER_PARTS, 'Riding Gear & Apparel', 'Helmet Accessories & Parts');
    await idListUpdate('Neither-pile: audio/comms -> Electrical', HELMET_NEITHER_AUDIO, 'Electrical', 'Audio & Communication');

    console.log('=== APPAREL (389) ===\n');
    await regexUpdate('Jackets & Vests', 'Apparel', JACKETS_PATTERN, 'Riding Gear & Apparel', 'Jackets & Vests');
    await regexUpdate('Pants & Base Layers', 'Apparel', PANTS_PATTERN, 'Riding Gear & Apparel', 'Pants & Base Layers');
    await regexUpdate('Casual Apparel (new subcat)', 'Apparel', CASUAL_PATTERN, 'Riding Gear & Apparel', 'Casual Apparel');
    await regexUpdate('Rain gear -> Accessories', 'Apparel', RAIN_PATTERN, 'Riding Gear & Apparel', 'Accessories');
    await idListUpdate('Unmatched: Axle/Hitop shoes -> Footwear', APPAREL_UNMATCHED_FOOTWEAR, 'Riding Gear & Apparel', 'Footwear');
    await idListUpdate('Unmatched: Phoenix Leggings -> Pants & Base Layers', APPAREL_UNMATCHED_LEGGINGS, 'Riding Gear & Apparel', 'Pants & Base Layers');
    await idListUpdate('Unmatched: Long Sleeve -> Casual Apparel', [45732], 'Riding Gear & Apparel', 'Casual Apparel');

    if (APPLY) {
      await client.query('COMMIT');
      console.log('=== COMMITTED ===');
    } else {
      console.log('=== DRY RUN COMPLETE — no changes made. Re-run with --apply to execute. ===');
    }
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
