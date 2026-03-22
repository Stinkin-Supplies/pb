// ============================================================
// scripts/backfillWpsImagesFromCsv.ts
// ============================================================
// Reads a WPS products CSV (export) and backfills products.images
// by fetching item images from the WPS API.
//
// Usage:
//   npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/backfillWpsImagesFromCsv.ts \
//     --csv /Users/home/Downloads/wps_products_rows.csv
//   npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/backfillWpsImagesFromCsv.ts \
//     --csv /Users/home/Downloads/wps_products_rows.csv --concurrency 3 --limit 200
// ============================================================

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { WpsClient, WpsItem, sortedImageUrls } from "../lib/vendors/wps";
import { mergeProductImages } from "../lib/mergeProductImages";

const args = process.argv.slice(2);
const csvArg = args.indexOf("--csv");
const csvPath =
  csvArg !== -1 ? String(args[csvArg + 1]) : "/Users/home/Downloads/wps_products_rows.csv";

const concurrencyArg = args.indexOf("--concurrency");
const concurrency = concurrencyArg !== -1 ? Number(args[concurrencyArg + 1]) : 3;

const limitArg = args.indexOf("--limit");
const limit = limitArg !== -1 ? Number(args[limitArg + 1]) : undefined;

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function parseCsvSkus(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  if (!header) return [];
  const columns = header.split(",");
  const skuIndex = columns.indexOf("sku");
  if (skuIndex === -1) return [];
  const skus: string[] = [];
  for (const line of lines) {
    const cols = line.split(",");
    const sku = (cols[skuIndex] ?? "").trim();
    if (sku) skus.push(sku);
  }
  return skus;
}

async function chunkedExistingImages(skus: string[]) {
  const map = new Map<string, string[]>();
  const chunkSize = 200;
  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("products")
      .select("sku, images")
      .in("sku", chunk);
    if (error) {
      console.warn("[Backfill] Existing images fetch warning:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      if (row.sku) map.set(row.sku, row.images ?? []);
    }
  }
  return map;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  limit: number
) {
  let idx = 0;
  const running: Promise<void>[] = [];

  const enqueue = async () => {
    if (idx >= items.length) return;
    const item = items[idx++];
    const p = worker(item).finally(() => {
      const i = running.indexOf(p);
      if (i >= 0) running.splice(i, 1);
    });
    running.push(p);
  };

  while (idx < items.length || running.length > 0) {
    while (running.length < limit && idx < items.length) {
      await enqueue();
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }
}

async function main() {
  const wps = new WpsClient();
  const allSkus = parseCsvSkus(csvPath);
  const uniqueSkus = [...new Set(allSkus)];
  const targetSkus = typeof limit === "number"
    ? uniqueSkus.slice(0, limit)
    : uniqueSkus;

  if (targetSkus.length === 0) {
    console.log("[Backfill] No SKUs found in CSV");
    return;
  }

  console.log(`[Backfill] SKUs loaded: ${targetSkus.length.toLocaleString()}`);

  const existingImagesMap = await chunkedExistingImages(targetSkus);
  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  await runWithConcurrency(
    targetSkus,
    async (sku) => {
      try {
        const res = await wps.get<{ data: WpsItem[] }>("/items", {
          "filter[sku]": sku,
          include: "images",
        });
        const item = Array.isArray(res?.data) ? res.data[0] : undefined;
        if (!item) { stats.skipped += 1; return; }
        const urls = item.images ? sortedImageUrls(item.images) : [];
        if (urls.length === 0) { stats.skipped += 1; return; }

        const existingImages = existingImagesMap.get(sku) ?? [];
        const merged = mergeProductImages({
          wps: urls,
          pies: existingImages,
          pu: [],
        });

        const { error } = await supabase
          .from("products")
          .update({ images: merged })
          .eq("sku", sku);

        if (error) {
          stats.errors += 1;
          console.warn(`[Backfill] Update failed for ${sku}:`, error.message);
        } else {
          stats.updated += 1;
        }
      } catch (e: any) {
        stats.errors += 1;
        console.warn(`[Backfill] Error for ${sku}:`, e.message);
      } finally {
        stats.processed += 1;
        if (stats.processed % 50 === 0) {
          console.log(
            `[Backfill] processed ${stats.processed} | updated ${stats.updated} | ` +
            `skipped ${stats.skipped} | errors ${stats.errors}`
          );
        }
      }
    },
    concurrency
  );

  console.log("[Backfill] Done:", stats);
}

main().catch((err) => {
  console.error("[Backfill] Fatal:", err);
  process.exit(1);
});
