import ShopClient from "../ShopClient";

const PAGE_SIZE = 48;

export default async function ClassicShopPage({ searchParams }) {
  const p = await searchParams;
  const category = p?.category ?? null;
  const brand = p?.brand ?? null;
  const sort = p?.sort ?? "newest";

  let products = [];
  let total = 0;
  let facets = { categories: [], brands: [], priceRange: { min: 0, max: 0 } };

  try {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), sort });
    if (category) params.set("category", category);
    if (brand) params.set("brand", brand);

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/products?${params}`, { cache: "no-store" });
    const data = await res.json();

    products = data.products ?? [];
    total = data.total ?? 0;
    facets = data.facets ?? facets;
  } catch (err) {
    console.error("[ClassicShopPage]", err.message);
  }

  return (
    <ShopClient
      initialProducts={products}
      initialFacets={facets}
      initialTotal={total}
      initialCategory={category}
      initialBrand={brand}
    />
  );
}

export const metadata = {
  title: "Classic Shop | Stinkin' Supplies",
  description: "Legacy storefront catalog view.",
};
