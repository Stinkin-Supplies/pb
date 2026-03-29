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

function isRealImage(url: string) {
  if (!url || !url.startsWith("http")) return false;

  const lower = url.toLowerCase();

  // reject zip files only
  if (lower.includes(".zip")) return false;

  // accept known CDN domains directly — these work in browser without proxy
  if (lower.includes("wpsstatic.com")) return true;
  if (lower.includes("lemansnet.com")) return true;

  // accept standard image extensions
  return (
    lower.endsWith(".jpg")  ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png")  ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")  ||
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
