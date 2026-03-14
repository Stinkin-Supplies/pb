// ============================================================
// app/shop/[category]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Handles routes like:
//   /shop/engine-performance
//   /shop/exhaust-systems
//   /shop/brakes-wheels
//
// Slugifies the category name for clean URLs.
// Reuses ShopClient — just pre-filters by category.
//
// TODO Phase 5: replace mock with db.getProducts({ category })
// ============================================================

import { notFound } from "next/navigation";
import ShopClient from "../ShopClient";

// Map URL slugs → display names
const CATEGORY_MAP = {
  "engine-performance":    "Engine & Performance",
  "exhaust-systems":       "Exhaust Systems",
  "lighting-electrical":   "Lighting & Electrical",
  "body-fenders":          "Body & Fenders",
  "seats-comfort":         "Seats & Comfort",
  "brakes-wheels":         "Brakes & Wheels",
  "handlebars-controls":   "Handlebars & Controls",
  "tires-tubes":           "Tires & Tubes",
};

export default async function CategoryPage({ params }) {
  const { category } = await params;
  const categoryName = CATEGORY_MAP[category];

  // 404 if slug doesn't match a known category
  if (!categoryName) notFound();

  return (
    <ShopClient
      initialProducts={[]}
      availableBrands={[]}
      availableCategories={Object.values(CATEGORY_MAP)}
      initialCategory={categoryName}
      initialBrand={null}
      fetchError={null}
    />
  );
}

export async function generateMetadata({ params }) {
  const { category } = await params;
  const name = CATEGORY_MAP[category];
  if (!name) return { title: "Category Not Found" };
  return {
    title:       `${name} | Stinkin' Supplies`,
    description: `Shop ${name} — powersports parts and accessories.`,
  };
}

// Tell Next.js all valid category slugs at build time
export async function generateStaticParams() {
  return Object.keys(CATEGORY_MAP).map(slug => ({ category: slug }));
}
