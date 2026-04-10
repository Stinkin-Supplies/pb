/**
 * download_pu_pricefile.js
 * Downloads a fresh PU price file filtered to Oldbook + Fatbook catalogs only.
 *
 * Oldbook  = Harley-Davidson parts
 * Fatbook  = Metric street parts
 *
 * Run: node scripts/ingest/download_pu_pricefile.js
 * Output: scripts/data/pu_pricefile/pu-oldbook-fatbook.zip
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.resolve(__dirname, "../data/pu_pricefile");
const OUT_FILE  = path.join(OUT_DIR, "pu-oldbook-fatbook.zip");

const DEALER   = process.env.PARTS_UNLIMITED_DEALER_NUMBER;
const USERNAME = process.env.PARTS_UNLIMITED_USERNAME;
const PASSWORD = process.env.PARTS_UNLIMITED_PASSWORD;

if (!DEALER || !USERNAME || !PASSWORD) {
  console.error("Missing PU credentials in .env.local");
  process.exit(1);
}

const credentials = Buffer.from(`${DEALER}/${USERNAME}:${PASSWORD}`).toString("base64");

const body = JSON.stringify({
  dealerCodes: [DEALER],
  headersPrepended: true,
  auxillaryColumns: [
    "BRAND_NAME",
    "COUNTRY_OF_ORIGIN",
    "WEIGHT",
    "HEIGHT",
    "LENGTH",
    "WIDTH",
    "DROPSHIP_FEE",
    "UPC_CODE",
    "PRODUCT_CODE",
    "DRAG_PART",
    "CLOSEOUT_CATALOG_INDICATOR",
    "PFAS",
    "HARMONIZED_US",
  ],
  attachingCatalogs: [
    "OLDBOOK",
    "OLDBOOK_MIDYEAR",
    "FATBOOK",
    "FATBOOK_MIDYEAR",
  ],
});

const options = {
  hostname: "dealer.parts-unlimited.com",
  path: "/api/quotes/v2/pricefile",
  method: "POST",
  headers: {
    "Authorization": `Basic ${credentials}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  },
};

console.log(`\n📦 Requesting PU price file (Oldbook + Fatbook)...`);
console.log(`   Dealer:  ${DEALER}`);
console.log(`   Output:  ${OUT_FILE}\n`);

const file = fs.createWriteStream(OUT_FILE);
let bar = null;
let downloaded = 0;

const req = https.request(options, (res) => {
  if (res.statusCode !== 200) {
    console.error(`✗ HTTP ${res.statusCode}: ${res.statusMessage}`);
    file.close();
    fs.unlinkSync(OUT_FILE);
    process.exit(1);
  }

  const total = parseInt(res.headers["content-length"] || "0", 10);

  if (total) {
    const totalMB = (total / 1024 / 1024).toFixed(1);
    console.log(`   File size: ~${totalMB} MB\n`);
    bar = new ProgressBar(total, "Downloading");
  } else {
    console.log("   (file size unknown — streaming...)\n");
  }

  res.on("data", (chunk) => {
    downloaded += chunk.length;
    if (bar) {
      bar.update(downloaded, `${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB`);
    } else {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(`   ${(downloaded / 1024 / 1024).toFixed(1)} MB downloaded...`);
    }
  });

  res.pipe(file);

  file.on("finish", () => {
    file.close();
    if (bar) bar.finish("Download complete");
    const sizeMB = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
    console.log(`\n✅ ${sizeMB} MB saved to: ${OUT_FILE}`);
    console.log(`\nNext: unzip and re-import`);
    console.log(`  unzip ${OUT_FILE} -d scripts/data/pu_pricefile/oldbook-fatbook/`);
  });
});

req.on("error", (err) => {
  console.error(`\n✗ Request error: ${err.message}`);
  file.close();
  if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);
  process.exit(1);
});

req.write(body);
req.end();
