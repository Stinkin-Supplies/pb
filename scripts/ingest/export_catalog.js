/**
 * export_catalog.js
 * Exports catalog_unified to CSV for review
 * Run: node scripts/ingest/export_catalog.js
 */

import pg from "pg";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("Exporting catalog_unified...");
    
    const { rows } = await client.query(`
      SELECT
        id, sku, slug, source_vendor, product_code,
        name, brand, category,
        msrp, cost,
        in_stock, stock_quantity,
        image_url,
        is_harley_fitment, fitment_year_start, fitment_year_end,
        fitment_hd_families,
        in_oldbook, in_fatbook, drag_part,
        is_active, is_discontinued
      FROM catalog_unified
      ORDER BY source_vendor, brand, name
    `);

    // Build CSV
    const headers = [
      "id","sku","slug","source_vendor","product_code",
      "name","brand","category",
      "msrp","cost",
      "in_stock","stock_quantity",
      "has_image",
      "is_harley_fitment","fitment_year_start","fitment_year_end",
      "fitment_hd_families",
      "in_oldbook","in_fatbook","drag_part",
      "is_active","is_discontinued"
    ];

    const escape = (v) => {
      if (v === null || v === undefined) return "";
      const s = Array.isArray(v) ? v.join("|") : String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push([
        row.id, row.sku, row.slug, row.source_vendor, row.product_code,
        row.name, row.brand, row.category,
        row.msrp, row.cost,
        row.in_stock, row.stock_quantity,
        row.image_url ? "yes" : "no",
        row.is_harley_fitment, row.fitment_year_start, row.fitment_year_end,
        row.fitment_hd_families,
        row.in_oldbook, row.in_fatbook, row.drag_part,
        row.is_active, row.is_discontinued
      ].map(escape).join(","));
    }

    const outPath = "scripts/data/catalog_unified_export.csv";
    fs.writeFileSync(outPath, lines.join("\n"));
    console.log(`✅ Exported ${rows.length.toLocaleString()} rows to ${outPath}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
