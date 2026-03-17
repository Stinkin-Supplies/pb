"use client";
// ============================================================
// components/CartDrawer.jsx
// ============================================================
// Slide-in cart drawer — sits on top of every page.
// Triggered by cart icon in nav.
//
// Features:
//   - Line items with qty controls + remove
//   - Points redemption toggle (MAP floor enforced)
//   - Free shipping progress bar
//   - Order summary with MAP-safe total
//   - Persistent via localStorage until Phase 3 auth
//
// TODO Phase 3 (auth live):
//   - Replace localStorage cart with db.getOrCreateCart()
//   - Pull points balance from user_profiles
//   - Write cart_items to Supabase on every change
//
// TODO Phase 4 (checkout):
//   - "Proceed to Checkout" → /checkout
//   - Pass cart state + points redemption to checkout page
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const FREE_SHIPPING_THRESHOLD = 99;

const css = `
  /* ── OVERLAY ── */
  .drawer-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(3px);
    animation: overlayIn 0.2s ease;
  }
  @keyframes overlayIn {
    from { opacity:0; }
    to   { opacity:1; }
  }

  /* ── DRAWER PANEL ── */
  .drawer-panel {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 420px; max-width: 100vw;
    background: #111010;
    border-left: 1px solid #2a2828;
    display: flex; flex-direction: column;
    z-index: 201;
    animation: drawerIn 0.28s cubic-bezier(0.32,0.72,0,1);
  }
  @keyframes drawerIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }

  /* ── HEADER ── */
  .drawer-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px;
    border-bottom: 1px solid #2a2828;
    flex-shrink: 0;
  }
  .drawer-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 24px; letter-spacing: 0.06em; color: #f0ebe3;
  }
  .drawer-title span { color: #e8621a; }
  .drawer-count {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.15em;
    margin-top: 2px;
  }
  .drawer-close {
    width: 32px; height: 32px;
    background: #1a1919; border: 1px solid #2a2828;
    color: #8a8784; font-size: 16px;
    border-radius: 2px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0;
  }
  .drawer-close:hover { border-color: #e8621a; color: #e8621a; }

  /* ── SHIPPING PROGRESS ── */
  .shipping-bar {
    padding: 10px 20px;
    background: #0a0909;
    border-bottom: 1px solid #2a2828;
    flex-shrink: 0;
  }
  .shipping-bar-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.12em;
    margin-bottom: 6px; display: flex;
    justify-content: space-between;
  }
  .shipping-bar-label span { color: #22c55e; }
  .shipping-track {
    height: 3px; background: #2a2828; border-radius: 2px; overflow: hidden;
  }
  .shipping-fill {
    height: 100%; background: #22c55e;
    border-radius: 2px; transition: width 0.4s ease;
  }

  /* ── ITEMS ── */
  .drawer-items {
    flex: 1; overflow-y: auto;
    padding: 8px 0;
  }
  .drawer-items::-webkit-scrollbar { width: 3px; }
  .drawer-items::-webkit-scrollbar-thumb { background: #e8621a; }

  .cart-item {
    display: grid;
    grid-template-columns: 72px 1fr auto;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid #1a1919;
    transition: background 0.15s;
    align-items: center;
  }
  .cart-item:hover { background: rgba(255,255,255,0.01); }

  .item-main {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 12px;
    align-items: center;
    cursor: pointer;
    min-width: 0;
  }

  .item-img {
    width: 72px; height: 72px;
    background: #1a1919; border: 1px solid #2a2828;
    border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0; position: relative;
  }
  .item-img::before {
    content: ''; position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.05) 1px, transparent 1px);
    background-size: 12px 12px;
  }
  .item-img img { width: 100%; height: 100%; object-fit: cover; }
  .item-img-placeholder {
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #3a3838; letter-spacing: 0.08em;
    position: relative; z-index: 1;
  }

  .item-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .item-brand {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #e8621a; letter-spacing: 0.14em;
  }
  .item-name {
    font-size: 13px; font-weight: 700; color: #f0ebe3;
    line-height: 1.3; letter-spacing: 0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .item-price-row { margin-top: 4px; }
  .item-price {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px; color: #f0ebe3; letter-spacing: 0.04em;
  }
  .item-controls { display: flex; align-items: center; gap: 6px; }
  .item-qty-btn {
    width: 24px; height: 24px;
    background: #1a1919; border: 1px solid #2a2828;
    color: #f0ebe3; font-size: 14px; border-radius: 2px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0;
  }
  .item-qty-btn:hover { border-color: #e8621a; color: #e8621a; }
  .item-qty-val {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 16px; color: #f0ebe3; min-width: 20px; text-align: center;
  }
  .item-remove {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.1em;
    background: none; border: none; cursor: pointer;
    transition: color 0.15s; padding: 0; margin-left: 4px;
  }
  .item-remove:hover { color: #b91c1c; }
  .item-map-note {
    font-family: 'Share Tech Mono', monospace;
    font-size: 7px; color: #c9a84c; letter-spacing: 0.1em; margin-top: 2px;
  }

  /* ── EMPTY STATE ── */
  .drawer-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px; padding: 40px 20px; text-align: center;
  }
  .drawer-empty-icon { font-size: 40px; opacity: 0.3; }
  .drawer-empty-title {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 24px; letter-spacing: 0.05em; color: #3a3838;
  }
  .drawer-empty-sub {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.12em;
  }
  .drawer-empty-btn {
    margin-top: 8px; background: #e8621a; border: none;
    color: #0a0909; font-family: 'Bebas Neue', sans-serif;
    font-size: 16px; letter-spacing: 0.1em;
    padding: 10px 24px; border-radius: 2px; cursor: pointer;
    transition: background 0.2s;
  }
  .drawer-empty-btn:hover { background: #c94f0f; }

  /* ── POINTS REDEMPTION ── */
  .points-section {
    margin: 0; padding: 14px 20px;
    background: rgba(201,168,76,0.04);
    border-top: 1px solid rgba(201,168,76,0.1);
    border-bottom: 1px solid rgba(201,168,76,0.1);
    flex-shrink: 0;
  }
  .points-header {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 8px;
  }
  .points-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #c9a84c; letter-spacing: 0.16em;
    display: flex; align-items: center; gap: 6px;
  }
  .points-balance {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.1em;
  }
  .points-toggle {
    width: 32px; height: 18px; border-radius: 9px;
    background: #2a2828; position: relative;
    cursor: pointer; transition: background 0.2s; flex-shrink: 0;
  }
  .points-toggle.on { background: #c9a84c; }
  .points-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    background: #f0ebe3; transition: left 0.2s;
  }
  .points-toggle.on .points-thumb { left: 16px; }
  .points-detail {
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.1em;
    line-height: 1.5;
  }
  .points-detail .map-warn {
    color: #c9a84c; margin-top: 3px; display: block;
  }

  /* ── ORDER SUMMARY ── */
  .drawer-summary {
    padding: 16px 20px;
    border-top: 1px solid #2a2828;
    flex-shrink: 0; background: #0a0909;
  }
  .summary-row {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 8px;
  }
  .summary-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.12em;
  }
  .summary-value {
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #f0ebe3; letter-spacing: 0.1em;
  }
  .summary-value.green  { color: #22c55e; }
  .summary-value.gold   { color: #c9a84c; }
  .summary-value.orange { color: #e8621a; }
  .summary-divider {
    border: none; border-top: 1px solid #2a2828; margin: 10px 0;
  }
  .summary-total-row {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 16px;
  }
  .summary-total-label {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 18px; letter-spacing: 0.06em; color: #f0ebe3;
  }
  .summary-total-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 28px; color: #f0ebe3; letter-spacing: 0.04em;
  }

  /* ── CHECKOUT BTN ── */
  .checkout-btn {
    width: 100%; height: 50px;
    background: #e8621a; border: none;
    color: #0a0909; font-family: 'Bebas Neue', sans-serif;
    font-size: 22px; letter-spacing: 0.1em;
    border-radius: 2px; cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 24px rgba(232,98,26,0.3);
    margin-bottom: 10px;
  }
  .checkout-btn:hover {
    background: #c94f0f;
    box-shadow: 0 6px 32px rgba(232,98,26,0.45);
    transform: translateY(-1px);
  }
  .continue-btn {
    width: 100%; height: 38px;
    background: transparent; border: 1px solid #2a2828;
    color: #8a8784; font-family: 'Bebas Neue', sans-serif;
    font-size: 15px; letter-spacing: 0.1em;
    border-radius: 2px; cursor: pointer; transition: all 0.2s;
  }
  .continue-btn:hover { border-color: #e8621a; color: #e8621a; }

  /* ── POINTS EARNED FOOTER ── */
  .points-earned-row {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 20px;
    background: rgba(201,168,76,0.04);
    border-top: 1px solid rgba(201,168,76,0.08);
    font-family: 'Share Tech Mono', monospace;
    font-size: 8px; color: #c9a84c; letter-spacing: 0.12em;
    flex-shrink: 0;
  }
`;

// ── MOCK POINTS BALANCE ───────────────────────────────────────
// TODO Phase 3: replace with user_profiles.points_balance from Supabase
const MOCK_POINTS_BALANCE = 2840;
const POINTS_TO_DOLLAR    = 0.01; // 100 points = $1

export default function CartDrawer({ isOpen, onClose, cartItems, onUpdateQty, onRemove }) {
  const [redeemPoints, setRedeemPoints] = useState(false);
  const router = useRouter();

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── Calculations ─────────────────────────────────────────
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  // MAP enforcement: points discount can never bring ANY item below its MAP price.
  // We calculate max allowable discount across all items.
  const maxPointsDiscount = cartItems.reduce((sum, item) => {
    const itemTotal  = item.price * item.qty;
    const mapFloor   = (item.mapPrice ?? item.price) * item.qty;
    return sum + Math.max(0, itemTotal - mapFloor);
  }, 0);

  // How much the user's points are worth in dollars
  const pointsValue       = MOCK_POINTS_BALANCE * POINTS_TO_DOLLAR;
  // Cap discount at the smaller of: points value OR MAP floor limit
  const pointsDiscount    = redeemPoints ? Math.min(pointsValue, maxPointsDiscount) : 0;
  const pointsUsed        = Math.ceil(pointsDiscount / POINTS_TO_DOLLAR);

  const shipping          = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 9.99;
  const total             = Math.max(0, subtotal - pointsDiscount + shipping);
  const shippingPct       = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const shippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  // Points earned on this order (before any redemption)
  const pointsEarned      = Math.floor(total * 10);

  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });
  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });

  const handleItemClick = useCallback((item) => {
    if (!item?.slug) return;
    onClose?.();
    router.push(`/shop/${item.slug}`);
  }, [onClose, router]);

  if (!isOpen) return null;

  return (
    <>
      <style>{css}</style>

      {/* Overlay */}
      <div className="drawer-overlay" onClick={onClose}/>

      {/* Panel */}
      <div className="drawer-panel">

        {/* ── Header ── */}
        <div className="drawer-header">
          <div>
            <div className="drawer-title">
              MY CART {cartItems.length > 0 && <span>({itemCount})</span>}
            </div>
            {cartItems.length > 0 && (
              <div className="drawer-count">
                {cartItems.length} {cartItems.length === 1 ? "ITEM" : "ITEMS"}
              </div>
            )}
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Free shipping progress ── */}
        {cartItems.length > 0 && (
          <div className="shipping-bar">
            <div className="shipping-bar-label">
              {shipping === 0
                ? <span>✓ FREE SHIPPING UNLOCKED</span>
                : <span style={{color:"#8a8784"}}>
                    ADD <span style={{color:"#f0ebe3"}}>${shippingRemaining.toFixed(2)}</span> FOR FREE SHIPPING
                  </span>
              }
              <span style={{color:"#8a8784"}}>${FREE_SHIPPING_THRESHOLD}</span>
            </div>
            <div className="shipping-track">
              <div className="shipping-fill" style={{width:`${shippingPct}%`}}/>
            </div>
          </div>
        )}

        {/* ── Items or empty state ── */}
        {cartItems.length === 0 ? (
          <div className="drawer-empty">
            <div className="drawer-empty-icon">🛒</div>
            <div className="drawer-empty-title">YOUR CART IS EMPTY</div>
            <div className="drawer-empty-sub">ADD SOME PARTS TO GET STARTED</div>
            <button
              className="drawer-empty-btn"
              onClick={() => {
                onClose();
                window.location.href = "/shop";
              }}
            >
              BROWSE PARTS
            </button>
          </div>
        ) : (
          <>
            {/* Items list */}
            <div className="drawer-items">
              {cartItems.map(item => (
                <div key={item.id} className="cart-item">
                  <div
                    className="item-main"
                    role="link"
                    tabIndex={0}
                    onClick={() => handleItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleItemClick(item);
                      }
                    }}
                  >
                    {/* Image */}
                    <div className="item-img">
                      {item.image
                        ? <img src={item.image} alt={item.name}/>
                        : <span className="item-img-placeholder">NO IMG</span>
                      }
                    </div>

                    {/* Body */}
                    <div className="item-body">
                      <div className="item-brand">{item.brand}</div>
                      <div className="item-name" title={item.name}>{item.name}</div>

                      {/* MAP note if price is at floor */}
                      {item.mapPrice && item.price <= item.mapPrice && (
                        <div className="item-map-note">MAP PRICE APPLIED</div>
                      )}

                      <div className="item-price-row">
                        <div className="item-price">
                          ${(item.price * item.qty).toFixed(2)}
                          {item.qty > 1 && (
                            <span style={M({fontSize:8, color:"#8a8784", marginLeft:5})}>
                              ${item.price.toFixed(2)} EA
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="item-controls">
                    <button className="item-qty-btn" onClick={() => onUpdateQty(item.id, item.qty - 1)} disabled={item.qty <= 1}>−</button>
                    <span className="item-qty-val">{item.qty}</span>
                    <button className="item-qty-btn" onClick={() => onUpdateQty(item.id, item.qty + 1)}>+</button>
                    <button className="item-remove" onClick={() => onRemove(item.id)}>REMOVE</button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Points redemption ── */}
            {MOCK_POINTS_BALANCE > 0 && (
              <div className="points-section">
                <div className="points-header">
                  <div className="points-label">
                    ★ REDEEM POINTS
                  </div>
                  <div style={{display:"flex", alignItems:"center", gap:8}}>
                    <span className="points-balance">
                      {MOCK_POINTS_BALANCE.toLocaleString()} PTS AVAILABLE
                    </span>
                    <div
                      className={`points-toggle ${redeemPoints?"on":""}`}
                      onClick={() => setRedeemPoints(r => !r)}
                    >
                      <div className="points-thumb"/>
                    </div>
                  </div>
                </div>
                {redeemPoints && (
                  <div className="points-detail">
                    USING {pointsUsed.toLocaleString()} PTS → SAVE ${pointsDiscount.toFixed(2)}
                    {pointsDiscount < pointsValue && (
                      <span className="map-warn">
                        ⚠ DISCOUNT LIMITED BY MAP PRICING POLICY
                      </span>
                    )}
                  </div>
                )}
                {!redeemPoints && (
                  <div className="points-detail">
                    YOUR {MOCK_POINTS_BALANCE.toLocaleString()} PTS ARE WORTH ${pointsValue.toFixed(2)} — TOGGLE TO APPLY
                  </div>
                )}
              </div>
            )}

            {/* ── Order summary ── */}
            <div className="drawer-summary">
              <div className="summary-row">
                <span className="summary-label">SUBTOTAL</span>
                <span className="summary-value">${subtotal.toFixed(2)}</span>
              </div>

              {redeemPoints && pointsDiscount > 0 && (
                <div className="summary-row">
                  <span className="summary-label">POINTS DISCOUNT</span>
                  <span className="summary-value gold">−${pointsDiscount.toFixed(2)}</span>
                </div>
              )}

              <div className="summary-row">
                <span className="summary-label">SHIPPING</span>
                <span className={`summary-value ${shipping === 0 ? "green" : ""}`}>
                  {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
                </span>
              </div>

              <hr className="summary-divider"/>

              <div className="summary-total-row">
                <span className="summary-total-label">ORDER TOTAL</span>
                <span className="summary-total-value">${total.toFixed(2)}</span>
              </div>

              <button
                className="checkout-btn"
                onClick={() => window.location.href = "/checkout"}
              >
                PROCEED TO CHECKOUT →
              </button>

              <button className="continue-btn" onClick={onClose}>
                CONTINUE SHOPPING
              </button>
            </div>

            {/* Points earned footer */}
            <div className="points-earned-row">
              ★ YOU'LL EARN {pointsEarned.toLocaleString()} POINTS ON THIS ORDER
            </div>
          </>
        )}
      </div>
    </>
  );
}
