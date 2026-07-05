"use client";
// ============================================================
// components/CartContext.jsx
// ============================================================
// Global cart state shared across all pages.
// Wraps the app in app/layout.jsx.
//
// Persists to localStorage — this is the actual source of truth (loaded on
// mount, read by everything downstream). The old Supabase carts/cart_items
// sync was write-only (nothing ever read it back) and has been removed.
//
// Auth state (userId) is still tracked here via Supabase — auth stays on
// Supabase per the architecture decision made when rebuilding checkout;
// it's only order/points data that moved to Postgres. userId is exposed via
// context for consumers like NavBar, and passed to checkout API calls
// (prepare/create-intent/orders-create) so points can be looked up/redeemed.
//
// Points balance now comes from Postgres (customer_points table) via
// /api/account/points, not the old Supabase user_profiles.points_balance
// column — that column is stale/unused now that orders/create is the only
// thing that actually earns or spends points.
// ============================================================

import {
  createContext, useContext, useState, useEffect,
  useCallback, useRef,
} from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartItems,     setCartItems]     = useState([]);
  const [isOpen,        setIsOpen]        = useState(false);
  const [userId,        setUserId]        = useState(null);
  const [pointsBalance, setPointsBalance] = useState(0);

  // ── Single Supabase client for this provider lifetime — auth only ───────
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createBrowserSupabaseClient();
  }

  // ── Load from localStorage on mount ──────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ss_cart");
      if (saved) setCartItems(JSON.parse(saved));
    } catch (_) {}
  }, []);

  // ── Track auth user ──────────────────────────────────────
  // Single subscription here — all consumers (NavBar etc.)
  // read userId from context instead of subscribing themselves.
  useEffect(() => {
    const supabase = supabaseRef.current;
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        // Ignore silent token refreshes — they don't change the user
        if (
          event === "SIGNED_IN"   ||
          event === "SIGNED_OUT"  ||
          event === "USER_UPDATED"
        ) {
          setUserId(session?.user?.id ?? null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Fetch points balance (Postgres, via /api/account/points) whenever
  // the user changes ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setPointsBalance(0); return; }
    let cancelled = false;
    fetch(`/api/account/points?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.ok ? res.json() : { pointsBalance: 0 })
      .then((data) => { if (!cancelled) setPointsBalance(data.pointsBalance ?? 0); })
      .catch(() => { if (!cancelled) setPointsBalance(0); });
    return () => { cancelled = true; };
  }, [userId]);

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
        // The field checkout actually keys off of — canonical_products
        // .canonical_sku, not catalog_unified.id/sku. Null for the ~2.3% of
        // products not yet canonical-matched; checkout/prepare will reject
        // those with a clear "no longer exists" error rather than silently
        // mis-charging, so surface that at the add-to-cart button instead
        // (disable/hide "add to cart" when canonicalSku is null) rather than
        // letting it reach checkout.
        canonicalSku: product.canonical_sku ?? product.canonicalSku ?? null,
        slug:     product.slug,
        name:     product.name,
        brand:    product.brand ?? product.brand_name ?? "",
        vendor:   product.vendor_slug ?? product.vendor ?? null,
        price:    product.price ?? 0,
        mapPrice: product.mapPrice ?? null,
        // store both so CartDrawer can resolve whichever is available
        image:    product.image
                    ?? (Array.isArray(product.images) && product.images.length > 0
                        ? product.images[0] : null),
        images:   product.images ?? [],
        qty,
      }];
    });
    setIsOpen(true);
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
      // Exposed so consumers (NavBar etc.) don't need their own
      // Supabase subscriptions — read auth state from here instead.
      userId,
      pointsBalance,
    }}>
      {children}
    </CartContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

// Safe version for components that may render outside CartProvider
const EMPTY_CART = {
  cartItems:  [],
  isOpen:     false,
  setIsOpen:  () => {},
  addItem:    () => {},
  updateQty:  () => {},
  removeItem: () => {},
  clearCart:  () => {},
  itemCount:  0,
  subtotal:   0,
  userId:        null, // ← matches shape of real context
  pointsBalance: 0,
};

export function useCartSafe() {
  try {
    return useCart();
  } catch {
    return EMPTY_CART;
  }
}
