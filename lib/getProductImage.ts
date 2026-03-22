type ProductImageInput = {
  image?: string | null;
  images?: string[] | null;
  brand_name?: string | null;
  brand?: string | null;
};

const FALLBACK_IMAGE = "/placeholder-product.png";
const BRAND_FALLBACKS: Record<string, string> = {
  "drag specialties": "/brands/drag-specialties.png",
};

function isRealImage(url: string) {
  if (!url || !url.startsWith("http")) return false;

  const lower = url.toLowerCase();

  // reject known bad patterns
  if (
    lower.includes(".zip") ||
    lower.includes("download") ||
    lower.includes("asset")
  ) return false;

  // accept known image formats
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg")
  );
}

export function filterImageUrls(urls?: (string | null)[] | null) {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u): u is string => typeof u === "string" && isRealImage(u));
}

export function getProductImage(product?: ProductImageInput | null) {
  if (!product) return FALLBACK_IMAGE;

  const direct = typeof product.image === "string" ? product.image.trim() : "";
  if (direct && isRealImage(direct)) return direct;

  const first = filterImageUrls(product.images)[0] ?? null;
  if (first) return first;

  const brandSource = (product.brand_name ?? product.brand) ?? "";
  const brand = typeof brandSource === "string" ? brandSource.trim().toLowerCase() : "";
  if (brand && BRAND_FALLBACKS[brand]) return BRAND_FALLBACKS[brand];

  return FALLBACK_IMAGE;
}
