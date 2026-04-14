/**
 * parse_fitment.js
 * Extracts structured fitment data from pu_brand_enrichment name + features fields.
 *
 * Populates: pu_fitment table
 *
 * Run: node scripts/ingest/parse_fitment.js
 */

import pg from "pg";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const BATCH_SIZE = 500;

// ── FITMENT PATTERNS ──────────────────────────────────────────────────────────

// Year range: '89-'06, '08-'13, 2004-2017, '23-'25
const YEAR_RANGE = /['''`]?(\d{2,4})[–\-]['''`]?(\d{2,4})/g;

// Single year: '07, 2007 (when not part of a range)
const SINGLE_YEAR = /['''`](\d{2})\b(?!\s*[-–])/g;

// HD model family keywords
const HD_FAMILIES = [
  { pattern: /\bM[\-\s]?8\b|\bM[\-\s]?Eight\b/i,          family: "M8" },
  { pattern: /\bTwin[\s\-]?Cam\b/i,                         family: "Twin Cam" },
  { pattern: /\bEvolution\b(?!.*(?:Evo\s|tire|seat|jacket))|Evo\b(?=.*(?:Harley|Big.Twin|Shovel|Twin.Cam|HD\b))/i, family: "Evolution" },
  { pattern: /\bShovelhead\b/i,                              family: "Shovelhead" },
  { pattern: /\bPanhead\b/i,                                 family: "Panhead" },
  { pattern: /\bKnucklehead\b/i,                             family: "Knucklehead" },
  { pattern: /\bBig[\s\-]?Twin\b/i,                         family: "Big Twin" },
  { pattern: /\bSportster\b/i,                               family: "Sportster" },
  { pattern: /\bSoftail\b/i,                                 family: "Softail" },
  { pattern: /\bDyna\b/i,                                    family: "Dyna" },
  { pattern: /\bTouring\b(?!\s+Seat|\s+Windsh|\s+Handle|\s+Tire|\s+Pack|\s+Back)/i, family: "Touring" },
  { pattern: /\bTrike\b/i,                                   family: "Trike" },
  { pattern: /\bV[\-\s]?Rod\b/i,                            family: "V-Rod" },
  { pattern: /\bStreet(?:\s+(?:Glide|Bob|750|500|Rod))|Street\s+Series/i, family: "Street" },
];

// Specific HD model names
const HD_MODELS = [
  "Road King", "Road Glide", "Street Glide", "Electra Glide",
  "Ultra Classic", "Street Bob", "Fat Bob", "Fat Boy", "Heritage",
  "Breakout", "Deluxe", "Slim", "Low Rider", "Iron 883", "Forty-Eight",
  "Seventy-Two", "Nightster", "Pan America", "Bronx",
];

// HD model codes (FLxx, FXxx, XL etc.)
const HD_MODEL_CODES = /\b(FL[A-Z]{1,6}|FX[A-Z]{1,6}|XL[A-Z0-9]{0,5}|VRSCD?[A-Z]?|ST[A-Z]{1,4})\b/g;

// Non-HD makes
const OTHER_MAKES = [
  "Honda", "Yamaha", "Kawasaki", "Suzuki", "KTM", "Husqvarna", "Husaberg",
  "Beta", "Can-Am", "Polaris", "Arctic Cat", "Ski-Doo", "Ducati", "BMW",
  "Triumph", "Indian", "Victory", "Buell", "Aprilia", "Sea-Doo",
];

// ── PARSER ────────────────────────────────────────────────────────────────────

function parseFitment(name, features) {
  const text = [name, ...(features || [])].join(" | ");

  // ── Year ranges ───────────────────────────────────────────────────────────
  const yearRanges = [];
  let m;
  const yearRangeRe = /['''`]?(\d{2,4})[–\-]['''`]?(\d{2,4})/g;
  while ((m = yearRangeRe.exec(text)) !== null) {
    let start = parseInt(m[1], 10);
    let end   = parseInt(m[2], 10);
    // Expand 2-digit years
    if (start < 100) start += start >= 40 ? 1900 : 2000;
    if (end   < 100) end   += end   >= 40 ? 1900 : 2000;
    // Sanity check
    if (start >= 1936 && end <= 2027 && end >= start && (end - start) <= 50) {
      yearRanges.push({ start, end });
    }
  }

  // Dedupe overlapping ranges
  const uniqueRanges = yearRanges.filter((r, i) =>
    !yearRanges.some((r2, j) => j !== i && r2.start <= r.start && r2.end >= r.end)
  );

  const yearStart = uniqueRanges.length ? Math.min(...uniqueRanges.map(r => r.start)) : null;
  const yearEnd   = uniqueRanges.length ? Math.max(...uniqueRanges.map(r => r.end))   : null;

  // ── HD families ───────────────────────────────────────────────────────────
  const families = [];
  for (const { pattern, family } of HD_FAMILIES) {
    if (pattern.test(text)) families.push(family);
  }

  // ── Specific HD models ────────────────────────────────────────────────────
  const models = [];
  for (const model of HD_MODELS) {
    if (text.toLowerCase().includes(model.toLowerCase())) models.push(model);
  }

  // ── HD model codes ────────────────────────────────────────────────────────
  const modelCodes = [];
  const codeRe = /\b(FL[A-Z]{1,6}|FX[A-Z]{1,6}|XL[A-Z0-9]{0,5}|VRSCD?[A-Z]?)\b/g;
  while ((m = codeRe.exec(text)) !== null) {
    if (!modelCodes.includes(m[1])) modelCodes.push(m[1]);
  }

  // ── Other makes ───────────────────────────────────────────────────────────
  const otherMakes = [];
  for (const make of OTHER_MAKES) {
    if (text.toLowerCase().includes(make.toLowerCase())) otherMakes.push(make);
  }

  // ── Is Harley fitment? ────────────────────────────────────────────────────
  const isHarley = (
    /harley|harley-davidson|h-d\b/i.test(text) ||
    families.length > 0 ||
    modelCodes.length > 0 ||
    models.length > 0
  );

  // ── Universal? ───────────────────────────────────────────────────────────
  const isUniversal = (
    !isHarley &&
    otherMakes.length === 0 &&
    yearRanges.length === 0 &&
    !/fits\s+\w/i.test(text)
  );

  // Only return if we found something useful
  if (!isHarley && otherMakes.length === 0 && yearRanges.length === 0) return null;

  return {
    year_start:   yearStart,
    year_end:     yearEnd,
    year_ranges:  uniqueRanges.length ? JSON.stringify(uniqueRanges) : null,
    hd_families:  families.length  ? families  : null,
    hd_models:    models.length    ? models    : null,
    hd_codes:     modelCodes.length ? modelCodes : null,
    other_makes:  otherMakes.length ? otherMakes : null,
    is_harley:    isHarley,
    is_universal: isUniversal,
  };
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────

async function migrateTable(client) {
  await client.query(`DROP TABLE IF EXISTS pu_fitment`);
  await client.query(`
    CREATE TABLE pu_fitment (
      id            SERIAL PRIMARY KEY,
      sku           VARCHAR(100) NOT NULL UNIQUE,
      brand         VARCHAR(200),
      year_start    SMALLINT,
      year_end      SMALLINT,
      year_ranges   JSONB,         -- [{start, end}, ...]
      hd_families   TEXT[],        -- Softail, Touring, Dyna, etc.
      hd_models     TEXT[],        -- Road King, Street Glide, etc.
      hd_codes      TEXT[],        -- FLTR, FXST, etc.
      other_makes   TEXT[],        -- Honda, Yamaha, etc.
      is_harley     BOOLEAN DEFAULT FALSE,
      is_universal  BOOLEAN DEFAULT FALSE,
      parsed_from   TEXT,          -- 'name' or 'features'
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
  console.log("  ✓ Table pu_fitment created\n");
}

// ── INSERT ────────────────────────────────────────────────────────────────────

const COLS = [
  "sku", "brand", "year_start", "year_end", "year_ranges",
  "hd_families", "hd_models", "hd_codes", "other_makes",
  "is_harley", "is_universal", "parsed_from",
];

async function insertBatch(client, rows) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLS.length;
    COLS.forEach((col) => {
      const v = row[col] ?? null;
      values.push(
        (col === "year_ranges") && v ? v :  // already JSON string
        Array.isArray(v) ? v :               // pg driver handles TEXT[]
        v
      );
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

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔍 Parsing fitment data from pu_brand_enrichment\n");

  const client = await pool.connect();
  try {
    // Count total
    const { rows: [{ count }] } = await client.query(
      `SELECT COUNT(*) FROM pu_brand_enrichment`
    );
    const total = parseInt(count, 10);
    console.log(`  Total enrichment records: ${total.toLocaleString()}\n`);

    console.log("🔧 Creating fitment table...");
    await migrateTable(client);

    // Stream all enrichment records
    const { rows: allRows } = await client.query(
      `SELECT sku, brand, name, features FROM pu_brand_enrichment`
    );

    const bar = new ProgressBar(total, "Parsing fitment");
    const toInsert = [];
    let parsed = 0;
    let skipped = 0;

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const fitment = parseFitment(row.name, row.features);

      if (fitment) {
        toInsert.push({
          sku:          row.sku,
          brand:        row.brand,
          parsed_from:  "name+features",
          ...fitment,
        });
        parsed++;
      } else {
        skipped++;
      }

      bar.update(i + 1);

      if (toInsert.length >= BATCH_SIZE) {
        await insertBatch(client, toInsert.splice(0, BATCH_SIZE));
      }
    }

    if (toInsert.length) await insertBatch(client, toInsert);
    bar.finish("Parsing complete");

    // Summary
    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE is_harley)                AS harley,
        COUNT(*) FILTER (WHERE NOT is_harley AND other_makes IS NOT NULL) AS other_make,
        COUNT(*) FILTER (WHERE year_start IS NOT NULL)   AS with_years,
        COUNT(*) FILTER (WHERE hd_families IS NOT NULL)  AS with_families,
        COUNT(*) FILTER (WHERE hd_codes IS NOT NULL)     AS with_codes,
        COUNT(*) FILTER (WHERE hd_models IS NOT NULL)    AS with_models,
        COUNT(*) FILTER (WHERE other_makes IS NOT NULL)  AS with_other_makes
      FROM pu_fitment
    `);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Fitment parsing complete!

  Total with fitment:    ${Number(s.total).toLocaleString()}
  No fitment found:      ${skipped.toLocaleString()}

  Harley-Davidson:       ${Number(s.harley).toLocaleString()}
  Other makes:           ${Number(s.other_make).toLocaleString()}
  With year range:       ${Number(s.with_years).toLocaleString()}
  With HD families:      ${Number(s.with_families).toLocaleString()}
  With HD model codes:   ${Number(s.with_codes).toLocaleString()}
  With specific models:  ${Number(s.with_models).toLocaleString()}
  With other makes:      ${Number(s.with_other_makes).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Sample results
    console.log("\n📋 Sample fitment records:\n");
    const { rows: samples } = await client.query(`
      SELECT sku, brand, year_start, year_end, hd_families, hd_codes, hd_models, other_makes
      FROM pu_fitment
      WHERE is_harley AND year_start IS NOT NULL
      ORDER BY random()
      LIMIT 8
    `);
    for (const r of samples) {
      const years = r.year_start ? `${r.year_start}-${r.year_end}` : "—";
      const fams  = r.hd_families?.join(", ") || "—";
      const codes = r.hd_codes?.join(", ") || "—";
      console.log(`  ${r.sku} | ${r.brand} | ${years} | ${fams} | ${codes}`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
