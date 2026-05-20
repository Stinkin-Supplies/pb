"use client";

/**
 * app/browse/page.jsx
 * Fitment-filtered product browsing — reads directly from catalog_unified.
 * Scalable: all queries go through /api/browse/products.
 */

import SideNav from "@/components/SideNav";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getProductImage } from "@/lib/getProductImage";
import FilterSidebar from "@/components/browse/FilterSidebar";

const GOLD       = "#b8922a";
const CREAM      = "#faf7f2";
const CREAM2     = "#f2ede4";
const DARK       = "#0a0909";
const PER_PAGE   = 48;

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
      <Link
        href={`/browse/${product.slug}`}
        style={{ textDecoration: "none", display: "block" }}
      >
        <motion.div
          whileHover={{ y: -4, borderColor: GOLD, boxShadow: `0 8px 32px rgba(184,146,42,0.15)` }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          style={{
            background: "#ffffff",
            border: `1px solid rgba(184,146,42,0.35)`,
            overflow: "hidden",
          }}
        >
          {/* Image */}
          <div style={{
            aspectRatio: "1",
            background: CREAM,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}>
            {imageSrc && !imgErr ? (
              <img
                src={imageSrc}
                alt={product.name}
                onError={() => setImgErr(true)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  padding: "10px",
                  imageRendering: "auto",
                }}
              />
            ) : (
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "9px",
                letterSpacing: "2px",
                color: "#ccc",
                textTransform: "uppercase",
              }}>
                No Image
              </div>
            )}
            {/* Stock badge */}
            {!product.in_stock && (
              <div style={{
                position: "absolute",
                top: 8, right: 8,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid #ddd",
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "8px",
                letterSpacing: "1px",
                color: "#999",
                padding: "3px 7px",
                textTransform: "uppercase",
              }}>
                Out of Stock
              </div>
            )}
            {/* OEM / Fitment badge */}
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
              <div style={{
                position: "absolute",
                top: 8, left: 8,
                background: `rgba(184,146,42,0.1)`,
                border: `1px solid rgba(184,146,42,0.4)`,
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "8px",
                letterSpacing: "1px",
                color: GOLD,
                padding: "3px 7px",
                textTransform: "uppercase",
              }}>
                HD Fit
              </div>
            ) : null}
          </div>

          {/* Info */}
          <div style={{
            padding: "12px 14px 16px",
            borderTop: `1px solid rgba(184,146,42,0.2)`,
          }}>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "8px",
              letterSpacing: "2px",
              color: GOLD,
              textTransform: "uppercase",
              marginBottom: "4px",
            }}>
              {product.brand}
            </div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "12px",
              color: "#2a2018",
              lineHeight: 1.3,
              marginBottom: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {product.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: "20px",
                letterSpacing: "1px",
                color: DARK,
              }}>
                {product.computed_price
                  ? `$${Number(product.computed_price).toFixed(2)}`
                  : "—"}
              </div>
              <motion.button
                whileHover={{ scale: 1.05, background: GOLD, color: "#fff" }}
                whileTap={{ scale: 0.95 }}
                onClick={e => { e.preventDefault(); }}
                style={{
                  background: CREAM2,
                  border: `1px solid rgba(184,146,42,0.3)`,
                  color: GOLD,
                  width: 30,
                  height: 30,
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                +
              </motion.button>
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

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState({ categories: [], brands: [], priceRange: { min: 0, max: 0 } });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Build filters from URL params
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filters, setFilters] = useState({
    era:         searchParams.get("era")       || null,
    family:      searchParams.get("family")   || null,
    model:       null,
    modelCodes:  null,
    model:       searchParams.get("model")    || null,
    year:        searchParams.get("year")     ? parseInt(searchParams.get("year")) : null,
    category:    searchParams.get("category") || null,
    subcategory: null,
    brand:       searchParams.get("brand")    || null,
    q:           searchParams.get("q")        || null,
    in_stock:    false,
    min_price:   null,
    max_price:   null,
    sort:        "relevance",
  });

  const fetchProducts = useCallback(async (f, pg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.era)       params.set("era",        f.era);
      if (f.family)    params.set("family",    f.family);
      if (f.modelCodes) f.modelCodes.forEach(c => params.append("model_code", c));
      if (f.model)     params.set("model",     f.model);
      if (f.year)      params.set("year",      f.year);
      if (f.category)    params.set("category",    f.category);
      if (f.subcategory) params.set("subcategory", f.subcategory);
      if (f.brand)     params.set("brand",     f.brand);
      if (f.q)         params.set("q",         f.q);
      if (f.in_stock)  params.set("in_stock",  "true");
      if (f.min_price) params.set("min_price", f.min_price);
      if (f.max_price) params.set("max_price", f.max_price);
      params.set("sort",     f.sort);
      params.set("page",     pg);
      params.set("per_page", PER_PAGE);

      const res = await fetch(`/api/browse/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      setFacets(data.facets ?? { categories: [], brands: [], priceRange: { min: 0, max: 0 } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(filters, page);
  }, [filters, page, fetchProducts]);

  function handleFilterChange(updates) {
    setFilters(f => ({ ...f, ...updates }));
    setPage(1);
  }

  // Context label
  const contextLabel = filters.family
    ? [filters.family, filters.model, filters.year].filter(Boolean).join(" / ")
    : filters.q
      ? `Search: "${filters.q}"`
      : filters.category || "All Parts";

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div style={{ background: CREAM, color: DARK, minHeight: "100vh" }}>

      {/* Top bar */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(250,247,242,0.97)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid rgba(184,146,42,0.3)`,
        padding: "0 40px",
        height: 0, overflow: "hidden", padding: 0, border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "24px",
      }}>
        <Link href="/" style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: "18px",
          letterSpacing: "3px",
          color: DARK,
          textDecoration: "none",
        }}>
          STINKIN' SUPPLIES
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, maxWidth: 480 }}>
          {/* Active fitment badge */}
          {filters.family && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(184,146,42,0.1)",
              border: `1px solid rgba(184,146,42,0.25)`,
              padding: "4px 10px",
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "9px",
                letterSpacing: "1px",
                color: GOLD,
                textTransform: "uppercase",
              }}>
                {contextLabel}
              </span>
              <button
                onClick={() => handleFilterChange({ family: null, model: null, year: null })}
                style={{
                  background: "none",
                  border: "none",
                  color: GOLD,
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Search bar */}
          <input
            defaultValue={filters.q ?? ""}
            placeholder="Search parts, OEM numbers…"
            onKeyDown={e => {
              if (e.key === "Enter") {
                handleFilterChange({ q: e.target.value || null });
              }
            }}
            style={{
              flex: 1,
              background: "#fff",
              border: `1px solid rgba(184,146,42,0.3)`,
              color: DARK,
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "11px",
              padding: "7px 14px",
              outline: "none",
              textTransform: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <select
            value={filters.sort}
            onChange={e => handleFilterChange({ sort: e.target.value })}
            style={{
              background: "#fff",
              border: `1px solid rgba(184,146,42,0.3)`,
              color: DARK,
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "9px",
              letterSpacing: "1px",
              padding: "7px 12px",
              outline: "none",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: "9px",
            letterSpacing: "1px",
            color: "#999",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            {total.toLocaleString()} parts
          </div>
        </div>
      </div>

      {/* Layout */}
      <div style={{ display: "flex", minHeight: "100vh", position: "relative" }}>

        {/* Mobile filter button */}
        <div className="mobile-filter-btn" style={{
          position: "fixed",
          bottom: 80,
          left: 16,
          zIndex: 100,
          display: "none",
        }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setSidebarOpen(true)}
            style={{
              background: GOLD,
              border: "none",
              color: "#fff",
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              padding: "10px 18px",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(184,146,42,0.4)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            ⚙ Filter
          </motion.button>
        </div>

        {/* Sidebar */}
        <FilterSidebar
          facets={facets}
          filters={filters}
          onChange={handleFilterChange}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Grid */}
        <div style={{ flex: 1, padding: "0 24px", minWidth: 0 }}>
          {loading ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
            }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{
                  aspectRatio: "0.8",
                  background: "linear-gradient(90deg, #f0ebe3 25%, #faf7f2 50%, #f0ebe3 75%)",
                  backgroundSize: "600px 100%",
                  animation: "shimmer 1.4s infinite",
                }} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 400,
              gap: "16px",
              color: "#ccc",
            }}>
              <div style={{ fontSize: "48px" }}>🔧</div>
              <div style={{
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: "28px",
                letterSpacing: "2px",
                color: "#bbb",
              }}>
                No Parts Found
              </div>
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "11px",
                color: "#ccc",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}>
                Try adjusting your filters
              </div>
            </div>
          ) : (
            <>
              <div className="product-grid" style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "12px",
              }}>
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "6px",
                  marginTop: "48px",
                  flexWrap: "wrap",
                }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{
                      background: "#fff",
                      border: `1px solid rgba(184,146,42,0.3)`,
                      color: page === 1 ? "#ccc" : DARK,
                      fontFamily: "var(--font-stencil, monospace)",
                      fontSize: "10px",
                      padding: "7px 14px",
                      cursor: page === 1 ? "default" : "pointer",
                      letterSpacing: "1px",
                    }}
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    const pg = page <= 4
                      ? i + 1
                      : page >= totalPages - 3
                        ? totalPages - 6 + i
                        : page - 3 + i;
                    if (pg < 1 || pg > totalPages) return null;
                    return (
                      <button
                        key={pg}
                        onClick={() => setPage(pg)}
                        style={{
                          background: pg === page ? GOLD : "#fff",
                          border: `1px solid ${pg === page ? GOLD : "rgba(184,146,42,0.3)"}`,
                          color: pg === page ? "#fff" : DARK,
                          fontFamily: "var(--font-stencil, monospace)",
                          fontSize: "10px",
                          padding: "7px 12px",
                          cursor: "pointer",
                          minWidth: 36,
                          letterSpacing: "1px",
                        }}
                      >
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{
                      background: "#fff",
                      border: `1px solid rgba(184,146,42,0.3)`,
                      color: page === totalPages ? "#ccc" : DARK,
                      fontFamily: "var(--font-stencil, monospace)",
                      fontSize: "10px",
                      padding: "7px 14px",
                      cursor: page === totalPages ? "default" : "pointer",
                      letterSpacing: "1px",
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          from { background-position: -600px 0; }
          to   { background-position:  600px 0; }
        }
        * { box-sizing: border-box; }

        @media (max-width: 768px) {
          .mobile-filter-btn { display: block !important; }
          .mobile-backdrop   { display: block !important; }
          .filter-sidebar-wrap {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            height: 100vh !important;
            width: 280px !important;
            z-index: 100 !important;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }
          .filter-sidebar-wrap.open {
            transform: translateX(0);
          }
          .product-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "3px", color: "#bbb", textTransform: "uppercase" }}>
          Loading…
        </div>
      </div>
    }>
      <BrowsePageInner />
    </Suspense>
  );
}
