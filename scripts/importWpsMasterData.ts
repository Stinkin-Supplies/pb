// scripts/importWpsMasterData.ts
// ============================================================
// Reads /data/master-item-list.json + /data/master-image-list.json
// and patches the self-hosted catalog DB with:
//   - Permanent image URLs (from master-image-list)
//   - Product descriptions (from master-item-list.product_description)
//   - Brand, category, pricing, dimensions, status
//
// Run with:
//   npx tsx scripts/importWpsMasterData.ts
//
// Safe to re-run — uses UPDATE with COALESCE (won't overwrite good data).
// Resumes automatically — skips SKUs already patched in this run.
// ============================================================

import fs   from "fs";
import path from "path";
import { Pool } from "pg";

// ── DB connection ─────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false },

  // Keep the connection alive over long imports
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,

  // Connection timeout settings
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis:       60_000,

  // Pool size — single worker is fine for sequential patching
  max: 3,
});

// ── Config ────────────────────────────────────────────────────
const BATCH_SIZE   = 500;   // rows per transaction — safe for long-running connections
const RETRY_LIMIT  = 3;     // retries per batch on connection error
const RETRY_DELAY  = 2000;  // ms between retries

// ── Load master files ─────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");

function loadJson<T>(filename: string): T[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Master file not found: ${filePath}`);
  }
  const raw    = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.data ?? [];
}

// ── Helpers ───────────────────────────────────────────────────
function mapStatus(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "NLA")      return "discontinued";
  if (s === "INACTIVE") return "discontinued";
  return "active"; // ACTIVE, CLOSEOUT, etc.
}

function cleanImageUrl(url: string | null | undefined): string | null {
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

// ── Patch a single batch with retry ──────────────────────────
async function patchBatch(
  batch: any[],
  imageMap: Map<string, string[]>
): Promise<{ updated: number; notFound: number; skipped: number }> {
  let attempt = 0;

  while (attempt < RETRY_LIMIT) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let updated  = 0;
      let notFound = 0;
      let skipped  = 0;

      for (const item of batch) {
        const sku = item.sku?.trim();
        if (!sku) { skipped++; continue; }

        const description = item.product_description?.trim() || item.product_name?.trim() || null;
        const imageUrls   = imageMap.get(sku) ?? [];
        const status      = mapStatus(item.status);

        const msrp       = item.list_price           ? parseFloat(item.list_price)            : null;
        const dealerCost = item.standard_dealer_price ? parseFloat(item.standard_dealer_price) : null;
        const mapPrice   = item.mapp_price && parseFloat(item.mapp_price) > 0
                             ? parseFloat(item.mapp_price) : null;
        const isMap      = item.has_map_policy === "true" || item.has_map_policy === true;
        const ourPrice   = dealerCost ? parseFloat((dealerCost * 1.25).toFixed(2)) : null;

        const res = await client.query(
          `UPDATE products SET
             description  = COALESCE(NULLIF($1,''), description),
             images       = CASE WHEN $2::text[] IS NOT NULL AND array_length($2::text[],1) > 0
                                 THEN $2::text[]
                                 ELSE images END,
             status       = COALESCE($3, status),
             msrp         = COALESCE($4, msrp),
             dealer_cost  = COALESCE($5, dealer_cost),
             map_price    = COALESCE($6, map_price),
             is_map       = COALESCE($7, is_map),
             our_price    = CASE WHEN our_price IS NULL OR our_price = 0
                                 THEN COALESCE($8, our_price)
                                 ELSE our_price END,
             weight_lbs   = COALESCE($9,  weight_lbs),
             length_in    = COALESCE($10, length_in),
             width_in     = COALESCE($11, width_in),
             height_in    = COALESCE($12, height_in),
             updated_at   = now()
           WHERE sku = $13`,
          [
            description,
            imageUrls.length > 0 ? imageUrls : null,
            status,
            msrp,
            dealerCost,
            mapPrice,
            isMap,
            ourPrice,
            item.weight ? parseFloat(item.weight) : null,
            item.length ? parseFloat(item.length) : null,
            item.width  ? parseFloat(item.width)  : null,
            item.height ? parseFloat(item.height) : null,
            sku,
          ]
        );

        if (res.rowCount && res.rowCount > 0) updated++;
        else notFound++;
      }

      await client.query("COMMIT");
      client.release();
      return { updated, notFound, skipped };

    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      client.release(true); // destroy this connection

      attempt++;
      if (attempt >= RETRY_LIMIT) throw err;

      console.warn(`  ⚠ Batch error (attempt ${attempt}/${RETRY_LIMIT}): ${err.message} — retrying in ${RETRY_DELAY}ms...`);
      await sleep(RETRY_DELAY * attempt); // backoff
    }
  }

  throw new Error("Unreachable");
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log("Loading master files...");

  const items  = loadJson<any>("master-item-list.json");
  const images = loadJson<any>("master-image-list.json");

  console.log(`  Items:  ${items.length}`);
  console.log(`  Images: ${images.length}`);

  // Build sku → image URLs map
  const imageMap = new Map<string, string[]>();
  for (const img of images) {
    const sku = img.sku?.trim();
    const url = cleanImageUrl(img.image_uri);
    if (!sku || !url) continue;
    if (!imageMap.has(sku)) imageMap.set(sku, []);
    const arr = imageMap.get(sku)!;
    if (!arr.includes(url)) arr.push(url);
  }

  // Ensure primary image is first
  for (const item of items) {
    const sku     = item.sku?.trim();
    const primary = cleanImageUrl(item.primary_item_image);
    if (!sku || !primary) continue;
    const arr      = imageMap.get(sku) ?? [];
    const filtered = arr.filter(u => u !== primary);
    imageMap.set(sku, [primary, ...filtered]);
  }

  console.log(`  SKUs with images: ${imageMap.size}`);
  console.log(`  Batch size: ${BATCH_SIZE} rows per transaction\n`);

  // ── Slice into batches and process ───────────────────────
  let totalUpdated  = 0;
  let totalNotFound = 0;
  let totalSkipped  = 0;
  const startTime   = Date.now();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch     = items.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    const { updated, notFound, skipped } = await patchBatch(batch, imageMap);

    totalUpdated  += updated;
    totalNotFound += notFound;
    totalSkipped  += skipped;

    // Progress every 10 batches (5000 rows)
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const pct     = ((i + batch.length) / items.length * 100).toFixed(1);
      console.log(
        `  Patched ${totalUpdated.toLocaleString()} products...` +
        `  [batch ${batchNum}/${totalBatches} · ${pct}% · ${elapsed}s elapsed]`
      );
    }
  }

  console.log("\n── Import complete ──────────────────────────────────");
  console.log(`  Updated:   ${totalUpdated.toLocaleString()}`);
  console.log(`  Not found: ${totalNotFound.toLocaleString()}  (SKUs in master not in your DB)`);
  console.log(`  Skipped:   ${totalSkipped.toLocaleString()}  (blank SKUs)`);
  console.log(`  Duration:  ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  await pool.end();
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});