/**
 * import_vtwin_manual_fitment.mjs
 *
 * Imports hand-built fitment data from vtwin_catalog-fit.csv into
 * catalog_fitment_v2. The CSV has three fitment columns:
 *
 *   Year         — single year (1936, 1941, 1957) or NaN
 *   engine_size  — displacement string ("74 inch", "883cc", "88 inch") or NaN
 *   Model        — model/family shorthand or NaN
 *
 * Plus three OEM crossref columns: oem_xref1, oem_xref2, oem_xref3
 *
 * Strategy:
 *   1. Model column is primary. Map aliases → harley_families.name(s).
 *   2. engine_size used to resolve ambiguous models (e.g. "74 inch" →
 *      Panhead OR Shovelhead depending on era).
 *   3. Year (single year) used to pin an exact year when present.
 *   4. If only engine_size and no Model → map displacement → family.
 *   5. M9–M21 are data artifacts (valve/guide variant numbering) — treat as M8.
 *   6. Rows with no resolvable family → is_harley_fitment=true only (no fitment rows).
 *   7. No year + no engine_size → all years for that family (model-only fallback).
 *
 * Usage:
 *   node import_vtwin_manual_fitment.mjs --dry-run
 *   node import_vtwin_manual_fitment.mjs
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── DB ───────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
  max: 5,
});

// ─── Model alias map → harley_families.name[] ────────────────────────────────
// VTwin Model column values, normalized to canonical family names.
// Multiple families per alias = product fits all of them.

const MODEL_ALIAS_MAP = {
  // Direct / near-direct matches
  "KNUCKLEHEAD":        ["Knucklehead"],
  "Panhead":            ["Panhead"],
  "PANHEAD":            ["Panhead"],
  "Panhead/Shovelhead": ["Panhead", "Shovelhead"],
  "SHOVELHEAD":         ["Shovelhead"],
  "EVOLUTION":          ["Softail", "Dyna", "FXR", "Sportster"], // Evo era = all families
  "Evolution":          ["Softail", "Dyna", "FXR", "Sportster"],
  "EVOLUTION, Shovelhead": ["Shovelhead", "Softail", "Dyna", "FXR", "Sportster"],
  "Twin Cam":           ["Softail", "Dyna", "Touring", "FXR"],
  "Twin Cam 88":        ["Softail", "Dyna", "Touring"],
  "Twin Cam 89":        ["Softail", "Dyna", "Touring"],
  "Twin Cam 96":        ["Softail", "Dyna", "Touring"],
  "M8":                 ["Softail", "Touring"],
  "M8 Softail":         ["Softail"],
  // M9–M21 are valve/guide part variants on M8 products, not real model codes
  "M9":  ["Softail", "Touring"],
  "M10": ["Softail", "Touring"],
  "M11": ["Softail", "Touring"],
  "M12": ["Softail", "Touring"],
  "M13": ["Softail", "Touring"],
  "M14": ["Softail", "Touring"],
  "M15": ["Softail", "Touring"],
  "M16": ["Softail", "Touring"],
  "M17": ["Softail", "Touring"],
  "M18": ["Softail", "Touring"],
  "M19": ["Softail", "Touring"],
  "M20": ["Softail", "Touring"],
  "M21": ["Softail", "Touring"],

  // Sportster variants
  "XL":             ["Sportster"],
  "xl":             ["Sportster"],
  "XLCH":           ["Sportster"],
  "IRONHEAD, XL":   ["Sportster"],
  "Softail, xl":   ["Softail", "Sportster"],

  // Touring / FLT / FLH
  "FLT":            ["Touring"],
  "FLH":            ["Touring"],
  "1965-1975 FLH": ["Touring"],  // year range embedded — use year bounds below

  // Dyna
  "FXD":            ["Dyna"],
  "FXBB":           ["Dyna"],

  // FXR
  "FXR":            ["FXR"],
  "86-95 ST":      ["FXR"],     // ST = Sport / FXR era

  // Softail specific model codes
  "SOFTAIL":        ["Softail"],
  "FXST":           ["Softail"],
  "FXSTS":          ["Softail"],
  "FLSTS":          ["Softail"],
  "FLFB":           ["Softail"],

  // Pre-war / flathead / vintage
  "UL":             ["Flathead"],
  "UL, ULH":        ["Flathead"],
  "WL":             ["Flathead"],
  "WL/G":           ["Flathead"],
  "WR":             ["Flathead"],
  "KH":             ["Sportster"],   // KH = K-model predecessor to Sportster
  "K MODEL":        ["Sportster"],
  "FL":             ["Panhead", "Shovelhead", "Touring"],  // FL = big twin generic
  "FLATSIDE":       ["Knucklehead", "Panhead"],  // flatside cam cover = Knuck/Pan era

  // Sidecar / XR — map to closest family, no dedicated family in DB
  "SIDECAR":        ["Touring"],    // sidecar rigs are typically FLH/Touring based
  "XR 750":         ["Sportster"],  // XR750 is racing Sportster derivative
};

// engine_size → family fallback when Model is absent
// Displacement alone is ambiguous across eras — we map to all plausible families
const ENGINE_SIZE_MAP = {
  "45 inch":  ["Flathead", "Sportster"],   // 45ci = WL flathead or early Sportster
  "45 INCH":  ["Flathead", "Sportster"],
  "61 inch":  ["Knucklehead"],
  "74 inch":  ["Panhead", "Shovelhead", "Touring"],  // 74ci spans multiple eras
  "80 inch":  ["Shovelhead", "Softail", "Dyna", "FXR"], // 80ci = Shovel + early Evo
  "83 inch":  ["Softail", "Dyna", "FXR"],
  "88 inch":  ["Softail", "Dyna", "Touring"],         // TC88
  "95 inch":  ["Softail", "Dyna", "Touring"],
  "107 inch": ["Softail", "Dyna", "Touring"],
  "124 inch": ["Softail", "Touring"],
  "1270cc":   ["Softail", "Sportster"],
  "883cc":    ["Sportster"],
  "900cc":    ["Sportster"],
  "1000cc":   ["Sportster"],
  "1100cc":   ["Sportster"],
  "1200cc":   ["Sportster"],
};

// Embedded year ranges in Model values
const MODEL_YEAR_BOUNDS = {
  "1965-1975 FLH": { min: 1965, max: 1975 },
  "86-95 ST":      { min: 1986, max: 1995 },
};


// ─── Name inference — keyword → family ───────────────────────────────────────
// Applied to rows with NO Model/Year/engine_size columns filled in.
// Order matters: more specific matches first (e.g. "Twin Cam" before "Cam").
// Each entry: { pattern: RegExp, families: string[] }
// A product can match multiple entries — all resolved families are unioned.

const NAME_INFERENCE_RULES = [
  // Vintage eras — highest specificity first
  { re: /knucklehead|knuck(?:le)?\b/i,          families: ["Knucklehead"] },
  { re: /panhead/i,                               families: ["Panhead"] },
  { re: /shovelhead|shovel\s*head/i,             families: ["Shovelhead"] },
  { re: /flathead|flat\s*head|servi[- ]?car/i,  families: ["Flathead"] },
  { re: /\bwl[hg]?\b|\bul[h]?\b/i,           families: ["Flathead"] },

  // Sportster / Ironhead
  { re: /ironhead/i,                             families: ["Sportster"] },
  { re: /\bxlch\b|\bxlh\b/i,                 families: ["Sportster"] },
  { re: /sportster/i,                            families: ["Sportster"] },
  { re: /\b(?:883|1000cc|1100cc|1200cc)\b/i,   families: ["Sportster"] },

  // Evolution (Big Twin) — comes before generic "evo" to avoid false positives
  { re: /\bevolution\b/i,                       families: ["Softail", "Dyna", "FXR", "Sportster"] },
  { re: /\bevo\b/i,                             families: ["Softail", "Dyna", "FXR"] },

  // Twin Cam
  { re: /twin\s*cam|\btc[- ]?88\b|\btc[- ]?96\b/i, families: ["Softail", "Dyna", "Touring"] },

  // Milwaukee Eight
  { re: /\bm8\b|milwaukee[- ]eight/i,          families: ["Softail", "Touring"] },

  // Modern families
  { re: /softail/i,                              families: ["Softail"] },
  { re: /\bdyna\b/i,                           families: ["Dyna"] },
  { re: /touring|\bflt\b|\bflh[xtcs]?\b/i,  families: ["Touring"] },
  { re: /\bfxr\b/i,                            families: ["FXR"] },
];

function inferFamiliesFromName(name, familyByName) {
  const ids = new Set();
  for (const rule of NAME_INFERENCE_RULES) {
    if (rule.re.test(name)) {
      for (const fname of rule.families) {
        const fid = familyByName[fname];
        if (fid) ids.add(fid);
      }
    }
  }
  return ids;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);

  const csvPath =
    process.env.CSV_PATH ||
    new URL(".", import.meta.url).pathname + "data/vtwin_catalog-fit.csv";

  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  console.log(`CSV rows: ${rows.length}`);

  // Load DB families
  const { rows: familyRows } = await pool.query(
    `SELECT id, name FROM harley_families ORDER BY name`
  );
  const familyByName = {};
  for (const f of familyRows) familyByName[f.name] = f.id;
  console.log(`Families in DB: ${Object.keys(familyByName).join(", ")}`);

  // model_year index: `${family_id}:${year}` → Set<model_year_id>
  const { rows: myRows } = await pool.query(`
    SELECT hmy.id AS myi, hmy.year, hm.family_id
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
  `);
  const myIndex = {};
  const allYearsByFamily = {};
  for (const r of myRows) {
    const key = `${r.family_id}:${r.year}`;
    if (!myIndex[key]) myIndex[key] = new Set();
    myIndex[key].add(parseInt(r.myi));
    if (!allYearsByFamily[r.family_id]) allYearsByFamily[r.family_id] = new Set();
    allYearsByFamily[r.family_id].add(parseInt(r.year));
  }

  // Existing fitment
  const { rows: existingRows } = await pool.query(
    `SELECT product_id, model_year_id FROM catalog_fitment_v2`
  );
  const existingSet = new Set(
    existingRows.map((r) => `${r.product_id}:${r.model_year_id}`)
  );
  console.log(`Existing catalog_fitment_v2 rows: ${existingSet.size}`);

  // VTwin products: vendor_sku → catalog_unified.id
  const { rows: cuRows } = await pool.query(
    `SELECT id, vendor_sku FROM catalog_unified WHERE source_vendor = 'VTWIN'`
  );
  const cuByVtwinSku = {};
  for (const r of cuRows) {
    if (r.vendor_sku) cuByVtwinSku[r.vendor_sku] = r.id;
  }
  console.log(`VTwin products in catalog_unified: ${Object.keys(cuByVtwinSku).length}`);

  // ── Process ─────────────────────────────────────────────────────────────────

  // ── Pass 1: OEM number collection (entire catalog, all 37K rows) ──────────
  // Completely independent of fitment — every row with oem_xref1/2/3 gets
  // those numbers merged into catalog_unified.oem_numbers regardless of whether
  // the row has any fitment data. This gives us 13,444 products / 16,395 OEM
  // numbers in the search index.
  const oemByProductId = {}; // product_id → Set<oem_number>

  for (const row of rows) {
    const sku = (row["sku"] || "").trim();
    const productId = cuByVtwinSku[sku];
    if (!productId) continue;

    const oemNums = [row["oem_xref1"], row["oem_xref2"], row["oem_xref3"]]
      .map(v => (v || "").toString().trim())
      .filter(v => v && v !== "nan" && v.length > 3);

    if (oemNums.length > 0) {
      if (!oemByProductId[productId]) oemByProductId[productId] = new Set();
      for (const n of oemNums) oemByProductId[productId].add(n);
    }
  }
  console.log(`OEM pass: ${Object.keys(oemByProductId).length} products with OEM numbers (${Object.values(oemByProductId).reduce((s,v)=>s+v.size,0)} total entries)`);

  // ── Pass 2: Fitment row generation ──────────────────────────────────────────
  let skipped_no_fitment  = 0;
  let skipped_no_product  = 0;
  let skipped_no_family   = 0;
  let already_exists      = 0;
  let warn_unknown_alias  = 0;

  const toInsert          = [];
  const flagOnlyProductIds = new Set();

  for (const row of rows) {
    const rawModel  = (row["Model"]       || "").trim() || null;
    const rawYear   = (row["Year"]        || "").toString().trim() || null;
    const rawEngine = (row["engine_size"] || "").trim() || null;
    // VTwin SKU in CSV is the raw vendor_sku (e.g. "10-0838")
    const sku = (row["sku"] || "").trim();

    // If all three explicit columns are empty, try name inference
    // before giving up — many VTwin products have era info only in the name
    if (!rawModel && !rawYear && !rawEngine) {
      const inferred = inferFamiliesFromName(row["name"] || "", familyByName);
      if (inferred.size === 0) {
        skipped_no_fitment++;
        continue;
      }
      // Has name-inferred families — fall through with empty rawModel/Year/engine
      // familyIds will be populated in the inference fallback below
    }

    const productId = cuByVtwinSku[sku];
    if (!productId) {
      skipped_no_product++;
      continue;
    }



    // ── Resolve family IDs ───────────────────────────────────────────────────

    const familyIds = new Set();
    let yearBoundsFromAlias = null; // { min, max } if embedded in Model value

    if (rawModel) {
      const resolved = MODEL_ALIAS_MAP[rawModel];
      if (!resolved) {
        console.warn(`  Unknown alias: "${rawModel}" on SKU ${sku}`);
        warn_unknown_alias++;
        // Fall through to engine_size fallback
      } else {
        for (const fname of resolved) {
          const fid = familyByName[fname];
          if (fid) familyIds.add(fid);
          else console.warn(`  Family not in DB: "${fname}" (alias "${rawModel}")`);
        }
        // Check for embedded year bounds in this alias
        if (MODEL_YEAR_BOUNDS[rawModel]) {
          yearBoundsFromAlias = MODEL_YEAR_BOUNDS[rawModel];
        }
      }
    }

    // engine_size fallback / supplement when no family resolved yet
    if (familyIds.size === 0 && rawEngine) {
      const engResolved = ENGINE_SIZE_MAP[rawEngine];
      if (engResolved) {
        for (const fname of engResolved) {
          const fid = familyByName[fname];
          if (fid) familyIds.add(fid);
        }
      }
    }

    // Name inference fallback — if Model/engine_size didn't resolve a family,
    // scan the product name for era keywords
    if (familyIds.size === 0) {
      const inferred = inferFamiliesFromName(row["name"] || "", familyByName);
      for (const fid of inferred) familyIds.add(fid);
    }

    if (familyIds.size === 0) {
      // Truly unresolvable — flag only
      flagOnlyProductIds.add(productId);
      skipped_no_family++;
      continue;
    }

    // ── Resolve year bounds ──────────────────────────────────────────────────
    // Priority: explicit Year column > embedded alias bounds > flag only
    //
    // IMPORTANT: name-inferred rows with no year → flag is_harley_fitment only.
    // Inserting all years for a family from a name match (e.g. every "Evolution"
    // product across all Softail/Dyna/FXR/Sportster years) produces millions of
    // low-quality fitment rows. The browse LEFT JOIN fallback handles these fine.

    let yearMin = null;
    let yearMax = null;
    let hasExplicitYear = false;

    if (rawYear && rawYear !== "nan" && rawYear !== "") {
      const y = parseInt(rawYear);
      if (!isNaN(y) && y > 1900 && y < 2030) {
        yearMin = y;
        yearMax = y;
        hasExplicitYear = true;
      }
    } else if (yearBoundsFromAlias) {
      yearMin = yearBoundsFromAlias.min;
      yearMax = yearBoundsFromAlias.max;
      hasExplicitYear = true;
    }

    // No explicit year → flag only, skip fitment rows
    if (!hasExplicitYear) {
      for (const fid of familyIds) flagOnlyProductIds.add(productId);
      continue;
    }

    // ── Expand to model_year_id rows ─────────────────────────────────────────

    let hasAnyRows = false;

    for (const familyId of familyIds) {
      let years;
      if (yearMin !== null) {
        years = [];
        for (let y = yearMin; y <= yearMax; y++) years.push(y);
      } else {
        years = [...(allYearsByFamily[familyId] || [])];
      }

      for (const year of years) {
        const myIds = myIndex[`${familyId}:${year}`];
        if (!myIds || myIds.size === 0) continue;

        for (const myId of myIds) {
          const key = `${productId}:${myId}`;
          if (existingSet.has(key)) { already_exists++; continue; }
          existingSet.add(key);
          toInsert.push({ product_id: productId, model_year_id: myId });
          hasAnyRows = true;
        }
      }
    }

    if (!hasAnyRows) {
      // Family resolved but no years matched — flag only
      flagOnlyProductIds.add(productId);
    }
  }

  const flagOnlyArr = [...flagOnlyProductIds];

  console.log(`\n── Pre-insert summary ──`);
  console.log(`  No fitment data (no name match):${skipped_no_fitment}`);
  console.log(`  SKU not in catalog_unified:     ${skipped_no_product}`);
  console.log(`  Unknown alias/no family:        ${skipped_no_family}`);
  console.log(`  Unknown alias warnings:         ${warn_unknown_alias}`);
  console.log(`  Already in catalog_fitment_v2:  ${already_exists}`);
  console.log(`  Flag-only (no year match):      ${flagOnlyArr.length}`);
  console.log(`  To insert:                      ${toInsert.length}`);
  console.log(`  Products with OEM numbers:      ${Object.keys(oemByProductId).length}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes. Re-run without --dry-run to commit.");
  console.log(`Would update OEM numbers on ${Object.keys(oemByProductId).length} products (${Object.values(oemByProductId).reduce((s,v)=>s+v.size,0)} total OEM numbers).`);
    console.log("\nSample of what would be inserted:");
    for (const r of toInsert.slice(0, 20)) {
      console.log(`  product_id=${r.product_id}  model_year_id=${r.model_year_id}`);
    }
    await pool.end();
    return;
  }

  // ── Batch insert ─────────────────────────────────────────────────────────────
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const vals  = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
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
  // Merge new OEM numbers into the existing oem_numbers text[] array.
  // Uses array_remove to dedupe then array_append — safe to run multiple times.
  const oemEntries = Object.entries(oemByProductId);
  console.log(`\nUpdating OEM numbers on ${oemEntries.length} products...`);
  let oemUpdated = 0;
  for (const [productId, numSet] of oemEntries) {
    const nums = [...numSet];
    // Merge: start with existing array, append new numbers not already present
    await pool.query(
      `UPDATE catalog_unified
       SET oem_numbers = (
         SELECT array_agg(DISTINCT n ORDER BY n)
         FROM unnest(
           COALESCE(oem_numbers, ARRAY[]::text[]) || $2::text[]
         ) AS n
       )
       WHERE id = $1`,
      [parseInt(productId), nums]
    );
    oemUpdated++;
    if (oemUpdated % 500 === 0) process.stdout.write(`\r  OEM updated ${oemUpdated} / ${oemEntries.length}`);
  }
  console.log(`\r  OEM numbers updated on ${oemUpdated} products.`);

  // Flag products with fitment rows
  const fitmentProductIds = [...new Set(toInsert.map((r) => r.product_id))];
  if (fitmentProductIds.length > 0) {
    await pool.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = ANY($1::int[])`,
      [fitmentProductIds]
    );
    console.log(`Updated is_harley_fitment = true on ${fitmentProductIds.length} fitment products.`);
  }

  // Flag model/engine-only products
  if (flagOnlyArr.length > 0) {
    await pool.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = ANY($1::int[])`,
      [flagOnlyArr]
    );
    console.log(`Flagged is_harley_fitment = true on ${flagOnlyArr.length} flag-only products.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
