"use client";
// ============================================================
// app/brands/[slug]/page.jsx
// ============================================================
// Brand detail page — shows brand info + product grid
// filtered to this brand, pulled from self-hosted catalog DB
// ============================================================

import { useState, useEffect, useCallback, use } from "react";
import NavBar from "@/components/NavBar";
import { useCartSafe } from "@/components/CartContext";
import { getProductImage } from "@/lib/getProductImage";
import Image from "next/image";
import Link from "next/link";

const PAGE_SIZE = 48;

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
  @keyframes spin { to{transform:rotate(360deg)} }

  .wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }

  /* HERO */
  .brand-hero { background:#111010; border-bottom:1px solid #2a2828; padding:48px 24px; }
  .brand-hero-inner { max-width:1100px; margin:0 auto; display:flex; align-items:center; gap:32px; }
  .brand-logo-wrap { width:120px; height:60px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
    background:#1a1919; border:1px solid #2a2828; border-radius:2px; padding:12px; }
  .brand-logo { width:100%; height:100%; object-fit:contain; filter:brightness(0) invert(1); opacity:0.85; }
  .brand-logo-placeholder { font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:0.08em; color:#3a3838; }
  .brand-eyebrow { font-family:'Share Tech Mono',monospace; font-size:9px; color:#e8621a; letter-spacing:0.25em; margin-bottom:8px; }
  .brand-name { font-family:'Bebas Neue',sans-serif; font-size:52px; letter-spacing:0.04em; line-height:1; margin-bottom:8px; }
  .brand-meta { font-family:'Share Tech Mono',monospace; font-size:9px; color:#8a8784; letter-spacing:0.15em; display:flex; gap:16px; }
  .brand-meta span { color:#e8621a; }

  /* BREADCRUMB */
  .breadcrumb { background:#111010; border-bottom:1px solid #1a1919; padding:10px 24px;
    font-family:'Share Tech Mono',monospace; font-size:9px; color:#8a8784; letter-spacing:0.15em;
    display:flex; align-items:center; gap:6px; }
  .breadcrumb a { color:#8a8784; text-decoration:none; transition:color 0.2s; }
  .breadcrumb a:hover { color:#e8621a; }
  .breadcrumb .sep { color:#3a3838; }

  /* TOOLBAR */
  .toolbar { background:#0a0909; border-bottom:1px solid #2a2828; padding:10px 24px;
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
    position:sticky; top:54px; z-index:40; }
  .result-count { font-family:'Share Tech Mono',monospace; font-size:10px; color:#8a8784; letter-spacing:0.1em; }
  .result-count span { color:#e8621a; }
  .sort-select { background:#1a1919; border:1px solid #2a2828; color:#f0ebe3;
    font-family:'Barlow Condensed',sans-serif; font-size:13px;
    padding:5px 9px; border-radius:2px; outline:none; }

  /* GRID */
  .grid-wrap { max-width:1100px; margin:0 auto; padding:20px 24px; }
  .product-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; }

  /* PRODUCT CARD */
  .pcard { background:#111010; border:1px solid #2a2828; border-radius:2px; overflow:hidden;
    text-decoration:none; color:inherit; display:block; transition:all 0.22s; animation:fadeUp 0.3s ease both; }
  .pcard:hover { border-color:rgba(232,98,26,0.45); transform:translateY(-3px); box-shadow:0 10px 36px rgba(0,0,0,0.5); }
  .pcard-img { width:100%; aspect-ratio:1/1; background:#ffffff; display:flex; align-items:center;
    justify-content:center; position:relative; overflow:hidden; }
  .pcard-img::before { content:''; position:absolute; inset:0;
    background-image:linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px);
    background-size:16px 16px; }
  .pcard-body { padding:11px 13px; }
  .pcard-brand { font-family:'Share Tech Mono',monospace; font-size:9px; color:#e8621a; letter-spacing:0.14em; margin-bottom:3px; }
  .pcard-name { font-size:13px; font-weight:700; color:#f0ebe3; line-height:1.3; margin-bottom:9px; }
  .pcard-footer { display:flex; justify-content:space-between; align-items:center; }
  .pcard-price { font-family:'Bebas Neue',sans-serif; font-size:20px; color:#f0ebe3; letter-spacing:0.04em; }
  .add-btn { background:#e8621a; border:none; color:#0a0909; font-family:'Bebas Neue',sans-serif;
    font-size:13px; letter-spacing:0.1em; padding:5px 12px; border-radius:2px; cursor:pointer;
    transition:background 0.2s; }
  .add-btn:hover:not(:disabled) { background:#c94f0f; }
  .add-btn:disabled { background:#2a2828; color:#8a8784; cursor:not-allowed; }

  /* SKELETON */
  .skel { background:linear-gradient(90deg,#1a1919 25%,#222121 50%,#1a1919 75%);
    background-size:600px 100%; animation:pulse 1.4s infinite; border-radius:2px; }

  /* SPINNER */
  .spinner { width:24px; height:24px; border-radius:50%; border:3px solid #2a2828;
    border-top-color:#e8621a; animation:spin 0.7s linear infinite; }

  /* PAGINATION */
  .pagination { display:flex; align-items:center; justify-content:center; gap:8px; padding:32px 0; flex-wrap:wrap; }
  .page-btn { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:0.08em;
    background:#111010; border:1px solid #2a2828; color:#8a8784; padding:7px 13px;
    border-radius:2px; cursor:pointer; transition:all 0.15s; }
  .page-btn:hover:not(:disabled) { border-color:#e8621a; color:#e8621a; }
  .page-btn.active { background:#e8621a; border-color:#e8621a; color:#0a0909; }
  .page-btn:disabled { opacity:0.3; cursor:default; }

  /* EMPTY */
  .empty { padding:80px 24px; text-align:center; }
  .empty-title { font-family:'Bebas Neue',sans-serif; font-size:32px; color:#3a3838; letter-spacing:0.05em; margin-bottom:8px; }
  .empty-sub { font-family:'Share Tech Mono',monospace; font-size:9px; color:#8a8784; letter-spacing:0.12em; }
`;

const SORT_OPTIONS = [
  { value: "newest",     label: "Newest" },
  { value: "price_asc",  label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
  { value: "name_asc",   label: "A → Z" },
];

export default function BrandDetailPage({ params }) {
  const { slug } = use(params);

  const [brand,    setBrand]    = useState(null);
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [sort,     setSort]     = useState("newest");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const { addItem } = useCartSafe();

  // Fetch brand info
  useEffect(() => {
    fetch(`/api/brands/${slug}`)
      .then(r => {
        if (!r.ok) {
          window.location.href = "/brands";
          return;
        }
        return r.json();
      })
      .then(data => {
        if (data) setBrand(data.brand ?? null);
      })
      .catch(() => setError("Brand not found"));
  }, [slug]);

  // Fetch products
  const fetchProducts = useCallback(async (brandName, p, s) => {
    if (!brandName) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        brand:    brandName,
        page:     String(p),
        pageSize: String(PAGE_SIZE),
        sort:     s,
      });
      const res  = await fetch(`/api/search?${qs}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError("Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (brand?.name) fetchProducts(brand.name, page, sort);
  }, [brand, page, sort, fetchProducts]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="wrap">
      <style>{css}</style>
      <NavBar activePage="brands" />

      {/* BREADCRUMB */}
      <div className="breadcrumb">
        <a href="/">HOME</a>
        <span className="sep">→</span>
        <a href="/brands">BRANDS</a>
        <span className="sep">→</span>
        <span style={{ color: "#f0ebe3" }}>{brand?.name ?? slug.toUpperCase()}</span>
      </div>

      {/* HERO */}
      <div className="brand-hero">
        <div className="brand-hero-inner">
          <div className="brand-logo-wrap">
            {brand?.logo_url
              ? <img src={brand.logo_url} alt={brand.name} className="brand-logo" />
              : <div className="brand-logo-placeholder">
                  {(brand?.name ?? slug).slice(0, 2).toUpperCase()}
                </div>
            }
          </div>
          <div>
            <div className="brand-eyebrow">MANUFACTURER</div>
            <div className="brand-name">{brand?.name ?? slug.replace(/-/g, " ").toUpperCase()}</div>
            <div className="brand-meta">
              <span>{total.toLocaleString()}</span> PARTS AVAILABLE
              {brand?.is_featured && <span style={{ color: "#c9a84c" }}>★ FEATURED BRAND</span>}
            </div>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="result-count">
          {loading
            ? <span style={{ color: "#3a3838" }}>LOADING...</span>
            : <><span>{total.toLocaleString()}</span> PARTS</>
          }
        </div>
        <select
          className="sort-select"
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(0); }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* PRODUCT GRID */}
      <div className="grid-wrap">
        {error && (
          <div style={{ padding: 40, textAlign: "center", color: "#e8621a",
            fontFamily: "'Share Tech Mono',monospace", fontSize: 11, letterSpacing: "0.1em" }}>
            {error.toUpperCase()}
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="empty">
            <div className="empty-title">NO PARTS FOUND</div>
            <div className="empty-sub">CHECK BACK AFTER THE NEXT SYNC</div>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="product-grid">
            {products.map((p, i) => {
              const imageSrc = getProductImage(p);
              return (
                <Link
                  key={p.id}
                  href={`/shop/${p.slug}`}
                  className="pcard"
                  style={{ animationDelay: `${Math.min(i, 12) * 0.03}s`,
                           opacity: p.inStock ? 1 : 0.55 }}
                >
                  <div className="pcard-img">
                    <Image
                      src={imageSrc}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      style={{ objectFit: "cover", zIndex: 1 }}
                      unoptimized
                    />
                    {!p.inStock && (
                      <span style={{
                        position: "absolute", bottom: 7, left: 7, zIndex: 2,
                        fontFamily: "'Share Tech Mono',monospace", fontSize: 7,
                        color: "#8a8784", background: "rgba(0,0,0,0.7)",
                        padding: "2px 6px", borderRadius: 1, letterSpacing: "0.1em"
                      }}>OUT OF STOCK</span>
                    )}
                  </div>
                  <div className="pcard-body">
                    <div className="pcard-brand">{p.brand}</div>
                    <div className="pcard-name">{p.name}</div>
                    <div className="pcard-footer">
                      <div className="pcard-price">${p.price.toFixed(2)}</div>
                      <button
                        className="add-btn"
                        disabled={!p.inStock}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (p.inStock) addItem(p);
                        }}
                      >
                        {p.inStock ? "ADD" : "OOS"}
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={page === 0}
              onClick={() => setPage(p => p - 1)}>← PREV</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button key={pg} className={`page-btn ${pg === page ? "active" : ""}`}
                  onClick={() => setPage(pg)}>{pg + 1}</button>
              );
            })}
            <button className="page-btn" disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}>NEXT →</button>
          </div>
        )}
      </div>
    </div>
  );
}
