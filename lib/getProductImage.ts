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

const IMAGE_EXT_RE = /\.(avif|webp|png|jpe?g|gif|svg)(\?|#|$)/i;

function isProbablyImageUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/")) return true;
  return IMAGE_EXT_RE.test(trimmed);
}

export function filterImageUrls(urls?: (string | null)[] | null) {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u): u is string => typeof u === "string" && isProbablyImageUrl(u));
}

export function getProductImage(product?: ProductImageInput | null) {
  if (!product) return FALLBACK_IMAGE;

  const direct = typeof product.image === "string" ? product.image.trim() : "";
  if (direct && isProbablyImageUrl(direct)) return direct;

  const first = filterImageUrls(product.images)[0] ?? null;
  if (first) return first;

  const brandSource = (product.brand_name ?? product.brand) ?? "";
  const brand = typeof brandSource === "string" ? brandSource.trim().toLowerCase() : "";
  if (brand && BRAND_FALLBACKS[brand]) return BRAND_FALLBACKS[brand];

  return FALLBACK_IMAGE;
}
