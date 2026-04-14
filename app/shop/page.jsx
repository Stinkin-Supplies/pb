// ============================================================
// app/shop/page.jsx  —  SERVER COMPONENT
// ============================================================
// Default shop experience is Harley-first.
// Add ?view=classic to access the legacy catalog grid.
// ============================================================

import HarleySearchClient from "../harley/HarleySearchClient";
import { HARLEY_STYLES } from "@/lib/harley/config";
import ShopClient from "./ShopClient";

const PAGE_SIZE = 48;

export default async function ShopPage({ searchParams }) {
  const p        = await searchParams;
  const view     = p?.view     ?? "harley";
  const category = p?.category ?? null;
  const brand    = p?.brand    ?? null;
  const sort     = p?.sort     ?? "newest";

  if (view !== "classic") {
    return (
      <HarleySearchClient
        initialStyles={HARLEY_STYLES}
      />
    );
  }

  let products = [];
  let total    = 0;
  let facets   = { categories: [], brands: [], priceRange: { min: 0, max: 0 } };

  try {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), sort });
    if (category) params.set("category", category);
    if (brand)    params.set("brand",    brand);

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const res  = await fetch(`${baseUrl}/api/search?${params}`, { cache: "no-store" });
    const data = await res.json();

    products = data.products ?? [];
    total    = data.total    ?? 0;
    facets   = data.facets   ?? facets;
  } catch (err) {
    console.error("[ShopPage]", err.message);
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
  title:       "Shop Harley Parts | Stinkin' Supplies",
  description: "Shop Harley parts by style, model, and exact submodel fitment.",
};
