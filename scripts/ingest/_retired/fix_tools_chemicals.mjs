// fix_tools_chemicals.mjs
// Reclassifies Tools & Chemicals' 547 NULL rows per session-84 analysis: pulls out
// several full clusters that don't belong in Tools & Chemicals at all, then bulk-
// catches the genuine remainder.
//
// DRY RUN (default): node fix_tools_chemicals.mjs > output.txt 2>&1
// APPLY:             node fix_tools_chemicals.mjs --apply > output.txt 2>&1

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

const CHARGERS_JUMPPACKS = [
  38613,57024,49706,49734,54981,38689,47757,47752,47754,47755,47756,
  54979,57052,54980,57034,46731,38818,46427,44391,38682,38683,44390,
  49060,38662,43386,38697,56034,55989,38688,38698,38696,43387,54978,
];
const LEADS_CABLES = [
  38693,38694,38692,38816,38817,38546,38678,38545,38684,38702,38701,38703,
];
const REPAIR_MANUALS = [
  37827,37850,37851,37852,37855,37846,37840,37839,37849,37845,37854,37813,
  37847,37853,45279,37848,37844,45280,
];
const MOTORCYCLE_COVERS = [
  37898,37897,37894,37892,37891,37899,37896,37895,
  37901,37869,37885,
  45022,43422,45019,45020,43423,45021,
  37905,37824,37823,37843,
];
const TRAILER_TIEDOWN = [
  38113,38114,38108,38110,38112,38109,38115,38061,38059,38060,38053,
  38078,38077,38079,38054,38057,38056,38055,38132,38105,38106,38107,
  38064,38070,38067,38065,38071,38068,57491,57492,57493,57494,38135,
  38086,38087,38089,38088,38084,38133,38134,48803,48795,48805,38075,
  38076,53289,39195,
];

// Individual part strays in "Tools & Shop Equipment"
const TSE_STRAYS = [
  { id: 58423, cat: 'Electrical', sub: 'Horns' },
  { id: 43667, cat: 'Electrical', sub: 'Points, Distributors & Accessories' },
  { id: 43660, cat: 'Electrical', sub: 'Points, Distributors & Accessories' },
  { id: 45409, cat: 'Transmission & Clutch', sub: 'Primary & Derby Covers' },
  { id: 39136, cat: 'Tanks & Body', sub: 'Gas Tanks & Gas Caps' },
  { id: 37045, cat: 'Foot Controls', sub: 'Footpegs, Shift Pegs, & HW' },
  { id: 37561, cat: 'Engine', sub: 'Engine Parts' },
  { id: 48678, cat: 'Wheels & Tires', sub: 'Axles & Spacers' },
];

// Individual part strays in "TOOLS"/"TOOLS GROUP" (VTWIN)
const TOOLS_STRAYS = [
  { id: 85298, cat: 'Carburetion & Fuel', sub: 'Carburetors & Components' },
  { id: 84882, cat: 'Carburetion & Fuel', sub: 'Carburetors & Components' },
  { id: 95977, cat: 'Frame & Hardware', sub: 'Hardware & Fasteners' },
  { id: 92342, cat: 'Frame & Hardware', sub: 'Hardware & Fasteners' },
  { id: 62372, cat: 'Engine', sub: 'Engine Parts' },
  { id: 63681, cat: 'Transmission & Clutch', sub: 'Pulleys & Sprockets' },
  { id: 63639, cat: 'Brakes', sub: 'Brake Hardware' },
];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    async function idListUpdate(label, ids, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE id = ANY($1::int[]) AND is_active = true AND display_subcategory IS NULL`,
        [ids]
      );
      const foundIds = checkRes.rows.map((r) => r.id);
      const missing = ids.filter((id) => !foundIds.includes(id));
      console.log(`--- ${label}: expected ${ids.length}, found ${foundIds.length} ---`);
      if (missing.length) console.log(`  MISSING/ALREADY-CHANGED (skipped): ${missing.join(', ')}`);
      if (foundIds.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [foundIds, newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} ${foundIds.length} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    async function strayUpdate(label, strays) {
      console.log(`--- ${label} (${strays.length} individual rows) ---`);
      for (const s of strays) {
        const checkRes = await client.query(
          `SELECT id FROM catalog_unified WHERE id = $1 AND is_active = true AND display_subcategory IS NULL`,
          [s.id]
        );
        if (checkRes.rows.length === 0) {
          console.log(`  [${s.id}] MISSING/ALREADY-CHANGED (skipped)`);
          continue;
        }
        if (APPLY) {
          await client.query(
            `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = $1`,
            [s.id, s.cat, s.sub]
          );
        }
        console.log(`  [${s.id}] ${APPLY ? 'updated' : 'would update'} -> category="${s.cat}" subcategory="${s.sub}"`);
      }
      console.log('');
    }

    async function catchAllUpdate(label, vendorCategories, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Tools & Chemicals'
           AND display_subcategory IS NULL
           AND category = ANY($1::text[])`,
        [vendorCategories]
      );
      console.log(`--- ${label}: ${checkRes.rows.length} rows (remainder) ---`);
      if (checkRes.rows.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [checkRes.rows.map((r) => r.id), newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    console.log('=== Clusters pulled out to their real homes ===\n');
    await idListUpdate('Chargers/jump-packs/testers -> Electrical/Charging System & Components', CHARGERS_JUMPPACKS, 'Electrical', 'Charging System & Components');
    await idListUpdate('Leads/cables/connectors -> Electrical/Batteries, Cables & Accessories', LEADS_CABLES, 'Electrical', 'Batteries, Cables & Accessories');
    await idListUpdate('Repair manuals -> Hardware Covers & General/Shop Manuals', REPAIR_MANUALS, 'Hardware, Covers & General', 'Shop Manuals');
    await idListUpdate('Motorcycle covers -> Hardware Covers & General/Motorcycle Covers', MOTORCYCLE_COVERS, 'Hardware, Covers & General', 'Motorcycle Covers');
    await idListUpdate('Trailer/tie-down/cargo gear -> Accessories & Misc/Trailer & Towing', TRAILER_TIEDOWN, 'Accessories & Misc', 'Trailer & Towing');
    await strayUpdate('Tools & Shop Equipment individual part strays', TSE_STRAYS);
    await strayUpdate('TOOLS/TOOLS GROUP individual part strays', TOOLS_STRAYS);

    console.log('=== Genuine remainder -> Tools & Chemicals ===\n');
    await catchAllUpdate('Tools & Shop Equipment remainder -> Tools', ['Tools & Shop Equipment'], 'Tools & Chemicals', 'Tools');
    await catchAllUpdate('TOOLS/TOOLS GROUP remainder -> Tools', ['TOOLS', 'TOOLS GROUP'], 'Tools & Chemicals', 'Tools');
    await catchAllUpdate('Chemicals & Maintenance -> Chemicals & Lubricants', ['Chemicals & Maintenance'], 'Tools & Chemicals', 'Chemicals & Lubricants');

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
