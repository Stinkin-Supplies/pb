#!/usr/bin/env node
/**
 * extract_fitment_from_names.mjs
 *
 * Extracts fitment data from product name strings and inserts into catalog_fitment_v2.
 *
 * Handles three tiers of signals in product names:
 *   Tier 1 (confidence 0.85): model code + year range  e.g. "FXST '06-'10", "'96-'07 Touring"
 *   Tier 2 (confidence 0.80): family keyword + year range  e.g. "Big Twin '99-'06"
 *   Tier 3 (confidence 0.65): family keyword only (no year)  e.g. "Softail", "Dyna"
 *
 * Year formats supported:
 *   'YY-'YY  (apostrophe shorthand — 'YY<30 → 20YY, else 19YY)
 *   YYYY-YYYY (full 4-digit)
 *   'YY      (single year, used as both start and end)
 *   'E79     (Early 1979 → 1979), 'L79 (Late 1979 → 1979)
 *
 * Pipe-separated segments: "Twin Cam '07-'17 | Dyna '06" → two separate fitment entries
 *
 * Usage:
 *   node scripts/ingest/extract_fitment_from_names.mjs           # live run
 *   node scripts/ingest/extract_fitment_from_names.mjs --dry     # preview only
 *   node scripts/ingest/extract_fitment_from_names.mjs --vendor VTWIN
 */

import pg from 'pg';
import { parseArgs } from 'util';

const { Pool } = pg;

const DB = {
  host: '5.161.100.126', port: 5432,
  user: 'catalog_app', password: 'smelly', database: 'stinkin_catalog',
};

const { values: args } = parseArgs({
  options: {
    dry:    { type: 'boolean', default: false },
    vendor: { type: 'string'                  },
  },
  strict: false,
});

// ── Year conversion ───────────────────────────────────────────────────────────

function apoYearToFull(twoDigit) {
  // 'E79 / 'L79 style — strip letters first
  const n = parseInt(String(twoDigit).replace(/[^0-9]/g, ''));
  return n < 30 ? 2000 + n : 1900 + n;
}

// ── Model/family mappings ─────────────────────────────────────────────────────

// Engine era names → harley_families.name (these map to actual family rows)
const ERA_TO_FAMILY = {
  'twin cam':    'Twin Cam',
  'shovelhead':  'Shovelhead',
  'panhead':     'Panhead',
  'knucklehead': 'Knucklehead',
  'flathead':    'Flathead',
  'evolution':   'Evolution',
  'ironhead':    'Sportster',   // Ironhead Sportster
  'milwaukee':   'Twin Cam',    // Milwaukee-Eight → approximate as Twin Cam era
};

// Family name aliases in product titles → harley_families.name
const FAMILY_KEYWORD = {
  'touring':    'Touring',
  'softail':    'Softail',
  'sportster':  'Sportster',
  'dyna':       'Dyna',
  'fxr':        'FXR',
  'trike':      'Trike',
  'v-rod':      'V-Rod',
  'vrod':       'V-Rod',
  'street':     'Street',
};

// "Big Twin" = all non-Sportster families for that year range — handled separately
// by pulling all model_years NOT in the Sportster family.

// Known model code prefixes to try — longest first to avoid FXST matching FX
const MODEL_CODE_PATTERNS = [
  // CVO / special
  'FLHTCUSE','FLHTCSE','FLHXSE','FXCWC','FXSBSE','FLSTFSE',
  // Touring
  'FLHRXS','FLHXXX','FLHTCUI','FLHTCUL','FLHTCU','FLHTCI','FLHTC',
  'FLHRC','FLHRCI','FLHRSEI','FLHRSI','FLHRSE','FLHRI','FLHR',
  'FLHXSE2','FLHX','FLHS','FLHP','FLHLT','FLHT','FLHF','FLHB','FLHC','FLHCS',
  'FLTRXSE','FLTRX','FLTRU','FLTRI','FLTR','FLT',
  'FLHSE','FLH',
  // Softail
  'FXBBS','FXLRST','FXLRS','FXLR','FXBR','FXBB','FXFB','FXFBS',
  'FXSTSSE','FXSTSSE2','FXSTSSE3','FXSTD','FXSTB','FXSTC','FXSTS','FXST',
  'FLSTFSE2','FLSTFSE','FLSTFB','FLSTBS','FLSTB','FLSTN','FLSTC','FLSTF','FLSTS','FLST',
  'FXCW','FXST','FLDE','FLS','FLHCS','FLSL',
  // Dyna
  'FXDFSE2','FXDFSE','FXDWG','FXDXT','FXDC','FXDB','FXDF','FXDL','FXDS','FXDI','FXD',
  // Sportster / XR
  'XL1200CX','XL1200CB','XL1200CP','XL1200CA','XL1200NS','XL1200XS',
  'XL1200X','XL1200V','XL1200T','XL1200S','XL1200R','XL1200N','XL1200L','XL1200C','XL1200',
  'XL883R','XL883N','XL883L','XL883C','XL883',
  'XLH1200C','XLH1200','XLH883HUG','XLH883DLX','XLH883C','XLH883','XLH1100','XLH1000','XLH900',
  'XR1200X','XR1200','XR1000','XR750',
  'XLH','XLC','XLCH','XLS','XLT','XL50','XL',
  // FXR
  'FXRS','FXRT','FXRD','FXRP','FXLR','FXR',
  // FX / FL / Shovelhead era
  'FXWG','FXSB','FXEF','FXDG','FXRC','FXRG','FXCWC',
  'FXS','FXE','FXB','FXC','FXEC','FX',
  'FLHF','FLE','FLF','FLB','FL',
  // Vintage
  'ELH','ELW','EL',
  'FLHC',
  // Trike
  'FLHTCUTG','FLHTCUTGSE','FLHXXX','FLUSB','FLRT',
];

// ── Name segment parser ───────────────────────────────────────────────────────

const APO_RANGE  = /[''']([0-9]{1,2}[ELel]?)-[''']([0-9]{1,2}[ELel]?)/g;
const APO_SINGLE = /[''']([0-9]{1,2}[ELel]?)/g;
const FULL_RANGE = /\b((?:19|20)[0-9]{2})-((?:19|20)[0-9]{2})\b/g;
const FULL_SINGLE = /\b((?:19|20)[0-9]{2})\b/g;

function parseSegment(seg) {
  seg = seg.trim();
  if (!seg) return null;

  // ── Extract year range ──────────────────────────────────────────────────
  let yearStart = null, yearEnd = null;

  // Apostrophe range: '06-'10
  const apoRangeMatch = [...seg.matchAll(APO_RANGE)];
  if (apoRangeMatch.length) {
    const m = apoRangeMatch[0];
    yearStart = apoYearToFull(m[1]);
    yearEnd   = apoYearToFull(m[2]);
  } else {
    // Full 4-digit range: 1984-1999
    const fullRangeMatch = [...seg.matchAll(FULL_RANGE)];
    if (fullRangeMatch.length) {
      yearStart = parseInt(fullRangeMatch[0][1]);
      yearEnd   = parseInt(fullRangeMatch[0][2]);
    } else {
      // Single apostrophe year: '06 → use as both start and end
      const apoSingle = [...seg.matchAll(APO_SINGLE)];
      if (apoSingle.length) {
        yearStart = yearEnd = apoYearToFull(apoSingle[0][1]);
      } else {
        // Single full year (less common, only if not year-range product code like 88/96/103)
        const fullSingle = seg.match(/\b((?:19|20)[0-9]{2})\b/);
        if (fullSingle && !seg.match(/[0-9]{2}"\/[0-9]{2}"/)) {
          yearStart = yearEnd = parseInt(fullSingle[1]);
        }
      }
    }
  }

  // ── Extract model codes (try longest first) ──────────────────────────────
  const foundCodes = new Set();
  const segUpper = seg.toUpperCase().replace(/['']/g, '').replace(/[^A-Z0-9/\s-]/g, ' ');
  for (const code of MODEL_CODE_PATTERNS) {
    // Word-boundary match — code must be surrounded by non-alphanumeric or slash
    const re = new RegExp(`(?<![A-Z0-9])${code}(?![A-Z0-9])`, 'i');
    if (re.test(segUpper)) {
      foundCodes.add(code.toUpperCase());
      // Remove the matched code from segUpper to avoid sub-matches (e.g. FX inside FXST)
      // We do this by stopping at the first specific match and only adding prefix matches once
    }
  }

  // Remove codes that are prefixes of other found codes (e.g. if FXST found, drop FX)
  const finalCodes = [...foundCodes].filter(code => {
    return ![...foundCodes].some(other => other !== code && other.startsWith(code));
  });

  // ── Extract family/era keywords ──────────────────────────────────────────
  const segLower = seg.toLowerCase();
  const foundFamilies = new Set();

  // Engine eras first (more specific)
  for (const [kw, family] of Object.entries(ERA_TO_FAMILY)) {
    if (segLower.includes(kw)) foundFamilies.add(family);
  }
  // Family keywords
  for (const [kw, family] of Object.entries(FAMILY_KEYWORD)) {
    if (segLower.includes(kw)) foundFamilies.add(family);
  }
  // Big Twin (special — means all non-Sportster models)
  const isBigTwin = /big\s*twin/i.test(seg);

  if (!finalCodes.length && !foundFamilies.size && !isBigTwin) return null;

  return { yearStart, yearEnd, modelCodes: finalCodes, families: [...foundFamilies], isBigTwin };
}

function parseName(name) {
  // Split on pipe — each segment is an independent fitment statement
  const segments = name.split(/\s*\|\s*/);
  const results = [];
  for (const seg of segments) {
    const parsed = parseSegment(seg);
    if (parsed) results.push(parsed);
  }
  return results;
}

// ── DB lookup helpers ─────────────────────────────────────────────────────────

async function loadHarleyData(pool) {
  const { rows: models } = await pool.query(
    `SELECT hm.id, hm.model_code, hm.family_id, hf.name as family_name
     FROM harley_models hm JOIN harley_families hf ON hf.id = hm.family_id`
  );
  const { rows: families } = await pool.query(
    `SELECT id, name FROM harley_families`
  );
  const { rows: modelYears } = await pool.query(
    `SELECT hmy.id, hmy.model_id, hmy.year, hm.model_code, hm.family_id, hf.name as family_name
     FROM harley_model_years hmy
     JOIN harley_models hm ON hm.id = hmy.model_id
     JOIN harley_families hf ON hf.id = hm.family_id`
  );

  const familyIdByName = Object.fromEntries(families.map(f => [f.name.toLowerCase(), f.id]));
  const modelByCode = {};
  for (const m of models) {
    if (!modelByCode[m.model_code.toUpperCase()]) modelByCode[m.model_code.toUpperCase()] = [];
    modelByCode[m.model_code.toUpperCase()].push(m);
  }

  return { modelYears, familyIdByName, modelByCode };
}

function resolveModelYearIds(parsed, { modelYears, familyIdByName, modelByCode }) {
  const { yearStart, yearEnd, modelCodes, families, isBigTwin } = parsed;

  const matchingYearRows = modelYears.filter(my => {
    if (yearStart && my.year < yearStart) return false;
    if (yearEnd   && my.year > yearEnd)   return false;
    return true;
  });

  if (!matchingYearRows.length && (yearStart || yearEnd)) return [];

  // Determine which model_year rows apply
  let candidates = yearStart || yearEnd ? matchingYearRows : modelYears;

  const resultIds = new Set();

  if (modelCodes.length) {
    for (const code of modelCodes) {
      const modelDefs = modelByCode[code] || [];
      if (!modelDefs.length) continue;
      const modelIds = new Set(modelDefs.map(m => m.id));
      for (const my of candidates) {
        if (modelIds.has(my.model_id)) resultIds.add(my.id);
      }
    }
  }

  if (families.length) {
    for (const familyName of families) {
      const fid = familyIdByName[familyName.toLowerCase()];
      if (!fid) continue;
      for (const my of candidates) {
        if (my.family_id === fid) resultIds.add(my.id);
      }
    }
  }

  if (isBigTwin) {
    // Big Twin = all families except Sportster (and vintage singles)
    const excludeFamilies = new Set(['sportster', 'street', 'v-rod', 'revolution max', 'trike']);
    for (const my of candidates) {
      if (!excludeFamilies.has(my.family_name.toLowerCase())) resultIds.add(my.id);
    }
  }

  return [...resultIds];
}

function confidenceFor(parsed) {
  const { yearStart, yearEnd, modelCodes, families, isBigTwin } = parsed;
  const hasYear = yearStart || yearEnd;
  if (modelCodes.length && hasYear) return 0.85;
  if ((families.length || isBigTwin) && hasYear) return 0.80;
  if (modelCodes.length) return 0.70;
  if (families.length || isBigTwin) return 0.65;
  return 0.60;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool(DB);

  console.log('Loading Harley model data...');
  const harleyData = await loadHarleyData(pool);
  console.log(`  ${harleyData.modelYears.length} model-year rows loaded`);

  // Load products with no fitment that have name signals
  let vendorFilter = '';
  const queryParams = [];
  if (args.vendor) {
    vendorFilter = 'AND cu.source_vendor = $1';
    queryParams.push(args.vendor.toUpperCase());
  }

  const { rows: products } = await pool.query(`
    SELECT cu.id, cu.sku, cu.source_vendor, cu.name
    FROM catalog_unified cu
    WHERE cu.is_active = true
    AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 f WHERE f.product_id = cu.id)
    AND (
      cu.name ~ $re1$'[0-9]{1,2}$re1$
      OR cu.name ~ $re2$(19|20)[0-9]{2}-(19|20)[0-9]{2}$re2$
      OR cu.name ~* $re3$(Softail|Touring|Sportster|Dyna|FXR|Knucklehead|Panhead|Shovelhead|Flathead|Twin Cam|Ironhead|Big Twin|Trike|V-Rod)$re3$
    )
    ${vendorFilter}
    ORDER BY cu.source_vendor, cu.id
  `, queryParams);

  console.log(`\nProcessing ${products.length} products with name signals...`);

  let totalInserted = 0;
  let productsWithFitment = 0;
  let skipped = 0;
  const sourceLabel = 'name_extraction';

  // Batch inserts for performance
  const BATCH = 500;
  const toInsert = []; // { product_id, model_year_id, confidence }

  for (const product of products) {
    const segments = parseName(product.name);
    if (!segments.length) { skipped++; continue; }

    const modelYearIds = new Set();
    let maxConf = 0;

    for (const seg of segments) {
      const ids = resolveModelYearIds(seg, harleyData);
      const conf = confidenceFor(seg);
      if (ids.length) {
        ids.forEach(id => modelYearIds.add(id));
        if (conf > maxConf) maxConf = conf;
      }
    }

    if (!modelYearIds.size) { skipped++; continue; }

    productsWithFitment++;
    for (const myId of modelYearIds) {
      toInsert.push({ product_id: product.id, model_year_id: myId, confidence: maxConf });
    }
  }

  console.log(`\nParsed: ${productsWithFitment} products would gain fitment`);
  console.log(`Skipped (no signal resolved): ${skipped}`);
  console.log(`Fitment rows to insert: ${toInsert.length}`);

  if (args.dry) {
    console.log('\n--dry mode — no DB writes');

    // Show a sample
    const sample = products.filter(p => {
      const segs = parseName(p.name);
      return segs.some(s => resolveModelYearIds(s, harleyData).length > 0);
    }).slice(0, 15);

    for (const p of sample) {
      const segs = parseName(p.name);
      const resolved = segs.flatMap(s => {
        const ids = resolveModelYearIds(s, harleyData);
        return ids.length ? [`  segment: ${JSON.stringify(s)} → ${ids.length} model_years`] : [];
      });
      if (resolved.length) {
        console.log(`\n${p.source_vendor} ${p.sku}: ${p.name}`);
        resolved.forEach(r => console.log(r));
      }
    }

    await pool.end();
    return;
  }

  // Live insert in batches
  console.log('\nInserting...');
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    if (!batch.length) break;

    const values = batch.map((r, j) =>
      `($${j*3+1}, $${j*3+2}, '${sourceLabel}', $${j*3+3})`
    ).join(',');
    const params = batch.flatMap(r => [r.product_id, r.model_year_id, r.confidence]);

    const res = await pool.query(`
      INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
      VALUES ${values}
      ON CONFLICT (product_id, model_year_id) DO NOTHING
    `, params);

    totalInserted += res.rowCount;

    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(`\r  ${Math.min(i + BATCH, toInsert.length)} / ${toInsert.length} rows processed...`);
    }
  }

  console.log(`\n\n✓ Inserted ${totalInserted} fitment rows for ${productsWithFitment} products`);

  // Final coverage check
  const { rows: coverage } = await pool.query(`
    SELECT source_vendor,
      COUNT(DISTINCT cu.id) as total,
      COUNT(DISTINCT f.product_id) as with_fitment,
      ROUND(COUNT(DISTINCT f.product_id)::numeric / COUNT(DISTINCT cu.id) * 100, 1) as pct
    FROM catalog_unified cu
    LEFT JOIN catalog_fitment_v2 f ON f.product_id = cu.id
    WHERE cu.is_active = true
    GROUP BY source_vendor ORDER BY source_vendor
  `);

  console.log('\nFinal coverage:');
  for (const row of coverage) {
    console.log(`  ${row.source_vendor}: ${row.with_fitment}/${row.total} (${row.pct}%)`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
