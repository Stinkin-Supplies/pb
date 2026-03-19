import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/utils/money";

const css = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .dash-body {
    padding: 28px;
    background: #0a0909;
    min-height: calc(100vh - 46px);
  }
  .dash-body::before {
    content: '';
    position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.02) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none; z-index: 0;
  }
  .dash-inner { position: relative; z-index: 1; }

  .dash-heading {
    margin-bottom: 24px;
  }

  /* STAT GRID */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }
  .stat-card {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    padding: 18px 20px;
    animation: fadeUp 0.3s ease both;
    transition: border-color 0.2s;
  }
  .stat-card:hover { border-color: rgba(232,98,26,0.25); }
  .stat-card.highlight {
    border-color: rgba(232,98,26,0.2);
    background: rgba(232,98,26,0.03);
  }
  .stat-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784;
    letter-spacing: 0.18em; margin-bottom: 8px;
  }
  .stat-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 34px; letter-spacing: 0.04em;
    color: #f0ebe3; line-height: 1;
  }
  .stat-card.highlight .stat-value { color: #e8621a; }
  .stat-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784;
    letter-spacing: 0.1em; margin-top: 5px;
  }
  .stat-sub.up   { color: #22c55e; }
  .stat-sub.warn { color: #c9a84c; }

  /* TWO COL */
  .dash-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }

  /* CARD */
  .card {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    overflow: hidden;
    animation: fadeUp 0.3s ease both;
  }
  .card-head {
    padding: 13px 18px;
    border-bottom: 1px solid #1a1919;
    display: flex; align-items: center;
    justify-content: space-between;
  }
  .card-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 17px; letter-spacing: 0.07em;
  }
  .card-title span { color: #e8621a; }
  .card-link {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784;
    letter-spacing: 0.12em; text-decoration: none;
    transition: color 0.15s;
  }
  .card-link:hover { color: #e8621a; }

  /* RECENT ORDERS TABLE */
  .mini-table { width: 100%; border-collapse: collapse; }
  .mini-table th {
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #8a8784;
    letter-spacing: 0.15em; padding: 8px 14px;
    text-align: left; border-bottom: 1px solid #1a1919;
    font-weight: normal;
  }
  .mini-table td {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 13px; font-weight: 600;
  }
  .mini-table tr:last-child td { border-bottom: none; }
  .mini-table tr:hover td { background: rgba(255,255,255,0.01); }

  .status-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 8px; border-radius: 2px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; letter-spacing: 0.12em;
  }
  .status-dot { width: 5px; height: 5px; border-radius: 50%; }

  /* QUICK ACTIONS */
  .quick-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 14px;
  }
  .quick-btn {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px;
    background: #1a1919; border: 1px solid #2a2828;
    border-radius: 2px; text-decoration: none;
    color: #f0ebe3; transition: all 0.2s;
  }
  .quick-btn:hover { border-color: rgba(232,98,26,0.35); background: rgba(232,98,26,0.04); }
  .quick-btn-icon {
    font-size: 16px; flex-shrink: 0;
    width: 28px; height: 28px;
    background: rgba(232,98,26,0.1);
    border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
  }
  .quick-btn-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 15px; letter-spacing: 0.06em;
  }
  .quick-btn-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #8a8784; letter-spacing: 0.1em;
    margin-top: 1px;
  }

  @media (max-width: 900px) {
    .stat-grid { grid-template-columns: 1fr 1fr; }
    .dash-cols  { grid-template-columns: 1fr; }
  }
`;

const STATUS_CONFIG = {
  pending:    { color: "#c9a84c", bg: "rgba(201,168,76,0.1)",  border: "rgba(201,168,76,0.2)"  },
  processing: { color: "#e8621a", bg: "rgba(232,98,26,0.1)",   border: "rgba(232,98,26,0.2)"   },
  shipped:    { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.2)"  },
  delivered:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)"   },
  cancelled:  { color: "#8a8784", bg: "rgba(138,135,132,0.08)","border": "rgba(138,135,132,0.15)" },
};

function normalizeStatus(s) {
  const v = String(s ?? "").toLowerCase();
  return v === "pending_payment" ? "pending" : v;
}

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin");

  // ── Fetch metrics in parallel ──
  const [
    { count: totalOrders },
    { data: recentOrders },
    { data: revRow },
    { count: processingCount },
    { count: totalUsers },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id, order_number, created_at, status, total, customer_email, customer_name")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("orders")
      .select("total")
      .not("status", "in", '("pending_payment","cancelled")'),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing"),
    supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true }),
  ]);

  const totalRevenue = (revRow ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);

  const B = (s) => ({ fontFamily: "'Bebas Neue', sans-serif", ...s });
  const M = (s) => ({ fontFamily: "'Share Tech Mono', monospace", ...s });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="dash-body">
      <style>{css}</style>
      <div className="dash-inner">

        {/* HEADING */}
        <div className="dash-heading">
          <div style={M({ fontSize: 9, color: "#e8621a", letterSpacing: "0.25em", marginBottom: 6 })}>
            {today.toUpperCase()}
          </div>
          <div style={B({ fontSize: 36, letterSpacing: "0.04em", lineHeight: 1 })}>
            STORE <span style={{ color: "#e8621a" }}>OVERVIEW</span>
          </div>
        </div>

        {/* STAT GRID */}
        <div className="stat-grid">
          <div className="stat-card highlight" style={{ animationDelay: "0s" }}>
            <div className="stat-label">TOTAL REVENUE</div>
            <div className="stat-value">{formatMoney(totalRevenue)}</div>
            <div className="stat-sub">ALL TIME · PAID ORDERS</div>
          </div>
          <div className="stat-card" style={{ animationDelay: "0.04s" }}>
            <div className="stat-label">TOTAL ORDERS</div>
            <div className="stat-value">{totalOrders ?? 0}</div>
            <div className="stat-sub">ALL TIME</div>
          </div>
          <div className="stat-card" style={{ animationDelay: "0.08s" }}>
            <div className="stat-label">NEEDS ATTENTION</div>
            <div className="stat-value" style={{ color: processingCount > 0 ? "#e8621a" : "#f0ebe3" }}>
              {processingCount ?? 0}
            </div>
            <div className={`stat-sub ${processingCount > 0 ? "warn" : ""}`}>
              PROCESSING ORDERS
            </div>
          </div>
          <div className="stat-card" style={{ animationDelay: "0.12s" }}>
            <div className="stat-label">TOTAL CUSTOMERS</div>
            <div className="stat-value">{totalUsers ?? 0}</div>
            <div className="stat-sub">REGISTERED ACCOUNTS</div>
          </div>
        </div>

        <div className="dash-cols">

          {/* RECENT ORDERS */}
          <div className="card" style={{ animationDelay: "0.16s" }}>
            <div className="card-head">
              <div className="card-title">RECENT <span>ORDERS</span></div>
              <a href="/admin/orders" className="card-link">VIEW ALL →</a>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>ORDER</th>
                  <th>CUSTOMER</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: "right" }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {(recentOrders ?? []).map((order) => {
                  const status = normalizeStatus(order.status);
                  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
                  const num = order.order_number ?? order.id?.slice(0, 8).toUpperCase();
                  const customer = order.customer_name ?? order.customer_email ?? "—";
                  return (
                    <tr key={order.id}>
                      <td>
                        <a
                          href={`/order/${order.id}`}
                          style={{ ...M({ fontSize: 10, color: "#e8621a", letterSpacing: "0.1em" }), textDecoration: "none" }}
                        >
                          #{num}
                        </a>
                      </td>
                      <td style={{ color: "#c4c0bc", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {customer}
                      </td>
                      <td>
                        <div
                          className="status-chip"
                          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                        >
                          <div className="status-dot" style={{ background: cfg.color }} />
                          <span style={{ color: cfg.color }}>{status.toUpperCase()}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", ...B({ fontSize: 16, letterSpacing: "0.04em" }) }}>
                        {formatMoney(order.total ?? 0)}
                      </td>
                    </tr>
                  );
                })}
                {!recentOrders?.length && (
                  <tr>
                    <td colSpan={4} style={{ ...M({ fontSize: 9, color: "#3a3838", letterSpacing: "0.12em" }), textAlign: "center", padding: "24px" }}>
                      NO ORDERS YET
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* QUICK ACTIONS */}
          <div className="card" style={{ animationDelay: "0.2s" }}>
            <div className="card-head">
              <div className="card-title">QUICK <span>ACTIONS</span></div>
            </div>
            <div className="quick-actions">
              {[
                { href: "/admin/orders",      icon: "◫", label: "ORDERS",            sub: "Manage & track orders"      },
                { href: "/admin/points",       icon: "★", label: "POINTS",            sub: "Award & adjust balances"    },
                { href: "/admin/map",          icon: "⚑", label: "MAP COMPLIANCE",    sub: "Review pricing violations"  },
                { href: "/admin/competitors",  icon: "◎", label: "COMPETITOR PRICING",sub: "RevZilla / JPC comparison"  },
              ].map(({ href, icon, label, sub }) => (
                <a key={href} href={href} className="quick-btn">
                  <div className="quick-btn-icon">{icon}</div>
                  <div>
                    <div className="quick-btn-label">{label}</div>
                    <div className="quick-btn-sub">{sub}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
