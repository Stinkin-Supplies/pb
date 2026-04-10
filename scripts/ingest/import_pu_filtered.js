/**
 * import_pu_filtered.js
 * Re-imports PU products filtered to product codes A, E, C only.
 *
 * A = Street / Motorcycle
 * E = Drag Specialties
 * C = Common Parts (oils, tools, universal)
 *
 * Run: node scripts/ingest/import_pu_filtered.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import pg from "pg";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.resolve(__dirname, "../data/pu_pricefile/oldbook-fatbook");
const BASE_FILE = path.join(DATA_DIR, "BasePriceFile.csv");
const DEAL_FILE = path.join(DATA_DIR, "D00108_PriceFile.csv");
const BATCH_SIZE = 500;
const KEEP_CODES = new Set(["A", "E", "C"]);

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── HELPERS ───────────────────────────────────────────────────────────────────

function flt(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function int(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function bool(v) { const s = (v || "").trim().toUpperCase(); return s === "Y" || s === "T"; }
function dt(v) {
  if (!v || v.trim().length !== 8) return null;
  const s = v.trim();
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}
function avail(v) {
  if (!v || v.trim() === "N/A") return 0;
  if (v.trim() === "+") return 10;
  return int(v);
}
function str(v) { const s = (v || "").trim(); return s || null; }

// ── READ DEALER PRICES ────────────────────────────────────────────────────────

async function loadDealerPrices() {
  return new Promise((resolve, reject) => {
    const prices = new Map();
    if (!fs.existsSync(DEAL_FILE)) { resolve(prices); return; }
    fs.createReadStream(DEAL_FILE)
      .pipe(csv())
      .on("data", (row) => {
        const sku = str(row["Part Number"]);
        const price = flt(row["Your Dealer Price"]);
        if (sku && price !== null) prices.set(sku, price);
      })
      .on("end", () => { console.log(`  ✓ Loaded ${prices.size.toLocaleString()} dealer prices`); resolve(prices); })
      .on("error", reject);
  });
}

// ── READ ALL ROWS INTO MEMORY ─────────────────────────────────────────────────

async function loadBaseFile(dealerPrices) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(BASE_FILE)
      .pipe(csv())
      .on("data", (row) => {
        const code = str(row["Product Code"]);
        if (!KEEP_CODES.has(code)) return;
        const sku = str(row["Part Number"]);
        if (!sku) return;

        rows.push({
          sku,
          sku_punctuated:           str(row["Punctuated Part Number"]),
          vendor_part_number:       str(row["Vendor Part Number"]),
          vendor_part_punctuated:   str(row["Vendor Punctuated Part Number"]),
          part_status:              str(row["Part Status"]),
          name:                     str(row["Part Description"]) || sku,
          original_retail:          flt(row["Original Retail"]),
          msrp:                     flt(row["Current Suggested Retail"]),
          base_dealer_price:        flt(row["Base Dealer Price"]),
          your_dealer_price:        dealerPrices.get(sku) ?? null,
          hazardous_code:           str(row["Hazardous Code"]),
          truck_only:               bool(row["Truck Part Only"]),
          part_add_date:            dt(row["Part Add Date"]),
          warehouse_wi:             avail(row["WI Availability"]),
          warehouse_ny:             avail(row["NY Availability"]),
          warehouse_tx:             avail(row["TX Availability"]),
          warehouse_nv:             avail(row["NV Availability"]),
          warehouse_nc:             avail(row["NC Availability"]),
          total_qty:                avail(row["National Availability"]),
          trademark:                bool(row["Trademark"]),
          ad_policy:                bool(row["Ad Policy"]),
          price_changed_today:      str(row["Price Changed Today"]),
          uom:                      str(row["Unit of Measure"]),
          upc_code:                 str(row["UPC Code"]),
          brand:                    str(row["Brand Name"]),
          country_of_origin:        str(row["Country of Origin"]),
          product_code:             code,
          drag_part:                bool(row["Drag Part"]),
          weight:                   flt(row["Weight"]),
          closeout:                 bool(row["Closeout Catalog Indicator"]),
          no_ship_ca:               str(row["No Ship to CA"]) === "X",
          notes:                    str(row["Notes"]),
          pfas:                     str(row["PFAS"]),
          harmonized_us:            str(row["Harmonized US"]),
          height_in:                flt(row["Height(inches)"]),
          length_in:                flt(row["Length(inches)"]),
          width_in:                 flt(row["Width(inches)"]),
          dropship_fee:             flt(row["Dropship Fee"]),
          oldbook_code:             str(row["Oldbook Catalog Code"]),
          oldbook_year:             str(row["Oldbook Current Year"]),
          oldbook_year_page:        str(row["Oldbook Current Year Page"]),
          fatbook_code:             str(row["Fatbook Catalog Code"]),
          fatbook_year:             str(row["Fatbook Current Year"]),
          fatbook_year_page:        str(row["Fatbook Current Year Page"]),
        });
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────

async function migrateTable(client) {
  await client.query(`DROP TABLE IF EXISTS pu_products_filtered`);
  await client.query(`
    CREATE TABLE pu_products_filtered (
      id                     SERIAL PRIMARY KEY,
      sku                    VARCHAR(20)  NOT NULL UNIQUE,
      sku_punctuated         VARCHAR(20),
      vendor_part_number     VARCHAR(20),
      vendor_part_punctuated VARCHAR(20),
      part_status            VARCHAR(5),
      name                   TEXT NOT NULL,
      original_retail        NUMERIC(10,2),
      msrp                   NUMERIC(10,2),
      base_dealer_price      NUMERIC(10,2),
      your_dealer_price      NUMERIC(10,2),
      hazardous_code         VARCHAR(5),
      truck_only             BOOLEAN DEFAULT FALSE,
      part_add_date          DATE,
      warehouse_wi           INTEGER DEFAULT 0,
      warehouse_ny           INTEGER DEFAULT 0,
      warehouse_tx           INTEGER DEFAULT 0,
      warehouse_nv           INTEGER DEFAULT 0,
      warehouse_nc           INTEGER DEFAULT 0,
      total_qty              INTEGER DEFAULT 0,
      trademark              BOOLEAN DEFAULT FALSE,
      ad_policy              BOOLEAN DEFAULT FALSE,
      price_changed_today    VARCHAR(1),
      uom                    VARCHAR(10),
      upc_code               VARCHAR(20),
      brand                  VARCHAR(100),
      country_of_origin      VARCHAR(5),
      product_code           VARCHAR(5),
      drag_part              BOOLEAN DEFAULT FALSE,
      weight                 NUMERIC(8,2),
      closeout               BOOLEAN DEFAULT FALSE,
      no_ship_ca             BOOLEAN DEFAULT FALSE,
      notes                  TEXT,
      pfas                   VARCHAR(5),
      harmonized_us          VARCHAR(20),
      height_in              NUMERIC(8,3),
      length_in              NUMERIC(8,3),
      width_in               NUMERIC(8,3),
      dropship_fee           NUMERIC(8,2),
      oldbook_code           VARCHAR(5),
      oldbook_year           VARCHAR(5),
      oldbook_year_page      VARCHAR(10),
      fatbook_code           VARCHAR(5),
      fatbook_year           VARCHAR(5),
      fatbook_year_page      VARCHAR(10),
      imported_at            TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX idx_puf_brand        ON pu_products_filtered(brand);
    CREATE INDEX idx_puf_status       ON pu_products_filtered(part_status);
    CREATE INDEX idx_puf_product_code ON pu_products_filtered(product_code);
    CREATE INDEX idx_puf_drag         ON pu_products_filtered(drag_part);
    CREATE INDEX idx_puf_oldbook      ON pu_products_filtered(oldbook_code);
    CREATE INDEX idx_puf_fatbook      ON pu_products_filtered(fatbook_code);
    CREATE INDEX idx_puf_qty          ON pu_products_filtered(total_qty);
  `);
  console.log("  ✓ Table created\n");
}

// ── INSERT ────────────────────────────────────────────────────────────────────

const COLS = [
  "sku","sku_punctuated","vendor_part_number","vendor_part_punctuated",
  "part_status","name","original_retail","msrp","base_dealer_price","your_dealer_price",
  "hazardous_code","truck_only","part_add_date",
  "warehouse_wi","warehouse_ny","warehouse_tx","warehouse_nv","warehouse_nc","total_qty",
  "trademark","ad_policy","price_changed_today","uom","upc_code","brand",
  "country_of_origin","product_code","drag_part","weight","closeout",
  "no_ship_ca","notes","pfas","harmonized_us",
  "height_in","length_in","width_in","dropship_fee",
  "oldbook_code","oldbook_year","oldbook_year_page",
  "fatbook_code","fatbook_year","fatbook_year_page",
];

async function insertBatch(client, rows) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLS.length;
    COLS.forEach((col) => values.push(row[col] ?? null));
    return `(${COLS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  });
  const updateCols = COLS.filter((c) => c !== "sku");
  await client.query(
    `INSERT INTO pu_products_filtered (${COLS.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (sku) DO UPDATE SET
       ${updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(",\n       ")}`,
    values
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(BASE_FILE)) {
    console.error(`File not found: ${BASE_FILE}`);
    process.exit(1);
  }

  console.log("\n📦 PU Filtered Import (A=Street, E=Drag, C=Common)\n");

  console.log("Loading dealer prices...");
  const dealerPrices = await loadDealerPrices();

  console.log("Reading base file...");
  const allRows = await loadBaseFile(dealerPrices);
  const total   = allRows.length;
  console.log(`  ✓ ${total.toLocaleString()} products match filter (A/E/C)\n`);

  const client = await pool.connect();
  try {
    console.log("🔧 Creating table...");
    await migrateTable(client);

    const bar = new ProgressBar(total, "Importing");
    let done = 0;

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE);
      await insertBatch(client, batch);
      done += batch.length;
      bar.update(done);
    }

    bar.finish("Import complete");

    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(DISTINCT brand)                                 AS brands,
        COUNT(*) FILTER (WHERE product_code = 'A')           AS street,
        COUNT(*) FILTER (WHERE product_code = 'E')           AS drag,
        COUNT(*) FILTER (WHERE product_code = 'C')           AS common,
        COUNT(*) FILTER (WHERE your_dealer_price IS NOT NULL) AS with_price,
        COUNT(*) FILTER (WHERE total_qty > 0)                AS in_stock,
        COUNT(*) FILTER (WHERE part_status = 'S')            AS standard,
        COUNT(*) FILTER (WHERE part_status = 'D')            AS discontinued,
        COUNT(*) FILTER (WHERE drag_part = TRUE)             AS drag_flag
      FROM pu_products_filtered
    `);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Import complete!

  Total products:       ${Number(s.total).toLocaleString()}
  Brands:               ${s.brands}
  Street (A):           ${Number(s.street).toLocaleString()}
  Drag Specialties (E): ${Number(s.drag).toLocaleString()}
  Common Parts (C):     ${Number(s.common).toLocaleString()}

  With your price:      ${Number(s.with_price).toLocaleString()}
  In stock:             ${Number(s.in_stock).toLocaleString()}
  Standard status:      ${Number(s.standard).toLocaleString()}
  Discontinued:         ${Number(s.discontinued).toLocaleString()}
  Drag part flag:       ${Number(s.drag_flag).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
