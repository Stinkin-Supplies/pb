"use client";
// ============================================================
// app/brands/page.jsx
// ============================================================
// Brand directory — pulls from Supabase brands table
// Click any brand → /shop?brand=slug
// ============================================================

import { useState, useMemo, useEffect } from "react";
import NavBar from "@/components/NavBar";

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }

  .brands-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }

  .brands-hero { background:#111010;border-bottom:1px solid #2a2828;padding:36px 24px; }
  .brands-hero-inner { max-width:1100px;margin:0 auto; }
  .hero-eyebrow { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.25em;margin-bottom:8px; }
  .hero-title { font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:0.04em;line-height:1;margin-bottom:8px; }
  .hero-title span { color:#e8621a; }
  .hero-sub { font-size:15px;font-weight:500;color:#8a8784;max-width:500px; }

  .brands-toolbar { background:#0a0909;border-bottom:1px solid #2a2828;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;position:sticky;top:54px;z-index:40; }
  .brands-toolbar-left { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
  .cat-filter { font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.12em;padding:5px 12px;border-radius:2px;cursor:pointer;transition:all 0.15s;border:1px solid #2a2828;background:transparent;color:#8a8784; }
  .cat-filter:hover { border-color:rgba(232,98,26,0.3);color:#f0ebe3; }
  .cat-filter.active { background:rgba(232,98,26,0.1);border-color:rgba(232,98,26,0.35);color:#e8621a; }
  .brand-count { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }
  .brand-count span { color:#e8621a; }
  .brand-search { background:#111010;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:500;padding:7px 14px;border-radius:2px;outline:none;width:220px;transition:border-color 0.2s; }
  .brand-search:focus { border-color:#e8621a; }
  .brand-search::placeholder { color:#3a3838; }

  .brands-body { max-width:1100px;margin:0 auto;padding:28px 24px; }

  /* SKELETON */
  .skeleton-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px; }
  .skeleton-card { background:#111010;border:1px solid #2a2828;border-radius:2px;padding:14px 16px;height:80px;animation:pulse 1.4s ease-in-out infinite; }

  /* FEATURED */
  .featured-section { margin-bottom:36px; }
  .section-label { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.2em;margin-bottom:14px;display:flex;align-items:center;gap:10px; }
  .section-label::after { content:'';flex:1;height:1px;background:#2a2828; }
  .featured-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px; }

  .featured-card { background:#111010;border:1px solid #2a2828;border-radius:3px;padding:20px;cursor:pointer;transition:all 0.22s;position:relative;overflow:hidden;animation:fadeUp 0.3s ease both; }
  .featured-card::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(232,98,26,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.03) 1px,transparent 1px);background-size:20px 20px;opacity:0;transition:opacity 0.2s; }
  .featured-card:hover::before { opacity:1; }
  .featured-card:hover { border-color:rgba(232,98,26,0.4);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,0.4); }
  .featured-logo { width:80px;height:40px;object-fit:contain;margin-bottom:10px;filter:brightness(0) invert(1);opacity:0.8; }
  .featured-badge { font-family:'Share Tech Mono',monospace;font-size:7px;color:#c9a84c;letter-spacing:0.15em;border:1px solid rgba(201,168,76,0.25);padding:2px 7px;border-radius:1px;display:inline-block;margin-bottom:10px; }
  .featured-name { font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:0.05em;color:#f0ebe3;margin-bottom:14px;line-height:1; }
  .featured-cta { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.12em;display:flex;align-items:center;gap:6px; }

  /* ALL BRANDS GRID */
  .all-brands-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px; }
  .brand-pill-card { background:#111010;border:1px solid #2a2828;border-radius:2px;padding:14px 16px;cursor:pointer;transition:all 0.18s;display:flex;flex-direction:column;gap:4px;animation:fadeUp 0.25s ease both; }
  .brand-pill-card:hover { border-color:rgba(232,98,26,0.35);background:#151414; }
  .brand-pill-logo { width:60px;height:28px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.6;margin-bottom:4px; }
  .brand-pill-name { font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:0.06em;color:#f0ebe3;line-height:1; }
  .brand-pill-arrow { font-family:'Share Tech Mono',monospace;font-size:8px;color:#3a3838;margin-top:6px;transition:color 0.15s; }
  .brand-pill-card:hover .brand-pill-arrow { color:#e8621a; }

  /* ERROR */
  .brands-error { padding:60px;text-align:center; }
  .brands-error-title { font-family:'Bebas Neue',sans-serif;font-size:28px;color:#e8621a;letter-spacing:0.05em;margin-bottom:8px; }
  .brands-error-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }

  /* EMPTY */
  .brands-empty { padding:60px;text-align:center; }
  .brands-empty-title { font-family:'Bebas Neue',sans-serif;font-size:28px;color:#3a3838;letter-spacing:0.05em;margin-bottom:8px; }
  .brands-empty-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }
`;

export default function BrandsPage() {
  const [brands, setBrands]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [search, setSearch]               = useState("");
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  // Fetch brands from API on mount
  useEffect(() => {
    fetch("/api/brands")
      .then(r => r.json())
      .then(data => {
        setBrands(data.brands ?? []);
        setLoading(false);
      })
      .catch(err => {
        console.error("[brands] fetch error:", err);
        setError("Failed to load brands.");
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let list = brands;
    if (showFeaturedOnly) list = list.filter(b => b.is_featured);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [brands, showFeaturedOnly, search]);

  const featured = filtered.filter(b => b.is_featured);
  const rest     = filtered.filter(b => !b.is_featured);

  const goToBrand = (slug) => {
    window.location.href = `/shop?brand=${slug}`;
  };

  return (
    <div className="brands-wrap">
      <style>{css}</style>
      <NavBar activePage="brands" />

      {/* HERO */}
      <div className="brands-hero">
        <div className="brands-hero-inner">
          <div className="hero-eyebrow">SHOP BY MANUFACTURER</div>
          <div className="hero-title">TOP <span>BRANDS</span></div>
          <p className="hero-sub">
            {loading ? "Loading brands..." : `${brands.length} brands carrying 500K+ parts.`}
            {" "}Click any brand to browse their full catalog.
          </p>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="brands-toolbar">
        <div className="brands-toolbar-left">
          <button
            className={`cat-filter ${!showFeaturedOnly ? "active" : ""}`}
            onClick={() => setShowFeaturedOnly(false)}
          >
            ALL
          </button>
          <button
            className={`cat-filter ${showFeaturedOnly ? "active" : ""}`}
            onClick={() => setShowFeaturedOnly(true)}
          >
            ★ FEATURED
          </button>
          {!loading && (
            <span className="brand-count">
              <span>{filtered.length}</span> BRANDS
            </span>
          )}
        </div>
        <input
          className="brand-search"
          type="text"
          placeholder="Search brands..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* BODY */}
      <div className="brands-body">

        {/* Loading skeleton */}
        {loading && (
          <div className="skeleton-grid">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.04}s` }} />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="brands-error">
            <div className="brands-error-title">COULD NOT LOAD BRANDS</div>
            <div className="brands-error-sub">{error}</div>
          </div>
        )}

        {/* Empty search result */}
        {!loading && !error && filtered.length === 0 && (
          <div className="brands-empty">
            <div className="brands-empty-title">NO BRANDS FOUND</div>
            <div className="brands-empty-sub">TRY A DIFFERENT SEARCH</div>
          </div>
        )}

        {/* Brands */}
        {!loading && !error && filtered.length > 0 && (
          <>
            {/* Featured */}
            {featured.length > 0 && (
              <div className="featured-section">
                <div className="section-label">FEATURED BRANDS</div>
                <div className="featured-grid">
                  {featured.map((b, i) => (
                    <div
                      key={b.id}
                      className="featured-card"
                      style={{ animationDelay: `${i * 0.05}s` }}
                      onClick={() => goToBrand(b.slug)}
                    >
                      {b.logo_url && (
                        <img src={b.logo_url} alt={b.name} className="featured-logo" />
                      )}
                      <div className="featured-badge">★ FEATURED</div>
                      <div className="featured-name">{b.name}</div>
                      <div className="featured-cta">SHOP {b.name.toUpperCase()} →</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All others */}
            {rest.length > 0 && (
              <>
                <div className="section-label">
                  {featured.length > 0 ? "ALL BRANDS" : "BRANDS"}
                </div>
                <div className="all-brands-grid">
                  {rest.map((b, i) => (
                    <div
                      key={b.id}
                      className="brand-pill-card"
                      style={{ animationDelay: `${i * 0.03}s` }}
                      onClick={() => goToBrand(b.slug)}
                    >
                      {b.logo_url && (
                        <img src={b.logo_url} alt={b.name} className="brand-pill-logo" />
                      )}
                      <div className="brand-pill-name">{b.name}</div>
                      <div className="brand-pill-arrow">SHOP PARTS →</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}