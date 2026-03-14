"use client";
// ============================================================
// app/page.tsx  (or app/page.jsx)
// Stinkin' Supplies — Homepage
//
// SVG ICON SETUP:
//   Copy your SVG files to: /public/icons/
//   Required filenames:
//     /public/icons/engine.svg
//     /public/icons/brakes-wheels.svg
//     /public/icons/fender_frame.svg
//     /public/icons/handlebar.svg
//     /public/icons/lighting-electrical.svg
//     /public/icons/tires.svg
//     /public/icons/exhaust.svg        ← still need this one
//     /public/icons/seats.svg          ← still need this one
//
// CSS FILTER EXPLANATION:
//   Your SVGs are black fills on transparent background.
//   On dark cards they'd be invisible without treatment.
//
//   Default (rest state):
//     brightness(0) invert(1) → black → white
//     opacity(0.45)           → white at 45% = chrome grey on dark bg
//
//   Hover state:
//     brightness(0) invert(1)           → black → white
//     sepia(1) saturate(8)              → warm yellow-orange
//     hue-rotate(335deg) brightness(1.1) → shift to #e8621a orange
//
// ============================================================

import { useState } from "react";

const style = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --black:#0a0909; --coal:#111010; --iron:#1a1919; --steel:#2a2828;
    --chrome:#8a8784; --cream:#f0ebe3; --orange:#e8621a; --orange2:#c94f0f;
    --gold:#c9a84c; --red:#b91c1c;
  }
  html { scroll-behavior: smooth; }
  body { background:var(--black); color:var(--cream); font-family:'Barlow Condensed',sans-serif; overflow-x:hidden; }
  body::before {
    content:''; position:fixed; inset:0;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events:none; z-index:9999; opacity:0.35;
  }
  .mono { font-family:'Share Tech Mono',monospace; }
  .display { font-family:'Bebas Neue',sans-serif; }

  /* NAV */
  nav { position:fixed; top:0; left:0; right:0; z-index:100; background:rgba(10,9,9,0.94); backdrop-filter:blur(12px); border-bottom:1px solid rgba(232,98,26,0.15); height:64px; display:flex; align-items:center; padding:0 32px; }
  .nav-logo { font-family:'Bebas Neue',sans-serif; font-size:26px; color:var(--cream); letter-spacing:0.08em; flex:1; }
  .nav-logo span { color:var(--orange); }
  .nav-links { display:flex; gap:28px; list-style:none; margin-right:32px; }
  .nav-links a { font-size:13px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--chrome); text-decoration:none; transition:color 0.2s; }
  .nav-links a:hover { color:var(--orange); }
  .nav-actions { display:flex; gap:12px; align-items:center; }
  .nav-btn { background:transparent; border:1px solid rgba(232,98,26,0.3); color:var(--cream); font-family:'Barlow Condensed',sans-serif; font-size:12px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; padding:7px 16px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
  .nav-btn:hover { background:rgba(232,98,26,0.1); border-color:var(--orange); }
  .nav-btn.primary { background:var(--orange); border-color:var(--orange); color:var(--black); }
  .cart-icon { position:relative; cursor:pointer; color:var(--cream); font-size:20px; }
  .cart-badge { position:absolute; top:-6px; right:-8px; background:var(--orange); color:var(--black); font-family:'Share Tech Mono',monospace; font-size:9px; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }

  /* PROMO */
  .promo-banner { background:linear-gradient(90deg,var(--orange2),var(--orange),var(--gold),var(--orange)); background-size:300% 100%; animation:shimmerBg 6s ease infinite; padding:12px 32px; text-align:center; }
  @keyframes shimmerBg { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
  .promo-text { font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:0.12em; color:var(--black); }
  .promo-code { background:rgba(0,0,0,0.2); padding:2px 10px; border-radius:2px; margin-left:8px; }

  /* HERO */
  .hero { min-height:100vh; padding-top:64px; background:var(--black); position:relative; display:flex; align-items:center; overflow:hidden; }
  .hero-bg { position:absolute; inset:0; background-image:linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px); background-size:48px 48px; }
  .hero-inner { position:relative; z-index:2; max-width:1200px; margin:0 auto; padding:80px 32px; display:grid; grid-template-columns:1fr 1fr; gap:60px; align-items:center; width:100%; }
  .hero-eyebrow { font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:0.25em; color:var(--orange); margin-bottom:16px; display:flex; align-items:center; gap:12px; }
  .hero-eyebrow::before { content:''; width:32px; height:1px; background:var(--orange); }
  .hero-title { font-family:'Bebas Neue',sans-serif; font-size:clamp(64px,8vw,108px); line-height:0.92; color:var(--cream); letter-spacing:0.02em; margin-bottom:24px; }
  .hero-title .accent { color:var(--orange); }
  .hero-title .outline { -webkit-text-stroke:1px var(--chrome); color:transparent; }
  .hero-sub { font-size:16px; font-weight:500; color:var(--chrome); line-height:1.5; max-width:480px; margin-bottom:36px; }
  .hero-actions { display:flex; gap:14px; flex-wrap:wrap; }
  .btn-primary { background:var(--orange); border:none; color:var(--black); font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:0.1em; padding:14px 36px; border-radius:2px; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 32px rgba(232,98,26,0.3); }
  .btn-primary:hover { background:var(--orange2); transform:translateY(-1px); }
  .btn-outline { background:transparent; border:1px solid var(--steel); color:var(--cream); font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:0.1em; padding:14px 36px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
  .btn-outline:hover { border-color:var(--orange); color:var(--orange); }

  /* FITMENT WIDGET */
  .hero-garage { background:rgba(26,25,25,0.88); border:1px solid rgba(232,98,26,0.2); border-radius:4px; padding:28px; backdrop-filter:blur(8px); position:relative; }
  .hero-garage::before { content:'FITMENT FINDER'; position:absolute; top:-1px; left:24px; background:var(--orange); color:var(--black); font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:0.2em; padding:3px 10px; }
  .garage-title { font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:0.05em; color:var(--cream); margin-bottom:6px; margin-top:12px; }
  .garage-sub { font-size:13px; color:var(--chrome); margin-bottom:22px; }
  .garage-selects { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
  .g-select { background:var(--coal); border:1px solid var(--steel); color:var(--cream); font-family:'Barlow Condensed',sans-serif; font-size:14px; font-weight:500; padding:10px 12px; border-radius:2px; outline:none; appearance:none; cursor:pointer; transition:border-color 0.2s; width:100%; }
  .g-select:focus { border-color:var(--orange); }
  .g-select:disabled { opacity:0.4; }
  .garage-submit { width:100%; margin-top:14px; background:var(--orange); border:none; color:var(--black); font-family:'Bebas Neue',sans-serif; font-size:20px; letter-spacing:0.1em; padding:13px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
  .garage-submit:hover { background:var(--orange2); }
  .garage-submit:disabled { opacity:0.4; cursor:not-allowed; }
  .garage-saved { margin-top:16px; padding:12px; background:rgba(232,98,26,0.06); border:1px solid rgba(232,98,26,0.15); border-radius:2px; }
  .garage-saved-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:var(--orange); letter-spacing:0.15em; display:block; margin-bottom:3px; }
  .garage-saved-bike { font-size:14px; font-weight:700; color:var(--cream); }

  /* STATS */
  .stats-bar { background:var(--iron); border-top:1px solid var(--steel); border-bottom:1px solid var(--steel); padding:20px 32px; }
  .stats-inner { max-width:1200px; margin:0 auto; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; }
  .stat { text-align:center; }
  .stat-num { font-family:'Bebas Neue',sans-serif; font-size:32px; color:var(--orange); letter-spacing:0.05em; line-height:1; }
  .stat-label { font-family:'Share Tech Mono',monospace; font-size:9px; color:var(--chrome); letter-spacing:0.18em; margin-top:4px; }
  .stat-divider { width:1px; height:40px; background:var(--steel); }

  /* SECTIONS */
  .section { padding:72px 32px; max-width:1200px; margin:0 auto; }
  .section-head { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:36px; border-bottom:1px solid var(--steel); padding-bottom:16px; }
  .section-title { font-family:'Bebas Neue',sans-serif; font-size:42px; letter-spacing:0.05em; color:var(--cream); }
  .section-title span { color:var(--orange); }
  .section-eyebrow { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--orange); letter-spacing:0.2em; margin-bottom:8px; }
  .section-link { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--chrome); letter-spacing:0.15em; text-transform:uppercase; cursor:pointer; transition:color 0.2s; }
  .section-link:hover { color:var(--orange); }

  /* PRODUCTS */
  .products-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
  .product-card { background:var(--coal); border:1px solid var(--steel); border-radius:2px; overflow:hidden; cursor:pointer; transition:all 0.25s; }
  .product-card:hover { border-color:rgba(232,98,26,0.4); transform:translateY(-3px); box-shadow:0 12px 40px rgba(0,0,0,0.4); }
  .product-img { width:100%; aspect-ratio:4/3; background:var(--iron); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
  .product-img::before { content:''; position:absolute; inset:0; background-image:linear-gradient(rgba(232,98,26,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.05) 1px,transparent 1px); background-size:20px 20px; }
  .product-img-placeholder { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--steel); letter-spacing:0.15em; }
  .product-badge { position:absolute; top:10px; left:10px; background:var(--orange); color:var(--black); font-family:'Share Tech Mono',monospace; font-size:9px; font-weight:700; letter-spacing:0.1em; padding:3px 8px; border-radius:1px; }
  .product-badge.sale { background:var(--red); color:white; }
  .product-badge.new { background:var(--gold); color:var(--black); }
  .product-body { padding:14px 16px; }
  .product-brand { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--orange); letter-spacing:0.15em; margin-bottom:5px; }
  .product-name { font-size:15px; font-weight:700; color:var(--cream); line-height:1.3; margin-bottom:10px; }
  .product-footer { display:flex; justify-content:space-between; align-items:center; }
  .product-price { font-family:'Bebas Neue',sans-serif; font-size:22px; color:var(--cream); letter-spacing:0.05em; }
  .product-price .was { font-size:13px; color:var(--chrome); text-decoration:line-through; margin-right:6px; font-family:'Barlow Condensed',sans-serif; }
  .product-add { background:var(--orange); border:none; color:var(--black); font-family:'Bebas Neue',sans-serif; font-size:14px; letter-spacing:0.1em; padding:7px 14px; border-radius:2px; cursor:pointer; transition:all 0.2s; }
  .product-add:hover { background:var(--orange2); }
  .product-fits { font-family:'Share Tech Mono',monospace; font-size:9px; color:#22c55e; letter-spacing:0.1em; margin-top:8px; }

  /* ── CATEGORY CARDS WITH REAL SVG ICONS ── */
  .categories-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:2px; }

  .cat-card {
    background:var(--iron); border:1px solid var(--steel);
    padding:32px 16px 24px; cursor:pointer; transition:all 0.3s;
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; align-items:center; gap:16px; text-align:center;
  }
  /* Blueprint grid fades in on hover */
  .cat-card::after {
    content:''; position:absolute; inset:0;
    background-image:
      linear-gradient(rgba(232,98,26,0.05) 1px,transparent 1px),
      linear-gradient(90deg,rgba(232,98,26,0.05) 1px,transparent 1px);
    background-size:22px 22px; pointer-events:none;
    opacity:0; transition:opacity 0.3s;
  }
  .cat-card:hover::after { opacity:1; }
  /* Engineering corner brackets */
  .bracket-tl, .bracket-br {
    position:absolute; width:14px; height:14px;
    opacity:0; transition:opacity 0.3s;
  }
  .bracket-tl { top:7px; left:7px; border-top:1px solid var(--orange); border-left:1px solid var(--orange); }
  .bracket-br { bottom:7px; right:7px; border-bottom:1px solid var(--orange); border-right:1px solid var(--orange); }
  .cat-card:hover .bracket-tl,
  .cat-card:hover .bracket-br { opacity:1; }
  .cat-card:hover { background:rgba(232,98,26,0.05); border-color:rgba(232,98,26,0.35); }

  /* ── THE MAGIC: CSS filter colorizes black SVGs ── */
  .cat-icon-wrap {
    width:80px; height:80px;
    display:flex; align-items:center; justify-content:center;
    position:relative; z-index:1;
    transition:transform 0.3s;
  }
  .cat-card:hover .cat-icon-wrap { transform:scale(1.08); }

  .cat-icon-img {
    width:100%; height:100%;
    object-fit:contain;
    /*
      Your SVGs: black fills on transparent background.
      Step 1 — brightness(0): force everything to pure black
      Step 2 — invert(1): black → white (now visible on dark bg)
      Step 3 — opacity 45%: white at 45% = chrome grey appearance
    */
    filter: brightness(0) invert(1) opacity(0.45);
    transition: filter 0.3s ease;
  }

  .cat-card:hover .cat-icon-img {
    /*
      On hover: shift from white to orange (#e8621a)
      sepia(1)         → warm brownish base
      saturate(8)      → pump color intensity
      hue-rotate(335deg) → rotate hue to orange range
      brightness(1.1)  → slight brightness boost
    */
    filter: brightness(0) invert(1) sepia(1) saturate(8) hue-rotate(335deg) brightness(1.1);
    /* Glow matches the orange */
    drop-shadow: 0 0 8px rgba(232,98,26,0.6);
  }

  .cat-info { position:relative; z-index:1; }
  .cat-name { font-family:'Bebas Neue',sans-serif; font-size:16px; letter-spacing:0.07em; color:var(--cream); line-height:1.15; margin-bottom:5px; }
  .cat-count { font-family:'Share Tech Mono',monospace; font-size:9px; color:var(--chrome); letter-spacing:0.12em; }

  /* BRANDS */
  .brands-grid { display:flex; flex-wrap:wrap; gap:10px; }
  .brand-pill { background:var(--iron); border:1px solid var(--steel); border-radius:2px; padding:12px 24px; cursor:pointer; transition:all 0.2s; font-family:'Bebas Neue',sans-serif; font-size:17px; letter-spacing:0.08em; color:var(--chrome); }
  .brand-pill:hover { border-color:var(--orange); color:var(--cream); background:rgba(232,98,26,0.05); }
  .brand-pill.featured { border-color:rgba(232,98,26,0.3); color:var(--cream); }

  /* RECENTLY VIEWED */
  .recently-strip { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; }
  .recently-strip::-webkit-scrollbar { height:3px; }
  .recently-strip::-webkit-scrollbar-thumb { background:var(--orange); }
  .recent-card { flex:0 0 160px; background:var(--coal); border:1px solid var(--steel); border-radius:2px; overflow:hidden; cursor:pointer; transition:border-color 0.2s; }
  .recent-card:hover { border-color:rgba(232,98,26,0.4); }
  .recent-img { width:100%; aspect-ratio:1; background:var(--iron); display:flex; align-items:center; justify-content:center; }
  .recent-body { padding:10px; }
  .recent-name { font-size:12px; font-weight:600; color:var(--cream); margin-bottom:4px; line-height:1.3; }
  .recent-price { font-family:'Bebas Neue',sans-serif; font-size:16px; color:var(--orange); }

  /* FOOTER */
  footer { background:var(--coal); border-top:1px solid var(--steel); padding:48px 32px 24px; margin-top:48px; }
  .footer-inner { max-width:1200px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:40px; margin-bottom:40px; }
  .footer-brand-name { font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:0.08em; color:var(--cream); margin-bottom:12px; }
  .footer-brand-name span { color:var(--orange); }
  .footer-desc { font-size:13px; color:var(--chrome); line-height:1.6; max-width:280px; }
  .footer-col-title { font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:0.2em; color:var(--orange); margin-bottom:14px; }
  .footer-links { list-style:none; display:flex; flex-direction:column; gap:8px; }
  .footer-links a { font-size:13px; color:var(--chrome); text-decoration:none; transition:color 0.2s; cursor:pointer; }
  .footer-links a:hover { color:var(--cream); }
  .footer-bottom { max-width:1200px; margin:0 auto; border-top:1px solid var(--steel); padding-top:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
  .footer-copy { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--chrome); letter-spacing:0.1em; }
  .map-badge { font-family:'Share Tech Mono',monospace; font-size:9px; color:var(--chrome); letter-spacing:0.1em; border:1px solid var(--steel); padding:4px 10px; border-radius:2px; }

  @media (max-width:900px) {
    .categories-grid { grid-template-columns:repeat(2,1fr); }
    .hero-inner { grid-template-columns:1fr; }
    .footer-inner { grid-template-columns:1fr 1fr; }
    .nav-links { display:none; }
  }
`;

// ── CATEGORY CONFIG ──────────────────────────────────────────
// icon: path relative to /public/ in your Next.js project
// For the 2 you haven't made yet (exhaust, seats), we fall back
// to a placeholder until you supply those SVGs.

const CATEGORIES = [
  { name: "Engine & Performance",    count: "4,820 parts", icon: "/icons/engine.svg"              },
  { name: "Exhaust Systems",         count: "2,140 parts", icon: "/icons/exhaust.svg"             },
  { name: "Lighting & Electrical",   count: "3,560 parts", icon: "/icons/lighting-electrical.svg" },
  { name: "Body & Fenders",          count: "1,890 parts", icon: "/icons/fender_frame.svg"        },
  { name: "Seats & Comfort",         count: "980 parts",   icon: "/icons/seats.svg"               },
  { name: "Brakes & Wheels",         count: "2,340 parts", icon: "/icons/brakes-wheels.svg"       },
  { name: "Handlebars & Controls",   count: "1,670 parts", icon: "/icons/handlebar.svg"           },
  { name: "Tires & Tubes",           count: "890 parts",   icon: "/icons/tires.svg"               },
];

// ── MOCK DATA ────────────────────────────────────────────────
const YEARS = Array.from({length:30},(_,i)=>2025-i);
const MAKES = ["Harley-Davidson","Indian","Honda","Yamaha","Kawasaki","Suzuki","BMW","KTM","Ducati","Triumph"];
const MODELS = {
  "Harley-Davidson":["Road King","Street Glide","Fat Boy","Sportster S","Road Glide","Softail Slim","Fat Bob","Low Rider"],
  "Indian":["Chief","Scout","Challenger","Springfield","Pursuit"],
  "Honda":["Gold Wing","Shadow","Rebel 500","CBR1000RR","Africa Twin"],
  "Yamaha":["V-Star 1300","Bolt","YZF-R1","MT-09","Ténéré 700"],
  "Kawasaki":["Vulcan 1700","Ninja ZX-10R","Z900","Versys 650"],
  "Suzuki":["Boulevard M109R","GSX-R1000","V-Strom 1050"],
  "BMW":["R 1250 GS","S 1000 RR","R 18"],
  "KTM":["1290 Super Adventure","890 Duke","450 SX-F"],
  "Ducati":["Panigale V4","Monster","Multistrada V4"],
  "Triumph":["Bonneville T120","Tiger 1200","Speed Triple"],
};
const PRODUCTS = [
  {id:1,brand:"Screamin Eagle",  name:"Stage IV High Torque Kit",          price:849.99,was:999.99,badge:"sale",fits:true },
  {id:2,brand:"Vance & Hines",   name:"Pro Pipe Chrome Exhaust System",    price:524.95,badge:"new",              fits:true },
  {id:3,brand:"Arlen Ness",      name:"Beveled Air Cleaner Kit — Chrome",  price:189.95,                          fits:false},
  {id:4,brand:"Drag Specialties",name:"Saddlemen Road Sofa Seat",          price:379.99,was:429.99,badge:"sale",  fits:true },
  {id:5,brand:"Roland Sands",    name:"Clarity Derby Cover — Contrast Cut",price:145.00,                          fits:false},
  {id:6,brand:"Kuryakyn",        name:"Hypercharger ES Air Intake",        price:264.95,badge:"new",              fits:true },
  {id:7,brand:"WPS",             name:"Rechargeable Lithium Battery 12V",  price:139.95,                          fits:false},
  {id:8,brand:"Progressive",     name:"412 Series Shocks — Chrome",        price:299.95,                          fits:true },
];
const BRANDS = [
  {name:"Harley-Davidson",f:true},{name:"Screamin Eagle",f:true},
  {name:"Vance & Hines",f:true},{name:"Roland Sands",f:true},
  {name:"Arlen Ness",f:false},{name:"Kuryakyn",f:false},
  {name:"Drag Specialties",f:false},{name:"Progressive",f:false},
  {name:"S&S Cycle",f:false},{name:"Rinehart",f:false},
  {name:"Cobra",f:false},{name:"Samson",f:false},
];
const RECENT = [
  {id:1,name:"Softail Slim Handlebars",price:189.95},
  {id:2,name:'LED Headlight Bucket 7"',price:124.99},
  {id:3,name:"Sissy Bar Upright",price:89.95},
  {id:4,name:"Brake Lever Set Chrome",price:64.95},
  {id:5,name:"Footpeg Mount Kit",price:44.95},
];

function ProductCard({p, bike}) {
  return (
    <div className="product-card">
      <div className="product-img">
        <span className="product-img-placeholder mono">NO IMAGE</span>
        {p.badge && <span className={`product-badge ${p.badge}`}>{p.badge.toUpperCase()}</span>}
      </div>
      <div className="product-body">
        <div className="product-brand">{p.brand}</div>
        <div className="product-name">{p.name}</div>
        {bike && p.fits && <div className="product-fits mono">✓ FITS YOUR {bike.year} {bike.make}</div>}
        <div className="product-footer">
          <div className="product-price">
            {p.was && <span className="was">${p.was}</span>}
            ${p.price.toFixed(2)}
          </div>
          <button className="product-add">ADD</button>
        </div>
      </div>
    </div>
  );
}

// Category card — uses real SVG from /public/icons/
function CategoryCard({cat}) {
  return (
    <div className="cat-card">
      <div className="bracket-tl"/>
      <div className="bracket-br"/>
      <div className="cat-icon-wrap">
        <img
          src={cat.icon}
          alt={cat.name}
          className="cat-icon-img"
          // Fallback: if SVG not found yet, show nothing gracefully
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        />
      </div>
      <div className="cat-info">
        <div className="cat-name display">{cat.name}</div>
        <div className="cat-count mono">{cat.count}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [year,setYear]   = useState("");
  const [make,setMake]   = useState("");
  const [model,setModel] = useState("");
  const [bike,setBike]   = useState(null);
  const models = make ? (MODELS[make] || []) : [];

  return (
    <>
      <style>{style}</style>

      {/* NAV */}
      <nav>
        <div className="nav-logo display">STINKIN<span>'</span> SUPPLIES</div>
        <ul className="nav-links">
          {["Shop","Brands","Garage","Deals","About"].map(l=>(
            <li key={l}><a href="#">{l}</a></li>
          ))}
        </ul>
        <div className="nav-actions">
          <button className="nav-btn">Sign In</button>
          <button className="nav-btn primary">My Garage</button>
          <div className="cart-icon">🛒<span className="cart-badge">2</span></div>
        </div>
      </nav>

      {/* PROMO BANNER */}
      <div className="promo-banner" style={{marginTop:64}}>
        <span className="promo-text">
          FREE SHIPPING ON ORDERS OVER $99 — USE CODE
          <span className="promo-code">RIDE99</span>
          &nbsp;· EARN POINTS ON EVERY ORDER
        </span>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg"/>
        <div className="hero-inner">
          <div>
            <div className="hero-eyebrow mono">Est. Parts & Accessories</div>
            <h1 className="hero-title display">
              BUILT<br/>
              <span className="accent">HARD.</span><br/>
              <span className="outline">RIDES</span><br/>
              HARDER.
            </h1>
            <p className="hero-sub">
              Premium powersports parts for cruisers, choppers, and performance builds.
              MAP-compliant pricing. Ships from multiple warehouses.
            </p>
            <div className="hero-actions">
              <button className="btn-primary display">SHOP ALL PARTS</button>
              <button className="btn-outline display">VIEW DEALS</button>
            </div>
          </div>
          <div>
            <div className="hero-garage">
              <div className="garage-title display">FIND PARTS FOR YOUR BIKE</div>
              <div className="garage-sub">Select your ride to filter parts that fit</div>
              <div className="garage-selects">
                <select className="g-select" value={year} onChange={e=>{setYear(e.target.value);setMake("");setModel("");}}>
                  <option value="">Year</option>
                  {YEARS.map(y=><option key={y}>{y}</option>)}
                </select>
                <select className="g-select" value={make} onChange={e=>{setMake(e.target.value);setModel("");}} disabled={!year}>
                  <option value="">Make</option>
                  {MAKES.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="garage-selects">
                <select className="g-select" value={model} onChange={e=>setModel(e.target.value)} disabled={!make} style={{gridColumn:"1/-1"}}>
                  <option value="">Model</option>
                  {models.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <button
                className="garage-submit display"
                onClick={()=>{ if(year&&make&&model) setBike({year,make,model}); }}
                disabled={!year||!make||!model}
              >
                FIND MY PARTS →
              </button>
              {bike && (
                <div className="garage-saved">
                  <span className="garage-saved-label mono">PRIMARY VEHICLE</span>
                  <div className="garage-saved-bike">{bike.year} {bike.make} {bike.model}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <div className="stats-bar">
        <div className="stats-inner">
          {[["500K+","Parts In Stock"],["150+","Top Brands"],["99%","Ship Rate"],["4.9★","Avg Rating"],["$0","Over $99"],["10×","Points Earned"]].map(([n,l],i,a)=>(
            <span key={i} style={{display:"contents"}}>
              <div className="stat">
                <div className="stat-num display">{n}</div>
                <div className="stat-label mono">{l}</div>
              </div>
              {i < a.length-1 && <div className="stat-divider"/>}
            </span>
          ))}
        </div>
      </div>

      {/* FEATURED PRODUCTS */}
      <div style={{background:"var(--black)",borderBottom:"1px solid var(--steel)"}}>
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow mono">Top Sellers This Week</div>
              <div className="section-title display">FEATURED <span>PARTS</span></div>
            </div>
            <span className="section-link mono">VIEW ALL →</span>
          </div>
          <div className="products-grid">
            {PRODUCTS.map(p=><ProductCard key={p.id} p={p} bike={bike}/>)}
          </div>
        </div>
      </div>

      {/* CATEGORIES — YOUR SVG ICONS */}
      <div style={{background:"var(--coal)",borderBottom:"1px solid var(--steel)"}}>
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow mono">Browse The Catalog</div>
              <div className="section-title display">SHOP BY <span>CATEGORY</span></div>
            </div>
            <span className="section-link mono">ALL CATEGORIES →</span>
          </div>
          <div className="categories-grid">
            {CATEGORIES.map((c,i)=><CategoryCard key={i} cat={c}/>)}
          </div>
        </div>
      </div>

      {/* BRANDS */}
      <div style={{background:"var(--black)",borderBottom:"1px solid var(--steel)"}}>
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow mono">Top Manufacturers</div>
              <div className="section-title display">SHOP BY <span>BRAND</span></div>
            </div>
            <span className="section-link mono">ALL BRANDS →</span>
          </div>
          <div className="brands-grid">
            {BRANDS.map((b,i)=>(
              <div key={i} className={`brand-pill${b.f?" featured":""}`}>{b.name}</div>
            ))}
          </div>
        </div>
      </div>

      {/* RECENTLY VIEWED */}
      <div style={{background:"var(--iron)",borderBottom:"1px solid var(--steel)"}}>
        <div className="section" style={{paddingBottom:48}}>
          <div className="section-head">
            <div>
              <div className="section-eyebrow mono">Your History</div>
              <div className="section-title display">RECENTLY <span>VIEWED</span></div>
            </div>
            <span className="section-link mono">CLEAR →</span>
          </div>
          <div className="recently-strip">
            {RECENT.map(p=>(
              <div key={p.id} className="recent-card">
                <div className="recent-img">
                  <span style={{fontSize:10,color:"var(--steel)",fontFamily:"monospace"}}>IMG</span>
                </div>
                <div className="recent-body">
                  <div className="recent-name">{p.name}</div>
                  <div className="recent-price display">${p.price}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div>
            <div className="footer-brand-name display">STINKIN<span>'</span> SUPPLIES</div>
            <p className="footer-desc">Premium powersports parts and accessories. MAP-compliant pricing, fast fulfillment, and a loyalty program that rewards every ride.</p>
          </div>
          <div>
            <div className="footer-col-title mono">Shop</div>
            <ul className="footer-links">
              {["All Parts","New Arrivals","Deals & Clearance","Brands","Gift Cards"].map(l=><li key={l}><a href="#">{l}</a></li>)}
            </ul>
          </div>
          <div>
            <div className="footer-col-title mono">Account</div>
            <ul className="footer-links">
              {["My Garage","Order History","Points & Rewards","Wishlist","Sign In"].map(l=><li key={l}><a href="#">{l}</a></li>)}
            </ul>
          </div>
          <div>
            <div className="footer-col-title mono">Support</div>
            <ul className="footer-links">
              {["Shipping Info","Returns","Track Order","Contact Us","FAQ"].map(l=><li key={l}><a href="#">{l}</a></li>)}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copy mono">© 2026 STINKIN' SUPPLIES. ALL RIGHTS RESERVED.</span>
          <span className="map-badge mono">MAP COMPLIANT PRICING</span>
        </div>
      </footer>
    </>
  );
}
