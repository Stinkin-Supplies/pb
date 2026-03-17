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

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getGuestCart, clearGuestCart } from "@/lib/guestCart";

const supabase = createBrowserSupabaseClient();

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isOpen,    setIsOpen]    = useState(false);
  const [userId,    setUserId]    = useState(null);
  const cartIdRef = useRef(null);
  const prevItemsRef = useRef([]);
  const syncingRef = useRef(false);
  const mergedForUserRef = useRef(null);

  // ── Load from localStorage on mount ──────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ss_cart");
      if (saved) setCartItems(JSON.parse(saved));
    } catch (_) {}
  }, []);

  const mergeGuestCartOnLogin = useCallback(async (id) => {
    if (!id || mergedForUserRef.current === id) return;
    const guest = getGuestCart();
    if (!guest.length) {
      mergedForUserRef.current = id;
      return;
    }
    const res = await fetch("/api/cart/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: guest }),
    });
    if (!res.ok) {
      console.error("Cart merge failed:", await res.text());
      return;
    }
    clearGuestCart();
    mergedForUserRef.current = id;
  }, []);

  useEffect(() => {
    if (!userId) return;
    mergeGuestCartOnLogin(userId);
  }, [mergeGuestCartOnLogin, userId]);

  // ── Track auth user ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Persist to localStorage on every change ───────────────
  useEffect(() => {
    try {
      localStorage.setItem("ss_cart", JSON.stringify(cartItems));
    } catch (_) {}
  }, [cartItems]);

  const ensureCartId = useCallback(async () => {
    if (!userId) return null;
    if (cartIdRef.current) return cartIdRef.current;

    const { data: existing, error: fetchErr } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!fetchErr && existing?.id) {
      cartIdRef.current = existing.id;
      return existing.id;
    }

    const { data: created, error: createErr } = await supabase
      .from("carts")
      .insert({ user_id: userId, status: "active" })
      .select("id")
      .single();

    if (createErr) {
      console.warn("CartContext: unable to create cart", createErr);
      return null;
    }

    cartIdRef.current = created.id;
    return created.id;
  }, [userId]);

  // ── Sync cart to Supabase on every change ────────────────
  useEffect(() => {
    if (!userId) return;
    if (syncingRef.current) return;

    const sync = async () => {
      syncingRef.current = true;
      try {
        const cartId = await ensureCartId();
        if (!cartId) return;

        const prevIds = new Set(prevItemsRef.current.map(i => i.id));
        const nextIds = new Set(cartItems.map(i => i.id));
        const removedIds = [...prevIds].filter(id => !nextIds.has(id));

        if (removedIds.length) {
          await supabase
            .from("cart_items")
            .delete()
            .eq("cart_id", cartId)
            .in("product_id", removedIds);
        }

        if (cartItems.length === 0) {
          prevItemsRef.current = cartItems;
          return;
        }

        const rows = cartItems.map(i => ({
          cart_id: cartId,
          product_id: i.id,
          quantity: i.qty,
          unit_price: i.price,
        }));

        const { error: upsertErr } = await supabase
          .from("cart_items")
          .upsert(rows, { onConflict: "cart_id,product_id" });

        if (upsertErr) {
          console.warn("CartContext: unable to sync cart_items", upsertErr);
        }

        prevItemsRef.current = cartItems;
      } finally {
        syncingRef.current = false;
      }
    };

    sync();
  }, [cartItems, ensureCartId, userId]);

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

const EMPTY_CART = {
  cartItems: [],
  isOpen: false,
  setIsOpen: () => {},
  addItem: () => {},
  updateQty: () => {},
  removeItem: () => {},
  clearCart: () => {},
  itemCount: 0,
  subtotal: 0,
};

export function useCartSafe() {
  try {
    return useCart();
  } catch {
    return EMPTY_CART;
  }
}
