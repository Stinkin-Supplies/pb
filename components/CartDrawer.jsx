"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NotifyMeButton from "@/components/NotifyMeButton";

const FREE_SHIPPING_THRESHOLD = 99;
const POINTS_TO_DOLLAR = 0.01;

const css = `
  /* ── OVERLAY ── */
  .drawer-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(4px);
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
    background: #0a0806;
    border-left: 1px solid rgba(197,167,34,0.18);
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
    border-bottom: 1px solid rgba(197,167,34,0.14);
    flex-shrink: 0;
    background: #080604;
  }
  .drawer-title {
    font-family: var(--font-tanker), sans-serif;
    font-size: 22px; letter-spacing: 0.04em; color: #f5f0e8;
    text-transform: uppercase;
  }
  .drawer-title-gold { color: #c9a84c; }
  .drawer-count {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.14em;
    margin-top: 3px; text-transform: uppercase;
  }
  .drawer-close {
    width: 30px; height: 30px;
    background: transparent;
    border: 1px solid rgba(197,167,34,0.25);
    color: #706860; font-size: 14px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.15s, color 0.15s; flex-shrink: 0;
  }
  .drawer-close:hover { border-color: #c9a84c; color: #c9a84c; }

  /* ── SHIPPING PROGRESS ── */
  .shipping-bar {
    padding: 10px 20px;
    background: #080604;
    border-bottom: 1px solid rgba(197,167,34,0.10);
    flex-shrink: 0;
  }
  .shipping-bar-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.12em;
    margin-bottom: 7px; display: flex; justify-content: space-between;
    text-transform: uppercase;
  }
  .shipping-bar-free { color: #5a9a5a; }
  .shipping-track {
    height: 2px; background: rgba(197,167,34,0.12); overflow: hidden;
  }
  .shipping-fill {
    height: 100%; background: #5a9a5a;
    transition: width 0.4s ease;
  }

  /* ── ITEMS ── */
  .drawer-items {
    flex: 1; overflow-y: auto;
    padding: 6px 0;
  }
  .drawer-items::-webkit-scrollbar { width: 2px; }
  .drawer-items::-webkit-scrollbar-thumb { background: rgba(197,167,34,0.30); }

  .cart-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid rgba(197,167,34,0.07);
    transition: background 0.12s;
    align-items: center;
  }
  .cart-item:hover { background: rgba(255,255,255,0.01); }

  .item-main {
    display: grid;
    grid-template-columns: 68px 1fr;
    gap: 12px;
    align-items: center;
    cursor: pointer;
    min-width: 0;
    color: inherit;
    text-decoration: none;
  }
  .item-main:hover .item-name { color: #c9a84c; }

  .item-img {
    width: 68px; height: 68px;
    background: #ffffff;
    border: 1px solid rgba(197,167,34,0.18);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; flex-shrink: 0; position: relative;
  }
  .item-img img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
  .item-img-placeholder {
    font-family: var(--font-stencil), monospace;
    font-size: 7px; color: #3a3838; letter-spacing: 0.08em;
  }

  .item-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .item-brand {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #8a7040; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .item-name {
    font-family: var(--font-bespoke), sans-serif;
    font-size: 12px; font-weight: 500; color: #f5f0e8;
    line-height: 1.3;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: color 0.12s;
  }
  .item-price {
    font-family: var(--font-tanker), sans-serif;
    font-size: 16px; color: #c9a84c; letter-spacing: 0.02em;
    margin-top: 3px;
  }
  .item-price-ea {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.08em; margin-left: 5px;
  }
  .item-map-note {
    font-family: var(--font-stencil), monospace;
    font-size: 7px; color: #c9a84c; letter-spacing: 0.10em;
  }

  .item-controls {
    display: flex;
    align-items: center;
    gap: 5px;
    justify-self: end;
    flex-direction: column;
    align-items: flex-end;
  }
  .item-qty-row {
    display: flex; align-items: center; gap: 5px;
  }
  .item-qty-btn {
    width: 22px; height: 22px;
    background: transparent;
    border: 1px solid rgba(197,167,34,0.20);
    color: #a09890; font-size: 14px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: border-color 0.15s, color 0.15s; flex-shrink: 0;
    line-height: 1;
  }
  .item-qty-btn:hover:not(:disabled) { border-color: #c9a84c; color: #c9a84c; }
  .item-qty-btn:disabled { opacity: 0.3; }
  .item-qty-val {
    font-family: var(--font-stencil), monospace;
    font-size: 12px; color: #f5f0e8; min-width: 18px; text-align: center;
  }
  .item-remove {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.10em; text-transform: uppercase;
    background: none; border: none; cursor: pointer;
    transition: color 0.15s; padding: 0;
  }
  .item-remove:hover { color: #c05050; }

  /* ── EMPTY STATE ── */
  .drawer-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 14px; padding: 40px 20px; text-align: center;
  }
  .drawer-empty-icon {
    width: 56px; height: 56px; opacity: 0.20;
    border: 2px solid rgba(197,167,34,0.40);
    display: flex; align-items: center; justify-content: center;
  }
  .drawer-empty-title {
    font-family: var(--font-tanker), sans-serif;
    font-size: 22px; letter-spacing: 0.04em; color: #3a3020; text-transform: uppercase;
  }
  .drawer-empty-sub {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #504838; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .drawer-empty-btn {
    margin-top: 8px;
    background: #c9a84c; border: none;
    color: #1a1208; font-family: var(--font-stencil), monospace;
    font-size: 10px; letter-spacing: 0.14em;
    padding: 11px 24px; cursor: pointer;
    transition: background 0.2s; text-transform: uppercase;
  }
  .drawer-empty-btn:hover { background: #b8963a; }

  /* ── POINTS REDEMPTION ── */
  .points-section {
    padding: 14px 20px;
    background: rgba(201,168,76,0.03);
    border-top: 1px solid rgba(201,168,76,0.10);
    border-bottom: 1px solid rgba(201,168,76,0.10);
    flex-shrink: 0;
  }
  .points-header {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 8px;
  }
  .points-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #c9a84c; letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .points-balance {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.10em;
  }
  .points-toggle {
    width: 30px; height: 16px;
    background: rgba(197,167,34,0.12);
    position: relative; cursor: pointer;
    transition: background 0.2s; flex-shrink: 0;
    border: 1px solid rgba(197,167,34,0.20);
  }
  .points-toggle.on { background: rgba(201,168,76,0.30); border-color: #c9a84c; }
  .points-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 10px; height: 10px;
    background: #706860; transition: left 0.2s, background 0.2s;
  }
  .points-toggle.on .points-thumb { left: 16px; background: #c9a84c; }
  .points-detail {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.10em;
    line-height: 1.6; text-transform: uppercase;
  }
  .points-detail .map-warn { color: #c9a84c; margin-top: 3px; display: block; }

  /* ── ORDER SUMMARY ── */
  .drawer-summary {
    padding: 16px 20px;
    border-top: 1px solid rgba(197,167,34,0.14);
    flex-shrink: 0;
    background: #080604;
  }
  .summary-row {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 7px;
  }
  .summary-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #706860; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .summary-value {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #a09890; letter-spacing: 0.08em;
    white-space: nowrap; text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .summary-value.green  { color: #5a9a5a; }
  .summary-value.gold   { color: #c9a84c; }
  .summary-divider {
    border: none; border-top: 1px solid rgba(197,167,34,0.12); margin: 10px 0;
  }
  .summary-total-row {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 16px;
  }
  .summary-total-label {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; letter-spacing: 0.12em; color: #a09890; text-transform: uppercase;
  }
  .summary-total-value {
    font-family: var(--font-tanker), sans-serif;
    font-size: 28px; color: #f5f0e8; letter-spacing: 0.02em;
    white-space: nowrap; text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── CHECKOUT BTN ── */
  .checkout-btn {
    width: 100%; height: 48px;
    background: #c9a84c; border: 2px solid #b8963a;
    color: #1a1208;
    font-family: var(--font-stencil), monospace;
    font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase;
    cursor: pointer; transition: background 0.15s;
    margin-bottom: 8px;
  }
  .checkout-btn:hover { background: #b8963a; }
  .continue-btn {
    width: 100%; height: 36px;
    background: transparent;
    border: 1px solid rgba(197,167,34,0.20);
    color: #706860;
    font-family: var(--font-stencil), monospace;
    font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .continue-btn:hover { border-color: #c9a84c; color: #c9a84c; }

  /* ── POINTS EARNED FOOTER ── */
  .points-earned-row {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 20px;
    background: rgba(201,168,76,0.03);
    border-top: 1px solid rgba(201,168,76,0.08);
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: rgba(201,168,76,0.55); letter-spacing: 0.12em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  @media (max-width: 520px) {
    .cart-item { grid-template-columns: 1fr; }
    .item-controls { justify-self: start; margin-left: 80px; }
  }
`;

export default function CartDrawer({ isOpen, onClose, cartItems, onUpdateQty, onRemove, pointsBalance = 0 }) {
  const [redeemPoints, setRedeemPoints] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const maxPointsDiscount = cartItems.reduce((sum, item) => {
    const itemTotal = item.price * item.qty;
    const mapFloor  = (item.mapPrice ?? item.price) * item.qty;
    return sum + Math.max(0, itemTotal - mapFloor);
  }, 0);

  const pointsValue    = pointsBalance * POINTS_TO_DOLLAR;
  const pointsDiscount = redeemPoints ? Math.min(pointsValue, maxPointsDiscount) : 0;
  const pointsUsed     = Math.ceil(pointsDiscount / POINTS_TO_DOLLAR);

  const shipping          = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 9.99;
  const total             = Math.max(0, subtotal - pointsDiscount + shipping);
  const shippingPct       = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const shippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const pointsEarned      = Math.floor(total * 10);
  const itemCount         = cartItems.reduce((sum, i) => sum + i.qty, 0);

  if (!isOpen) return null;

  return (
    <>
      <style>{css}</style>

      <div className="drawer-overlay" onClick={onClose} />

      <div className="drawer-panel">

        {/* ── Header ── */}
        <div className="drawer-header">
          <div>
            <div className="drawer-title">
              MY CART{' '}
              {cartItems.length > 0 && (
                <span className="drawer-title-gold">({itemCount})</span>
              )}
            </div>
            {cartItems.length > 0 && (
              <div className="drawer-count">
                {cartItems.length} {cartItems.length === 1 ? "LINE ITEM" : "LINE ITEMS"}
              </div>
            )}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        {/* ── Free shipping progress ── */}
        {cartItems.length > 0 && (
          <div className="shipping-bar">
            <div className="shipping-bar-label">
              {shipping === 0 ? (
                <span className="shipping-bar-free">✓ FREE SHIPPING UNLOCKED</span>
              ) : (
                <span>
                  ADD <span style={{ color: '#f5f0e8' }}>${shippingRemaining.toFixed(2)}</span> FOR FREE SHIPPING
                </span>
              )}
              <span>${FREE_SHIPPING_THRESHOLD}</span>
            </div>
            <div className="shipping-track">
              <div className="shipping-fill" style={{ width: `${shippingPct}%` }} />
            </div>
          </div>
        )}

        {/* ── Items or empty state ── */}
        {cartItems.length === 0 ? (
          <div className="drawer-empty">
            <div className="drawer-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="rgba(197,167,34,0.40)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
            </div>
            <div className="drawer-empty-title">Cart is empty</div>
            <div className="drawer-empty-sub">Add some parts to get started</div>
            <button
              className="drawer-empty-btn"
              onClick={() => { onClose(); window.location.href = "/browse"; }}
            >
              Browse Parts →
            </button>
          </div>
        ) : (
          <>
            {/* Items list */}
            <div className="drawer-items">
              {cartItems.map(item => (
                <div key={item.id} className="cart-item">
                  <Link
                    href={item.slug ? `/browse/${item.slug}` : "/browse"}
                    className="item-main"
                    onClick={() => onClose?.()}
                  >
                    {/* Image */}
                    <div className="item-img">
                      {(() => {
                        const src = item.image
                          ?? (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null);
                        return src
                          ? <img src={src} alt={item.name} />
                          : <span className="item-img-placeholder">NO IMG</span>;
                      })()}
                    </div>

                    {/* Body */}
                    <div className="item-body">
                      <div className="item-brand">{item.brand ?? item.brand_name ?? ""}</div>
                      <div className="item-name" title={item.name}>{item.name ?? "Product"}</div>
                      {item.mapPrice && item.price <= item.mapPrice && (
                        <div className="item-map-note">MAP PRICE APPLIED</div>
                      )}
                      <div className="item-price">
                        ${(item.price * item.qty).toFixed(2)}
                        {item.qty > 1 && (
                          <span className="item-price-ea">${item.price.toFixed(2)} EA</span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {!item.in_stock && (
                    <div style={{ padding: "0 0 0 80px", marginTop: 6 }}>
                      <NotifyMeButton
                        sku={item.sku}
                        productName={item.name}
                        vendor={item.vendor ?? "wps"}
                        source="cart"
                      />
                    </div>
                  )}

                  <div className="item-controls">
                    <div className="item-qty-row">
                      <button
                        className="item-qty-btn"
                        onClick={() => onUpdateQty(item.id, item.qty - 1)}
                        disabled={item.qty <= 1}
                      >−</button>
                      <span className="item-qty-val">{item.qty}</span>
                      <button
                        className="item-qty-btn"
                        onClick={() => onUpdateQty(item.id, item.qty + 1)}
                      >+</button>
                    </div>
                    <button className="item-remove" onClick={() => onRemove(item.id)}>
                      REMOVE
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Points redemption ── */}
            {pointsBalance > 0 && (
              <div className="points-section">
                <div className="points-header">
                  <div className="points-label">★ REDEEM POINTS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="points-balance">
                      {pointsBalance.toLocaleString()} PTS
                    </span>
                    <div
                      className={`points-toggle ${redeemPoints ? "on" : ""}`}
                      onClick={() => setRedeemPoints(r => !r)}
                      role="switch"
                      aria-checked={redeemPoints}
                    >
                      <div className="points-thumb" />
                    </div>
                  </div>
                </div>
                <div className="points-detail">
                  {redeemPoints
                    ? <>
                        USING {pointsUsed.toLocaleString()} PTS → SAVE ${pointsDiscount.toFixed(2)}
                        {pointsDiscount < pointsValue && (
                          <span className="map-warn">⚠ DISCOUNT LIMITED BY MAP PRICING</span>
                        )}
                      </>
                    : `${pointsBalance.toLocaleString()} PTS = $${pointsValue.toFixed(2)} — TOGGLE TO APPLY`
                  }
                </div>
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

              <hr className="summary-divider" />

              <div className="summary-total-row">
                <span className="summary-total-label">ORDER TOTAL</span>
                <span className="summary-total-value">${total.toFixed(2)}</span>
              </div>

              <button className="checkout-btn" onClick={() => { window.location.href = "/checkout"; }}>
                PROCEED TO CHECKOUT →
              </button>
              <button className="continue-btn" onClick={onClose}>
                CONTINUE SHOPPING
              </button>
            </div>

            {/* Points earned footer */}
            <div className="points-earned-row">
              ★ YOU&apos;LL EARN {pointsEarned.toLocaleString()} POINTS ON THIS ORDER
            </div>
          </>
        )}
      </div>
    </>
  );
}
