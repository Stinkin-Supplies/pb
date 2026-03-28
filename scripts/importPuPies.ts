// scripts/importPuPies.ts
// ============================================================
// Scans data/pu/ for PU XML exports, detects PIES vs catalog
// format by peeking at the first 200 chars, merges all files of
// each type together, and upserts descriptions/images into the
// self-hosted Postgres products table.
//
// Run with:
//   npx ts-node --project tsconfig.scripts.json scripts/importPuPies.ts
// Or via admin API route /api/admin/import-pies (POST)
// ============================================================

import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";
import getCatalogDb from "../lib/db/catalog";

const PU_DIR = path.join(process.cwd(), "data", "pu");
const BATCH_SIZE = 500;

type XmlKind = "pies" | "catalog" | "unknown";

// ── Image URL validator ───────────────────────────────────────
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!url.startsWith("http")) return false;
  const lower = url.toLowerCase();
  if (lower.includes(".zip") || lower.includes("download")) return false;
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.match(/\/z\/[A-Za-z0-9+/=]+$/) !== null
  );
}

function cleanUrl(url: string): string {
  return url.replace("http://", "https://").split("?")[0].trim();
}

function peekXmlKind(filePath: string): XmlKind {
  try {
    const snippet = fs.readFileSync(filePath, "utf-8").slice(0, 200).toUpperCase();
    if (snippet.includes("<PIES")) return "pies";
    if (snippet.includes("<ROOT")) return "catalog";
  } catch {
    // ignore and fall through
  }
  return "unknown";
}

function listPuXmlFiles(): string[] {
  if (!fs.existsSync(PU_DIR)) {
    throw new Error(`PU data directory not found: ${PU_DIR}`);
  }

  return fs
    .readdirSync(PU_DIR)
    .map((name) => path.join(PU_DIR, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => filePath.toLowerCase().endsWith(".xml"));
}

function mergeEntryMaps<T extends { description: string | null; images: string[] }>(
  target: Map<string, T>,
  source: Map<string, T>
) {
  for (const [sku, entry] of source.entries()) {
    const existing = target.get(sku);
    if (!existing) {
      target.set(sku, entry);
      continue;
    }

    const description = entry.description ?? existing.description;
    const imageSet = new Set<string>([...existing.images, ...entry.images]);

    target.set(sku, {
      ...existing,
      ...entry,
      description,
      images: [...imageSet].slice(0, 5),
    });
  }
}

// ── Parse Catalog XML files ──────────────────────────────────
interface CatalogEntry {
  sku: string;
  description: string | null;
  images: string[];
}

function parseCatalogXml(filePath: string): Map<string, CatalogEntry> {
  const fileName = path.basename(filePath);
  console.log(`[PIES Import] Parsing catalog file: ${fileName}`);
  const xml = fs.readFileSync(filePath, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
  const root = parser.parse(xml);
  const parts = root?.root?.part ?? [];
  const map = new Map<string, CatalogEntry>();

  for (const part of parts) {
    const sku = String(part.partNumber ?? "").trim();
    if (!sku) continue;

    const bullets: string[] = [];
    for (let i = 1; i <= 24; i++) {
      const bullet = part[`bullet${i}`];
      if (bullet && String(bullet).trim()) {
        bullets.push(String(bullet).trim());
      }
    }
    const description = bullets.length > 0 ? bullets.join("\n") : null;

    const images: string[] = [];
    if (part.partImage && isValidImageUrl(String(part.partImage))) {
      images.push(cleanUrl(String(part.partImage)));
    }
    if (part.productImage && isValidImageUrl(String(part.productImage))) {
      const url = cleanUrl(String(part.productImage));
      if (!images.includes(url)) images.push(url);
    }

    map.set(sku, { sku, description, images });
  }

  console.log(`[PIES Import] ${fileName}: ${map.size.toLocaleString()} catalog parts parsed`);
  return map;
}

// ── Parse PIES XML files ─────────────────────────────────────
interface PiesEntry {
  sku: string;
  description: string | null;
  images: string[];
}

function parsePiesXml(filePath: string): Map<string, PiesEntry> {
  const fileName = path.basename(filePath);
  console.log(`[PIES Import] Parsing PIES file: ${fileName}`);
  const xml = fs.readFileSync(filePath, "utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: true,
    isArray: (name) => ["Item", "Description", "DigitalFileInformation"].includes(name),
  });
  const root = parser.parse(xml);
  const items = root?.PIES?.Items?.Item ?? [];
  const map = new Map<string, PiesEntry>();

  for (const item of items) {
    const sku = String(item.PartNumber ?? "").trim().replace(/-/g, "");
    const skuPunctuated = String(item.PartNumber ?? "").trim();
    if (!sku) continue;

    const descriptions = item.Descriptions?.Description ?? [];
    const fabLines: string[] = [];
    let shortDesc: string | null = null;

    for (const desc of descriptions) {
      const code = desc["@_DescriptionCode"];
      const text = String(desc["#text"] ?? desc ?? "").trim();
      if (!text) continue;
      if (code === "TLE") shortDesc = text;
      if (code === "FAB") fabLines.push(text);
    }

    const description = fabLines.length > 0 ? fabLines.join("\n") : shortDesc;

    const assets = item.DigitalAssets?.DigitalFileInformation ?? [];
    const images: string[] = [];
    for (const asset of assets) {
      const uri = String(asset.URI ?? "").trim();
      const filename = String(asset.FileName ?? "").trim().toLowerCase();
      if (filename.endsWith(".zip")) continue;
      if (uri && isValidImageUrl(uri)) {
        images.push(cleanUrl(uri));
      }
    }

    const entry = { sku, description, images };
    map.set(sku, entry);
    if (skuPunctuated !== sku) map.set(skuPunctuated, entry);
  }

  console.log(`[PIES Import] ${fileName}: ${map.size.toLocaleString()} PIES entries parsed`);
  return map;
}

// ── Merge both sources ────────────────────────────────────────
interface MergedEntry {
  sku: string;
  description: string | null;
  images: string[];
}

function mergeEntries(
  catalog: Map<string, CatalogEntry>,
  pies: Map<string, PiesEntry>
): Map<string, MergedEntry> {
  const merged = new Map<string, MergedEntry>();
  const allSkus = new Set([...catalog.keys(), ...pies.keys()]);

  for (const sku of allSkus) {
    const c = catalog.get(sku);
    const p = pies.get(sku);

    const description = p?.description ?? c?.description ?? null;
    const imageSet = new Set<string>();
    for (const url of (c?.images ?? [])) imageSet.add(url);
    for (const url of (p?.images ?? [])) imageSet.add(url);

    merged.set(sku, {
      sku,
      description,
      images: [...imageSet].slice(0, 5),
    });
  }

  return merged;
}

async function upsertToDb(entries: Map<string, MergedEntry>) {
  const catalogDb = getCatalogDb();
  const allEntries = [...entries.values()];
  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`[PIES Import] Upserting ${allEntries.length.toLocaleString()} entries to self-hosted DB...`);

  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    const batch = allEntries.slice(i, i + BATCH_SIZE);

    for (const entry of batch) {
      try {
        const result = await catalogDb.query(
          `UPDATE products
           SET
             description = CASE
               WHEN $1::text IS NOT NULL AND (description IS NULL OR description = '')
               THEN $1::text
               ELSE description
             END,
             images = CASE
               WHEN $2::text[] IS NOT NULL AND array_length($2::text[], 1) > 0
                    AND (images IS NULL OR images = '{}')
               THEN $2::text[]
               ELSE images
             END,
             updated_at = NOW()
           WHERE sku = $3
           RETURNING sku`,
          [
            entry.description,
            entry.images.length > 0 ? entry.images : null,
            entry.sku,
          ]
        );

        if (result.rowCount && result.rowCount > 0) {
          upserted++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        console.error(
          `[PIES Import] Error for SKU ${entry.sku}:`,
          err?.message ?? err?.detail ?? err
        );
        errors++;
      }
    }

    if ((i / BATCH_SIZE) % 10 === 0) {
      console.log(
        `[PIES Import] Progress — ` +
        `upserted: ${upserted.toLocaleString()} | ` +
        `skipped: ${skipped.toLocaleString()} | ` +
        `errors: ${errors}`
      );
    }
  }

  return { upserted, skipped, errors };
}

function combineFilesByKind(files: string[]) {
  const catalogFiles: string[] = [];
  const piesFiles: string[] = [];
  const unknownFiles: string[] = [];

  for (const filePath of files) {
    const kind = peekXmlKind(filePath);
    if (kind === "pies") piesFiles.push(filePath);
    else if (kind === "catalog") catalogFiles.push(filePath);
    else unknownFiles.push(filePath);
  }

  return { catalogFiles, piesFiles, unknownFiles };
}

// ── Main ──────────────────────────────────────────────────────
export async function importPuPies() {
  console.log("[PIES Import] Starting PU XML import...");
  const start = Date.now();

  const files = listPuXmlFiles();
  const { catalogFiles, piesFiles, unknownFiles } = combineFilesByKind(files);

  console.log(
    `[PIES Import] Found ${files.length.toLocaleString()} XML files ` +
    `(catalog: ${catalogFiles.length}, pies: ${piesFiles.length}, unknown: ${unknownFiles.length})`
  );

  if (unknownFiles.length > 0) {
    console.log(
      "[PIES Import] Unknown XML files skipped:",
      unknownFiles.map((f) => path.basename(f)).join(", ")
    );
  }

  const catalogMaps = catalogFiles.map(parseCatalogXml);
  const piesMaps = piesFiles.map(parsePiesXml);

  const catalogMerged = new Map<string, CatalogEntry>();
  for (const map of catalogMaps) mergeEntryMaps(catalogMerged, map);

  const piesMerged = new Map<string, PiesEntry>();
  for (const map of piesMaps) mergeEntryMaps(piesMerged, map);

  console.log(`[PIES Import] Combined catalog SKUs: ${catalogMerged.size.toLocaleString()}`);
  console.log(`[PIES Import] Combined PIES SKUs: ${piesMerged.size.toLocaleString()}`);

  const merged = mergeEntries(catalogMerged, piesMerged);
  console.log(`[PIES Import] Total unique SKUs to process: ${merged.size.toLocaleString()}`);

  const { upserted, skipped, errors } = await upsertToDb(merged);

  const durationMs = Date.now() - start;
  console.log("[PIES Import] Complete:", {
    totalParsed: merged.size,
    upserted,
    skipped,
    errors,
    durationMs,
  });

  return { upserted, skipped, errors, durationMs };
}

if (require.main === module) {
  importPuPies()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[PIES Import] Fatal:", err);
      process.exit(1);
    });
}
