// lib/vendors/wps.ts
// ============================================================
// Western Power Sports (WPS) API v4 client — types, helpers,
// pagination, product mapper.
//
// Docs: https://www.wps-inc.com/data-depot/v4/api/introduction
// Base: https://api.wps-inc.com
//
// Required env var:
//   WPS_API_KEY — your Bearer token from the WPS Data Depot
// ============================================================

// ── Constants ─────────────────────────────────────────────────

export const WPS_API_BASE  = "https://api.wps-inc.com";
export const WPS_CDN_BASE  = "https://media.wps-inc.com"; // image CDN prefix
export const WPS_PAGE_SIZE = 50;                           // max per WPS docs

// WPS item statuses → our product status
export const WPS_STATUS_MAP: Record<string, string> = {
  active:       "active",
  inactive:     "discontinued",
  discontinued: "discontinued",
  closeout:     "active", // still sellable
};

// ── TypeScript Types ──────────────────────────────────────────

export interface WpsImage {
  id:        number;
  item_id?:  number;
  main:      boolean;
  /** CDN domain, e.g. "cdn.wpsstatic.com/" */
  domain?:   string;
  /** path segment, e.g. "images/" */
  path:      string;
  /** filename, e.g. "6dde-59cd72ea6f409.jpg" */
  filename?: string;
  alt?:      string | null;
  mime?:     string;
  width?:    number;
  height?:   number;
  /** style bucket returned by items sideload: "thumb"|"small"|"large"|"full" */
  type?:     string;
  /** fully-qualified URL when present — use directly */
  url?:      string;
}

// WPS image sideload can come back as an array OR { data: [...] }
export type WpsImageList = WpsImage[] | { data?: WpsImage[] } | null | undefined;

export interface WpsInventoryWarehouse {
  id:             number;
  name:           string;
  availability:   number;
  /** "in_stock" | "out_of_stock" | "limited" */
  availability_status: string;
}

export interface WpsItem {
  id:                     number;
  sku:                    string;
  name:                   string;
  status:                 string;
  unit_of_measurement_id: number;
  brand_id:               number;
  product_id:             number;
  weight:                 number | null;
  length:                 number | null;
  width:                  number | null;
  height:                 number | null;
  description:            string | null;
  upc:                    string | null;
  country_code:           string | null;
  /** Dealer cost from items response */
  standard_dealer_price:  number | null;
  /** MSRP / list price */
  list_price:             number | null;
  /** MAP price (when has_map_policy = true) */
  mapp_price:             number | null;
  has_map_policy:         boolean | null;
  /** Sideloaded via ?include=images (array or { data: [...] }) */
  images?:                WpsImageList;
  /** Sideloaded via ?include=inventory */
  inventory?:             WpsInventoryWarehouse[];
  /** Sideloaded via ?include=product */
  product?:                WpsProduct;
}

export interface WpsProduct {
  id:          number;
  name:        string;
  status:      string;
  brand_id:    number;
  description: string | null;
  /** Sideloaded via ?include=items */
  items?:      WpsItem[];
}

export interface WpsBrand {
  id:   number;
  name: string;
  slug: string;
}

export interface WpsDealerPricingEntry {
  id:           number;
  item_id:      number;
  sku:          string;
  retail:       number;
  dealer_cost:  number;
  map_price:    number | null;
  is_map:       boolean;
}

export interface WpsPricingJobStatus {
  id:         string;
  status:     "pending" | "processing" | "complete" | "failed";
  /** Present when status === "complete" */
  download_url?: string;
}

export interface WpsCursorMeta {
  current: string | null;
  prev:    string | null;
  next:    string | null;
  count:   number;
}

export interface WpsListResponse<T> {
  data: T[];
  meta: { cursor: WpsCursorMeta };
}

export interface WpsCart {
  id:         string;
  status:     string;
  items:      WpsCartItem[];
  created_at: string;
}

export interface WpsCartItem {
  id:       string;
  sku:      string;
  quantity: number;
  price:    number;
}

export interface WpsOrder {
  id:                string;
  po_number:         string;
  status:            string;
  tracking_number:   string | null;
  carrier:           string | null;
  estimated_ship_date: string | null;
  created_at:        string;
  items:             WpsOrderItem[];
}

export interface WpsOrderItem {
  sku:       string;
  quantity:  number;
  unit_price: number;
}

export interface WpsCartSubmitPayload {
  po_number:   string;
  ship_to: {
    name:     string;
    address1: string;
    address2?: string;
    city:     string;
    state:    string;
    zip:      string;
    country:  string;
    phone:    string;
  };
  /** UPS Ground, UPS 2Day, FedEx Ground, etc. */
  shipping_method: string;
  notes?: string;
}

// ── API Client ────────────────────────────────────────────────

export class WpsClient {
  private readonly token: string;

  constructor(token?: string) {
    this.token = token ?? process.env.WPS_API_KEY ?? "";
    if (!this.token) throw new Error("WPS_API_KEY is not set");
  }

  private headers(): HeadersInit {
    return {
      Authorization:  `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
    };
  }

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    // Build query string manually — URL.searchParams encodes brackets as %5B%5D
    // but WPS requires raw brackets: page[size]=50 not page%5Bsize%5D=50
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const urlStr = `${WPS_API_BASE}${path}${qs ? `?${qs}` : ""}`;

    const MAX_RETRIES = 4;
    let lastErr: Error = new Error("unreachable");

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * 2 ** attempt, 16000); // 2s, 4s, 8s, cap 16s
        console.warn(`[WPS] Retry ${attempt}/${MAX_RETRIES - 1} for GET ${path} after ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
      }
      try {
        const res = await fetch(urlStr, { headers: this.headers() });
        if (!res.ok) {
          const text = await res.text();
          // Don't retry 4xx client errors — they won't improve
          if (res.status >= 400 && res.status < 500) {
            throw new Error(`WPS API ${res.status} on GET ${path}: ${text}`);
          }
          lastErr = new Error(`WPS API ${res.status} on GET ${path}: ${text}`);
          continue;
        }
        const text = await res.text();
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`WPS API returned invalid JSON on GET ${path}: ${text.slice(0, 200)}`);
        }
      } catch (err: unknown) {
        // Network-level error (fetch failed, ECONNRESET, etc.) — retry
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (lastErr.message.includes("400") || lastErr.message.includes("401") ||
            lastErr.message.includes("403") || lastErr.message.includes("404")) {
          throw lastErr; // Don't retry auth/not-found errors
        }
      }
    }
    throw lastErr;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${WPS_API_BASE}${path}`, {
      method:  "POST",
      headers: this.headers(),
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WPS API ${res.status} on POST ${path}: ${text}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`WPS API returned invalid JSON on POST ${path}: ${text.slice(0, 200)}`);
    }
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${WPS_API_BASE}${path}`, {
      method:  "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WPS API ${res.status} on DELETE ${path}: ${text}`);
    }
  }
}

// ── Pagination helper ─────────────────────────────────────────
// Iterates all pages of a cursor-paginated WPS endpoint,
// calling onPage() with each page's data array.
// Returns total record count processed.

export async function paginateAll<T>(
  client:   WpsClient,
  path:     string,
  params:   Record<string, string>,
  onPage:   (items: T[], pageNum: number, pageInfo: { cursor: string | null; nextCursor: string | null }) => Promise<void>,
  options?: { maxPages?: number; startCursor?: string | null; startPage?: number }
): Promise<{ total: number; pages: number }> {
  let cursor:  string | null = options?.startCursor ?? null;
  let page     = options?.startPage ?? 0;
  let total    = 0;
  const max    = options?.maxPages ?? Infinity;

  do {
    const reqParams: Record<string, string> = {
      ...params,
      "page[size]": String(WPS_PAGE_SIZE),
    };
    if (cursor) reqParams["page[cursor]"] = cursor;

    const res = await client.get<WpsListResponse<T>>(path, reqParams);
    page++;
    total += res.data.length;

    const nextCursor = res.meta?.cursor?.next ?? null;
    await onPage(res.data, page, { cursor, nextCursor });

    cursor = nextCursor;

    if (page >= max) break;
  } while (cursor);

  return { total, pages: page };
}

// ── Image URL builder ─────────────────────────────────────────

// Style preference order — use 1000_max for product images, fall back to full
const IMAGE_STYLE = "1000_max";

export function buildImageUrl(image: WpsImage): string {
  // Prefer explicit full URL if provided
  if (image.url && image.url.startsWith("http")) return image.url;

  // V4 API format: domain + style + "/" + path + filename
  if (image.domain && image.filename) {
    const domain = image.domain.replace(/\/$/, "");
    const path   = (image.path ?? "images").replace(/^\//, "").replace(/\/$/, "");
    return `https://${domain}/${IMAGE_STYLE}/${path}/${image.filename}`;
  }

  // Legacy fallback: prefix CDN base with path
  const p = image.path.startsWith("/") ? image.path : `/${image.path}`;
  return `${WPS_CDN_BASE}${p}`;
}

/** Returns image URLs sorted: main first, then by type preference */
function normalizeImageList(images: WpsImageList): WpsImage[] {
  if (Array.isArray(images)) return images;
  if (images && typeof images === "object") {
    const data = (images as { data?: WpsImage[] }).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

export function sortedImageUrls(images: WpsImageList): string[] {
  const order = ["full", "large", "small", "thumb"];
  const list = normalizeImageList(images);
  return [...list]
    .sort((a, b) => {
      if (a.main && !b.main) return -1;
      if (!a.main && b.main) return 1;
      const aIndex = order.indexOf(a.type ?? "");
      const bIndex = order.indexOf(b.type ?? "");
      const aRank = aIndex === -1 ? order.length : aIndex;
      const bRank = bIndex === -1 ? order.length : bIndex;
      return aRank - bRank;
    })
    .map(buildImageUrl);
}

// ── Slug builder ──────────────────────────────────────────────

export function slugifyWps(name: string, sku: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 60)
    .replace(/-$/, "");

  const suffix = sku
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-$/, "");

  return `${base}-${suffix}`;
}

// ── Product mapper ────────────────────────────────────────────
// Maps a WPS Item + optional brand name + dealer price into
// the same shape as mapToProduct() in partsUnlimited.js so
// both vendors share one Supabase products table.

export interface WpsMappedProduct {
  sku:              string;
  part_number:      string;
  slug:             string;
  vendor_sku:       string;
  name:             string;
  brand_name:       string;
  category_name:    string;
  description:      string | null;
  our_price:        number;
  compare_at_price: number | null;
  map_price:        number | null;
  map_floor:        number;
  condition:        string;
  dealer_cost:      number;
  stock_quantity:   number;
  in_stock:         boolean;
  status:           string;
  ca_qty:           number;
  ga_qty:           number;
  id_qty:           number;
  in_qty:           number;
  pa_qty:           number;
  tx_qty:           number;
  weight_lbs:       number | null;
  upc_code:         string | null;
  country_of_origin: string | null;
  hazardous_code:   null;
  truck_only:       false;
  is_map:           boolean;
  is_drag_specialties: false;
  is_closeout:      boolean;
  is_new:           false;
  images:           string[];
  vendor_id:        string;
  last_synced_at:   string;
  // WPS-specific extras
  wps_item_id:      number;
  wps_product_id:   number;
}

export function mapWpsItemToProduct(
  item:       WpsItem,
  pricing:    WpsDealerPricingEntry | null,  // kept for back-compat, item fields preferred
  brandName:  string,
  vendorId:   string
): WpsMappedProduct {
  // Prefer pricing fields embedded on the item (WPS API v4 items response)
  // Fall back to the separate pricing map entry if item fields are absent
  const cost     = item.standard_dealer_price ?? pricing?.dealer_cost ?? 0;
  const retail   = item.list_price            ?? pricing?.retail      ?? 0;
  const isMap    = item.has_map_policy        ?? pricing?.is_map      ?? false;
  const mapPrice = item.mapp_price            ?? pricing?.map_price   ?? null;
  const rawPrice = cost > 0
    ? Math.max(cost * 1.35, retail * 0.70)  // protect margin when pricing engine is missing
    : retail * 0.75;
  const ourPrice = isMap && mapPrice && mapPrice > 0
    ? Math.max(rawPrice, mapPrice)
    : rawPrice;

  const inv = (item.inventory as any)?.data ?? {};
  const caQty = inv.ca_warehouse ?? 0;
  const gaQty = inv.ga_warehouse ?? 0;
  const idQty = inv.id_warehouse ?? 0;
  const inQty = inv.in_warehouse ?? 0;
  const paQty = inv.pa_warehouse ?? 0;
  const txQty = inv.tx_warehouse ?? 0;
  const totalStock = inv.total ?? (
    caQty +
    gaQty +
    idQty +
    inQty +
    paQty +
    (inv.pa2_warehouse ?? 0) +
    txQty
  );

  const images = item.images ? sortedImageUrls(item.images) : [];

  return {
    sku:               item.sku,
    part_number:       item.sku,
    slug:              slugifyWps(item.name, item.sku),
    vendor_sku:        item.sku,
    name:              item.name,
    brand_name:        brandName || "WPS",
    category_name:     "General",          // enriched by Typesense/taxonomy later
    description:       item.product?.description ?? item.description ?? null,
    our_price:         parseFloat(ourPrice.toFixed(2)),
    compare_at_price:  retail > 0 ? retail : null,
    map_price:         mapPrice,
    map_floor:         mapPrice ?? parseFloat(ourPrice.toFixed(2)),
    condition:         "new",
    dealer_cost:       cost,
    stock_quantity:    totalStock,
    in_stock:          totalStock > 0,
    status:            WPS_STATUS_MAP[item.status] ?? "active",
    ca_qty:            caQty,
    ga_qty:            gaQty,
    id_qty:            idQty,
    in_qty:            inQty,
    pa_qty:            paQty,
    tx_qty:            txQty,
    weight_lbs:        item.weight ?? null,
    upc_code:          item.upc ?? null,
    country_of_origin: item.country_code ?? null,
    hazardous_code:    null,
    truck_only:        false,
    is_map:            isMap,
    is_drag_specialties: false,
    is_closeout:       item.status === "closeout",
    is_new:            false,
    images,
    vendor_id:         vendorId,
    last_synced_at:    new Date().toISOString(),
    // WPS-specific (store for order routing)
    wps_item_id:       item.id,
    wps_product_id:    item.product_id,
  };
}

// ── Dealer pricing helpers ────────────────────────────────────
// WPS pricing is an async job: POST to request it, poll until
// complete, then download the JSON file.

export async function requestPricingJob(client: WpsClient): Promise<string> {
  // WPS dealer pricing is a GET that returns a download URL directly
  const res = await client.get<{ data: WpsPricingJobStatus }>("/items/pricing");
  if (res.data?.download_url) return res.data.download_url;
  // If async job, return the job id to poll
  return res.data?.id ?? "";
}

export async function pollPricingJob(
  client:      WpsClient,
  jobId:       string,
  maxAttempts  = 30,
  intervalMs   = 10_000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await client.get<{ data: WpsPricingJobStatus }>(
      `/items/pricing/${jobId}`
    );
    const job = res.data;

    if (job.status === "complete" && job.download_url) {
      return job.download_url;
    }
    if (job.status === "failed") {
      throw new Error(`WPS pricing job ${jobId} failed`);
    }

    // Wait before next poll
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`WPS pricing job ${jobId} timed out after ${maxAttempts} attempts`);
}

export async function downloadPricingData(
  downloadUrl: string
): Promise<WpsDealerPricingEntry[]> {
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Failed to download WPS pricing data: ${res.status}`);
  let pricingData: unknown;
  try {
    const text = await res.text();
    if (text && text.trim()) {
      pricingData = JSON.parse(text);
    } else {
      throw new Error("Empty response");
    }
  } catch (err) {
    console.log("[WPS Sync] Pricing job failed, using retail fallback");
    return [];
  }

  // WPS returns either { data: [...] } or a raw array
  return Array.isArray(pricingData) ? pricingData : ((pricingData as any).data ?? []);
}

/** Builds a sku → pricing entry lookup map */
export function buildPricingMap(
  entries: WpsDealerPricingEntry[]
): Map<string, WpsDealerPricingEntry> {
  const map = new Map<string, WpsDealerPricingEntry>();
  for (const e of entries) {
    if (e.sku) map.set(e.sku, e);
  }
  return map;
}
