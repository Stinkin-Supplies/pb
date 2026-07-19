/**
 * import_pu_manual_fitment.mjs
 *
 * Three passes:
 *   Pass 1 - OEM numbers: entire catalog -> merge into oem_numbers[]
 *   Pass 2 - Auto-extract: name/notes/features -> Grade A (family+year) and Grade C (family only)
 *   Pass 3 - Manual review: pu_fitment_reviewed.csv -> Grade B rows + OEM numbers from review column
 *
 * N/F (Not For) parsing:
 *   Model code after N/F -> exclude those model_year_ids from the insert
 *   Feature note after N/F (HEATED GRIPS, TBW, FAIRING LOWERS) -> ignored
 *
 * Year-only fallback (year found but no family resolved):
 *   Default to Big Twin (Softail + Dyna + Touring + FXR)
 *   If subcategory/name signals XL/Sportster -> also add Sportster
 *
 * Usage:
 *   CSV_PATH=scripts/data/pu_catalog-FIT.csv \
 *   REVIEWED_PATH=scripts/data/pu_fitment_reviewed.csv \
 *   node scripts/ingest/import_pu_manual_fitment.mjs [--dry-run]
 */

import fs from "fs";
import { parse } from "csv-parse/sync";
import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

const pool = new pg.Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
  max: 5,
});

// Model code -> family
const MODEL_CODE_TO_FAMILY = {
  // Touring — specific model codes only (no short FL/RG/SG/RK — too ambiguous in PU names)
  FLHR:"Touring",FLHRC:"Touring",FLHT:"Touring",FLHX:"Touring",
  FLTR:"Touring",FLTRX:"Touring",FLT:"Touring",FLH:"Touring",
  FLHC:"Touring",FLHCS:"Touring",FLHRI:"Touring",FLHRS:"Touring",
  FLRT:"Touring",FLRTK:"Touring",
  // Softail — specific codes only (no ST/FB — match too many unrelated words)
  FXST:"Softail",FXSTB:"Softail",FXSTC:"Softail",FXSTS:"Softail",
  FXCW:"Softail",FXWG:"Softail",FXFB:"Softail",FXBB:"Softail",
  FXBR:"Softail",FXLRS:"Softail",FXLRST:"Softail",
  FLST:"Softail",FLSTC:"Softail",FLSTF:"Softail",FLSTN:"Softail",
  FLSL:"Softail",FLSB:"Softail",FLSS:"Softail",
  SOFTAIL:"Softail",SFTL:"Softail",
  // Dyna
  FXD:"Dyna",FXDL:"Dyna",FXDB:"Dyna",FXDC:"Dyna",
  FXDF:"Dyna",FXDWG:"Dyna",FXDX:"Dyna",FLD:"Dyna",DYNA:"Dyna",
  // FXR
  FXR:"FXR",FXRS:"FXR",FXRT:"FXR",FXLR:"FXR",FXRSP:"FXR",
  // Sportster — XL alone kept (common in PU names as fitment signal)
  XL883:"Sportster",XL1200:"Sportster",
  XLCH:"Sportster",XLH:"Sportster",XL:"Sportster",
  SPORTSTER:"Sportster",IRONHEAD:"Sportster",HUGGER:"Sportster",
  XLC:"Sportster",XLR:"Sportster",
  // Vintage
  KNUCKLEHEAD:"Knucklehead",PANHEAD:"Panhead",
  SHOVELHEAD:"Shovelhead",FLATHEAD:"Flathead",
  // Trike / V-Rod / Revolution Max
  TRIGLIDE:"Trike",TRIKE:"Trike",
  VROD:"V-Rod",VRSC:"V-Rod",
  "PAN AMERICA":"Revolution Max",RA1250:"Revolution Max",
  // Multi-family — only unambiguous full names kept for auto-extract
  // BT/TC/FX/ST/FB/RG/SG/RK removed — too ambiguous, handled in REVIEW_NORMALIZE only
  "BIG TWIN":"multi-bt",BIGTWIN:"multi-bt",
  "TWIN CAM":"multi-tc",TWINCAM:"multi-tc",
  EVOLUTION:"multi-evo",
  "MILWAUKEE EIGHT":"multi-m8",M8:"multi-m8",
  V80:"multi-evo",
};

const MULTI_EXPAND = {
  "multi-bt":  ["Softail","Dyna","Touring","FXR"],
  "multi-fx":  ["Softail","Dyna","FXR"],
  "multi-tc":  ["Softail","Dyna","Touring"],
  "multi-evo": ["Softail","Dyna","FXR","Sportster"],
  "multi-m8":  ["Softail","Touring"],
};

// Manual review normalization
const REVIEW_NORMALIZE = {
  SOFTAIL:["Softail"],"S/TAIL":["Softail"],SFTL:["Softail"],
  DUECE:["Softail"],"FAT BOY":["Softail"],ROCKER:["Softail"],
  FXST:["Softail"],FXSTD:["Softail"],FXFB:["Softail"],
  FXBR:["Softail"],"FXLRS/FXLRST":["Softail"],FLS:["Softail"],
  FLSB:["Softail"],FLSL:["Softail"],FLSS:["Softail"],
  FXS:["Softail"],"FXS,FLS":["Softail"],"FXS/T":["Softail"],
  "M8 SOFTAIL":["Softail"],"12-17 FLS":["Softail"],
  TOURING:["Touring"],"DRESSER/ TOURING":["Touring"],
  "DRESSER, TOURING":["Touring"],POLICE:["Touring"],
  "ROAD KING":["Touring"],STREETGLIDE:["Touring"],
  FL:["Touring"],FLH:["Touring"],FLT:["Touring"],
  FLHRI:["Touring"],FLHRS:["Touring"],FLHX:["Touring"],
  FLHT:["Touring"],FLHTCI:["Touring"],FLHTK:["Touring"],
  "FLHTCUTG/FLRT":["Touring"],FLRT:["Touring"],FLRTK:["Touring"],
  FLTRX:["Touring"],"FLTRX FLTRU RG3":["Touring"],
  "FLTRX FLTRU RG4":["Touring"],FLTCU:["Touring"],
  "FLT, FLST":["Touring","Softail"],FLHC:["Touring"],
  "FLHC,FLDE":["Touring"],RG21:["Touring"],
  DYNA:["Dyna"],FXD:["Dyna"],FXDB:["Dyna"],FXDF:["Dyna"],
  FXDLS:["Dyna"],FXDS:["Dyna"],FLD:["Dyna"],
  FXR:["FXR"],FXRSP:["FXR"],
  XL:["Sportster"],"XL, SPORTSTER":["Sportster"],XL1200:["Sportster"],
  XLC:["Sportster"],XLR:["Sportster"],HUGGER:["Sportster"],
  SHOVELHEAD:["Shovelhead"],
  TRIGLIDE:["Trike"],TRIKE:["Trike"],
  "V-ROD":["V-Rod"],VROD:["V-Rod"],VRSC:["V-Rod"],
  "11804, VROD":["V-Rod"],
  "PAN AMERICA":["Revolution Max"],RA1250:["Revolution Max"],
  "BIG TWIN":["Softail","Dyna","Touring","FXR"],
  FX:["Softail","Dyna","FXR"],
  "TWIN CAM":["Softail","Dyna","Touring"],
  "TWIN CAM 96 INCH, 103 INCH":["Softail","Dyna","Touring"],
  "TWIN CAM, 88 INCH":["Softail","Dyna","Touring"],
  EVOLUTION:["Softail","Dyna","FXR","Sportster"],
  M8:["Softail","Touring"],
  "80 INCH":["Softail","Dyna","FXR"],
  "88 INCH":["Softail","Dyna","Touring"],
  "95 INCH":["Softail","Dyna","Touring"],
  "106 INCH":["Softail","Touring"],
  ALL:["flag_only"],EFI:["flag_only"],CVO:["flag_only"],
  BUELL:["skip"],"RM-125":["skip"],XR:["skip"],FRT:["skip"],
};

// N/F feature notes to ignore (not model exclusions)
const NF_IGNORE_RE = /heated\s*grips?|tbw|fairing\s*lower|inductive\s*charg|forward\s*contr|saddlebag\s*guard|lower\s*fairings?|tornado\s*turbo|springer|low\s*model|cvo\s*model|radio|efi\s*tuner|fork\s*lock/i;

const CODES_SORTED = Object.keys(MODEL_CODE_TO_FAMILY).sort((a,b) => b.length - a.length);
const modelRe = new RegExp(CODES_SORTED.map(c => `\\b${c.replace(/ /g,"\\s+")}\\b`).join("|"), "gi");
const HD_OEM_RE = /\b\d{4,6}-\d{2}[A-Z]?[A-Z]?\b/g;
const HD_OEM_FIELD_RE = /^\d{4,6}-\d{2}[A-Z]?[A-Z]?$/;

const YR_PARTS = [
  String.raw`(?:19|20)\d{2}-(?:19|20)\d{2}`,
  String.raw`(?:19|20)\d{2}-UP`,
  String.raw`\b[89]\d-\d{2}\b`,
  String.raw`\b0[0-9]-\d{2}\b`,
  String.raw`\b1[0-9]-\d{2}\b`,
  String.raw`\b2[0-5]-\d{2}\b`,
  String.raw`\b[89]\d-UP\b`,
  String.raw`\b0[0-9]-UP\b`,
  String.raw`\b1[0-9]-UP\b`,
];
const YR_RE = new RegExp(`(?<!\\d)(${YR_PARTS.join("|")})`, "i");

function expandYr(yy) {
  const n = parseInt(yy);
  return n <= 30 ? 2000 + n : 1900 + n;
}

function extractYearRange(text) {
  const m = YR_RE.exec(String(text || ""));
  if (!m) return [null, null];
  const token = m[0].replace(/^['`]/, "");
  const upM   = token.match(/^(\d{2,4})-UP$/i);
  const rngM  = token.match(/^(\d{2,4})-(\d{2,4})$/);
  if (upM) {
    const a = upM[1];
    return [a.length===2 ? expandYr(a) : parseInt(a), 2025];
  }
  if (rngM) {
    const a=rngM[1], b=rngM[2];
    let ymin = a.length===2 ? expandYr(a) : parseInt(a);
    let ymax = b.length===2 ? expandYr(b) : parseInt(b);
    if (ymin > ymax) ymax += 100;
    if (ymin < 1930 || ymax > 2026 || ymax-ymin > 60) return [null,null];
    return [ymin, ymax];
  }
  return [null, null];
}

function extractFamilies(text, familyByName) {
  const families = new Set();
  let match;
  modelRe.lastIndex = 0;
  while ((match = modelRe.exec(text)) !== null) {
    const code = match[0].toUpperCase().replace(/\s+/g,"");
    const fam  = MODEL_CODE_TO_FAMILY[code] || MODEL_CODE_TO_FAMILY[match[0].toUpperCase()];
    if (!fam) continue;
    for (const f of (MULTI_EXPAND[fam] || [fam])) {
      if (familyByName[f]) families.add(f);
    }
  }
  return families;
}

function extractExclusions(text) {
  const excluded = [];
  const nfRe = /\bN\/F\s+([A-Z0-9/,\s-]{2,40}?)(?=\s*[€;,\n]|$)/gi;
  let m;
  while ((m = nfRe.exec(text)) !== null) {
    const target = m[1].trim();
    if (NF_IGNORE_RE.test(target)) continue;
    for (const part of target.split(/[/,\s]+/)) {
      const code = part.trim().toUpperCase();
      if (code.length >= 2 && /^F[LX]/.test(code)) excluded.push(code);
    }
  }
  return excluded;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);

  const csvPath      = process.env.CSV_PATH      || "scripts/data/pu_catalog-FIT.csv";
  const reviewedPath = process.env.REVIEWED_PATH || "scripts/data/pu_fitment_reviewed.csv";

  const rows     = parse(fs.readFileSync(csvPath,      "utf8"), {columns:true,skip_empty_lines:true,relax_quotes:true});
  const reviewed = parse(fs.readFileSync(reviewedPath, "utf8"), {columns:true,skip_empty_lines:true,relax_quotes:true});
  console.log(`CSV rows: ${rows.length}  Reviewed: ${reviewed.length}`);

  const { rows: famRows } = await pool.query(`SELECT id, name FROM harley_families`);
  const familyByName = {};
  for (const f of famRows) familyByName[f.name] = f.id;
  console.log(`Families: ${Object.keys(familyByName).join(", ")}`);

  const { rows: myRows } = await pool.query(`
    SELECT hmy.id AS myi, hmy.year, hm.family_id, hm.model_code
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
  `);
  const myIndex       = {};
  const myByModelCode = {};
  const allYearsByFam = {};
  for (const r of myRows) {
    const fkey = `${r.family_id}:${r.year}`;
    if (!myIndex[fkey])       myIndex[fkey]       = new Set();
    myIndex[fkey].add(parseInt(r.myi));
    const ckey = `${r.model_code}:${r.year}`;
    if (!myByModelCode[ckey]) myByModelCode[ckey] = new Set();
    myByModelCode[ckey].add(parseInt(r.myi));
    if (!allYearsByFam[r.family_id]) allYearsByFam[r.family_id] = new Set();
    allYearsByFam[r.family_id].add(parseInt(r.year));
  }

  const { rows: existRows } = await pool.query(`SELECT product_id, model_year_id FROM catalog_fitment_v2`);
  const existingSet = new Set(existRows.map(r => `${r.product_id}:${r.model_year_id}`));
  console.log(`Existing fitment rows: ${existingSet.size}`);

  const { rows: cuRows } = await pool.query(`SELECT id, sku, vendor_sku FROM catalog_unified WHERE source_vendor = 'PU'`);
  const cuBySku = {}, cuByVendor = {};
  for (const r of cuRows) {
    // Store both raw and dash-stripped versions
    cuBySku[String(r.sku)] = r.id;
    cuBySku[String(r.sku).replace(/-/g,"")] = r.id;
    if (r.vendor_sku) cuByVendor[String(r.vendor_sku)] = r.id;
  }
  console.log(`PU products in catalog_unified: ${Object.keys(cuBySku).length}`);

  // Build lookup from CSV rows using sku_punctuated (preserves leading zeros)
  // sku column drops leading zeros when read as number; sku_punctuated keeps them
  const csvSkuToPunct = {};  // populated during row processing

  function resolvePid(sku, skuPunct) {
    // Try sku_punctuated (dashes stripped) first — most reliable
    if (skuPunct) {
      const p = String(skuPunct).replace(/-/g,"").trim();
      if (cuBySku[p]) return cuBySku[p];
    }
    const s = String(sku||"").trim();
    return cuBySku[s] || cuBySku[s.replace(/-/g,"")] || cuByVendor[s] || null;
  }

  // Pass 1: OEM numbers
  const oemByPid = {};
  for (const row of rows) {
    const pid = resolvePid(row.sku, row.sku_punctuated);
    if (!pid) continue;
    const full = [row.name,row.notes,row.features,row.oem_part_number].map(v=>String(v||"")).join(" ");
    HD_OEM_RE.lastIndex = 0;
    const nums = [...full.matchAll(HD_OEM_RE)].map(m=>m[0]);
    if (nums.length) {
      if (!oemByPid[pid]) oemByPid[pid] = new Set();
      for (const n of nums) oemByPid[pid].add(n);
    }
  }
  console.log(`OEM pass: ${Object.keys(oemByPid).length} products with OEM numbers (${Object.values(oemByPid).reduce((s,v)=>s+v.size,0)} total)`);

  // Pass 2: Auto-extract
  const toInsert = [];
  const flagOnly  = new Set();
  let   skip_pid=0, skip_sig=0, already=0, auto_a=0, auto_c=0;

  function insertFamilyYears(pid, fname, ymin, ymax, excludedMyIds) {
    const fid = familyByName[fname];
    if (!fid) return;
    for (let y=ymin; y<=ymax; y++) {
      const ids = myIndex[`${fid}:${y}`];
      if (!ids) continue;
      for (const mid of ids) {
        if (excludedMyIds && excludedMyIds.has(mid)) continue;
        const key = `${pid}:${mid}`;
        if (existingSet.has(key)) { already++; continue; }
        existingSet.add(key);
        toInsert.push({product_id: pid, model_year_id: mid});
      }
    }
  }

  for (const row of rows) {
    const pid = resolvePid(row.sku, row.sku_punctuated);
    if (!pid) { skip_pid++; continue; }

    const name=String(row.name||""), notes=String(row.notes||""), features=String(row.features||"");
    const full = `${name} ${notes} ${features}`;

    const families = extractFamilies(full, familyByName);
    const [ymin, ymax] = extractYearRange(full);
    const exclusions   = extractExclusions(`${notes} ${name}`);

    // Build excluded model_year_ids
    const excludedMyIds = new Set();
    if (exclusions.length > 0) {
      const ylo = ymin || 1930, yhi = ymax || 2025;
      for (const code of exclusions) {
        for (let y=ylo; y<=yhi; y++) {
          const ids = myByModelCode[`${code}:${y}`];
          if (ids) for (const id of ids) excludedMyIds.add(id);
        }
      }
    }

    if (families.size === 0 && ymin === null) { skip_sig++; continue; }

    if (families.size === 0 && ymin !== null) {
      // Year found but no family resolved -> flag only.
      flagOnly.add(pid);
      auto_c++;
      continue;
    }

    if (families.size > 0 && ymin === null) {
      flagOnly.add(pid); auto_c++; continue;
    }

    // Grade A — but if families came ONLY from broad multi-family codes
    // (BIG TWIN, TWIN CAM, EVOLUTION, M8) with no specific model code,
    // flag only. Broad codes across long year spans = too many low-quality rows.
    // Specific codes (FLHT, FXD, XL883 etc) always generate real fitment rows.
    {
      const BROAD_MULTI = new Set(["multi-bt","multi-tc","multi-evo","multi-m8"]);
      const SPECIFIC_FAM_CODES = new Set([
        "FLHR","FLHRC","FLHT","FLHX","FLTR","FLTRX","FLT","FLH",
        "FLHC","FLHCS","FLHRI","FLHRS","FLRT","FLRTK",
        "FXST","FXSTB","FXSTC","FXSTS","FXCW","FXWG","FXFB","FXBB",
        "FXBR","FXLRS","FXLRST","FLST","FLSTC","FLSTF","FLSTN","FLSL","FLSB","FLSS",
        "SOFTAIL","SFTL","FXD","FXDL","FXDB","FXDC","FXDF","FXDWG","FXDX","FLD","DYNA",
        "FXR","FXRS","FXRT","FXLR","FXRSP",
        "XL883","XL1200","XLCH","XLH","XL","SPORTSTER","IRONHEAD",
        "KNUCKLEHEAD","PANHEAD","SHOVELHEAD","FLATHEAD",
        "TRIGLIDE","TRIKE","VROD","VRSC",
      ]);
      let hasSpecific = false;
      modelRe.lastIndex = 0;
      let mm;
      while ((mm = modelRe.exec(full)) !== null) {
        const c = mm[0].toUpperCase().replace(/\s+/g,"");
        if (SPECIFIC_FAM_CODES.has(c)) { hasSpecific = true; break; }
      }
      if (!hasSpecific) {
        // Only broad codes matched -> flag only
        flagOnly.add(pid);
        auto_c++;
        continue;
      }
    }

    // Grade A — specific model code + year -> real fitment rows
    for (const f of families) insertFamilyYears(pid, f, ymin, ymax, excludedMyIds);
    auto_a++;
  }

  // Pass 3: Manual review
  let rev_imp=0, rev_flag=0, rev_oem=0, rev_skip=0;

  for (const row of reviewed) {
    // The families column has no header in the CSV — csv-parse gives it key ""
    // Also handle "Unnamed: 3" (pandas default) and explicit "families"/"col3"
    const raw = String(row[""]||row["Unnamed: 3"]||row["col3"]||row["families"]||row["family"]||"").trim();
    const pid = resolvePid(row.sku, row.sku_punctuated);
    if (!pid) continue;

    // OEM number in review column
    if (HD_OEM_FIELD_RE.test(raw)) {
      if (!oemByPid[pid]) oemByPid[pid] = new Set();
      oemByPid[pid].add(raw);
      rev_oem++;
      continue;
    }

    if (!raw || raw.toLowerCase()==="nan") continue;

    const normKey = raw.toUpperCase().replace(/['"]/g,"").trim();
    let families  = REVIEW_NORMALIZE[normKey] || REVIEW_NORMALIZE[raw.toUpperCase()];

    if (!families) {
      const fam = MODEL_CODE_TO_FAMILY[normKey];
      if (!fam) { rev_skip++; continue; }
      families = MULTI_EXPAND[fam] || [fam];
    }

    if (families.includes("skip"))      { rev_skip++; continue; }
    if (families.includes("flag_only")) { flagOnly.add(pid); rev_flag++; continue; }

    const [ymin, ymax] = extractYearRange(String(row.year_range||""));
    if (ymin === null) { flagOnly.add(pid); rev_flag++; continue; }

    for (const f of families) insertFamilyYears(pid, f, ymin, ymax, null);
    rev_imp++;
  }

  console.log(`\n── Pre-insert summary ──`);
  console.log(`  SKU not in catalog_unified:    ${skip_pid}`);
  console.log(`  No fitment signal:             ${skip_sig}`);
  console.log(`  Auto Grade A (family+year):    ${auto_a}`);
  console.log(`  Auto Grade C (family only):    ${auto_c}`);
  console.log(`  Review imported:               ${rev_imp}`);
  console.log(`  Review flag-only:              ${rev_flag}`);
  console.log(`  Review OEM numbers:            ${rev_oem}`);
  console.log(`  Review skipped:                ${rev_skip}`);
  console.log(`  Already in catalog_fitment_v2: ${already}`);
  console.log(`  Flag-only products:            ${flagOnly.size}`);
  console.log(`  To insert:                     ${toInsert.length}`);
  console.log(`  Products with OEM numbers:     ${Object.keys(oemByPid).length}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes.");
    console.log(`Would update OEM numbers on ${Object.keys(oemByPid).length} products (${Object.values(oemByPid).reduce((s,v)=>s+v.size,0)} total).`);
    console.log("\nSample inserts:");
    for (const r of toInsert.slice(0,20)) console.log(`  product_id=${r.product_id}  model_year_id=${r.model_year_id}`);
    await pool.end(); return;
  }

  // Batch insert
  const BATCH = 500;
  let done = 0;
  for (let i=0; i<toInsert.length; i+=BATCH) {
    const batch = toInsert.slice(i, i+BATCH);
    const vals  = batch.map((_,j)=>`($${j*2+1},$${j*2+2})`).join(",");
    const flat  = batch.flatMap(r=>[r.product_id, r.model_year_id]);
    await pool.query(`INSERT INTO catalog_fitment_v2 (product_id,model_year_id) VALUES ${vals} ON CONFLICT DO NOTHING`, flat);
    done += batch.length;
    process.stdout.write(`\r  Inserted ${done} / ${toInsert.length}`);
  }
  console.log(`\nDone. ${toInsert.length} rows inserted.`);

  // OEM update
  const oemEntries = Object.entries(oemByPid);
  if (oemEntries.length > 0) {
    console.log(`\nUpdating OEM numbers on ${oemEntries.length} products...`);
    let oemDone = 0;
    for (const [pid, numSet] of oemEntries) {
      await pool.query(
        `UPDATE catalog_unified SET oem_numbers=(SELECT array_agg(DISTINCT n ORDER BY n) FROM unnest(COALESCE(oem_numbers,ARRAY[]::text[])||$2::text[]) AS n) WHERE id=$1`,
        [parseInt(pid), [...numSet]]
      );
      oemDone++;
      if (oemDone % 500 === 0) process.stdout.write(`\r  OEM updated ${oemDone}/${oemEntries.length}`);
    }
    console.log(`\r  OEM numbers updated on ${oemDone} products.`);
  }

  // is_harley_fitment flags
  const fitPids = [...new Set(toInsert.map(r=>r.product_id))];
  if (fitPids.length > 0) {
    await pool.query(`UPDATE catalog_unified SET is_harley_fitment=true WHERE id=ANY($1::int[])`, [fitPids]);
    console.log(`Updated is_harley_fitment=true on ${fitPids.length} fitment products.`);
  }
  const flagArr = [...flagOnly];
  if (flagArr.length > 0) {
    await pool.query(`UPDATE catalog_unified SET is_harley_fitment=true WHERE id=ANY($1::int[])`, [flagArr]);
    console.log(`Flagged is_harley_fitment=true on ${flagArr.length} flag-only products.`);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
