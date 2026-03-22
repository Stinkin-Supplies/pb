// ============================================================
// scripts/importPuPies.ts
// ============================================================
// Parses PU PIES XML exports and upserts:
//   - description (TLE title + FAB bullets joined)
//   - images[] (URI from DigitalAssets — LeMans CDN)
//
// Usage:
//   npx ts-node scripts/importPuPies.ts
//   npx ts-node scripts/importPuPies.ts --file data/pu/Brand_PIES_Export.xml
//   npx ts-node scripts/importPuPies.ts --dry-run
//
// Part number matching:
//   PIES uses punctuated format (1131-0683)
//   DB uses unpunctuated SKU (11310683)
//   Script strips all non-alphanumeric chars before matching.
// ============================================================

import fs   from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────
const DEFAULT_FILE = path.join(process.cwd(), "data/pu/Brand_PIES_Export.xml");
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
interface PiesAsset {
  uri:       string;
  assetType: string;
  fileName:  string;
}

interface PiesItem {
  partNumber:   string; // punctuated e.g. "1131-0683"
  sku:          string; // stripped  e.g. "11310683"
  brandLabel:   string;
  title:        string | null;        // DescriptionCode=TLE
  bullets:      string[];             // DescriptionCode=FAB (ordered by Sequence)
  description:  string | null;        // title + bullets joined
  images:       string[];             // CDN URIs
}

// ── Parser ────────────────────────────────────────────────────
function stripPunctuation(partNumber: string): string {
  return partNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function parsePiesXml(filePath: string): PiesItem[] {
  console.log(`[PIES] Reading ${filePath}...`);
  const xml = fs.readFileSync(filePath, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes:        false,
    attributeNamePrefix:     "@_",
    isArray: (name) =>
      ["Item", "Description", "DigitalFileInformation", "ExtendedProductInformation"].includes(name),
  });

  const parsed = parser.parse(xml);
  const items  = parsed?.PIES?.Items?.Item ?? [];

  console.log(`[PIES] Parsed ${items.length} items`);

  const result: PiesItem[] = [];

  for (const item of items) {
    const partNumber = String(item.PartNumber ?? "").trim();
    if (!partNumber) continue;

    const sku        = stripPunctuation(partNumber);
    const brandLabel = String(item.BrandLabel ?? "").trim();

    // ── Descriptions ──────────────────────────────────────────
    const descriptions = item.Descriptions?.Description ?? [];
    let title: string | null = null;
    const bulletMap: Map<number, string> = new Map();

    for (const desc of descriptions) {
      const code = desc["@_DescriptionCode"] ?? "";
      const text = String(desc["#text"] ?? desc ?? "").trim();
      if (!text) continue;

      if (code === "TLE") {
        title = text;
      } else if (code === "FAB") {
        const seq = parseInt(desc["@_Sequence"] ?? "0", 10);
        bulletMap.set(seq, text);
      }
    }

    // Sort bullets by sequence number
    const bullets = [...bulletMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, text]) => text);

    // Build full description: title + bulleted features
    const descParts: string[] = [];
    if (title) descParts.push(title);
    if (bullets.length > 0) descParts.push(...bullets);
    const description = descParts.length > 0 ? descParts.join("\n") : null;

    // ── Digital Assets (images) ───────────────────────────────
    const digitalFiles = item.DigitalAssets?.DigitalFileInformation ?? [];
    const images: string[] = [];

    for (const asset of digitalFiles) {
      const uri = String(asset.URI ?? "").trim();
      if (uri && uri.startsWith("http")) {
        images.push(uri);
      }
    }

    result.push({
      partNumber,
      sku,
      brandLabel,
      title,
      bullets,
      description,
      images,
    });
  }

  return result;
}

// ── Upsert logic ──────────────────────────────────────────────
async function upsertBatch(
  items: PiesItem[],
  stats: { updated: number; unchanged: number; skipped: number; errors: number }
) {
  // Look up matching SKUs in one query
  const { data: existing, error: fetchErr } = await supabase
    .from("products")
    .select("id, sku, vendor_sku, images, description")
    .in("vendor_sku", items.map(i => i.partNumber));

  if (fetchErr) {
    console.error("[PIES] Fetch error:", fetchErr.message);
    stats.errors += items.length;
    return;
  }

  const normalize = (v: string) => v.trim().toLowerCase();
  const existingMap = new Map<string, { id: string; images: string[]; description: string | null }>();
  for (const row of existing ?? []) {
    if (row.vendor_sku) existingMap.set(normalize(row.vendor_sku), row);
  }

  const updates: { id: string; images: string[]; description: string | null }[] = [];

  for (const item of items) {
    const match = existingMap.get(normalize(item.partNumber));
    if (!match) {
      stats.skipped++;
      continue;
    }

    const existingImages = match.images ?? [];

    // Merge images — add new URLs, keep existing ones, dedupe
    const mergedImages = [...new Set([
      ...item.images,
      ...existingImages,
    ])];

    const hasNewImages = item.images.some(img => !existingImages.includes(img));

    const shouldUpdate =
      hasNewImages ||
      (!match.description && item.description);

    if (!shouldUpdate) {
      stats.unchanged++;
      continue;
    }

    updates.push({
      id:          match.id,
      images:      mergedImages,
      description: match.description || item.description,
    });
    stats.updated++;
  }

  if (DRY_RUN) {
    console.log(`[PIES] DRY RUN — would update ${updates.length} products`);
    if (updates.length > 0) {
      console.log("[PIES] Sample:", JSON.stringify(updates[0], null, 2));
    }
    return;
  }

  if (updates.length === 0) return;

  const { error } = await supabase
    .from("products")
    .upsert(updates, { onConflict: "id" });

  if (error) {
    console.error("[PIES] Bulk upsert error:", error.message);
    stats.errors += updates.length;
    stats.updated -= updates.length;
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(XML_FILE)) {
    console.error(`[PIES] File not found: ${XML_FILE}`);
    console.error(`[PIES] Place the XML in data/pu/ or pass --file path/to/file.xml`);
    process.exit(1);
  }

  if (DRY_RUN) console.log("[PIES] DRY RUN MODE — no changes will be written");

  const items = parsePiesXml(XML_FILE);

  const stats = { updated: 0, unchanged: 0, skipped: 0, errors: 0 };
  const start = Date.now();

  // Process in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await upsertBatch(batch, stats);

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= items.length) {
      console.log(
        `[PIES] Progress ${Math.min(i + BATCH_SIZE, items.length)}/${items.length} — ` +
        `updated: ${stats.updated} | unchanged: ${stats.unchanged} | skipped: ${stats.skipped} | errors: ${stats.errors}`
      );
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[PIES] Complete in ${duration}s`);
  console.log(`  Updated            : ${stats.updated}`);
  console.log(`  Unchanged          : ${stats.unchanged}`);
  console.log(`  Not in DB (skipped): ${stats.skipped}`);
  console.log(`  Errors             : ${stats.errors}`);

  if (stats.skipped > 0) {
    console.log(`\n[PIES] Note: ${stats.skipped} part numbers from PIES had no matching SKU in products.`);
    console.log(`  This is normal — PIES may include parts not in your current price file.`);
  }

  // After import, refresh facets cache
  if (!DRY_RUN && stats.updated > 0) {
    console.log("\n[PIES] Refreshing facets cache...");
    await supabase.rpc("refresh_facets_cache");
    console.log("[PIES] Facets cache refreshed.");
  }
}

main().catch(err => {
  console.error("[PIES] Fatal:", err.message);
  process.exit(1);
});
