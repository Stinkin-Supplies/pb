import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL || "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

const { rows: vendors } = await pool.query(`
  SELECT source_vendor, COUNT(*) AS cnt 
  FROM catalog_unified 
  GROUP BY source_vendor ORDER BY cnt DESC
`);
console.log("source_vendor values:");
vendors.forEach(r => console.log(`  "${r.source_vendor}": ${r.cnt}`));

const { rows: sample } = await pool.query(`
  SELECT id, sku, vendor_sku, source_vendor, internal_sku
  FROM catalog_unified WHERE internal_sku LIKE '%.w' LIMIT 5
`);
console.log("\nSample WPS rows:");
sample.forEach(r => console.log(`  sku="${r.sku}" vendor_sku="${r.vendor_sku}" source_vendor="${r.source_vendor}"`));

await pool.end();
