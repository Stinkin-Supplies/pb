// fix_cables_stragglers.mjs
// Cables — STRAGGLER SWEEP, not a fresh build.
//
// Cables ALREADY EXISTS as its own top-level category with 4,253 rows
// correctly classified (confirmed via audit_cables_scope.mjs — the old
// Handlebar & Controls -> "Cables & Lines" bucket is now 0 rows, meaning
// that migration already happened in a prior session). This script does
// NOT touch those 4,253 rows. It only sweeps in genuine stragglers still
// sitting in other categories.
//
// DEFAULT MODE = DRY RUN. No writes happen unless --apply is passed.
//
// Confirmed conventions from the audit (not re-litigating these):
//   - Brake lines/hoses stay in Brakes (Brakes -> "Brake Lines & Hoses",
//     1,989 rows already there) — only hydraulic CLUTCH lines go to Cables
//     (Cables -> "Hydraulic Clutch Lines", 134 rows already there)
//   - Battery/ground/starter cables stay in Electrical (180 rows, correctly
//     excluded) — these are electrical cables, not mechanical control cables
//   - Ignition/magneto/distributor tachometer cables are ELECTRICAL/ignition
//     parts, not instrument cables — despite the word "Tachometer Cable"
//     they are magneto drive cables, not speedo/tach cable assemblies for
//     Dashes & Gauges. Audit surfaced these specifically:
//       "29-1/2 inch Distributor Drive Tachometer Cable"
//       "29 inch Magneto Black Tachometer Cable"
//       "34-1/4 inch Magneto Black Tachometer Cable"
//     These stay OUT of Cables (excluded explicitly below).
//
// Straggler sources identified by the cross-category sweep (section 2 of
// the audit): Handlebar & Controls (272), Brakes (149 — mostly combo
// "Handlebar Cable and Brake Line Kit" bundle products), Accessories & Misc
// (64), Transmission & Clutch (42), Frame & Hardware (39), Carburetion &
// Fuel (38), Dashes & Gauges (31), Security & Covers (22), Engine (6),
// Frames & Suspension (6), Riding Gear & Apparel (2), Exhaust (2),
// Gaskets & Seals (1), Suspension (1), Tanks & Body (1), Lighting (1),
// Fenders & Body (1).
//
// Run:
//   node fix_cables_stragglers.mjs                 (dry run, default)
//   node fix_cables_stragglers.mjs --apply          (live writes)
//   node fix_cables_stragglers.mjs --sample=50       (dry run, bigger sample)

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const db = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sampleArg = args.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 20;

const NEW_CATEGORY = 'Cables';

// Round 2 fix: ~530 rows matched into Cables were actually grip products
// where "Cable" refers to the throttle-BY-CABLE variant of the grip (as
// opposed to throttle-by-wire), not a cable product at all — e.g. "Diamond
// Grips - Cable - Red", "AIR SS GRIPS CABLE THROTTLE BOSS CHROME",
// "REAPER HANDLE GRIP SET 82-17 HD DUAL CABLE SET", and the ambiguous
// "LOCK-ON ... CABLE 1"" grip-collar product. Laken's call: these go to
// Handlebar & Controls -> "Grips, Heated Grips" instead of Cables.
const GRIP_PATTERN = /GRIPS?[\s\S]{0,20}CABLE|CABLE[\s\S]{0,20}GRIPS?|LOCK-ON[\s\S]*CABLE|DUAL\s+CABLE\s+SET/i;
const GRIP_TARGET_CATEGORY = 'Handlebar & Controls';
const GRIP_TARGET_SUBCATEGORY = 'Grips, Heated Grips';

// Round 2 fix: "CABLES BAT ..." rows (BAT = battery) are battery cables and
// belong with batteries in Electrical, not left unmatched. Laken's call:
// route explicitly rather than leave as a silent unmatched row.
const BATTERY_CABLE_PATTERN = /^CABLES?\s+BAT\b|BATTERY\s+CABLE/i;
const BATTERY_TARGET_CATEGORY = 'Electrical';
const BATTERY_TARGET_SUBCATEGORY = 'Batteries';

// Explicit exclusions — checked BEFORE any inclusion rule. These override
// even a strong keyword match like "cable."
const EXCLUSIONS = [
  // Ignition/magneto/distributor drive cables — electrical/ignition parts,
  // not instrument or control cables, despite containing "Tachometer Cable."
  /MAGNETO.*CABLE/i,
  /DISTRIBUTOR\s+DRIVE.*CABLE/i,
  // Battery/ground/starter cables — stay in Electrical.
  /BATTERY\s+CABLE/i,
  /GROUND\s+(CABLE|STRAP)/i,
  /STARTER\s+CABLE/i,
  // Brake-only lines/hoses (no clutch involved) — stay in Brakes.
  // Combo "Handlebar Cable and Brake Line Kit" bundles are ambiguous (see
  // below — handled as a specific inclusion instead, since they DO belong
  // partly to cables); pure brake line/hose products without "clutch" or
  // "cable" as the primary subject are excluded here.
  /^BRAKE\s+LINE/i,
  /^BRAKE\s+HOSE/i,
];

// Inclusion rules — order matters, first match wins (after exclusions clear).
const RULES = [
  // Combo handlebar-cable + brake-line kits — genuinely a cables product
  // (throttle/clutch/idle cables bundled with a brake line), route to the
  // existing "Cable & Line Kits" subcategory rather than leaving in Brakes.
  { subcategory: 'Cable & Line Kits', pattern: /HANDLEBAR\s+CABLE\s*(AND|\/)\s*BRAKE\s+LINE\s+KIT/i },

  // Hydraulic clutch lines — matches the existing "Hydraulic Clutch Lines" subcategory.
  { subcategory: 'Hydraulic Clutch Lines', pattern: /HYDRAULIC\s+CLUTCH/i },
  { subcategory: 'Hydraulic Clutch Lines', pattern: /CLUTCH\s+(LINE|HOSE)/i },

  // Throttle
  { subcategory: 'Throttle', pattern: /THROTTLE\s+(AND\s+IDLE\s+)?CABLE/i },
  { subcategory: 'Throttle', pattern: /THROTTLE\s+CABLE/i },

  // Idle
  { subcategory: 'Idle', pattern: /\bIDLE\s+CABLE\b/i },

  // Clutch (mechanical cable, not hydraulic — checked after hydraulic rules above)
  { subcategory: 'Clutch', pattern: /CLUTCH\s+CABLE/i },
  { subcategory: 'Clutch', pattern: /MOUSETRAP\s+CLUTCH/i },

  // Speedometer cable — mechanical drive cable, not the electronic sensor
  // (electronic speedo sensors already live in Dashes & Gauges — this is
  // specifically the physical cable-drive speedometer cable).
  { subcategory: 'Speedometer', pattern: /SPEEDOMETER\s+CABLE/i },

  // Clamps and Covers
  { subcategory: 'Clamps and Covers', pattern: /CABLE\s+CLAMP/i },
  { subcategory: 'Clamps and Covers', pattern: /CABLE\s+COVER/i },
  { subcategory: 'Clamps and Covers', pattern: /CABLE\s+GUIDE/i },

  // Universal/Build Your Own — cable component parts, elbow fittings, etc.
  { subcategory: 'Universal/Build Your Own', pattern: /CABLE\s+COMPONENT/i },
  { subcategory: 'Universal/Build Your Own', pattern: /ELBOW\s+FITTING/i },

  // Broad fallback — bare "cable" not caught above, still worth sweeping in
  // as long as it cleared the exclusions.
  { subcategory: 'Universal/Build Your Own', pattern: /\bCABLE\b/i },
];

// Round 3 fix: bare CABLE fallback was sweeping in throttle assemblies,
// handlebars/ape-hangers, and lever assemblies that merely mention "cable"
// as a compatibility spec (e.g. "Single Cable" vs "Dual Cable" throttle
// bore size, or "Cable Opening" on a lever) — these are NOT cable products.
// Laken's call: route each back to its correct existing Handlebar & Controls
// subcategory rather than sweeping into Cables or holding for cleanup.
const OTHER_PART_EXCLUSIONS = [
  {
    pattern: /THROTTLE\s+(ASSEMBLY|TUBE)/i,
    targetCategory: 'Handlebar & Controls',
    targetSubcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware',
  },
  {
    pattern: /\bH-BAR\b|APE[\s-]?HANGER|HANDLEBAR/i,
    targetCategory: 'Handlebar & Controls',
    targetSubcategory: 'Handlebars & Components',
  },
  {
    pattern: /LEVER\s+ASSEMBL/i,
    targetCategory: 'Handlebar & Controls',
    targetSubcategory: 'Hand Control Sets, Levers',
  },
  {
    pattern: /THROTTLE\s+CLAMP/i,
    targetCategory: 'Handlebar & Controls',
    targetSubcategory: 'Risers, Clamps & Components',
  },
  {
    pattern: /GRIP\s+SET/i, // "GRIP SET RETRO BLACK DUAL CABLE" — missed by GRIP_PATTERN, doesn't say "Grips"
    targetCategory: 'Handlebar & Controls',
    targetSubcategory: 'Grips, Heated Grips',
  },
];

// Split RULES: SPECIFIC_RULES are unambiguous cable-product phrases (checked
// first, always win). GENERIC_FALLBACK_RULE is the broad bare "cable" match,
// which must be checked AFTER matchOtherPart, not before — otherwise it
// swallows throttle assemblies/handlebars/levers before matchOtherPart ever
// gets a chance to route them correctly.
const SPECIFIC_RULES = RULES.slice(0, -1); // everything except the last (bare CABLE) rule
const GENERIC_FALLBACK_RULE = RULES[RULES.length - 1]; // { subcategory: 'Universal/Build Your Own', pattern: /\bCABLE\b/i }

function matchOtherPart(name) {
  for (const rule of OTHER_PART_EXCLUSIONS) {
    if (rule.pattern.test(name)) return rule;
  }
  return null;
}

function classifySpecific(name) {
  if (GRIP_PATTERN.test(name)) return null;
  if (BATTERY_CABLE_PATTERN.test(name)) return null;
  for (const excl of EXCLUSIONS) {
    if (excl.test(name)) return null;
  }
  for (const rule of SPECIFIC_RULES) {
    if (rule.pattern.test(name)) return rule.subcategory;
  }
  return null;
}

function classifyGenericFallback(name) {
  if (EXCLUSIONS.some((excl) => excl.test(name))) return null;
  return GENERIC_FALLBACK_RULE.pattern.test(name) ? GENERIC_FALLBACK_RULE.subcategory : null;
}

// Straggler sources — everything EXCEPT Cables itself (which is already correct).
const SOURCE_QUERIES = [
  {
    label: 'Handlebar & Controls',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Handlebar & Controls'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Brakes',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Brakes'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Accessories & Misc',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Accessories & Misc'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Transmission & Clutch',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Transmission & Clutch'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Frame & Hardware',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Frame & Hardware'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Carburetion & Fuel',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Carburetion & Fuel'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Dashes & Gauges',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Dashes & Gauges'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Security & Covers',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Security & Covers'
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
  {
    label: 'Small remainder categories (Engine, Frames & Suspension, Riding Gear & Apparel, Exhaust, Gaskets & Seals, Suspension, Tanks & Body, Lighting, Fenders & Body)',
    sql: `SELECT id, source_vendor, name, display_category, display_subcategory
          FROM catalog_unified
          WHERE display_category IN (
            'Engine', 'Frames & Suspension', 'Riding Gear & Apparel', 'Exhaust',
            'Gaskets & Seals', 'Suspension', 'Tanks & Body', 'Lighting', 'Fenders & Body'
          )
            AND is_active = true
            AND (name ILIKE '%cable%' OR subcategory ILIKE '%cable%')`,
  },
];

async function main() {
  console.log(`=== CABLES — STRAGGLER SWEEP (${APPLY ? 'LIVE APPLY' : 'DRY RUN'}) ===`);
  console.log(new Date().toISOString());
  console.log('(Cables category itself — 4,253 already-correct rows — is NOT touched by this script)');
  console.log('');

  const results = {};
  const gripRows = []; // separate bucket -> Handlebar & Controls / Grips, Heated Grips, not Cables
  const batteryRows = []; // separate bucket -> Electrical / Batteries, not Cables
  const otherPartRows = {}; // keyed by "targetCategory|targetSubcategory" -> rows, for throttle assemblies/handlebars/levers/etc that merely mention "cable"
  const unmatched = [];
  let totalCandidates = 0;

  for (const source of SOURCE_QUERIES) {
    const res = await db.query(source.sql);
    console.log(`--- Source: ${source.label} — ${res.rows.length} candidates ---`);
    totalCandidates += res.rows.length;

    for (const row of res.rows) {
      if (GRIP_PATTERN.test(row.name)) {
        gripRows.push({ ...row, source: source.label });
        continue;
      }
      if (BATTERY_CABLE_PATTERN.test(row.name)) {
        batteryRows.push({ ...row, source: source.label });
        continue;
      }
      // 1. Specific, unambiguous cable-product phrases win immediately.
      const specificSubcat = classifySpecific(row.name);
      if (specificSubcat) {
        results[specificSubcat] = results[specificSubcat] || [];
        results[specificSubcat].push({ ...row, source: source.label });
        continue;
      }
      // 2. Before falling back to the generic bare-"cable" match, check
      // whether this is actually a throttle assembly/handlebar/lever/etc
      // that merely mentions "cable" as a spec — route those to their
      // correct Handlebar & Controls subcategory instead.
      const otherPart = matchOtherPart(row.name);
      if (otherPart) {
        const key = `${otherPart.targetCategory}|${otherPart.targetSubcategory}`;
        otherPartRows[key] = otherPartRows[key] || { ...otherPart, rows: [] };
        otherPartRows[key].rows.push({ ...row, source: source.label });
        continue;
      }
      // 3. Last resort: generic bare "cable" fallback into Cables.
      const fallbackSubcat = classifyGenericFallback(row.name);
      if (fallbackSubcat) {
        results[fallbackSubcat] = results[fallbackSubcat] || [];
        results[fallbackSubcat].push({ ...row, source: source.label });
      } else {
        unmatched.push({ ...row, source: source.label });
      }
    }
  }

  console.log('');
  console.log('--- Classification summary ---');
  let totalClassified = 0;
  for (const [subcat, rows] of Object.entries(results)) {
    console.log(`  ${subcat}: ${rows.length}`);
    totalClassified += rows.length;
  }
  console.log(`  [separate routing] Grips -> Handlebar & Controls / Grips, Heated Grips: ${gripRows.length}`);
  console.log(`  [separate routing] Battery cables -> Electrical / Batteries: ${batteryRows.length}`);
  let otherPartTotal = 0;
  for (const [key, group] of Object.entries(otherPartRows)) {
    console.log(`  [separate routing] Other parts -> ${key}: ${group.rows.length}`);
    otherPartTotal += group.rows.length;
  }
  console.log(`  UNMATCHED (stays in current category): ${unmatched.length}`);
  console.log(`  Total candidates: ${totalCandidates} | Classified into Cables: ${totalClassified} | Routed to Grips: ${gripRows.length} | Routed to Battery: ${batteryRows.length} | Routed to other Handlebar & Controls subcats: ${otherPartTotal} | Unmatched: ${unmatched.length}`);
  console.log(`  Coverage: ${(((totalClassified + gripRows.length + batteryRows.length + otherPartTotal) / totalCandidates) * 100).toFixed(1)}%`);
  console.log('');

  console.log(`--- Sample rows per subcategory (first ${SAMPLE_SIZE}) ---`);
  for (const [subcat, rows] of Object.entries(results)) {
    console.log(`\n  [${subcat}] (${rows.length} total)`);
    rows.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  console.log(`\n  [ROUTED TO GRIPS — Handlebar & Controls / Grips, Heated Grips] (${gripRows.length} total)`);
  gripRows.slice(0, SAMPLE_SIZE).forEach((r) => {
    console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
  });

  console.log(`\n  [ROUTED TO BATTERY — Electrical / Batteries] (${batteryRows.length} total)`);
  batteryRows.slice(0, SAMPLE_SIZE).forEach((r) => {
    console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
  });

  for (const [key, group] of Object.entries(otherPartRows)) {
    console.log(`\n  [ROUTED — ${key}] (${group.rows.length} total)`);
    group.rows.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  if (unmatched.length > 0) {
    console.log(`\n  [UNMATCHED] (${unmatched.length} total, first ${SAMPLE_SIZE})`);
    unmatched.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  console.log('');

  if (!APPLY) {
    console.log('=== DRY RUN COMPLETE — no writes performed. Review samples above, then re-run with --apply. ===');
    return;
  }

  console.log('=== APPLYING CHANGES ===');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let updatedCount = 0;
    for (const [subcat, rows] of Object.entries(results)) {
      const ids = rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2
         WHERE id = ANY($3::int[])`,
        [NEW_CATEGORY, subcat, ids]
      );
      console.log(`  Updated ${res.rowCount} rows -> ${NEW_CATEGORY} / ${subcat}`);
      updatedCount += res.rowCount;
    }
    if (gripRows.length > 0) {
      const gripIds = gripRows.map((r) => r.id);
      const gripRes = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2
         WHERE id = ANY($3::int[])`,
        [GRIP_TARGET_CATEGORY, GRIP_TARGET_SUBCATEGORY, gripIds]
      );
      console.log(`  Updated ${gripRes.rowCount} rows -> ${GRIP_TARGET_CATEGORY} / ${GRIP_TARGET_SUBCATEGORY}`);
      updatedCount += gripRes.rowCount;
    }
    if (batteryRows.length > 0) {
      const batteryIds = batteryRows.map((r) => r.id);
      const batteryRes = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2
         WHERE id = ANY($3::int[])`,
        [BATTERY_TARGET_CATEGORY, BATTERY_TARGET_SUBCATEGORY, batteryIds]
      );
      console.log(`  Updated ${batteryRes.rowCount} rows -> ${BATTERY_TARGET_CATEGORY} / ${BATTERY_TARGET_SUBCATEGORY}`);
      updatedCount += batteryRes.rowCount;
    }
    for (const [key, group] of Object.entries(otherPartRows)) {
      const ids = group.rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2
         WHERE id = ANY($3::int[])`,
        [group.targetCategory, group.targetSubcategory, ids]
      );
      console.log(`  Updated ${res.rowCount} rows -> ${key}`);
      updatedCount += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\n=== APPLY COMPLETE — ${updatedCount} rows updated. Unmatched (${unmatched.length}) left untouched in their original categories. ===`);
    console.log('Next: re-sync / reindex Typesense per standing pipeline.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('APPLY FAILED, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SCRIPT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
