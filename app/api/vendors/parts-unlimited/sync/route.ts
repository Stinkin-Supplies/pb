export const runtime = "nodejs";

// ============================================================
// app/api/vendors/parts-unlimited/sync/route.ts
// ============================================================
// Downloads the Parts Unlimited price file via v2 Basic Auth
// (single request — safest for 2-pull-per-day limit).
//
// COOLDOWN GUARD: Refuses to run if a successful sync already
// completed within the last 10 hours. Protects your 2-pull limit
// from cron double-fires, dashboard double-clicks, or retries.
//
// To force override: send header  x-force-sync: true
//
// Required env vars:
//   PARTS_UNLIMITED_DEALER_NUMBER
//   PARTS_UNLIMITED_USERNAME
//   PARTS_UNLIMITED_PASSWORD
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   SYNC_SECRET
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { db } from "@/lib/supabase/admin";
import getCatalogDb from "@/lib/db/catalog";
import {
  buildPUAuthHeader,
  parseCSV,
  mapBaseRow,
  mapDealerRow,
  mapToProduct,
  isActivePart,
} from "@/lib/vendors/partsUnlimited";

const PU_API_URL      = "https://dealer.parts-unlimited.com/api/quotes/v2/pricefile";
const BATCH_SIZE      = 500;
const COOLDOWN_HOURS  = 10; // 2 pulls/day = max one per 12h; we use 10h for flexibility

// Product codes to import — remove any categories you don't sell
const ALLOWED_PRODUCT_CODES = new Set([
  "A",  // Street motorcycles
  "AI", // Icon Lifestyle
  "C",  // Common Parts
  "D",  // ATV
  "DM", // Moose ATV
  "E",  // Drag Specialties
  "F",  // MX / Off-Road
  "FM", // Moose Off-Road
  "FT", // Thor Apparel
  "H",  // Scooter
]);

// ── Sync log helpers ──────────────────────────────────────────

async function getLastSuccessfulSync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ completed_at: string } | null> {
  const { data } = await (supabase as any)
    .from("sync_log")
    .select("completed_at")
    .eq("vendor", "parts-unlimited")
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function writeSyncLog(supabase: any, entry: Record<string, unknown>) {
  try {
    await (supabase as any)
      .from("sync_log")
      .insert({
        vendor:       "parts-unlimited",
        completed_at: new Date().toISOString(),
        ...entry,
      });
  } catch (e: any) {
    console.warn("[PU Sync] Failed to write sync log:", e.message);
  }
}

// ── POST: run the sync ────────────────────────────────────────

export async function POST(req: Request) {
  const start = Date.now();

  // ── Auth ─────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Env vars ──────────────────────────────────────────────────
  const dealerNumber = process.env.PARTS_UNLIMITED_DEALER_NUMBER;
  const username     = process.env.PARTS_UNLIMITED_USERNAME;
  const password     = process.env.PARTS_UNLIMITED_PASSWORD;

  if (!dealerNumber || !username || !password) {
    return NextResponse.json(
      { error: "Missing PARTS_UNLIMITED credentials in environment." },
      { status: 500 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── COOLDOWN GUARD ────────────────────────────────────────────
  // Checks the sync_log table for the last successful sync.
  // If it ran within COOLDOWN_HOURS, block this request entirely.
  // Pass header  x-force-sync: true  to override (use with caution).
  const forceOverride = req.headers.get("x-force-sync") === "true";

  if (!forceOverride) {
    const lastSync = await getLastSuccessfulSync(supabase as any);

    if (lastSync) {
      const lastSyncDate   = new Date(lastSync.completed_at);
      const hoursSinceLast = (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLast < COOLDOWN_HOURS) {
        const nextAllowedAt  = new Date(lastSyncDate.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
        const hoursRemaining = (COOLDOWN_HOURS - hoursSinceLast).toFixed(1);

        console.warn(
          `[PU Sync] BLOCKED — last sync ${hoursSinceLast.toFixed(1)}h ago. ` +
          `Cooldown: ${COOLDOWN_HOURS}h. ${hoursRemaining}h remaining.`
        );

        return NextResponse.json(
          {
            error:           "Sync cooldown active — protecting your 2 pulls/day limit.",
            last_sync_at:    lastSync.completed_at,
            next_allowed_at: nextAllowedAt.toISOString(),
            hours_remaining: parseFloat(hoursRemaining),
            cooldown_hours:  COOLDOWN_HOURS,
            tip:             "To override (use sparingly!), send header: x-force-sync: true",
          },
          { status: 429 }
        );
      }
    }
  } else {
    console.warn("[PU Sync] ⚠ Force override active — cooldown bypassed. Use sparingly!");
  }

  console.log("[PU Sync] Starting sync...");

  try {
    // ── Step 1: Load price files (local if available, otherwise API) ──
    let baseCSV: string;
    let dealerCSV: string | null = null;

    const localBase   = path.join(process.cwd(), "data/pu/BasePriceFile.csv");
    const localDealer = path.join(process.cwd(), "data/pu/D00108_PriceFile.csv");

    if (fs.existsSync(localBase) && fs.existsSync(localDealer)) {
      console.log("[PU Sync] Using local files from data/pu/");
      baseCSV   = fs.readFileSync(localBase, "utf-8");
      dealerCSV = fs.readFileSync(localDealer, "utf-8");
    } else {
      // ── Download ZIP from Parts Unlimited ────────────
      console.log("[PU Sync] Downloading price file ZIP...");

      const puResponse = await fetch(PU_API_URL, {
        method: "POST",
        headers: {
          Authorization:  buildPUAuthHeader(dealerNumber, username, password),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dealerCodes:      [dealerNumber],
          headersPrepended: true,
          auxillaryColumns: [
            "PRODUCT_CODE",
            "BRAND_NAME",
            "WEIGHT",
            "COUNTRY_OF_ORIGIN",
            "UPC_CODE",
            "COMMODITY_CODE",
            "DRAG_PART",
            "CLOSEOUT_CATALOG_INDICATOR",
          ],
        }),
      });

      if (!puResponse.ok) {
        const errText = await puResponse.text();
        console.error("[PU Sync] API error:", puResponse.status, errText);

        await writeSyncLog(supabase as any, {
          status:        "error",
          total_parts:   0,
          upserted:      0,
          skipped:       0,
          discontinued:  0,
          errors:        0,
          duration_ms:   Date.now() - start,
          error_message: `HTTP ${puResponse.status}: ${errText}`,
        });

        return NextResponse.json(
          { error: `Parts Unlimited API returned ${puResponse.status}: ${errText}` },
          { status: 502 }
        );
      }

      // ── Extract ZIP ───────────────────────────────────
      console.log("[PU Sync] Extracting ZIP...");
      const zipBuffer  = Buffer.from(await puResponse.arrayBuffer());
      const zip        = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      console.log("[PU Sync] ZIP contains:", zipEntries.map((e) => e.entryName).join(", "));

      const baseEntry = zipEntries.find((e) =>
        e.entryName.toLowerCase().includes("basepricefile")
      );
      const dealerEntry = zipEntries.find(
        (e) =>
          e.entryName.toLowerCase().includes("pricefile") &&
          !e.entryName.toLowerCase().includes("base")
      );

      if (!baseEntry) {
        return NextResponse.json(
          { error: "BasePriceFile.csv not found in ZIP" },
          { status: 500 }
        );
      }

      baseCSV = baseEntry.getData().toString("utf-8");
      dealerCSV = dealerEntry ? dealerEntry.getData().toString("utf-8") : null;
    }

    // ── Step 2: Parse CSVs ────────────────────────────────────
    console.log("[PU Sync] Parsing BasePriceFile.csv...");
    const baseRows = parseCSV(baseCSV);
    console.log(`[PU Sync] ${baseRows.length.toLocaleString()} parts in catalog`);

    // Dealer price lookup: partNumber → your dealer price
    const dealerPriceMap = new Map<string, number>();
    if (dealerCSV) {
      console.log("[PU Sync] Parsing dealer price file...");
      const dealerRows = parseCSV(dealerCSV);
      for (const row of dealerRows) {
        const mapped = mapDealerRow(row);
        if (mapped.partNumber) {
          dealerPriceMap.set(mapped.partNumber, mapped.yourDealerPrice);
        }
      }
      console.log(`[PU Sync] ${dealerPriceMap.size.toLocaleString()} dealer prices loaded`);
    } else {
      console.warn("[PU Sync] No dealer price file found — falling back to base prices");
    }

    // ── Step 4: Ensure vendor row exists ─────────────────────
    let vendorId: string;
    {
      const { data: existing } = await supabase
        .from("vendors")
        .select("id")
        .eq("slug", "parts-unlimited")
        .maybeSingle();

      if (existing) {
        vendorId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase
          .from("vendors")
          .insert({
            name: "Parts Unlimited",
            slug: "parts-unlimited",
            avg_ship_time_days: 2,
            integration_method: "api",
          })
          .select("id")
          .single();

        if (createErr || !created) {
          return NextResponse.json(
            { error: "Could not create vendor row: " + createErr?.message },
            { status: 500 }
          );
        }
        vendorId = created.id;
      }
    }

    // ── Step 5: Process & batch upsert ───────────────────────
    if (baseRows.length > 0) {
      console.log("[PU Sync] First row keys:", Object.keys(baseRows[0]));
      console.log("[PU Sync] First row sample:", baseRows[0]);
    }

    const result = {
      totalParts:   baseRows.length,
      upserted:     0,
      skipped:      0,
      discontinued: 0,
      errors:       0,
      durationMs:   0,
    };

    const products: ReturnType<typeof mapToProduct>[] = [];
    let batch: ReturnType<typeof mapToProduct>[] = [];

    // ── 1. Collect unique brand names ─────────────────────────
    const uniqueBrands = [
      ...new Set(
        baseRows.map((row) => {
          const p = mapBaseRow(row);
          return p.brandName || "Parts Unlimited";
        })
      ),
    ];

    // ── 2. Upsert brands and fetch their IDs ──────────────────
    const catalogDb = getCatalogDb();
    for (const name of uniqueBrands) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await catalogDb.query(
        `INSERT INTO brands (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [name, slug]
      ).catch(() => {});
    }

    // Keep Supabase brand fetch for brand_id FK
    const { error: brandErr } = await (supabase as any)
      .from("brands")
      .upsert(
        uniqueBrands.map((name) => ({
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        })),
        { onConflict: "name" }
      );
    if (brandErr) console.warn("[PU Sync] Brand upsert warning:", brandErr.message);

    const { data: brandRows } = await (supabase as any)
      .from("brands")
      .select("id, name")
      .in("name", uniqueBrands);

    const brandMap: Record<string, string> = {};
    for (const b of (brandRows ?? [])) {
      brandMap[b.name] = b.id;
    }
    console.log("[PU Sync] Brand map loaded:", Object.keys(brandMap).length, "brands");

    const flushBatch = async () => {
      if (batch.length === 0) return;
      const validBatch = batch.filter(
        (p: any) => p.sku?.trim() && p.part_number?.trim() && p.brand_id
      );
      if (validBatch.length === 0) { batch = []; return; }

      const catalogDb = getCatalogDb();

      for (const item of validBatch) {
        const i = item as any;
        try {
          await catalogDb.query(
            `INSERT INTO products (
              sku, part_number, upc, upc_code, name, slug,
              vendor_id, vendor_sku, brand_id, brand_name, category_name,
              our_price, map_price, map_floor, msrp, compare_at_price,
              dealer_cost, in_stock, stock_quantity, total_qty,
              weight_lbs, country_of_origin, commodity_code, product_code,
              wi_qty, ny_qty, tx_qty, nv_qty, nc_qty,
              hazardous_code, truck_only, is_map, is_drag_specialties,
              is_closeout, is_new, part_add_date,
              status, condition, last_synced_at, updated_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
              $21,$22,$23,$24,$25,$26,$27,$28,$29,
              $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40
            )
            ON CONFLICT (sku) DO UPDATE SET
              name             = EXCLUDED.name,
              our_price        = EXCLUDED.our_price,
              map_price        = EXCLUDED.map_price,
              map_floor        = EXCLUDED.map_floor,
              dealer_cost      = EXCLUDED.dealer_cost,
              in_stock         = EXCLUDED.in_stock,
              stock_quantity   = EXCLUDED.stock_quantity,
              total_qty        = EXCLUDED.total_qty,
              wi_qty           = EXCLUDED.wi_qty,
              ny_qty           = EXCLUDED.ny_qty,
              tx_qty           = EXCLUDED.tx_qty,
              nv_qty           = EXCLUDED.nv_qty,
              nc_qty           = EXCLUDED.nc_qty,
              is_new           = EXCLUDED.is_new,
              is_closeout      = EXCLUDED.is_closeout,
              last_synced_at   = EXCLUDED.last_synced_at,
              updated_at       = EXCLUDED.updated_at
            WHERE products.updated_manually = false`,
            [
              i.sku, i.part_number, i.upc, i.upc_code, i.name, i.slug,
              i.vendor_id, i.vendor_sku, i.brand_id, i.brand_name, i.category_name,
              i.our_price, i.map_price, i.map_floor, i.msrp, i.compare_at_price,
              i.dealer_cost, i.in_stock, i.stock_quantity, i.total_qty,
              i.weight_lbs, i.country_of_origin, i.commodity_code, i.product_code,
              i.wi_qty ?? 0, i.ny_qty ?? 0, i.tx_qty ?? 0, i.nv_qty ?? 0, i.nc_qty ?? 0,
              i.hazardous_code, i.truck_only, i.is_map, i.is_drag_specialties,
              i.is_closeout, i.is_new, i.part_add_date,
              i.status ?? 'active', i.condition ?? 'new',
              new Date().toISOString(), new Date().toISOString(),
            ]
          );
          result.upserted += 1;
        } catch (err: any) {
          console.error("[PU Sync] Row error:", i.sku, err.message);
          result.errors += 1;
        }
      }
      batch = [];
    };

    for (const row of baseRows) {
      const part = mapBaseRow(row);

      // Skip rows with no SKU
      if (!part.partNumber.trim()) {
        result.skipped++;
        continue;
      }

      // Skip product codes outside your catalog
      if (
        part.productCode.trim() &&
        !ALLOWED_PRODUCT_CODES.has(part.productCode.trim())
      ) {
        result.skipped++;
        continue;
      }

      // Count discontinued (still upserted as inactive)
      if (!isActivePart(part.partStatus)) {
        result.discontinued++;
      }

      const dealerPrice = dealerPriceMap.get(part.partNumber) ?? 0;
      const product = mapToProduct(part, dealerPrice, vendorId) as any;
      product.brand_id =
        brandMap[product.brand_name] ??
        brandMap["Parts Unlimited"] ??
        null;
      products.push(product);
      batch.push(product);

      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
        console.log(
          `[PU Sync] Progress — upserted: ${result.upserted.toLocaleString()} | ` +
          `skipped: ${result.skipped.toLocaleString()} | ` +
          `errors: ${result.errors}`
        );
      }
    }

    // Flush final batch
    await flushBatch();
    result.durationMs = Date.now() - start;

    // After products are upserted — run MAP check logging
    const violationCount = await db.logMapCheckBulk(products, "sync");
    console.log(
      `[PU Sync] MAP check complete — ${violationCount ?? 0} violations logged`
    );

    // Refresh cached facets after all writes complete
    await supabase.rpc("refresh_facets_cache");

    // ── Step 6: Write success to sync log ────────────────────
    await writeSyncLog(supabase as any, {
      status:       "success",
      total_parts:  result.totalParts,
      upserted:     result.upserted,
      skipped:      result.skipped,
      discontinued: result.discontinued,
      errors:       result.errors,
      duration_ms:  result.durationMs,
    });

    console.log("[PU Sync] Complete:", result);
    return NextResponse.json({ success: true, summary: result });

  } catch (err: any) {
    console.error("[PU Sync] Fatal error:", err);

    await writeSyncLog(supabase as any, {
      status:        "error",
      total_parts:   0,
      upserted:      0,
      skipped:       0,
      discontinued:  0,
      errors:        1,
      duration_ms:   Date.now() - start,
      error_message: err?.message ?? "Unknown error",
    });

    return NextResponse.json(
      { error: err?.message ?? "Unknown error during sync" },
      { status: 500 }
    );
  }
}

// ── GET: current status & cooldown info ───────────────────────

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
    getCatalogDb().query(
      `SELECT COUNT(*) FROM products WHERE status = 'active'`
    ).then(r => ({ count: parseInt(r.rows[0].count, 10) }))
     .catch(() => ({ count: 0 })),
    (supabase as any)
      .from("sync_log")
      .select("*")
      .eq("vendor", "parts-unlimited")
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);

  const lastSuccess = (logsRes.data ?? []).find((l: any) => l.status === "success");
  const hoursSince  = lastSuccess?.completed_at
    ? (Date.now() - new Date(lastSuccess.completed_at).getTime()) / (1000 * 60 * 60)
    : null;
  const canSyncNow  = hoursSince === null || hoursSince >= COOLDOWN_HOURS;
  const nextAllowed = lastSuccess?.completed_at
    ? new Date(
        new Date(lastSuccess.completed_at).getTime() + COOLDOWN_HOURS * 60 * 60 * 1000
      ).toISOString()
    : null;

  return NextResponse.json({
    totalActiveProducts: productsRes.count ?? 0,
    cooldownHours:       COOLDOWN_HOURS,
    canSyncNow,
    hoursSinceLastSync:  hoursSince ? parseFloat(hoursSince.toFixed(1)) : null,
    nextAllowedAt:       nextAllowed,
    recentLogs:          logsRes.data ?? [],
  });
}
