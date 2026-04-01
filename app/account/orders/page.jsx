import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/money";
import NavBar from "@/components/NavBar";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #e8621a; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .orders-wrap {
    background: #0a0909;
    min-height: 100vh;
    color: #f0ebe3;
    font-family: var(--font-stencil), sans-serif;
  }
  .orders-wrap::before {
    content: '';
    position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.025) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none; z-index: 0;
  }

  /* HEADER */
  .orders-header {
    background: #111010;
    border-bottom: 1px solid #2a2828;
    padding: 28px 24px;
    position: relative; z-index: 1;
  }
  .orders-header-inner {
    max-width: 900px; margin: 0 auto;
    display: flex; align-items: flex-end;
    justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }

  /* BODY */
  .orders-body {
    max-width: 900px;
    margin: 0 auto;
    padding: 28px 24px;
    position: relative; z-index: 1;
  }

  /* ORDER CARD */
  .order-card {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    margin-bottom: 10px;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
    animation: fadeUp 0.3s ease both;
    text-decoration: none;
    display: block;
    color: inherit;
  }
  .order-card:hover {
    border-color: rgba(232,98,26,0.35);
    box-shadow: 0 6px 28px rgba(0,0,0,0.4);
  }

  /* ORDER HEAD ROW */
  .order-head {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 16px; align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #1a1919;
  }
  .order-num {
    font-family: var(--font-stencil), monospace;
    font-size: 11px; color: #f0ebe3;
    letter-spacing: 0.12em;
  }
  .order-date {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784;
    letter-spacing: 0.1em;
  }
  .order-status-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 8px; letter-spacing: 0.15em;
    white-space: nowrap;
  }
  .status-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  .order-total {
    font-family: var(--font-caesar), sans-serif;
    font-size: 22px; letter-spacing: 0.04em;
    color: #f0ebe3; white-space: nowrap;
    text-align: right;
  }

  /* ORDER ITEMS PREVIEW */
  .order-items-preview {
    display: flex; align-items: center;
    gap: 10px; padding: 12px 20px;
    flex-wrap: wrap;
  }
  .preview-item {
    font-size: 12px; font-weight: 600;
    color: #8a8784;
  }
  .preview-item strong {
    color: #c4c0bc;
  }
  .preview-more {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #e8621a;
    letter-spacing: 0.1em;
    background: rgba(232,98,26,0.08);
    border: 1px solid rgba(232,98,26,0.2);
    padding: 2px 7px; border-radius: 2px;
  }
  .order-arrow {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #3a3838;
    letter-spacing: 0.1em; padding: 0 20px 12px;
    transition: color 0.15s;
  }
  .order-card:hover .order-arrow { color: #e8621a; }

  /* EMPTY */
  .orders-empty {
    text-align: center; padding: 80px 20px;
  }

  @media (max-width: 600px) {
    .order-head {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
    }
    .order-total { grid-column: 2; grid-row: 1; }
    .order-date  { grid-column: 1; grid-row: 2; }
    .order-status-pill { grid-column: 2; grid-row: 2; justify-self: end; }
  }
`;

const STATUS_CONFIG = {
  pending:    { color: "#c9a84c", bg: "rgba(201,168,76,0.08)",  border: "rgba(201,168,76,0.2)"  },
  processing: { color: "#e8621a", bg: "rgba(232,98,26,0.08)",   border: "rgba(232,98,26,0.2)"   },
  shipped:    { color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.2)"  },
  delivered:  { color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)"   },
  cancelled:  { color: "#8a8784", bg: "rgba(138,135,132,0.06)", border: "rgba(138,135,132,0.15)"},
};

function normalizeStatus(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "pending_payment" ? "pending" : s;
}

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?next=/account/orders");

  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id, created_at, status, total, subtotal, order_number,
      order_items (id, name, quantity)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const B = (s) => ({ fontFamily: "var(--font-caesar), sans-serif", ...s });
  const M = (s) => ({ fontFamily: "var(--font-stencil), monospace", ...s });

  return (
    <div className="orders-wrap">
      <style>{css}</style>

      <NavBar activePage="account" />

      <div className="orders-header">
        <div className="orders-header-inner">
          <div>
            <div style={M({ fontSize: 9, color: "#e8621a", letterSpacing: "0.25em", marginBottom: 6 })}>
              MY ACCOUNT
            </div>
            <div style={B({ fontSize: 40, letterSpacing: "0.04em", lineHeight: 1 })}>
              ORDER <span style={{ color: "#e8621a" }}>HISTORY</span>
            </div>
            <div style={{ fontSize: 13, color: "#8a8784", marginTop: 4 }}>
              {(orders ?? []).length} {(orders ?? []).length === 1 ? "order" : "orders"} placed
            </div>
          </div>
          <a
            href="/garage"
            style={{
              ...M({ fontSize: 9, letterSpacing: "0.12em" }),
              background: "#111010", border: "1px solid #2a2828",
              color: "#8a8784", padding: "8px 16px", borderRadius: 2,
              textDecoration: "none",
            }}
          >
            ← MY GARAGE
          </a>
        </div>
      </div>

      <div className="orders-body">
        {!orders?.length ? (
          <div className="orders-empty">
            <div style={B({ fontSize: 28, letterSpacing: "0.05em", color: "#3a3838", marginBottom: 8 })}>
              NO ORDERS YET
            </div>
            <div style={M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.14em", marginBottom: 24 })}>
              YOUR ORDER HISTORY WILL APPEAR HERE
            </div>
            <a
              href="/shop"
              style={{
                ...B({ fontSize: 16, letterSpacing: "0.1em" }),
                display: "inline-block",
                background: "#e8621a", border: "none", color: "#0a0909",
                padding: "10px 28px", borderRadius: 2, textDecoration: "none",
              }}
            >
              SHOP PARTS →
            </a>
          </div>
        ) : (
          orders.map((order, i) => {
            const status = normalizeStatus(order.status);
            const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
            const items = order.order_items ?? [];
            const preview = items.slice(0, 2);
            const remaining = items.length - preview.length;
            const orderNum = order.order_number ?? order.id?.slice(0, 8).toUpperCase();
            const dateStr = new Date(order.created_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            });

            return (
              <a
                key={order.id}
                href={`/order/${order.id}`}
                className="order-card"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="order-head">
                  {/* Order # */}
                  <div>
                    <div style={M({ fontSize: 8, color: "#8a8784", letterSpacing: "0.15em", marginBottom: 3 })}>
                      ORDER
                    </div>
                    <div className="order-num">#{orderNum}</div>
                  </div>

                  {/* Date */}
                  <div>
                    <div style={M({ fontSize: 8, color: "#8a8784", letterSpacing: "0.15em", marginBottom: 3 })}>
                      DATE
                    </div>
                    <div className="order-date">{dateStr}</div>
                  </div>

                  {/* Status */}
                  <div
                    className="order-status-pill"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                  >
                    <div className="status-dot" style={{ background: cfg.color }} />
                    <span style={{ color: cfg.color }}>{status.toUpperCase()}</span>
                  </div>

                  {/* Total */}
                  <div>
                    <div style={M({ fontSize: 8, color: "#8a8784", letterSpacing: "0.15em", marginBottom: 2, textAlign: "right" })}>
                      TOTAL
                    </div>
                    <div className="order-total">{formatMoney(order.total ?? 0)}</div>
                  </div>
                </div>

                {/* Items preview */}
                {items.length > 0 && (
                  <div className="order-items-preview">
                    {preview.map((item) => (
                      <div key={item.id} className="preview-item">
                        <strong>{item.quantity}×</strong> {item.name}
                      </div>
                    ))}
                    {remaining > 0 && (
                      <div className="preview-more">+{remaining} MORE</div>
                    )}
                  </div>
                )}

                <div className="order-arrow">VIEW ORDER DETAILS →</div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
