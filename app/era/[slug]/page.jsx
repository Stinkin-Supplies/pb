"use client";
// ============================================================
// app/era/[slug]/page.jsx
// Era landing page — hero + product grid + slide-in side panel
// Filters: category, brand, price, in stock — all in side panel
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getProductImage } from "@/lib/getProductImage";
import { ERAS, getEra, ERA_CATEGORIES } from "@/lib/eras/config";

const PER_PAGE = 48;

const SORT_OPTIONS = [
  { value: "relevance",  label: "Relevance"  },
  { value: "price_asc",  label: "Price ↑"    },
  { value: "price_desc", label: "Price ↓"    },
  { value: "name_asc",   label: "A → Z"      },
  { value: "newest",     label: "Newest"     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, index, accent }) {
  const [imgErr, setImgErr] = useState(false);
  const imageSrc = getProductImage({
    image:  product.image_url  ?? null,
    images: product.image_urls ?? [],
    brand:  product.brand,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, type: "spring", stiffness: 280, damping: 22 }}
    >
      <Link href={`/browse/${product.slug}`} style={{ textDecoration: "none", display: "block" }}>
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{
            background: "#0e0e0e",
            border: "1px solid #1c1c1c",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Image */}
          <div style={{
            aspectRatio: "1",
            background: "#080808",
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
                style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }}
              />
            ) : (
              <div style={{
                fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                fontSize: 9, letterSpacing: 2, color: "#1e1e1e", textTransform: "uppercase",
              }}>No Image</div>
            )}

            {!product.in_stock && (
              <div style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(8,8,8,0.9)", border: "1px solid #222",
                fontFamily: "var(--font-stencil, monospace)", fontSize: 8,
                letterSpacing: 1, color: "#555", padding: "3px 7px", textTransform: "uppercase",
              }}>Out of Stock</div>
            )}
            {product.is_harley_fitment && (
              <div style={{
                position: "absolute", top: 8, left: 8,
                background: `rgba(0,0,0,0.7)`,
                border: `1px solid ${accent}44`,
                fontFamily: "var(--font-stencil, monospace)", fontSize: 8,
                letterSpacing: 1, color: accent, padding: "3px 7px", textTransform: "uppercase",
              }}>HD Fit</div>
            )}
          </div>

          {/* Info */}
          <div style={{ padding: "12px 14px 16px", borderTop: "1px solid #161616" }}>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)", fontSize: 8,
              letterSpacing: 2, color: "#444", textTransform: "uppercase", marginBottom: 4,
            }}>{product.brand}</div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)", fontSize: 12,
              color: "#b0aca8", lineHeight: 1.3, marginBottom: 10,
              textTransform: "uppercase", letterSpacing: "0.5px",
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{product.name}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: 20, letterSpacing: 1, color: "#ddd8d0",
              }}>{fmt(product.computed_price ? Number(product.computed_price) : null)}</div>
              <motion.button
                whileHover={{ scale: 1.08, background: accent, color: "#080808" }}
                whileTap={{ scale: 0.93 }}
                onClick={e => e.preventDefault()}
                style={{
                  background: "#181818", border: "none", color: "#555",
                  width: 30, height: 30, fontSize: 18, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >+</motion.button>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ─── Side Panel ───────────────────────────────────────────────────────────────

function SidePanel({ open, onClose, filters, onChange, facets, accent }) {
  const [openSections, setOpenSections] = useState({
    category: true, brand: false, price: false,
  });

  function toggle(k) { setOpenSections(s => ({ ...s, [k]: !s[k] })); }

  const labelStyle = {
    fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
    fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase",
    color: "#555", display: "block", marginBottom: 12,
  };

  const sectionHeaderStyle = (active) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", background: "none", border: "none",
    borderBottom: "1px solid #1c1c1c", padding: "12px 0",
    cursor: "pointer",
    fontFamily: "var(--font-stencil, monospace)",
    fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
    color: active ? accent : "#555",
    transition: "color 0.15s",
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
              zIndex: 100, backdropFilter: "blur(2px)",
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: 320, background: "#080808",
              borderLeft: "1px solid #1c1c1c",
              zIndex: 101, overflowY: "auto",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Panel header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid #1c1c1c",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              position: "sticky", top: 0, background: "#080808", zIndex: 1,
            }}>
              <span style={{
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: 22, letterSpacing: "0.08em", color: "#e0d8cc",
              }}>FILTERS</span>
              <button onClick={onClose} style={{
                background: "none", border: "1px solid #222",
                color: "#555", cursor: "pointer", width: 32, height: 32,
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                transition: "border-color 0.15s, color 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#555"; }}
              >✕</button>
            </div>

            <div style={{ padding: "0 24px 40px", flex: 1 }}>

              {/* In Stock */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 0", borderBottom: "1px solid #1c1c1c",
              }}>
                <span style={{
                  fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
                  letterSpacing: "0.18em", textTransform: "uppercase", color: "#666",
                }}>In Stock Only</span>
                <motion.button
                  onClick={() => onChange({ in_stock: !filters.in_stock })}
                  animate={{ background: filters.in_stock ? accent : "#1a1a1a" }}
                  transition={{ duration: 0.2 }}
                  style={{ width: 38, height: 22, borderRadius: 11, border: "none", cursor: "pointer", position: "relative" }}
                >
                  <motion.div
                    animate={{ x: filters.in_stock ? 18 : 2 }}
                    style={{ position: "absolute", top: 3, width: 16, height: 16, borderRadius: "50%", background: "#080808" }}
                  />
                </motion.button>
              </div>

              {/* Category */}
              <div>
                <button style={sectionHeaderStyle(openSections.category)} onClick={() => toggle("category")}>
                  <span>Category</span>
                  <span style={{ fontSize: 10, color: "#333" }}>{openSections.category ? "▲" : "▼"}</span>
                </button>
                <AnimatePresence>
                  {openSections.category && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
                        {ERA_CATEGORIES.map(cat => {
                          const active = filters.category === cat.slug;
                          return (
                            <button
                              key={cat.slug}
                              onClick={() => onChange({ category: active ? null : cat.slug })}
                              style={{
                                display: "flex", alignItems: "center",
                                width: "100%", background: "none", border: "none",
                                padding: "6px 0", cursor: "pointer", gap: 10,
                              }}
                            >
                              <div style={{
                                width: 10, height: 10, flexShrink: 0,
                                border: `1px solid ${active ? accent : "#2a2a2a"}`,
                                background: active ? accent : "transparent",
                                transition: "all 0.15s",
                              }} />
                              <span style={{
                                fontFamily: "var(--font-stencil, monospace)",
                                fontSize: 10, letterSpacing: "0.06em",
                                color: active ? "#e0d8cc" : "#666",
                                textTransform: "uppercase", textAlign: "left",
                                transition: "color 0.15s",
                              }}>{cat.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Brand */}
              <div>
                <button style={sectionHeaderStyle(openSections.brand)} onClick={() => toggle("brand")}>
                  <span>Brand</span>
                  <span style={{ fontSize: 10, color: "#333" }}>{openSections.brand ? "▲" : "▼"}</span>
                </button>
                <AnimatePresence>
                  {openSections.brand && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ paddingTop: 8, paddingBottom: 8, maxHeight: 280, overflowY: "auto" }}>
                        {(facets.brands ?? []).slice(0, 30).map(b => {
                          const active = filters.brand === b.name;
                          return (
                            <button
                              key={b.name}
                              onClick={() => onChange({ brand: active ? null : b.name })}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                width: "100%", background: "none", border: "none",
                                padding: "5px 0", cursor: "pointer", gap: 8,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                <div style={{
                                  width: 10, height: 10, flexShrink: 0,
                                  border: `1px solid ${active ? accent : "#2a2a2a"}`,
                                  background: active ? accent : "transparent",
                                  transition: "all 0.15s",
                                }} />
                                <span style={{
                                  fontFamily: "var(--font-stencil, monospace)",
                                  fontSize: 10, color: active ? "#e0d8cc" : "#555",
                                  textTransform: "uppercase", letterSpacing: "0.05em",
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                  transition: "color 0.15s",
                                }}>{b.name}</span>
                              </div>
                              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#333", flexShrink: 0 }}>
                                {b.count?.toLocaleString()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Price */}
              <div>
                <button style={sectionHeaderStyle(openSections.price)} onClick={() => toggle("price")}>
                  <span>Price</span>
                  <span style={{ fontSize: 10, color: "#333" }}>{openSections.price ? "▲" : "▼"}</span>
                </button>
                <AnimatePresence>
                  {openSections.price && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ paddingTop: 12, paddingBottom: 12, display: "flex", gap: 8 }}>
                        {["min_price", "max_price"].map((k, i) => (
                          <input
                            key={k}
                            type="number"
                            placeholder={i === 0 ? "Min" : "Max"}
                            value={filters[k] ?? ""}
                            onChange={e => onChange({ [k]: e.target.value || null })}
                            style={{
                              flex: 1, background: "#111", border: "1px solid #222",
                              color: "#c4c0bc", fontFamily: "var(--font-stencil, monospace)",
                              fontSize: 11, padding: "7px 10px", outline: "none",
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Clear all */}
              {(filters.category || filters.brand || filters.min_price || filters.max_price || filters.in_stock) && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => onChange({ category: null, brand: null, min_price: null, max_price: null, in_stock: false })}
                  style={{
                    marginTop: 24, width: "100%", background: "none",
                    border: `1px solid #2a2a2a`, color: "#555",
                    fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
                    letterSpacing: "0.18em", textTransform: "uppercase",
                    padding: "10px 0", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#888"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}
                >
                  Clear All Filters
                </motion.button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Era Hero ─────────────────────────────────────────────────────────────────

function EraHero({ era, total, onOpenFilters, filters, onFilterChange, sort, onSortChange }) {
  const activeFilterCount = [
    filters.category, filters.brand, filters.min_price, filters.max_price, filters.in_stock,
  ].filter(Boolean).length;

  return (
    <div style={{
      position: "relative",
      background: "#080808",
      borderBottom: "1px solid #1c1c1c",
      overflow: "hidden",
    }}>
      {/* Accent stripe */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2, background: era.accent,
      }} />

      {/* Noise texture overlay */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: "128px 128px",
        pointerEvents: "none",
      }} />

      <div style={{
        padding: "48px 40px 36px",
        position: "relative",
        maxWidth: 1400, margin: "0 auto",
      }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/" style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#444", textDecoration: "none",
            textTransform: "uppercase", transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#888"}
            onMouseLeave={e => e.currentTarget.style.color = "#444"}
          >Home</Link>
          <span style={{ color: "#2a2a2a", fontSize: 10 }}>›</span>
          <span style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#444", textTransform: "uppercase",
          }}>Eras</span>
          <span style={{ color: "#2a2a2a", fontSize: 10 }}>›</span>
          <span style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: era.accent, textTransform: "uppercase",
          }}>{era.display_name}</span>
        </div>

        {/* Era name */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: "clamp(52px, 8vw, 96px)",
            letterSpacing: "0.04em",
            lineHeight: 0.92,
            color: "#e8e2d8",
            margin: "0 0 12px",
          }}
        >{era.display_name}</motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <div style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
            letterSpacing: "0.2em", color: era.accent, textTransform: "uppercase",
          }}>{era.year_range}</div>
          <div style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 12,
            color: "#555", maxWidth: 520, lineHeight: 1.6,
          }}>{era.description}</div>
        </motion.div>

        {/* Toolbar */}
        <div style={{
          marginTop: 32, display: "flex", alignItems: "center",
          gap: 12, flexWrap: "wrap",
        }}>
          {/* Filter button */}
          <motion.button
            whileHover={{ borderColor: era.accent, color: era.accent }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenFilters}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "1px solid #2a2a2a",
              color: "#777", cursor: "pointer", padding: "9px 18px",
              fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
              letterSpacing: "0.18em", textTransform: "uppercase",
              transition: "border-color 0.15s, color 0.15s",
            }}
          >
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M0 1h12M2 5h8M4 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                background: era.accent, color: "#080808",
                borderRadius: "50%", width: 16, height: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700,
              }}>{activeFilterCount}</span>
            )}
          </motion.button>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => onSortChange(e.target.value)}
            style={{
              background: "#0e0e0e", border: "1px solid #2a2a2a",
              color: "#666", fontFamily: "var(--font-stencil, monospace)",
              fontSize: 9, letterSpacing: "0.12em", padding: "9px 14px",
              outline: "none", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Active filter tags */}
          {filters.category && (
            <ActiveTag
              label={ERA_CATEGORIES.find(c => c.slug === filters.category)?.label ?? filters.category}
              onRemove={() => onFilterChange({ category: null })}
              accent={era.accent}
            />
          )}
          {filters.brand && (
            <ActiveTag label={filters.brand} onRemove={() => onFilterChange({ brand: null })} accent={era.accent} />
          )}
          {filters.in_stock && (
            <ActiveTag label="In Stock" onRemove={() => onFilterChange({ in_stock: false })} accent={era.accent} />
          )}

          {/* Count */}
          <div style={{ marginLeft: "auto",
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#333", textTransform: "uppercase",
          }}>
            {total.toLocaleString()} parts
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveTag({ label, onRemove, accent }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${accent}18`, border: `1px solid ${accent}44`,
      padding: "5px 10px",
    }}>
      <span style={{
        fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
        letterSpacing: "0.1em", color: accent, textTransform: "uppercase",
      }}>{label}</span>
      <button onClick={onRemove} style={{
        background: "none", border: "none", color: accent,
        cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0,
      }}>×</button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EraPage({ params }) {
  const { slug } = params;
  const era = getEra(slug);

  const [products, setProducts]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [facets, setFacets]       = useState({ categories: [], brands: [], priceRange: { min: 0, max: 0 } });
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sort, setSort]           = useState("relevance");

  const [filters, setFilters] = useState({
    category:  null,
    brand:     null,
    in_stock:  false,
    min_price: null,
    max_price: null,
  });

  const fetchProducts = useCallback(async (f, pg, s) => {
    if (!era) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // Era-specific fitment params
      if (era.universal) {
        params.set("universal", "true");
      } else {
        era.families.forEach(fam => params.append("family", fam));
      }

      // Category — map slug to dbCategories
      if (f.category) {
        const catDef = ERA_CATEGORIES.find(c => c.slug === f.category);
        if (catDef) {
          catDef.dbCategories.forEach(db => params.append("dbCategory", db));
        }
      }

      if (f.brand)     params.set("brand",     f.brand);
      if (f.in_stock)  params.set("in_stock",  "true");
      if (f.min_price) params.set("min_price", f.min_price);
      if (f.max_price) params.set("max_price", f.max_price);
      params.set("sort",     s);
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
  }, [era]);

  useEffect(() => {
    fetchProducts(filters, page, sort);
  }, [filters, page, sort, fetchProducts]);

  function handleFilterChange(updates) {
    setFilters(f => ({ ...f, ...updates }));
    setPage(1);
  }

  if (!era) {
    return (
      <div style={{
        background: "#080808", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: 48, letterSpacing: "0.05em", color: "#222",
        }}>Era Not Found</div>
        <Link href="/" style={{
          fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
          letterSpacing: "0.18em", color: "#444", textDecoration: "none",
          textTransform: "uppercase",
        }}>← Back Home</Link>
      </div>
    );
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div style={{ background: "#080808", color: "#e0d8cc", minHeight: "100vh" }}>

      {/* Nav bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,8,0.96)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid #161616",
        padding: "0 40px", height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: 18, letterSpacing: "3px", color: "#e0d8cc", textDecoration: "none",
        }}>
          STINKIN'<span style={{ color: era.accent }}>'</span> SUPPLIES
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/browse" style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#444", textDecoration: "none",
            textTransform: "uppercase", transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#888"}
            onMouseLeave={e => e.currentTarget.style.color = "#444"}
          >All Parts</Link>
          <Link href="/my-garage" style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#444", textDecoration: "none",
            textTransform: "uppercase", border: "1px solid #222",
            padding: "6px 14px", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = era.accent; e.currentTarget.style.color = era.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#444"; }}
          >My Garage</Link>
        </div>
      </div>

      {/* Hero */}
      <EraHero
        era={era}
        total={total}
        onOpenFilters={() => setPanelOpen(true)}
        filters={filters}
        onFilterChange={handleFilterChange}
        sort={sort}
        onSortChange={s => { setSort(s); setPage(1); }}
      />

      {/* Side panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        filters={filters}
        onChange={updates => { handleFilterChange(updates); }}
        facets={facets}
        accent={era.accent}
      />

      {/* Product grid */}
      <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
        {loading ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{
                aspectRatio: "0.85",
                background: "linear-gradient(90deg, #0e0e0e 25%, #141414 50%, #0e0e0e 75%)",
                backgroundSize: "600px 100%",
                animation: "shimmer 1.4s infinite",
              }} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            minHeight: 400, gap: 16,
          }}>
            <div style={{
              fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
              fontSize: 36, letterSpacing: "0.04em", color: "#222",
            }}>No Parts Found</div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
              letterSpacing: "0.18em", color: "#333", textTransform: "uppercase",
            }}>Try adjusting your filters</div>
            <button
              onClick={() => handleFilterChange({ category: null, brand: null, min_price: null, max_price: null, in_stock: false })}
              style={{
                marginTop: 8, background: "none", border: `1px solid ${era.accent}44`,
                color: era.accent, fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                padding: "10px 24px", cursor: "pointer",
              }}
            >Clear Filters</button>
          </div>
        ) : (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}>
              {products.map((p, i) => (
                <ProductCard key={p.id ?? i} product={p} index={i} accent={era.accent} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: "flex", justifyContent: "center",
                gap: 6, marginTop: 56, flexWrap: "wrap",
              }}>
                <PaginationBtn disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} accent={era.accent}>← Prev</PaginationBtn>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const pg = page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <PaginationBtn key={pg} active={pg === page} onClick={() => setPage(pg)} accent={era.accent}>
                      {pg}
                    </PaginationBtn>
                  );
                })}
                <PaginationBtn disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} accent={era.accent}>Next →</PaginationBtn>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          from { background-position: -600px 0; }
          to   { background-position:  600px 0; }
        }
        @media (max-width: 768px) {
          .era-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .era-hero-padding { padding: 32px 20px 24px !important; }
          .era-nav-padding { padding: 0 20px !important; }
          .era-grid-padding { padding: 20px !important; }
        }
      `}</style>
    </div>
  );
}

function PaginationBtn({ children, active, disabled, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? accent : "#0e0e0e",
        border: `1px solid ${active ? accent : "#1e1e1e"}`,
        color: active ? "#080808" : disabled ? "#2a2a2a" : "#666",
        fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
        padding: "7px 14px", cursor: disabled ? "default" : "pointer",
        minWidth: 36, letterSpacing: "0.1em", transition: "all 0.15s",
      }}
    >{children}</button>
  );
}