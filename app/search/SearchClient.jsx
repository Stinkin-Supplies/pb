"use client";
// ============================================================
// app/search/SearchClient.jsx
// ============================================================
// Live search UI — filters mock catalog as you type.
// TODO Phase 5: replace mock search with Typesense API call
//   on each keystroke (debounced 300ms).
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useCartSafe } from "@/components/CartContext";
import NavBar from "@/components/NavBar";


const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:#0a0909; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

  /* SEARCH HERO */
  .search-hero { background:#111010;border-bottom:1px solid #2a2828;padding:32px 24px 28px; }
  .search-hero-inner { max-width:760px;margin:0 auto; }
  .search-eyebrow { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.25em;margin-bottom:10px; }
  .search-bar-wrap { position:relative;display:flex;align-items:center;gap:0; }
  .search-input {
    flex:1;height:54px;
    background:#1a1919;border:1px solid #2a2828;border-right:none;
    color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;
    font-size:20px;font-weight:600;letter-spacing:0.03em;
    padding:0 20px;outline:none;border-radius:2px 0 0 2px;
    transition:border-color 0.2s;
  }
  .search-input:focus { border-color:#e8621a; }
  .search-input::placeholder { color:#3a3838; }
  .search-btn {
    height:54px;width:64px;flex-shrink:0;
    background:#e8621a;border:none;
    color:#0a0909;font-size:22px;
    border-radius:0 2px 2px 0;cursor:pointer;
    transition:background 0.2s;display:flex;align-items:center;justify-content:center;
  }
  .search-btn:hover { background:#c94f0f; }
  .search-clear {
    position:absolute;right:72px;
    background:none;border:none;color:#8a8784;
    font-size:18px;cursor:pointer;padding:0;
    transition:color 0.15s;
  }
  .search-clear:hover { color:#f0ebe3; }

  /* POPULAR SEARCHES */
  .popular-wrap { margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
  .popular-label { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.15em; }
  .popular-chip {
    font-family:'Share Tech Mono',monospace;font-size:9px;
    color:#8a8784;letter-spacing:0.1em;
    border:1px solid #2a2828;border-radius:2px;
    padding:3px 9px;cursor:pointer;transition:all 0.15s;
    background:transparent;
  }
  .popular-chip:hover { border-color:#e8621a;color:#e8621a; }

  /* TOOLBAR */
  .search-toolbar {
    background:#0a0909;border-bottom:1px solid #2a2828;
    padding:10px 24px;
    display:flex;align-items:center;justify-content:space-between;
    flex-wrap:wrap;gap:8px;
  }
  .result-count { font-family:'Share Tech Mono',monospace;font-size:10px;color:#8a8784;letter-spacing:0.12em; }
  .result-count span { color:#e8621a; }
  .sort-select { background:#1a1919;border:1px solid #2a2828;color:#f0ebe3;font-family:'Barlow Condensed',sans-serif;font-size:13px;padding:5px 9px;border-radius:2px;outline:none; }

  /* RESULTS GRID */
  .search-body { max-width:1200px;margin:0 auto;padding:24px; }
  .results-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px; }

  /* PRODUCT CARD */
  .s-card { background:#111010;border:1px solid #2a2828;border-radius:2px;overflow:hidden;cursor:pointer;transition:all 0.22s;animation:fadeUp 0.25s ease both; }
  .s-card:hover { border-color:rgba(232,98,26,0.4);transform:translateY(-3px);box-shadow:0 10px 32px rgba(0,0,0,0.45); }
  .s-card-img { width:100%;aspect-ratio:1/1;background:#ffffff;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden; }
  .s-card-img::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px);background-size:16px 16px; }
  .s-badge { position:absolute;top:7px;left:7px;font-family:'Share Tech Mono',monospace;font-size:8px;font-weight:700;letter-spacing:0.1em;padding:2px 6px;border-radius:1px; }
  .s-badge.sale { background:#b91c1c;color:#fff; }
  .s-badge.new  { background:#c9a84c;color:#0a0909; }
  .s-oos { position:absolute;bottom:7px;left:7px;font-family:'Share Tech Mono',monospace;font-size:7px;color:#8a8784;background:rgba(0,0,0,0.65);padding:2px 6px;border-radius:1px; }
  .s-card-body { padding:11px 13px; }
  .s-brand { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.14em;margin-bottom:3px; }
  .s-name { font-size:13px;font-weight:700;color:#f0ebe3;line-height:1.3;margin-bottom:4px; }
  .s-highlight { background:rgba(232,98,26,0.15);color:#e8621a;border-radius:1px;padding:0 2px; }
  .s-cat { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.1em;margin-bottom:8px; }
  .s-footer { display:flex;justify-content:space-between;align-items:center; }
  .s-price { font-family:'Bebas Neue',sans-serif;font-size:20px;color:#f0ebe3;letter-spacing:0.04em; }
  .s-was { font-size:11px;color:#8a8784;text-decoration:line-through;font-family:'Barlow Condensed',sans-serif;display:block;margin-bottom:1px; }
  .s-add { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:0.1em;padding:5px 12px;border-radius:2px;cursor:pointer;transition:background 0.2s; }
  .s-add:hover { background:#c94f0f; }
  .s-add:disabled { background:#2a2828;color:#8a8784;cursor:not-allowed; }

  /* EMPTY / ZERO STATE */
  .search-empty { padding:80px 20px;text-align:center; }
  .search-empty-title { font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:0.05em;color:#3a3838;margin-bottom:8px; }
  .search-empty-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.14em;margin-bottom:24px; }
  .search-suggestions { display:flex;gap:8px;flex-wrap:wrap;justify-content:center; }

  /* LANDING (no query) */
  .search-landing { max-width:1200px;margin:0 auto;padding:32px 24px; }
  .landing-section-title { font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:0.05em;color:#f0ebe3;margin-bottom:16px;border-bottom:1px solid #2a2828;padding-bottom:10px; }
  .landing-section-title span { color:#e8621a; }
  .cat-pills { display:flex;flex-wrap:wrap;gap:8px;margin-bottom:36px; }
  .cat-pill { background:#111010;border:1px solid #2a2828;border-radius:2px;padding:10px 18px;cursor:pointer;transition:all 0.2s;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:0.07em;color:#8a8784; }
  .cat-pill:hover { border-color:#e8621a;color:#f0ebe3;background:rgba(232,98,26,0.05); }
`;

// Highlight matching text in search results
function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="s-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Result card ───────────────────────────────────────────────
function ResultCard({ p, i, query, onAdd }) {
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });
  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif", ...s });
  const img = p.image ?? (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null);
  return (
    <div
      className="s-card"
      style={{ animationDelay:`${Math.min(i,12) * 0.03}s`, opacity: p.inStock ? 1 : 0.55 }}
      onClick={() => window.location.href = `/shop/${p.slug}`}
    >
      <div className="s-card-img">
        {img
          ? <img src={img} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : <span style={M({fontSize:8, color:"#3a3838", letterSpacing:"0.1em", position:"relative", zIndex:1})}>NO IMAGE</span>
        }
        {p.badge && <span className={`s-badge ${p.badge}`}>{p.badge.toUpperCase()}</span>}
        {!p.inStock && <span className="s-oos">OUT OF STOCK</span>}
      </div>
      <div className="s-card-body">
        <div className="s-brand">{p.brand}</div>
        <div className="s-name">{highlight(p.name, query)}</div>
        <div className="s-cat">{p.category}</div>
        <div className="s-footer">
          <div>
            {p.was && <span className="s-was">${p.was.toFixed(2)}</span>}
            <span className="s-price">${p.price.toFixed(2)}</span>
          </div>
          <button
            className="s-add"
            disabled={!p.inStock}
            onClick={e => { e.stopPropagation(); if (p.inStock) onAdd(); }}
          >
            {p.inStock ? "ADD" : "OOS"}
          </button>
        </div>
      </div>
    </div>
  );
}

const POPULAR      = ["exhaust", "air cleaner", "handlebars", "seat", "wheels", "shocks", "battery", "footpegs", "helmet", "tires"];
const CATEGORIES   = ["Street","ATV","Common Parts","MX / Off-Road","Watercraft","Scooter","Drag Specialties","Moose ATV"];
const DEBOUNCE_MS  = 350;

export default function SearchClient({ initialQuery = "" }) {
  const [query,        setQuery]        = useState(initialQuery);
  const [input,        setInput]        = useState(initialQuery);
  const [sort,         setSort]         = useState("relevance");
  const [results,      setResults]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [saleProducts, setSaleProducts] = useState([]);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const { addItem } = useCartSafe();

  // Focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Load sale products for landing page
  useEffect(() => {
    fetch("/api/search?sort=price_desc&pageSize=8")
      .then(r => r.json())
      .then(d => setSaleProducts((d.products ?? []).filter(p => p.was)))
      .catch(() => {});
  }, []);

  // Debounced search
  const fetchResults = useCallback(async (q, s) => {
    if (!q.trim()) { setResults([]); setTotal(0); return; }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const sortParam = s === "relevance" ? "" : `&sort=${s.replace("-","_")}`;
      const res  = await fetch(
        `/api/search?search=${encodeURIComponent(q)}&pageSize=48${sortParam}`,
        { signal: abortRef.current.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.products ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[Search]", err.message);
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchResults(query, sort), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, sort, fetchResults]);

  const doSearch = (q) => {
    setQuery(q);
    setInput(q);
    const url = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
    window.history.replaceState(null, "", url);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    doSearch(input.trim());
  };

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });

  return (
    <div style={{ background:"#0a0909", minHeight:"100vh", color:"#f0ebe3", fontFamily:"'Barlow Condensed',sans-serif" }}>
      <style>{css}</style>

      <NavBar activePage="search" />

      {/* SEARCH HERO */}
      <div className="search-hero">
        <div className="search-hero-inner">
          <div className="search-eyebrow">SEARCH 500K+ PARTS</div>
          <form onSubmit={handleSubmit} className="search-bar-wrap">
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder="Search parts, brands, categories..."
              value={input}
              onChange={e => { setInput(e.target.value); doSearch(e.target.value); }}
            />
            {input && (
              <button type="button" className="search-clear"
                onClick={() => { setInput(""); doSearch(""); inputRef.current?.focus(); }}>
                ✕
              </button>
            )}
            <button type="submit" className="search-btn">🔍</button>
          </form>

          {/* Popular searches */}
          {!query && (
            <div className="popular-wrap">
              <span className="popular-label">POPULAR:</span>
              {POPULAR.map(p => (
                <button key={p} className="popular-chip" onClick={() => doSearch(p)}>{p}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RESULTS */}
      {query ? (
        <>
          {/* Toolbar */}
          <div className="search-toolbar">
            <span className="result-count">
              {loading
                ? <span style={M({color:"#3a3838"})}>SEARCHING…</span>
                : <><span>{total.toLocaleString()}</span> RESULTS FOR "{query.toUpperCase()}"</>
              }
            </span>
            <select className="sort-select" value={sort}
              onChange={e => setSort(e.target.value)}>
              <option value="relevance">Relevance</option>
              <option value="price-asc">Price: Low→High</option>
              <option value="price-desc">Price: High→Low</option>
              <option value="name-asc">A → Z</option>
            </select>
          </div>

          <div className="search-body">
            {loading ? (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
                {Array.from({length:8}).map((_,i) => (
                  <div key={i} className="s-card" style={{opacity:0.4}}>
                    <div className="s-card-img"/>
                    <div className="s-card-body">
                      <div style={{height:8, background:"#2a2828", borderRadius:2, marginBottom:8, width:"60%"}}/>
                      <div style={{height:12, background:"#2a2828", borderRadius:2, marginBottom:8}}/>
                      <div style={{height:8, background:"#2a2828", borderRadius:2, width:"40%"}}/>
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="search-empty">
                <div className="search-empty-title">NO RESULTS FOR "{query.toUpperCase()}"</div>
                <div className="search-empty-sub">TRY A DIFFERENT SEARCH TERM OR BROWSE BY CATEGORY</div>
                <div className="search-suggestions">
                  {POPULAR.map(p => (
                    <button key={p} className="popular-chip" onClick={() => doSearch(p)}>{p}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="results-grid">
                {results.map((p, i) => (
                  <ResultCard key={p.id} p={p} i={i} query={query} onAdd={() => addItem(p)} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* LANDING */
        <div className="search-landing">
          <div className="landing-section-title">BROWSE BY <span>CATEGORY</span></div>
          <div className="cat-pills">
            {CATEGORIES.map(c => (
              <div key={c} className="cat-pill"
                onClick={() => window.location.href = `/shop?category=${encodeURIComponent(c)}`}>
                {c}
              </div>
            ))}
          </div>

          {saleProducts.length > 0 && (
            <>
              <div className="landing-section-title">ON <span>SALE NOW</span></div>
              <div className="results-grid">
                {saleProducts.map((p, i) => (
                  <ResultCard key={p.id} p={p} i={i} query="" onAdd={() => addItem(p)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
