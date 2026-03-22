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

    // Upsert all brands into Supabase
    const uniqueBrandNames = [...new Set(allWpsBrands.map((b) => b.name))];
    await supabase
      .from("brands")
      .upsert(
        uniqueBrandNames.map((name) => ({
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        })),
        { onConflict: "name" }
      );

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

    const flushBatch = async () => {
      if (batch.length === 0) return;

      const validBatch = batch.filter(
        (p) => p.sku?.trim() && p.part_number?.trim()
      );
      // Count items dropped only because of missing SKU (brand_id null is fine — column is nullable)
      result.skipped += batch.length - validBatch.length;
      if (validBatch.length === 0) { batch = []; return; }

      const { error } = await supabase
        .from("products")
        .upsert(validBatch, { onConflict: "sku", ignoreDuplicates: false });

      if (error) {
        console.error(
          "[WPS Sync] Upsert error:", error.message,
          "| Sample:", JSON.stringify(validBatch[0]?.sku)
        );
        result.errors += validBatch.length;
      } else {
        result.upserted += validBatch.length;
        result.images   += validBatch.reduce(
          (sum, p) => sum + (p.images?.length ?? 0), 0
        );
      }
      batch = [];
    };

    const { total } = await paginateAll<WpsItem>(
      wps,
      "/items",
      {
        // No status filter — WPS uses non-standard status values (NLA, etc.)
        // We map their status to our own via WPS_STATUS_MAP in wps.ts
        "include": "images,inventory",
      },
      async (items, pageNum, pageInfo) => {
        result.totalItems += items.length;

        const skuList = items.map(i => i.sku).filter(Boolean);
        const existingImagesMap = new Map<string, string[]>();
        if (skuList.length > 0) {
          const { data: existingRows, error: existingErr } = await supabase
            .from("products")
            .select("sku, images")
            .in("sku", skuList as string[]);

          if (existingErr) {
            console.warn("[WPS Sync] Existing image fetch warning:", existingErr.message);
          } else {
            for (const row of existingRows ?? []) {
              if (row.sku) existingImagesMap.set(row.sku, row.images ?? []);
            }
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
