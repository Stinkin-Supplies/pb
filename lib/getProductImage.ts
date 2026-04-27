type ProductImageInput = {
  image?: string | null;
  images?: string[] | null;
  brand_name?: string | null;
  brand?: string | null;
};

const FALLBACK_IMAGE = "/images/placeholder.jpg";
const BRAND_FALLBACKS: Record<string, string> = {
  "drag specialties": "/brands/drag-specialties.png",
};

function isLeMans(url: string) {
  return url.includes("lemansnet.com");
}

function isVTwin(url: string) {
  return url.includes("vtwinmfg.com");
}

function isRealImage(url: string) {
  if (!url || !url.startsWith("http")) return false;
  const lower = url.toLowerCase();
  if (lower.includes(".zip")) return false;
  if (isLeMans(url)) return true;
  return (
    lower.endsWith(".jpg")  ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png")  ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")  ||
    lower.endsWith(".svg")
  );
}

export function proxyImageUrl(url: string): string {
  if (!url) return FALLBACK_IMAGE;
  if (isLeMans(url) || isVTwin(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function filterImageUrls(urls?: (string | null)[] | null) {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u): u is string => typeof u === "string" && isRealImage(u));
}

export function getProductImage(product?: ProductImageInput | null) {
  if (!product) return FALLBACK_IMAGE;

  const direct = typeof product.image === "string" ? product.image.trim() : "";
  if (direct && isRealImage(direct)) return proxyImageUrl(direct);

  const first = filterImageUrls(product.images)[0] ?? null;
  if (first) return proxyImageUrl(first);

  const brandSource = (product.brand_name ?? product.brand) ?? "";
  const brand = typeof brandSource === "string" ? brandSource.trim().toLowerCase() : "";
  if (brand && BRAND_FALLBACKS[brand]) return BRAND_FALLBACKS[brand];

  return FALLBACK_IMAGE;
}
