export const runtime = "nodejs";

// ============================================================
// app/api/vendors/wps/sync/route.ts
// ============================================================
// Syncs all WPS items (with images + live inventory) to the
// Supabase products table. Also handles dealer pricing via
// WPS's async job → poll → download flow.
//
// POST  — run a full sync
// GET   — current status + recent sync history
//
// Stages:
//   1. Request pricing job (async, poll until ready)
//   2. Download + index pricing data by SKU
//   3. Paginate /items?include=images,inventory
//   4. Map + batch upsert to products table
//   5. Write sync_log entry
//
// Required env vars:
//   WPS_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   SYNC_SECRET
// ============================================================

import { NextResponse } from "next/server";
import { createClient }  from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { db } from "@/lib/supabase/admin";
import getCatalogDb from "@/lib/db/catalog";
import {
  WpsClient,
  WpsItem,
  WpsDealerPricingEntry,
  WpsBrand,
  paginateAll,
  mapWpsItemToProduct,
  buildPricingMap,
  requestPricingJob,
  pollPricingJob,
  downloadPricingData,
} from "@/lib/vendors/wps";
import { mergeProductImages } from "@/lib/mergeProductImages";

const BATCH_SIZE = 250; // smaller than PU — WPS items carry image arrays
const CHECKPOINT_FILE = path.join(process.cwd(), "data/wps_sync_checkpoint.json");

type WpsCheckpoint = {
  cursor: string | null;
  page: number;
  totalItems: number;
  updatedAt: string;
};

function readCheckpoint(): WpsCheckpoint | null {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    const raw = fs.readFileSync(CHECKPOINT_FILE, "utf-8");
    return JSON.parse(raw) as WpsCheckpoint;
  } catch (e) {
    console.warn("[WPS Sync] Failed to read checkpoint:", (e as Error).message);
    return null;
  }
}

function writeCheckpoint(cp: WpsCheckpoint) {
  try {
    fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
  } catch (e) {
    console.warn("[WPS Sync] Failed to write checkpoint:", (e as Error).message);
  }
}

function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  } catch (e) {
    console.warn("[WPS Sync] Failed to clear checkpoint:", (e as Error).message);
  }
}

// ── Sync log helpers (mirrors PU pattern) ────────────────────

async function getLastSync(supabase: any) {
  const { data } = await supabase
    .from("sync_log")
    .select("*")
    .eq("vendor", "wps")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function writeSyncLog(supabase: any, entry: Record<string, unknown>) {
  try {
    await supabase.from("sync_log").insert({
      vendor:       "wps",
      completed_at: new Date().toISOString(),
      ...entry,
    });
  } catch (e: any) {
    console.warn("[WPS Sync] Failed to write sync log:", e.message);
  }
}

// ── POST: run full sync ───────────────────────────────────────

export async function POST(req: Request) {
  const start = Date.now();

  // ── Auth ──────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let wps: WpsClient;
  try {
    wps = new WpsClient();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const result = {
    totalItems:  0,
    upserted:    0,
    skipped:     0,
    errors:      0,
    images:      0,
    durationMs:  0,
  };

  try {
    // ── Step 1: Ensure WPS vendor row exists ───────────────
    let vendorId: string;
    {
      const { data: existing } = await supabase
        .from("vendors")
        .select("id")
        .eq("slug", "wps")
        .maybeSingle();

      if (existing) {
        vendorId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("vendors")
          .insert({
            name:                "Western Power Sports",
            slug:                "wps",
            avg_ship_time_days:  2,
            integration_method:  "api",
          })
          .select("id")
          .single();

        if (createErr || !created) {
          return NextResponse.json(
            { error: "Could not create WPS vendor row: " + createErr?.message },
            { status: 500 }
          );
        }
        vendorId = created.id;
      }
    }

    // ── Step 2: Fetch dealer pricing (async job) ───────────
    // WPS returns a 202 with a job ID; we poll until complete.
    let pricingMap = new Map<string, WpsDealerPricingEntry>();
    try {
      console.log("[WPS Sync] Requesting dealer pricing job...");
      const jobId      = await requestPricingJob(wps);
      // If requestPricingJob returns a URL directly, download immediately
      // If it returns a job ID, poll until ready
      let downloadUrl: string;
      if (jobId.startsWith("http")) {
        downloadUrl = jobId;
        console.log("[WPS Sync] Pricing URL ready — downloading...");
      } else {
        console.log(`[WPS Sync] Pricing job ID: ${jobId} — polling...`);
        downloadUrl = await pollPricingJob(wps, jobId);
        console.log("[WPS Sync] Pricing job complete — downloading...");
      }
      const entries = await downloadPricingData(downloadUrl);
      pricingMap        = buildPricingMap(entries);
      console.log(`[WPS Sync] ${pricingMap.size.toLocaleString()} pricing entries loaded`);
    } catch (pricingErr: any) {
      // Pricing failure is non-fatal — we sync items at retail and warn
      console.warn("[WPS Sync] Pricing job failed, using retail fallback:", pricingErr.message);
    }

    // ── Step 3: Load ALL WPS brands (paginated) ────────────
    console.log("[WPS Sync] Loading WPS brand list...");
    const allWpsBrands: WpsBrand[] = [];
    await paginateAll<WpsBrand>(
      wps,
      "/brands",
      { "page[size]": "200" },
      async (page) => { allWpsBrands.push(...page); }
    );
    const wpsBrandMap = new Map<number, string>();
    for (const b of allWpsBrands) {
      wpsBrandMap.set(b.id, b.name);
    }
    console.log(`[WPS Sync] ${wpsBrandMap.size} brands loaded`);

    const uniqueBrandNames = [...new Set(allWpsBrands.map((b) => b.name))];
    const catalogDb = getCatalogDb();

    // Upsert brands to self-hosted Postgres
    for (const name of uniqueBrandNames) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await catalogDb.query(
        `INSERT INTO brands (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, slug]
      ).catch(() => {}); // ignore errors — brands table may not exist on self-hosted yet
    }

    // Keep Supabase brand map for brand_id FK (brands table stays in Supabase)
    const { data: brandRows } = await supabase
      .from("brands")
      .select("id, name")
      .in("name", uniqueBrandNames);

    const supabaseBrandMap: Record<string, string> = {};
    for (const b of brandRows ?? []) {
      supabaseBrandMap[b.name] = b.id;
    }

    // ── Step 4: Paginate items with images + inventory ─────
    const forceRestart = req.headers.get("x-force-restart") === "true";
    let startCursor: string | null = null;
    let startPage = 0;
    const checkpoint = readCheckpoint();
    if (checkpoint && !forceRestart) {
      if (checkpoint.cursor) {
        startCursor = checkpoint.cursor;
        startPage = checkpoint.page;
        console.log(`[WPS Sync] Resuming from page ${startPage + 1} (cursor checkpoint)`);
      } else {
        // If cursor is null, last run completed.
        clearCheckpoint();
      }
    } else if (forceRestart) {
      clearCheckpoint();
    }

    console.log("[WPS Sync] Starting item pagination...");

    let batch: ReturnType<typeof mapWpsItemToProduct>[] = [];
    const upsertedProducts: ReturnType<typeof mapWpsItemToProduct>[] = [];

    const flushBatch = async () => {
      if (batch.length === 0) return;

      const validBatch = batch.filter(
        (p) => p.sku?.trim() && p.part_number?.trim()
      );
      result.skipped += batch.length - validBatch.length;
      if (validBatch.length === 0) { batch = []; return; }

      // Write to self-hosted Postgres
      for (const item of validBatch) {
        try {
          const i = item as any;
          await catalogDb.query(
            `INSERT INTO products (
              sku, part_number, name, slug, vendor_id, vendor_sku,
              brand_id, brand_name, category_name, description,
              our_price, compare_at_price, map_price, map_floor,
              in_stock, stock_quantity, total_qty,
              weight_lbs, length_in, width_in, height_in,
              is_map, is_new, is_closeout, is_drag_specialties,
              wps_item_id, wps_product_id, images,
              status, condition, last_synced_at, updated_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
              $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
            )
            ON CONFLICT (sku) DO UPDATE SET
              name             = EXCLUDED.name,
              description      = EXCLUDED.description,
              our_price        = EXCLUDED.our_price,
              compare_at_price = EXCLUDED.compare_at_price,
              map_price        = EXCLUDED.map_price,
              map_floor        = EXCLUDED.map_floor,
              in_stock         = EXCLUDED.in_stock,
              stock_quantity   = EXCLUDED.stock_quantity,
              total_qty        = EXCLUDED.total_qty,
              images           = EXCLUDED.images,
              wps_item_id      = EXCLUDED.wps_item_id,
              wps_product_id   = EXCLUDED.wps_product_id,
              last_synced_at   = EXCLUDED.last_synced_at,
              updated_at       = EXCLUDED.updated_at
            WHERE products.updated_manually = false`,
            [
              i.sku, i.part_number, i.name, i.slug,
              i.vendor_id, i.vendor_sku,
              i.brand_id, i.brand_name, i.category_name, i.description,
              i.our_price, i.compare_at_price, i.map_price, i.map_floor,
              i.in_stock, i.stock_quantity, i.total_qty,
              i.weight_lbs, i.length_in, i.width_in, i.height_in,
              i.is_map, i.is_new, i.is_closeout, i.is_drag_specialties,
              i.wps_item_id, i.wps_product_id, i.images,
              i.status ?? 'active', i.condition ?? 'new',
              i.last_synced_at ?? new Date().toISOString(),
              new Date().toISOString(),
            ]
          );
          result.upserted += 1;
          result.images += i.images?.length ?? 0;
        } catch (err: any) {
          if (err.message?.includes('slug')) {
            result.skipped += 1;
          } else {
            console.error("[WPS Sync] Row error:", item.sku, err.message);
            result.errors += 1;
          }
        }
      }
      batch = [];
    };

    const { total } = await paginateAll<WpsItem>(
      wps,
      "/items",
      {
        // No status filter — WPS uses non-standard status values (NLA, etc.)
        // We map their status to our own via WPS_STATUS_MAP in wps.ts
        // Include image derivatives directly on items
        "include": "inventory,images",
      },
      async (items, pageNum, pageInfo) => {
        result.totalItems += items.length;

        const skuList = items.map(i => i.sku).filter(Boolean);
        const existingImagesMap = new Map<string, string[]>();
        if (skuList.length > 0) {
          const placeholders = skuList.map((_: any, i: number) => `$${i + 1}`).join(',');
          const { rows: existingRows, } = await catalogDb.query(
            `SELECT sku, images FROM products WHERE sku IN (${placeholders})`,
            skuList
          ).catch(() => ({ rows: [] }));

          for (const row of existingRows ?? []) {
            if (row.sku) existingImagesMap.set(row.sku, row.images ?? []);
          }
        }

        for (const item of items) {
          if (!item.sku?.trim()) { result.skipped++; continue; }

          const pricing    = pricingMap.get(item.sku) ?? null;
          const brandName  = wpsBrandMap.get(item.brand_id) ?? "WPS";
          const product    = mapWpsItemToProduct(item, pricing, brandName, vendorId) as any;
          product.brand_id = supabaseBrandMap[product.brand_name] ?? null;
          const existingImages = existingImagesMap.get(product.sku) ?? [];
          const wpsImages = product.images ?? [];
          product.images = mergeProductImages({
            wps: wpsImages,
            pies: existingImages,
            pu: [],
          });

          batch.push(product);
          upsertedProducts.push(product);
          if (batch.length >= BATCH_SIZE) await flushBatch();
        }

        if (pageNum % 10 === 0) {
          console.log(
            `[WPS Sync] Page ${pageNum} — ` +
            `total: ${result.totalItems.toLocaleString()} | ` +
            `upserted: ${result.upserted.toLocaleString()} | ` +
            `images: ${result.images.toLocaleString()}`
          );
        }

        writeCheckpoint({
          cursor: pageInfo.nextCursor,
          page: pageNum,
          totalItems: result.totalItems,
          updatedAt: new Date().toISOString(),
        });
      },
      {
      startCursor,
      startPage,
      }
    );

    await flushBatch();
    result.durationMs = Date.now() - start;

    // After products are upserted — run MAP check logging
    const violationCount = await db.logMapCheckBulk(upsertedProducts, "sync");
    console.log(
      `[WPS Sync] MAP check complete — ${violationCount ?? 0} violations logged`
    );

    clearCheckpoint();

    console.log("[WPS Sync] Complete:", result);
    console.log(`[WPS Sync] Paginated ${total} total items across all pages`);

    // ── Step 5: Write sync log ─────────────────────────────
    await writeSyncLog(supabase, {
      status:      "success",
      total_parts: result.totalItems,
      upserted:    result.upserted,
      skipped:     result.skipped,
      errors:      result.errors,
      duration_ms: result.durationMs,
      // WPS-specific extras stored in the meta JSON column (if you have one)
      // or just leave them in the log message
      error_message: result.images > 0
        ? `${result.images.toLocaleString()} images synced`
        : null,
    });

    return NextResponse.json({ success: true, summary: result });

  } catch (err: any) {
    console.error("[WPS Sync] Fatal error:", err);

    result.durationMs = Date.now() - start;
    await writeSyncLog(supabase, {
      status:        "error",
      total_parts:   result.totalItems,
      upserted:      result.upserted,
      skipped:       result.skipped,
      errors:        result.errors + 1,
      duration_ms:   result.durationMs,
      error_message: err?.message ?? "Unknown error",
    });

    return NextResponse.json(
      { error: err?.message ?? "Unknown error during WPS sync" },
      { status: 500 }
    );
  }
}

// ── GET: status + history ─────────────────────────────────────

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [productsRes, logsRes] = await Promise.all([
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("vendor_id", supabase.from("vendors").select("id").eq("slug", "wps"))
      .eq("status", "active"),
    supabase
      .from("sync_log")
      .select("*")
      .eq("vendor", "wps")
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);

  // Simpler active product count via a separate query
  const { count: wpsCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    // vendor_id is a join — filter by slug requires a subquery or RPC.
    // For simplicity, the dashboard shows total active; refine with RPC if needed.

  const lastSuccess = (logsRes.data ?? []).find((l: any) => l.status === "success");

  return NextResponse.json({
    totalActiveProducts: wpsCount ?? productsRes.count ?? 0,
    lastSyncAt:          lastSuccess?.completed_at ?? null,
    lastSyncImages:      lastSuccess?.error_message ?? null, // images count stored here
    recentLogs:          logsRes.data ?? [],
  });
}
