#!/usr/bin/env node
/**
 * scripts/ingest/backfill_pu_fitment_structured.js
 *
 * Promotes pu_fitment → catalog_fitment_v2 for all PU products.
 *
 * Strategy:
 *   1. For rows WITH year_start + year_end + hd_families → expand directly
 *   2. For rows WITH hd_families but NO years → apply known family year ranges
 *   3. Join pu_fitment.sku → catalog_unified.sku (normalized, dashes stripped)
 *   4. Cross-reference with harley_model_years via family name
 *   5. Insert into catalog_fitment_v2 with ON CONFLICT DO NOTHING
 *
 * Usage:
 *   node scripts/ingest/backfill_pu_fitment_structured.js
 *   node scripts/ingest/backfill_pu_fitment_structured.js --dry-run
 */

import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

const DRY_RUN   = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;

// ── Family → fallback year range (used when pu_fitment has no years) ──────────
const FAMILY_YEAR_DEFAULTS = {
  "M8":          { start: 2017, end: 2026 },
  "Twin Cam":    { start: 1999, end: 2017 },
  "Evolution":   { start: 1984, end: 2003 },
  "Big Twin":    { start: 1936, end: 2003 },
  "Shovelhead":  { start: 1966, end: 1984 },
  "Panhead":     { start: 1948, end: 1965 },
  "Knucklehead": { start: 1936, end: 1947 },
  "Flathead":    { start: 1929, end: 1973 },  // Side-valve era (45ci WL, 74ci UL, Servi-Car)
  "Ironhead":    { start: 1957, end: 1985 },  // Ironhead Sportster XL
  "Touring":     { start: 1980, end: 2026 },
  "Softail":     { start: 1984, end: 2026 },
  "Dyna":        { start: 1991, end: 2017 },
  "Sportster":   { start: 1957, end: 2026 },
  "Trike":       { start: 2009, end: 2026 },
  "V-Rod":       { start: 2002, end: 2017 },
  "Street":      { start: 2015, end: 2020 },
  "EL":          { start: 1936, end: 1940 },  // Knucklehead 61ci
  "FL":          { start: 1941, end: 2026 },  // Big Twin FL platform
  "FXR":         { start: 1982, end: 1994 },  // FXR platform
};

// pu_fitment family names → harley_families names
// NOTE: "Flathead" and "Ironhead" map to "Flathead" and "Sportster" in harley_families
const FAMILY_ALIASES = {
  "Touring":     ["Touring"],
  "Softail":     ["Softail Evo", "Softail M8"],
  "Big Twin":    ["Softail Evo", "Touring", "Dyna", "FXR", "Evolution", "Twin Cam", "Shovelhead", "Panhead", "Knucklehead", "Flathead"],
  "M8":          ["Softail M8", "Touring"],
  "Dyna":        ["Dyna"],
  "Sportster":   ["Sportster"],
  "Ironhead":    ["Sportster"],  // Ironhead Sportster = early Sportster family
  "Twin Cam":    ["Twin Cam", "Touring", "Dyna", "Softail Evo"],
  "Evolution":   ["Evolution", "Softail Evo", "Sportster"],
  "Trike":       ["Trike"],
  "V-Rod":       ["V-Rod"],
  "Shovelhead":  ["Shovelhead"],
  "Street":      ["Street"],
  "Panhead":     ["Panhead"],
  "Knucklehead": ["Knucklehead"],
  "Flathead":    ["Flathead"],   // Side-valve / flathead era
  "FXR":         ["FXR"],        // FXR platform 1982-1994
  "Side Valve":  ["Flathead"],   // Alternate name
  "WL":          ["Flathead"],   // 45ci flathead model code
  "UL":          ["Flathead"],   // 74ci flathead model code
  "EL":          ["Knucklehead"], // 61ci Knucklehead 1936-1940
  "FL":          ["Panhead", "Shovelhead", "Evolution", "Twin Cam", "Touring"], // Big Twin FL platform
};

// ── Progress bar ──────────────────────────────────────────────────────────────
class ProgressBar {
  constructor(label, total) {
    this.label   = label;
    this.total   = total;
    this.current = 0;
    this.width   = 40;
    this.start   = Date.now();
    this.render();
  }
  render() {
    const pct    = this.total ? this.current / this.total : 0;
    const filled = Math.round(this.width * pct);
    const bar    = "█".repeat(filled) + "░".repeat(this.width - filled);
    const elapsed = ((Date.now() - this.start) / 1000).toFixed(1);
    const eta     = pct > 0.001
      ? (((Date.now() - this.start) / pct / 1000) - elapsed).toFixed(0)
      : "?";
    process.stdout.write(
      `\r  ${this.label.padEnd(22)} [${bar}] ${(pct * 100).toFixed(1)}%` +
      ` ${this.current.toLocaleString()}/${this.total.toLocaleString()}` +
      ` | ${elapsed}s | ETA ${eta}s   `
    );
  }
  increment(n = 1) { this.current += n; this.render(); }
  finish(msg = "") {
    this.current = this.total;
    this.render();
    const elapsed = ((Date.now() - this.start) / 1000).toFixed(1);
    console.log(`\n  ✅ ${elapsed}s${msg ? " — " + msg : ""}`);
  }
}

async function main() {
  const client = await pool.connect();

  try {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║   backfill_pu_fitment_structured → catalog_fitment_v2   ║");
    console.log(`╚══════════════════════════════════════════════════════════╝`);
    if (DRY_RUN) console.log("\n  ⚠️  DRY RUN — no changes will be written\n");
    else console.log();

    // 1. Load pu_fitment rows that have families
    console.log("📦 Loading pu_fitment rows with HD families...");
    const { rows: puFitment } = await client.query(`
      SELECT
        pf.sku,
        pf.year_start,
        pf.year_end,
        pf.hd_families
      FROM pu_fitment pf
      WHERE pf.is_harley = true
        AND pf.hd_families IS NOT NULL
        AND array_length(pf.hd_families, 1) > 0
    `);
    console.log(`  ${puFitment.length.toLocaleString()} pu_fitment rows loaded\n`);

    // 2. Build sku → catalog_unified.id map (normalize by stripping dashes)
    console.log("🔗 Building SKU → product_id map...");
    const { rows: cuRows } = await client.query(`
      SELECT id, sku, REPLACE(sku, '-', '') AS sku_norm
      FROM catalog_unified
      WHERE source_vendor = 'PU'
    `);
    const skuMap = new Map();
    for (const row of cuRows) {
      skuMap.set(row.sku, row.id);
      skuMap.set(row.sku_norm, row.id);
      // also try with dashes stripped from pu_fitment side
      skuMap.set(row.sku.replace(/-/g, ""), row.id);
    }
    console.log(`  ${cuRows.length.toLocaleString()} PU products mapped\n`);

    // 3. Build harley_model_years lookup: "FamilyName:year" → [model_year_id]
    console.log("📅 Building model_year lookup...");
    const { rows: myRows } = await client.query(`
      SELECT hmy.id AS model_year_id, hmy.year, hf.name AS family_name
      FROM harley_model_years hmy
      JOIN harley_models   hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
    `);
    const yearLookup = new Map();
    for (const row of myRows) {
      const key = `${row.family_name}:${row.year}`;
      if (!yearLookup.has(key)) yearLookup.set(key, []);
      yearLookup.get(key).push(row.model_year_id);
    }
    console.log(`  ${myRows.length.toLocaleString()} model-year combinations loaded\n`);

    // 4. Expand fitment rows
    console.log("⚙️  Expanding fitment rows...");
    const pb1 = new ProgressBar("Expanding", puFitment.length);

    const fitmentRows = [];
    const seen        = new Set();
    let noSku         = 0;
    let noYears       = 0;
    let noFamily      = 0;
    let noModelYear   = 0;
    const unmatchedFamilies = new Set();

    for (const pf of puFitment) {
      // Resolve product_id
      const skuNorm  = pf.sku.replace(/-/g, "");
      const productId = skuMap.get(pf.sku) ?? skuMap.get(skuNorm);
      if (!productId) { noSku++; pb1.increment(); continue; }

      for (const puFamily of pf.hd_families) {
        // Get year range
        let yearStart = pf.year_start ? parseInt(pf.year_start) : null;
        let yearEnd   = pf.year_end   ? parseInt(pf.year_end)   : null;

        if (!yearStart || !yearEnd) {
          const defaults = FAMILY_YEAR_DEFAULTS[puFamily];
          if (!defaults) { noYears++; continue; }
          yearStart = defaults.start;
          yearEnd   = defaults.end;
        }

        // Resolve family aliases
        const resolvedFamilies = FAMILY_ALIASES[puFamily];
        if (!resolvedFamilies) {
          unmatchedFamilies.add(puFamily);
          noFamily++;
          continue;
        }

        for (const family of resolvedFamilies) {
          for (let year = yearStart; year <= yearEnd; year++) {
            const key        = `${family}:${year}`;
            const modelYearIds = yearLookup.get(key);
            if (!modelYearIds) { noModelYear++; continue; }
            for (const modelYearId of modelYearIds) {
              const dedupeKey = `${productId}:${modelYearId}`;
              if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                fitmentRows.push({ product_id: productId, model_year_id: modelYearId });
              }
            }
          }
        }
      }

      pb1.increment();
    }

    pb1.finish(`${fitmentRows.length.toLocaleString()} fitment rows generated`);

    console.log(`\n  📊 Expansion stats:`);
    console.log(`     SKU not in catalog_unified : ${noSku.toLocaleString()}`);
    console.log(`     No year range available    : ${noYears.toLocaleString()}`);
    console.log(`     Unmatched family names     : ${noFamily.toLocaleString()}`);
    if (unmatchedFamilies.size > 0) {
      console.log(`     Unknown families           : ${[...unmatchedFamilies].join(", ")}`);
    }

    if (fitmentRows.length === 0) {
      console.log("\n❌ No fitment rows generated. Check mappings.");
      return;
    }

    if (DRY_RUN) {
      console.log(`\n⚠️  DRY RUN — would insert ${fitmentRows.length.toLocaleString()} rows`);
      return;
    }

    // 5. Insert in batches
    console.log(`\n💾 Inserting ${fitmentRows.length.toLocaleString()} rows...`);
    const pb2     = new ProgressBar("Inserting", fitmentRows.length);
    let inserted  = 0;
    let conflicts = 0;

    for (let i = 0; i < fitmentRows.length; i += BATCH_SIZE) {
      const batch  = fitmentRows.slice(i, i + BATCH_SIZE);
      const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
      const params = batch.flatMap(r => [r.product_id, r.model_year_id]);

      const result = await client.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
        VALUES ${values}
        ON CONFLICT (product_id, model_year_id) DO NOTHING
      `, params);

      inserted  += result.rowCount ?? 0;
      conflicts += batch.length - (result.rowCount ?? 0);
      pb2.increment(batch.length);
    }

    pb2.finish(`${inserted.toLocaleString()} inserted, ${conflicts.toLocaleString()} already existed`);

    // 6. Coverage summary
    console.log("\n📊 PU fitment coverage after backfill:");
    const { rows: coverage } = await client.query(`
      SELECT
        COUNT(*) AS total_pu,
        COUNT(DISTINCT cfv.product_id) AS with_fitment,
        ROUND(COUNT(DISTINCT cfv.product_id)::numeric / COUNT(*) * 100, 1) AS pct
      FROM catalog_unified cu
      LEFT JOIN catalog_fitment_v2 cfv ON cfv.product_id = cu.id
      WHERE cu.source_vendor = 'PU'
        AND cu.is_active = true
    `);
    const c = coverage[0];
    console.log(`   PU total    : ${Number(c.total_pu).toLocaleString()}`);
    console.log(`   With fitment: ${Number(c.with_fitment).toLocaleString()} (${c.pct}%)`);

    console.log("\n📊 catalog_fitment_v2 family coverage:");
    const { rows: families } = await client.query(`
      SELECT hf.name, COUNT(DISTINCT cfv.product_id) AS products
      FROM harley_families hf
      JOIN harley_models      hm  ON hm.family_id      = hf.id
      JOIN harley_model_years hmy ON hmy.model_id       = hm.id
      JOIN catalog_fitment_v2 cfv ON cfv.model_year_id  = hmy.id
      GROUP BY hf.name
      ORDER BY products DESC
    `);
    for (const row of families) {
      console.log(`   ${row.name.padEnd(18)} ${Number(row.products).toLocaleString()} products`);
    }

    console.log("\n✅ Backfill complete!\n");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
