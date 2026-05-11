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
            {/* Fitment badge */}
            {product.is_harley_fitment && (
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
            )}
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

// ─── Filter Sidebar ───────────────────────────────────────────────────────────

function FilterSidebar({ facets, filters, onChange }) {
  const [openSections, setOpenSections] = useState({ category: true, brand: true, price: true });

  function toggle(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  function SectionHeader({ label, sectionKey }) {
    return (
      <button
        onClick={() => toggle(sectionKey)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          padding: "10px 0",
          cursor: "pointer",
          borderBottom: `1px solid rgba(184,146,42,0.2)`,
        }}
      >
        <span style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: openSections[sectionKey] ? GOLD : "#888",
          transition: "color 0.15s",
        }}>
          {label}
        </span>
        <span style={{ color: "#bbb", fontSize: "10px" }}>
          {openSections[sectionKey] ? "▲" : "▼"}
        </span>
      </button>
    );
  }

  return (
    <div style={{ position: "sticky", top: 72 }}>
      {/* In Stock toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: `1px solid rgba(184,146,42,0.2)`,
        marginBottom: "4px",
      }}>
        <span style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "#888",
        }}>
          In Stock Only
        </span>
        <motion.button
          onClick={() => onChange({ in_stock: !filters.in_stock })}
          animate={{ background: filters.in_stock ? GOLD : "#1a1a1a" }}
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <motion.div
            animate={{ x: filters.in_stock ? 18 : 2 }}
            style={{
              position: "absolute",
              top: 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#fff",
            }}
          />
        </motion.button>
      </div>

      {/* Category */}
      <SectionHeader label="Category" sectionKey="category" />
      <AnimatePresence>
        {openSections.category && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ paddingTop: "8px", paddingBottom: "8px", maxHeight: 240, overflowY: "auto" }}>
              {facets.categories.slice(0, 15).map(cat => (
                <button
                  key={cat.name}
                  onClick={() => onChange({ category: filters.category === cat.name ? null : cat.name })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: "5px 0",
                    cursor: "pointer",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      border: `1px solid ${filters.category === cat.name ? GOLD : "rgba(184,146,42,0.25)"}`,
                      background: filters.category === cat.name ? GOLD : "transparent",
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "var(--font-stencil, monospace)",
                      fontSize: "10px",
                      color: filters.category === cat.name ? DARK : "#888",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "left",
                    }}>
                      {cat.name}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: "8px",
                    color: "#bbb",
                    flexShrink: 0,
                  }}>
                    {cat.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Brand */}
      <SectionHeader label="Brand" sectionKey="brand" />
      <AnimatePresence>
        {openSections.brand && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ paddingTop: "8px", paddingBottom: "8px", maxHeight: 240, overflowY: "auto" }}>
              {facets.brands.slice(0, 20).map(b => (
                <button
                  key={b.name}
                  onClick={() => onChange({ brand: filters.brand === b.name ? null : b.name })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: "5px 0",
                    cursor: "pointer",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      border: `1px solid ${filters.brand === b.name ? GOLD : "rgba(184,146,42,0.25)"}`,
                      background: filters.brand === b.name ? GOLD : "transparent",
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "var(--font-stencil, monospace)",
                      fontSize: "10px",
                      color: filters.brand === b.name ? DARK : "#888",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "left",
                    }}>
                      {b.name}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: "8px",
                    color: "#bbb",
                    flexShrink: 0,
                  }}>
                    {b.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Price Range */}
      <SectionHeader label="Price" sectionKey="price" />
      <AnimatePresence>
        {openSections.price && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ paddingTop: "12px", paddingBottom: "12px", display: "flex", gap: "8px" }}>
              <input
                type="number"
                placeholder="Min"
                value={filters.min_price ?? ""}
                onChange={e => onChange({ min_price: e.target.value || null })}
                style={{
                  flex: 1,
                  background: "#fff",
                  border: `1px solid rgba(184,146,42,0.3)`,
                  color: DARK,
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: "11px",
                  padding: "7px 10px",
                  outline: "none",
                  textTransform: "none",
                }}
              />
              <input
                type="number"
                placeholder="Max"
                value={filters.max_price ?? ""}
                onChange={e => onChange({ max_price: e.target.value || null })}
                style={{
                  flex: 1,
                  background: "#fff",
                  border: `1px solid rgba(184,146,42,0.3)`,
                  color: DARK,
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: "11px",
                  padding: "7px 10px",
                  outline: "none",
                  textTransform: "none",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const [filters, setFilters] = useState({
    family:    searchParams.get("family")   || null,
    model:     searchParams.get("model")    || null,
    year:      searchParams.get("year")     ? parseInt(searchParams.get("year")) : null,
    category:  searchParams.get("category") || null,
    brand:     searchParams.get("brand")    || null,
    q:         searchParams.get("q")        || null,
    in_stock:  false,
    min_price: null,
    max_price: null,
    sort:      "relevance",
  });

  const fetchProducts = useCallback(async (f, pg) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.family)    params.set("family",    f.family);
      if (f.model)     params.set("model",     f.model);
      if (f.year)      params.set("year",      f.year);
      if (f.category)  params.set("category",  f.category);
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
        height: 52,
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
          STINKIN'<span style={{ color: GOLD }}>'</span> SUPPLIES
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
      <div style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        minHeight: "calc(100vh - 52px)",
      }}>
        {/* Sidebar */}
        <div style={{
          borderRight: `1px solid rgba(184,146,42,0.2)`,
          padding: "24px 20px",
          background: CREAM2,
        }}>
          <div style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: "9px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: "16px",
          }}>
            Filter
          </div>
          <FilterSidebar
            facets={facets}
            filters={filters}
            onChange={handleFilterChange}
          />
        </div>

        {/* Grid */}
        <div style={{ padding: "24px 32px" }}>
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
              <div style={{
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
