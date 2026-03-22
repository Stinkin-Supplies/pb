// ============================================================
// scripts/importWpsProductAssociations.ts
// ============================================================
// Pulls WPS products + associated data and stores in Supabase.
//
// Usage:
//   npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/importWpsProductAssociations.ts
//   npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/importWpsProductAssociations.ts --max-pages 5
//   npx dotenv-cli -e .env.local -- npx ts-node --esm scripts/importWpsProductAssociations.ts --concurrency 2
// ============================================================

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { WpsClient, paginateAll } from "../lib/vendors/wps";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const args = process.argv.slice(2);
const maxPagesArg = args.indexOf("--max-pages");
const maxPages = maxPagesArg !== -1 ? Number(args[maxPagesArg + 1]) : undefined;
const concurrencyArg = args.indexOf("--concurrency");
const concurrency = concurrencyArg !== -1 ? Number(args[concurrencyArg + 1]) : 2;

const CHECKPOINT_FILE = path.join(process.cwd(), "data/wps_product_assoc_checkpoint.json");

type WpsCheckpoint = {
  page: number;
  updatedAt: string;
};

function readCheckpoint(): WpsCheckpoint | null {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8")) as WpsCheckpoint;
  } catch {
    return null;
  }
}

function writeCheckpoint(page: number) {
  try {
    fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
      page,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch {}
}

function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  } catch {}
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type WpsProductRecord = {
  id: number;
  sku?: string | null;
  name?: string | null;
  slug?: string | null;
  brand_id?: number | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const ASSOC_TYPES = [
  "attributekeys",
  "attributevalues",
  "blocks",
  "features",
  "images",
  "items",
  "resources",
  "tags",
] as const;

type AssocType = typeof ASSOC_TYPES[number];

async function fetchAllAssoc(client: InstanceType<typeof WpsClient>, productId: number, type: AssocType) {
  const all: AnyRecord[] = [];
  await paginateAll<AnyRecord>(
    client,
    `/products/${productId}/${type}`,
    { "page[size]": "200" },
    async (items) => {
      all.push(...items);
    }
  );
  return all;
}

async function upsertAssociations(productId: number, data: Record<AssocType, any[]>) {
  const rows = ASSOC_TYPES.map((type) => ({
    product_id: productId,
    assoc_type: type,
    items: data[type] ?? [],
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("wps_product_associations")
    .upsert(rows, { onConflict: "product_id,assoc_type" });

  if (error) {
    throw new Error(error.message);
  }
}

async function processProduct(client: InstanceType<typeof WpsClient>, product: WpsProductRecord) {
  const productId = product.id;

  const assocData = {} as Record<AssocType, any[]>;
  for (const type of ASSOC_TYPES) {
    assocData[type] = await fetchAllAssoc(client, productId, type);
  }

  await upsertAssociations(productId, assocData);
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
  const stats = { totalProducts: 0, upsertedProducts: 0, assocErrors: 0 };

  const checkpoint = readCheckpoint();
  const startPage = checkpoint?.page ?? 0;
  if (startPage > 0) {
    console.log(`[WPS Assoc] Resuming at page ${startPage + 1}`);
  }

  await paginateAll<WpsProductRecord>(
    wps,
    "/products",
    { "page[size]": "200" },
    async (products, pageNum) => {
      if (pageNum <= startPage) return;

      stats.totalProducts += products.length;

      const rows = products.map((p) => ({
        id: p.id,
        sku: p.sku ?? null,
        name: p.name ?? null,
        slug: p.slug ?? null,
        brand_id: p.brand_id ?? null,
        status: p.status ?? null,
        wps_created_at: p.created_at ?? null,
        wps_updated_at: p.updated_at ?? null,
        raw: p,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("wps_products")
          .upsert(rows, { onConflict: "id" });
        if (error) {
          console.error("[WPS Assoc] Product upsert error:", error.message);
        } else {
          stats.upsertedProducts += rows.length;
        }
      }

      await runWithConcurrency(
        products,
        async (p) => {
          try {
            await processProduct(wps, p);
          } catch (e: any) {
            stats.assocErrors += 1;
            console.warn(`[WPS Assoc] Product ${p.id} assoc error:`, e.message);
          }
        },
        concurrency
      );

      writeCheckpoint(pageNum);

      if (pageNum % 5 === 0) {
        console.log(
          `[WPS Assoc] Page ${pageNum} — products: ${stats.totalProducts.toLocaleString()} | ` +
          `upserted: ${stats.upsertedProducts.toLocaleString()} | assocErrors: ${stats.assocErrors}`
        );
      }
    },
    { maxPages }
  );

  clearCheckpoint();
  console.log("[WPS Assoc] Done", stats);
}

main().catch((err) => {
  console.error("[WPS Assoc] Fatal:", err.message);
  process.exit(1);
});
