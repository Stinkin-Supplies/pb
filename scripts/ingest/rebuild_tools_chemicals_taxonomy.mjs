#!/usr/bin/env node
/**
 * rebuild_tools_chemicals_taxonomy.mjs
 *
 * Session-89 follow-up: Tools & Chemicals full audit. Laken's finding:
 * both "Tools" (968 rows) and "Chemicals & Lubricants" (758 rows) are
 * huge enough to have real subcategory-worthy clusters inside them, not
 * just detail groupings within a single bucket.
 *
 * Promoted to full standalone subcategories (peers of Tools /
 * Chemicals & Lubricants), per Laken's explicit picks:
 *   - Hand Tools & Sets            (from Tools)
 *   - Engine & Drivetrain Tools    (from Tools)
 *   - Engine & Motor Oil           (from Chemicals & Lubricants)
 *   - Cleaners, Wash & Detailing   (from Chemicals & Lubricants)
 *
 * Everything else gets display_subcategory_detail groupings within the
 * remaining Tools / Chemicals & Lubricants buckets (Laken: "detail-tag
 * everything"), per the standing >150-item policy. True stragglers with
 * no clean cluster are left with no detail tag.
 *
 * Usage:
 *   node scripts/ingest/rebuild_tools_chemicals_taxonomy.mjs            # dry run
 *   node scripts/ingest/rebuild_tools_chemicals_taxonomy.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATEGORY = 'Tools & Chemicals';

// ── Tools: promoted subcats + remaining details ─────────────────────────
const TOOLS_RULES = [
  { target: 'promote:Engine & Drivetrain Tools', test: /bearing (puller|installer|remover|race|driver)|cam (bearing|bushing|lock|change|gear|plate|chain)|crank(shaft)?|clutch (hub|spring|adjuster|tool)|primary lock|shifter (fork|shaft)|case (splitter|lap|bolt)|piston (ring|pin)|wrist pin|valve (guide|spring|grinding|lapper|stem|fishing)|fork (seal|spring|cap|leg|bushing|stem|race|align|nut)|steering (head|race|stem)|sprocket (nut|puller|jammer)|\baxle\b|pinion|neck race|bushing (installation|reaming|installer|remover|pilot)|stud installation|lap head|thread insert|sav-a-thread|hone|flexhone|hollow axle|drum hub|final drive|counter sprocket|compensating sprocket|install fixture|hold down nuts|cleve block|access door bearing|die tool|tap tool|tap (and )?die|install protector|engine lift|main seal (install|remov)|ring compressor|compression release|tappet tool|rod (straighten|lapping|alignment)|cylinder extract|number stamp|breather ream|hard cap tool|head holder tool|wheel (bearing|alignment) (driver|remover|tool|set)|rear wheel alignment|reamer (tool|pilot)|balancer.*tool|shaft turning|seal tool\b/i },
  { target: 'promote:Hand Tools & Sets', test: /wrench|socket|\bskt\b|screwdriver|plier|hammer|ratchet|extension set|hex[\s-]?(bit|set|drive)|torx|punch|chisel|file set|feeler gauge|tape measure|pry\s*bar|razor|scraper|\bdrill\b|impact driver|rivet|crimp|caliper|multi cutter|spinner|t-handle|drive tool|\btap\b|nut driver|blow gun|magnet retriever/i },
  { target: 'detail:Shop Supplies & Wire', test: /\btape\b|shop towel|shop floor mat|magnetic (finger|pick|utility)|warning triangle|safety.?wire|wire loom|drain pan|grunge brush|microfiber|boom mat|hose forming|bar stool|cycle dryer|extension hose kit|flexit|stethoscope|swivel mirror|metal can\b|\bfunnel\b/i },
  { target: 'detail:Battery & Charging', test: /battery|charger|charging|charge system|jump start/i, brandFallback: ['Tecmate', 'Yuasa', 'NOCO GENIUS', 'BS BATTERY'] },
  { target: 'detail:Tire Tools & Gauges', test: /tire (iron|gauge|patch|plug|repair|buffer|probe|scraper|string)|valve (stem|core)|bead (head|starter)|rim (protector|clamp)|air chuck|pressure gauge|foot pump|mini air compressor|co2 canister|truing stand/i },
  { target: 'detail:Rider Tool Kits & Rolls', test: /rider tool kit|tool kit for|\btool kit\b|tool roll|tool bag|tool pouch|roll-up pouch/i },
  { target: 'detail:Diagnostic & Tuning Tools', test: /diagnostic|tuning|token|scan tool|timing light|ignition system tester|compression tester|leakdown|circuit tester|cooling system tester|carburetor leak detector|belt tension gauge/i, brandFallback: ['Dynojet', 'Daytona Twin Tec', 'DIAG4 BIKE', 'TTS'] },
  { target: 'detail:Engine Stands & Lifts', test: /engine stand|motorcycle lift|roller dolly|c-stand|rollastand|high roller stand|jack stand|lift dolly|kick stand angle|engine dummy plate|rolling buddy/i },
  { target: 'detail:Tie-Downs & Transport', test: /tie-?down|cargo net|bar harness|ratchet.*strap|soft-tye/i },
  { target: 'detail:Cable & Chain Tools', test: /chain (breaker|riveting|rivet|alignment|link press|tool|puller|shoe|unloader)|cable (lube|luber|lubricant)/i },
  { target: 'detail:Shock & Suspension Tools', test: /shock (tool|adjuster|compression|spring|pump|filler)|multi shock/i },
  { target: 'detail:Electrical Terminal Tools', test: /terminal (remov|extract)|molex|matenlock/i },
  { target: 'detail:Brake Bleeding Tools', test: /bleeder|reverse bleeder/i },
];

// ── Chemicals & Lubricants: promoted subcats + remaining details ────────
const CHEM_RULES = [
  { target: 'promote:Cleaners, Wash & Detailing', test: /cleaner|degreaser|\bwash\b|detail|polish|shine|\bwax\b|renew|glass|plexi|clay|towel|cloth|wipe|remover|repellent|protectant|corrosion block|freshener|leather.*repair/i, brandFallback: ['K&N'] },
  { target: 'detail:Gasket/Thread Sealants & Adhesives', test: /gasket|threadlock|thread lock|thread sealant|sealant|epoxy|adhesive|\brtv\b|super glue|griplock/i },
  { target: 'detail:Fuel Treatments & Additives', test: /fuel|octane|stabiliz|power boost|cool down|octanium/i },
  { target: 'detail:Fork/Shock/Suspension Fluid', test: /fork oil|fork fluid|shock oil|shock fluid|suspension fluid|suspension clean/i },
  { target: 'detail:Oil Change Kits', test: /oil change kit|full oil service kit/i },
  { target: 'detail:Gear/Trans/Primary Oil', test: /gear oil|gear lube|trans oil|trans lube|transmission oil|transmission fluid|primary oil|primary lube|primary case oil|chaincase|chain case|gearcase|prim-chain/i },
  { target: 'detail:Grease & Assembly Lube', test: /\bgrease\b|assembly lube|assembly grease|multi-purpose lubricant|multi-p penetrating|penetrant lube|air tool lubricant|gun oil/i },
  { target: 'detail:Paint & Coatings', test: /paint|finish|coating|primer|epoxy porcelain|wrinkle texture|rattle bomb/i },
  { target: 'detail:Chain Care', test: /chain lube|chain wax|chain guard|chain care|chain clean/i },
  { target: 'detail:Brake/Hydraulic Fluid', test: /brake fluid|hydraulic fluid|hydraulic lever oil/i },
  { target: 'detail:Tire Sealant & Mounting', test: /tire (mount|lube|balancer|sealant)|tps tire/i, brandFallback: ['SLIME'] },
  { target: 'detail:Coolant', test: /coolant|prep fluid/i },
  { target: 'detail:Air Filter Oil/Cleaner', test: /air filter (oil|clean|care)|foam filter (oil|clean)|fab.?1|power kleen/i },
  { target: 'detail:Cable Lube', test: /cable lube/i },
  { target: 'promote:Engine & Motor Oil', test: /motor oil|engine oil|\bm\/c\b.*oil|petroleum oil|synthetic oil|mineral oil|ester.*oil|\boil\b.*\d+w\d+|\d+w\d+.*\boil\b|ready oil|\blubricant\b|synthetic lubricant|\boil\b|spray lube|cam lube/i },
  { target: 'detail:Electrical/Contact Cleaner', test: /contact cleaner|dielectric/i },
];

function classify(rules, brand, name) {
  for (const rule of rules) {
    if (rule.test.test(name) || (rule.brandFallback && rule.brandFallback.includes(brand))) return rule.target;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: toolsRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Tools'`, [CATEGORY]);
    const { rows: chemRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Chemicals & Lubricants'`, [CATEGORY]);

    for (const r of toolsRows) r.target = classify(TOOLS_RULES, r.brand, r.name);
    for (const r of chemRows) r.target = classify(CHEM_RULES, r.brand, r.name);

    const summarize = (rows, label) => {
      const byTarget = {};
      let none = 0;
      rows.forEach(r => { if (r.target) (byTarget[r.target] = byTarget[r.target] || []).push(r); else none++; });
      console.log(`\n=== ${label} (${rows.length} total) ===`);
      Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length)
        .forEach(([k, v]) => console.log(`  ${v.length.toString().padStart(4)}  ${k}`));
      console.log(`  ${none.toString().padStart(4)}  (no detail — ungrouped stragglers)`);
    };
    summarize(toolsRows, 'Tools');
    summarize(chemRows, 'Chemicals & Lubricants');

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of [...toolsRows, ...chemRows]) {
      if (!r.target) continue;
      const [kind, name] = r.target.split(/:(.+)/); // split on first colon only
      if (kind === 'promote') {
        await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL WHERE id = $2`, [name, r.id]);
      } else {
        // detail: stays in its current subcategory (Tools or Chemicals & Lubricants), just tag detail
        await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [name, r.id]);
      }
    }
    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
    console.log('\nNEXT STEP: node scripts/ingest/index_unified.js --recreate');
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
