// scripts/importWpsImages.ts
// ============================================================
// Reads /data/master-image-list.json and populates:
//   - catalog_media  (one row per image URL, with priority)
//   - catalog_products.has_images = true (after insert)
//
// Joins on sku — skips any SKU not found in catalog_products.
// Safe to re-run — uses ON CONFLICT DO NOTHING.
//
// Run with:
//   CATALOG_DATABASE_URL=... npx tsx scripts/importWpsImages.ts
// ============================================================

import fs   from "fs";
import path from "path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  max: 3,
});

const DATA_DIR  = path.join(process.cwd(), "data");
const BATCH_SIZE = 500;
const RETRY_LIMIT = 3;
const RETRY_DELAY = 2000;

function loadJson<T>(filename: string): T[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Array.isArray(parsed) ? parsed : parsed.data ?? [];
}

function cleanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:\/\//, "https://")
    .replace(
      /cdn\.wpsstatic\.com\/images\/full\//,
      "cdn.wpsstatic.com/1000_max/images/"
    );
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  console.log("Loading master-image-list.json...");
  const images = loadJson<any>("master-image-list.json");
  console.log(`  Images: ${images.length}`);

  // Also load items to get primary_item_image for priority ordering
  console.log("Loading master-item-list.json...");
  const items = loadJson<any>("master-item-list.json");
  const primaryMap = new Map<string, string>();
  for (const item of items) {
    const sku     = item.sku?.trim();
    const primary = cleanUrl(item.primary_item_image);
    if (sku && primary) primaryMap.set(sku, primary);
  }
  console.log(`  Primary images mapped: ${primaryMap.size}`);

  // Build sku → ordered image URL list (primary first, deduped)
  const imageMap = new Map<string, string[]>();
  for (const img of images) {
    const sku = img.sku?.trim();
    const url = cleanUrl(img.image_uri);
    if (!sku || !url) continue;
    if (!imageMap.has(sku)) imageMap.set(sku, []);
    const arr = imageMap.get(sku)!;
    if (!arr.includes(url)) arr.push(url);
  }

  // Ensure primary is first
  for (const [sku, primary] of primaryMap) {
    const arr      = imageMap.get(sku) ?? [];
    const filtered = arr.filter(u => u !== primary);
    imageMap.set(sku, [primary, ...filtered]);
  }

  console.log(`  SKUs with images: ${imageMap.size}`);

  // ── Fetch all WPS product id+sku from DB ──────────────────
  console.log("\nFetching WPS SKUs from catalog_products...");
  const client0 = await pool.connect();
  const { rows: productRows } = await client0.query(
    `SELECT id, sku FROM catalog_products WHERE source_vendor = 'wps'`
  );
  client0.release();

  const skuToId = new Map<string, number>();
  for (const row of productRows) skuToId.set(row.sku.trim(), row.id);
  console.log(`  WPS products in DB: ${skuToId.size}`);

  // ── Build flat list of (product_id, url, priority) ───────
  type MediaRow = { productId: number; url: string; priority: number };
  const rows: MediaRow[] = [];

  for (const [sku, urls] of imageMap) {
    const productId = skuToId.get(sku);
    if (!productId) continue;
    urls.forEach((url, i) => {
      rows.push({ productId, url, priority: i + 1 });
    });
  }

  console.log(`  Media rows to insert: ${rows.length}`);
  console.log(`  Batch size: ${BATCH_SIZE}\n`);

  // ── Insert in batches ─────────────────────────────────────
  let inserted  = 0;
  let skipped   = 0;
  const startTime = Date.now();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch   = rows.slice(i, i + BATCH_SIZE);
    let attempt   = 0;
    let success   = false;

    while (attempt < RETRY_LIMIT && !success) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const row of batch) {
          const res = await client.query(
            `INSERT INTO catalog_media (product_id, url, media_type, priority)
             VALUES ($1, $2, 'image', $3)
             ON CONFLICT DO NOTHING`,
            [row.productId, row.url, row.priority]
          );
          if (res.rowCount && res.rowCount > 0) inserted++;
          else skipped++;
        }

        await client.query("COMMIT");
        client.release();
        success = true;

      } catch (err: any) {
        await client.query("ROLLBACK").catch(() => {});
        client.release(true);
        attempt++;
        if (attempt >= RETRY_LIMIT) throw err;
        console.warn(`  ⚠ Batch error (attempt ${attempt}): ${err.message} — retrying...`);
        await sleep(RETRY_DELAY * attempt);
      }
    }

    const batchNum    = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    if (batchNum % 20 === 0 || batchNum === totalBatches) {
      const pct     = ((i + batch.length) / rows.length * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  Inserted ${inserted.toLocaleString()} rows... [${pct}% · ${elapsed}s]`);
    }
  }

  // ── Update has_images flag ────────────────────────────────
  console.log("\nUpdating has_images flag...");
  const client1 = await pool.connect();
  const flagRes = await client1.query(
    `UPDATE catalog_products cp
     SET has_images = true
     FROM (SELECT DISTINCT product_id FROM catalog_media) cm
     WHERE cm.product_id = cp.id
     AND cp.has_images = false
     AND cp.source_vendor = 'wps'`
  );
  client1.release();
  console.log(`  Flagged ${flagRes.rowCount} products as has_images = true`);

  // ── Final stats ───────────────────────────────────────────
  console.log("\n── Import complete ──────────────────────────────────");
  console.log(`  Inserted:  ${inserted.toLocaleString()} media rows`);
  console.log(`  Skipped:   ${skipped.toLocaleString()} (already existed)`);
  console.log(`  Duration:  ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Verify
  const client2 = await pool.connect();
  const { rows: stats } = await client2.query(
    `SELECT source_vendor,
            COUNT(*) as products,
            COUNT(*) FILTER (WHERE has_images = true) as with_images
     FROM catalog_products
     GROUP BY source_vendor
     ORDER BY products DESC`
  );
  client2.release();

  console.log("\n── Vendor image summary ─────────────────────────────");
  for (const row of stats) {
    const pct = Math.round(row.with_images / row.products * 100);
    console.log(`  ${row.source_vendor.padEnd(8)} ${row.with_images}/${row.products} (${pct}%)`);
  }

  await pool.end();
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
