"use client";

/**
 * app/browse/page.jsx
 * Mobile-first: sidebar is always-visible on desktop (≥769px).
 * On mobile: sidebar is hidden, filter opens as bottom sheet triggered by
 * floating pill button OR the BottomNav hamburger (via 'stinkin:filterToggle' window event).
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import FilterSidebar from "@/components/browse/FilterSidebar";
import ProductCard   from "@/components/browse/ProductCard";
import InlinePanel   from "@/components/browse/InlinePanel";
import { AnimatePresence } from "framer-motion";

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
  { value: "year_asc",   label: "Year ↑" },
  { value: "year_desc",  label: "Year ↓" },
];

// ─── Main Browse Page ─────────────────────────────────────────────────────────

function BrowsePageInner() {
  const searchParams = useSearchParams();

  // Restore scroll position and filter state when navigating back
  useEffect(() => {
    const saved = sessionStorage.getItem('browse_scroll');
    if (saved) { window.scrollTo(0, parseInt(saved)); sessionStorage.removeItem('browse_scroll'); }
  }, []);

  const [products, setProducts]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [facets, setFacets]       = useState({ categories: [], brands: [], priceRange: { min: 0, max: 0 } });
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedId, setSelectedId]   = useState(null);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  const [filters, setFilters] = useState({
    era:                searchParams.get("era")              || null,
    family:             searchParams.get("family")           || null,
    model:              searchParams.get("model")            || null,
    modelCodes:         searchParams.getAll("model_code").length > 0 ? searchParams.getAll("model_code") : null,
    year:               searchParams.get("year")             ? parseInt(searchParams.get("year")) : null,
    // ?category is the legacy param — fold it into display_category so old links still work
    display_category:   searchParams.get("display_category") || searchParams.get("category") || null,
    display_subcategory:searchParams.get("display_subcategory") || null,
    year_min:           searchParams.get("year_min")          ? parseInt(searchParams.get("year_min")) : null,
    year_max:           searchParams.get("year_max")          ? parseInt(searchParams.get("year_max")) : null,
    brand:              searchParams.get("brand")            || null,
    q:                  searchParams.get("q")                || null,
    in_stock:           searchParams.get("in_stock")         === "true",
    min_price:          searchParams.get("min_price")        ? parseFloat(searchParams.get("min_price")) : null,
    max_price:          searchParams.get("max_price")        ? parseFloat(searchParams.get("max_price")) : null,
    sort:               searchParams.get("sort")             || "relevance",
  });

  // ── Listen for BottomNav hamburger event ─────────────────────
  useEffect(() => {
    const handler = () => setSidebarOpen(o => !o);
    window.addEventListener("stinkin:filterToggle", handler);
    return () => window.removeEventListener("stinkin:filterToggle", handler);
  }, []);

  // ── Debounce search input → filters.q ────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchInput.trim() || null;
      if (trimmed !== filters.q) handleFilterChange({ q: trimmed });
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const fetchProducts = useCallback(async (f, pg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.era)                  params.set("era",                f.era);
      if (f.family)               params.set("family",             f.family);
      if (f.modelCodes)           f.modelCodes.forEach(c => params.append("model_code", c));
      if (f.model)                params.set("model",              f.model);
      if (f.year)                 params.set("year",               f.year);
      if (f.display_category)     params.set("display_category",   f.display_category);
      if (f.display_subcategory)  params.set("display_subcategory",f.display_subcategory);
      if (f.year_min)             params.set("year_min",           f.year_min);
      if (f.year_max)             params.set("year_max",           f.year_max);
      if (f.brand)                params.set("brand",              f.brand);
      if (f.q)                    params.set("q",                  f.q);
      if (f.in_stock)             params.set("in_stock",           "true");
      if (f.min_price)            params.set("min_price",          f.min_price);
      if (f.max_price)            params.set("max_price",          f.max_price);
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchProducts(filters, page); }, [filters, page, fetchProducts]);

  // Clear panel selection when page or filters change
  useEffect(() => { setSelectedId(null); }, [filters, page]);



  function handleFilterChange(updates) {
    const next = { ...filters, ...updates };
    setFilters(next);
    setPage(1);
    const p = new URLSearchParams();
    if (next.era)                  p.set("era",                next.era);
    if (next.family)               p.set("family",             next.family);
    if (next.model)                p.set("model",              next.model);
    if (next.modelCodes)           next.modelCodes.forEach(c => p.append("model_code", c));
    if (next.year)                 p.set("year",               next.year);
    if (next.display_category)     p.set("display_category",   next.display_category);
    if (next.display_subcategory)  p.set("display_subcategory",next.display_subcategory);
    if (next.year_min)             p.set("year_min",           next.year_min);
    if (next.year_max)             p.set("year_max",           next.year_max);
    if (next.brand)                p.set("brand",              next.brand);
    if (next.q)                    p.set("q",                  next.q);
    if (next.in_stock)             p.set("in_stock",           "true");
    if (next.min_price)            p.set("min_price",          next.min_price);
    if (next.max_price)            p.set("max_price",          next.max_price);
    if (next.sort && next.sort !== "relevance") p.set("sort",  next.sort);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/browse?${qs}` : "/browse");
  }

  const selectedProduct = selectedId != null
    ? (products.find(p => p.id === selectedId) ?? null)
    : null;

  const activeCount = [filters.family, filters.model, filters.era, filters.display_category, filters.brand, filters.min_price, filters.max_price, filters.in_stock].filter(Boolean).length;
  const totalPages  = Math.ceil(total / PER_PAGE);
  const contextLabel = filters.family
    ? [filters.family, filters.model, filters.year].filter(Boolean).join(" / ")
    : filters.q ? `"${filters.q}"` : filters.display_category || "All Parts";

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

          {/* ── Search bar ── */}
          <div style={{
            display: "flex", alignItems: "center",
            background: "#fff",
            border: `1.5px solid ${searchInput ? GOLD : "rgba(184,146,42,0.3)"}`,
            marginBottom: 16,
            transition: "border-color 0.15s",
          }}>
            {/* Icon */}
            <span style={{ display: "flex", alignItems: "center", padding: "0 12px", color: "rgba(184,146,42,0.6)", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
              </svg>
            </span>
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setSearchInput("")}
              placeholder="SEARCH PARTS, OEM NUMBERS, BRANDS…"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "10px", letterSpacing: "1.5px", color: DARK,
                padding: "13px 0", textTransform: "uppercase",
                WebkitAppearance: "none",
              }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                style={{ display: "flex", alignItems: "center", padding: "0 14px", background: "none", border: "none", cursor: "pointer", color: "#bbb", flexShrink: 0 }}
                aria-label="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

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
                    onClick={() => handleFilterChange({ family: null, model: null, year: null, era: null, display_category: null, display_subcategory: null, year_min: null, year_max: null, brand: null, min_price: null, max_price: null, in_stock: false, modelCodes: null, q: null })}
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
                {products.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    index={i}
                  />
                ))}
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

        input[type="search"]::-webkit-search-decoration,
        input[type="search"]::-webkit-search-cancel-button,
        input[type="search"]::-webkit-search-results-button,
        input[type="search"]::-webkit-search-results-decoration { display: none; }
        input[type="search"]::placeholder { color: rgba(184,146,42,0.4); }

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
