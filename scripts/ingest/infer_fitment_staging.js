#!/usr/bin/env node
/**
 * scripts/ingest/infer_fitment_staging.js
 *
 * Infers HD fitment for all catalog_unified products (VTWIN, PU, WPS)
 * and writes results to fitment_staging for review before promotion.
 *
 * Four passes in priority order — highest confidence wins per product:
 *   Pass 1 — OEM number year decode (deterministic)
 *   Pass 2 — Name/feature explicit era keyword match (rule-based)
 *   Pass 3 — Platform + displacement context inference (medium confidence)
 *   Pass 4 — No signal → flag universal or leave unfitted
 *
 * Nothing touches catalog_fitment_v2 until you run promote_fitment_staging.js
 *
 * Usage:
 *   node scripts/ingest/infer_fitment_staging.js [--vendor VTWIN|PU|WPS] [--replace]
 *
 * Options:
 *   --vendor  Limit to one vendor (default: all)
 *   --replace Drop and recreate fitment_staging before running
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const vendorFilter = args.includes("--vendor") ? args[args.indexOf("--vendor") + 1]?.toUpperCase() : null;
const replace = args.includes("--replace");

// ─── Family definitions ───────────────────────────────────────────────────────
// Maps harley_families.name → canonical year range in the DB
const FAMILY_YEAR_RANGES = {
  "Flathead":    { min: 1930, max: 1952 },
  "Knucklehead": { min: 1936, max: 1947 },
  "Panhead":     { min: 1948, max: 1965 },
  "Shovelhead":  { min: 1966, max: 1984 },
  "FXR":         { min: 1982, max: 1994 },
  "Evolution":   { min: 1984, max: 1999 },
  "Sportster":   { min: 1984, max: 2022 },
  "Softail Evo": { min: 1984, max: 2017 },
  "Dyna":        { min: 1993, max: 2017 },
  "Twin Cam":    { min: 1999, max: 2017 },
  "Touring":     { min: 1984, max: 2026 },
  "V-Rod":       { min: 2002, max: 2017 },
  "Trike":       { min: 2009, max: 2026 },
  "Street":      { min: 2015, max: 2021 },
  "Softail M8":  { min: 2018, max: 2026 },
  "Revolution Max": { min: 2021, max: 2026 },
};

// ─── Pass 2: Explicit era keyword → family mappings ───────────────────────────
// Each entry: { pattern, families[], year_min?, year_max?, confidence }
// Evaluated in order — first match wins for a given keyword tier
const ERA_KEYWORDS = [
  // Old iron — unambiguous
  { pattern: /flathead/i,               families: ["Flathead"],                 year_min: 1930, year_max: 1952, confidence: "high" },
  { pattern: /side.?valve/i,            families: ["Flathead"],                 year_min: 1930, year_max: 1952, confidence: "high" },
  { pattern: /servi.?car/i,             families: ["Flathead"],                 year_min: 1932, year_max: 1952, confidence: "high" },
  { pattern: /\bulh\b/i,                families: ["Flathead"],                 year_min: 1937, year_max: 1941, confidence: "high" },
  { pattern: /\bwla\b/i,                families: ["Flathead"],                 year_min: 1942, year_max: 1945, confidence: "high" },
  { pattern: /hummer.*side.?valve|side.?valve.*hummer/i, families: ["Flathead"], year_min: 1948, year_max: 1956, confidence: "high" },
  { pattern: /knucklehead/i,            families: ["Knucklehead"],              year_min: 1936, year_max: 1947, confidence: "high" },
  { pattern: /panhead/i,                families: ["Panhead"],                  year_min: 1948, year_max: 1965, confidence: "high" },
  { pattern: /shovelhead/i,             families: ["Shovelhead", "FXR"],        year_min: 1966, year_max: 1984, confidence: "high" },
  { pattern: /ironhead/i,               families: ["Sportster"],                year_min: 1957, year_max: 1985, confidence: "high" },

  // Modern era — unambiguous
  { pattern: /milwaukee.?eight|milwaukee.?8|\bm8\b/i, families: ["Softail M8", "Touring"], year_min: 2017, confidence: "high" },
  { pattern: /twin.?cam|\btc\b/i,       families: ["Twin Cam", "Dyna", "Softail Evo", "Touring"], year_min: 1999, year_max: 2017, confidence: "high" },
  { pattern: /revolution.?max/i,        families: ["Revolution Max"],           year_min: 2021, confidence: "high" },
  { pattern: /\bv.?rod\b/i,             families: ["V-Rod"],                    year_min: 2002, year_max: 2017, confidence: "high" },

  // Evolution — context-dependent
  { pattern: /\bevo\b.*sportster|sportster.*\bevo\b/i, families: ["Sportster"], year_min: 1986, year_max: 2021, confidence: "high" },
  { pattern: /\bevo\b.*big.?twin|big.?twin.*\bevo\b/i, families: ["Evolution", "Softail Evo"], year_min: 1984, year_max: 1999, confidence: "high" },
  { pattern: /\bevolution\b/i,          families: ["Evolution", "Softail Evo"], year_min: 1984, year_max: 1999, confidence: "medium" },
  { pattern: /\bevo\b/i,                families: ["Evolution", "Softail Evo"], year_min: 1984, year_max: 1999, confidence: "medium" },

  // Platform keywords — medium confidence, need year context
  { pattern: /\bsportster\b/i,          families: ["Sportster"],                year_min: 1984, year_max: 2022, confidence: "medium" },
  { pattern: /\bdyna\b/i,               families: ["Dyna"],                     year_min: 1993, year_max: 2017, confidence: "medium" },
  { pattern: /\bfxr\b/i,               families: ["FXR"],                      year_min: 1982, year_max: 1994, confidence: "medium" },
  { pattern: /\bv-rod\b|\bvrod\b/i,    families: ["V-Rod"],                    year_min: 2002, year_max: 2017, confidence: "medium" },
  { pattern: /\btrike\b/i,             families: ["Trike"],                    year_min: 2009, confidence: "medium" },
  { pattern: /\bstreet\s+(500|750)\b/i,families: ["Street"],                   year_min: 2015, year_max: 2021, confidence: "medium" },
  { pattern: /\bsoftail\b/i,           families: ["Softail Evo", "Softail M8"], confidence: "medium" },
  { pattern: /\btouring\b/i,           families: ["Touring"],                  confidence: "medium" },
];

// ─── Pass 3: Displacement hints → engine era ──────────────────────────────────
// HD displacements are era-specific enough to be useful signals
const DISPLACEMENT_MAP = [
  { pattern: /\b45\s*inch|\b750\s*cc/i,    families: ["Sportster"],                year_min: 1957, year_max: 1985, confidence: "low", note: "45ci = Ironhead era" },
  { pattern: /\b61\s*inch/i,                  families: ["Knucklehead", "Panhead"],   year_min: 1936, year_max: 1965, confidence: "low", note: "61ci = Knuck/Pan" },
  { pattern: /\b1000\s*cc/i,                  families: ["Sportster"],                year_min: 1972, year_max: 1985, confidence: "low", note: "1000cc = Ironhead 1972-85" },
  { pattern: /\b74\s*inch/i,               families: ["Knucklehead", "Panhead", "Shovelhead"], year_min: 1936, year_max: 1984, confidence: "low", note: "74ci = multi-era" },
  { pattern: /\b80\s*inch/i,               families: ["Shovelhead", "Evolution", "Softail Evo"], year_min: 1978, year_max: 1999, confidence: "low", note: "80ci = late Shovel + Evo" },
  { pattern: /\b883\b/i,                   families: ["Sportster"],                year_min: 1986, year_max: 2021, confidence: "medium", note: "883 = Evo Sportster" },
  { pattern: /\b1200\b/i,                  families: ["Sportster"],                year_min: 1988, year_max: 2021, confidence: "medium", note: "1200 = Evo Sportster" },
  { pattern: /\b88\s*inch|\b1450\s*cc/i,   families: ["Twin Cam", "Dyna", "Softail Evo", "Touring"], year_min: 1999, year_max: 2006, confidence: "low", note: "88ci = TC88" },
  { pattern: /\b96\s*inch|\b1584\s*cc/i,   families: ["Twin Cam", "Dyna", "Softail Evo", "Touring"], year_min: 2007, year_max: 2011, confidence: "low", note: "96ci = TC96" },
  { pattern: /\b103\s*inch|\b1690\s*cc/i,  families: ["Twin Cam", "Dyna", "Softail Evo", "Touring"], year_min: 2012, year_max: 2017, confidence: "low", note: "103ci = TC103" },
  { pattern: /\b107\s*inch|\b1745\s*cc/i,  families: ["Softail M8", "Touring"],   year_min: 2017, confidence: "low", note: "107ci = M8" },
  { pattern: /\b114\s*inch|\b1868\s*cc/i,  families: ["Softail M8", "Touring"],   year_min: 2017, confidence: "low", note: "114ci = M8" },
  { pattern: /\b117\s*inch|\b1923\s*cc/i,  families: ["Softail M8", "Touring"],   year_min: 2017, confidence: "low", note: "117ci = M8 CVO" },
  { pattern: /\b120\s*inch/i,              families: ["Softail M8", "Touring"],   year_min: 2017, confidence: "low", note: "120ci = M8 CVO" },
];

// Universal/chopper signal patterns — flag as universal rather than unfitted
const UNIVERSAL_PATTERNS = [
  /\buniversal\b/i,
  /\bchopper\b/i,
  /\bcustom\s+build/i,
  /\ball\s+models\b/i,
  /\bmost\s+models\b/i,
];

// ─── OEM year decode ──────────────────────────────────────────────────────────
// Genuine HD OEM part numbers: digits only before the dash, exactly 2 digits after,
// optional single uppercase letter suffix. No slashes, spaces, or secondary dashes.
// e.g. 25522-36 ok  17611-66A ok  LA-8992-36 ok
//      4/042-55 NO  29881-95 / 30017-01 NO  106-6479-00 NO
const HD_OEM_RE = /^[A-Z]{0,4}-?\d{4,6}-(\d{2})[A-Z]?$/;

function decodeOemYear(oem) {
  // Reject if contains slash or space (dual OEM refs, Mikuni jets, etc)
  if (oem.includes('/') || oem.includes(' ')) return null;

  // Count dash segments — HD OEM is 2 segments (NNNNN-YY) or
  // 3 with short vendor prefix (XX-NNNNN-YY), never more
  const segments = oem.split('-');
  if (segments.length > 3) return null;

  // Must match HD OEM pattern
  if (!HD_OEM_RE.test(oem)) return null;

  const match = oem.match(/-(\d{2})[A-Z]?$/);
  if (!match) return null;
  const yy = parseInt(match[1]);

  // Resolve 2-digit year: HD parts go back to 1936
  // 00-35 -> 2000-2035, 36-99 -> 1936-1999
  const year = yy <= 35 ? 2000 + yy : 1900 + yy;

  // Sanity check — reject years outside HD production history
  if (year < 1936 || year > 2030) return null;

  return year;
}

// Given a year, find which families it maps to
function familiesForYear(year) {
  const matches = [];
  for (const [family, range] of Object.entries(FAMILY_YEAR_RANGES)) {
    if (year >= range.min && year <= (range.max ?? 2099)) {
      matches.push(family);
    }
  }
  return matches;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();

  try {
    console.log("=== Fitment Staging Pipeline ===\n");
    if (vendorFilter) console.log(`Vendor filter: ${vendorFilter}`);
    console.log();

    // 1. Create staging table
    if (replace) {
      console.log("Dropping existing fitment_staging...");
      await client.query(`DROP TABLE IF EXISTS fitment_staging`);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS fitment_staging (
        id                serial PRIMARY KEY,
        product_id        integer NOT NULL REFERENCES catalog_unified(id) ON DELETE CASCADE,
        family_name       text NOT NULL,
        year_min          smallint,
        year_max          smallint,
        confidence        text NOT NULL CHECK (confidence IN ('high','medium','low')),
        inference_source  text NOT NULL,
        raw_signal        text,
        pass              smallint NOT NULL,
        status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        created_at        timestamptz DEFAULT now(),
        UNIQUE (product_id, family_name, year_min, year_max)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS fitment_staging_product_idx ON fitment_staging(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS fitment_staging_status_idx ON fitment_staging(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS fitment_staging_confidence_idx ON fitment_staging(confidence)`);
    console.log("✅ fitment_staging table ready\n");

    // 2. Load all products
    const vendorWhere = vendorFilter ? `AND cu.source_vendor = '${vendorFilter}'` : "";
    const { rows: products } = await client.query(`
      SELECT cu.id, cu.name, cu.source_vendor, cu.oem_numbers
      FROM catalog_unified cu
      WHERE cu.is_active = true
      ${vendorWhere}
      ORDER BY cu.source_vendor, cu.id
    `);
    console.log(`Loaded ${products.length} products to evaluate\n`);

    // 3. Process each product
    const stagingRows = [];
    const stats = {
      pass1: 0, pass2: 0, pass3: 0, pass4_universal: 0, pass4_unfitted: 0,
      total: products.length,
    };

    for (const product of products) {
      const text = (product.name || "").trim();
      const oems = product.oem_numbers || [];
      const inferences = [];

      // ── Pass 1: OEM year decode ──────────────────────────────────────────
      for (const oem of oems) {
        const year = decodeOemYear(oem);
        if (!year) continue;
        const families = familiesForYear(year);
        for (const family of families) {
          inferences.push({
            family_name: family,
            year_min: year,
            year_max: year,
            confidence: "high",
            inference_source: "oem_year_decode",
            raw_signal: oem,
            pass: 1,
          });
        }
      }

      // ── Pass 2: Era keyword match ────────────────────────────────────────
      if (inferences.length === 0) {
        for (const rule of ERA_KEYWORDS) {
          if (rule.pattern.test(text)) {
            for (const family of rule.families) {
              inferences.push({
                family_name: family,
                year_min: rule.year_min ?? FAMILY_YEAR_RANGES[family]?.min ?? null,
                year_max: rule.year_max ?? FAMILY_YEAR_RANGES[family]?.max ?? null,
                confidence: rule.confidence,
                inference_source: "name_keyword",
                raw_signal: text.substring(0, 120),
                pass: 2,
              });
            }
            break; // First matching keyword rule wins
          }
        }
      }

      // ── Pass 3: Displacement context ─────────────────────────────────────
      if (inferences.length === 0) {
        for (const rule of DISPLACEMENT_MAP) {
          if (rule.pattern.test(text)) {
            for (const family of rule.families) {
              inferences.push({
                family_name: family,
                year_min: rule.year_min ?? null,
                year_max: rule.year_max ?? FAMILY_YEAR_RANGES[family]?.max ?? null,
                confidence: rule.confidence,
                inference_source: "displacement_inference",
                raw_signal: `${text.substring(0, 80)} [${rule.note}]`,
                pass: 3,
              });
            }
            break;
          }
        }
      }

      // ── Pass 4: Universal flag or leave unfitted ─────────────────────────
      if (inferences.length === 0) {
        const isUniversal = UNIVERSAL_PATTERNS.some(p => p.test(text));
        if (isUniversal) {
          inferences.push({
            family_name: "Universal",
            year_min: null,
            year_max: null,
            confidence: "medium",
            inference_source: "universal_keyword",
            raw_signal: text.substring(0, 120),
            pass: 4,
          });
          stats.pass4_universal++;
        } else {
          stats.pass4_unfitted++;
        }
      }

      // Track pass stats
      if (inferences.length > 0) {
        const pass = inferences[0].pass;
        if (pass === 1) stats.pass1++;
        else if (pass === 2) stats.pass2++;
        else if (pass === 3) stats.pass3++;
      }

      for (const inf of inferences) {
        stagingRows.push({ product_id: product.id, ...inf });
      }
    }

    console.log(`Processing complete. ${stagingRows.length} inferences generated.\n`);
    console.log(`Pass breakdown:`);
    console.log(`  Pass 1 (OEM decode):      ${stats.pass1} products`);
    console.log(`  Pass 2 (era keyword):     ${stats.pass2} products`);
    console.log(`  Pass 3 (displacement):    ${stats.pass3} products`);
    console.log(`  Pass 4 (universal flag):  ${stats.pass4_universal} products`);
    console.log(`  No signal (unfitted):     ${stats.pass4_unfitted} products\n`);

    // 4. Bulk insert staging rows
    const BATCH = 500;
    let inserted = 0;
    let conflicts = 0;

    console.log(`Inserting ${stagingRows.length} rows into fitment_staging...`);
    for (let i = 0; i < stagingRows.length; i += BATCH) {
      const batch = stagingRows.slice(i, i + BATCH);
      const values = batch.map((_, j) => {
        const base = j * 8;
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8})`;
      }).join(",");
      const params = batch.flatMap(r => [
        r.product_id, r.family_name, r.year_min ?? null, r.year_max ?? null,
        r.confidence, r.inference_source, r.raw_signal ?? null, r.pass,
      ]);
      const res = await client.query(`
        INSERT INTO fitment_staging
          (product_id, family_name, year_min, year_max, confidence, inference_source, raw_signal, pass)
        VALUES ${values}
        ON CONFLICT (product_id, family_name, year_min, year_max) DO NOTHING
      `, params);
      inserted += res.rowCount ?? 0;
      conflicts += batch.length - (res.rowCount ?? 0);
      if (i % 5000 === 0) process.stdout.write(`\r  ${Math.round(i/stagingRows.length*100)}%`);
    }
    console.log(`\r  100%\n`);

    // 5. Summary
    console.log("✅ Done!\n");
    console.log(`   Inserted:  ${inserted}`);
    console.log(`   Conflicts: ${conflicts} (already existed)\n`);

    // 6. Preview by confidence + vendor
    const { rows: summary } = await client.query(`
      SELECT
        cu.source_vendor,
        fs.confidence,
        fs.pass,
        COUNT(DISTINCT fs.product_id) AS products,
        COUNT(*) AS inferences
      FROM fitment_staging fs
      JOIN catalog_unified cu ON cu.id = fs.product_id
      GROUP BY cu.source_vendor, fs.confidence, fs.pass
      ORDER BY cu.source_vendor, fs.pass, fs.confidence
    `);

    console.log("📊 Staging summary by vendor + confidence:\n");
    console.log("  vendor  | pass | confidence | products | inferences");
    console.log("  --------|------|------------|----------|----------");
    for (const r of summary) {
      console.log(`  ${r.source_vendor.padEnd(7)} | ${String(r.pass).padEnd(4)} | ${r.confidence.padEnd(10)} | ${String(r.products).padEnd(8)} | ${r.inferences}`);
    }

    // 7. Sample of each pass for spot-checking
    console.log("\n📋 Sample inferences per pass:\n");
    for (const pass of [1, 2, 3, 4]) {
      const { rows: samples } = await client.query(`
        SELECT cu.name, cu.source_vendor, fs.family_name, fs.year_min, fs.year_max,
               fs.confidence, fs.inference_source, fs.raw_signal
        FROM fitment_staging fs
        JOIN catalog_unified cu ON cu.id = fs.product_id
        WHERE fs.pass = $1
        LIMIT 4
      `, [pass]);
      if (samples.length === 0) continue;
      console.log(`  Pass ${pass}:`);
      for (const s of samples) {
        console.log(`    [${s.source_vendor}] ${s.name.substring(0,50).padEnd(50)} → ${s.family_name} ${s.year_min||''}–${s.year_max||''} (${s.confidence}) via ${s.inference_source}`);
      }
      console.log();
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
