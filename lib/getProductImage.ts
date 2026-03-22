type ProductImageInput = {
  image?: string | null;
  images?: string[] | null;
  brand_name?: string | null;
};

const FALLBACK_IMAGE = "/placeholder-product.png";
const BRAND_FALLBACKS: Record<string, string> = {
  "drag specialties": "/brands/drag-specialties.png",
};

export function getProductImage(product?: ProductImageInput | null) {
  if (!product) return FALLBACK_IMAGE;

  const direct = typeof product.image === "string" ? product.image.trim() : "";
  if (direct) return direct;

  const first = Array.isArray(product.images) ? product.images.find(img => !!img?.trim()) : null;
  if (first) return first;

  const brand = typeof product.brand_name === "string" ? product.brand_name.trim().toLowerCase() : "";
  if (brand && BRAND_FALLBACKS[brand]) return BRAND_FALLBACKS[brand];

  return FALLBACK_IMAGE;
}
