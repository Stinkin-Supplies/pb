export type HarleyProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  msrp?: number | null;
  map_price?: number | null;
  in_stock: boolean;
  stock_quantity: number;
  image_url?: string | null;
  image_urls?: string[] | null;
  description?: string | null;
  vendor?: string | null;
  source_vendor?: string | null;
  fitment_year_start?: number | null;
  fitment_year_end?: number | null;
  is_harley_fitment?: boolean;
};

export function normalizeHarleyProductRow(row: any): HarleyProduct {
  const price = Number(row.price ?? row.computed_price ?? row.msrp ?? row.cost ?? 0);
  const stockQuantity = Number(row.stock_quantity ?? row.stockQty ?? 0);

  return {
    id: String(row.id),
    sku: row.internal_sku ?? row.sku ?? String(row.id),
    slug: row.slug ?? row.sku ?? String(row.id),
    name: row.name ?? "",
    brand: row.brand ?? row.display_brand ?? "",
    category: row.category ?? "",
    price,
    msrp: row.msrp != null ? Number(row.msrp) : null,
    map_price: row.map_price != null ? Number(row.map_price) : null,
    in_stock: row.in_stock ?? stockQuantity > 0,
    stock_quantity: stockQuantity,
    image_url: row.image_url ?? row.image ?? null,
    image_urls: row.image_urls ?? row.images ?? null,
    description: row.description ?? null,
    vendor: row.vendor ?? row.source_vendor ?? null,
    source_vendor: row.source_vendor ?? row.vendor ?? null,
    fitment_year_start: row.fitment_year_start ?? null,
    fitment_year_end: row.fitment_year_end ?? null,
    is_harley_fitment: row.is_harley_fitment ?? false,
  };
}

export function productImageSource(product: HarleyProduct) {
  return product.image_url ?? product.image_urls?.[0] ?? null;
}
