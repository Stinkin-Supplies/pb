// ============================================================
// HOW TO HANDLE params / searchParams IN NEXT.JS 15+
// ============================================================
// Both `params` and `searchParams` are now Promises.
// You MUST await them before accessing any property.
// This affects every page.jsx that receives these props.
//
// ── SERVER COMPONENTS (async functions) ────────────────────
//
//   // Static route with searchParams: /shop?category=exhaust
//   export default async function Page({ searchParams }) {
//     const sp       = await searchParams;          // ← await first
//     const category = sp?.category ?? null;
//   }
//
//   // Dynamic route with params: /shop/[slug]
//   export default async function Page({ params }) {
//     const { slug } = await params;                // ← await first
//   }
//
//   // Both together
//   export default async function Page({ params, searchParams }) {
//     const { slug } = await params;
//     const sp       = await searchParams;
//     const tab      = sp?.tab ?? "overview";
//   }
//
// ── CLIENT COMPONENTS ("use client") ───────────────────────
// Client components cannot be async. Use React.use() instead:
//
//   "use client";
//   import { use } from "react";
//
//   export default function Page({ params, searchParams }) {
//     const { slug } = use(params);                 // ← React.use()
//     const sp       = use(searchParams);
//     const tab      = sp?.tab ?? "overview";
//   }
//
// ── QUICK REFERENCE — ALL AFFECTED FILES ───────────────────
//   app/shop/page.jsx              → await searchParams  ✅ fixed
//   app/shop/[slug]/page.jsx       → await params        (build when ready)
//   app/order/[id]/page.jsx        → await params        (build when ready)
//   app/account/orders/[id]/...    → await params        (build when ready)
//   app/admin/orders/[id]/...      → await params        (build when ready)
// ============================================================

// ── EXAMPLE: app/shop/[slug]/page.jsx ──────────────────────

import { db } from "@/lib/supabase/client";
import ProductDetailClient from "./ProductDetailClient";
import { notFound } from "next/navigation";

export default async function ProductDetailPage({ params }) {
  // Next.js 15+: params is a Promise
  const { slug } = await params;

  let product = null;

  try {
    product = await db.getProduct(slug);  // fetch by slug from Supabase
  } catch (err) {
    console.error("[ProductDetailPage] fetch failed:", err.message);
  }

  if (!product) {
    notFound(); // renders app/not-found.jsx
  }

  return <ProductDetailClient product={product} />;
}

// Generate static params at build time (optional but good for SEO)
// Uncomment once vendor sync is running and products exist in DB:
//
// export async function generateStaticParams() {
//   const products = await db.getProducts({ limit: 1000 });
//   return products.map(p => ({ slug: p.slug }));
// }

export async function generateMetadata({ params }) {
  const { slug } = await params;  // ← same pattern in generateMetadata
  // const product = await db.getProduct(slug);
  return {
    title: `${slug} | Stinkin' Supplies`,
  };
}
