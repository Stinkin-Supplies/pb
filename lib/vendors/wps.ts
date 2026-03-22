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
  id:       number;
  item_id:  number;
  main:     boolean;
  /** relative path, prefix with WPS_CDN_BASE */
  path:     string;
  /** width × height bucket: "thumb" | "small" | "large" | "full" */
  type:     string;
  /** fully-qualified URL when present (preferred over constructing from path) */
  url?:     string;
}

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
  upc:                    string | null;
  country_code:           string | null;
  /** Sideloaded via ?include=images */
  images?:                WpsImage[];
  /** Sideloaded via ?include=inventory */
  inventory?:             WpsInventoryWarehouse[];
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

    const res = await fetch(urlStr, { headers: this.headers() });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WPS API ${res.status} on GET ${path}: ${text}`);
    }

    return res.json() as Promise<T>;
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

    return res.json() as Promise<T>;
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
  onPage:   (items: T[], pageNum: number) => Promise<void>,
  options?: { maxPages?: number }
): Promise<{ total: number; pages: number }> {
  let cursor:  string | null = null;
  let page     = 0;
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

    await onPage(res.data, page);

    cursor = res.meta?.cursor?.next ?? null;

    if (page >= max) break;
  } while (cursor);

  return { total, pages: page };
}

// ── Image URL builder ─────────────────────────────────────────

export function buildImageUrl(image: WpsImage): string {
  // If WPS gives us a full URL, use it directly
  if (image.url && image.url.startsWith("http")) return image.url;
  // Otherwise prefix the CDN base
  const p = image.path.startsWith("/") ? image.path : `/${image.path}`;
  return `${WPS_CDN_BASE}${p}`;
}

/** Returns image URLs sorted: main first, then by type preference */
export function sortedImageUrls(images: WpsImage[] | null | undefined): string[] {
  const order = ["full", "large", "small", "thumb"];
  const list = Array.isArray(images) ? images : [];
  return [...list]
    .sort((a, b) => {
      if (a.main && !b.main) return -1;
      if (!a.main && b.main) return 1;
      return order.indexOf(a.type) - order.indexOf(b.type);
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
  pricing:    WpsDealerPricingEntry | null,
  brandName:  string,
  vendorId:   string
): WpsMappedProduct {
  const cost     = pricing?.dealer_cost ?? 0;
  const retail   = pricing?.retail ?? 0;
  const isMap    = pricing?.is_map ?? false;
  const mapPrice = pricing?.map_price ?? null;
  const rawPrice = cost > 0 ? cost * 1.25 : retail * 0.65; // fallback margin
  const ourPrice = isMap && mapPrice ? Math.max(rawPrice, mapPrice) : rawPrice;

  const inventory = Array.isArray(item.inventory) ? item.inventory : [];
  const totalStock = inventory.reduce(
    (sum, w) => sum + (w.availability ?? 0), 0
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
    description:       null,
    our_price:         parseFloat(ourPrice.toFixed(2)),
    compare_at_price:  retail > 0 ? retail : null,
    map_price:         mapPrice,
    map_floor:         mapPrice ?? parseFloat(ourPrice.toFixed(2)),
    condition:         "new",
    dealer_cost:       cost,
    stock_quantity:    totalStock,
    in_stock:          totalStock > 0,
    status:            WPS_STATUS_MAP[item.status] ?? "active",
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
  const json = await res.json();
  // WPS returns either { data: [...] } or a raw array
  return Array.isArray(json) ? json : (json.data ?? []);
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
