"use client";

/**
 * app/browse/page.jsx
 * Mobile-first: sidebar is always-visible on desktop (≥769px).
 * On mobile: sidebar is hidden, filter opens as bottom sheet triggered by
 * floating pill button OR the BottomNav hamburger (via 'stinkin:filterToggle' window event).
 */

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getProductImage } from "@/lib/getProductImage";
import FilterSidebar from "@/components/browse/FilterSidebar";

const GOLD     = "#b8922a";
const CREAM    = "#faf7f2";
const CREAM2   = "#f2ede4";
const DARK     = "#0a0909";
const PER_PAGE = 48;

const SORT_OPTIONS = [
  { value: "relevance",  label: "Relevance" },
  { value: "price_asc",  label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "name_asc",   label: "A → Z" },
  { value: "newest",     label: "Newest" },
];

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, index }) {
  const [imgErr, setImgErr] = useState(false);
  const imageSrc = getProductImage({
    image: product.image_url ?? null,
    images: product.image_urls ?? [],
    brand: product.brand,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 300, damping: 24 }}
      style={{ position: "relative" }}
    >
      <Link href={`/browse/${product.slug}`} style={{ textDecoration: "none", display: "block" }}>
        <motion.div
          whileHover={{ y: -4, borderColor: GOLD, boxShadow: `0 8px 32px rgba(184,146,42,0.15)` }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          style={{ background: "#ffffff", border: `1px solid rgba(184,146,42,0.35)`, overflow: "hidden" }}
        >
          {/* Image */}
          <div style={{
            aspectRatio: "1", background: CREAM,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", position: "relative",
          }}>
            {imageSrc && !imgErr ? (
              <img
                src={imageSrc} alt={product.name} onError={() => setImgErr(true)}
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: "10px" }}
              />
            ) : (
              <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "2px", color: "#ccc", textTransform: "uppercase" }}>
                No Image
              </div>
            )}
            {!product.in_stock && (
              <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.9)", border: "1px solid #ddd", fontFamily: "var(--font-stencil, monospace)", fontSize: "8px", letterSpacing: "1px", color: "#999", padding: "3px 7px", textTransform: "uppercase" }}>
                Out of Stock
              </div>
            )}
            {product.oem_numbers?.length > 0 ? (
              <div style={{ position: "absolute", top: 8, left: 0 }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 22" width={72} height={22} style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="oem-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%"   stopColor="#ffd700" />
                      <stop offset="50%"  stopColor="#c8a800" />
                      <stop offset="100%" stopColor="#a88800" />
                    </linearGradient>
                  </defs>
                  <path d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z" fill="rgba(0,0,0,0.15)" transform="translate(1,1.5)" />
                  <path d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z" fill="url(#oem-grad)" />
                  <path d="M8,5 L64,5 L69,11 L64,17 L8,17 L3,11 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.75" />
                  <text x="36" y="15" textAnchor="middle" fontFamily="'Barlow Condensed','Arial Narrow',sans-serif" fontWeight="700" fontSize="9" letterSpacing="1.5" fill="rgba(0,0,0,0.75)">OEM</text>
                </svg>
              </div>
            ) : product.is_harley_fitment ? (
              <div style={{ position: "absolute", top: 8, left: 8, background: `rgba(184,146,42,0.1)`, border: `1px solid rgba(184,146,42,0.4)`, fontFamily: "var(--font-stencil, monospace)", fontSize: "8px", letterSpacing: "1px", color: GOLD, padding: "3px 7px", textTransform: "uppercase" }}>
                HD Fit
              </div>
            ) : null}
          </div>

          {/* Info */}
          <div style={{ padding: "12px 14px 16px", borderTop: `1px solid rgba(184,146,42,0.2)` }}>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "8px", letterSpacing: "2px", color: GOLD, textTransform: "uppercase", marginBottom: "4px" }}>
              {product.brand}
            </div>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "12px", color: "#2a2018", lineHeight: 1.3, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {product.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: "20px", letterSpacing: "1px", color: DARK }}>
                {product.computed_price ? `$${Number(product.computed_price).toFixed(2)}` : "—"}
              </div>
              <motion.button
                whileHover={{ scale: 1.05, background: GOLD, color: "#fff" }}
                whileTap={{ scale: 0.95 }}
                onClick={e => e.preventDefault()}
                style={{ background: CREAM2, border: `1px solid rgba(184,146,42,0.3)`, color: GOLD, width: 30, height: 30, fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, color 0.15s" }}
              >+</motion.button>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ─── Main Browse Page ─────────────────────────────────────────────────────────

function BrowsePageInner() {
  const searchParams = useSearchParams();

  const [products, setProducts]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [facets, setFacets]       = useState({ categories: [], brands: [], priceRange: { min: 0, max: 0 } });
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [filters, setFilters] = useState({
    era:         searchParams.get("era")       || null,
    family:      searchParams.get("family")    || null,
    model:       searchParams.get("model")     || null,
    modelCodes:  null,
    year:        searchParams.get("year") ? parseInt(searchParams.get("year")) : null,
    category:    searchParams.get("category")  || null,
    subcategory: null,
    brand:       searchParams.get("brand")     || null,
    q:           searchParams.get("q")         || null,
    in_stock:    false,
    min_price:   null,
    max_price:   null,
    sort:        "relevance",
  });

  // ── Listen for BottomNav hamburger event ─────────────────────
  useEffect(() => {
    const handler = () => setSidebarOpen(o => !o);
    window.addEventListener("stinkin:filterToggle", handler);
    return () => window.removeEventListener("stinkin:filterToggle", handler);
  }, []);

  const fetchProducts = useCallback(async (f, pg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.era)         params.set("era",         f.era);
      if (f.family)      params.set("family",       f.family);
      if (f.modelCodes)  f.modelCodes.forEach(c => params.append("model_code", c));
      if (f.model)       params.set("model",        f.model);
      if (f.year)        params.set("year",         f.year);
      if (f.category)    params.set("category",     f.category);
      if (f.subcategory) params.set("subcategory",  f.subcategory);
      if (f.brand)       params.set("brand",        f.brand);
      if (f.q)           params.set("q",            f.q);
      if (f.in_stock)    params.set("in_stock",     "true");
      if (f.min_price)   params.set("min_price",    f.min_price);
      if (f.max_price)   params.set("max_price",    f.max_price);
      params.set("sort",     f.sort);
      params.set("page",     pg);
      params.set("per_page", PER_PAGE);

      const res  = await fetch(`/api/browse/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      setFacets(data.facets ?? { categories: [], brands: [], priceRange: { min: 0, max: 0 } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(filters, page); }, [filters, page, fetchProducts]);

  function handleFilterChange(updates) {
    setFilters(f => ({ ...f, ...updates }));
    setPage(1);
  }

  const activeCount = [filters.family, filters.model, filters.era, filters.category, filters.brand, filters.min_price, filters.max_price, filters.in_stock].filter(Boolean).length;
  const totalPages  = Math.ceil(total / PER_PAGE);
  const contextLabel = filters.family
    ? [filters.family, filters.model, filters.year].filter(Boolean).join(" / ")
    : filters.q ? `"${filters.q}"` : filters.category || "All Parts";

  return (
    <div style={{ background: CREAM, color: DARK, minHeight: "100vh" }}>

      {/* ── Layout ── */}
      <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>

        {/* Desktop sidebar — hidden on mobile via CSS */}
        <div className="desktop-sidebar">
          <FilterSidebar
            facets={facets}
            filters={filters}
            onChange={handleFilterChange}
            open={false}
            onClose={() => {}}
            mobileSheet={false}
          />
        </div>

        {/* Mobile bottom sheet — rendered via FilterSidebar when sidebarOpen */}
        <div className="mobile-only">
          <FilterSidebar
            facets={facets}
            filters={filters}
            onChange={handleFilterChange}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            mobileSheet={true}
          />
        </div>

        {/* ── Product grid ── */}
        <div style={{ flex: 1, padding: "16px 16px 120px", minWidth: 0 }}>

          {/* Sort + count bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16, gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "1px", color: "#bbb", textTransform: "uppercase" }}>
                {total.toLocaleString()} parts
              </span>
              {/* Active filter chip */}
              {activeCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(184,146,42,0.1)", border: `1px solid rgba(184,146,42,0.25)`, padding: "3px 8px" }}>
                  <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "1px", color: GOLD, textTransform: "uppercase" }}>
                    {contextLabel}
                  </span>
                  <button
                    onClick={() => handleFilterChange({ family: null, model: null, year: null, era: null, category: null, brand: null, min_price: null, max_price: null, in_stock: false, subcategory: null, modelCodes: null, q: null })}
                    style={{ background: "none", border: "none", color: GOLD, cursor: "pointer", fontSize: "13px", lineHeight: 1, padding: 0 }}
                  >×</button>
                </div>
              )}
            </div>
            <select
              value={filters.sort}
              onChange={e => handleFilterChange({ sort: e.target.value })}
              style={{ background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, color: DARK, fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "1px", padding: "7px 10px", outline: "none", textTransform: "uppercase", cursor: "pointer" }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="product-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: "0.8", background: "linear-gradient(90deg, #f0ebe3 25%, #faf7f2 50%, #f0ebe3 75%)", backgroundSize: "600px 100%", animation: "shimmer 1.4s infinite" }} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "16px", color: "#ccc" }}>
              <div style={{ fontSize: "48px" }}>🔧</div>
              <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: "28px", letterSpacing: "2px", color: "#bbb" }}>No Parts Found</div>
              <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "11px", color: "#ccc", textTransform: "uppercase", letterSpacing: "1px" }}>Try adjusting your filters</div>
            </div>
          ) : (
            <>
              <div className="product-grid">
                {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginTop: "48px", flexWrap: "wrap" }}>
                  <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</PagBtn>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    const pg = page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                    if (pg < 1 || pg > totalPages) return null;
                    return (
                      <PagBtn key={pg} onClick={() => setPage(pg)} active={pg === page}>{pg}</PagBtn>
                    );
                  })}
                  <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</PagBtn>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Floating filter pill — mobile only, sits above bottom nav ── */}
      <div className="mobile-filter-pill">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: sidebarOpen ? DARK : "#fff",
            border: `1.5px solid ${GOLD}`,
            color: sidebarOpen ? "#fff" : DARK,
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
            padding: "10px 20px", cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            borderRadius: 999,
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {/* Hamburger lines */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3.5, width: 14 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                display: "block", height: 1.5, background: sidebarOpen ? "#fff" : GOLD,
                borderRadius: 1,
                width: i === 1 ? 10 : 14,
                transition: "background 0.15s, width 0.15s",
              }} />
            ))}
          </div>
          FILTER
          {activeCount > 0 && (
            <span style={{ background: GOLD, color: "#fff", width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>
              {activeCount}
            </span>
          )}
        </motion.button>
      </div>

      <style>{`
        @keyframes shimmer {
          from { background-position: -600px 0; }
          to   { background-position:  600px 0; }
        }
        * { box-sizing: border-box; }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        /* Desktop: sidebar visible, pill hidden */
        .desktop-sidebar { display: block; }
        .mobile-only     { display: none;  }
        .mobile-filter-pill {
          display: none;
          position: fixed;
          bottom: 86px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 200;
        }

        @media (max-width: 768px) {
          .desktop-sidebar    { display: none !important; }
          .mobile-only        { display: block !important; }
          .mobile-filter-pill { display: block !important; }
          .product-grid       { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

function PagBtn({ onClick, disabled, active, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? GOLD : "#fff",
        border: `1px solid ${active ? GOLD : "rgba(184,146,42,0.3)"}`,
        color: active ? "#fff" : disabled ? "#ccc" : DARK,
        fontFamily: "var(--font-stencil, monospace)",
        fontSize: "10px", padding: "7px 12px", cursor: disabled ? "default" : "pointer",
        minWidth: 36, letterSpacing: "1px",
      }}
    >{children}</button>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "3px", color: "#bbb", textTransform: "uppercase" }}>Loading…</div>
      </div>
    }>
      <BrowsePageInner />
    </Suspense>
  );
}
