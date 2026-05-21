"use client";
// ============================================================
// app/search/SearchClient.jsx
// Matches browse page aesthetic: cream/white bg, gold accents,
// light cards, same typography, framer-motion animations.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartSafe } from "@/components/CartContext";
import { getProductImage } from "@/lib/getProductImage";

// ── Design tokens (match browse/page.jsx exactly) ─────────────
const GOLD   = "#b8922a";
const CREAM  = "#faf7f2";
const CREAM2 = "#f2ede4";
const DARK   = "#0a0909";

// ── Constants ─────────────────────────────────────────────────
const POPULAR     = ["exhaust", "air cleaner", "handlebars", "seat", "wheels", "shocks", "battery", "footpegs", "helmet", "tires"];
const CATEGORIES  = ["Exhaust", "Air Cleaners", "Handlebars & Controls", "Seats & Sissy Bars", "Wheels & Tires", "Suspension", "Lighting", "Engine & Transmission", "Electrical", "Footpegs & Floorboards", "Brakes", "Fuel Systems", "Body & Fenders", "Apparel & Helmets"];
const DEBOUNCE_MS = 350;

const SORT_OPTIONS = [
  { value: "relevance",  label: "Relevance" },
  { value: "price-asc",  label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "name-asc",   label: "A → Z" },
];

// ── Helpers ───────────────────────────────────────────────────
function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: `rgba(184,146,42,0.18)`, color: GOLD, borderRadius: 1, padding: "0 2px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Collapsible sidebar section ───────────────────────────────
function SidebarSection({ label, active, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid rgba(184,146,42,0.15)` }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 14px 10px", cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "0.2em", color: GOLD, textTransform: "uppercase" }}>
            {label}
          </span>
          {active && (
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0, display: "inline-block" }} />
          )}
        </div>
        <span style={{ fontSize: 8, color: "#bbb", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
      </div>
      {open && (
        <div style={{ padding: "0 10px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Facet list ────────────────────────────────────────────────
function FacetList({ items, selected, loading, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 10);

  if (items.length === 0 && loading) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 4px", gap: 8, marginBottom: 2 }}>
            <div style={{ height: 10, flex: 1, background: CREAM2, borderRadius: 2 }} />
            <div style={{ height: 10, width: 28, background: CREAM2, borderRadius: 2 }} />
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {visible.map(item => {
        const on = selected === item.name;
        return (
          <div
            key={item.name}
            onClick={() => onSelect(item.name)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "5px 6px", borderRadius: 2, cursor: "pointer",
              background: on ? `rgba(184,146,42,0.08)` : "transparent",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                border: `1px solid ${on ? GOLD : "#ccc"}`,
                background: on ? GOLD : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, color: "#fff", transition: "all 0.15s",
              }}>
                {on ? "✓" : ""}
              </div>
              <span style={{ fontSize: 12, color: on ? DARK : "#555", fontWeight: on ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color 0.15s" }}>
                {item.name}
              </span>
            </div>
            <span style={{
              fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: loading ? "#ddd" : "#aaa",
              background: CREAM2, border: `1px solid rgba(184,146,42,0.2)`,
              padding: "1px 5px", borderRadius: 1, minWidth: 28, textAlign: "center",
              transition: "color 0.2s",
            }}>
              {item.count.toLocaleString()}
            </span>
          </div>
        );
      })}
      {items.length > 10 && (
        <button
          onClick={() => setShowAll(s => !s)}
          style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: GOLD, letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer", marginTop: 6, padding: "0 6px" }}
        >
          {showAll ? "SHOW LESS ▴" : `+${items.length - 10} MORE ▾`}
        </button>
      )}
    </>
  );
}

// ── Toggle ────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{ width: 32, height: 18, borderRadius: 9, background: on ? GOLD : "#ddd", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}
    >
      <div style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );
}

// ── HD Fitment filter ─────────────────────────────────────────
function FitmentFilter({ hdFamilies, filters, loading, onFamilySelect, onYearApply, onClear }) {
  const [yearFrom, setYearFrom] = useState(filters.yearStart ? String(filters.yearStart) : "");
  const [yearTo,   setYearTo]   = useState(filters.yearEnd   ? String(filters.yearEnd)   : "");

  useEffect(() => {
    setYearFrom(filters.yearStart ? String(filters.yearStart) : "");
    setYearTo(filters.yearEnd ? String(filters.yearEnd) : "");
  }, [filters.yearStart, filters.yearEnd]);

  const applyYears = () => {
    onYearApply(yearFrom ? parseInt(yearFrom) : null, yearTo ? parseInt(yearTo) : null);
  };

  const inputStyle = {
    background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, color: DARK,
    fontFamily: "var(--font-stencil, monospace)", fontSize: 12, letterSpacing: "0.05em",
    padding: "6px 8px", borderRadius: 2, outline: "none", width: "100%",
    transition: "border-color 0.15s",
  };

  return (
    <>
      {hdFamilies.length > 0 && (
        <FacetList items={hdFamilies} selected={filters.hdFamily} loading={loading} onSelect={val => onFamilySelect("hdFamily", val)} />
      )}
      {hdFamilies.length === 0 && !loading && (
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#bbb", letterSpacing: "0.08em", padding: "4px 6px 8px" }}>
          SEARCH TO SEE FAMILIES
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#aaa", letterSpacing: "0.12em", marginBottom: 6, paddingLeft: 2 }}>
          YEAR RANGE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          <input style={inputStyle} placeholder="FROM" type="number" min="1903" max="2030" value={yearFrom}
            onChange={e => setYearFrom(e.target.value)} onKeyDown={e => e.key === "Enter" && applyYears()} />
          <input style={inputStyle} placeholder="TO"   type="number" min="1903" max="2030" value={yearTo}
            onChange={e => setYearTo(e.target.value)}   onKeyDown={e => e.key === "Enter" && applyYears()} />
        </div>
        <button
          onClick={applyYears}
          style={{ width: "100%", background: GOLD, border: "none", color: "#fff", fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 14, letterSpacing: "0.08em", padding: 7, borderRadius: 2, cursor: "pointer", transition: "background 0.15s" }}
        >
          APPLY
        </button>
        {(filters.hdFamily || filters.yearStart || filters.yearEnd) && (
          <button
            onClick={onClear}
            style={{ width: "100%", background: "transparent", border: `1px solid rgba(184,146,42,0.3)`, color: "#aaa", fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", padding: 6, borderRadius: 2, cursor: "pointer", marginTop: 6, transition: "all 0.15s" }}
          >
            CLEAR FITMENT
          </button>
        )}
      </div>
    </>
  );
}

// ── Full sidebar contents (desktop + drawer) ──────────────────
function SidebarContents({ facets, filters, loading, setFilters, minInput, setMinInput, maxInput, setMaxInput, applyPrice }) {
  const inputStyle = {
    background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, color: DARK,
    fontFamily: "var(--font-stencil, monospace)", fontSize: 13,
    padding: "6px 9px", borderRadius: 2, outline: "none", width: "100%",
    transition: "border-color 0.15s",
  };

  return (
    <>
      <SidebarSection label="Category" active={!!filters.category}>
        <FacetList
          items={facets.categories} selected={filters.category} loading={loading}
          onSelect={val => setFilters(prev => ({ ...prev, category: prev.category === val ? null : val }))}
        />
      </SidebarSection>

      <SidebarSection label="Brand" active={!!filters.brand}>
        <FacetList
          items={facets.brands} selected={filters.brand} loading={loading}
          onSelect={val => setFilters(prev => ({ ...prev, brand: prev.brand === val ? null : val }))}
        />
      </SidebarSection>

      <SidebarSection label="HD Fitment" active={!!(filters.hdFamily || filters.yearStart || filters.yearEnd)} defaultOpen={false}>
        <FitmentFilter
          hdFamilies={facets.hdFamilies ?? []} filters={filters} loading={loading}
          onFamilySelect={(key, val) => setFilters(prev => ({ ...prev, hdFamily: prev.hdFamily === val ? null : val }))}
          onYearApply={(from, to) => setFilters(prev => ({ ...prev, yearStart: from, yearEnd: to }))}
          onClear={() => setFilters(prev => ({ ...prev, hdFamily: null, yearStart: null, yearEnd: null }))}
        />
      </SidebarSection>

      <SidebarSection label="Price Range" active={filters.minPrice != null || filters.maxPrice != null}>
        {facets.priceRange?.max > 0 && (
          <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#aaa", letterSpacing: "0.08em", marginBottom: 8 }}>
            ${Math.floor(facets.priceRange.min).toLocaleString()} – ${Math.ceil(facets.priceRange.max).toLocaleString()}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          <input style={inputStyle} placeholder="Min $" type="number" value={minInput}
            onChange={e => setMinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && applyPrice()} />
          <input style={inputStyle} placeholder="Max $" type="number" value={maxInput}
            onChange={e => setMaxInput(e.target.value)} onKeyDown={e => e.key === "Enter" && applyPrice()} />
        </div>
        <button
          onClick={applyPrice}
          style={{ width: "100%", background: GOLD, border: "none", color: "#fff", fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 14, letterSpacing: "0.08em", padding: 7, borderRadius: 2, cursor: "pointer" }}
        >
          APPLY
        </button>
      </SidebarSection>

      <SidebarSection label="Availability" active={filters.inStock}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px" }}>
          <span style={{ fontSize: 13, color: "#555" }}>In Stock Only</span>
          <Toggle on={filters.inStock} onChange={val => setFilters(prev => ({ ...prev, inStock: val }))} />
        </div>
      </SidebarSection>
    </>
  );
}

// ── Product card (matches browse/page.jsx ProductCard) ────────
function ResultCard({ p, i, query, onAdd }) {
  const [imgErr, setImgErr] = useState(false);
  const imageSrc = getProductImage({
    image:  p.image  ?? null,
    images: Array.isArray(p.images) ? p.images : [],
    brand:  p.brand,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.03, type: "spring", stiffness: 300, damping: 24 }}
      style={{ opacity: p.inStock ? 1 : 0.6 }}
    >
      <motion.div
        whileHover={{ y: -4, borderColor: GOLD, boxShadow: `0 8px 32px rgba(184,146,42,0.15)` }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onClick={() => window.location.href = `/browse/${p.slug}`}
        style={{ background: "#fff", border: `1px solid rgba(184,146,42,0.35)`, overflow: "hidden", cursor: "pointer" }}
      >
        {/* Image */}
        <div style={{ aspectRatio: "1", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
          {imageSrc && !imgErr ? (
            <img
              src={imageSrc} alt={p.name} onError={() => setImgErr(true)}
              style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }}
            />
          ) : (
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: 2, color: "#ccc", textTransform: "uppercase" }}>
              No Image
            </div>
          )}

          {/* OEM badge */}
          {p.oem_numbers?.length > 0 ? (
            <div style={{ position: "absolute", top: 8, left: 0 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 22" width={72} height={22} style={{ display: "block" }}>
                <defs><linearGradient id="oem-grad-s" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#ffd700"/><stop offset="50%" stopColor="#c8a800"/><stop offset="100%" stopColor="#a88800"/></linearGradient></defs>
                <path d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z" fill="rgba(0,0,0,0.15)" transform="translate(1,1.5)"/>
                <path d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z" fill="url(#oem-grad-s)"/>
                <path d="M8,5 L64,5 L69,11 L64,17 L8,17 L3,11 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.75"/>
                <text x="36" y="15" textAnchor="middle" fontFamily="'Barlow Condensed','Arial Narrow',sans-serif" fontWeight="700" fontSize="9" letterSpacing="1.5" fill="rgba(0,0,0,0.75)">OEM</text>
              </svg>
            </div>
          ) : p.is_harley_fitment ? (
            <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(184,146,42,0.1)", border: `1px solid rgba(184,146,42,0.4)`, fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: 1, color: GOLD, padding: "3px 7px", textTransform: "uppercase" }}>
              HD Fit
            </div>
          ) : null}

          {/* Out of stock */}
          {!p.inStock && (
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.9)", border: "1px solid #ddd", fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: 1, color: "#999", padding: "3px 7px", textTransform: "uppercase" }}>
              Out of Stock
            </div>
          )}

          {/* Variants badge */}
          {p.variant_count > 1 && (
            <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: GOLD, border: "1.5px solid rgba(0,0,0,0.25)", borderRadius: 3, padding: "3px 8px" }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="2" cy="2" r="1.5" fill="#1a1000"/><circle cx="6" cy="2" r="1.5" fill="#1a1000" opacity="0.7"/><circle cx="2" cy="6" r="1.5" fill="#1a1000" opacity="0.7"/><circle cx="6" cy="6" r="1.5" fill="#1a1000" opacity="0.4"/></svg>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: 1, color: "#1a1000", textTransform: "uppercase" }}>{p.variant_count} options</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: "12px 14px 16px", borderTop: `1px solid rgba(184,146,42,0.2)` }}>
          <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: 2, color: GOLD, textTransform: "uppercase", marginBottom: 4 }}>
            {p.brand}
          </div>
          <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 12, color: "#2a2018", lineHeight: 1.3, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {highlight(p.name, query)}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              {p.was && <span style={{ fontSize: 11, color: "#aaa", textDecoration: "line-through", display: "block", marginBottom: 1 }}>${p.was.toFixed(2)}</span>}
              <span style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 20, letterSpacing: 1, color: DARK }}>
                ${p.price?.toFixed(2) ?? "—"}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05, background: GOLD, color: "#fff" }}
              whileTap={{ scale: 0.95 }}
              onClick={e => { e.stopPropagation(); if (p.inStock) onAdd(); }}
              disabled={!p.inStock}
              style={{ background: p.inStock ? CREAM2 : "#f5f5f5", border: `1px solid ${p.inStock ? "rgba(184,146,42,0.3)" : "#ddd"}`, color: p.inStock ? GOLD : "#ccc", width: 30, height: 30, fontSize: 18, cursor: p.inStock ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, color 0.15s" }}
            >
              +
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Pagination button (matches browse/page.jsx PagBtn) ────────
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
        fontSize: "10px", padding: "7px 12px",
        cursor: disabled ? "default" : "pointer",
        minWidth: 36, letterSpacing: "1px",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────
export default function SearchClient({ initialQuery = "" }) {
  const [query,        setQuery]        = useState(initialQuery);
  const [input,        setInput]        = useState(initialQuery);
  const [sort,         setSort]         = useState("relevance");
  const [results,      setResults]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [facets,       setFacets]       = useState({ categories: [], brands: [], hdFamilies: [], priceRange: { min: 0, max: 0 } });
  const [filters,      setFilters]      = useState({ category: null, brand: null, minPrice: null, maxPrice: null, inStock: false, hdFamily: null, yearStart: null, yearEnd: null });
  const [minInput,     setMinInput]     = useState("");
  const [maxInput,     setMaxInput]     = useState("");
  const [saleProducts, setSaleProducts] = useState([]);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [page,         setPage]         = useState(1);

  const PER_PAGE = 48;

  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const { addItem } = useCartSafe();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  useEffect(() => {
    fetch("/api/search?q=*&per_page=8&sort=relevance&closeout=true")
      .then(r => r.json())
      .then(d => setSaleProducts(d.products ?? []))
      .catch(() => {});
  }, []);

  // Sync filters from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setFilters({
      category:  params.get("category")  || null,
      brand:     params.get("brand")     || null,
      minPrice:  params.get("minPrice")  ? Number(params.get("minPrice"))       : null,
      maxPrice:  params.get("maxPrice")  ? Number(params.get("maxPrice"))       : null,
      inStock:   params.get("inStock") === "true",
      hdFamily:  params.get("hd_family") || null,
      yearStart: params.get("year_start") ? parseInt(params.get("year_start")) : null,
      yearEnd:   params.get("year_end")   ? parseInt(params.get("year_end"))   : null,
    });
    setMinInput(params.get("minPrice") ?? "");
    setMaxInput(params.get("maxPrice") ?? "");
  }, []);

  const fetchResults = useCallback(async (q, s, pg = 1) => {
    if (!q.trim()) { setResults([]); setTotal(0); return; }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search:   q,
        page:     String(pg),
        per_page: String(PER_PAGE),
        ...(filters.category  && { category:  filters.category }),
        ...(filters.brand     && { brand:     filters.brand }),
        ...(filters.minPrice  != null && { minPrice:  String(filters.minPrice) }),
        ...(filters.maxPrice  != null && { maxPrice:  String(filters.maxPrice) }),
        ...(filters.inStock   && { inStock:   "true" }),
        ...(filters.hdFamily  && { hd_family: filters.hdFamily }),
        ...(filters.yearStart && { year_start: String(filters.yearStart) }),
        ...(filters.yearEnd   && { year_end:   String(filters.yearEnd) }),
        ...(s !== "relevance" && { sort:       s }),
      });
      const res  = await fetch(`/api/search?${params}`, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.products ?? []);
      setTotal(data.total ?? 0);
      setFacets(data.facets ?? { categories: [], brands: [], hdFamilies: [], priceRange: { min: 0, max: 0 } });
    } catch (err) {
      if (err.name !== "AbortError") { console.error("[Search]", err.message); setResults([]); }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => fetchResults(query, sort, page), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, sort, filters, page, fetchResults]);

  const doSearch = (q) => {
    setQuery(q); setInput(q); setPage(1);
    window.history.replaceState(null, "", q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  const applyPrice = useCallback(() => {
    setFilters(prev => ({ ...prev, minPrice: minInput ? Number(minInput) : null, maxPrice: maxInput ? Number(maxInput) : null }));
  }, [minInput, maxInput]);

  const clearAll = useCallback(() => {
    setFilters({ category: null, brand: null, minPrice: null, maxPrice: null, inStock: false, hdFamily: null, yearStart: null, yearEnd: null });
    setMinInput(""); setMaxInput("");
  }, []);

  const chips = [
    filters.category  && { key: "category",  label: filters.category },
    filters.brand     && { key: "brand",      label: filters.brand },
    filters.minPrice  != null && { key: "minPrice",  label: `$${filters.minPrice}+` },
    filters.maxPrice  != null && { key: "maxPrice",  label: `≤$${filters.maxPrice}` },
    filters.inStock   && { key: "inStock",   label: "In Stock" },
    filters.hdFamily  && { key: "hdFamily",  label: filters.hdFamily },
    filters.yearStart && { key: "yearStart", label: `From ${filters.yearStart}` },
    filters.yearEnd   && { key: "yearEnd",   label: `To ${filters.yearEnd}` },
  ].filter(Boolean);

  const removeChip = (key) => {
    if (key === "minPrice" || key === "maxPrice") {
      setFilters(prev => ({ ...prev, minPrice: null, maxPrice: null }));
      setMinInput(""); setMaxInput("");
    } else if (key === "yearStart" || key === "yearEnd") {
      setFilters(prev => ({ ...prev, yearStart: null, yearEnd: null }));
    } else if (key === "inStock") {
      setFilters(prev => ({ ...prev, inStock: false }));
    } else {
      setFilters(prev => ({ ...prev, [key]: null }));
    }
  };

  const sidebarProps = { facets, filters, loading, setFilters: (updater) => { setFilters(updater); setPage(1); }, minInput, setMinInput, maxInput, setMaxInput, applyPrice };
  const activeFilterCount = chips.length;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div style={{ background: CREAM, minHeight: "100vh", color: DARK }}>

      {/* ── SEARCH HERO ── */}
      <div style={{ background: "#fff", borderBottom: `1px solid rgba(184,146,42,0.2)`, padding: "28px 24px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: GOLD, letterSpacing: "0.25em", marginBottom: 10, textTransform: "uppercase" }}>
            SEARCH 500K+ PARTS
          </div>
          <form onSubmit={e => { e.preventDefault(); doSearch(input.trim()); }} style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search parts, brands, categories..."
              value={input}
              onChange={e => { setInput(e.target.value); doSearch(e.target.value); }}
              style={{
                flex: 1, height: 54,
                background: "#fff", border: `1px solid rgba(184,146,42,0.4)`, borderRight: "none",
                color: DARK, fontFamily: "var(--font-stencil, monospace)",
                fontSize: 20, fontWeight: 600, letterSpacing: "0.03em",
                padding: "0 20px", outline: "none", borderRadius: "2px 0 0 2px",
                transition: "border-color 0.2s",
              }}
            />
            {input && (
              <button
                type="button"
                onClick={() => { setInput(""); doSearch(""); inputRef.current?.focus(); }}
                style={{ position: "absolute", right: 68, background: "none", border: "none", color: "#bbb", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1, transition: "color 0.15s" }}
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              style={{ height: 54, width: 64, flexShrink: 0, background: GOLD, border: "none", color: "#fff", fontSize: 20, borderRadius: "0 2px 2px 0", cursor: "pointer", transition: "background 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              🔍
            </button>
          </form>

          {!query && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#aaa", letterSpacing: "0.15em" }}>POPULAR:</span>
              {POPULAR.map(p => (
                <button
                  key={p}
                  onClick={() => doSearch(p)}
                  style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#888", letterSpacing: "0.1em", border: `1px solid rgba(184,146,42,0.25)`, borderRadius: 2, padding: "3px 9px", cursor: "pointer", background: "transparent", transition: "all 0.15s" }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {query ? (
        <>
          {/* ── TOOLBAR ── */}
          <div style={{ background: "#fff", borderBottom: `1px solid rgba(184,146,42,0.15)`, padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Mobile filter button */}
              <button
                className="mobile-filter-btn"
                onClick={() => setDrawerOpen(true)}
                style={{ display: "none" }}
              >
                ⇌ FILTERS {activeFilterCount > 0 && <span style={{ background: GOLD, color: "#fff", fontSize: 8, fontWeight: 700, borderRadius: "50%", width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{activeFilterCount}</span>}
              </button>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 10, color: "#aaa", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {loading
                  ? <span style={{ color: "#ccc" }}>SEARCHING…</span>
                  : <><span style={{ color: GOLD }}>{total.toLocaleString()}</span> RESULTS FOR "{query.toUpperCase()}"</>
                }
              </span>
            </div>
            <select
              value={sort}
              onChange={e => { setSort(e.target.value); setPage(1); }}
              style={{ background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, color: DARK, fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "1px", padding: "7px 10px", outline: "none", textTransform: "uppercase", cursor: "pointer" }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* ── LAYOUT ── */}
          <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto" }}>

            {/* Desktop sidebar */}
            <aside className="search-desktop-sidebar" style={{ width: 215, flexShrink: 0, background: "#fff", borderRight: `1px solid rgba(184,146,42,0.15)`, overflowY: "auto", maxHeight: "calc(100vh - 110px)", position: "sticky", top: 0, alignSelf: "start" }}>
              <SidebarContents {...sidebarProps} />
            </aside>

            {/* Results */}
            <div style={{ flex: 1, padding: "16px 16px 120px", minWidth: 0 }}>

              {/* Active filter chips */}
              {chips.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
                  {chips.map(f => (
                    <span
                      key={f.key}
                      onClick={() => removeChip(f.key)}
                      style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, background: `rgba(184,146,42,0.1)`, border: `1px solid rgba(184,146,42,0.25)`, borderRadius: 2, padding: "2px 8px", color: GOLD, letterSpacing: "0.1em", cursor: "pointer", userSelect: "none", transition: "all 0.15s" }}
                    >
                      {f.label} ×
                    </span>
                  ))}
                  <button
                    onClick={clearAll}
                    style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.1em", color: "#aaa", background: "none", border: "none", cursor: "pointer" }}
                  >
                    CLEAR ALL
                  </button>
                </div>
              )}

              {/* Grid */}
              {loading ? (
                <div className="product-grid">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} style={{ aspectRatio: "0.8", background: `linear-gradient(90deg, #f0ebe3 25%, ${CREAM} 50%, #f0ebe3 75%)`, backgroundSize: "600px 100%", animation: "shimmer 1.4s infinite" }} />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 16 }}>
                  <div style={{ fontSize: 48 }}>🔧</div>
                  <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 28, letterSpacing: 2, color: "#bbb" }}>
                    NO RESULTS FOR "{query.toUpperCase()}"
                  </div>
                  <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#ccc", textTransform: "uppercase", letterSpacing: 1 }}>
                    TRY A DIFFERENT SEARCH TERM OR BROWSE BY CATEGORY
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                    {POPULAR.map(p => (
                      <button key={p} onClick={() => doSearch(p)}
                        style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#888", border: `1px solid rgba(184,146,42,0.25)`, borderRadius: 2, padding: "3px 9px", cursor: "pointer", background: "transparent" }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="product-grid">
                    {results.map((p, i) => (
                      <ResultCard key={p.id} p={p} i={i} query={query} onAdd={() => addItem(p)} />
                    ))}
                  </div>

                  {/* ── PAGINATION ── */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 40, flexWrap: "wrap", paddingBottom: 24 }}>
                      <PagBtn onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }} disabled={page === 1}>← Prev</PagBtn>
                      {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                        const pg = page <= 4
                          ? i + 1
                          : page >= totalPages - 3
                            ? totalPages - 6 + i
                            : page - 3 + i;
                        if (pg < 1 || pg > totalPages) return null;
                        return (
                          <PagBtn key={pg} onClick={() => { setPage(pg); window.scrollTo(0, 0); }} active={pg === page}>{pg}</PagBtn>
                        );
                      })}
                      <PagBtn onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0); }} disabled={page === totalPages}>Next →</PagBtn>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── LANDING ── */
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
          <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 28, letterSpacing: "0.05em", color: DARK, marginBottom: 16, borderBottom: `1px solid rgba(184,146,42,0.2)`, paddingBottom: 10 }}>
            BROWSE BY <span style={{ color: GOLD }}>CATEGORY</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 36 }}>
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => window.location.href = `/browse?category=${encodeURIComponent(c)}`}
                style={{ background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, borderRadius: 2, padding: "10px 18px", cursor: "pointer", fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 16, letterSpacing: "0.07em", color: "#888", transition: "all 0.2s" }}
              >
                {c}
              </button>
            ))}
          </div>
          {saleProducts.length > 0 && (
            <>
              <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 28, letterSpacing: "0.05em", color: DARK, marginBottom: 16, borderBottom: `1px solid rgba(184,146,42,0.2)`, paddingBottom: 10 }}>
                ON <span style={{ color: GOLD }}>SALE NOW</span>
              </div>
              <div className="product-grid">
                {saleProducts.map((p, i) => (
                  <ResultCard key={p.id} p={p} i={i} query="" onAdd={() => addItem(p)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MOBILE DRAWER ── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)" }}
            />
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 280, zIndex: 201, background: "#fff", borderRight: `1px solid rgba(184,146,42,0.2)`, display: "flex", flexDirection: "column" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid rgba(184,146,42,0.15)`, flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 10, color: GOLD, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                  FILTERS {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
                </span>
                <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", color: "#aaa", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                <SidebarContents {...sidebarProps} />
              </div>
              {activeFilterCount > 0 && (
                <div style={{ padding: "14px 16px", borderTop: `1px solid rgba(184,146,42,0.15)`, flexShrink: 0 }}>
                  <button
                    onClick={() => { clearAll(); setDrawerOpen(false); }}
                    style={{ width: "100%", background: "transparent", border: `1px solid rgba(184,146,42,0.3)`, color: "#aaa", fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", padding: 8, borderRadius: 2, cursor: "pointer" }}
                  >
                    CLEAR ALL FILTERS
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
        .search-desktop-sidebar { display: block !important; }
        .mobile-filter-btn { display: none !important; }
        @media (max-width: 768px) {
          .search-desktop-sidebar { display: none !important; }
          .mobile-filter-btn { display: flex !important; }
          .product-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .product-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
