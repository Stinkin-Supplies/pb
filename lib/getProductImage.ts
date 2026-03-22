type ProductImageInput = {
  image?: string | null;
  images?: string[] | null;
};

const FALLBACK_IMAGE = "/file.svg";

export function getProductImage(product?: ProductImageInput | null) {
  if (!product) return FALLBACK_IMAGE;

  const direct = typeof product.image === "string" ? product.image.trim() : "";
  if (direct) return direct;

  const first = Array.isArray(product.images) ? product.images.find(img => !!img?.trim()) : null;
  if (first) return first;

  return FALLBACK_IMAGE;
}
