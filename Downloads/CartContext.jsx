"use client";
// ============================================================
// components/CartContext.jsx
// ============================================================
// Global cart state shared across all pages.
// Wraps the app in app/layout.jsx.
//
// Persists to localStorage so cart survives page navigation.
// TODO Phase 3: sync to Supabase cart_items table on change.
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isOpen,    setIsOpen]    = useState(false);

  // ── Load from localStorage on mount ──────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ss_cart");
      if (saved) setCartItems(JSON.parse(saved));
    } catch (_) {}
  }, []);

  // ── Persist to localStorage on every change ───────────────
  useEffect(() => {
    try {
      localStorage.setItem("ss_cart", JSON.stringify(cartItems));
    } catch (_) {}
  }, [cartItems]);

  // ── Actions ───────────────────────────────────────────────
  const addItem = useCallback((product, qty = 1) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.id === product.id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [...prev, {
        id:       product.id,
        slug:     product.slug,
        name:     product.name,
        brand:    product.brand,
        price:    product.price,
        mapPrice: product.mapPrice ?? null,
        image:    product.image    ?? null,
        qty,
      }];
    });
    setIsOpen(true); // open drawer on add
  }, []);

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) return;
    setCartItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }, []);

  const removeItem = useCallback((id) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const subtotal  = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{
      cartItems,
      isOpen, setIsOpen,
      addItem, updateQty, removeItem, clearCart,
      itemCount, subtotal,
    }}>
      {children}
    </CartContext.Provider>
  );
}

// Hook — use this in any client component
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
