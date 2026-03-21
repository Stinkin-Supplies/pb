import { adminSupabase } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/utils/money";
function StatusPill({ status }) {
  const normalized =
    String(status ?? "").toLowerCase() === "pending_payment"
      ? "pending"
      : String(status ?? "").toLowerCase();

  const config = {
    pending:    { color: "#c9a84c", bg: "rgba(201,168,76,0.1)",   border: "rgba(201,168,76,0.3)"  },
    processing: { color: "#e8621a", bg: "rgba(232,98,26,0.1)",    border: "rgba(232,98,26,0.3)"   },
    shipped:    { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",   border: "rgba(59,130,246,0.3)"  },
    delivered:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    border: "rgba(34,197,94,0.3)"   },
    cancelled:  { color: "#8a8784", bg: "rgba(138,135,132,0.1)",  border: "rgba(138,135,132,0.2)" },
  };
  const { color, bg, border } = config[normalized] ?? config.pending;

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 3, padding: "5px 14px", marginTop: 8,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%", background: color,
        boxShadow: normalized !== "cancelled" ? `0 0 6px ${color}` : "none",
      }}/>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color, letterSpacing: "0.2em",
      }}>
        {normalized.toUpperCase()}
      </span>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #e8621a; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
    50%       { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
  }
  @keyframes shimmer {
    from { background-position: -200% center; }
    to   { background-position: 200% center; }
  }

  .success-page {
    background: #0a0909;
    min-height: 100vh;
    color: #f0ebe3;
    font-family: 'Barlow Condensed', sans-serif;
    padding: 0 0 80px;
    position: relative;
  }
  .success-page::before {
    content: '';
    position: fixed; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.025) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    z-index: 0;
  }

  .success-inner {
    position: relative;
    z-index: 1;
    max-width: 760px;
    margin: 0 auto;
    padding: 48px 20px 0;
  }

  /* ── HERO HEADER ── */
  .success-hero {
    text-align: center;
    animation: fadeUp 0.4s ease both;
  }
  .success-check {
    width: 64px; height: 64px;
    border-radius: 50%;
    background: rgba(34,197,94,0.1);
    border: 1px solid rgba(34,197,94,0.3);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
    animation: pulseGlow 2.5s ease infinite;
    font-size: 26px;
  }
  .success-eyebrow {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #e8621a;
    letter-spacing: 0.3em; margin-bottom: 10px;
  }
  .success-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 52px; letter-spacing: 0.05em; line-height: 1;
    color: #f0ebe3; margin-bottom: 6px;
  }
  .success-title span { color: #e8621a; }
  .success-order-num {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #8a8784;
    letter-spacing: 0.18em; margin-top: 12px;
  }
  .success-divider {
    height: 2px;
    background: linear-gradient(90deg, transparent, #e8621a, transparent);
    margin: 32px 0;
    opacity: 0.5;
  }

  /* ── CARDS ── */
  .card {
    background: #111010;
    border: 1px solid #2a2828;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 12px;
    animation: fadeUp 0.35s ease both;
  }
  .card-head {
    padding: 14px 20px;
    border-bottom: 1px solid #1a1919;
    display: flex; align-items: center; justify-content: space-between;
  }
  .card-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px; letter-spacing: 0.07em;
  }
  .card-title span { color: #e8621a; }

  /* ── ORDER ITEMS ── */
  .item-row {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid #1a1919;
    transition: background 0.15s;
  }
  .item-row:last-child { border-bottom: none; }
  .item-row:hover { background: rgba(255,255,255,0.01); }

  .item-img-box {
    width: 56px; height: 56px;
    background: #1a1919;
    border: 1px solid #2a2828;
    border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #3a3838; letter-spacing: 0.05em;
    flex-shrink: 0;
    position: relative; overflow: hidden;
  }
  .item-img-box::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.06) 1px, transparent 1px);
    background-size: 10px 10px;
  }

  .item-info { min-width: 0; }
  .item-name {
    font-size: 14px; font-weight: 700;
    color: #f0ebe3; line-height: 1.3;
    margin-bottom: 4px;
  }
  .item-qty-badge {
    display: inline-flex;
    align-items: center; gap: 5px;
    background: rgba(232,98,26,0.08);
    border: 1px solid rgba(232,98,26,0.15);
    border-radius: 2px;
    padding: 2px 8px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #e8621a; letter-spacing: 0.12em;
  }

  .item-price {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px; color: #f0ebe3;
    letter-spacing: 0.04em; white-space: nowrap;
    text-align: right;
  }
  .item-unit-price {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784;
    letter-spacing: 0.08em; margin-top: 2px;
    text-align: right;
  }

  /* ── SUMMARY ROWS (inside same card) ── */
  .summary-section {
    border-top: 1px solid #1a1919;
    background: rgba(0,0,0,0.2);
  }
  .summary-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 20px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; letter-spacing: 0.1em;
    color: #8a8784;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-row.free { color: #22c55e; }
  .summary-total {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 16px 20px 18px;
    border-top: 1px solid #2a2828;
    background: #0a0909;
  }
  .total-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px; letter-spacing: 0.08em; color: #f0ebe3;
  }
  .total-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 34px; color: #f0ebe3; letter-spacing: 0.04em;
  }

  /* ── POINTS EARNED (centered, below items) ── */
  .points-earned-block {
    text-align: center;
    padding: 20px;
    background: rgba(201,168,76,0.04);
    border: 1px solid rgba(201,168,76,0.15);
    border-radius: 3px;
    margin-bottom: 12px;
    animation: fadeUp 0.4s ease 0.1s both;
  }
  .points-earned-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784;
    letter-spacing: 0.2em; margin-bottom: 8px;
  }
  .points-earned-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 44px; letter-spacing: 0.06em; line-height: 1;
    background: linear-gradient(135deg, #c9a84c, #e8a020, #c9a84c);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 3s linear infinite;
  }
  .points-earned-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.15em;
    margin-top: 5px;
  }

  /* ── ADDRESS GRID ── */
  .addr-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
    animation: fadeUp 0.35s ease 0.15s both;
  }
  .addr-grid.single { grid-template-columns: 1fr; }
  .addr-card {
    background: #111010; border: 1px solid #2a2828; border-radius: 3px;
    overflow: hidden;
  }
  .addr-card-head {
    padding: 10px 16px;
    border-bottom: 1px solid #1a1919;
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

  /* ── CTA ── */
  .cta-row {
    display: flex; gap: 10px; flex-wrap: wrap;
    animation: fadeUp 0.35s ease 0.2s both;
  }
  .cta-primary {
    background: #e8621a; border: none; color: #0a0909;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 17px; letter-spacing: 0.1em;
    padding: 12px 28px; border-radius: 2px;
    cursor: pointer; text-decoration: none;
    transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(232,98,26,0.25);
  }
  .cta-primary:hover { background: #c94f0f; transform: translateY(-1px); }
  .cta-secondary {
    background: transparent; border: 1px solid #2a2828;
    color: #8a8784;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 17px; letter-spacing: 0.1em;
    padding: 12px 28px; border-radius: 2px;
    cursor: pointer; text-decoration: none;
    transition: all 0.2s;
  }
  .cta-secondary:hover { border-color: #e8621a; color: #e8621a; }

  @media (max-width: 600px) {
    .success-title { font-size: 38px; }
    .item-row { grid-template-columns: 1fr auto; }
    .item-img-box { display: none; }
    .addr-grid { grid-template-columns: 1fr; }
    .cta-row { flex-direction: column; }
    .cta-primary, .cta-secondary { text-align: center; }
  }
`;

function addrEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.line1 === b.line1 &&
    a.city === b.city &&
    a.state === b.state &&
    a.postal_code === b.postal_code
  );
}

export default async function SuccessPage({ searchParams }) {
  const params = await searchParams;
  const orderId = params?.order_id;

  if (!orderId) {
    return (
      <div style={{ background: "#0a0909", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8784", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.15em" }}>
        NO ORDER ID PROVIDED
      </div>
    );
  }

  const { data: order, error } = await adminSupabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return (
      <div style={{ background: "#0a0909", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8784", fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.15em" }}>
        ORDER NOT FOUND
      </div>
    );
  }

  const orderItems = order.order_items ?? [];
  const rawStatus = String(order.status ?? "").toLowerCase();
  const normalizedStatus = rawStatus === "pending_payment" ? "pending" : rawStatus;
  const pointsEarned = Math.floor((order.total ?? 0) / 100 * 10);

  const shipAddr = order.shipping_address;
  const billAddr = order.billing_address;
  const billDiffers = !addrEqual(shipAddr, billAddr);

  const orderNum = order.order_number ?? order.id?.slice(0, 8).toUpperCase();

  return (
    <div className="success-page">
      <style>{css}</style>

      <div className="success-inner">

        {/* HERO */}
        <div className="success-hero">
          <div className="success-check">✓</div>
          <div className="success-eyebrow">ORDER CONFIRMED</div>
          <div className="success-title">THANK YOU FOR<br/><span>YOUR ORDER</span></div>
          <div className="success-order-num">ORDER #{orderNum}</div>
          <StatusPill status={normalizedStatus} />
          {order.tracking_number && (
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: "#8a8784", letterSpacing: "0.15em", marginTop: 8 }}>
              TRACKING: {order.tracking_number}
            </div>
          )}
        </div>

        <div className="success-divider"/>

        {/* ITEMS + SUMMARY — COMBINED CARD */}
        <div className="card" style={{ animationDelay: "0.05s" }}>
          <div className="card-head">
            <div className="card-title">ORDER <span>DETAILS</span></div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: "#8a8784", letterSpacing: "0.1em" }}>
              {orderItems.length} {orderItems.length === 1 ? "ITEM" : "ITEMS"}
            </div>
          </div>

          {/* Items */}
          {orderItems.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: "#8a8784", letterSpacing: "0.12em" }}>
              NO ITEMS FOUND
            </div>
          ) : (
            orderItems.map((item) => {
              const unitPrice = item.price ?? 0;
              const qty = item.quantity ?? 1;
              const lineTotal = unitPrice * qty;
              return (
                <div key={item.id ?? `${item.name}-${qty}`} className="item-row">
                  <div className="item-img-box">
                    <span style={{ position: "relative", zIndex: 1 }}>IMG</span>
                  </div>
                  <div className="item-info">
                    <div className="item-name">{item.name ?? "Item"}</div>
                    <div className="item-qty-badge">QTY: {qty}</div>
                  </div>
                  <div>
                    <div className="item-price">{formatMoney(lineTotal)}</div>
                    {qty > 1 && (
                      <div className="item-unit-price">{formatMoney(unitPrice)} EA</div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Summary rows */}
          <div className="summary-section">
            <div className="summary-row">
              <span>SUBTOTAL</span>
              <span style={{ color: "#f0ebe3" }}>{formatMoney(order.subtotal)}</span>
            </div>
            <div className={`summary-row ${(order.shipping ?? 0) === 0 ? "free" : ""}`}>
              <span>SHIPPING</span>
              <span>{(order.shipping ?? 0) === 0 ? "FREE" : formatMoney(order.shipping)}</span>
            </div>
            <div className="summary-row">
              <span>TAX</span>
              <span style={{ color: "#f0ebe3" }}>{formatMoney(order.tax)}</span>
            </div>
            {(order.discount ?? 0) > 0 && (
              <div className="summary-row" style={{ color: "#c9a84c" }}>
                <span>POINTS DISCOUNT</span>
                <span>−{formatMoney(order.discount)}</span>
              </div>
            )}
          </div>

          <div className="summary-total">
            <div className="total-label">ORDER TOTAL</div>
            <div className="total-value">{formatMoney(order.total)}</div>
          </div>
        </div>

        {/* POINTS EARNED — centered, below order details */}
        <div className="points-earned-block">
          <div className="points-earned-label">POINTS EARNED THIS ORDER</div>
          <div className="points-earned-value">{pointsEarned.toLocaleString()} PTS</div>
          <div className="points-earned-sub">
            WORTH ${(pointsEarned * 0.01).toFixed(2)} · REDEEMABLE ON YOUR NEXT ORDER
          </div>
        </div>

        {/* ADDRESSES — only show billing if different */}
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

        {/* CTA */}
        <div className="cta-row">
          <a href="/shop" className="cta-primary">CONTINUE SHOPPING →</a>
          <a href={`/order/${order.id}`} className="cta-secondary">VIEW FULL ORDER</a>
        </div>

      </div>
    </div>
  );
}