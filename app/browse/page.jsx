"use client";

/**
 * app/browse/page.jsx — Parts Catalog Browse
 *
 * Dark coal background. Product cards render as cream specification-sheet
 * tiles on a dark workbench, separated by gold-ruled hairlines with
 * crosshair registration marks at every intersection.
 *
 * Layout:
 *   • Page header — catalog section identifier + active context
 *   • Search + sort bar
 *   • Product grid (4 col → 2 mobile)
 *   • Pagination — stamp-style square buttons
 *   • FilterSidebar — fixed bottom pill (manages its own open state)
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import FilterSidebar from "@/components/browse/FilterSidebar";
import ProductCard   from "@/components/browse/ProductCard";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getPrimaryVehicle } from "@/lib/supabase/garage";

const PER_PAGE = 48;

const SORT_OPTIONS = [
  { value: "relevance",  label: "Relevance"  },
  { value: "price_asc",  label: "Price ↑"    },
  { value: "price_desc", label: "Price ↓"    },
  { value: "name_asc",   label: "A → Z"      },
  { value: "newest",     label: "Newest"      },
  { value: "year_asc",   label: "Year ↑"     },
  { value: "year_desc",  label: "Year ↓"     },
];

// ── Browse page inner ─────────────────────────────────────────────────────────

function BrowsePageInner() {
  const searchParams = useSearchParams();

  // Restore scroll position when navigating back
  useEffect(() => {
    const saved = sessionStorage.getItem("browse_scroll");
    if (saved) { window.scrollTo(0, parseInt(saved)); sessionStorage.removeItem("browse_scroll"); }
  }, []);

  const [products,    setProducts]    = useState([]);
  const [total,       setTotal]       = useState(0);
  const [facets,      setFacets]      = useState({ categories: [], brands: [], priceRange: { min: 0, max: 0 } });
  const [loading,     setLoading]     = useState(true);
  const [page,        setPage]        = useState(1);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");

  const [filters, setFilters] = useState({
    era:                 searchParams.get("era")              || null,
    family:              searchParams.get("family")           || null,
    model:               searchParams.get("model")            || null,
    modelCodes:          searchParams.getAll("model_code").length > 0 ? searchParams.getAll("model_code") : null,
    year:                searchParams.get("year")             ? parseInt(searchParams.get("year")) : null,
    display_category:    searchParams.get("display_category") || searchParams.get("category") || null,
    display_subcategory: searchParams.get("display_subcategory") || null,
    subcategory_detail:  searchParams.get("subcategory_detail")  || null,
    year_min:            searchParams.get("year_min")  ? parseInt(searchParams.get("year_min"))    : null,
    year_max:            searchParams.get("year_max")  ? parseInt(searchParams.get("year_max"))    : null,
    brand:               searchParams.get("brand")            || null,
    q:                   searchParams.get("q")                || null,
    in_stock:            searchParams.get("in_stock")         === "true",
    min_price:           searchParams.get("min_price") ? parseFloat(searchParams.get("min_price")) : null,
    max_price:           searchParams.get("max_price") ? parseFloat(searchParams.get("max_price")) : null,
    sort:                searchParams.get("sort")             || "relevance",
  });

  // Debounce search input → filters.q
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
      if (f.subcategory_detail)   params.set("subcategory_detail", f.subcategory_detail);
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
      setTotal(data.total    ?? 0);
      setFacets(data.facets  ?? { categories: [], brands: [], priceRange: { min: 0, max: 0 } });
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProducts(filters, page); }, [filters, page, fetchProducts]);
  useEffect(() => { setPage(1); }, [filters]);

  // My Garage: ambiently apply the signed-in user's primary vehicle when the
  // page loads with no explicit fitment/category filters in the URL.
  const [garageVehicle, setGarageVehicle] = useState(null);
  useEffect(() => {
    const hasExplicitFilter = ["era", "family", "model", "model_code", "year"]
      .some(k => searchParams.has(k));
    if (hasExplicitFilter) return;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      const vehicle = await getPrimaryVehicle(supabase);
      if (cancelled || !vehicle?.modelCode || !vehicle?.year) return;
      setGarageVehicle(vehicle);
      handleFilterChange({ modelCodes: [vehicle.modelCode], year: vehicle.year });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearGarageFilter() {
    setGarageVehicle(null);
    handleFilterChange({ modelCodes: null, year: null });
  }

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
    if (next.subcategory_detail)   p.set("subcategory_detail", next.subcategory_detail);
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

  const totalPages   = Math.ceil(total / PER_PAGE);
  const contextLabel = filters.family
    ? [filters.family, filters.model, filters.year].filter(Boolean).join(" / ")
    : filters.q              ? `"${filters.q}"`
    : filters.display_category ? filters.display_category
    : "All Parts";

  const activeCount = [
    filters.family, filters.model, filters.era,
    filters.display_category, filters.brand,
    filters.min_price, filters.max_price, filters.in_stock,
  ].filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bp-root">

      {/* ── Page header — catalog section identifier ── */}
      <header className="bp-header">
        <div className="bp-blueprint-bg" aria-hidden="true" />

        <div className="bp-header-inner">
          {/* Left: section ident */}
          <div className="bp-header-left">
            <span className="bp-header-ident">Stinkin&apos; Supplies · Parts Catalog</span>
            <span className="bp-header-rule" aria-hidden="true" />
          </div>

          {/* Center: current context in Tanker */}
          <h1 className="bp-header-context">{contextLabel}</h1>

          {/* Right: total count */}
          <div className="bp-header-right">
            <span className="bp-header-count">{total.toLocaleString()}</span>
            <span className="bp-header-count-label">parts</span>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="bp-header-bottom-rule" aria-hidden="true" />
      </header>

      {/* ── Search + sort bar ── */}
      <div className="bp-controls">

        {/* Search input */}
        <div className={`bp-search${searchInput ? " bp-search--active" : ""}`}>
          <svg className="bp-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
          </svg>
          <input
            type="search"
            className="bp-search-input"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Escape" && setSearchInput("")}
            placeholder="Search parts, OEM numbers, brands…"
          />
          {searchInput && (
            <button className="bp-search-clear" onClick={() => setSearchInput("")} aria-label="Clear search">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Sort + active context chip */}
        <div className="bp-sort-row">
          <div className="bp-sort-left">
            <span className="bp-result-count">{total.toLocaleString()} results</span>
            {garageVehicle && (
              <div className="bp-context-chip" style={{ borderColor: "rgba(184,146,42,0.5)" }}>
                <span className="bp-context-chip-label">
                  Filtering for your {garageVehicle.year} {garageVehicle.nickname || garageVehicle.model}
                </span>
                <button className="bp-context-chip-clear" onClick={clearGarageFilter}>×</button>
              </div>
            )}
            {activeCount > 0 && (
              <div className="bp-context-chip">
                <span className="bp-context-chip-label">{contextLabel}</span>
                <button
                  className="bp-context-chip-clear"
                  onClick={() => handleFilterChange({
                    family: null, model: null, year: null, era: null,
                    display_category: null, display_subcategory: null,
                    subcategory_detail: null, year_min: null, year_max: null,
                    brand: null, min_price: null, max_price: null,
                    in_stock: false, modelCodes: null, q: null,
                  })}
                >×</button>
              </div>
            )}
          </div>

          <select
            className="bp-sort-select"
            value={filters.sort}
            onChange={e => handleFilterChange({ sort: e.target.value })}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Product grid ── */}
      <div className="bp-grid-wrap">
        {loading ? (
          <div className="product-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bp-skeleton" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bp-empty">
            {/* Technical no-results illustration */}
            <svg className="bp-empty-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <rect x="10" y="10" width="60" height="60" strokeDasharray="4 3"/>
              <line x1="10" y1="10" x2="5" y2="5"/><line x1="70" y1="10" x2="75" y2="5"/>
              <line x1="10" y1="70" x2="5" y2="75"/><line x1="70" y1="70" x2="75" y2="75"/>
              <line x1="25" y1="32" x2="55" y2="32"/><line x1="25" y1="40" x2="50" y2="40"/>
              <line x1="25" y1="48" x2="45" y2="48"/>
              <circle cx="40" cy="58" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
            <p className="bp-empty-head">No Parts Found</p>
            <p className="bp-empty-sub">Adjust your filters or search terms</p>
            <button
              className="bp-empty-reset"
              onClick={() => handleFilterChange({
                family: null, model: null, year: null, era: null,
                display_category: null, display_subcategory: null,
                subcategory_detail: null, brand: null,
                min_price: null, max_price: null, in_stock: false, q: null,
              })}
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="product-grid">
            {products.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div className="bp-pagination">
            <span className="bp-pag-label">
              Page {page} of {totalPages.toLocaleString()}
            </span>
            <div className="bp-pag-buttons">
              <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</PagBtn>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const pg = page <= 4 ? i + 1
                  : page >= totalPages - 3 ? totalPages - 6 + i
                  : page - 3 + i;
                if (pg < 1 || pg > totalPages) return null;
                return <PagBtn key={pg} onClick={() => setPage(pg)} active={pg === page}>{pg}</PagBtn>;
              })}
              <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</PagBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed bottom filter pill ── */}
      <FilterSidebar
        facets={facets}
        filters={filters}
        onChange={handleFilterChange}
        total={total}
      />

      <style>{`
        /* ── Page root ─────────────────────────────────────────── */
        .bp-root {
          background: var(--coal);
          color: var(--cream);
          min-height: 100vh;
        }

        /* ── Page header ───────────────────────────────────────── */
        .bp-header {
          position: relative;
          padding: 32px clamp(16px, 3vw, 40px) 24px;
          border-bottom: 1px solid var(--gold-rule);
          overflow: hidden;
        }
        .bp-blueprint-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(61,90,122,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,90,122,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }
        .bp-header-inner {
          position: relative;
          display: flex;
          align-items: flex-end;
          gap: 24px;
          flex-wrap: wrap;
          z-index: 1;
        }
        .bp-header-left {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }
        .bp-header-ident {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--gold-dim);
          text-transform: uppercase;
        }
        .bp-header-rule {
          display: block;
          width: 32px;
          height: 2px;
          background: var(--gold);
          box-shadow: 0 0 8px rgba(197,167,34,0.4);
        }
        .bp-header-context {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(32px, 5vw, 64px);
          font-weight: 400;
          line-height: 0.9;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          color: var(--cream-light);
          text-shadow:
            0  1px 0 rgba(255,255,255,0.07),
            0 -1px 0 rgba(0,0,0,0.80),
            0  4px 24px rgba(0,0,0,0.5);
          flex: 1;
          margin: 0;
        }
        .bp-header-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          flex-shrink: 0;
        }
        .bp-header-count {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(24px, 3vw, 40px);
          color: var(--gold);
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .bp-header-count-label {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--chrome);
          text-transform: uppercase;
        }
        .bp-header-bottom-rule {
          position: relative;
          z-index: 1;
          margin-top: 20px;
          height: 1px;
          background: linear-gradient(to right, var(--gold-rule) 0%, transparent 80%);
        }

        /* ── Controls bar ──────────────────────────────────────── */
        .bp-controls {
          padding: 16px clamp(16px, 3vw, 40px);
          border-bottom: 1px solid var(--steel);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Search */
        .bp-search {
          display: flex;
          align-items: center;
          gap: 0;
          background: var(--iron);
          border: 1px solid var(--steel);
          transition: border-color 0.15s;
        }
        .bp-search--active,
        .bp-search:focus-within {
          border-color: var(--gold-rule);
        }
        .bp-search-icon {
          flex-shrink: 0;
          padding: 0 14px;
          color: var(--chrome);
          transition: color 0.15s;
        }
        .bp-search--active .bp-search-icon,
        .bp-search:focus-within .bp-search-icon {
          color: var(--gold-dim);
        }
        .bp-search-input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-family: var(--font-body), sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: var(--cream);
          padding: 13px 0;
          -webkit-appearance: none;
        }
        .bp-search-input::placeholder {
          color: var(--chrome);
          font-weight: 400;
        }
        /* Hide browser search decorations */
        .bp-search-input::-webkit-search-decoration,
        .bp-search-input::-webkit-search-cancel-button,
        .bp-search-input::-webkit-search-results-button,
        .bp-search-input::-webkit-search-results-decoration { display: none; }

        .bp-search-clear {
          display: flex;
          align-items: center;
          padding: 0 14px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--fog);
          flex-shrink: 0;
          transition: color 0.12s;
        }
        .bp-search-clear:hover { color: var(--silver); }

        /* Sort row */
        .bp-sort-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .bp-sort-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .bp-result-count {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          letter-spacing: var(--tracking-wider);
          color: var(--chrome);
          text-transform: uppercase;
        }
        .bp-context-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(197,167,34,0.10);
          border: 1px solid var(--gold-rule);
          padding: 3px 8px 3px 10px;
        }
        .bp-context-chip-label {
          font-family: var(--font-body), sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: var(--gold-bright);
        }
        .bp-context-chip-clear {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--gold-dim);
          font-size: 14px;
          line-height: 1;
          padding: 0 1px;
          display: flex;
          align-items: center;
        }
        .bp-context-chip-clear:hover { color: var(--gold); }
        .bp-sort-select {
          background: var(--iron);
          border: 1px solid var(--steel);
          color: var(--silver);
          font-family: var(--font-body), sans-serif;
          font-size: 13px;
          font-weight: 500;
          padding: 8px 12px;
          outline: none;
          cursor: pointer;
          border-radius: 0;
          transition: border-color 0.15s;
        }
        .bp-sort-select:hover,
        .bp-sort-select:focus { border-color: var(--gold-rule); }

        /* ── Grid wrapper ──────────────────────────────────────── */
        .bp-grid-wrap {
          padding: clamp(16px, 2vw, 32px) clamp(16px, 3vw, 40px) 180px;
        }

        /* Product grid — 1px gap shows gold hairline between cards */
        .product-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: rgba(197,167,34,0.18);
          outline: 1px solid rgba(197,167,34,0.18);
          overflow: visible;
        }

        /* ── Loading skeleton ──────────────────────────────────── */
        .bp-skeleton {
          aspect-ratio: 0.82;
          background: linear-gradient(
            90deg,
            var(--iron) 25%,
            rgba(36,33,28,1) 50%,
            var(--iron) 75%
          );
          background-size: 800px 100%;
          animation: bp-shimmer 1.6s ease-in-out infinite;
        }
        @keyframes bp-shimmer {
          from { background-position: -800px 0; }
          to   { background-position:  800px 0; }
        }

        /* ── Empty state ───────────────────────────────────────── */
        .bp-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 420px;
          gap: 16px;
          padding: 40px;
        }
        .bp-empty-icon {
          width: 80px;
          height: 80px;
          color: var(--steel2);
          margin-bottom: 8px;
        }
        .bp-empty-head {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(28px, 4vw, 48px);
          font-weight: 400;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--fog);
          line-height: 1;
          margin: 0;
        }
        .bp-empty-sub {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          letter-spacing: var(--tracking-wider);
          color: var(--chrome);
          text-transform: uppercase;
          margin: 0;
        }
        .bp-empty-reset {
          margin-top: 8px;
          background: none;
          border: 1px solid var(--gold-rule);
          color: var(--gold-dim);
          font-family: var(--font-body), sans-serif;
          font-size: 13px;
          font-weight: 600;
          padding: 9px 24px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .bp-empty-reset:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        /* ── Pagination ────────────────────────────────────────── */
        .bp-pagination {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 56px;
        }
        .bp-pag-label {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          letter-spacing: var(--tracking-wider);
          color: var(--chrome);
          text-transform: uppercase;
        }
        .bp-pag-buttons {
          display: flex;
          gap: 2px;
          flex-wrap: wrap;
          justify-content: center;
        }

        /* ── Responsive ────────────────────────────────────────── */
        @media (max-width: 960px) {
          .product-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 640px) {
          .product-grid { grid-template-columns: repeat(2, 1fr); }
          .bp-header-context { font-size: clamp(24px, 8vw, 40px); }
          .bp-header-right { display: none; }
        }
      `}</style>
    </div>
  );
}

// ── Pagination button ─────────────────────────────────────────────────────────

function PagBtn({ onClick, disabled, active, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? "var(--gold)" : "var(--iron)",
        border: `1px solid ${active ? "var(--gold)" : "var(--steel)"}`,
        color: active ? "var(--coal)" : disabled ? "var(--fog)" : "var(--silver)",
        fontFamily: "var(--font-stencil), monospace",
        fontSize: "11px",
        letterSpacing: "0.5px",
        padding: "8px 14px",
        cursor: disabled ? "default" : "pointer",
        minWidth: 38,
        fontWeight: active ? 700 : 400,
        transition: "border-color 0.12s, color 0.12s",
      }}
    >
      {children}
    </button>
  );
}

// ── Export with Suspense ──────────────────────────────────────────────────────

export default function BrowsePage() {
  return (
    <Suspense fallback={
      <div style={{
        background: "var(--coal)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-stencil), monospace",
          fontSize: "10px",
          letterSpacing: "4px",
          color: "var(--chrome)",
          textTransform: "uppercase",
        }}>
          Loading Catalog…
        </span>
      </div>
    }>
      <BrowsePageInner />
    </Suspense>
  );
}
