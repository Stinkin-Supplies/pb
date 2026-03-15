"use client";
// ============================================================
// app/brands/page.jsx
// ============================================================
// Brand directory — click any brand → /shop?brand=brand-name
// TODO Phase 5: pull real brand list + product counts from DB
// ============================================================

import { useState, useMemo } from "react";

const BRANDS = [
  { name:"Screamin Eagle",   slug:"screamin-eagle",   category:"Performance",  featured:true,  desc:"Harley-Davidson's performance division" },
  { name:"Vance & Hines",    slug:"vance-hines",      category:"Exhaust",      featured:true,  desc:"America's #1 exhaust brand" },
  { name:"Roland Sands",     slug:"roland-sands",     category:"Lifestyle",    featured:true,  desc:"Moto culture meets custom design" },
  { name:"Arlen Ness",       slug:"arlen-ness",       category:"Custom",       featured:true,  desc:"Legendary custom parts since 1967" },
  { name:"S&S Cycle",        slug:"ss-cycle",         category:"Performance",  featured:true,  desc:"High performance engine components" },
  { name:"Kuryakyn",         slug:"kuryakyn",         category:"Accessories",  featured:true,  desc:"Accessories that define your style" },
  { name:"Progressive",      slug:"progressive",      category:"Suspension",   featured:false, desc:"Suspension solutions for every ride" },
  { name:"Drag Specialties", slug:"drag-specialties", category:"Parts",        featured:false, desc:"Largest powersports parts distributor" },
  { name:"Rinehart Racing",  slug:"rinehart-racing",  category:"Exhaust",      featured:false, desc:"Hand-crafted exhaust systems" },
  { name:"Cobra",            slug:"cobra",            category:"Exhaust",      featured:false, desc:"Performance exhaust & accessories" },
  { name:"Samson",           slug:"samson",           category:"Exhaust",      featured:false, desc:"Custom exhaust since 1985" },
  { name:"Metzeler",         slug:"metzeler",         category:"Tires",        featured:false, desc:"Premium motorcycle tires" },
  { name:"Dunlop",           slug:"dunlop",           category:"Tires",        featured:false, desc:"Trusted tires for every terrain" },
  { name:"Michelin",         slug:"michelin",         category:"Tires",        featured:false, desc:"Innovation in motorcycle tires" },
  { name:"WPS",              slug:"wps",              category:"Parts",        featured:false, desc:"Western Power Sports distributor" },
  { name:"Biker's Choice",   slug:"bikers-choice",    category:"Parts",        featured:false, desc:"Quality OEM replacement parts" },
  { name:"Custom Dynamics",  slug:"custom-dynamics",  category:"Lighting",     featured:false, desc:"LED lighting solutions" },
  { name:"Ciro",             slug:"ciro",             category:"Lighting",     featured:false, desc:"Innovative LED accessories" },
  { name:"National Cycle",   slug:"national-cycle",   category:"Windshields",  featured:false, desc:"Windshields & bodywork since 1937" },
  { name:"Mustang Seats",    slug:"mustang-seats",    category:"Seats",        featured:false, desc:"Handcrafted seats for Harley" },
  { name:"Saddlemen",        slug:"saddlemen",        category:"Seats",        featured:false, desc:"Premium seating solutions" },
  { name:"Memphis Shades",   slug:"memphis-shades",   category:"Windshields",  featured:false, desc:"Windshields, fairings & more" },
  { name:"Klock Werks",      slug:"klock-werks",      category:"Custom",       featured:false, desc:"Custom flare windshields" },
  { name:"Performance Machine", slug:"performance-machine", category:"Brakes", featured:false, desc:"High performance brakes & wheels" },
];

const CATEGORIES = ["All", ...new Set(BRANDS.map(b => b.category))].sort((a,b) => a === "All" ? -1 : 0);

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

  .brands-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }

  .b-nav { position:sticky;top:0;z-index:50;background:rgba(10,9,9,0.96);border-bottom:1px solid #2a2828;height:54px;display:flex;align-items:center;padding:0 24px;gap:14px;backdrop-filter:blur(10px); }

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

  /* FEATURED */
  .featured-section { margin-bottom:36px; }
  .section-label { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.2em;margin-bottom:14px;display:flex;align-items:center;gap:10px; }
  .section-label::after { content:'';flex:1;height:1px;background:#2a2828; }
  .featured-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px; }

  .featured-card { background:#111010;border:1px solid #2a2828;border-radius:3px;padding:20px;cursor:pointer;transition:all 0.22s;position:relative;overflow:hidden;animation:fadeUp 0.3s ease both; }
  .featured-card::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(232,98,26,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.03) 1px,transparent 1px);background-size:20px 20px;opacity:0;transition:opacity 0.2s; }
  .featured-card:hover::before { opacity:1; }
  .featured-card:hover { border-color:rgba(232,98,26,0.4);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,0.4); }
  .featured-badge { font-family:'Share Tech Mono',monospace;font-size:7px;color:#c9a84c;letter-spacing:0.15em;border:1px solid rgba(201,168,76,0.25);padding:2px 7px;border-radius:1px;display:inline-block;margin-bottom:10px; }
  .featured-name { font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:0.05em;color:#f0ebe3;margin-bottom:4px;line-height:1; }
  .featured-cat { font-family:'Share Tech Mono',monospace;font-size:8px;color:#e8621a;letter-spacing:0.15em;margin-bottom:8px; }
  .featured-desc { font-size:13px;font-weight:500;color:#8a8784;line-height:1.4;margin-bottom:14px; }
  .featured-cta { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.12em;display:flex;align-items:center;gap:6px; }

  /* ALL BRANDS GRID */
  .all-brands-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px; }
  .brand-pill-card { background:#111010;border:1px solid #2a2828;border-radius:2px;padding:14px 16px;cursor:pointer;transition:all 0.18s;display:flex;flex-direction:column;gap:4px;animation:fadeUp 0.25s ease both; }
  .brand-pill-card:hover { border-color:rgba(232,98,26,0.35);background:#151414; }
  .brand-pill-name { font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:0.06em;color:#f0ebe3;line-height:1; }
  .brand-pill-cat { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.12em; }
  .brand-pill-arrow { font-family:'Share Tech Mono',monospace;font-size:8px;color:#3a3838;margin-top:6px;transition:color 0.15s; }
  .brand-pill-card:hover .brand-pill-arrow { color:#e8621a; }

  /* EMPTY */
  .brands-empty { padding:60px;text-align:center; }
  .brands-empty-title { font-family:'Bebas Neue',sans-serif;font-size:28px;color:#3a3838;letter-spacing:0.05em;margin-bottom:8px; }
  .brands-empty-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em; }
`;

export default function BrandsPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = BRANDS;
    if (activeCategory !== "All") list = list.filter(b => b.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, search]);

  const featured = filtered.filter(b => b.featured);
  const rest     = filtered.filter(b => !b.featured);

  const goToBrand = (slug) => {
    window.location.href = `/shop?brand=${slug}`;
  };

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });

  return (
    <div className="brands-wrap">
      <style>{css}</style>

      {/* NAV */}
      <div className="b-nav">
        <a href="/" style={{...B({fontSize:22, letterSpacing:"0.08em"}), textDecoration:"none", color:"#f0ebe3", flex:1}}>
          STINKIN<span style={{color:"#e8621a"}}>'</span> SUPPLIES
        </a>
        {[["Shop","/shop"],["Brands","/brands"],["Garage","/garage"],["Search","/search"]].map(([l,h]) => (
          <a key={l} href={h} style={{...M({fontSize:10, letterSpacing:"0.12em"}), color: l==="Brands"?"#e8621a":"#8a8784", textDecoration:"none"}}>{l}</a>
        ))}
        <button style={{background:"#e8621a", border:"none", color:"#0a0909", ...B({fontSize:13, letterSpacing:"0.1em", padding:"5px 12px", borderRadius:2, cursor:"pointer"})}}>
          MY GARAGE
        </button>
      </div>

      {/* HERO */}
      <div className="brands-hero">
        <div className="brands-hero-inner">
          <div className="hero-eyebrow">SHOP BY MANUFACTURER</div>
          <div className="hero-title">TOP <span>BRANDS</span></div>
          <p className="hero-sub">
            {BRANDS.length} brands carrying 500K+ parts. Click any brand to browse their full catalog filtered to your garage.
          </p>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="brands-toolbar">
        <div className="brands-toolbar-left">
          {CATEGORIES.map(c => (
            <button key={c} className={`cat-filter ${activeCategory===c?"active":""}`} onClick={() => setActiveCategory(c)}>
              {c.toUpperCase()}
            </button>
          ))}
          <span className="brand-count"><span>{filtered.length}</span> BRANDS</span>
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
        {filtered.length === 0 ? (
          <div className="brands-empty">
            <div className="brands-empty-title">NO BRANDS FOUND</div>
            <div className="brands-empty-sub">TRY A DIFFERENT SEARCH OR CATEGORY</div>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured.length > 0 && (
              <div className="featured-section">
                <div className="section-label">FEATURED BRANDS</div>
                <div className="featured-grid">
                  {featured.map((b, i) => (
                    <div key={b.slug} className="featured-card" style={{animationDelay:`${i*0.05}s`}} onClick={() => goToBrand(b.slug)}>
                      <div className="featured-badge">★ FEATURED</div>
                      <div className="featured-name">{b.name}</div>
                      <div className="featured-cat">{b.category.toUpperCase()}</div>
                      <div className="featured-desc">{b.desc}</div>
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
                    <div key={b.slug} className="brand-pill-card" style={{animationDelay:`${i*0.03}s`}} onClick={() => goToBrand(b.slug)}>
                      <div className="brand-pill-name">{b.name}</div>
                      <div className="brand-pill-cat">{b.category.toUpperCase()}</div>
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
