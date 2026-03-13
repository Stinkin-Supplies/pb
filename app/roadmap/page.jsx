import { useState } from "react";

const phases = [
  {
    id: 1, label: "PHASE 1", title: "Foundation", status: "complete", color: "#22c55e",
    items: [
      { name: "Hetzner VPS provisioned", done: true },
      { name: "Redis + Typesense running", done: true },
      { name: "Supabase schema deployed", done: true },
      { name: "Next.js on Vercel", done: true },
      { name: "Homepage (app/page.jsx)", done: true },
    ]
  },
  {
    id: 2, label: "PHASE 2", title: "Storefront Core", status: "current", color: "#e8621a",
    items: [
      { name: "Product listing page /shop", done: false, note: "Grid, filters, fitment toggle", file: "app/shop/page.jsx" },
      { name: "Product detail page /shop/[slug]", done: false, note: "Images, fitment check, add to cart", file: "app/shop/[slug]/page.jsx" },
      { name: "Cart drawer", done: false, note: "Slide-in, line items, points preview, MAP floor", file: "components/CartDrawer.jsx" },
      { name: "Category pages /shop/[category]", done: false, note: "Filtered grid from Supabase", file: "app/shop/[category]/page.jsx" },
      { name: "Search page /search", done: false, note: "Typesense powered, faceted filters", file: "app/search/page.jsx" },
    ]
  },
  {
    id: 3, label: "PHASE 3", title: "Auth & Garage", status: "upcoming", color: "#c9a84c",
    items: [
      { name: "Sign in / Sign up /auth", done: false, note: "Supabase Auth, magic link + email", file: "app/auth/page.jsx" },
      { name: "My Garage page /garage", done: false, note: "YMM selector, saved bikes, blueprint SVGs", file: "app/garage/page.jsx" },
      { name: "Account page /account", done: false, note: "Profile, addresses, preferences", file: "app/account/page.jsx" },
      { name: "Points & Rewards /account/points", done: false, note: "Balance, ledger history, expiry", file: "app/account/points/page.jsx" },
      { name: "Wishlist /account/wishlist", done: false, note: "Saved products, in-stock alerts", file: "app/account/wishlist/page.jsx" },
    ]
  },
  {
    id: 4, label: "PHASE 4", title: "Checkout & Payments", status: "upcoming", color: "#c9a84c",
    items: [
      { name: "Checkout flow /checkout", done: false, note: "Address, shipping, points redemption", file: "app/checkout/page.jsx" },
      { name: "Stripe integration", done: false, note: "Payment intent, webhook handler", file: "app/api/webhooks/stripe/route.ts" },
      { name: "Order confirmation /order/[id]", done: false, note: "Summary, timeline, tracking", file: "app/order/[id]/page.jsx" },
      { name: "Order history /account/orders", done: false, note: "List + detail view", file: "app/account/orders/page.jsx" },
      { name: "MAP enforcement at checkout", done: false, note: "Points can't reduce below MAP floor", file: "lib/map/engine.ts" },
    ]
  },
  {
    id: 5, label: "PHASE 5", title: "Vendor & Inventory", status: "upcoming", color: "#8a8784",
    items: [
      { name: "WPS vendor sync worker", done: false, note: "Products, pricing, stock via API" },
      { name: "Drag Specialties FTP sync", done: false, note: "CSV feed parser, ACES fitment import" },
      { name: "Typesense index builder", done: false, note: "Sync Postgres → search index" },
      { name: "Back-in-stock alert worker", done: false, note: "Email queue when qty > 0" },
      { name: "Inventory API route", done: false, note: "Real-time stock check at add-to-cart" },
    ]
  },
  {
    id: 6, label: "PHASE 6", title: "Admin Dashboard", status: "upcoming", color: "#8a8784",
    items: [
      { name: "Admin layout /admin", done: false, note: "Role-gated, sidebar nav" },
      { name: "Orders dashboard", done: false, note: "Status board, vendor order tracking" },
      { name: "MAP compliance monitor", done: false, note: "Violations, auto-fix toggle" },
      { name: "Competitor pricing view", done: false, note: "RevZilla / JPC comparison" },
      { name: "Points admin panel", done: false, note: "Adjust balances, bulk awards" },
    ]
  },
  {
    id: 7, label: "PHASE 7", title: "Launch Polish", status: "upcoming", color: "#8a8784",
    items: [
      { name: "Custom domain setup", done: false, note: "stinksupp.com → Vercel" },
      { name: "SEO — sitemap + metadata", done: false, note: "next-sitemap, OG images" },
      { name: "Email templates", done: false, note: "Order confirm, shipping, abandoned cart" },
      { name: "Analytics", done: false, note: "Vercel Analytics or Plausible" },
      { name: "Load test + go live", done: false, note: "k6 stress test, DNS cutover" },
    ]
  },
];

const NEXT_UP = [
  { file: "app/shop/page.jsx", desc: "Product grid with fitment filter toggle" },
  { file: "app/shop/[slug]/page.jsx", desc: "Product detail — images, fitment, add to cart" },
  { file: "components/CartDrawer.jsx", desc: "Slide-in cart with points redemption UI" },
];

export default function Roadmap() {
  const [expanded, setExpanded] = useState(2);
  const [done, setDone] = useState(() => {
    const d = {};
    phases.forEach(p => p.items.forEach((item, i) => { d[`${p.id}-${i}`] = item.done; }));
    return d;
  });
  const [copied, setCopied] = useState(null);

  const toggle = (phaseId, idx) => setDone(prev => ({ ...prev, [`${phaseId}-${idx}`]: !prev[`${phaseId}-${idx}`] }));

  const copy = (text, id) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const totalItems = phases.flatMap(p => p.items).length;
  const doneCount  = Object.values(done).filter(Boolean).length;
  const pct = Math.round((doneCount / totalItems) * 100);

  return (
    <div style={{ background:"#0a0909", minHeight:"100vh", fontFamily:"'Barlow Condensed',sans-serif", color:"#f0ebe3", paddingBottom:80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:#e8621a; }
        .phase-row { cursor:pointer; transition:background 0.15s; }
        .phase-row:hover { background:rgba(255,255,255,0.02) !important; }
        .task-row:hover { background:rgba(255,255,255,0.015) !important; }
        .copy-btn { cursor:pointer; transition:all 0.2s; }
        .copy-btn:hover { border-color:#e8621a !important; color:#e8621a !important; }
        .check-box { cursor:pointer; transition:all 0.2s; }
        .check-box:hover { border-color:#e8621a !important; }
      `}</style>

      {/* Header */}
      <div style={{ background:"#111010", borderBottom:"1px solid #2a2828", padding:"28px 32px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
        <div>
          <div style={{ fontFamily:"'Share Tech Mono'", fontSize:10, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6 }}>STINKIN' SUPPLIES · BUILD TRACKER</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:36, letterSpacing:"0.05em" }}>DEVELOPMENT ROADMAP</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:"'Share Tech Mono'", fontSize:9, color:"#8a8784", letterSpacing:"0.15em", marginBottom:6 }}>OVERALL PROGRESS</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:48, color:"#e8621a", lineHeight:1 }}>{pct}%</div>
          <div style={{ width:180, height:3, background:"#2a2828", borderRadius:2, marginTop:8 }}>
            <div style={{ width:`${pct}%`, height:"100%", background:"#e8621a", borderRadius:2, transition:"width 0.4s" }}/>
          </div>
          <div style={{ fontFamily:"'Share Tech Mono'", fontSize:9, color:"#8a8784", marginTop:6, letterSpacing:"0.1em" }}>{doneCount} / {totalItems} TASKS COMPLETE</div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"32px 24px" }}>

        {/* BUILD NEXT */}
        <div style={{ background:"rgba(232,98,26,0.06)", border:"1px solid rgba(232,98,26,0.3)", borderRadius:4, padding:"20px 24px", marginBottom:32, position:"relative" }}>
          <div style={{ position:"absolute", top:-1, left:20, background:"#e8621a", color:"#0a0909", fontFamily:"'Share Tech Mono'", fontSize:10, letterSpacing:"0.2em", padding:"3px 10px" }}>BUILD NEXT</div>
          <div style={{ fontFamily:"'Bebas Neue'", fontSize:22, letterSpacing:"0.05em", marginTop:10, marginBottom:14 }}>READY TO BUILD — START HERE</div>
          {NEXT_UP.map((item, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderTop: i===0?"none":"1px solid #1a1919", gap:16, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontFamily:"'Share Tech Mono'", fontSize:9, background:"#1a1919", color:"#e8621a", padding:"2px 8px", borderRadius:2, letterSpacing:"0.1em", whiteSpace:"nowrap" }}>STEP {i+1}</div>
                <div>
                  <div style={{ fontFamily:"'Share Tech Mono'", fontSize:11, color:"#f0ebe3" }}>{item.file}</div>
                  <div style={{ fontSize:13, color:"#8a8784", marginTop:2 }}>{item.desc}</div>
                </div>
              </div>
              <button className="copy-btn" onClick={() => copy(item.file, i)} style={{ background: copied===i?"#22c55e":"#1a1919", border:`1px solid ${copied===i?"#22c55e":"#2a2828"}`, color: copied===i?"#0a0909":"#8a8784", fontFamily:"'Share Tech Mono'", fontSize:10, letterSpacing:"0.1em", padding:"5px 14px", borderRadius:2, whiteSpace:"nowrap" }}>
                {copied===i ? "✓ COPIED" : "COPY PATH"}
              </button>
            </div>
          ))}
        </div>

        {/* PHASES */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {phases.map(phase => {
            const isOpen = expanded === phase.id;
            const doneInPhase = phase.items.filter((_, i) => done[`${phase.id}-${i}`]).length;
            const phasePct = Math.round((doneInPhase / phase.items.length) * 100);

            return (
              <div key={phase.id} style={{ background:"#111010", border:`1px solid ${isOpen ? phase.color+"55" : "#2a2828"}`, borderRadius:3, overflow:"hidden", transition:"border-color 0.2s" }}>

                {/* Phase header */}
                <div className="phase-row" onClick={() => setExpanded(isOpen ? null : phase.id)}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 20px", background: isOpen?"rgba(255,255,255,0.02)":"transparent" }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", flexShrink:0,
                    background: phase.status==="complete"?"#22c55e": phase.status==="current"?"#e8621a":"transparent",
                    border: phase.status==="upcoming"?"1px solid #8a8784":"none",
                    boxShadow: phase.status==="current"?"0 0 8px #e8621a88":"none",
                  }}/>
                  <div style={{ fontFamily:"'Share Tech Mono'", fontSize:9, color:phase.color, letterSpacing:"0.2em", width:68, flexShrink:0 }}>{phase.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue'", fontSize:22, letterSpacing:"0.05em", flex:1 }}>
                    {phase.title}
                    {phase.status==="current" && <span style={{ fontFamily:"'Share Tech Mono'", fontSize:9, color:"#e8621a", marginLeft:12, letterSpacing:"0.15em", verticalAlign:"middle" }}>← IN PROGRESS</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                    <div style={{ fontFamily:"'Share Tech Mono'", fontSize:10, color:phase.color }}>{doneInPhase}/{phase.items.length}</div>
                    <div style={{ width:60, height:2, background:"#2a2828", borderRadius:1 }}>
                      <div style={{ width:`${phasePct}%`, height:"100%", background:phase.color, borderRadius:1, transition:"width 0.3s" }}/>
                    </div>
                    <div style={{ color:"#2a2828", fontSize:12, transition:"transform 0.2s", transform: isOpen?"rotate(90deg)":"none" }}>▶</div>
                  </div>
                </div>

                {/* Task list */}
                {isOpen && (
                  <div style={{ borderTop:"1px solid #1a1919" }}>
                    {phase.items.map((item, i) => {
                      const isDone = done[`${phase.id}-${i}`];
                      return (
                        <div key={i} className="task-row" style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"12px 20px 12px 44px", borderBottom: i<phase.items.length-1?"1px solid #1a1919":"none", background: isDone?"rgba(34,197,94,0.02)":"transparent" }}>
                          <div className="check-box" onClick={() => toggle(phase.id, i)} style={{ width:16, height:16, borderRadius:2, flexShrink:0, marginTop:2, border:`1px solid ${isDone?"#22c55e":"#2a2828"}`, background: isDone?"#22c55e":"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#0a0909" }}>
                            {isDone ? "✓" : ""}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:15, fontWeight:600, color: isDone?"#8a8784":"#f0ebe3", textDecoration: isDone?"line-through":"none", letterSpacing:"0.02em" }}>{item.name}</div>
                            {item.note && <div style={{ fontFamily:"'Share Tech Mono'", fontSize:10, color:"#8a8784", marginTop:3, letterSpacing:"0.08em" }}>{item.note}</div>}
                            {item.file && <div style={{ fontFamily:"'Share Tech Mono'", fontSize:9, color:phase.color, marginTop:4, letterSpacing:"0.1em", opacity:0.7 }}>→ {item.file}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Critical path */}
        <div style={{ marginTop:28, padding:"16px 20px", background:"#111010", border:"1px solid #2a2828", borderRadius:3 }}>
          <div style={{ fontFamily:"'Share Tech Mono'", fontSize:9, color:"#8a8784", letterSpacing:"0.2em", marginBottom:12 }}>CRITICAL PATH — BUILD IN THIS ORDER</div>
          <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:4 }}>
            {["Shop Page","Product Detail","Cart","Auth","Checkout","Stripe","Vendor Sync","Admin","Launch"].map((s,i,a) => (
              <span key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontFamily:"'Bebas Neue'", fontSize:14, letterSpacing:"0.08em", color: i<2?"#e8621a":"#8a8784", padding:"4px 10px", background: i<2?"rgba(232,98,26,0.1)":"transparent", border: i<2?"1px solid rgba(232,98,26,0.2)":"none", borderRadius:2 }}>{s}</span>
                {i < a.length-1 && <span style={{ color:"#2a2828", fontSize:11 }}>→</span>}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}