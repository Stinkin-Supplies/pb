import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/utils/money";

const css = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .orders-body {
    padding: 28px;
    background: #0a0909;
    min-height: calc(100vh - 46px);
    position: relative;
  }
  .orders-body::before {
    content: '';
    position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.02) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none; z-index: 0;
  }
  .orders-inner { position: relative; z-index: 1; }

  /* HEADER */
  .page-header {
    display: flex; align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
  }

  /* STATUS FILTER TABS */
  .filter-tabs {
    display: flex; gap: 0;
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .filter-tab {
    padding: 9px 16px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; letter-spacing: 0.14em;
    color: #8a8784;
    text-decoration: none;
    transition: all 0.15s;
    display: flex; align-items: center; gap: 7px;
    border-right: 1px solid #2a2828;
    white-space: nowrap;
  }
  .filter-tab:last-child { border-right: none; }
  .filter-tab:hover { color: #f0ebe3; background: rgba(255,255,255,0.02); }
  .filter-tab.active { background: rgba(232,98,26,0.08); color: #e8621a; }
  .filter-count {
    background: #1a1919;
    border-radius: 2px;
    padding: 1px 6px;
    font-size: 8px;
  }
  .filter-tab.active .filter-count {
    background: rgba(232,98,26,0.15);
    color: #e8621a;
  }

  /* TABLE */
  .orders-table-wrap {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    overflow: hidden;
    animation: fadeUp 0.3s ease both;
  }
  .orders-table {
    width: 100%;
    border-collapse: collapse;
  }
  .orders-table th {
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #8a8784;
    letter-spacing: 0.18em; padding: 10px 16px;
    text-align: left; border-bottom: 1px solid #1a1919;
    font-weight: normal; white-space: nowrap;
    background: #0d0c0c;
  }
  .orders-table td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    vertical-align: middle;
  }
  .orders-table tr:last-child td { border-bottom: none; }
  .orders-table tbody tr { transition: background 0.15s; }
  .orders-table tbody tr:hover td { background: rgba(255,255,255,0.015); }

  .order-num-link {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #e8621a;
    letter-spacing: 0.1em; text-decoration: none;
    transition: color 0.15s;
  }
  .order-num-link:hover { color: #f0ebe3; }

  .customer-name {
    font-size: 13px; font-weight: 700;
    color: #f0ebe3; margin-bottom: 2px;
  }
  .customer-email {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.08em;
  }

  .status-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 9px; border-radius: 2px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; letter-spacing: 0.14em;
    white-space: nowrap;
  }
  .status-dot { width: 5px; height: 5px; border-radius: 50%; }

  .order-date {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.08em;
  }

  .order-total {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px; letter-spacing: 0.04em;
    color: #f0ebe3; white-space: nowrap;
  }

  .action-link {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784;
    letter-spacing: 0.1em; text-decoration: none;
    border: 1px solid #2a2828; padding: 4px 10px;
    border-radius: 2px; transition: all 0.15s;
    white-space: nowrap;
  }
  .action-link:hover { border-color: #e8621a; color: #e8621a; }

  /* EMPTY */
  .table-empty {
    padding: 60px; text-align: center;
  }

  /* PAGINATION INFO */
  .table-footer {
    padding: 12px 16px;
    border-top: 1px solid #1a1919;
    background: #0d0c0c;
    display: flex; align-items: center;
    justify-content: space-between;
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784;
    letter-spacing: 0.1em;
  }
`;

const STATUS_CONFIG = {
  pending:    { color: "#c9a84c", bg: "rgba(201,168,76,0.1)",  border: "rgba(201,168,76,0.2)"  },
  processing: { color: "#e8621a", bg: "rgba(232,98,26,0.1)",   border: "rgba(232,98,26,0.2)"   },
  shipped:    { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.2)"  },
  delivered:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.2)"   },
  cancelled:  { color: "#8a8784", bg: "rgba(138,135,132,0.08)", border: "rgba(138,135,132,0.15)" },
};

const ALL_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

function normalizeStatus(s) {
  const v = String(s ?? "").toLowerCase();
  return v === "pending_payment" ? "pending" : v;
}

export default async function AdminOrdersPage({ searchParams }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/admin/orders");

  const params = await searchParams;
  const activeFilter = params?.status ?? "all";

  // ── Fetch counts per status for filter tabs ──
  const countPromises = ALL_STATUSES.map((s) =>
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", s === "pending" ? "pending_payment" : s)
      .then(({ count }) => ({ status: s, count: count ?? 0 }))
  );
  // Also count "pending_payment" under pending
  const statusCounts = await Promise.all(countPromises);
  const { count: totalCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  // ── Fetch orders ──
  let query = supabase
    .from("orders")
    .select("id, order_number, created_at, status, total, subtotal, customer_email, customer_name, shipping_address")
    .order("created_at", { ascending: false })
    .limit(100);

  if (activeFilter !== "all") {
    if (activeFilter === "pending") {
      query = query.in("status", ["pending", "pending_payment"]);
    } else {
      query = query.eq("status", activeFilter);
    }
  }

  const { data: orders } = await query;

  const B = (s) => ({ fontFamily: "'Bebas Neue', sans-serif", ...s });
  const M = (s) => ({ fontFamily: "'Share Tech Mono', monospace", ...s });

  const tabs = [
    { key: "all",        label: "ALL ORDERS", count: totalCount ?? 0 },
    ...ALL_STATUSES.map((s) => ({
      key:   s,
      label: s.toUpperCase(),
      count: statusCounts.find((c) => c.status === s)?.count ?? 0,
    })),
  ];

  return (
    <div className="orders-body">
      <style>{css}</style>
      <div className="orders-inner">

        {/* HEADER */}
        <div className="page-header">
          <div>
            <div style={M({ fontSize: 9, color: "#e8621a", letterSpacing: "0.25em", marginBottom: 6 })}>
              COMMERCE
            </div>
            <div style={B({ fontSize: 36, letterSpacing: "0.04em", lineHeight: 1 })}>
              ORDER <span style={{ color: "#e8621a" }}>MANAGEMENT</span>
            </div>
          </div>
          <div style={M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.1em" })}>
            {(orders ?? []).length} ORDERS SHOWN
          </div>
        </div>

        {/* FILTER TABS */}
        <div className="filter-tabs">
          {tabs.map(({ key, label, count }) => (
            <a
              key={key}
              href={`/admin/orders${key !== "all" ? `?status=${key}` : ""}`}
              className={`filter-tab ${activeFilter === key ? "active" : ""}`}
            >
              {label}
              <span className="filter-count">{count}</span>
            </a>
          ))}
        </div>

        {/* TABLE */}
        <div className="orders-table-wrap">
          {!orders?.length ? (
            <div className="table-empty">
              <div style={B({ fontSize: 24, letterSpacing: "0.05em", color: "#3a3838", marginBottom: 6 })}>
                NO ORDERS
              </div>
              <div style={M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.12em" })}>
                {activeFilter !== "all" ? `NO ${activeFilter.toUpperCase()} ORDERS` : "NO ORDERS YET"}
              </div>
            </div>
          ) : (
            <>
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>ORDER #</th>
                    <th>CUSTOMER</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>SHIP TO</th>
                    <th style={{ textAlign: "right" }}>TOTAL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, i) => {
                    const status = normalizeStatus(order.status);
                    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
                    const num = order.order_number ?? order.id?.slice(0, 8).toUpperCase();
                    const dateStr = new Date(order.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    });
                    const ship = order.shipping_address;
                    const shipTo = ship ? `${ship.city}, ${ship.state}` : "—";

                    return (
                      <tr key={order.id} style={{ animationDelay: `${i * 0.02}s` }}>
                        <td>
                          <a href={`/order/${order.id}`} className="order-num-link">
                            #{num}
                          </a>
                        </td>
                        <td>
                          {order.customer_name && (
                            <div className="customer-name">{order.customer_name}</div>
                          )}
                          <div className="customer-email">{order.customer_email ?? "—"}</div>
                        </td>
                        <td>
                          <div className="order-date">{dateStr}</div>
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
                        <td>
                          <div style={M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.08em" })}>
                            {shipTo}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="order-total">{formatMoney(order.total ?? 0)}</div>
                        </td>
                        <td>
                          <a href={`/order/${order.id}`} className="action-link">
                            VIEW →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="table-footer">
                <span>SHOWING {orders.length} OF {totalCount ?? orders.length} ORDERS</span>
                <span>SORTED BY DATE DESC</span>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
