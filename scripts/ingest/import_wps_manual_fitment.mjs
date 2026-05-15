/**
 * import_wps_manual_fitment.mjs
 * 
 * Imports hand-built fitment data from catalog_with_fitment.csv into
 * catalog_fitment_v2. The CSV has three fitment columns added manually:
 *
 *   fitment_year_range  — "2017-2020" or "2011-2018, 2012-2017, 2014, 2014"
 *   fitment_model       — "Softail" or "Dyna, FLT, XL"
 *   fitment_hd_oem      — "41739-84" (optional, single or comma-separated)
 *
 * Pairing logic (determined by analyzing the data):
 *
 *   Case A — counts match (yr_parts == model_parts):
 *     Each year range pairs positionally with its model.
 *     "2011-2018, 2012-2017" + "Sportster, Dyna" → two separate fitment records.
 *
 *   Case B — counts don't match (typically 1 range + N models, or N ranges + 1 model):
 *     The single year range applies to ALL models listed (or vice versa).
 *     "2017-2020" + "FLT, XL" → FLT:2017-2020 AND XL:2017-2020.
 *
 *   Case C — model only, no year range:
 *     Insert fitment for ALL years in harley_model_years for that family.
 *     This is the "fits all years of this family" signal.
 *
 * Model alias map → harley_families.name:
 *   The CSV uses shorthand that must be resolved to canonical family names.
 *
 * Usage:
 *   node import_wps_manual_fitment.mjs --dry-run   # preview, no DB writes
 *   node import_wps_manual_fitment.mjs             # live import
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { parse } from "csv-parse/sync";
import pg from "pg";

const require = createRequire(import.meta.url);
const DRY_RUN = process.argv.includes("--dry-run");

// ─── DB ───────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
  max: 5,
});

// ─── Model alias → harley_families.name ──────────────────────────────────────
// Every distinct value found in fitment_model, mapped to canonical family names.
// A single CSV alias can map to MULTIPLE families (e.g. "Big Twin" covers several).
// Expand as needed — these 14 cover everything in this dataset.

const MODEL_ALIAS_MAP = {
  // Direct family name matches (these exist verbatim in harley_families)
  "Softail":    ["Softail"],
  "Touring":    ["Touring"],
  "Dyna":       ["Dyna"],
  "FXR":        ["FXR"],
  "Sportster":  ["Sportster"],

  // Aliases for families by engine/era shorthand
  "XL":         ["Sportster"],              // XL is the model prefix for Sportster
  "FLT":        ["Touring"],               // FLT is the model prefix for Touring
  "M8":         ["Softail", "Touring"],    // M8 engine spans Softail + Touring
  "EVO":        ["Softail", "Dyna", "FXR", "Sportster"], // Evo era = all families of that era
  "Evolution":  ["Softail", "Dyna", "FXR", "Sportster"],
  "Twin Cam":   ["Softail", "Dyna", "Touring", "FXR"],
  "Big Twin":   ["Softail", "Dyna", "Touring", "FXR"],  // Big Twin = non-Sportster
  "Panhead":    ["Panhead"],
  "Shovelhead": ["Shovelhead"],
};

// ─── Year range parser ────────────────────────────────────────────────────────
// Handles: "2017-2020", "2018", "1900" (placeholder = all years), null/empty

const PLACEHOLDER_YEARS = new Set(["1900"]); // used in CSV to mean "all years"

function parseYearToken(token) {
  const t = token.trim();
  if (!t || PLACEHOLDER_YEARS.has(t)) return null; // null = all years for family

  const rangeMatch = t.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  }
  const singleMatch = t.match(/^(\d{4})$/);
  if (singleMatch) {
    const y = parseInt(singleMatch[1]);
    return { min: y, max: y };
  }
  return null; // unrecognizable — skip
}


// ─── Name inference — model codes + year range extraction ────────────────────
// WPS product names frequently contain HD model codes (FXD, FLHT, FXST) and
// embedded year ranges (91-17, 06-UP). We extract both to generate real
// fitment rows where possible, falling back to flag-only when no year found.

// Model code → family name(s)
const WPS_MODEL_CODE_MAP = {
  // Touring
  "FLHR": ["Touring"], "FLHRC": ["Touring"], "FLHT": ["Touring"],
  "FLHX": ["Touring"], "FLTR":  ["Touring"], "FLT":  ["Touring"],
  "FLH":  ["Touring"],
  // Softail
  "FXST": ["Softail"], "FXSTB": ["Softail"], "FXSTC": ["Softail"],
  "FXSTS":["Softail"], "FXCW":  ["Softail"], "FXSB":  ["Softail"],
  "FLST": ["Softail"], "FLSTC": ["Softail"], "FLSTF": ["Softail"],
  "FLSTN":["Softail"], "FXWG":  ["Softail"],
  // Dyna
  "FXD":  ["Dyna"], "FXDL": ["Dyna"], "FXDB": ["Dyna"],
  "FXDC": ["Dyna"], "FXDF": ["Dyna"], "FXDWG":["Dyna"],
  "FXDX": ["Dyna"],
  // FXR
  "FXR":  ["FXR"], "FXRS": ["FXR"], "FXRT": ["FXR"], "FXLR": ["FXR"],
  // Sportster
  "XL":   ["Sportster"], "XLH":  ["Sportster"], "XLCH": ["Sportster"],
  "XL883":["Sportster"], "XL1200":["Sportster"],
  // Vintage / pre-unit
  "FL":   ["Panhead", "Shovelhead"],
  "EL":   ["Knucklehead"],
  "WL":   ["Flathead"], "WLA": ["Flathead"],
  "UL":   ["Flathead"],
  // Era keywords
  "SOFTAIL":   ["Softail"],
  "DYNA":      ["Dyna"],
  "TOURING":   ["Touring"],
  "SPORTSTER": ["Sportster"],
  "IRONHEAD":  ["Sportster"],
  "KNUCKLEHEAD":["Knucklehead"],
  "PANHEAD":   ["Panhead"],
  "SHOVELHEAD":["Shovelhead"],
  "EVOLUTION": ["Softail", "Dyna", "FXR", "Sportster"],
  "TWIN CAM":  ["Softail", "Dyna", "Touring"],
  "M8":        ["Softail", "Touring"],
};

// Sorted longest-first so FXDWG matches before FXD, XLCH before XL, etc.
const WPS_CODE_ENTRIES = Object.entries(WPS_MODEL_CODE_MAP)
  .sort((a, b) => b[0].length - a[0].length);

// Two-digit year → four-digit year (WPS catalogs span 1976–2025)
function expandYear(yy) {
  const n = parseInt(yy);
  return n <= 30 ? 2000 + n : 1900 + n;
}

// Extract { familyIds, yearMin, yearMax } from a WPS product name.
// Returns null if no model code found.
function parseWpsName(name, familyByName) {
  const upper = name.toUpperCase();
  const familyIds = new Set();

  for (const [code, families] of WPS_CODE_ENTRIES) {
    // Word-boundary match — avoids FLH matching FLHX, FXD matching FXDWG etc.
    const re = new RegExp("\\b" + code.replace(/ /g, "\\s+") + "\\b");
    if (re.test(upper)) {
      for (const fname of families) {
        const fid = familyByName[fname];
        if (fid) familyIds.add(fid);
      }
    }
  }

  if (familyIds.size === 0) return null;

  // Extract year range — patterns: "91-17", "06-UP", "\`09-UP", "84-UP"
  let yearMin = null, yearMax = null;
  const yrRange = name.match(/['\`]?(\d{2})-(\d{2})/);
  const yrUp    = name.match(/['\`]?(\d{2})-UP/i);

  if (yrRange) {
    yearMin = expandYear(yrRange[1]);
    yearMax = expandYear(yrRange[2]);
    // Sanity: if min > max, year century boundary (e.g. 99-06 → 1999-2006)
    if (yearMin > yearMax) yearMax += 100;
  } else if (yrUp) {
    yearMin = expandYear(yrUp[1]);
    yearMax = 2025; // "UP" = current
  }

  return { familyIds, yearMin, yearMax };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);

  // Load CSV
  const csvPath = path.join(
    process.env.CSV_PATH ||
    new URL(".", import.meta.url).pathname + "data/catalog_with_fitment.csv"
  );
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  console.log(`CSV rows: ${rows.length}`);

  // Load DB state: family name → id, model_year_id index
  const { rows: familyRows } = await pool.query(
    `SELECT id, name FROM harley_families ORDER BY name`
  );
  const familyByName = {};
  for (const f of familyRows) familyByName[f.name] = f.id;
  console.log(`Families in DB: ${Object.keys(familyByName).join(", ")}`);

  // model_year lookup: (family_id, year) → [model_year_id, ...]
  const { rows: myRows } = await pool.query(`
    SELECT hmy.id AS myi, hmy.year, hm.family_id
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
  `);
  const myIndex = {}; // key: `${family_id}:${year}` → Set of model_year_ids
  for (const r of myRows) {
    const key = `${r.family_id}:${r.year}`;
    if (!myIndex[key]) myIndex[key] = new Set();
    myIndex[key].add(parseInt(r.myi));
  }

  // All years per family for "no year range" case
  const allYearsByFamily = {}; // family_id → sorted int[]
  for (const key of Object.keys(myIndex)) {
    const [fid] = key.split(":");
    const fidInt = parseInt(fid);
    if (!allYearsByFamily[fidInt]) allYearsByFamily[fidInt] = new Set();
    allYearsByFamily[fidInt].add(parseInt(key.split(":")[1]));
  }

  // Existing fitment in catalog_fitment_v2 to avoid dupes
  const { rows: existingRows } = await pool.query(
    `SELECT product_id, model_year_id FROM catalog_fitment_v2`
  );
  const existingSet = new Set(
    existingRows.map((r) => `${r.product_id}:${r.model_year_id}`)
  );
  console.log(`Existing catalog_fitment_v2 rows: ${existingSet.size}`);

  // WPS products: vendor SKU → catalog_unified.id
  // WPS SKUs in catalog_unified are prefixed "WPS-{sku}"
  const { rows: cuRows } = await pool.query(
    `SELECT id, vendor_sku FROM catalog_unified WHERE source_vendor = 'WPS'`
  );
  const cuByWpsSku = {};
  for (const r of cuRows) {
    cuByWpsSku[r.vendor_sku] = r.id;
  }
  console.log(`WPS products in catalog_unified: ${Object.keys(cuByWpsSku).length}`);

  // ── Process rows ────────────────────────────────────────────────────────────

  let skipped_no_fitment = 0;
  let skipped_no_product = 0;
  let skipped_no_family  = 0;
  let skipped_no_years   = 0;
  let skipped_alias      = 0;
  let already_exists     = 0;
  let inserted           = 0;
  let would_insert       = 0;

  // ── Pass 1: OEM number collection ──────────────────────────────────────────
  // Scan all rows for fitment_hd_oem regardless of whether fitment data exists.
  // Handles comma-separated values (e.g. "3720215, 3720215").
  const oemByProductId = {}; // product_id → Set<oem_number>

  for (const row of rows) {
    const sku = (row.sku || "").trim();
    const productId = cuByWpsSku[sku];
    if (!productId) continue;
    const raw = (row.fitment_hd_oem || "").toString().trim();
    if (!raw || raw === "nan") continue;
    const nums = raw.split(",").map(s => s.trim()).filter(s => s.length > 3);
    if (nums.length > 0) {
      if (!oemByProductId[productId]) oemByProductId[productId] = new Set();
      for (const n of nums) oemByProductId[productId].add(n);
    }
  }
  console.log(`OEM pass: ${Object.keys(oemByProductId).length} products with OEM numbers (${Object.values(oemByProductId).reduce((s,v)=>s+v.size,0)} total entries)`);

  // ── Pass 2: Fitment + name inference ────────────────────────────────────────
  const toInsert = []; // { product_id, model_year_id }
  const noYearRangeSkus = new Set(); // model-only SKUs — flag is_harley_fitment, no fitment rows

  for (const row of rows) {
    const yr   = (row.fitment_year_range || "").trim() || null;
    const mod  = (row.fitment_model     || "").trim() || null;
    const sku  = (row.sku               || "").trim();

    if (!yr && !mod) {
      // Try name inference before giving up
      const productId2 = cuByWpsSku[sku];
      if (productId2) {
        const parsed = parseWpsName(row.name || "", familyByName);
        if (parsed && parsed.familyIds.size > 0) {
          if (parsed.yearMin !== null) {
            // Has year range — generate real fitment rows inline
            for (const familyId of parsed.familyIds) {
              for (let y = parsed.yearMin; y <= parsed.yearMax; y++) {
                const myIds = myIndex[`${familyId}:${y}`];
                if (!myIds) continue;
                for (const myId of myIds) {
                  const key = `${productId2}:${myId}`;
                  if (existingSet.has(key)) { already_exists++; continue; }
                  existingSet.add(key);
                  toInsert.push({ product_id: productId2, model_year_id: myId });
                }
              }
            }
          } else {
            noYearRangeSkus.add(sku); // flag-only — no year found in name
          }
        } else {
          skipped_no_fitment++;
        }
      } else {
        skipped_no_fitment++;
      }
      continue;
    }

    // Resolve product_id
    const productId = cuByWpsSku[sku];
    if (!productId) {
      skipped_no_product++;
      continue;
    }

    // Parse models → expand to family ids
    const modelTokens = mod ? mod.split(",").map((s) => s.trim()) : [];
    const familyIds = new Set();

    for (const alias of modelTokens) {
      const resolved = MODEL_ALIAS_MAP[alias];
      if (!resolved) {
        skipped_alias++;
        console.warn(`  Unknown model alias: "${alias}" on SKU ${sku}`);
        continue;
      }
      for (const fname of resolved) {
        const fid = familyByName[fname];
        if (fid) familyIds.add(fid);
        else console.warn(`  Family not in DB: "${fname}" (alias "${alias}")`);
      }
    }

    if (familyIds.size === 0 && mod) {
      skipped_no_family++;
      continue;
    }

    // Parse year tokens
    const yearTokens = yr ? yr.split(",").map((s) => s.trim()) : [];

    // Determine (family, yearRange) pairs to insert
    // Case A: count match → positional pairing
    // Case B: mismatch → broadcast (one year to all families, or one family to all years)
    // Case C: no year → all years for each family

    let pairs; // Array of { familyId, min, max } where null min/max = all years

    if (!yr || yearTokens.length === 0) {
      // Case C: no year range — skip fitment rows, just flag is_harley_fitment.
      // Inserting all years x all models for a family produces millions of rows;
      // the browse LEFT JOIN fallback already surfaces is_harley_fitment=true products.
      noYearRangeSkus.add(sku);
      continue;
    } else {
      const parsedYears = yearTokens.map(parseYearToken);

      if (familyIds.size === 0) {
        // Year but no resolvable family — skip
        skipped_no_family++;
        continue;
      }

      const famArr = [...familyIds];

      if (yearTokens.length === famArr.length) {
        // Case A: positional — but families came from expanding aliases so
        // positional pairing by alias order, not family array order.
        // Re-derive in alias order for accuracy.
        const aliasOrder = modelTokens.flatMap((alias) =>
          (MODEL_ALIAS_MAP[alias] || [])
            .map((fname) => familyByName[fname])
            .filter(Boolean)
        );
        // Dedupe while preserving order
        const seen = new Set();
        const orderedFamIds = [];
        for (const fid of aliasOrder) {
          if (!seen.has(fid)) { seen.add(fid); orderedFamIds.push(fid); }
        }

        if (parsedYears.length === orderedFamIds.length) {
          pairs = orderedFamIds.map((fid, i) => ({
            familyId: fid,
            ...(parsedYears[i] || { min: null, max: null }),
          }));
        } else {
          // After alias expansion counts don't match — broadcast
          pairs = famArr.flatMap((fid) =>
            parsedYears.map((py) => ({
              familyId: fid,
              ...(py || { min: null, max: null }),
            }))
          );
        }
      } else {
        // Case B: broadcast — all parsed years × all families
        pairs = famArr.flatMap((fid) =>
          parsedYears.map((py) => ({
            familyId: fid,
            ...(py || { min: null, max: null }),
          }))
        );
      }
    }

    // Expand pairs to individual model_year_id rows
    for (const { familyId, min, max } of pairs) {
      let years;
      if (min === null || min === undefined) {
        // All years for this family
        years = [...(allYearsByFamily[familyId] || [])];
      } else {
        years = [];
        for (let y = min; y <= max; y++) years.push(y);
      }

      if (years.length === 0) {
        skipped_no_years++;
        continue;
      }

      for (const year of years) {
        const myIds = myIndex[`${familyId}:${year}`];
        if (!myIds || myIds.size === 0) continue; // year not in DB for this family

        for (const myId of myIds) {
          const key = `${productId}:${myId}`;
          if (existingSet.has(key)) {
            already_exists++;
            continue;
          }
          existingSet.add(key); // prevent same-run dupes
          toInsert.push({ product_id: productId, model_year_id: myId });
        }
      }
    }
  }

  const noYearRangeProductIds = [...noYearRangeSkus].map(s => cuByWpsSku[s]).filter(Boolean);

  console.log(`\n── Pre-insert summary ──`);
  console.log(`  Rows with no fitment data:    ${skipped_no_fitment}`);
  console.log(`  Model-only (flag only):       ${noYearRangeProductIds.length}`);
  console.log(`  Products with OEM numbers:    ${Object.keys(oemByProductId).length}`);
  console.log(`  SKU not in catalog_unified:   ${skipped_no_product}`);
  console.log(`  Unknown alias/no family:      ${skipped_no_family}`);
  console.log(`  No years in DB for range:     ${skipped_no_years}`);
  console.log(`  Already in catalog_fitment_v2:${already_exists}`);
  console.log(`  To insert:                    ${toInsert.length}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes. Re-run without --dry-run to commit.");
  console.log(`Would update OEM numbers on ${Object.keys(oemByProductId).length} products (${Object.values(oemByProductId).reduce((s,v)=>s+v.size,0)} total OEM numbers).`);
  console.log(`Would also set is_harley_fitment=true on ${noYearRangeProductIds.length} model-only products.`);
    console.log("\nSample of what would be inserted:");
    for (const r of toInsert.slice(0, 20)) {
      console.log(`  product_id=${r.product_id}  model_year_id=${r.model_year_id}`);
    }
    await pool.end();
    return;
  }

  // ── Batch insert ────────────────────────────────────────────────────────────
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const vals  = batch.map((r, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
    const flat  = batch.flatMap((r) => [r.product_id, r.model_year_id]);
    await pool.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
       VALUES ${vals}
       ON CONFLICT DO NOTHING`,
      flat
    );
    done += batch.length;
    process.stdout.write(`\r  Inserted ${done} / ${toInsert.length}`);
  }
  console.log(`\nDone. ${toInsert.length} rows inserted into catalog_fitment_v2.`);

  // ── Update oem_numbers on catalog_unified ──────────────────────────────────
  const oemEntries = Object.entries(oemByProductId);
  if (oemEntries.length > 0) {
    console.log(`\nUpdating OEM numbers on ${oemEntries.length} products...`);
    let oemUpdated = 0;
    for (const [productId, numSet] of oemEntries) {
      const nums = [...numSet];
      await pool.query(
        `UPDATE catalog_unified
         SET oem_numbers = (
           SELECT array_agg(DISTINCT n ORDER BY n)
           FROM unnest(COALESCE(oem_numbers, ARRAY[]::text[]) || $2::text[]) AS n
         )
         WHERE id = $1`,
        [parseInt(productId), nums]
      );
      oemUpdated++;
    }
    console.log(`OEM numbers updated on ${oemUpdated} products.`);
  }

  // Flag products with actual fitment rows
  const productIds = [...new Set(toInsert.map((r) => r.product_id))];
  if (productIds.length > 0) {
    await pool.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = ANY($1::int[])`,
      [productIds]
    );
    console.log(`Updated is_harley_fitment = true on ${productIds.length} fitment products.`);
  }

  // Flag model-only products — browse fallback will surface them without fitment rows
  if (noYearRangeProductIds.length > 0) {
    await pool.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = ANY($1::int[])`,
      [noYearRangeProductIds]
    );
    console.log(`Flagged is_harley_fitment = true on ${noYearRangeProductIds.length} model-only products.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
