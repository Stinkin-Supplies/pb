import { db } from "@/lib/supabase/client";
import ShopClient, { type NormalizedProduct } from "./ShopClient";

type SearchParams = {
  category?: string;
  brand?: string;
  q?: string;
};

type SupabaseProductRow = Record<string, unknown>;

type ShopPageProps = {
  searchParams?: Promise<SearchParams>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const resolvedParams: SearchParams = await (searchParams ?? Promise.resolve({}));
  const category = resolvedParams.category ?? null;
  const brand = resolvedParams.brand ?? null;
  const q = resolvedParams.q ?? null;

  let initialProducts: SupabaseProductRow[] = [];
  let fetchError: string | null = null;

  try {
    initialProducts = await db.getProducts({
      category: category ?? undefined,
      brand: brand ?? undefined,
      limit: 200,
    });
  } catch (err: unknown) {
    console.error("[ShopPage] db.getProducts failed:", (err as Error).message);
    fetchError = err instanceof Error ? err.message : "Unable to load products";
  }

  const brands = [...new Set(initialProducts
    .map(p => getStringField(p, ["brand", "brand_name"]))
    .filter(Boolean) as string[])]
    .sort();
  const categories = [...new Set(initialProducts
    .map(p => getStringField(p, ["category", "category_name"]))
    .filter(Boolean) as string[])]
    .sort();

  const normalized: NormalizedProduct[] = initialProducts.map(normalizeProductRow);

  return (
    <ShopClient
      initialProducts={normalized}
      availableBrands={brands}
      availableCategories={categories}
      initialCategory={category}
      initialBrand={brand}
      fetchError={fetchError}
    />
  );
}

function normalizeProductRow(row: SupabaseProductRow): NormalizedProduct {
  const id = Number(row.id ?? row.product_id ?? 0) || 0;
  const slug = getStringField(row, ["slug", "sku"]) ?? String(id);

  return {
    id,
    slug,
    name: getStringField(row, ["name", "title"]) ?? "Untitled Part",
    brand: getStringField(row, ["brand", "brand_name"]) ?? "Unknown",
    category: getStringField(row, ["category", "category_name"]) ?? "Uncategorized",
    price: Number(row.price ?? row.our_price ?? 0),
    was: Number(row.was ?? row.compare_at_price ?? row.map_price ?? 0) || null,
    badge: getStringField(row, ["badge"]) ?? (row.is_new ? "new" : null),
    inStock: Boolean(row.inStock ?? row.in_stock ?? true),
    fitmentIds: getNumberArrayField(row, ["fitmentIds", "fitment_ids"]) ?? null,
    image: getStringField(row, ["image", "primary_image_url"]) ?? null,
    mapPrice: Number(row.map_price ?? null) || null,
  };
}

function getNumberArrayField(row: SupabaseProductRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value) && value.every((x) => typeof x === "number")) {
      return value;
    }
  }
  return null;
}

function getStringField(row: SupabaseProductRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

export const metadata = {
  title: "Shop All Parts | Stinkin' Supplies",
  description: "Browse premium powersports parts with fitment filters and cart quick-add.",
};
