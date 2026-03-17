// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product server-side, passes to client for interactivity.
// Service role key stays server-only. Page is SSR for SEO.
//
// TODO Phase 5 (vendor sync live):
//   - db.getProduct() will return real rows
//   - db.getRelatedProducts() for cross-sell section
//   - db.checkFitment(productId, vehicleId) for ACES check
//   - generateStaticParams() for ISR once catalog is stable
// ============================================================

import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  // Next.js 15+: params is a Promise
  const { slug } = await params;

  let product  = null;
  let related  = [];
  let fetchError = null;

  try {
    product = await db.getProduct(slug);
  } catch (err) {
    console.error("[ProductDetailPage] db.getProduct failed:", err.message);
    fetchError = err.message;
  }

  // If Supabase has no row yet (pre-vendor-sync), use mock so the
  // page still renders. Remove this block once Phase 5 is live.
  if (!product) {
    product = MOCK_PRODUCTS[slug] ?? null;
  }

  if (!product) notFound();

  // Normalize DB shape → component shape
  const normalized = normalizeProductRow(product);

  // Related products — same category, exclude self
  // TODO: replace with db.getRelatedProducts(product.id, product.category_id)
  try {
    related = Object.values(MOCK_PRODUCTS)
      .filter(p => p.category === normalized.category && p.slug !== slug)
      .slice(0, 4)
      .map(normalizeProductRow);
  } catch (_) {}

  return (
    <ProductDetailClient
      product={normalized}
      relatedProducts={related}
      fetchError={fetchError}
    />
  );
}

// ── Row normalizer ────────────────────────────────────────────
function normalizeProductRow(row) {
  return {
    id:           row.id,
    slug:         row.slug,
    name:         row.name,
    brand:        row.brand_name      ?? row.brand    ?? "Unknown",
    category:     row.category_name   ?? row.category ?? "Uncategorized",
    price:        Number(row.price    ?? 0),
    was:          row.compare_at_price ? Number(row.compare_at_price) : (row.was ?? null),
    mapPrice:     row.map_price        ? Number(row.map_price)        : null,
    badge:        row.is_new  ? "new" : row.on_sale ? "sale" : (row.badge ?? null),
    inStock:      row.inStock ?? (row.stock_quantity ?? 1) > 0,
    stockQty:     row.stock_quantity   ?? null,
    fitmentIds:   row.fitment_ids      ?? null,
    images:       row.images           ?? (row.image ? [row.image] : []),
    sku:          row.sku              ?? row.vendor_sku ?? null,
    description:  row.description      ?? row.long_description ?? null,
    specs:        row.specs            ?? row.attributes ?? [],
    weight:       row.weight_lbs       ?? null,
    shipping:     row.ships_free       ?? (Number(row.price ?? 0) >= 99),
    pointsEarned: Math.floor(Number(row.price ?? 0) * 10),
  };
}

// ── SEO metadata ─────────────────────────────────────────────
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const raw = MOCK_PRODUCTS[slug];
  const name  = raw?.name  ?? slug.replace(/-/g, " ");
  const brand = raw?.brand ?? "Stinkin' Supplies";
  return {
    title:       `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}

// ── Mock product catalogue (pre-Phase-5 fallback) ────────────
// Keyed by slug so lookups are O(1).
// Remove once db.getProduct() returns real rows.
const MOCK_PRODUCTS = {
  "screamin-eagle-stage-iv-kit": {
    id:1, slug:"screamin-eagle-stage-iv-kit",
    brand:"Screamin Eagle", category:"Engine & Performance",
    name:"Stage IV High Torque Kit",
    price:849.99, was:999.99, badge:"sale", inStock:true, stockQty:6,
    sku:"SE-92800020",
    description:"The Stage IV kit delivers serious performance gains for your Twin Cam or Milwaukee-Eight engine. Includes high-compression pistons, ported heads, and performance cams designed to work together for maximum torque output throughout the RPM range.",
    specs:[
      { label:"Fitment",       value:"2017–2023 Harley-Davidson Touring / Softail" },
      { label:"Displacement",  value:"+15% over stock" },
      { label:"Estimated HP",  value:"~118 HP at rear wheel" },
      { label:"Compression",   value:"10.7:1" },
      { label:"Includes",      value:"Pistons, cams, pushrods, gaskets" },
      { label:"SKU",           value:"SE-92800020" },
      { label:"Weight",        value:"8.4 lbs" },
    ],
    images:[
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1591637333184-19aa84b3e01f?w=800&auto=format&fit=crop",
], ships_free:true,
  },
  "vance-hines-pro-pipe-chrome": {
    id:2, slug:"vance-hines-pro-pipe-chrome",
    brand:"Vance & Hines", category:"Exhaust Systems",
    name:"Pro Pipe Chrome 2-into-1 Exhaust",
    price:524.95, was:null, badge:"new", inStock:true, stockQty:12,
    sku:"VH-17943",
    description:"The Pro Pipe is the most powerful 2-into-1 exhaust system Vance & Hines makes. Tuned length header pipes are computer designed and hand-crafted for maximum performance. The large tapered muffler has a classic look that complements any Harley.",
    specs:[
      { label:"Fitment",       value:"1995–2016 Harley-Davidson Softail" },
      { label:"Material",      value:"Stainless steel headers, carbon canister" },
      { label:"Finish",        value:"Chrome" },
      { label:"Est. HP Gain",  value:"+8–12 HP over stock" },
      { label:"Sound Level",   value:"95 dB at 50 ft" },
      { label:"SKU",           value:"VH-17943" },
      { label:"Weight",        value:"11.2 lbs" },
    ],
    images:[], ships_free:true,
  },
  "kuryakyn-hypercharger-es": {
    id:6, slug:"kuryakyn-hypercharger-es",
    brand:"Kuryakyn", category:"Engine & Performance",
    name:"Hypercharger ES Air Intake Kit",
    price:264.95, was:null, badge:"new", inStock:true, stockQty:18,
    sku:"KUR-9356",
    description:"The Hypercharger ES is the iconic teardrop-shaped air cleaner that started a revolution. Now with an internal electronic solenoid that opens the ram-air door automatically as throttle is applied, delivering a throaty induction roar and improved airflow.",
    specs:[
      { label:"Fitment",   value:"2008–2023 Harley-Davidson EFI models" },
      { label:"Material",  value:"Die-cast zinc housing" },
      { label:"Finish",    value:"Chrome" },
      { label:"Solenoid",  value:"12V electronic, throttle-activated" },
      { label:"Filter",    value:"Oiled cotton gauze, washable" },
      { label:"SKU",       value:"KUR-9356" },
    ],
    images:[], ships_free:true,
  },
};
