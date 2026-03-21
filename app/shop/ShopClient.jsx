"use client";
// ============================================================
// app/shop/ShopClient.jsx
// ============================================================
// Filter/sort/paginate UI for the shop.
//
// Data flow:
//   1. SSR: initialProducts + initialFacets from page.jsx
//      (fast first paint, no loading flash)
//   2. Any filter/sort/page change → debounced fetch to
//      /api/products → update products + sidebar counts
//   3. Sidebar counts are accurate across ALL 146k products
//      not just the current page — powered by get_product_facets()
//
// Phase B: swap /api/products fetch for Typesense client.
//          Component interface stays identical.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { useCartSafe } from "@/components/CartContext";

const PAGE_SIZE   = 48;
const DEBOUNCE_MS = 350;

const SORT_OPTIONS = [
  { value:"newest",     label:"Newest"          },
  { value:"price_asc",  label:"Price: Low→High" },
  { value:"price_desc", label:"Price: High→Low" },
  { value:"name_asc",   label:"A → Z"           },
];

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --black:#0a0909; --coal:#111010; --iron:#1a1919; --steel:#2a2828;
    --chrome:#8a8784; --silver:#c4c0bc; --cream:#f0ebe3;
    --orange:#e8621a; --orange2:#c94f0f; --gold:#c9a84c;
    --red:#b91c1c; --green:#22c55e;
  }
  body { background:var(--black); color:var(--cream); font-family:'Barlow Condensed',sans-serif; }
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-thumb { background:var(--orange); }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer { from{background-position:-600px 0} to{background-position:600px 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }

  .ph:hover { background:rgba(255,255,255,0.03) !important; }
  .pcard { transition:all 0.22s !important; }
  .pcard:hover {
    border-color:rgba(232,98,26,0.45) !important;
    transform:translateY(-3px) !important;
    box-shadow:0 10px 36px rgba(0,0,0,0.5) !important;
  }
  .add-btn:hover:not(:disabled) { background:var(--orange2) !important; }

  .skel {
    background:linear-gradient(90deg,#1a1919 25%,#222121 50%,#1a1919 75%);
    background-size:600px 100%;
    animation:shimmer 1.4s infinite;
    border-radius:2px;
  }
  .grid-wrap { position:relative; }
  .grid-overlay {
    position:absolute; inset:0; z-index:10;
    background:rgba(10,9,9,0.5);
    display:flex; align-items:flex-start; justify-content:center;
    padding-top:80px; pointer-events:none;
  }
  .spinner {
    width:24px; height:24px; border-radius:50%;
    border:3px solid #2a2828; border-top-color:#e8621a;
    animation:spin 0.7s linear infinite;
  }
  .facet-count {
    font-family:'Share Tech Mono',monospace; font-size:8px; color:#8a8784;
    background:#1a1919; border:1px solid #2a2828;
    padding:1px 5px; border-radius:1px;
    min-width:32px; text-align:center; transition:color 0.2s;
  }
  .facet-count.dim { color:#3a3838; }
  .chip {
    font-family:'Share Tech Mono',monospace; font-size:8px;
    background:rgba(232,98,26,0.1); border:1px solid rgba(232,98,26,0.25);
    border-radius:2px; padding:2px 8px; color:#e8621a;
    letter-spacing:0.1em; cursor:pointer; user-select:none; transition:all 0.15s;
  }
  .chip:hover { background:rgba(232,98,26,0.18); }
  .price-input {
    background:#1a1919; border:1px solid #2a2828; color:#f0ebe3;
    font-family:'Barlow Condensed',sans-serif; font-size:13px;
    padding:6px 9px; border-radius:2px; outline:none; width:100%;
    transition:border-color 0.15s;
  }
  .price-input:focus { border-color:rgba(232,98,26,0.4); }
  .price-input::placeholder { color:#3a3838; }
  .page-btn {
    font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:0.08em;
    background:#111010; border:1px solid #2a2828; color:#8a8784;
    padding:7px 13px; border-radius:2px; cursor:pointer;
    transition:all 0.15s; min-width:36px; text-align:center;
  }
  .page-btn:hover:not(:disabled) { border-color:#e8621a; color:#e8621a; }
  .page-btn.active { background:#e8621a; border-color:#e8621a; color:#0a0909; }
  .page-btn:disabled { opacity:0.3; cursor:default; }

  @media (max-width:700px) {
    .shop-layout { grid-template-columns:1fr !important; }
    .shop-sidebar { display:none; }
  }
`;

const S = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });
const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });

function buildQS(filters, sort, page) {
  const p = new URLSearchParams();
  if (filters.category)          p.set("category",  filters.category);
  if (filters.brand)             p.set("brand",      filters.brand);
  if (filters.minPrice != null)  p.set("minPrice",   String(filters.minPrice));
  if (filters.maxPrice != null)  p.set("maxPrice",   String(filters.maxPrice));
  if (filters.inStock)           p.set("inStock",    "true");
  if (sort !== "newest")         p.set("sort",       sort);
  if (page > 0)                  p.set("page",       String(page));
  p.set("pageSize", String(PAGE_SIZE));
  return p.toString();
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)}
      style={{ width:32, height:18, borderRadius:9,
               background:on?"#e8621a":"#2a2828",
               position:"relative", cursor:"pointer",
               transition:"background 0.2s", flexShrink:0 }}>
      <div style={{ position:"absolute", top:2, left:on?14:2,
                    width:14, height:14, borderRadius:"50%",
                    background:"#f0ebe3", transition:"left 0.2s" }}/>
    </div>
  );
}

// ── FacetSection ──────────────────────────────────────────────
function FacetSection({ label, items, selected, loading, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const visible   = showAll ? items : items.slice(0, 10);
  const hasMore   = items.length > 10;

  return (
    <div>
      <div style={S({fontSize:9, color:"#e8621a", letterSpacing:"0.2em",
                     padding:"12px 14px 8px", display:"block"})}>
        {label}
      </div>
      <div style={{ padding:"0 10px 14px", borderBottom:"1px solid #1a1919" }}>
        {items.length === 0 && loading
          ? Array.from({length:5}).map((_,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between",
                                    padding:"5px 6px", marginBottom:2, gap:8 }}>
                <div className="skel" style={{ height:10, flex:1 }}/>
                <div className="skel" style={{ height:10, width:28 }}/>
              </div>
            ))
          : <>
              {visible.map(item => {
                const on = selected === item.name;
                return (
                  <div key={item.name} className="ph" onClick={() => onSelect(item.name)}
                    style={{ display:"flex", alignItems:"center",
                             justifyContent:"space-between",
                             padding:"5px 6px", borderRadius:2, cursor:"pointer",
                             background:on?"rgba(232,98,26,0.07)":"transparent",
                             transition:"background 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                      <div style={{ width:12, height:12, borderRadius:2, flexShrink:0,
                                    border:`1px solid ${on?"#e8621a":"#3a3838"}`,
                                    background:on?"#e8621a":"transparent",
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontSize:8, color:"#0a0909", transition:"all 0.15s" }}>
                        {on?"✓":""}
                      </div>
                      <span style={{ fontSize:12, fontWeight:500,
                                     color:on?"#f0ebe3":"#c4c0bc",
                                     whiteSpace:"nowrap", overflow:"hidden",
                                     textOverflow:"ellipsis" }}>
                        {item.name}
                      </span>
                    </div>
                    <span className={`facet-count ${loading?"dim":""}`}>
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(s => !s)}
                  style={{ ...S({fontSize:8, color:"#8a8784", letterSpacing:"0.1em"}),
                           background:"none", border:"none", cursor:"pointer",
                           marginTop:6, padding:"0 6px" }}>
                  {showAll ? "SHOW LESS ▴" : `+${items.length - 10} MORE ▾`}
                </button>
              )}
            </>
        }
      </div>
    </div>
  );
}

// ── ProductCard ───────────────────────────────────────────────
function ProductCard({ product:p, index, view, onAdd }) {
  return (
    <Link href={`/shop/${p.slug}`} className="pcard"
      style={{ background:"#111010", border:"1px solid #2a2828", borderRadius:2,
               overflow:"hidden", opacity:p.inStock?1:0.55,
               display:view==="list"?"grid":"block",
               gridTemplateColumns:view==="list"?"140px 1fr":"unset",
               animation:`fadeUp 0.3s ease ${Math.min(index,12)*0.03}s both`,
               textDecoration:"none", color:"inherit" }}>

      {/* Image */}
      <div style={{ width:"100%", aspectRatio:view==="list"?"unset":"4/3",
                    minHeight:view==="list"?110:0, background:"#1a1919",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0,
          backgroundImage:"linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px)," +
                          "linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px)",
          backgroundSize:"16px 16px" }}/>
        {p.image
          ? <img src={p.image} alt={p.name}
              style={{width:"100%",height:"100%",objectFit:"cover",position:"relative",zIndex:1}}/>
          : <span style={S({fontSize:8,color:"#3a3838",letterSpacing:"0.1em",
                            position:"relative",zIndex:1})}>NO IMAGE</span>
        }
        {p.badge && (
          <span style={{ position:"absolute", top:7, left:7, zIndex:2,
            ...S({fontSize:7,fontWeight:700,letterSpacing:"0.1em",padding:"2px 6px",borderRadius:1}),
            background:p.badge==="sale"?"#b91c1c":"#c9a84c",
            color:p.badge==="sale"?"#fff":"#0a0909" }}>
            {p.badge.toUpperCase()}
          </span>
        )}
        {!p.inStock && (
          <span style={{ position:"absolute", bottom:7, left:7, zIndex:2,
            ...S({fontSize:7,color:"#8a8784",letterSpacing:"0.1em",
              background:"rgba(0,0,0,0.7)",padding:"2px 6px",borderRadius:1}) }}>
            OUT OF STOCK
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding:"11px 13px",
        display:view==="list"?"flex":"block", alignItems:view==="list"?"center":undefined,
        gap:view==="list"?16:undefined, flex:view==="list"?1:undefined }}>
        <div style={{ flex:view==="list"?1:undefined }}>
          <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.14em",marginBottom:3})}>
            {p.brand}
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:"#f0ebe3",
                        lineHeight:1.3, marginBottom:view==="list"?0:9 }}>
            {p.name}
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                      flexDirection:view==="list"?"column":undefined,
                      gap:view==="list"?6:undefined,
                      alignSelf:view==="list"?"center":undefined }}>
          <div>
            {p.was && (
              <div style={{ fontSize:11, color:"#8a8784", textDecoration:"line-through",
                            fontFamily:"'Barlow Condensed',sans-serif" }}>
                ${p.was.toFixed(2)}
              </div>
            )}
            <div style={B({fontSize:20,color:"#f0ebe3",letterSpacing:"0.04em",lineHeight:1})}>
              ${p.price.toFixed(2)}
            </div>
          </div>
          <button className="add-btn" disabled={!p.inStock}
            onClick={e => { e.preventDefault(); e.stopPropagation(); if(p.inStock) onAdd(); }}
            style={{ background:p.inStock?"#e8621a":"#2a2828", border:"none",
                     color:p.inStock?"#0a0909":"#8a8784",
                     ...B({fontSize:13,letterSpacing:"0.1em",padding:"5px 12px",
                     borderRadius:2,cursor:p.inStock?"pointer":"not-allowed",
                     transition:"background 0.2s"}) }}>
            {p.inStock?"ADD":"OOS"}
          </button>
        </div>
      </div>
    </Link>
  );
}

function getPageRange(current, total) {
  const delta = 2;
  const start = Math.max(0, current - delta);
  const end   = Math.min(total - 1, current + delta);
  const out   = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

// ── Main component ────────────────────────────────────────────
export default function ShopClient({
  initialProducts = [],
  initialFacets   = { categories:[], brands:[], priceRange:{ min:0, max:0 } },
  initialTotal    = 0,
  initialCategory = null,
  initialBrand    = null,
}) {
  const [products, setProducts] = useState(initialProducts);
  const [facets,   setFacets]   = useState(initialFacets);
  const [total,    setTotal]    = useState(initialTotal);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const [filters, setFilters] = useState({
    category: initialCategory ?? null,
    brand:    initialBrand    ?? null,
    minPrice: null,
    maxPrice: null,
    inStock:  false,
  });
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [sort,     setSort]     = useState("newest");
  const [page,     setPage]     = useState(0);
  const [view,     setView]     = useState("grid");

  const { addItem } = useCartSafe();
  const isFirst  = useRef(true);
  const abortRef = useRef(null);

  const fetchProducts = useCallback(async (f, s, p) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/products?${buildQS(f, s, p)}`,
        { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      setFacets({
        categories: data.facets?.categories ?? [],
        brands:     data.facets?.brands     ?? [],
        priceRange: data.facets?.priceRange ?? { min:0, max:0 },
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[ShopClient]", err.message);
        setError("Failed to load products. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const t = setTimeout(() => fetchProducts(filters, sort, page), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters, sort, page, fetchProducts]);

  const setFilter = useCallback((key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(0);
  }, []);

  const applyPrice = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      minPrice: minInput ? Number(minInput) : null,
      maxPrice: maxInput ? Number(maxInput) : null,
    }));
    setPage(0);
  }, [minInput, maxInput]);

  const clearAll = useCallback(() => {
    setFilters({ category:null, brand:null, minPrice:null, maxPrice:null, inStock:false });
    setMinInput(""); setMaxInput("");
    setPage(0);
  }, []);

  const chips = [
    filters.category               && { key:"category", label:filters.category },
    filters.brand                  && { key:"brand",    label:filters.brand    },
    filters.minPrice != null       && { key:"minPrice", label:`$${filters.minPrice}+` },
    filters.maxPrice != null       && { key:"maxPrice", label:`≤$${filters.maxPrice}` },
    filters.inStock                && { key:"inStock",  label:"In Stock"        },
  ].filter(Boolean);

  const removeChip = key => {
    if (key === "minPrice" || key === "maxPrice") {
      setFilters(p => ({ ...p, minPrice:null, maxPrice:null }));
      setMinInput(""); setMaxInput("");
    } else if (key === "inStock") {
      setFilter("inStock", false);
    } else {
      setFilter(key, null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ background:"#0a0909", minHeight:"100vh", color:"#f0ebe3",
                  fontFamily:"'Barlow Condensed',sans-serif" }}>
      <style>{css}</style>
      <NavBar activePage="shop"/>

      {/* ── TOOLBAR ── */}
      <div style={{ background:"#111010", borderBottom:"1px solid #2a2828",
                    padding:"8px 20px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={S({fontSize:10, color:"#8a8784", letterSpacing:"0.1em"})}>
            {loading
              ? <span style={{color:"#3a3838"}}>LOADING…</span>
              : <><span style={{color:"#e8621a"}}>{total.toLocaleString()}</span>{" RESULTS"}</>
            }
          </span>
          {chips.map(f => (
            <span key={f.key} className="chip" onClick={() => removeChip(f.key)}>
              {f.label} ×
            </span>
          ))}
          {chips.length > 0 && (
            <button onClick={clearAll}
              style={{ ...S({fontSize:8,letterSpacing:"0.1em",color:"#8a8784"}),
                       background:"none",border:"none",cursor:"pointer" }}>
              CLEAR ALL
            </button>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <select value={sort}
            onChange={e => { setSort(e.target.value); setPage(0); }}
            style={{ background:"#1a1919", border:"1px solid #2a2828", color:"#f0ebe3",
                     fontFamily:"'Barlow Condensed',sans-serif", fontSize:13,
                     padding:"5px 9px", borderRadius:2, outline:"none" }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {["grid","list"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background:view===v?"rgba(232,98,26,0.12)":"#1a1919",
                       border:`1px solid ${view===v?"rgba(232,98,26,0.4)":"#2a2828"}`,
                       color:view===v?"#e8621a":"#8a8784",
                       padding:"5px 9px", borderRadius:2, cursor:"pointer",
                       fontSize:13, transition:"all 0.15s" }}>
              {v==="grid"?"⊞":"☰"}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="shop-layout"
        style={{ display:"grid", gridTemplateColumns:"215px 1fr" }}>

        {/* ── SIDEBAR ── */}
        <aside className="shop-sidebar"
          style={{ background:"#111010", borderRight:"1px solid #2a2828",
                   overflowY:"auto", maxHeight:"calc(100vh - 100px)",
                   position:"sticky", top:54, alignSelf:"start" }}>

          <FacetSection label="CATEGORY" items={facets.categories}
            selected={filters.category} loading={loading}
            onSelect={val => setFilter("category", filters.category===val ? null : val)}/>

          <FacetSection label="BRAND" items={facets.brands}
            selected={filters.brand} loading={loading}
            onSelect={val => setFilter("brand", filters.brand===val ? null : val)}/>

          {/* Price */}
          <div>
            <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.2em",
                           padding:"12px 14px 8px",display:"block"})}>PRICE RANGE</div>
            <div style={{ padding:"0 12px 16px", borderBottom:"1px solid #1a1919" }}>
              {facets.priceRange?.max > 0 && (
                <div style={S({fontSize:8,color:"#8a8784",letterSpacing:"0.08em",marginBottom:8})}>
                  ${Math.floor(facets.priceRange.min).toLocaleString()} –{" "}
                  ${Math.ceil(facets.priceRange.max).toLocaleString()}
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                <input className="price-input" placeholder="Min $" type="number"
                  value={minInput} onChange={e => setMinInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && applyPrice()}/>
                <input className="price-input" placeholder="Max $" type="number"
                  value={maxInput} onChange={e => setMaxInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && applyPrice()}/>
              </div>
              <button onClick={applyPrice}
                style={{ width:"100%", background:"#e8621a", border:"none", color:"#0a0909",
                         ...B({fontSize:14,letterSpacing:"0.08em",padding:"7px",
                         borderRadius:2,cursor:"pointer"}) }}>APPLY</button>
            </div>
          </div>

          {/* Availability */}
          <div>
            <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.2em",
                           padding:"12px 14px 8px",display:"block"})}>AVAILABILITY</div>
            <div style={{ padding:"4px 14px 16px", display:"flex",
                          alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:13, fontWeight:500, color:"#c4c0bc" }}>In Stock Only</span>
              <Toggle on={filters.inStock} onChange={val => setFilter("inStock", val)}/>
            </div>
          </div>
        </aside>

        {/* ── GRID ── */}
        <div style={{ padding:"18px 20px" }}>
          <div className="grid-wrap">
            {loading && (
              <div className="grid-overlay">
                <div className="spinner"/>
              </div>
            )}

            {error && (
              <div style={{ padding:20, background:"rgba(185,28,28,0.08)",
                            border:"1px solid rgba(185,28,28,0.2)", borderRadius:2,
                            marginBottom:16, ...S({fontSize:10,color:"#ef4444",
                            letterSpacing:"0.1em"}) }}>
                {error}
              </div>
            )}

            {products.length === 0 && !loading ? (
              <div style={{ padding:"80px 20px", textAlign:"center" }}>
                <div style={B({fontSize:30,letterSpacing:"0.05em",color:"#3a3838",marginBottom:8})}>
                  NO PARTS FOUND
                </div>
                <div style={S({fontSize:9,color:"#8a8784",letterSpacing:"0.15em"})}>
                  TRY ADJUSTING YOUR FILTERS
                </div>
                {chips.length > 0 && (
                  <button onClick={clearAll}
                    style={{ marginTop:20, background:"#e8621a", border:"none", color:"#0a0909",
                             ...B({fontSize:15,letterSpacing:"0.1em",padding:"9px 22px",
                             borderRadius:2,cursor:"pointer"}) }}>
                    CLEAR FILTERS
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display:"grid",
                gridTemplateColumns:view==="list"?"1fr":"repeat(auto-fill,minmax(200px,1fr))",
                gap:12, opacity:loading?0.5:1, transition:"opacity 0.2s" }}>
                {products.map((p,i) => (
                  <ProductCard key={p.id} product={p} index={i} view={view}
                    onAdd={() => addItem(p)}/>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:"flex", alignItems:"center",
                          justifyContent:"space-between", padding:"28px 0",
                          marginTop:8, borderTop:"1px solid #2a2828",
                          flexWrap:"wrap", gap:12 }}>
              <span style={S({fontSize:9,color:"#8a8784",letterSpacing:"0.12em"})}>
                SHOWING{" "}
                <span style={{color:"#f0ebe3"}}>
                  {(page*PAGE_SIZE+1).toLocaleString()}–
                  {Math.min((page+1)*PAGE_SIZE,total).toLocaleString()}
                </span>
                {" "}OF{" "}
                <span style={{color:"#e8621a"}}>{total.toLocaleString()}</span>
                {" "}PRODUCTS
              </span>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <button className="page-btn nav" disabled={page===0}
                  onClick={() => setPage(p => p-1)}>
                  ← PREV
                </button>
                {getPageRange(page, totalPages).map(pg => (
                  <button key={pg} className={`page-btn ${pg===page?"active":""}`}
                    onClick={() => setPage(pg)}>
                    {pg+1}
                  </button>
                ))}
                <button className="page-btn nav" disabled={page>=totalPages-1}
                  onClick={() => setPage(p => p+1)}>
                  NEXT →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}