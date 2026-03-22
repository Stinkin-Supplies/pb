// ============================================================
// scripts/importPuBrandCatalog.ts
// ============================================================
// Parses PU Brand_Catalog_Content_Export.xml and upserts:
//   - images[]      (partImage + productImage — direct JPG URLs)
//   - description   (bullet1–bullet24 joined)
//
// This file has DIRECT CDN image URLs (not ZIPs) so they
// render immediately in the browser as product photos.
//
// Usage:
//   npx dotenv-cli -e .env.local -- npx ts-node scripts/importPuBrandCatalog.ts
//   npx dotenv-cli -e .env.local -- npx ts-node scripts/importPuBrandCatalog.ts --file data/pu/Brand_Catalog_Content_Export.xml
//   npx dotenv-cli -e .env.local -- npx ts-node scripts/importPuBrandCatalog.ts --dry-run
//
// Part number matching:
//   XML uses unpunctuated partNumber (00204801)
//   DB sku column stores same format (00204801) — direct match
// ============================================================

import fs   from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────
const DEFAULT_FILE = path.join(process.cwd(), "data/pu/Brand_Catalog_Content_Export.xml");
const BATCH_SIZE   = 500;

const args    = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const XML_FILE = fileArg !== -1 ? args[fileArg + 1] : DEFAULT_FILE;
const DRY_RUN  = args.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── Types ─────────────────────────────────────────────────────
interface CatalogItem {
  partNumber:   string;  // unpunctuated e.g. "00204801" — matches products.sku
  partImage:    string | null;   // direct JPG URL for this SKU variant
  productImage: string | null;   // direct JPG URL for the product group
  images:       string[];        // deduped [partImage, productImage]
  description:  string | null;   // bullet1–bullet24 joined
}

// ── Parser ────────────────────────────────────────────────────
function parseCatalogXml(filePath: string): CatalogItem[] {
  console.log(`[BrandCatalog] Reading ${filePath}...`);
  const xml = fs.readFileSync(filePath, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => ["part"].includes(name),
  });

  const parsed = parser.parse(xml);
  const parts  = parsed?.root?.part ?? [];

  console.log(`[BrandCatalog] Parsed ${parts.length} parts`);

  const result: CatalogItem[] = [];

  for (const part of parts) {
    const partNumber = String(part.partNumber ?? "").trim();
    if (!partNumber) continue;

    // Direct image URLs
    const partImage    = String(part.partImage    ?? "").trim() || null;
    const productImage = String(part.productImage ?? "").trim() || null;

    // Dedupe images — partImage is SKU-specific (preferred),
    // productImage is shared across variants
    const images: string[] = [];
    if (partImage    && partImage.startsWith("http"))    images.push(partImage);
    if (productImage && productImage.startsWith("http") && productImage !== partImage) {
      images.push(productImage);
    }

    // Collect bullet1–bullet24
    const bullets: string[] = [];
    for (let i = 1; i <= 24; i++) {
      const bullet = String(part[`bullet${i}`] ?? "").trim();
      if (bullet) bullets.push(bullet);
    }

    const description = bullets.length > 0 ? bullets.join("\n") : null;

    result.push({ partNumber, partImage, productImage, images, description });
  }

  return result;
}

// ── Upsert logic ──────────────────────────────────────────────
async function updateBatch(
  items: CatalogItem[],
  stats: { updated: number; unchanged: number; skipped: number; noImage: number; errors: number }
) {
  const partNumbers = items.map(i => i.partNumber);

  const { data: existing, error: fetchErr } = await supabase
    .from("products")
    .select("id, sku, images, description")
    .in("sku", partNumbers);

  if (fetchErr) {
    console.error("[BrandCatalog] Fetch error:", fetchErr.message);
    stats.errors += items.length;
    return;
  }

  const normalize = (v: string) => v.trim().toLowerCase();
  const existingMap = new Map<string, { id: string; images: string[]; description: string | null }>();
  for (const row of existing ?? []) {
    existingMap.set(normalize(row.sku), row);
  }

  if (DRY_RUN) {
    let sample: CatalogItem | null = null;
    for (const item of items) {
      const match = existingMap.get(normalize(item.partNumber));
      if (!match) { stats.skipped++; continue; }
      if (item.images.length === 0) { stats.noImage++; }

      const existingImages = match.images ?? [];

      const hasNewImages =
        item.images.length > 0 &&
        item.images.some(img => !existingImages.includes(img));

      const shouldUpdate =
        hasNewImages ||
        (!match.description && item.description);

      if (!shouldUpdate) {
        stats.unchanged++;
        continue;
      }

      stats.updated++;
      if (!sample && item.images.length > 0) sample = item;
    }
    console.log(`[BrandCatalog] DRY RUN — would update ${stats.updated} products`);
    if (sample) {
      console.log("[BrandCatalog] Sample:", JSON.stringify({
        partNumber:  sample.partNumber,
        partImage:   sample.partImage,
        productImage:sample.productImage,
        description: sample.description?.slice(0, 100) + "...",
      }, null, 2));
    }
    return;
  }

  const updates: { id: string; images: string[]; description: string | null }[] = [];

  for (const item of items) {
    const match = existingMap.get(normalize(item.partNumber));
    if (!match) {
      stats.skipped++;
      continue;
    }

    if (item.images.length === 0) stats.noImage++;

    const existingImages = match.images ?? [];

    const hasNewImages =
      item.images.length > 0 &&
      item.images.some(img => !existingImages.includes(img));

    const shouldUpdate =
      hasNewImages ||
      (!match.description && item.description);

    if (!shouldUpdate) {
      stats.unchanged++;
      continue;
    }

    // Merge: new images first (direct JPGs), then keep any existing ones
    const mergedImages = [...new Set([
      ...item.images,
      ...existingImages,
    ])];

    updates.push({
      id:          match.id,
      images:      mergedImages,
      description: match.description || item.description,
    });
    stats.updated++;
  }

  if (updates.length === 0) return;

  const { error } = await supabase
    .from("products")
    .upsert(updates, { onConflict: "id" });

  if (error) {
    console.error("[BrandCatalog] Bulk upsert error:", error.message);
    stats.errors += updates.length;
    stats.updated -= updates.length;
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(XML_FILE)) {
    console.error(`[BrandCatalog] File not found: ${XML_FILE}`);
    console.error(`[BrandCatalog] Place the XML in data/pu/ or pass --file path/to/file.xml`);
    process.exit(1);
  }

  if (DRY_RUN) console.log("[BrandCatalog] DRY RUN MODE — no changes will be written");

  const items = parseCatalogXml(XML_FILE);
  const stats = { updated: 0, unchanged: 0, skipped: 0, noImage: 0, errors: 0 };
  const start = Date.now();

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await updateBatch(batch, stats);

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= items.length) {
      console.log(
        `[BrandCatalog] Progress ${Math.min(i + BATCH_SIZE, items.length)}/${items.length} — ` +
        `updated: ${stats.updated} | unchanged: ${stats.unchanged} | skipped: ${stats.skipped} | no image: ${stats.noImage} | errors: ${stats.errors}`
      );
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[BrandCatalog] Complete in ${duration}s`);
  console.log(`  Updated            : ${stats.updated}`);
  console.log(`  Unchanged          : ${stats.unchanged}`);
  console.log(`  Not in DB (skipped): ${stats.skipped}`);
  console.log(`  No image URL       : ${stats.noImage}`);
  console.log(`  Errors             : ${stats.errors}`);

  if (!DRY_RUN && stats.updated > 0) {
    console.log("\n[BrandCatalog] Refreshing facets cache...");
    await supabase.rpc("refresh_facets_cache");
    console.log("[BrandCatalog] Done.");
  }
}

main().catch(err => {
  console.error("[BrandCatalog] Fatal:", err.message);
  process.exit(1);
});
