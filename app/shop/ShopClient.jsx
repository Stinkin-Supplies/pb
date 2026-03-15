"use client";
// ============================================================
// app/shop/ShopClient.jsx  —  CLIENT COMPONENT
// ============================================================
// Receives pre-fetched, normalized products from the server
// component (app/shop/page.jsx).
//
// This file is safe to mark "use client" because:
//  - It receives plain data as props, not a Supabase client
//  - No secret keys imported here
//  - All DB interaction stays in page.jsx (server side)
//
// For subsequent filter changes (after page load) this component
// filters the already-fetched list client-side. This is fast
// for <1000 products. When catalog grows:
//  TODO: debounce filter changes → fetch /api/products?filters
//        so Supabase does the heavy lifting server-side.
// ============================================================

import { useState, useMemo } from "react";

// ── MOCK FALLBACK ─────────────────────────────────────────────
// Used when Supabase fetch fails or returns empty (e.g. before
// vendor sync in Phase 5). Remove once real products are flowing.
const MOCK_PRODUCTS = [
  { id:1,  slug:"screamin-eagle-stage-iv-kit",      brand:"Screamin Eagle",   name:"Stage IV High Torque Kit",              category:"Engine & Performance",  price:849.99, was:999.99, badge:"sale", inStock:true,  fitmentIds:null },
  { id:2,  slug:"vance-hines-pro-pipe-chrome",      brand:"Vance & Hines",    name:"Pro Pipe Chrome 2-into-1 Exhaust",       category:"Exhaust Systems",       price:524.95, was:null,   badge:"new",  inStock:true,  fitmentIds:null },
  { id:3,  slug:"arlen-ness-beveled-air-cleaner",   brand:"Arlen Ness",       name:"Beveled Air Cleaner Kit — Chrome",       category:"Engine & Performance",  price:189.95, was:null,   badge:null,   inStock:true,  fitmentIds:null },
  { id:4,  slug:"saddlemen-road-sofa-seat",         brand:"Drag Specialties", name:"Saddlemen Road Sofa Seat",               category:"Seats & Comfort",       price:379.99, was:429.99, badge:"sale", inStock:true,  fitmentIds:null },
  { id:5,  slug:"roland-sands-clarity-derby",       brand:"Roland Sands",     name:"Clarity Derby Cover — Contrast Cut",     category:"Body & Fenders",        price:145.00, was:null,   badge:null,   inStock:false, fitmentIds:null },
  { id:6,  slug:"kuryakyn-hypercharger-es",         brand:"Kuryakyn",         name:"Hypercharger ES Air Intake Kit",         category:"Engine & Performance",  price:264.95, was:null,   badge:"new",  inStock:true,  fitmentIds:null },
  { id:7,  slug:"wps-lithium-battery-12v",          brand:"WPS",              name:"Rechargeable Lithium Battery 12V",       category:"Lighting & Electrical", price:139.95, was:null,   badge:null,   inStock:true,  fitmentIds:null },
  { id:8,  slug:"progressive-412-shocks",           brand:"Progressive",      name:"412 Series Rear Shocks — Chrome",       category:"Brakes & Wheels",       price:299.95, was:null,   badge:null,   inStock:true,  fitmentIds:null },
  { id:9,  slug:"rinehart-true-dual-exhaust",       brand:"Rinehart",         name:"True Dual Exhaust — Black",              category:"Exhaust Systems",       price:649.95, was:699.95, badge:"sale", inStock:true,  fitmentIds:null },
  { id:10, slug:"ss-cycle-610-cams",                brand:"S&S Cycle",        name:"610 Chain Drive Camshaft Kit",           category:"Engine & Performance",  price:419.00, was:null,   badge:null,   inStock:false, fitmentIds:null },
  { id:11, slug:"cobra-power-pro-exhaust",          brand:"Cobra",            name:"Power Pro 2-into-1 Exhaust — Chrome",   category:"Exhaust Systems",       price:489.95, was:null,   badge:null,   inStock:true,  fitmentIds:null },
  { id:12, slug:"kuryakyn-iso-footpegs",            brand:"Kuryakyn",         name:"ISO Ergo II Footpegs w/ Adapters",       category:"Handlebars & Controls", price:94.95,  was:null,   badge:null,   inStock:true,  fitmentIds:null },
  { id:13, slug:"metzeler-me888-front",             brand:"Metzeler",         name:"ME888 Marathon Ultra Front 130/80",      category:"Tires & Tubes",         price:134.95, was:null,   badge:null,   inStock:true,  fitmentIds:null },
  { id:14, slug:"drag-led-passing-lamps",           brand:"Drag Specialties", name:'5.75" LED Passing Lamps — Chrome',      category:"Lighting & Electrical", price:219.95, was:249.95, badge:"sale", inStock:true,  fitmentIds:null },
  { id:15, slug:"arlen-ness-speed-5-wheel",         brand:"Arlen Ness",       name:'Speed 5 Spoke Wheel — Chrome 16"',      category:"Brakes & Wheels",       price:749.00, was:null,   badge:null,   inStock:false, fitmentIds:null },
  { id:16, slug:"samson-fishtail-exhaust",          brand:"Samson",           name:"True Dual Fishtail Exhaust — Black",     category:"Exhaust Systems",       price:559.95, was:null,   badge:"new",  inStock:true,  fitmentIds:null },
];

const DEFAULT_CATEGORIES = ["Engine & Performance","Exhaust Systems","Lighting & Electrical","Body & Fenders","Seats & Comfort","Brakes & Wheels","Handlebars & Controls","Tires & Tubes"];
const DEFAULT_BRANDS     = ["Arlen Ness","Cobra","Drag Specialties","Kuryakyn","Metzeler","Progressive","Rinehart","Roland Sands","S&S Cycle","Samson","Screamin Eagle","Vance & Hines","WPS"];
const SORT_OPTIONS       = [
  { value:"featured",   label:"Featured"        },
  { value:"price-asc",  label:"Price: Low→High" },
  { value:"price-desc", label:"Price: High→Low" },
  { value:"newest",     label:"Newest"          },
  { value:"name-asc",   label:"A → Z"           },
];

// Saved garage vehicle — TODO Phase 3: pull from Supabase user_garage
// via useUser() hook once auth is built
const SAVED_VEHICLE = { id: 1, year: 2022, make: "Harley-Davidson", model: "Road King" };

// ── STYLES ───────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --black:#0a0909; --coal:#111010; --iron:#1a1919; --steel:#2a2828;
    --steel2:#3a3838; --chrome:#8a8784; --silver:#c4c0bc; --cream:#f0ebe3;
    --orange:#e8621a; --orange2:#c94f0f; --gold:#c9a84c;
    --red:#b91c1c; --green:#22c55e;
  }
  body { background:var(--black); color:var(--cream); font-family:'Barlow Condensed',sans-serif; }
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-thumb { background:var(--orange); }
  @keyframes fadeUp { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
  .ph:hover  { background:rgba(255,255,255,0.03) !important; }
  .pcard { transition: all 0.22s !important; }
  .pcard:hover {
    border-color: rgba(232,98,26,0.45) !important;
    transform: translateY(-3px) !important;
    box-shadow: 0 10px 36px rgba(0,0,0,0.5) !important;
  }
  .add-btn:hover:not(:disabled) { background: var(--orange2) !important; }
`;

// ── COMPONENT ─────────────────────────────────────────────────
export default function ShopClient({
  initialProducts   = [],
  availableBrands   = [],
  availableCategories = [],
  initialCategory   = null,
  initialBrand      = null,
  fetchError        = null,
}) {
  // Use server-fetched data if available, fall back to mock
  const rawProducts = initialProducts.length > 0 ? initialProducts : MOCK_PRODUCTS;
  const brands      = availableBrands.length > 0 ? availableBrands : DEFAULT_BRANDS;
  const categories  = availableCategories.length > 0 ? availableCategories : DEFAULT_CATEGORIES;

  // ── Filter state ────────────────────────────────────────────
  const [selCats,   setSelCats]   = useState(initialCategory ? [initialCategory] : []);
  const [selBrands, setSelBrands] = useState(initialBrand    ? [initialBrand]    : []);
  const [minP,      setMinP]      = useState("");
  const [maxP,      setMaxP]      = useState("");
  const [appMin,    setAppMin]    = useState(null);
  const [appMax,    setAppMax]    = useState(null);
  const [stockOnly, setStockOnly] = useState(false);
  // Fitment filter — disabled until Phase 5 ACES data is loaded
  // fitmentIds will be null on all products until vendor sync runs
  const [fitOn,     setFitOn]     = useState(false);
  const [sort,      setSort]      = useState("featured");
  const [view,      setView]      = useState("grid");
  const [cart,      setCart]      = useState(0);

  const toggleCat   = c => setSelCats(p   => p.includes(c) ? p.filter(x=>x!==c) : [...p,c]);
  const toggleBrand = b => setSelBrands(p => p.includes(b) ? p.filter(x=>x!==b) : [...p,b]);
  const clearAll    = () => {
    setSelCats([]); setSelBrands([]);
    setAppMin(null); setAppMax(null);
    setMinP(""); setMaxP("");
    setStockOnly(false);
  };

  // Active filter chips
  const chips = [
    ...selCats.map(c   => ({ t:"cat",   l:c })),
    ...selBrands.map(b => ({ t:"brand", l:b })),
    ...(appMin !== null ? [{ t:"price", l:`$${appMin}+`  }] : []),
    ...(appMax !== null ? [{ t:"price", l:`≤$${appMax}` }] : []),
    ...(stockOnly       ? [{ t:"stock", l:"In Stock"     }] : []),
    ...(fitOn           ? [{ t:"fit",   l:"Fits My Bike" }] : []),
  ];

  const removeChip = f => {
    if (f.t==="cat")   toggleCat(f.l);
    if (f.t==="brand") toggleBrand(f.l);
    if (f.t==="price") { setAppMin(null); setAppMax(null); setMinP(""); setMaxP(""); }
    if (f.t==="stock") setStockOnly(false);
    if (f.t==="fit")   setFitOn(false);
  };

  // ── Filtered + sorted list ──────────────────────────────────
  const products = useMemo(() => {
    let list = [...rawProducts];

    if (selCats.length)   list = list.filter(p => selCats.includes(p.category));
    if (selBrands.length) list = list.filter(p => selBrands.includes(p.brand));
    if (appMin !== null)  list = list.filter(p => p.price >= appMin);
    if (appMax !== null)  list = list.filter(p => p.price <= appMax);
    if (stockOnly)        list = list.filter(p => p.inStock);

    // Fitment filter: only active when fitmentIds are populated (Phase 5+)
    // and user has a saved vehicle
    if (fitOn && SAVED_VEHICLE) {
      list = list.filter(p =>
        // If fitmentIds is null (pre-Phase-5), don't hide the product
        p.fitmentIds === null ||
        p.fitmentIds.includes(SAVED_VEHICLE.id)
      );
    }

    switch (sort) {
      case "price-asc":  list.sort((a,b) => a.price - b.price);                break;
      case "price-desc": list.sort((a,b) => b.price - a.price);                break;
      case "name-asc":   list.sort((a,b) => a.name.localeCompare(b.name));     break;
      case "newest":     list.sort((a,b) => b.id - a.id);                      break;
      default: break;
    }

    return list;
  }, [rawProducts, selCats, selBrands, appMin, appMax, stockOnly, fitOn, sort]);

  // Sidebar counts (react to raw list, not filtered — standard UX pattern)
  const catCounts   = useMemo(() => {
    const c = {};
    rawProducts.forEach(p => { c[p.category] = (c[p.category]||0)+1; });
    return c;
  }, [rawProducts]);

  const brandCounts = useMemo(() => {
    const c = {};
    rawProducts.forEach(p => { c[p.brand] = (c[p.brand]||0)+1; });
    return c;
  }, [rawProducts]);

  // ── Helpers ─────────────────────────────────────────────────
  const S = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });
  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });

  const Toggle = ({ on, onChange }) => (
    <div
      onClick={() => onChange(!on)}
      style={{ width:32, height:18, borderRadius:9, background:on?"#e8621a":"#2a2828",
               position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}
    >
      <div style={{ position:"absolute", top:2, left:on?14:2, width:14, height:14,
                    borderRadius:"50%", background:"#f0ebe3", transition:"left 0.2s" }}/>
    </div>
  );

  return (
    <div style={{ background:"#0a0909", minHeight:"100vh", color:"#f0ebe3",
                  fontFamily:"'Barlow Condensed',sans-serif" }}>
      <style>{css}</style>

      {/* ── NAV ── */}
      <div style={{ position:"sticky", top:0, zIndex:50, background:"rgba(10,9,9,0.96)",
                    borderBottom:"1px solid #2a2828", height:54, display:"flex",
                    alignItems:"center", padding:"0 20px", gap:12, backdropFilter:"blur(10px)" }}>
        <a href="/" style={{ ...B({fontSize:22, letterSpacing:"0.08em"}), textDecoration:"none", color:"#f0ebe3", flex:1 }}>
          STINKIN<span style={{ color:"#e8621a" }}>'</span> SUPPLIES
        </a>
        <div style={{ display:"flex", gap:18, marginRight:12 }}>
          {[["Shop","/shop"],["Brands","/shop?brand="],["Garage","/garage"],["Deals","/shop?badge=sale"]].map(([l,h])=>(
            <a key={l} href={h} style={{ ...S({fontSize:10, letterSpacing:"0.12em"}),
              color: l==="Shop" ? "#e8621a" : "#8a8784", textDecoration:"none" }}>{l}</a>
          ))}
        </div>
        <button style={{ background:"transparent", border:"1px solid rgba(232,98,26,0.3)",
                         color:"#f0ebe3", ...S({fontSize:10, letterSpacing:"0.1em",
                         padding:"5px 12px", borderRadius:2, cursor:"pointer"}) }}>
          SIGN IN
        </button>
        <button
          style={{
            background:"#e8621a", border:"none", color:"#0a0909",
            ...B({ fontSize:13, letterSpacing:"0.1em", padding:"5px 12px", borderRadius:2 }),
            cursor:"pointer"
          }}
          type="button"
          onClick={() => { window.location.href = "/garage"; }}
        >
          MY GARAGE
        </button>
        <div style={{ position:"relative", cursor:"pointer", fontSize:17, userSelect:"none" }}
             onClick={() => {}}>
          🛒
          {cart > 0 && (
            <span style={{ position:"absolute", top:-4, right:-6, background:"#e8621a",
                           color:"#0a0909", ...S({fontSize:7, width:13, height:13,
                           borderRadius:"50%", display:"flex", alignItems:"center",
                           justifyContent:"center"}) }}>{cart}</span>
          )}
        </div>
      </div>

      {/* ── DATA SOURCE INDICATOR (dev only — remove in prod) ── */}
      {process.env.NODE_ENV === "development" && (
        <div style={{ background: initialProducts.length > 0 ? "rgba(34,197,94,0.08)" : "rgba(201,168,76,0.08)",
                      borderBottom: `1px solid ${initialProducts.length > 0 ? "rgba(34,197,94,0.2)" : "rgba(201,168,76,0.2)"}`,
                      padding:"5px 20px", display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%",
                        background: initialProducts.length > 0 ? "#22c55e" : "#c9a84c",
                        boxShadow: `0 0 5px ${initialProducts.length > 0 ? "#22c55e" : "#c9a84c"}` }}/>
          <span style={S({fontSize:9, color: initialProducts.length > 0 ? "#22c55e" : "#c9a84c",
                          letterSpacing:"0.15em"})}>
            {initialProducts.length > 0
              ? `SUPABASE — ${initialProducts.length} PRODUCTS LOADED`
              : fetchError
                ? `SUPABASE ERROR: ${fetchError} — USING MOCK DATA`
                : "MOCK DATA — VENDOR SYNC PENDING (PHASE 5)"}
          </span>
        </div>
      )}

      {/* ── FITMENT BANNER ── */}
      <div style={{ background:"rgba(232,98,26,0.07)", borderBottom:"1px solid rgba(232,98,26,0.2)",
                    padding:"8px 20px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e",
                        boxShadow:"0 0 5px #22c55e" }}/>
          <span style={S({fontSize:10, letterSpacing:"0.12em"})}>
            GARAGE:&nbsp;
            <span style={{ color:"#e8621a" }}>
              {SAVED_VEHICLE.year} {SAVED_VEHICLE.make} {SAVED_VEHICLE.model}
            </span>
            {!fitOn && (
              <span style={{ color:"#8a8784", marginLeft:10 }}>
                — fitment filter off (ACES data pending Phase 5)
              </span>
            )}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={S({fontSize:9, color:"#8a8784", letterSpacing:"0.12em"})}>
            FITS MY BIKE ONLY
          </span>
          <Toggle on={fitOn} onChange={setFitOn}/>
          <button onClick={() => {}} style={{ ...S({fontSize:9, color:"#8a8784",
            letterSpacing:"0.1em"}), background:"none", border:"none", cursor:"pointer",
            transition:"color 0.2s" }}>
            CHANGE ×
          </button>
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div style={{ background:"#111010", borderBottom:"1px solid #2a2828",
                    padding:"8px 20px", display:"flex", alignItems:"center",
                    justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={S({fontSize:10, color:"#8a8784", letterSpacing:"0.1em"})}>
            <span style={{ color:"#e8621a" }}>{products.length}</span> RESULTS
          </span>
          {chips.map((f,i) => (
            <span key={i} onClick={() => removeChip(f)}
              style={S({fontSize:8, background:"rgba(232,98,26,0.1)",
                border:"1px solid rgba(232,98,26,0.25)", borderRadius:2,
                padding:"2px 8px", color:"#e8621a", letterSpacing:"0.1em",
                cursor:"pointer", userSelect:"none"})}>
              {f.l} ×
            </span>
          ))}
          {chips.length > 0 && (
            <button onClick={clearAll}
              style={{ ...S({fontSize:8, letterSpacing:"0.1em", color:"#8a8784"}),
                       background:"none", border:"none", cursor:"pointer" }}>
              CLEAR ALL
            </button>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <select value={sort} onChange={e => setSort(e.target.value)}
            style={{ background:"#1a1919", border:"1px solid #2a2828", color:"#f0ebe3",
                     fontFamily:"'Barlow Condensed',sans-serif", fontSize:13,
                     padding:"5px 9px", borderRadius:2, outline:"none" }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {["grid","list"].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view===v ? "rgba(232,98,26,0.12)" : "#1a1919",
                       border: `1px solid ${view===v?"rgba(232,98,26,0.4)":"#2a2828"}`,
                       color: view===v ? "#e8621a" : "#8a8784",
                       padding:"5px 9px", borderRadius:2, cursor:"pointer", fontSize:13,
                       transition:"all 0.15s" }}>
              {v==="grid" ? "⊞" : "☰"}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display:"grid", gridTemplateColumns:"215px 1fr" }}>

        {/* ── SIDEBAR ── */}
        <div style={{ background:"#111010", borderRight:"1px solid #2a2828",
                      overflowY:"auto", maxHeight:"calc(100vh - 130px)",
                      position:"sticky", top:130, alignSelf:"start" }}>

          {[
            { label:"CATEGORY", items: categories, sel: selCats,   counts: catCounts,   toggle: toggleCat   },
            { label:"BRAND",    items: brands,     sel: selBrands, counts: brandCounts, toggle: toggleBrand },
          ].map(({ label, items, sel, counts, toggle }) => (
            <div key={label}>
              <div style={S({fontSize:9, color:"#e8621a", letterSpacing:"0.2em",
                             padding:"12px 14px 8px", display:"block"})}>{label}</div>
              <div style={{ padding:"0 10px 14px", borderBottom:"1px solid #1a1919" }}>
                {items.map(item => {
                  const on = sel.includes(item);
                  return (
                    <div key={item} className="ph" onClick={() => toggle(item)}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                               padding:"5px 6px", borderRadius:2, cursor:"pointer",
                               background: on?"rgba(232,98,26,0.07)":"transparent",
                               transition:"background 0.15s" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ width:12, height:12, borderRadius:2, flexShrink:0,
                                      border:`1px solid ${on?"#e8621a":"#3a3838"}`,
                                      background: on?"#e8621a":"transparent",
                                      display:"flex", alignItems:"center", justifyContent:"center",
                                      fontSize:8, color:"#0a0909", transition:"all 0.15s" }}>
                          {on?"✓":""}
                        </div>
                        <span style={{ fontSize:12, fontWeight:500,
                                       color: on?"#f0ebe3":"#c4c0bc" }}>{item}</span>
                      </div>
                      <span style={S({fontSize:8, color:"#8a8784"})}>{counts[item]||0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Price range */}
          <div style={S({fontSize:9, color:"#e8621a", letterSpacing:"0.2em",
                         padding:"12px 14px 8px", display:"block"})}>PRICE RANGE</div>
          <div style={{ padding:"0 12px 16px", borderBottom:"1px solid #1a1919" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
              {[["Min $", minP, setMinP], ["Max $", maxP, setMaxP]].map(([ph,val,set]) => (
                <input key={ph} placeholder={ph} value={val} type="number"
                  onChange={e => set(e.target.value)}
                  style={{ background:"#1a1919", border:"1px solid #2a2828", color:"#f0ebe3",
                           fontFamily:"'Barlow Condensed',sans-serif", fontSize:13,
                           padding:"6px 9px", borderRadius:2, outline:"none", width:"100%" }}/>
              ))}
            </div>
            <button onClick={() => { setAppMin(minP?Number(minP):null); setAppMax(maxP?Number(maxP):null); }}
              style={{ width:"100%", background:"#e8621a", border:"none", color:"#0a0909",
                       ...B({fontSize:14, letterSpacing:"0.08em", padding:"7px",
                       borderRadius:2, cursor:"pointer"}) }}>
              APPLY
            </button>
          </div>

          {/* Availability */}
          <div style={S({fontSize:9, color:"#e8621a", letterSpacing:"0.2em",
                         padding:"12px 14px 8px", display:"block"})}>AVAILABILITY</div>
          <div style={{ padding:"4px 16px 16px", display:"flex", alignItems:"center",
                        justifyContent:"space-between" }}>
            <span style={{ fontSize:13, fontWeight:500, color:"#c4c0bc" }}>In Stock Only</span>
            <Toggle on={stockOnly} onChange={setStockOnly}/>
          </div>

        </div>

        {/* ── PRODUCT GRID ── */}
        <div style={{ padding:"18px 20px" }}>
          {products.length === 0 ? (
            <div style={{ padding:"80px 20px", textAlign:"center" }}>
              <div style={B({fontSize:30, letterSpacing:"0.05em", color:"#3a3838", marginBottom:8})}>
                NO PARTS FOUND
              </div>
              <div style={S({fontSize:9, color:"#8a8784", letterSpacing:"0.15em"})}>
                TRY ADJUSTING YOUR FILTERS
              </div>
            </div>
          ) : (
            <div style={{
              display:"grid",
              gridTemplateColumns: view==="list" ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))",
              gap:12,
            }}>
              {products.map((p, i) => (
                <div key={p.id} className="pcard"
                  onClick={() => window.location.href = `/shop/${p.slug}`}
                  style={{
                    background:"#111010", border:"1px solid #2a2828", borderRadius:2,
                    overflow:"hidden", cursor:"pointer",
                    opacity: p.inStock ? 1 : 0.5,
                    display: view==="list" ? "grid" : "block",
                    gridTemplateColumns: view==="list" ? "140px 1fr" : "unset",
                    animation: `fadeUp 0.3s ease ${i*0.03}s both`,
                  }}>

                  {/* Image */}
                  <div style={{ width:"100%",
                    aspectRatio: view==="list" ? "unset" : "4/3",
                    minHeight: view==="list" ? 100 : 0,
                    background:"#1a1919", display:"flex", alignItems:"center",
                    justifyContent:"center", position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", inset:0,
                      backgroundImage:"linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px)",
                      backgroundSize:"16px 16px" }}/>
                    {p.image
                      ? <img src={p.image} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                      : <span style={S({fontSize:8, color:"#3a3838", letterSpacing:"0.1em"})}>NO IMAGE</span>
                    }
                    {p.badge && (
                      <span style={{ position:"absolute", top:7, left:7,
                        ...S({fontSize:7, fontWeight:700, letterSpacing:"0.1em",
                          padding:"2px 6px", borderRadius:1}),
                        background: p.badge==="sale" ? "#b91c1c" : "#c9a84c",
                        color: p.badge==="sale" ? "#fff" : "#0a0909" }}>
                        {p.badge.toUpperCase()}
                      </span>
                    )}
                    {fitOn && p.fitmentIds !== null && (
                      <span style={{ position:"absolute", top:7, right:7,
                        ...S({fontSize:7, color:"#22c55e", letterSpacing:"0.08em",
                          background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)",
                          padding:"2px 5px", borderRadius:1}) }}>
                        ✓ FITS
                      </span>
                    )}
                    {!p.inStock && (
                      <span style={{ position:"absolute", bottom:7, left:7,
                        ...S({fontSize:7, color:"#8a8784", letterSpacing:"0.1em",
                          background:"rgba(0,0,0,0.65)", padding:"2px 6px", borderRadius:1}) }}>
                        OUT OF STOCK
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div style={{ padding:"11px 13px",
                    display: view==="list" ? "flex" : "block",
                    alignItems: view==="list" ? "center" : undefined,
                    gap: view==="list" ? 16 : undefined,
                    flex: view==="list" ? 1 : undefined }}>
                    <div style={{ flex: view==="list" ? 1 : undefined }}>
                      <div style={S({fontSize:9, color:"#e8621a", letterSpacing:"0.14em", marginBottom:3})}>
                        {p.brand}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#f0ebe3",
                                    lineHeight:1.3, marginBottom: view==="list"?0:9 }}>
                        {p.name}
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"center",
                      flexDirection: view==="list" ? "column" : undefined,
                      gap: view==="list" ? 6 : undefined,
                      alignSelf: view==="list" ? "center" : undefined }}>
                      <div>
                        {p.was && (
                          <div style={{ fontSize:11, color:"#8a8784", textDecoration:"line-through",
                                        fontFamily:"'Barlow Condensed',sans-serif" }}>
                            ${p.was.toFixed(2)}
                          </div>
                        )}
                        <div style={B({fontSize:20, color:"#f0ebe3", letterSpacing:"0.04em", lineHeight:1})}>
                          ${p.price.toFixed(2)}
                        </div>
                      </div>
                      <button
                        className="add-btn"
                        disabled={!p.inStock}
                        onClick={e => {
                          e.stopPropagation();
                          if (p.inStock) {
                            setCart(c => c+1);
                            // TODO Phase 2: db.getOrCreateCart() → upsert cart_item
                          }
                        }}
                        style={{ background: p.inStock ? "#e8621a" : "#2a2828",
                                 border:"none",
                                 color: p.inStock ? "#0a0909" : "#8a8784",
                                 ...B({fontSize:13, letterSpacing:"0.1em",
                                 padding:"5px 12px", borderRadius:2,
                                 cursor: p.inStock ? "pointer" : "not-allowed",
                                 transition:"background 0.2s"}) }}>
                        {p.inStock ? "ADD" : "OOS"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
