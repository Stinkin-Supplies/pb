import { createClient } from "@supabase/supabase-js";
import { formatMoney } from "@/lib/utils/money";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function SuccessPage({ searchParams }) {
  const params = await searchParams;
  console.log("PARAMS:", params);
  const orderId = params?.order_id;
  console.log("ORDER ID:", orderId);

  if (!orderId) {
    return <div>No order ID provided.</div>;
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  console.log("ORDER DATA:", order);
  console.log("FETCH ERROR:", error);

  if (error || !order) {
    return <div>Order not found.</div>;
  }

  let orderItems = [];
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  if (!itemsError && items?.length) {
    orderItems = items;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-white success-wrap">
      <style>{`
        .success-wrap {
          min-height: 100vh;
          background: #0a0909;
          position: relative;
          font-family: 'Barlow Condensed', sans-serif;
          color: #f0ebe3;
        }
        .success-wrap::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(232,98,26,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(232,98,26,0.04) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
          z-index: 0;
        }
        .success-inner {
          position: relative;
          z-index: 1;
        }
        .success-header {
          text-align: center;
          border: 1px solid #2a2828;
          background: #111010;
          padding: 20px 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.35);
        }
        .success-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 36px;
          letter-spacing: 0.08em;
        }
        .success-sub {
          font-family: 'Share Tech Mono', monospace;
          color: #8a8784;
          font-size: 10px;
          letter-spacing: 0.12em;
          margin-top: 6px;
        }
        .success-status {
          color: #22c55e;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          margin-top: 6px;
        }
        .card {
          border: 1px solid #2a2828;
          background: #111010;
          padding: 18px 20px;
        }
        .card-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 20px;
          letter-spacing: 0.08em;
          margin-bottom: 12px;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #1a1919;
          padding: 10px 0;
        }
        .item-name {
          font-weight: 700;
        }
        .item-meta {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          color: #8a8784;
          letter-spacing: 0.1em;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          color: #c2b9b0;
        }
        .summary-total {
          display: flex;
          justify-content: space-between;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px;
          letter-spacing: 0.06em;
          margin-top: 12px;
        }
        .addr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }
        .addr-text {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          color: #8a8784;
          letter-spacing: 0.1em;
          line-height: 1.6;
        }
        .cta-wrap {
          text-align: center;
        }
        .cta-btn {
          display: inline-block;
          padding: 12px 28px;
          background: #e8621a;
          color: #0a0909;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 18px;
          letter-spacing: 0.1em;
          border: none;
          text-decoration: none;
        }
        .cta-btn:hover { background: #c94f0f; }

        @media (max-width: 640px) {
          .success-wrap { padding: 28px 16px; }
          .success-title { font-size: 28px; }
          .card { padding: 14px 16px; }
          .card-title { font-size: 18px; }
          .item-row { flex-direction: column; gap: 6px; }
          .summary-total { font-size: 20px; }
          .addr-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="success-inner">
        <div className="success-header">
          <div className="success-title">ORDER CONFIRMED</div>
          <div className="success-sub">THANK YOU FOR YOUR PURCHASE</div>
          <div className="success-sub">ORDER #{order.order_number || order.id}</div>
          <div className="success-status">STATUS: {order.status}</div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">ITEMS</div>
          {orderItems.length === 0 ? (
            <div className="item-meta">NO ITEMS FOUND</div>
          ) : (
            orderItems.map((item) => (
              <div
                key={item.id ?? `${item.name}-${item.quantity}`}
                className="item-row"
              >
                <div>
                  <div className="item-name">{item.name ?? "Item"}</div>
                  <div className="item-meta">QTY: {item.quantity ?? 1}</div>
                </div>
                <div>{formatMoney(item.unit_price ?? item.price ?? 0)}</div>
              </div>
            ))
          )}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">SUMMARY</div>
          <div className="summary-row">
            <span>SUBTOTAL</span>
            <span>{formatMoney(order.subtotal)}</span>
          </div>
          <div className="summary-row">
            <span>SHIPPING</span>
            <span>{formatMoney(order.shipping)}</span>
          </div>
          <div className="summary-row">
            <span>TAX</span>
            <span>{formatMoney(order.tax)}</span>
          </div>
          <div className="summary-total">
            <span>ORDER TOTAL</span>
            <span>{formatMoney(order.total)}</span>
          </div>
        </div>

        <div className="addr-grid" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-title">SHIPPING</div>
            {order.shipping_address ? (
              <div className="addr-text">
                <div>{order.shipping_address.line1}</div>
                {order.shipping_address.line2 && (
                  <div>{order.shipping_address.line2}</div>
                )}
                <div>
                  {order.shipping_address.city}, {order.shipping_address.state}{" "}
                  {order.shipping_address.postal_code}
                </div>
                <div>{order.shipping_address.country}</div>
              </div>
            ) : (
              <div className="addr-text">NO ADDRESS</div>
            )}
          </div>

          <div className="card">
            <div className="card-title">BILLING</div>
            {order.billing_address ? (
              <div className="addr-text">
                <div>{order.billing_address.line1}</div>
                {order.billing_address.line2 && (
                  <div>{order.billing_address.line2}</div>
                )}
                <div>
                  {order.billing_address.city}, {order.billing_address.state}{" "}
                  {order.billing_address.postal_code}
                </div>
                <div>{order.billing_address.country}</div>
              </div>
            ) : (
              <div className="addr-text">SAME AS SHIPPING</div>
            )}
          </div>
        </div>

        <div className="cta-wrap" style={{ marginTop: 20 }}>
          <a href="/shop" className="cta-btn">CONTINUE SHOPPING</a>
        </div>
      </div>
    </div>
  );
}
