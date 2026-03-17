"use client";

import { useMemo, useState } from "react";
import NavBar from "@/components/NavBar";
import { useCart } from "@/components/CartContext";

export default function CheckoutPage() {
  const { cartItems } = useCart();

  const [points, setPoints] = useState(0);

  // 🔹 Calculations
  const subtotal = useMemo(() => {
    return cartItems.reduce(
      (acc, item) => acc + Number(item.price) * item.qty,
      0
    );
  }, [cartItems]);

  const shipping = subtotal >= 99 ? 0 : 5;
  const tax = subtotal * 0.07;

  const pointsValue = points * 0.01;

  const totalBeforeClamp = subtotal + shipping + tax - pointsValue;

  const total = Math.max(totalBeforeClamp, 0);

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    .checkout-wrap {
      min-height: 100vh;
      background: #0a0909;
      color: #f0ebe3;
      font-family: 'Barlow Condensed', sans-serif;
    }
    .checkout-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 28px 24px 60px;
      display: grid;
      grid-template-columns: 1fr 420px;
      gap: 24px;
    }
    .checkout-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 34px;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }
    .card {
      background: #111010;
      border: 1px solid #2a2828;
      border-radius: 3px;
      padding: 18px;
    }
    .card-title {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 20px;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    .label {
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      color: #8a8784;
      margin-bottom: 6px;
    }
    .input {
      width: 100%;
      height: 44px;
      background: #1a1919;
      border: 1px solid #2a2828;
      color: #f0ebe3;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 16px;
      padding: 0 12px;
      border-radius: 2px;
      outline: none;
    }
    .input:focus { border-color: #e8621a; }
    .muted {
      font-family: 'Share Tech Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      color: #8a8784;
      margin-top: 8px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: #f0ebe3;
    }
    .summary-row.muted { color: #8a8784; }
    .summary-divider {
      border: none;
      border-top: 1px solid #2a2828;
      margin: 12px 0;
    }
    .summary-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 24px;
      letter-spacing: 0.05em;
      margin-top: 6px;
    }
    .checkout-btn {
      width: 100%;
      height: 50px;
      background: #e8621a;
      border: none;
      color: #0a0909;
      font-family: 'Bebas Neue', sans-serif;
      font-size: 20px;
      letter-spacing: 0.1em;
      border-radius: 2px;
      cursor: pointer;
      margin-top: 12px;
      box-shadow: 0 4px 24px rgba(232,98,26,0.3);
      transition: all 0.2s;
    }
    .checkout-btn:hover { background: #c94f0f; transform: translateY(-1px); }
    .empty {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 24px;
      text-align: center;
      color: #8a8784;
    }
    @media (max-width: 900px) {
      .checkout-inner { grid-template-columns: 1fr; }
    }
  `;

  if (!cartItems.length) {
    return (
      <div className="checkout-wrap">
        <style>{css}</style>
        <NavBar activePage="shop" />
        <div className="empty">YOUR CART IS EMPTY</div>
      </div>
    );
  }

  return (
    <div className="checkout-wrap">
      <style>{css}</style>
      <NavBar activePage="shop" />
      <div className="checkout-inner">
        {/* LEFT */}
        <div>
          <div className="checkout-title">CHECKOUT</div>
          <div className="card">
            <div className="card-title">REDEEM <span style={{color:"#e8621a"}}>POINTS</span></div>
            <div className="label">POINTS TO APPLY</div>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="input"
            />
            <div className="muted">
              {points} PTS = ${pointsValue.toFixed(2)}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="card">
          <div className="card-title">ORDER <span style={{color:"#e8621a"}}>SUMMARY</span></div>
          {cartItems.map((item) => (
            <div key={item.id} className="summary-row">
              <span>{item.name} × {item.qty}</span>
              <span>${(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}

          <hr className="summary-divider" />

          <div className="summary-row muted">
            <span>SUBTOTAL</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row muted">
            <span>SHIPPING</span>
            <span>${shipping.toFixed(2)}</span>
          </div>
          <div className="summary-row muted">
            <span>TAX</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="summary-row" style={{color:"#c9a84c"}}>
            <span>POINTS DISCOUNT</span>
            <span>- ${pointsValue.toFixed(2)}</span>
          </div>

          <hr className="summary-divider" />

          <div className="summary-total">
            <span>ORDER TOTAL</span>
            <span>${total.toFixed(2)}</span>
          </div>

          <button
            className="checkout-btn"
            onClick={() => alert("Next: MAP enforcement")}
          >
            CONTINUE →
          </button>
        </div>
      </div>
    </div>
  );
}
