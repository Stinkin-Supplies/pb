export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  WpsClient,
  WpsItem,
  WpsBrand,
  mapWpsItemToProduct,
} from "@/lib/vendors/wps";
import { mergeProductImages } from "@/lib/mergeProductImages";

type WebhookPayload = {
  item_id?: number;
  item_ids?: number[];
  sku?: string;
  skus?: string[];
  items?: WpsItem[];
  data?: {
    item_id?: number;
    sku?: string;
    items?: WpsItem[];
  };
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizePayload(body: WebhookPayload) {
  const itemIds = new Set<number>();
  const skus = new Set<string>();
  const items: WpsItem[] = [];

  const addSku = (value?: string) => {
    if (value && value.trim()) skus.add(value.trim());
  };

  const addItemId = (value?: number) => {
    if (typeof value === "number" && Number.isFinite(value)) itemIds.add(value);
  };

  addItemId(body.item_id);
  (body.item_ids ?? []).forEach(addItemId);
  addSku(body.sku);
  (body.skus ?? []).forEach(addSku);
  (body.items ?? []).forEach((i) => items.push(i));

  if (body.data) {
    addItemId(body.data.item_id);
    addSku(body.data.sku);
    (body.data.items ?? []).forEach((i) => items.push(i));
  }

  return {
    itemIds: [...itemIds],
    skus: [...skus],
    items,
  };
}

async function ensureWpsVendorId() {
  const { data: existing } = await supabaseAdmin
    .from("vendors")
    .select("id")
    .eq("slug", "wps")
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error: createErr } = await supabaseAdmin
    .from("vendors")
    .insert({
      name:               "Western Power Sports",
      slug:               "wps",
      avg_ship_time_days: 2,
      integration_method: "api",
    })
    .select("id")
    .single();

  if (createErr || !created) {
    throw new Error("Could not create WPS vendor row: " + createErr?.message);
  }

  return created.id as string;
}

export async function POST(req: Request) {
  try {
    const secret = process.env.WPS_WEBHOOK_SECRET;
    if (secret) {
      const headerSecret =
        req.headers.get("x-wps-webhook-secret") ??
        req.headers.get("x-webhook-secret") ??
        "";
      const authHeader = req.headers.get("authorization") ?? "";
      const bearer = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";
      if (headerSecret !== secret && bearer !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = (await req.json()) as WebhookPayload;
    const { itemIds, skus, items: payloadItems } = normalizePayload(body);

    if (itemIds.length === 0 && skus.length === 0 && payloadItems.length === 0) {
      return NextResponse.json(
        { error: "Missing item_id(s), sku(s), or items in webhook payload" },
        { status: 400 }
      );
    }

    const wps = new WpsClient();
    const vendorId = await ensureWpsVendorId();

    const resolvedItems: WpsItem[] = [...payloadItems];

    for (const id of itemIds) {
      const res = await wps.get<{ data: WpsItem }>(`/items/${id}`, {
        include: "inventory,product.images",
      });
      if (res?.data) resolvedItems.push(res.data);
    }

    for (const sku of skus) {
      const res = await wps.get<{ data: WpsItem[] }>("/items", {
        "filter[sku]": sku,
        include: "inventory,product.images",
      });
      if (Array.isArray(res?.data)) resolvedItems.push(...res.data);
    }

    if (resolvedItems.length === 0) {
      return NextResponse.json(
        { error: "No items resolved from webhook payload" },
        { status: 404 }
      );
    }

    const brandCache = new Map<number, string>();
    const mappedProducts = [];

    for (const item of resolvedItems) {
      const brandId = item.brand_id;
      let brandName = "WPS";
      if (brandId) {
        const cached = brandCache.get(brandId);
        if (cached) {
          brandName = cached;
        } else {
          const brandRes = await wps.get<{ data: WpsBrand }>(`/brands/${brandId}`);
          if (brandRes?.data?.name) {
            brandName = brandRes.data.name;
            brandCache.set(brandId, brandName);
          }
        }
      }

      const product = mapWpsItemToProduct(item, null, brandName, vendorId) as any;
      mappedProducts.push(product);
    }

    const uniqueBrandNames = [
      ...new Set(mappedProducts.map((p) => p.brand_name).filter(Boolean)),
    ];

    await supabaseAdmin
      .from("brands")
      .upsert(
        uniqueBrandNames.map((name) => ({
          name,
          slug: String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        })),
        { onConflict: "name" }
      );

    const { data: brandRows } = await supabaseAdmin
      .from("brands")
      .select("id, name")
      .in("name", uniqueBrandNames);

    const supabaseBrandMap: Record<string, string> = {};
    for (const b of brandRows ?? []) {
      if (b.name) supabaseBrandMap[b.name] = b.id;
    }

    const skuList = mappedProducts.map((p) => p.sku).filter(Boolean);
    const existingImagesMap = new Map<string, string[]>();
    if (skuList.length > 0) {
      const { data: existingRows } = await supabaseAdmin
        .from("products")
        .select("sku, images")
        .in("sku", skuList as string[]);
      for (const row of existingRows ?? []) {
        if (row.sku) existingImagesMap.set(row.sku, row.images ?? []);
      }
    }

    const upsertPayload = mappedProducts.map((p: any) => {
      const existingImages = existingImagesMap.get(p.sku) ?? [];
      const wpsImages = p.images ?? [];
      p.images = mergeProductImages({
        wps: wpsImages,
        pies: existingImages,
        pu: [],
      });
      p.brand_id = supabaseBrandMap[p.brand_name] ?? null;
      return p;
    });

    const { error } = await supabaseAdmin
      .from("products")
      .upsert(upsertPayload, { onConflict: "sku", ignoreDuplicates: false });

    if (error) {
      return NextResponse.json(
        { error: "Upsert failed: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      upserted: upsertPayload.length,
      skus: upsertPayload.map((p: any) => p.sku),
    });
  } catch (err: any) {
    console.error("[WPS Webhook] Error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown webhook error" },
      { status: 500 }
    );
  }
}
