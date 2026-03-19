import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/money";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #e8621a; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fillLine {
    from { height: 0; }
    to   { height: 100%; }
  }

  .order-wrap {
    background: #0a0909;
    min-height: 100vh;
    color: #f0ebe3;
    font-family: 'Barlow Condensed', sans-serif;
    padding-bottom: 80px;
  }
  .order-wrap::before {
    content: '';
    position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.025) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none; z-index: 0;
  }

  /* HEADER */
  .order-header {
    background: #111010;
    border-bottom: 1px solid #2a2828;
    padding: 24px;
    position: relative; z-index: 1;
  }
  .order-header-inner {
    max-width: 900px; margin: 0 auto;
    display: flex; align-items: center;
    justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }

  /* BODY */
  .order-body {
    max-width: 900px;
    margin: 0 auto;
    padding: 28px 24px;
    position: relative; z-index: 1;
  }

  /* CARD */
  .card {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 12px;
    animation: fadeUp 0.3s ease both;
  }
  .card-head {
    padding: 14px 20px;
    border-bottom: 1px solid #1a1919;
    display: flex; align-items: center;
    justify-content: space-between;
  }
  .card-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px; letter-spacing: 0.07em;
  }
  .card-title span { color: #e8621a; }

  /* STATUS PILL */
  .status-pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 12px; border-radius: 2px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; letter-spacing: 0.18em;
  }
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%; flex-shrink: 0;
  }

  /* ITEMS */
  .item-row {
    display: grid;
    grid-template-columns: 60px 1fr auto;
    gap: 14px; align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid #1a1919;
    transition: background 0.15s;
  }
  .item-row:last-child { border-bottom: none; }
  .item-row:hover { background: rgba(255,255,255,0.01); }

  .item-thumb {
    width: 60px; height: 60px;
    background: #1a1919; border: 1px solid #2a2828; border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden; flex-shrink: 0;
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #3a3838; letter-spacing: 0.05em;
  }
  .item-thumb::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.06) 1px, transparent 1px);
    background-size: 10px 10px;
  }
  .item-name {
    font-size: 14px; font-weight: 700;
    color: #f0ebe3; margin-bottom: 5px; line-height: 1.3;
  }
  .item-qty {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(232,98,26,0.08);
    border: 1px solid rgba(232,98,26,0.15);
    border-radius: 2px; padding: 2px 8px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #e8621a; letter-spacing: 0.12em;
  }
  .item-price {
    text-align: right;
  }
  .item-price-main {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px; color: #f0ebe3; letter-spacing: 0.04em;
  }
  .item-price-unit {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.08em; margin-top: 2px;
  }

  /* SUMMARY */
  .summary-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 20px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; letter-spacing: 0.1em; color: #8a8784;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-total {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 16px 20px;
    border-top: 1px solid #2a2828;
    background: rgba(0,0,0,0.3);
  }

  /* TIMELINE */
  .timeline {
    padding: 20px 20px 10px;
    display: flex; flex-direction: column; gap: 0;
  }
  .timeline-step {
    display: flex; gap: 16px; padding-bottom: 24px;
    position: relative;
  }
  .timeline-step:last-child { padding-bottom: 0; }
  .timeline-step:last-child .timeline-line { display: none; }

  .timeline-node {
    display: flex; flex-direction: column;
    align-items: center; flex-shrink: 0;
    width: 20px;
  }
  .timeline-dot {
    width: 20px; height: 20px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; flex-shrink: 0;
    border: 2px solid;
    transition: all 0.2s;
  }
  .timeline-dot.done {
    background: #22c55e;
    border-color: #22c55e;
    box-shadow: 0 0 8px rgba(34,197,94,0.4);
    color: #0a0909;
  }
  .timeline-dot.active {
    background: #e8621a;
    border-color: #e8621a;
    box-shadow: 0 0 8px rgba(232,98,26,0.4);
    color: #0a0909;
  }
  .timeline-dot.pending {
    background: #1a1919;
    border-color: #2a2828;
    color: #3a3838;
  }
  .timeline-line {
    width: 2px;
    background: #2a2828;
    flex: 1; min-height: 20px;
    margin-top: 2px;
  }
  .timeline-line.done { background: #22c55e; }
  .timeline-line.active { background: linear-gradient(to bottom, #e8621a, #2a2828); }

  .timeline-content { padding-top: 0; }
  .timeline-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 16px; letter-spacing: 0.06em;
    color: #f0ebe3; line-height: 1;
    margin-bottom: 3px;
  }
  .timeline-label.pending-text { color: #3a3838; }
  .timeline-time {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.1em;
  }

  /* TRACKING */
  .tracking-block {
    padding: 14px 20px;
    display: flex; align-items: center;
    justify-content: space-between; flex-wrap: wrap; gap: 10px;
    border-top: 1px solid #1a1919;
    background: rgba(59,130,246,0.03);
  }
  .tracking-number {
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px; color: #3b82f6;
    letter-spacing: 0.12em;
  }

  /* ADDRESS GRID */
  .addr-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  .addr-grid.single { grid-template-columns: 1fr; }
  .addr-card {
    background: #111010; border: 1px solid #2a2828; border-radius: 3px; overflow: hidden;
  }
  .addr-card-head {
    padding: 10px 16px; border-bottom: 1px solid #1a1919;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 15px; letter-spacing: 0.07em;
  }
  .addr-card-head span { color: #e8621a; }
  .addr-card-body {
    padding: 12px 16px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784;
    letter-spacing: 0.1em; line-height: 1.8;
  }

  /* CTA */
  .cta-row {
    display: flex; gap: 10px; flex-wrap: wrap;
  }

  @media (max-width: 600px) {
    .item-row { grid-template-columns: 1fr auto; }
    .item-thumb { display: none; }
    .addr-grid { grid-template-columns: 1fr; }
    .cta-row { flex-direction: column; }
  }
`;

const STATUS_CONFIG = {
  pending:    { color: "#c9a84c", bg: "rgba(201,168,76,0.08)",  border: "rgba(201,168,76,0.2)"  },
  processing: { color: "#e8621a", bg: "rgba(232,98,26,0.08)",   border: "rgba(232,98,26,0.2)"   },
  shipped:    { color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.2)"  },
  delivered:  { color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)"   },
  cancelled:  { color: "#8a8784", bg: "rgba(138,135,132,0.06)", border: "rgba(138,135,132,0.15)"},
};

const TIMELINE_STEPS = [
  { key: "pending",    label: "Order Placed"       },
  { key: "processing", label: "Payment Confirmed"  },
  { key: "processing", label: "Being Prepared"     },
  { key: "shipped",    label: "Shipped"            },
  { key: "delivered",  label: "Delivered"          },
];

const STATUS_ORDER = ["pending", "processing", "shipped", "delivered"];

function getStepState(stepKey, currentStatus) {
  const stepIdx    = STATUS_ORDER.indexOf(stepKey);
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  if (stepIdx < currentIdx)  return "done";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

function normalizeStatus(status) {
  const s = String(status ?? "").toLowerCase();
  return s === "pending_payment" ? "pending" : s;
}

function addrEqual(a, b) {
  if (!a || !b) return false;
  return a.line1 === b.line1 && a.city === b.city && a.state === b.state;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default async function OrderPage({ params }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?next=/order/${id}`);

  const { data: order, error } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("id", id)
    .single();

  if (error || !order) {
    return (
      <div style={{ background: "#0a0909", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8784", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.15em" }}>
        ORDER NOT FOUND
      </div>
    );
  }

  const items        = order.order_items ?? [];
  const status       = normalizeStatus(order.status);
  const cfg          = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const orderNum     = order.order_number ?? order.id?.slice(0, 8).toUpperCase();
  const shipAddr     = order.shipping_address;
  const billAddr     = order.billing_address;
  const billDiffers  = !addrEqual(shipAddr, billAddr);

  const B = (s) => ({ fontFamily: "'Bebas Neue', sans-serif", ...s });
  const M = (s) => ({ fontFamily: "'Share Tech Mono', monospace", ...s });

  // Build timeline — dedupe steps by checking status progression
  const timelineSteps = [
    { label: "Order Placed",      stepStatus: "pending",    time: order.created_at },
    { label: "Payment Confirmed", stepStatus: "processing", time: status !== "pending" ? order.updated_at : null },
    { label: "Being Prepared",    stepStatus: "processing", time: status === "processing" ? order.updated_at : null },
    { label: "Shipped",           stepStatus: "shipped",    time: status === "shipped" || status === "delivered" ? order.shipped_at ?? null : null },
    { label: "Delivered",         stepStatus: "delivered",  time: status === "delivered" ? order.delivered_at ?? null : null },
  ];

  return (
    <div className="order-wrap">
      <style>{css}</style>

      <NavBar activePage="account" />

      {/* HEADER */}
      <div className="order-header">
        <div className="order-header-inner">
          <div>
            <div style={M({ fontSize: 9, color: "#e8621a", letterSpacing: "0.25em", marginBottom: 6 })}>
              ORDER DETAILS
            </div>
            <div style={B({ fontSize: 36, letterSpacing: "0.04em", lineHeight: 1 })}>
              ORDER <span style={{ color: "#e8621a" }}>#{orderNum}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <div
                className="status-pill"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
              >
                <div className="status-dot" style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
                <span style={{ color: cfg.color }}>{status.toUpperCase()}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a
              href="/account/orders"
              style={{
                ...M({ fontSize: 9, letterSpacing: "0.12em" }),
                background: "#111010", border: "1px solid #2a2828",
                color: "#8a8784", padding: "8px 16px", borderRadius: 2,
                textDecoration: "none",
              }}
            >
              ← ORDER HISTORY
            </a>
          </div>
        </div>
      </div>

      <div className="order-body">

        {/* ── TIMELINE ── */}
        <div className="card" style={{ animationDelay: "0s" }}>
          <div className="card-head">
            <div className="card-title">ORDER <span>TIMELINE</span></div>
            <div style={M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.1em" })}>
              {formatDate(order.created_at)}
            </div>
          </div>

          <div className="timeline">
            {timelineSteps.map((step, i) => {
              const state = getStepState(step.stepStatus, status);
              // For cancelled orders, mark everything as pending after placed
              const effectiveState = status === "cancelled" && i > 0 ? "pending" : state;
              return (
                <div key={i} className="timeline-step">
                  <div className="timeline-node">
                    <div className={`timeline-dot ${effectiveState}`}>
                      {effectiveState === "done"   ? "✓" :
                       effectiveState === "active" ? "●" : "○"}
                    </div>
                    <div className={`timeline-line ${effectiveState}`} />
                  </div>
                  <div className="timeline-content">
                    <div className={`timeline-label ${effectiveState === "pending" ? "pending-text" : ""}`}>
                      {step.label}
                    </div>
                    {step.time && (
                      <div className="timeline-time">{formatDate(step.time)}</div>
                    )}
                    {!step.time && effectiveState !== "pending" && (
                      <div className="timeline-time">—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tracking number */}
          {order.tracking_number && (
            <div className="tracking-block">
              <div>
                <div style={M({ fontSize: 8, color: "#8a8784", letterSpacing: "0.15em", marginBottom: 4 })}>
                  TRACKING NUMBER
                </div>
                <div className="tracking-number">{order.tracking_number}</div>
              </div>
              <a
                href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.tracking_number}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...M({ fontSize: 9, letterSpacing: "0.12em" }),
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(59,130,246,0.25)",
                  color: "#3b82f6",
                  padding: "7px 14px", borderRadius: 2,
                  textDecoration: "none",
                }}
              >
                TRACK PACKAGE →
              </a>
            </div>
          )}
        </div>

        {/* ── ORDER ITEMS + SUMMARY ── */}
        <div className="card" style={{ animationDelay: "0.05s" }}>
          <div className="card-head">
            <div className="card-title">ORDER <span>ITEMS</span></div>
            <div style={M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.1em" })}>
              {items.length} {items.length === 1 ? "ITEM" : "ITEMS"}
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", ...M({ fontSize: 9, color: "#8a8784", letterSpacing: "0.12em" }) }}>
              NO ITEMS FOUND
            </div>
          ) : (
            items.map((item) => {
              const unitPrice = item.price ?? 0;
              const qty = item.quantity ?? 1;
              return (
                <div key={item.id} className="item-row">
                  <div className="item-thumb">
                    <span style={{ position: "relative", zIndex: 1 }}>IMG</span>
                  </div>
                  <div>
                    <div className="item-name">{item.name ?? "Item"}</div>
                    <div className="item-qty">QTY: {qty}</div>
                  </div>
                  <div className="item-price">
                    <div className="item-price-main">{formatMoney(unitPrice * qty)}</div>
                    {qty > 1 && (
                      <div className="item-price-unit">{formatMoney(unitPrice)} EA</div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Summary */}
          <div style={{ borderTop: "1px solid #1a1919", background: "rgba(0,0,0,0.2)" }}>
            <div className="summary-row">
              <span>SUBTOTAL</span>
              <span style={{ color: "#f0ebe3" }}>{formatMoney(order.subtotal ?? 0)}</span>
            </div>
            <div className="summary-row" style={{ color: (order.shipping ?? 0) === 0 ? "#22c55e" : "#8a8784" }}>
              <span>SHIPPING</span>
              <span>{(order.shipping ?? 0) === 0 ? "FREE" : formatMoney(order.shipping)}</span>
            </div>
            <div className="summary-row">
              <span>TAX</span>
              <span style={{ color: "#f0ebe3" }}>{formatMoney(order.tax ?? 0)}</span>
            </div>
            {(order.discount ?? 0) > 0 && (
              <div className="summary-row" style={{ color: "#c9a84c" }}>
                <span>POINTS DISCOUNT</span>
                <span>−{formatMoney(order.discount)}</span>
              </div>
            )}
          </div>

          <div className="summary-total">
            <div style={B({ fontSize: 20, letterSpacing: "0.08em" })}>ORDER TOTAL</div>
            <div style={B({ fontSize: 34, color: "#f0ebe3", letterSpacing: "0.04em" })}>
              {formatMoney(order.total ?? 0)}
            </div>
          </div>
        </div>

        {/* ── ADDRESSES ── */}
        <div className={`addr-grid ${!billDiffers ? "single" : ""}`}>
          <div className="addr-card">
            <div className="addr-card-head">SHIPPING <span>ADDRESS</span></div>
            <div className="addr-card-body">
              {shipAddr ? (
                <>
                  <div>{shipAddr.line1}</div>
                  {shipAddr.line2 && <div>{shipAddr.line2}</div>}
                  <div>{shipAddr.city}, {shipAddr.state} {shipAddr.postal_code}</div>
                  <div>{shipAddr.country}</div>
                </>
              ) : (
                <div>NOT PROVIDED</div>
              )}
            </div>
          </div>
          {billDiffers && (
            <div className="addr-card">
              <div className="addr-card-head">BILLING <span>ADDRESS</span></div>
              <div className="addr-card-body">
                {billAddr ? (
                  <>
                    <div>{billAddr.line1}</div>
                    {billAddr.line2 && <div>{billAddr.line2}</div>}
                    <div>{billAddr.city}, {billAddr.state} {billAddr.postal_code}</div>
                    <div>{billAddr.country}</div>
                  </>
                ) : (
                  <div>SAME AS SHIPPING</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── CTA ── */}
        <div className="cta-row">
          <a
            href="/shop"
            style={{
              ...B({ fontSize: 16, letterSpacing: "0.1em" }),
              display: "inline-block",
              background: "#e8621a", border: "none", color: "#0a0909",
              padding: "11px 26px", borderRadius: 2, textDecoration: "none",
              boxShadow: "0 4px 20px rgba(232,98,26,0.25)",
              transition: "all 0.2s",
            }}
          >
            CONTINUE SHOPPING →
          </a>
          <a
            href="/account/orders"
            style={{
              ...B({ fontSize: 16, letterSpacing: "0.1em" }),
              display: "inline-block",
              background: "transparent", border: "1px solid #2a2828", color: "#8a8784",
              padding: "11px 26px", borderRadius: 2, textDecoration: "none",
              transition: "all 0.2s",
            }}
          >
            ← ORDER HISTORY
          </a>
        </div>

      </div>
    </div>
  );
}
