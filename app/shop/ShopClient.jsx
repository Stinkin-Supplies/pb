"use client";
// ============================================================
// app/shop/ShopClient.jsx
// ============================================================
// Filter/sort/paginate UI for the shop.
//
// Data flow:
//   1. SSR: initialProducts + initialFacets from page.jsx (fast first paint)
//   2. Any filter/sort/page change → debounced fetch to /api/search
//   3. Sidebar counts accurate across all 130K+ unified products
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import NavBar from "@/components/NavBar";
import { useCartSafe } from "@/components/CartContext";
import { getProductImage } from "@/lib/getProductImage";

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
  body { background:var(--black); color:var(--cream); font-family:var(--font-stencil),sans-serif; }
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-thumb { background:var(--orange); }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shimmer { from{background-position:-600px 0} to{background-position:600px 0} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  .ph:hover { background:rgba(255,255,255,0.03) !important; }
  .pcard { transition:all 0.22s !important; }
  .pcard:hover { border-color:rgba(232,98,26,0.45) !important; transform:translateY(-3px) !important; box-shadow:0 10px 36px rgba(0,0,0,0.5) !important; }
  .add-btn:hover:not(:disabled) { background:var(--orange2) !important; }
  .skel { background:linear-gradient(90deg,#1a1919 25%,#222121 50%,#1a1919 75%); background-size:600px 100%; animation:shimmer 1.4s infinite; border-radius:2px; }
  .grid-wrap { position:relative; }
  .grid-overlay { position:absolute; inset:0; z-index:10; background:rgba(10,9,9,0.5); display:flex; align-items:flex-start; justify-content:center; padding-top:80px; pointer-events:none; }
  .spinner { width:24px; height:24px; border-radius:50%; border:3px solid #2a2828; border-top-color:#e8621a; animation:spin 0.7s linear infinite; }
  .facet-count { font-family:var(--font-stencil),monospace; font-size:8px; color:#8a8784; background:#1a1919; border:1px solid #2a2828; padding:1px 5px; border-radius:1px; min-width:32px; text-align:center; transition:color 0.2s; }
  .facet-count.dim { color:#3a3838; }
  .chip { font-family:var(--font-stencil),monospace; font-size:8px; background:rgba(232,98,26,0.1); border:1px solid rgba(232,98,26,0.25); border-radius:2px; padding:2px 8px; color:#e8621a; letter-spacing:0.1em; cursor:pointer; user-select:none; transition:all 0.15s; }
  .chip:hover { background:rgba(232,98,26,0.18); }
  .price-input { background:#1a1919; border:1px solid #2a2828; color:#f0ebe3; font-family:var(--font-stencil),sans-serif; font-size:13px; padding:6px 9px; border-radius:2px; outline:none; width:100%; transition:border-color 0.15s; }
  .price-input:focus { border-color:rgba(232,98,26,0.4); }
  .price-input::placeholder { color:#3a3838; }
  .page-btn { font-family:var(--font-stencil),monospace; font-size:10px; letter-spacing:0.08em; background:#111010; border:1px solid #2a2828; color:#8a8784; padding:7px 13px; border-radius:2px; cursor:pointer; transition:all 0.15s; min-width:36px; text-align:center; }
  .page-btn:hover:not(:disabled) { border-color:#e8621a; color:#e8621a; }
  .page-btn.active { background:#e8621a; border-color:#e8621a; color:#0a0909; }
  .page-btn:disabled { opacity:0.3; cursor:default; }
  .shop-layout { display:grid; grid-template-columns:215px 1fr; }
  .mobile-filter-btn-wrap { display:none; }
  .mobile-filter-btn { font-family:var(--font-stencil),monospace; font-size:11px; letter-spacing:0.15em; text-transform:uppercase; background:#1a1919; color:#f0ebe3; border:1px solid #2a2828; padding:10px 20px; cursor:pointer; display:flex; align-items:center; gap:8px; width:100%; }
  .filter-badge { background:#e8621a; color:#fff; font-size:9px; padding:2px 6px; border-radius:10px; }
  .filter-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:200; }
  .filter-close-wrap { display:none; padding:12px 14px; border-bottom:1px solid #2a2828; }
  .filter-close-btn { font-family:var(--font-stencil),monospace; font-size:10px; letter-spacing:0.15em; background:transparent; color:#8a8784; border:none; cursor:pointer; text-transform:uppercase; }
  .product-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .pcard-body { padding:8px; }
  .type-filter-row { display:flex; align-items:center; justify-content:space-between; padding:6px 0; cursor:pointer; }
  .type-filter-row:hover .type-filter-label { color:#f0ebe3; }
  .type-filter-label { font-size:13px; font-weight:500; color:#c4c0bc; transition:color 0.15s; }
  @media (min-width:640px) { .pcard-body { padding:16px; } }
  @media (min-width:768px) { .product-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media (min-width:1024px) { .product-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
  @media (max-width:700px) {
    .mobile-filter-btn-wrap { display:block; }
    .shop-sidebar { position:fixed !important; top:0 !important; left:-280px; width:280px; max-height:100vh !important; height:100vh; z-index:201; transition:left 0.25s ease; overflow-y:auto; }
    .shop-sidebar.filter-open { left:0; }
    .filter-close-wrap { display:block; }
    .shop-layout { grid-template-columns:1fr !important; }
    .shop-sidebar:not(.filter-open) { display:block; position:fixed; left:-280px; }
    .product-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
    .pcard-body { padding:8px !important; }
    .pcard img { aspect-ratio:1/1; }
  }
`;

const S = s => ({ fontFamily:"var(--font-stencil),monospace", ...s });
const B = s => ({ fontFamily:"var(--font-caesar),sans-serif",  ...s });

function buildQS(filters, sort, page) {
  const p = new URLSearchParams();
  if (filters.category)          p.set("category",  filters.category);
  if (filters.brand)             p.set("brand",      filters.brand);
  if (filters.minPrice != null)  p.set("min_price",  String(filters.minPrice));
  if (filters.maxPrice != null)  p.set("max_price",  String(filters.maxPrice));
  if (filters.inStock)           p.set("in_stock",   "true");
  if (filters.harley)            p.set("harley",     "true");
  if (filters.drag)              p.set("drag",       "true");
  if (filters.oldbook)           p.set("oldbook",    "true");
  if (sort !== "newest")         p.set("sort",       sort);
  if (page > 0)                  p.set("page",       String(page));
  p.set("pageSize", String(PAGE_SIZE));
  return p.toString();
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)}
      style={{ width:32, height:18, borderRadius:9, background:on?"#e8621a":"#2a2828",
               position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
      <div style={{ position:"absolute", top:2, left:on?14:2, width:14, height:14,
                    borderRadius:"50%", background:"#f0ebe3", transition:"left 0.2s" }}/>
    </div>
  );
}

function FacetSection({ label, items, selected, loading, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 10);
  const hasMore = items.length > 10;
  return (
    <div>
      <div style={S({fontSize:9, color:"#e8621a", letterSpacing:"0.2em", padding:"12px 14px 8px", display:"block"})}>
        {label}
      </div>
      <div style={{ padding:"0 10px 14px", borderBottom:"1px solid #1a1919" }}>
        {items.length === 0 && loading
          ? Array.from({length:5}).map((_,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 6px", marginBottom:2, gap:8 }}>
                <div className="skel" style={{ height:10, flex:1 }}/>
                <div className="skel" style={{ height:10, width:28 }}/>
              </div>
            ))
          : <>
              {visible.map(item => {
                const on = selected === item.name;
                return (
                  <div key={item.name} className="ph" onClick={() => onSelect(item.name)}
                    style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                             padding:"5px 6px", borderRadius:2, cursor:"pointer",
                             background:on?"rgba(232,98,26,0.07)":"transparent", transition:"background 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                      <div style={{ width:12, height:12, borderRadius:2, flexShrink:0,
                                    border:`1px solid ${on?"#e8621a":"#3a3838"}`,
                                    background:on?"#e8621a":"transparent",
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontSize:8, color:"#0a0909", transition:"all 0.15s" }}>
                        {on?"✓":""}
                      </div>
                      <span style={{ fontSize:12, fontWeight:500, color:on?"#f0ebe3":"#c4c0bc",
                                     whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {item.name}
                      </span>
                    </div>
                    <span className={`facet-count ${loading?"dim":""}`}>{item.count.toLocaleString()}</span>
                  </div>
                );
              })}
              {hasMore && (
                <button onClick={() => setShowAll(s => !s)}
                  style={{ ...S({fontSize:8, color:"#8a8784", letterSpacing:"0.1em"}),
                           background:"none", border:"none", cursor:"pointer", marginTop:6, padding:"0 6px" }}>
                  {showAll ? "SHOW LESS ▴" : `+${items.length - 10} MORE ▾`}
                </button>
              )}
            </>
        }
      </div>
    </div>
  );
}

function GridNotifyButton({ sku, productName, vendor }) {
  const [state, setState] = React.useState("idle");
  const handleClick = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state !== "idle" && state !== "error") return;
    setState("loading");
    try {
      const res = await fetch("/api/notifications/restock", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ product_sku:sku, product_name:productName, vendor, source:"pdp" }),
      });
      if (res.status === 401) { window.location.href = "/auth"; return; }
      setState("done");
    } catch { setState("error"); }
  };
  const cfg = {
    idle:    { label:"🔔 NOTIFY ME",  color:"#e8621a", bg:"transparent",          border:"#e8621a" },
    loading: { label:"...",            color:"#8a8784", bg:"transparent",          border:"#3a3838" },
    done:    { label:"✓ ON THE LIST", color:"#22c55e", bg:"rgba(34,197,94,0.08)", border:"#22c55e" },
    error:   { label:"RETRY",         color:"#ef4444", bg:"transparent",          border:"#ef4444" },
  }[state];
  return (
    <button onClick={handleClick} disabled={state==="loading"||state==="done"}
      style={{ width:"100%", padding:"5px 8px", background:cfg.bg, border:`1px solid ${cfg.border}`,
               color:cfg.color, borderRadius:2, cursor:state==="done"?"default":"pointer",
               fontFamily:"var(--font-stencil),monospace", fontSize:8, letterSpacing:"0.1em", transition:"all 0.15s" }}>
      {cfg.label}
    </button>
  );
}

function ProductCard({ product:p, index, view, onAdd }) {
  const imageSrc = getProductImage(p);
  const proxied  = typeof imageSrc === "string" && imageSrc.startsWith("http")
    ? `/api/image-proxy?url=${encodeURIComponent(imageSrc)}` : imageSrc;
  return (
    <Link href={`/shop/${p.slug}`} className="pcard"
      style={{ background:"#111010", border:"1px solid #2a2828", borderRadius:2, overflow:"hidden",
               opacity:p.inStock?1:0.55, display:view==="list"?"grid":"block",
               gridTemplateColumns:view==="list"?"140px 1fr":"unset",
               animation:`fadeUp 0.3s ease ${Math.min(index,12)*0.03}s both`,
               textDecoration:"none", color:"inherit" }}>
      <div style={{ width:"100%", aspectRatio:view==="list"?"unset":"1/1", minHeight:view==="list"?110:0,
                    background:"#ffffff", display:"flex", alignItems:"center", justifyContent:"center",
                    position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0,
          backgroundImage:"linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px)",
          backgroundSize:"16px 16px" }}/>
        <Image src={proxied} alt={p.name} fill
          sizes="(max-width:768px) 50vw, 25vw"
          style={{ objectFit:"contain", padding:"10px", zIndex:1 }}
          priority={index<6} unoptimized/>
        {p.badge && (
          <span style={{ position:"absolute", top:7, left:7, zIndex:2,
            ...S({fontSize:7,fontWeight:700,letterSpacing:"0.1em",padding:"2px 6px",borderRadius:1}),
            background:p.badge==="sale"?"#b91c1c":"#c9a84c", color:p.badge==="sale"?"#fff":"#0a0909" }}>
            {p.badge.toUpperCase()}
          </span>
        )}
        {!p.inStock && (
          <span style={{ position:"absolute", bottom:7, left:7, zIndex:2,
            ...S({fontSize:7,color:"#8a8784",letterSpacing:"0.1em",background:"rgba(0,0,0,0.7)",padding:"2px 6px",borderRadius:1}) }}>
            OUT OF STOCK
          </span>
        )}
        {p.isHarleyFitment && (
          <span style={{ position:"absolute", top:7, right:7, zIndex:2,
            ...S({fontSize:7,letterSpacing:"0.08em",padding:"2px 5px",borderRadius:1}),
            background:"rgba(201,168,76,0.15)", border:"1px solid rgba(201,168,76,0.3)", color:"#c9a84c" }}>
            H-D
          </span>
        )}
      </div>
      <div className="pcard-body"
        style={{ display:view==="list"?"flex":"block", alignItems:view==="list"?"center":undefined,
                 gap:view==="list"?16:undefined, flex:view==="list"?1:undefined }}>
        <div style={{ flex:view==="list"?1:undefined }}>
          <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.14em",marginBottom:3})}>{p.brand}</div>
          <div style={{ fontSize:13, fontWeight:700, color:"#f0ebe3", lineHeight:1.3, marginBottom:view==="list"?0:6 }}>
            {p.name}
          </div>
          {/* Multi-brand badge — shows when group has more than one brand option */}
          {(p.brandCount > 1 || (p.availableBrands && p.availableBrands.length > 1)) && (
            <div style={S({fontSize:7,color:"#8a8784",letterSpacing:"0.1em",marginTop:3,marginBottom:2})}>
              {p.brandCount ?? p.availableBrands?.length} BRANDS AVAILABLE
            </div>
          )}
          {p.fitmentYearStart && (
            <div style={S({fontSize:8,color:"#8a8784",letterSpacing:"0.08em",marginTop:2})}>
              {p.fitmentYearStart}–{p.fitmentYearEnd}
            </div>
          )}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                      flexDirection:view==="list"?"column":undefined, gap:view==="list"?6:undefined,
                      alignSelf:view==="list"?"center":undefined, marginTop: view==="list"?0:8 }}>
          <div>
            {p.was && (
              <div style={{ fontSize:11, color:"#8a8784", textDecoration:"line-through",
                            fontFamily:"var(--font-stencil),sans-serif" }}>
                ${(Number(p.was)||0).toFixed(2)}
              </div>
            )}
            <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
              {/* Show "from $X.XX" when group has multiple price points */}
              {p.priceMax && p.priceMin && p.priceMax > p.priceMin && (
                <span style={S({fontSize:9,color:"#8a8784",letterSpacing:"0.06em"})}>from</span>
              )}
              <span style={B({fontSize:20,color:"#f0ebe3",letterSpacing:"0.04em",lineHeight:1})}>
                ${(Number(p.price)||0).toFixed(2)}
              </span>
            </div>
          </div>
          {p.inStock ? (
            <button className="add-btn"
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(); }}
              style={{ background:"#e8621a", border:"none", color:"#0a0909",
                       ...B({fontSize:13,letterSpacing:"0.1em",padding:"5px 12px",borderRadius:2,cursor:"pointer",transition:"background 0.2s"}) }}>
              {p.brandCount > 1 ? "OPTIONS" : "ADD"}
            </button>
          ) : (
            <GridNotifyButton sku={p.sku ?? p.slug} productName={p.name} vendor={p.vendor??"wps"}/>
          )}
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

// ── Main ──────────────────────────────────────────────────────
export default function ShopClient({
  initialProducts = [],
  initialFacets   = { categories:[], brands:[], priceRange:{min:0,max:0} },
  initialTotal    = 0,
  initialCategory = null,
  initialBrand    = null,
}) {
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search) : new URLSearchParams();

  const urlCategory = searchParams.get("category");
  const urlBrand    = searchParams.get("brand");
  const urlMinPrice = searchParams.get("min_price") || searchParams.get("minPrice");
  const urlMaxPrice = searchParams.get("max_price") || searchParams.get("maxPrice");
  const urlInStock  = searchParams.get("in_stock") === "true" || searchParams.get("inStock") === "true";
  const urlSort     = searchParams.get("sort") ?? "newest";
  const urlPage     = parseInt(searchParams.get("page") ?? "0", 10);

  const [products,    setProducts]    = useState(initialProducts);
  const [facets,      setFacets]      = useState(initialFacets);
  const [total,       setTotal]       = useState(initialTotal);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [filters,     setFiltersState]= useState({
    category: urlCategory ?? initialCategory ?? null,
    brand:    urlBrand    ?? initialBrand    ?? null,
    minPrice: urlMinPrice ? Number(urlMinPrice) : null,
    maxPrice: urlMaxPrice ? Number(urlMaxPrice) : null,
    inStock:  urlInStock,
    harley:   false,
    drag:     false,
    oldbook:  false,
  });
  const [minInput,    setMinInput]    = useState(urlMinPrice ?? "");
  const [maxInput,    setMaxInput]    = useState(urlMaxPrice ?? "");
  const [sort,        setSort]        = useState(urlSort);
  const [page,        setPage]        = useState(isNaN(urlPage) ? 0 : urlPage);
  const [view,        setView]        = useState("grid");
  const [filterOpen,  setFilterOpen]  = useState(false);

  const { addItem } = useCartSafe();
  const router   = useRouter();
  const pathname = usePathname();
  const isFirst  = useRef(true);
  const abortRef = useRef(null);

  // Persist to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.category)         params.set("category",  filters.category);
    if (filters.brand)            params.set("brand",     filters.brand);
    if (filters.minPrice != null) params.set("min_price", String(filters.minPrice));
    if (filters.maxPrice != null) params.set("max_price", String(filters.maxPrice));
    if (filters.inStock)          params.set("in_stock",  "true");
    if (filters.harley)           params.set("harley",    "true");
    if (filters.drag)             params.set("drag",      "true");
    if (filters.oldbook)          params.set("oldbook",   "true");
    if (sort !== "newest")        params.set("sort",      sort);
    if (page > 0)                 params.set("page",      String(page));
    router.replace(`${pathname}${params.toString() ? `?${params}` : ""}`, { scroll:false });
    window.scrollTo({ top:0, behavior:"smooth" });
  }, [filters, sort, page, pathname, router]);

  const fetchProducts = useCallback(async (f, s, p) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/search?${buildQS(f, s, p)}`, { signal:abortRef.current.signal });
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
      if (err.name !== "AbortError") { console.error("[ShopClient]", err.message); setError("Failed to load products."); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      if (initialProducts.length > 0 && initialFacets.categories.length > 0) return;
    }
    const t = setTimeout(() => fetchProducts(filters, sort, page), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters, sort, page, fetchProducts]);

  const setFilter = useCallback((key, val) => {
    setFiltersState(prev => ({ ...prev, [key]:val }));
    window.scrollTo({ top:0, behavior:"smooth" });
    setPage(0);
  }, []);

  const applyPrice = useCallback(() => {
    setFiltersState(prev => ({
      ...prev,
      minPrice: minInput ? Number(minInput) : null,
      maxPrice: maxInput ? Number(maxInput) : null,
    }));
    setPage(0);
  }, [minInput, maxInput]);

  const clearAll = useCallback(() => {
    setFiltersState({ category:null, brand:null, minPrice:null, maxPrice:null, inStock:false, harley:false, drag:false, oldbook:false });
    setMinInput(""); setMaxInput(""); setPage(0);
  }, []);

  const chips = [
    filters.category         && { key:"category", label:filters.category },
    filters.brand            && { key:"brand",    label:filters.brand    },
    filters.minPrice != null && { key:"minPrice", label:`$${filters.minPrice}+` },
    filters.maxPrice != null && { key:"maxPrice", label:`≤$${filters.maxPrice}` },
    filters.inStock          && { key:"inStock",  label:"In Stock"        },
    filters.harley           && { key:"harley",   label:"Harley-Davidson" },
    filters.drag             && { key:"drag",     label:"Drag Specialties"},
    filters.oldbook          && { key:"oldbook",  label:"H-D Catalog"    },
  ].filter(Boolean);

  const removeChip = key => {
    if (key === "minPrice" || key === "maxPrice") {
      setFiltersState(p => ({ ...p, minPrice:null, maxPrice:null }));
      setMinInput(""); setMaxInput("");
    } else if (key === "inStock") { setFilter("inStock", false);
    } else if (key === "harley")  { setFilter("harley",  false);
    } else if (key === "drag")    { setFilter("drag",    false);
    } else if (key === "oldbook") { setFilter("oldbook", false);
    } else { setFilter(key, null); }
  };

  const totalPages       = Math.ceil(total / PAGE_SIZE);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div style={{ background:"#0a0909", minHeight:"100vh", color:"#f0ebe3", fontFamily:"var(--font-stencil),sans-serif" }}>
      <style>{css}</style>
      <NavBar activePage="shop"/>

      {/* TOOLBAR */}
      <div style={{ background:"#111010", borderBottom:"1px solid #2a2828", padding:"8px 20px",
                    display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={S({fontSize:10, color:"#8a8784", letterSpacing:"0.1em"})}>
            {loading
              ? <span style={{color:"#3a3838"}}>LOADING…</span>
              : <><span style={{color:"#e8621a"}}>{total.toLocaleString()}</span>{" RESULTS"}</>
            }
          </span>
          {chips.map(f => (
            <span key={f.key} className="chip" onClick={() => removeChip(f.key)}>{f.label} ×</span>
          ))}
          {chips.length > 0 && (
            <button onClick={clearAll}
              style={{ ...S({fontSize:8,letterSpacing:"0.1em",color:"#8a8784"}), background:"none", border:"none", cursor:"pointer" }}>
              CLEAR ALL
            </button>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}
            style={{ background:"#1a1919", border:"1px solid #2a2828", color:"#f0ebe3",
                     fontFamily:"var(--font-stencil),sans-serif", fontSize:13, padding:"5px 9px", borderRadius:2, outline:"none" }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {["grid","list"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background:view===v?"rgba(232,98,26,0.12)":"#1a1919",
                       border:`1px solid ${view===v?"rgba(232,98,26,0.4)":"#2a2828"}`,
                       color:view===v?"#e8621a":"#8a8784",
                       padding:"5px 9px", borderRadius:2, cursor:"pointer", fontSize:13, transition:"all 0.15s" }}>
              {v==="grid"?"⊞":"☰"}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile filter button */}
      <div className="mobile-filter-btn-wrap">
        <button className="mobile-filter-btn" onClick={() => setFilterOpen(v => !v)}>
          ☰ FILTERS {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
        </button>
      </div>

      {/* BODY */}
      <div className="shop-layout">
        {filterOpen && <div className="filter-overlay" onClick={() => setFilterOpen(false)}/>}

        {/* SIDEBAR */}
        <aside className={`shop-sidebar ${filterOpen?"filter-open":""}`}
          style={{ background:"#111010", borderRight:"1px solid #2a2828", overflowY:"auto",
                   maxHeight:"calc(100vh - 100px)", position:"sticky", top:54, alignSelf:"start" }}>
          <div className="filter-close-wrap">
            <button className="filter-close-btn" onClick={() => setFilterOpen(false)}>✕ CLOSE</button>
          </div>

          {/* Shop by type */}
          <div>
            <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.2em",padding:"12px 14px 8px",display:"block"})}>
              SHOP BY TYPE
            </div>
            <div style={{ padding:"4px 14px 16px", borderBottom:"1px solid #1a1919" }}>
              {[
                { key:"harley",  label:"Harley-Davidson",  icon:"🦅" },
                { key:"drag",    label:"Drag Specialties",  icon:"🏍" },
                { key:"oldbook", label:"H-D Catalog",       icon:"📖" },
              ].map(({ key, label, icon }) => (
                <div key={key} className="type-filter-row" onClick={() => { setFilter(key, !filters[key]); setFilterOpen(false); }}>
                  <span className="type-filter-label">{icon} {label}</span>
                  <Toggle on={!!filters[key]} onChange={val => { setFilter(key, val); setFilterOpen(false); }}/>
                </div>
              ))}
            </div>
          </div>

          <FacetSection label="CATEGORY" items={facets.categories} selected={filters.category} loading={loading}
            onSelect={val => { setFilter("category", filters.category===val?null:val); setFilterOpen(false); }}/>

          <FacetSection label="BRAND" items={facets.brands} selected={filters.brand} loading={loading}
            onSelect={val => { setFilter("brand", filters.brand===val?null:val); setFilterOpen(false); }}/>

          {/* Price */}
          <div>
            <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.2em",padding:"12px 14px 8px",display:"block"})}>
              PRICE RANGE
            </div>
            <div style={{ padding:"0 12px 16px", borderBottom:"1px solid #1a1919" }}>
              {facets.priceRange?.max > 0 && (
                <div style={S({fontSize:8,color:"#8a8784",letterSpacing:"0.08em",marginBottom:8})}>
                  ${Math.floor(facets.priceRange.min).toLocaleString()} – ${Math.ceil(facets.priceRange.max).toLocaleString()}
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                <input className="price-input" placeholder="Min $" type="number" value={minInput}
                  onChange={e => setMinInput(e.target.value)}
                  onKeyDown={e => { if (e.key==="Enter") { applyPrice(); setFilterOpen(false); } }}/>
                <input className="price-input" placeholder="Max $" type="number" value={maxInput}
                  onChange={e => setMaxInput(e.target.value)}
                  onKeyDown={e => { if (e.key==="Enter") { applyPrice(); setFilterOpen(false); } }}/>
              </div>
              <button onClick={() => { applyPrice(); setFilterOpen(false); }}
                style={{ width:"100%", background:"#e8621a", border:"none", color:"#0a0909",
                         ...B({fontSize:14,letterSpacing:"0.08em",padding:"7px",borderRadius:2,cursor:"pointer"}) }}>
                APPLY
              </button>
            </div>
          </div>

          {/* Availability */}
          <div>
            <div style={S({fontSize:9,color:"#e8621a",letterSpacing:"0.2em",padding:"12px 14px 8px",display:"block"})}>
              AVAILABILITY
            </div>
            <div style={{ padding:"4px 14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:13, fontWeight:500, color:"#c4c0bc" }}>In Stock Only</span>
              <Toggle on={filters.inStock} onChange={val => setFilter("inStock", val)}/>
            </div>
          </div>
        </aside>

        {/* GRID */}
        <div style={{ padding:"18px 20px" }}>
          <div className="grid-wrap">
            {loading && <div className="grid-overlay"><div className="spinner"/></div>}
            {error && (
              <div style={{ padding:20, background:"rgba(185,28,28,0.08)", border:"1px solid rgba(185,28,28,0.2)",
                            borderRadius:2, marginBottom:16, ...S({fontSize:10,color:"#ef4444",letterSpacing:"0.1em"}) }}>
                {error}
              </div>
            )}
            {products.length === 0 && !loading ? (
              <div style={{ padding:"80px 20px", textAlign:"center" }}>
                <div style={B({fontSize:30,letterSpacing:"0.05em",color:"#3a3838",marginBottom:8})}>NO PARTS FOUND</div>
                <div style={S({fontSize:9,color:"#8a8784",letterSpacing:"0.15em"})}>TRY ADJUSTING YOUR FILTERS</div>
                {chips.length > 0 && (
                  <button onClick={clearAll}
                    style={{ marginTop:20, background:"#e8621a", border:"none", color:"#0a0909",
                             ...B({fontSize:15,letterSpacing:"0.1em",padding:"9px 22px",borderRadius:2,cursor:"pointer"}) }}>
                    CLEAR FILTERS
                  </button>
                )}
              </div>
            ) : (
              <div className="product-grid"
                style={{ opacity:loading?0.5:1, transition:"opacity 0.2s" }}>
                {products.map((p,i) => (
                  <ProductCard key={p.id ?? p.sku} product={p} index={i} view={view} onAdd={() => addItem(p)}/>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"28px 0", marginTop:8, borderTop:"1px solid #2a2828", flexWrap:"wrap", gap:12 }}>
              <span style={S({fontSize:9,color:"#8a8784",letterSpacing:"0.12em"})}>
                SHOWING{" "}
                <span style={{color:"#f0ebe3"}}>{(page*PAGE_SIZE+1).toLocaleString()}–{Math.min((page+1)*PAGE_SIZE,total).toLocaleString()}</span>
                {" "}OF{" "}
                <span style={{color:"#e8621a"}}>{total.toLocaleString()}</span>
                {" "}PRODUCTS
              </span>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <button className="page-btn" disabled={page===0} onClick={() => setPage(p => p-1)}>← PREV</button>
                {getPageRange(page, totalPages).map(pg => (
                  <button key={pg} className={`page-btn ${pg===page?"active":""}`} onClick={() => setPage(pg)}>{pg+1}</button>
                ))}
                <button className="page-btn" disabled={page>=totalPages-1} onClick={() => setPage(p => p+1)}>NEXT →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
