// fix_five_category_subcat_pass.mjs
//
// Subcategory pass for NULL-subcategory rows in: Electrical, Foot Controls,
// Handlebar & Controls, Transmission & Clutch, Suspension.
//
// This is a SEPARATE pass from the category-level move done by
// fix_accessories_misc_taxonomy.mjs — it operates on whatever NULL rows
// currently sit in these 5 categories, regardless of how they got there
// (confirmed some are from today's Accessories & Misc move, some are
// pre-existing, e.g. Foot Controls' known 467 and Suspension's known 99).
//
// IMPORTANT: rows whose product name doesn't match the category at all
// (e.g. exhaust pipes/fishtails/luggage sitting in Foot Controls, brake
// kits sitting in Suspension) are NOT force-classified into an in-category
// subcategory. They're bucketed separately as WRONG-CATEGORY CANDIDATES
// and held back for Laken's explicit review, same convention as every
// other held-back list in this project.
//
// Usage:
//   node fix_five_category_subcat_pass.mjs           (dry run)
//   node fix_five_category_subcat_pass.mjs --apply   (writes)

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not found — check .env.local / .env at repo root.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

// ---------------------------------------------------------------------
// Subcategory rules per category. Order matters — first match wins.
// Patterns use Postgres ~* against `name`. Following this project's
// established convention: no \b (unsupported), use (^|\s) / (\s|$),
// widened to (^|[\s/'-]) / ([\s/'-]|$) for vendor-name punctuation.
// ---------------------------------------------------------------------

const B = (s) => `(^|[\\s/'-])${s}([\\s/'-]|$)`;

const RULES = {
  'Electrical': [
    { subcat: 'Ignition Coils', pattern: B('IGNITION COILS?') },
    { subcat: 'Ignition Coil Hardware', pattern: `(${B('COIL')}.*${B('(MOUNT|BRACKET|SCREW|STUD|PLATE)S?')})|(${B('BREAKER ARM (WASHER|SCREW)')})` },
    { subcat: 'Starter Relays', pattern: B('STARTER RELAYS?') },
    { subcat: 'Horns', pattern: B('HORNS?') },
    { subcat: 'LED Bulbs', pattern: `${B('LED BULBS?')}|${B('LED WEDGE')}|${B('SUPER FLUX')}|${B('H-?4 LED')}` },
  ],
  'Handlebar & Controls': [
    { subcat: 'Grips', pattern: `${B('GRIPS?')}|${B('TWIST GRIP')}|${B('GRIP SET')}|${B('GRIP TUBE')}` },
  ],
  'Transmission & Clutch': [
    { subcat: 'Shifter Forks & Gears', pattern: `${B('SHIFTER FORKS?')}|${B('SHIFTER GEARS?')}|${B('SHIFTER FORK SHAFT')}|${B('SHIFTER FORK SHIM')}|${B('SHIFTER FORK SET')}` },
  ],
  'Foot Controls': [
    { subcat: 'Kickstands & Hardware', pattern: `${B('KICKSTANDS?')}|${B('JIFFY STAND')}|${B('KICK ?STAND')}` },
    { subcat: 'Freeway Bars & Highway Pegs', pattern: `${B('FREEWAY BARS?')}|${B('HIGHWAY (BARS?|PEGS?)')}` },
    { subcat: 'Footpegs, Boards & Hardware', pattern: `${B('FOOTPEGS?')}|${B('FOOT ?BOARDS?')}|${B('PEG MOTO')}|${B('MINI BOARDS?')}|${B('TOURING TIP')}|${B('MID-?PEG')}|${B('PEG-?BOARD')}` },
    { subcat: 'Forward & Mid Controls', pattern: `${B('FORWARD C(O)?NTRLS?')}|${B('FORWARD CONTROLS?')}|${B('MID CONTROL')}` },
    { subcat: 'Brake Arm & Pedal Hardware', pattern: `${B('BRAKE ARMS?')}|${B('BRK ARM')}|${B('PEDAL')}|${B('KICK PEDAL')}|${B('TOE PEG')}|${B('SHIFT SLEEVE')}|${B('JOCKEY (PEDAL|SHIFT)')}|${B('HEEL (LEVER|REST)')}|${B('CLEVIS')}|${B('BRAKE (KIT|CONTROL)')}` },
    { subcat: 'Shifter Assemblies & Kits', pattern: `${B('SHIFT KIT')}|${B('FOOT SHIFTER')}|${B('SHIFTER PEG')}|${B('HAND SHIFT LEVER')}|${B('SHIFT SLEEVE LOCATOR')}|${B('SHIFTER KIT')}` },
  ],
  'Suspension': [
    { subcat: 'Dampers & Cush Drive', pattern: `${B('DAMPERS?')}|${B('CUSH DRIVE')}|${B('DAMPER (KIT|DISC|WASHER)')}` },
    { subcat: 'Steering Stem Hardware', pattern: `${B('STEM (HEAD|BOLT)')}|${B('STEERING (STEM|DAMPER|UPPER)')}|${B('STEM HEAD CONE')}` },
    { subcat: 'Ride Control & Rear Support', pattern: `${B('RIDE CONTROL')}|${B('REAR (SUPPORT|ADJUST)')}|${B('SHACKLE KIT')}` },
  ],
};

// ---------------------------------------------------------------------
// Wrong-category signal words: if a row's name matches one of these
// per-category exclusion lists, it is NOT a subcategory problem — it's
// likely misfiled at the top-level category entirely. Held back, not
// force-classified, not even into a same-category subcategory.
// ---------------------------------------------------------------------

const WRONG_CATEGORY_SIGNALS = {
  'Foot Controls': [
    'EXHAUST', 'FISHTAIL', 'BAFFLE', 'PIPE SET', 'DRAG PIPE',
    'LUGGAGE', 'TOUR-PAK', 'SADDLEBAG', 'SIDE COVER',
    'DEALER SIGN', 'DISC.*SPOKE', 'HEAT SHIELD', 'TIE DOWN',
    'FUEL HOSE', 'O-RING KIT', 'CARBURETOR',
  ],
  'Suspension': [
    'SPRING FORK (BRAKE|FRONT BRAKE)', 'BRAKE (KIT|CALIPER|SHOE|SEAL|LINING)',
    'CLUTCH', 'TRANSMISSION SHIFTER',
  ],
};

function buildWrongCategoryRegex(category) {
  const words = WRONG_CATEGORY_SIGNALS[category];
  if (!words || words.length === 0) return null;
  return words.map((w) => `(${w})`).join('|');
}

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

async function main() {
  const client = pool;

  console.log('='.repeat(78));
  console.log(`5-CATEGORY SUBCATEGORY PASS  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log('='.repeat(78));
  console.log('Electrical, Foot Controls, Handlebar & Controls, Transmission & Clutch, Suspension\n');

  let grandTotalMatched = 0;
  let grandTotalWrongCat = 0;
  let grandTotalUnmatched = 0;

  for (const category of Object.keys(RULES)) {
    const totalRes = await client.query(
      `SELECT COUNT(*) FROM catalog_unified
       WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true`,
      [category]
    );
    const total = Number(totalRes.rows[0].count);

    console.log('-'.repeat(78));
    console.log(`${category}  (${total} NULL-subcategory rows)`);
    console.log('-'.repeat(78));

    // Pull all NULL rows for this category once, classify in JS so we can
    // report tallies and samples without N queries.
    const rowsRes = await client.query(
      `SELECT id, sku, name FROM catalog_unified
       WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true
       ORDER BY name`,
      [category]
    );

    const wrongCatRegexSrc = buildWrongCategoryRegex(category);
    const wrongCatRegex = wrongCatRegexSrc ? new RegExp(wrongCatRegexSrc, 'i') : null;

    const tally = {};
    const samples = {};
    const toUpdate = []; // { id, subcat }
    const wrongCategory = [];
    const unmatched = [];

    for (const row of rowsRes.rows) {
      if (wrongCatRegex && wrongCatRegex.test(row.name)) {
        wrongCategory.push(row);
        continue;
      }

      let matchedSubcat = null;
      for (const rule of RULES[category]) {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(row.name)) {
          matchedSubcat = rule.subcat;
          break;
        }
      }

      if (matchedSubcat) {
        tally[matchedSubcat] = (tally[matchedSubcat] || 0) + 1;
        if (!samples[matchedSubcat]) samples[matchedSubcat] = [];
        if (samples[matchedSubcat].length < 5) samples[matchedSubcat].push(row);
        toUpdate.push({ id: row.id, subcat: matchedSubcat });
      } else {
        unmatched.push(row);
      }
    }

    console.log('  Classification tally:');
    for (const [subcat, count] of Object.entries(tally)) {
      console.log(`    ${subcat.padEnd(40)} ${count}`);
    }
    console.log(`    (wrong-category candidates, held back)     ${wrongCategory.length}`);
    console.log(`    (unmatched, held back)                     ${unmatched.length}`);

    console.log('\n  Sample of matched rows (5 per subcategory):');
    for (const [subcat, sampleRows] of Object.entries(samples)) {
      console.log(`    ${subcat}:`);
      for (const r of sampleRows) {
        console.log(`      [${r.id}] ${r.name}`);
      }
    }

    if (wrongCategory.length > 0) {
      console.log('\n  Wrong-category candidates (sample, up to 15) — NOT touched by this script:');
      for (const r of wrongCategory.slice(0, 15)) {
        console.log(`      [${r.id}] ${r.name}`);
      }
    }

    if (unmatched.length > 0) {
      console.log('\n  Unmatched sample (up to 15):');
      for (const r of unmatched.slice(0, 15)) {
        console.log(`      [${r.id}] ${r.name}`);
      }
    }

    console.log('');

    grandTotalMatched += toUpdate.length;
    grandTotalWrongCat += wrongCategory.length;
    grandTotalUnmatched += unmatched.length;

    if (APPLY && toUpdate.length > 0) {
      // Batch by subcategory for cleaner statements
      const bySubcat = {};
      for (const u of toUpdate) {
        if (!bySubcat[u.subcat]) bySubcat[u.subcat] = [];
        bySubcat[u.subcat].push(u.id);
      }
      for (const [subcat, ids] of Object.entries(bySubcat)) {
        await client.query(
          `UPDATE catalog_unified SET display_subcategory = $1, updated_at = now()
           WHERE id = ANY($2::int[])`,
          [subcat, ids]
        );
      }
      console.log(`  Applied: ${toUpdate.length} rows updated for ${category}.\n`);
    }
  }

  console.log('='.repeat(78));
  console.log(`TOTAL: ${grandTotalMatched} matched${APPLY ? ' and applied' : ' (dry run, not written)'}, `
    + `${grandTotalWrongCat} wrong-category candidates held back, `
    + `${grandTotalUnmatched} unmatched held back.`);
  console.log('='.repeat(78));

  if (!APPLY) {
    console.log('\n(dry run — no rows written. Re-run with --apply to commit.)');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
