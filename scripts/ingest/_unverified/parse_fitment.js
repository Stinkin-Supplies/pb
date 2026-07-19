/**
 * parse_fitment.js
 * Extracts structured fitment data from pu_brand_enrichment name + features fields.
 *
 * Populates: pu_fitment table AND catalog_unified fitment columns directly
 *
 * Run: node scripts/ingest/parse_fitment.js
 *      node scripts/ingest/parse_fitment.js --dry-run
 *      node scripts/ingest/parse_fitment.js --vendor pu
 */

import pg from "pg";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const BATCH_SIZE = 500;
const DRY_RUN = process.argv.includes("--dry-run");

// ── ABBREVIATION NORMALIZER ───────────────────────────────────────────────────
// Expand common PU abbreviations before parsing
function expandAbbreviations(text) {
  return text
    // Softail abbreviations
    .replace(/\bSFTAIL\b/gi, "Softail")
    .replace(/\bSOFTAIL\b/gi, "Softail")
    .replace(/\bS\/TAIL\b/gi, "Softail")
    // ST = Softail (must not be followed by another letter to avoid FLST, FXST etc.)
    .replace(/\bST\b(?![A-Z])/g, "Softail")
    // BT = Big Twin
    .replace(/\bBT\b(?![A-Z])/g, "Big Twin")
    // FXR abbreviations
    .replace(/\bFXR\b/g, "FXR")
    // Sportster abbreviations
    .replace(/\bXLH\b/g, "XLH Sportster")
    .replace(/\bIRONHEAD\b/gi, "Ironhead Sportster")
    // Touring abbreviations
    .replace(/\bBAGGER\b/gi, "Touring")
    .replace(/\bFLT\b/g, "FLT Touring")
    .replace(/\bFLHT\b/g, "FLHT Touring")
    // Early/Late prefixes — normalize E'84 → 1984, L'84 → 1984
    .replace(/[EL][''`](\d{2})/g, (_, y) => {
      const yr = parseInt(y);
      return String(yr >= 40 ? 1900 + yr : 2000 + yr);
    })
    // Concatenated year+code like 84-99XL, 82-99XL91-96FXD
    // Insert space before model code letters following digits: 99XL → 99 XL
    .replace(/(\d{2})(FL[A-Z]{0,6}|FX[A-Z]{0,6}|XL[A-Z0-9]{0,4}|XLH|FXR|FXRP)/g, "$1 $2")
    // Early FL/FX: E-FL → Early FL
    .replace(/\bE[\-\/]FL\b/gi, "FL Early")
    .replace(/\bE[\-\/]FX\b/gi, "FX Early")
    .replace(/\bL[\-\/]FL\b/gi, "FL Late")
    // Twin Cam abbreviations
    .replace(/\bTC\b(?=\s|$|\d)/g, "Twin Cam")
    .replace(/\bT\.C\.\b/g, "Twin Cam")
    // Milwaukee Eight
    .replace(/\bM[\-\s]?8\b/gi, "M8")
    .replace(/\bMILWAUKEE[\s\-]?8\b/gi, "M8")
    .replace(/\bMILWAUKEE[\s\-]?EIGHT\b/gi, "M8");
}

// ── YEAR EXTRACTION ───────────────────────────────────────────────────────────
function expandYear(y) {
  const n = parseInt(y, 10);
  if (n >= 1900) return n;
  return n >= 29 ? 1900 + n : 2000 + n; // 29+ = 1929+, <29 = 2000+
}

function extractYearRanges(text) {
  const ranges = [];
  const seen = new Set();

  const patterns = [
    // '89-'06, `89-`06, '89-06
    /[''`'´](\d{2})[–\-][''`'´]?(\d{2,4})/g,
    // 2004-2017, 1984-2003
    /\b((?:19|20)\d{2})[–\-]((?:19|20)\d{2})\b/g,
    // 84-99, 91-06 (bare 2-digit ranges, must be plausible years)
    /(?<![.\d])([2-9]\d)[–\-]([0-9]\d)(?![.\d])/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      let start = expandYear(m[1]);
      let end   = expandYear(m[2]);
      if (end < start) end += (end < 30 ? 2000 : 1900); // handle cross-century
      if (
        start >= 1929 && end <= 2027 &&
        end >= start && (end - start) <= 55
      ) {
        const key = `${start}-${end}`;
        if (!seen.has(key)) {
          seen.add(key);
          ranges.push({ start, end });
        }
      }
    }
  }

  // Single years with apostrophe: '07, '84
  const singleRe = /[''`'´](\d{2})(?![–\-\d])/g;
  let m2;
  while ((m2 = singleRe.exec(text)) !== null) {
    const yr = expandYear(m2[1]);
    if (yr >= 1929 && yr <= 2027) {
      const key = `${yr}-${yr}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push({ start: yr, end: yr });
      }
    }
  }

  // Remove ranges fully contained within another range
  return ranges.filter((r, i) =>
    !ranges.some((r2, j) => j !== i && r2.start <= r.start && r2.end >= r.end)
  );
}

// ── HD FAMILY DETECTION ───────────────────────────────────────────────────────
const HD_FAMILY_PATTERNS = [
  { re: /\bM8\b|\bMilwaukee[\s\-]?Eight\b/i,               family: "M8" },
  { re: /\bTwin[\s\-]?Cam\b/i,                              family: "Twin Cam" },
  { re: /\bEvolution\b|\bEvo\b(?=.*(?:Harley|Big.Twin|HD|Softail|Dyna|Touring))/i, family: "Evolution" },
  { re: /\bShovelhead\b/i,                                  family: "Shovelhead" },
  { re: /\bPanhead\b/i,                                     family: "Panhead" },
  { re: /\bKnucklehead\b/i,                                 family: "Knucklehead" },
  { re: /\bFlathead\b|\bSide[\s\-]?Valve\b/i,              family: "Flathead" },
  { re: /\bIronhead\b/i,                                    family: "Ironhead" },
  { re: /\bBig[\s\-]?Twin\b/i,                             family: "Big Twin" },
  { re: /\bSportster\b/i,                                   family: "Sportster" },
  { re: /\bSoftail\b/i,                                     family: "Softail" },
  { re: /\bDyna\b/i,                                        family: "Dyna" },
  { re: /\bTouring\b(?!\s+(?:Seat|Windsh|Handle|Tire|Pack|Back|Bag))/i, family: "Touring" },
  { re: /\bTrike\b/i,                                       family: "Trike" },
  { re: /\bV[\-\s]?Rod\b/i,                                family: "V-Rod" },
  { re: /\bStreet(?:\s+(?:Glide|Bob|750|500|Rod|Series))/i, family: "Street" },
  { re: /\bFXR\b|\bFXRP\b/,                                 family: "FXR" },
];

// Model code → family mapping for inference
const CODE_TO_FAMILY = {
  // Touring FL codes
  FLHR: "Touring", FLHRC: "Touring", FLHRI: "Touring",
  FLHT: "Touring", FLHTC: "Touring", FLHTCI: "Touring", FLHTCUI: "Touring",
  FLHX: "Touring", FLHXI: "Touring", FLHXS: "Touring",
  FLTR: "Touring", FLTRI: "Touring", FLTRX: "Touring", FLTRXS: "Touring",
  FLTRU: "Touring", FLHTKL: "Touring", FLHTK: "Touring",
  FLHCS: "Touring", FLHCSE: "Touring",
  // Softail FX/FL codes
  FLST: "Softail", FLSTC: "Softail", FLSTF: "Softail", FLSTFB: "Softail",
  FLSTN: "Softail", FLSTS: "Softail", FXST: "Softail", FXSTB: "Softail",
  FXSTC: "Softail", FXSTS: "Softail", FXCW: "Softail", FXCWC: "Softail",
  FXSB: "Softail", FXSE: "Softail", FLSS: "Softail", FLSL: "Softail",
  FLSB: "Softail", FLFB: "Softail", FLHC: "Softail",
  // Dyna FXD codes
  FXD: "Dyna", FXDB: "Dyna", FXDC: "Dyna", FXDF: "Dyna",
  FXDG: "Dyna", FXDL: "Dyna", FXDS: "Dyna", FXDWG: "Dyna", FXDX: "Dyna",
  // Sportster XL codes
  XL: "Sportster", XLH: "Sportster", XLCH: "Sportster",
  XL883: "Sportster", XL1200: "Sportster", XLX: "Sportster",
  XR: "Sportster",
  // FXR codes
  FXR: "FXR", FXRS: "FXR", FXRT: "FXR", FXRP: "FXR", FXRD: "FXR", FXLR: "FXR",
  // V-Rod
  VRSC: "V-Rod", VRSCA: "V-Rod", VRSCB: "V-Rod", VRSCD: "V-Rod",
  VRSCF: "V-Rod", VRSCX: "V-Rod", VRSCDX: "V-Rod",
  // Street
  XG500: "Street", XG750: "Street",
};

function extractModelCodes(text) {
  const codes = [];
  const re = /\b(FL[A-Z]{1,8}|FX[A-Z]{1,8}|XL[A-Z0-9]{0,6}|XR[0-9]{0,4}|VRS[A-Z]{1,4}|XG[0-9]{3})\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!codes.includes(m[1])) codes.push(m[1]);
  }
  return codes;
}

// ── SPECIFIC MODEL NAMES ──────────────────────────────────────────────────────
const HD_MODEL_NAMES = [
  "Road King", "Road Glide", "Street Glide", "Electra Glide",
  "Ultra Classic", "Ultra Limited", "Street Bob", "Fat Bob", "Fat Boy",
  "Heritage Softail", "Heritage Classic", "Breakout", "Deluxe", "Slim",
  "Low Rider", "Iron 883", "Forty-Eight", "Seventy-Two", "Nightster",
  "Pan America", "Bronx", "Sport Glide", "Freewheeler", "Tri Glide",
  "CVO", "Screamin Eagle",
];

// ── OTHER MAKES ───────────────────────────────────────────────────────────────
const OTHER_MAKES = [
  "Honda", "Yamaha", "Kawasaki", "Suzuki", "KTM", "Husqvarna",
  "Beta", "Can-Am", "Polaris", "Arctic Cat", "Ducati", "BMW",
  "Triumph", "Indian", "Victory", "Buell", "Aprilia",
];

// ── MAIN PARSER ───────────────────────────────────────────────────────────────
function parseFitment(name, features) {
  const raw  = [name, ...(features || [])].join(" | ");
  const text = expandAbbreviations(raw);

  // Year ranges
  const yearRanges = extractYearRanges(text);
  const yearStart  = yearRanges.length ? Math.min(...yearRanges.map(r => r.start)) : null;
  const yearEnd    = yearRanges.length ? Math.max(...yearRanges.map(r => r.end))   : null;

  // HD families from keywords
  const families = [];
  for (const { re, family } of HD_FAMILY_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text) && !families.includes(family)) families.push(family);
  }

  // Model codes
  const modelCodes = extractModelCodes(text);

  // Infer families from model codes
  for (const code of modelCodes) {
    const inferred = CODE_TO_FAMILY[code];
    if (inferred && !families.includes(inferred)) families.push(inferred);
  }

  // Specific model names
  const models = [];
  for (const model of HD_MODEL_NAMES) {
    if (text.toLowerCase().includes(model.toLowerCase()) && !models.includes(model)) {
      models.push(model);
    }
  }

  // Other makes
  const otherMakes = [];
  for (const make of OTHER_MAKES) {
    if (text.toLowerCase().includes(make.toLowerCase())) otherMakes.push(make);
  }

  // Is Harley?
  const isHarley = (
    /harley|harley-davidson|h-d\b|hd\b/i.test(text) ||
    families.length > 0 ||
    modelCodes.length > 0 ||
    models.length > 0
  );

  // Is universal?
  const isUniversal = (
    !isHarley &&
    otherMakes.length === 0 &&
    yearRanges.length === 0 &&
    !/fits\s+\w/i.test(text)
  );

  if (!isHarley && otherMakes.length === 0 && yearRanges.length === 0) return null;

  return {
    year_start:   yearStart,
    year_end:     yearEnd,
    year_ranges:  yearRanges.length ? JSON.stringify(yearRanges) : null,
    hd_families:  families.length   ? families   : null,
    hd_models:    models.length     ? models     : null,
    hd_codes:     modelCodes.length ? modelCodes : null,
    other_makes:  otherMakes.length ? otherMakes : null,
    is_harley:    isHarley,
    is_universal: isUniversal,
  };
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────
async function ensureTable(client) {
  await client.query(`DROP TABLE IF EXISTS pu_fitment`);
  await client.query(`
    CREATE TABLE pu_fitment (
      id            SERIAL PRIMARY KEY,
      sku           VARCHAR(100) NOT NULL UNIQUE,
      brand         VARCHAR(200),
      year_start    SMALLINT,
      year_end      SMALLINT,
      year_ranges   JSONB,
      hd_families   TEXT[],
      hd_models     TEXT[],
      hd_codes      TEXT[],
      other_makes   TEXT[],
      is_harley     BOOLEAN DEFAULT FALSE,
      is_universal  BOOLEAN DEFAULT FALSE,
      parsed_from   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX idx_fit_sku        ON pu_fitment(sku);
    CREATE INDEX idx_fit_brand      ON pu_fitment(brand);
    CREATE INDEX idx_fit_year_start ON pu_fitment(year_start);
    CREATE INDEX idx_fit_year_end   ON pu_fitment(year_end);
    CREATE INDEX idx_fit_is_harley  ON pu_fitment(is_harley);
    CREATE INDEX idx_fit_families   ON pu_fitment USING GIN(hd_families);
    CREATE INDEX idx_fit_codes      ON pu_fitment USING GIN(hd_codes);
    CREATE INDEX idx_fit_makes      ON pu_fitment USING GIN(other_makes);
  `);
  console.log("  ✓ pu_fitment table recreated\n");
}

// ── INSERT pu_fitment ─────────────────────────────────────────────────────────
const COLS = [
  "sku","brand","year_start","year_end","year_ranges",
  "hd_families","hd_models","hd_codes","other_makes",
  "is_harley","is_universal","parsed_from",
];

async function insertBatch(client, rows) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLS.length;
    COLS.forEach(col => {
      const v = row[col] ?? null;
      values.push(col === "year_ranges" && v ? v : Array.isArray(v) ? v : v);
    });
    return `(${COLS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  });
  await client.query(
    `INSERT INTO pu_fitment (${COLS.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (sku) DO UPDATE SET
       ${COLS.filter(c => c !== "sku").map(c => `${c} = EXCLUDED.${c}`).join(",\n       ")}`,
    values
  );
}

// ── BACKFILL catalog_unified ──────────────────────────────────────────────────
async function backfillUnified(client) {
  console.log("\n🔄 Backfilling catalog_unified from pu_fitment...");

  // Count what we'll update
  const { rows: [{ count }] } = await client.query(`
    SELECT COUNT(*) FROM pu_fitment pf
    JOIN catalog_unified cu ON REPLACE(cu.sku, '-', '') = REPLACE(pf.sku, '-', '')
    WHERE cu.source_vendor = 'PU'
      AND pf.is_harley = true
  `);
  console.log(`  ${Number(count).toLocaleString()} PU products to update in catalog_unified\n`);

  if (DRY_RUN) {
    console.log("  ⚠️  DRY RUN — skipping catalog_unified update");
    return;
  }

  const pb = new ProgressBar(Number(count), "Updating catalog_unified");

  // Fetch all matches
  const { rows: matches } = await client.query(`
    SELECT
      cu.id,
      pf.year_start,
      pf.year_end,
      pf.year_ranges,
      pf.hd_families,
      pf.hd_models,
      pf.hd_codes,
      pf.is_harley,
      pf.is_universal
    FROM pu_fitment pf
    JOIN catalog_unified cu ON REPLACE(cu.sku, '-', '') = REPLACE(pf.sku, '-', '')
    WHERE cu.source_vendor = 'PU'
      AND pf.is_harley = true
  `);

  let updated = 0;
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      const yearRangesJson = row.year_ranges
        ? (typeof row.year_ranges === "string" ? row.year_ranges : JSON.stringify(row.year_ranges))
        : null;

      await client.query(`
        UPDATE catalog_unified SET
          fitment_year_start   = COALESCE($2, fitment_year_start),
          fitment_year_end     = COALESCE($3, fitment_year_end),
          fitment_year_ranges  = COALESCE($4::jsonb, fitment_year_ranges),
          fitment_hd_families  = COALESCE($5, fitment_hd_families),
          fitment_hd_models    = COALESCE($6, fitment_hd_models),
          fitment_hd_codes     = COALESCE($7, fitment_hd_codes),
          is_harley_fitment    = CASE WHEN $8 THEN true ELSE is_harley_fitment END,
          is_universal         = CASE WHEN $9 THEN true ELSE is_universal END,
          updated_at           = NOW()
        WHERE id = $1
      `, [
        row.id,
        row.year_start,
        row.year_end,
        yearRangesJson,
        row.hd_families,
        row.hd_models,
        row.hd_codes,
        row.is_harley,
        row.is_universal,
      ]);
      updated++;
    }
    pb.update(updated);
  }

  pb.finish("catalog_unified updated");
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║         parse_fitment.js — Enhanced Parser           ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  if (DRY_RUN) console.log(`\n  ⚠️  DRY RUN\n`);
  else console.log();

  const client = await pool.connect();
  try {
    const { rows: [{ count }] } = await client.query(`SELECT COUNT(*) FROM pu_brand_enrichment`);
    const total = parseInt(count, 10);
    console.log(`  Total enrichment records: ${total.toLocaleString()}\n`);

    if (!DRY_RUN) {
      console.log("🔧 Recreating pu_fitment table...");
      await ensureTable(client);
    }

    const { rows: allRows } = await client.query(
      `SELECT sku, brand, name, features FROM pu_brand_enrichment`
    );

    const bar      = new ProgressBar(total, "Parsing fitment");
    const toInsert = [];
    let parsed     = 0;
    let skipped    = 0;

    for (let i = 0; i < allRows.length; i++) {
      const row     = allRows[i];
      const fitment = parseFitment(row.name, row.features);

      if (fitment) {
        toInsert.push({ sku: row.sku, brand: row.brand, parsed_from: "name+features", ...fitment });
        parsed++;
      } else {
        skipped++;
      }

      bar.update(i + 1);

      if (!DRY_RUN && toInsert.length >= BATCH_SIZE) {
        await insertBatch(client, toInsert.splice(0, BATCH_SIZE));
      }
    }

    if (!DRY_RUN && toInsert.length) await insertBatch(client, toInsert);
    bar.finish("Parsing complete");

    // Summary
    console.log(`\n  Parsed with fitment : ${parsed.toLocaleString()}`);
    console.log(`  No fitment found    : ${skipped.toLocaleString()}`);

    if (!DRY_RUN) {
      const { rows: [s] } = await client.query(`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE is_harley)                AS harley,
          COUNT(*) FILTER (WHERE year_start IS NOT NULL)   AS with_years,
          COUNT(*) FILTER (WHERE hd_families IS NOT NULL)  AS with_families,
          COUNT(*) FILTER (WHERE hd_codes IS NOT NULL)     AS with_codes
        FROM pu_fitment
      `);

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Total in pu_fitment  : ${Number(s.total).toLocaleString()}`);
      console.log(`  Harley products      : ${Number(s.harley).toLocaleString()}`);
      console.log(`  With year range      : ${Number(s.with_years).toLocaleString()}`);
      console.log(`  With HD families     : ${Number(s.with_families).toLocaleString()}`);
      console.log(`  With model codes     : ${Number(s.with_codes).toLocaleString()}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // Backfill catalog_unified directly
      await backfillUnified(client);

      // Sample results
      console.log("\n📋 Sample parsed records:\n");
      const { rows: samples } = await client.query(`
        SELECT sku, brand, year_start, year_end, hd_families, hd_codes
        FROM pu_fitment
        WHERE is_harley AND year_start IS NOT NULL
        ORDER BY random()
        LIMIT 10
      `);
      for (const r of samples) {
        const years = `${r.year_start}-${r.year_end}`;
        const fams  = r.hd_families?.join(", ") || "—";
        const codes = r.hd_codes?.join(", ")    || "—";
        console.log(`  ${r.sku.padEnd(12)} | ${years} | ${fams.padEnd(20)} | ${codes}`);
      }

      console.log("\n✅ Done! Run backfill_pu_fitment_structured.js next to populate catalog_fitment_v2.\n");
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("\n❌ Fatal:", err.message);
  process.exit(1);
});
