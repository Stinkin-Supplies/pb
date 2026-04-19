import pg from "pg";
import Typesense from "typesense";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const client = new Typesense.Client({
  nodes: [{ host: process.env.TYPESENSE_HOST, port: parseInt(process.env.TYPESENSE_PORT), protocol: process.env.TYPESENSE_PROTOCOL }],
  apiKey: "xyz", connectionTimeoutSeconds: 30,
});

const { rows } = await pool.query("SELECT * FROM catalog_unified WHERE is_active=true LIMIT 3");
const docs = rows.map(r => ({
  id: String(r.id), sku: r.sku || "", name: r.name || "", brand: r.brand || "",
  slug: r.slug || "", source_vendor: r.source_vendor || "",
  in_stock: !!r.in_stock, stock_quantity: r.stock_quantity || 0,
  sort_priority: r.sort_priority || 0, name_sort: (r.name || "").toLowerCase(),
  in_harddrive: !!r.in_harddrive, in_oldbook: !!r.in_oldbook,
  in_fatbook: !!r.in_fatbook, drag_part: !!r.drag_part,
  is_active: !!r.is_active, is_discontinued: !!r.is_discontinued,
  msrp: parseFloat(r.msrp) || 0, has_image: !!r.image_url,
  is_harley_fitment: !!r.is_harley_fitment,
}));

console.log("Testing with doc:", JSON.stringify(docs[0], null, 2));
const results = await client.collections("products").documents().import(docs, { action: "upsert" });
results.forEach(r => console.log(JSON.stringify(r)));
await pool.end();
