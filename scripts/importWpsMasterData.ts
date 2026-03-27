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
// Safe to re-run — uses INSERT ON CONFLICT (upsert).
// ============================================================

import fs   from "fs";
import path from "path";
import { Pool } from "pg";

// ── DB connection (same as your CATALOG_DATABASE_URL) ────────
const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: process.env.CATALOG_DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

// ── Load master files ────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");

function loadJson<T>(filename: string): T[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Master file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.data ?? [];
}

// ── Status mapper ────────────────────────────────────────────
function mapStatus(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "NLA")          return "discontinued";
  if (s === "CLOSEOUT")     return "active";      // still sellable
  if (s === "INACTIVE")     return "discontinued";
  if (s === "ACTIVE")       return "active";
  return "active";
}

// ── Image URL cleaner ────────────────────────────────────────
// Master files use http:// — upgrade to https
// Also normalise to 1000_max size for consistency
function cleanImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:\/\//, "https://")
    // If the URL has /images/full/ swap to /1000_max/images/ for better resolution
    .replace(
      /cdn\.wpsstatic\.com\/images\/full\//,
      "cdn.wpsstatic.com/1000_max/images/"
    );
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log("Loading master files...");

  const items  = loadJson<any>("master-item-list.json");
  const images = loadJson<any>("master-image-list.json");

  console.log(`  Items:  ${items.length}`);
  console.log(`  Images: ${images.length}`);

  // Build sku → image URLs map (deduplicated, primary first)
  const imageMap = new Map<string, string[]>();
  for (const img of images) {
    const sku = img.sku?.trim();
    const url = cleanImageUrl(img.image_uri);
    if (!sku || !url) continue;
    if (!imageMap.has(sku)) imageMap.set(sku, []);
    const arr = imageMap.get(sku)!;
    if (!arr.includes(url)) arr.push(url);
  }

  // For items with a primary_item_image, ensure it's first
  for (const item of items) {
    const sku = item.sku?.trim();
    const primary = cleanImageUrl(item.primary_item_image);
    if (!sku || !primary) continue;
    const arr = imageMap.get(sku) ?? [];
    // Remove if already present, then unshift to front
    const filtered = arr.filter(u => u !== primary);
    imageMap.set(sku, [primary, ...filtered]);
  }

  console.log(`  SKUs with images: ${imageMap.size}`);

  // ── Patch products table ──────────────────────────────────
  const client = await pool.connect();

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  try {
    await client.query("BEGIN");

    for (const item of items) {
      const sku = item.sku?.trim();
      if (!sku) { skipped++; continue; }

      const description = item.product_description?.trim() || item.product_name?.trim() || null;
      const imageUrls   = imageMap.get(sku) ?? [];
      const status      = mapStatus(item.status);

      // Map pricing fields
      const msrp       = item.list_price               ? parseFloat(item.list_price)               : null;
      const dealerCost = item.standard_dealer_price     ? parseFloat(item.standard_dealer_price)    : null;
      const mapPrice   = item.mapp_price && parseFloat(item.mapp_price) > 0
                           ? parseFloat(item.mapp_price) : null;
      const isMap      = item.has_map_policy === "true" || item.has_map_policy === true;

      // Compute our_price if not already set (use dealer cost + 25% margin)
      const ourPrice   = dealerCost ? parseFloat((dealerCost * 1.25).toFixed(2)) : null;

      const res = await client.query(
        `UPDATE products SET
           description        = COALESCE(NULLIF($1,''), description),
           images             = CASE WHEN $2::text[] IS NOT NULL AND array_length($2::text[],1) > 0
                                     THEN $2::text[]
                                     ELSE images END,
           status             = COALESCE($3, status),
           msrp               = COALESCE($4, msrp),
           dealer_cost        = COALESCE($5, dealer_cost),
           map_price          = COALESCE($6, map_price),
           is_map             = COALESCE($7, is_map),
           our_price          = CASE WHEN our_price IS NULL OR our_price = 0
                                     THEN COALESCE($8, our_price)
                                     ELSE our_price END,
           weight_lbs         = COALESCE($9,  weight_lbs),
           length_in          = COALESCE($10, length_in),
           width_in           = COALESCE($11, width_in),
           height_in          = COALESCE($12, height_in),
           updated_at         = now()
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
          item.weight  ? parseFloat(item.weight)  : null,
          item.length  ? parseFloat(item.length)  : null,
          item.width   ? parseFloat(item.width)   : null,
          item.height  ? parseFloat(item.height)  : null,
          sku,
        ]
      );

      if (res.rowCount && res.rowCount > 0) {
        updated++;
      } else {
        notFound++;
      }

      if (updated % 1000 === 0 && updated > 0) {
        console.log(`  Patched ${updated} products...`);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("\n── Import complete ──────────────────────────────────");
  console.log(`  Updated:   ${updated}`);
  console.log(`  Not found: ${notFound}  (SKUs in master file not in your DB)`);
  console.log(`  Skipped:   ${skipped}  (blank SKUs)`);

  await pool.end();
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
