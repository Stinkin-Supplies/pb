// ============================================================
// app/admin/page.jsx  —  SERVER COMPONENT
// Main admin overview dashboard
// ============================================================

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect }                   from "next/navigation";
import { getCatalogDb }               from "@/lib/db/catalog";
import { formatMoney }                from "@/lib/utils/money";

const css = `
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }

  .dash-body {
    padding: 28px;
    background: #0a0909;
    min-height: calc(100vh - 46px);
  }
  .dash-body::before {
    content:'';
    position:fixed; inset:0;
    background-image:
      linear-gradient(rgba(232,98,26,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.02) 1px, transparent 1px);
    background-size:48px 48px;
    pointer-events:none; z-index:0;
  }
  .dash-inner { position:relative; z-index:1; }

  /* HEADING */
  .dash-heading { margin-bottom:24px; }

  /* STAT GRID — commerce stats */
  .stat-grid {
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:10px;
    margin-bottom:10px;
  }
  /* STAT GRID — catalog stats (5 cols) */
  .stat-grid-cat {
    display:grid;
    grid-template-columns:repeat(5,1fr);
    gap:10px;
    margin-bottom:24px;
  }
  .stat-card {
    background:#111010;
    border:1px solid #2a2828;
    border-radius:3px;
    padding:18px 20px;
    animation:fadeUp 0.3s ease both;
    transition:border-color 0.2s;
  }
  .stat-card:hover { border-color:rgba(232,98,26,0.25); }
  .stat-card.hl  { border-color:rgba(232,98,26,0.2);  background:rgba(232,98,26,0.03); }
  .stat-card.grn { border-color:rgba(34,197,94,0.2);  background:rgba(34,197,94,0.03); }
  .stat-card.yel { border-color:rgba(201,168,76,0.2); background:rgba(201,168,76,0.03); }
  .stat-card.dim { border-color:#1e1d1d; }
  .stat-label {
    font-family:var(--font-stencil),monospace;
    font-size:8px; color:#8a8784;
    letter-spacing:0.18em; margin-bottom:8px;
  }
  .stat-value {
    font-family:var(--font-caesar),sans-serif;
    font-size:34px; letter-spacing:0.04em;
    color:#f0ebe3; line-height:1;
  }
  .stat-card.hl  .stat-value { color:#e8621a; }
  .stat-card.grn .stat-value { color:#22c55e; }
  .stat-card.yel .stat-value { color:#c9a84c; }
  .stat-sub {
    font-family:var(--font-stencil),monospace;
    font-size:8px; color:#8a8784;
    letter-spacing:0.1em; margin-top:5px;
  }
  .stat-sub.up   { color:#22c55e; }
  .stat-sub.warn { color:#c9a84c; }
  .stat-sub.dim  { color:#3a3838; }

  /* SECTION LABEL */
  .section-label {
    font-family:var(--font-stencil),monospace;
    font-size:8px; color:#e8621a;
    letter-spacing:0.22em;
    margin-bottom:8px; margin-top:4px;
  }

  /* THREE COL */
  .dash-cols {
    display:grid;
    grid-template-columns:1.2fr 0.9fr 0.9fr;
    gap:12px;
    margin-bottom:12px;
  }

  /* CARD */
  .card {
    background:#111010;
    border:1px solid #2a2828;
    border-radius:3px;
    overflow:hidden;
    animation:fadeUp 0.3s ease both;
  }
  .card-head {
    padding:13px 18px;
    border-bottom:1px solid #1a1919;
    display:flex; align-items:center;
    justify-content:space-between;
  }
  .card-title {
    font-family:var(--font-caesar),sans-serif;
    font-size:17px; letter-spacing:0.07em;
  }
  .card-title span { color:#e8621a; }
  .card-link {
    font-family:var(--font-stencil),monospace;
    font-size:8px; color:#8a8784;
    letter-spacing:0.12em; text-decoration:none;
    transition:color 0.15s;
  }
  .card-link:hover { color:#e8621a; }

  /* ORDERS TABLE */
  .mini-table { width:100%; border-collapse:collapse; }
  .mini-table th {
    font-family:var(--font-stencil),monospace;
    font-size:7px; color:#8a8784;
    letter-spacing:0.15em; padding:8px 14px;
    text-align:left; border-bottom:1px solid #1a1919;
    font-weight:normal;
  }
  .mini-table td {
    padding:10px 14px;
    border-bottom:1px solid rgba(255,255,255,0.03);
    font-size:13px; font-weight:600;
  }
  .mini-table tr:last-child td { border-bottom:none; }
  .mini-table tr:hover td { background:rgba(255,255,255,0.01); }

  .status-chip {
    display:inline-flex; align-items:center; gap:5px;
    padding:2px 8px; border-radius:2px;
    font-family:var(--font-stencil),monospace;
    font-size:7px; letter-spacing:0.12em;
  }
  .status-dot { width:5px; height:5px; border-radius:50%; }

  /* NAV GRID */
  .nav-grid {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:8px;
    padding:14px;
  }
  .nav-btn {
    display:flex; align-items:center; gap:10px;
    padding:12px 14px;
    background:#0f0e0e; border:1px solid #2a2828;
    border-radius:2px; text-decoration:none;
    color:#f0ebe3; transition:all 0.2s;
  }
  .nav-btn:hover {
    border-color:rgba(232,98,26,0.35);
    background:rgba(232,98,26,0.04);
  }
  .nav-btn-icon {
    width:30px; height:30px; flex-shrink:0;
    background:rgba(232,98,26,0.08);
    border-radius:2px;
    display:flex; align-items:center; justify-content:center;
    font-size:14px;
    font-family:var(--font-caesar),sans-serif;
    color:#e8621a; letter-spacing:0.05em;
  }
  .nav-btn-label {
    font-family:var(--font-caesar),sans-serif;
    font-size:14px; letter-spacing:0.06em;
  }
  .nav-btn-sub {
    font-family:var(--font-stencil),monospace;
    font-size:7px; color:#8a8784;
    letter-spacing:0.1em; margin-top:1px;
  }

  /* CATALOG HEALTH LIST */
  .health-list { padding:4px 0; }
  .health-row {
    display:flex; align-items:center;
    justify-content:space-between;
    padding:9px 18px;
    border-bottom:1px solid rgba(255,255,255,0.03);
    transition:background 0.15s;
  }
  .health-row:last-child { border-bottom:none; }
  .health-row:hover { background:rgba(255,255,255,0.01); }
  .health-key {
    font-family:var(--font-stencil),monospace;
    font-size:9px; color:#8a8784;
    letter-spacing:0.12em;
  }
  .health-val {
    font-family:var(--font-caesar),sans-serif;
    font-size:16px; letter-spacing:0.06em;
    color:#f0ebe3;
  }
  .health-val.ok   { color:#22c55e; }
  .health-val.warn { color:#c9a84c; }
  .health-val.hi   { color:#e8621a; }

  @media (max-width:1024px) {
    .stat-grid { grid-template-columns:1fr 1fr; }
    .stat-grid-cat { grid-template-columns:1fr 1fr 1fr; }
    .dash-cols { grid-template-columns:1fr; }
  }
  @media (max-width:600px) {
    .stat-grid-cat { grid-template-columns:1fr 1fr; }
  }
`;

const STATUS_CFG = {
  pending:    { color:"#c9a84c", bg:"rgba(201,168,76,0.1)",  border:"rgba(201,168,76,0.2)"  },
  processing: { color:"#e8621a", bg:"rgba(232,98,26,0.1)",   border:"rgba(232,98,26,0.2)"   },
  shipped:    { color:"#3b82f6", bg:"rgba(59,130,246,0.1)",  border:"rgba(59,130,246,0.2)"  },
  delivered:  { color:"#22c55e", bg:"rgba(34,197,94,0.1)",   border:"rgba(34,197,94,0.2)"   },
  cancelled:  { color:"#8a8784", bg:"rgba(138,135,132,0.08)",border:"rgba(138,135,132,0.15)"},
};

function normStatus(s) {
  const v = String(s ?? "").toLowerCase();
  return v === "pending_payment" ? "pending" : v;
}

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin");

  // ── Commerce stats (Supabase) ──────────────────────────────
  const [
    { count: totalOrders },
    { data: recentOrders },
    { data: revRow },
    { count: processing },
    { count: totalUsers },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count:"exact", head:true }),
    supabase.from("orders")
      .select("id,order_number,created_at,status,total,customer_email,customer_name")
      .order("created_at", { ascending:false }).limit(8),
    supabase.from("orders").select("total")
      .not("status", "in", '("pending_payment","cancelled")'),
    supabase.from("orders").select("*", { count:"exact", head:true })
      .eq("status", "processing"),
    supabase.from("user_profiles").select("*", { count:"exact", head:true }),
  ]);

  const totalRevenue = (revRow ?? []).reduce((s, o) => s + (o.total ?? 0), 0);

  // ── Catalog stats (Hetzner) ────────────────────────────────
  let catalogStats = { products:0, unified:0, fitment:0, crossref:0, groups:0 };
  try {
    const db = getCatalogDb();
    const [p, u, f, x, g] = await Promise.all([
      db.query("SELECT COUNT(*) FROM catalog_products"),
      db.query("SELECT COUNT(*) FROM catalog_unified WHERE is_active=true"),
      db.query("SELECT COUNT(DISTINCT product_id) FROM catalog_fitment"),
      db.query("SELECT COUNT(DISTINCT oem_number) FROM catalog_oem_crossref"),
      db.query("SELECT COUNT(*) FROM product_groups").catch(() => ({ rows:[{ count:'—' }] })),
    ]);
    catalogStats = {
      products : Number(p.rows[0].count),
      unified  : Number(u.rows[0].count),
      fitment  : Number(f.rows[0].count),
      crossref : Number(x.rows[0].count),
      groups   : Number(g.rows[0].count),
    };
  } catch { /* catalog DB unreachable — show dashes */ }

  const B  = s => ({ fontFamily:"var(--font-caesar),sans-serif",  ...s });
  const M  = s => ({ fontFamily:"var(--font-stencil),monospace",  ...s });
  const fmt = n => typeof n === "number" ? n.toLocaleString() : "—";

  const today = new Date().toLocaleDateString("en-US", {
    weekday:"long", month:"long", day:"numeric", year:"numeric",
  });

  const NAV_ITEMS = [
    { href:"/admin/orders",      icon:"PO", label:"ORDERS",         sub:"Manage & track orders"       },
    { href:"/admin/sync",        icon:"↺",  label:"SYNC",           sub:"WPS + PU catalog sync"       },
    { href:"/admin/oem-crossref",icon:"⊞",  label:"OEM CROSSREF",   sub:"HD → WPS part mappings"      },
    { href:"/admin/backorders",  icon:"◫",  label:"BACKORDERS",     sub:"Pending stock fulfilment"    },
    { href:"/admin/map",         icon:"⚑",  label:"MAP COMPLIANCE", sub:"Review pricing violations"   },
    { href:"/admin/build-tracker",icon:"⌁", label:"BUILD TRACKER",  sub:"Vehicle build progress"      },
    { href:"/admin/points",      icon:"★",  label:"POINTS",         sub:"Award & adjust balances"     },
    { href:"/shop",              icon:"→",  label:"STOREFRONT",     sub:"View live shop"              },
  ];

  return (
    <div className="dash-body">
      <style>{css}</style>
      <div className="dash-inner">

        {/* HEADING */}
        <div className="dash-heading">
          <div style={M({ fontSize:9, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6 })}>
            {today.toUpperCase()}
          </div>
          <div style={B({ fontSize:36, letterSpacing:"0.04em", lineHeight:1 })}>
            STORE <span style={{ color:"#e8621a" }}>OVERVIEW</span>
          </div>
        </div>

        {/* COMMERCE STATS */}
        <div className="section-label">COMMERCE</div>
        <div className="stat-grid">
          <div className="stat-card hl" style={{ animationDelay:"0s" }}>
            <div className="stat-label">TOTAL REVENUE</div>
            <div className="stat-value">{formatMoney(totalRevenue)}</div>
            <div className="stat-sub">ALL TIME · PAID ORDERS</div>
          </div>
          <div className="stat-card" style={{ animationDelay:"0.04s" }}>
            <div className="stat-label">TOTAL ORDERS</div>
            <div className="stat-value">{totalOrders ?? 0}</div>
            <div className="stat-sub">ALL TIME</div>
          </div>
          <div className={`stat-card ${processing > 0 ? "yel" : "dim"}`} style={{ animationDelay:"0.08s" }}>
            <div className="stat-label">NEEDS ATTENTION</div>
            <div className="stat-value">{processing ?? 0}</div>
            <div className={`stat-sub ${processing > 0 ? "warn" : "dim"}`}>PROCESSING ORDERS</div>
          </div>
          <div className="stat-card" style={{ animationDelay:"0.12s" }}>
            <div className="stat-label">CUSTOMERS</div>
            <div className="stat-value">{totalUsers ?? 0}</div>
            <div className="stat-sub">REGISTERED ACCOUNTS</div>
          </div>
        </div>

        {/* CATALOG STATS */}
        <div className="section-label" style={{ marginTop:14 }}>CATALOG</div>
        <div className="stat-grid-cat">
          {[
            { label:"PRODUCTS",       val:fmt(catalogStats.products), sub:"catalog_products",  cls:"hl"  },
            { label:"ACTIVE LISTINGS",val:fmt(catalogStats.unified),  sub:"WPS + PU unified",  cls:""    },
            { label:"PRODUCT GROUPS", val:fmt(catalogStats.groups),   sub:"deduped for search",cls:""    },
            { label:"FITMENT RECORDS",val:fmt(catalogStats.fitment),  sub:"products w/ fitment",cls:"grn" },
            { label:"OEM CROSSREF",   val:fmt(catalogStats.crossref), sub:"distinct OEM numbers",cls:""  },
          ].map(({ label, val, sub, cls }, i) => (
            <div key={label} className={`stat-card ${cls}`} style={{ animationDelay:`${0.16 + i*0.04}s` }}>
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize:26 }}>{val}</div>
              <div className="stat-sub">{sub}</div>
            </div>
          ))}
        </div>

        {/* THREE COLUMNS */}
        <div className="dash-cols">

          {/* RECENT ORDERS */}
          <div className="card" style={{ animationDelay:"0.36s" }}>
            <div className="card-head">
              <div className="card-title">RECENT <span>ORDERS</span></div>
              <a href="/admin/orders" className="card-link">VIEW ALL →</a>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>ORDER</th><th>CUSTOMER</th><th>STATUS</th>
                  <th style={{ textAlign:"right" }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {(recentOrders ?? []).map(order => {
                  const status = normStatus(order.status);
                  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;
                  const num = order.order_number ?? order.id?.slice(0,8).toUpperCase();
                  const cust = order.customer_name ?? order.customer_email ?? "—";
                  return (
                    <tr key={order.id}>
                      <td>
                        <a href={`/order/${order.id}`}
                          style={M({ fontSize:10, color:"#e8621a", letterSpacing:"0.1em", textDecoration:"none" })}>
                          #{num}
                        </a>
                      </td>
                      <td style={{ color:"#c4c0bc", maxWidth:130, overflow:"hidden",
                                   textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {cust}
                      </td>
                      <td>
                        <div className="status-chip"
                          style={{ background:cfg.bg, border:`1px solid ${cfg.border}` }}>
                          <div className="status-dot" style={{ background:cfg.color }}/>
                          <span style={{ color:cfg.color }}>{status.toUpperCase()}</span>
                        </div>
                      </td>
                      <td style={{ textAlign:"right", ...B({ fontSize:15, letterSpacing:"0.04em" }) }}>
                        {formatMoney(order.total ?? 0)}
                      </td>
                    </tr>
                  );
                })}
                {!recentOrders?.length && (
                  <tr>
                    <td colSpan={4}
                      style={{ ...M({ fontSize:9, color:"#3a3838", letterSpacing:"0.12em" }),
                               textAlign:"center", padding:"24px" }}>
                      NO ORDERS YET
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* NAV */}
          <div className="card" style={{ animationDelay:"0.4s" }}>
            <div className="card-head">
              <div className="card-title">ADMIN <span>NAV</span></div>
            </div>
            <div className="nav-grid">
              {NAV_ITEMS.map(({ href, icon, label, sub }) => (
                <a key={href} href={href} className="nav-btn">
                  <div className="nav-btn-icon">{icon}</div>
                  <div>
                    <div className="nav-btn-label">{label}</div>
                    <div className="nav-btn-sub">{sub}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* CATALOG HEALTH */}
          <div className="card" style={{ animationDelay:"0.44s" }}>
            <div className="card-head">
              <div className="card-title">CATALOG <span>HEALTH</span></div>
              <a href="/admin/sync" className="card-link">SYNC →</a>
            </div>
            <div className="health-list">
              {[
                {
                  key: "CROSSREF COVERAGE",
                  val: catalogStats.crossref > 0 ? `${catalogStats.crossref} OEM#s` : "—",
                  cls: catalogStats.crossref > 100 ? "ok" : catalogStats.crossref > 0 ? "warn" : "",
                },
                {
                  key: "FITMENT DATA",
                  val: catalogStats.fitment > 0
                    ? `${Math.round(catalogStats.fitment / Math.max(catalogStats.products,1) * 100)}%`
                    : "—",
                  cls: catalogStats.fitment > catalogStats.products * 0.3 ? "ok" : "warn",
                },
                {
                  key: "CATALOG GROUPS",
                  val: catalogStats.groups > 0 ? `${fmt(catalogStats.groups)} groups` : "NOT BUILT",
                  cls: catalogStats.groups > 0 ? "ok" : "warn",
                },
                {
                  key: "WPS + PU LISTINGS",
                  val: fmt(catalogStats.unified),
                  cls: "hi",
                },
                {
                  key: "CANONICAL PRODUCTS",
                  val: fmt(catalogStats.products),
                  cls: "",
                },
              ].map(({ key, val, cls }) => (
                <div key={key} className="health-row">
                  <span className="health-key">{key}</span>
                  <span className={`health-val ${cls}`}>{val}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}