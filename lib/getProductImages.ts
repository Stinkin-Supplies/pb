type CatalogMediaItem = {
  url?: string | null;
  media_type?: string | null;
  is_primary?: boolean | null;
};

type ProductWithCatalogMedia = {
  catalog_media?: CatalogMediaItem[] | null;
};

export function getProductImages(product: ProductWithCatalogMedia | null | undefined): {
  primaryImage: string | null;
  gallery: string[];
} {
  const media = Array.isArray(product?.catalog_media) ? product.catalog_media : [];

  const gallery = media
    .filter((m) => m?.media_type === "image")
    .map((m) => (typeof m?.url === "string" ? m.url : null))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const primaryMedia =
    media.find((m) => m?.is_primary && m?.media_type === "image" && typeof m?.url === "string" && m.url.length > 0) ||
    media.find((m) => m?.media_type === "image" && typeof m?.url === "string" && m.url.length > 0) ||
    null;

  const primaryImage = (primaryMedia && typeof primaryMedia.url === "string" ? primaryMedia.url : null) ?? gallery[0] ?? null;

  return { primaryImage, gallery };
}

