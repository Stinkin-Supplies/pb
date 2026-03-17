"use client";
// ============================================================
// components/CartContext.jsx
// ============================================================
// Global cart state — persists to BOTH localStorage AND Supabase.
//
// Strategy:
//   - localStorage: instant reads, works before auth check
//   - Supabase: persistent across devices, syncs on login
//
// On mount:
//   1. Load localStorage immediately (no flash)
//   2. Check if user is logged in
//   3. If logged in → load their Supabase cart, merge with local
//   4. All subsequent changes write to both localStorage + Supabase
// ============================================================

import {
  createContext, useContext, useState,
  useEffect, useCallback, useRef,
} from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CartContext = createContext(null);

// ── Supabase helpers ──────────────────────────────────────────

async function getOrCreateCart(userId) {
  // Find active cart
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Create new cart
  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId, status: "active" })
    .select("id")
    .single();

  if (error) { console.error("[Cart] create cart failed:", error.message); return null; }
  return created.id;
}

async function loadCartFromSupabase(userId) {
  const cartId = await getOrCreateCart(userId);
  if (!cartId) return [];

  const { data: items } = await supabase
    .from("cart_items")
    .select("id, quantity, products(id, slug, name, price, brand_name, primary_image_url)")
    .eq("cart_id", cartId);

  return (items ?? []).map(item => ({
    id:       item.products?.id,
    slug:     item.products?.slug,
    name:     item.products?.name,
    brand:    item.products?.brand_name ?? "Unknown",
    price:    Number(item.products?.price ?? 0),
    image:    item.products?.primary_image_url ?? null,
    mapPrice: null, // TODO: join vendor_products for MAP price
    qty:      item.quantity,
    cartItemId: item.id, // Supabase row id for updates/deletes
  }));
}

async function upsertCartItem(cartId, productId, qty) {
  if (!cartId || !productId) return;
  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { cart_id: cartId, product_id: productId, quantity: qty },
      { onConflict: "cart_id,product_id" }
    );
  if (error) console.error("[Cart] upsert item failed:", error.message);
}

async function deleteCartItem(cartId, productId) {
  if (!cartId || !productId) return;
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  if (error) console.error("[Cart] delete item failed:", error.message);
}

// ── Provider ──────────────────────────────────────────────────

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isOpen,    setIsOpen]    = useState(false);
  const [userId,    setUserId]    = useState(null);
  const cartIdRef   = useRef(null);   // Supabase cart row id
  const syncedRef   = useRef(false);  // prevent double-sync on mount

  // ── 1. Load localStorage immediately on mount ─────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ss_cart");
      if (saved) setCartItems(JSON.parse(saved));
    } catch (_) {}
  }, []);

  // ── 2. Check auth + sync with Supabase ────────────────────
  useEffect(() => {
    let mounted = true;

    const syncCart = async (uid) => {
      if (!uid || syncedRef.current) return;
      syncedRef.current = true;
      setUserId(uid);

      // Get/create cart
      const cId = await getOrCreateCart(uid);
      cartIdRef.current = cId;

      // Load Supabase cart
      const remoteItems = await loadCartFromSupabase(uid);

      if (!mounted) return;

      // Merge: local items take priority (user may have added while logged out)
      setCartItems(prev => {
        const merged = [...remoteItems];
        prev.forEach(localItem => {
          const exists = merged.find(r => r.id === localItem.id);
          if (!exists && localItem.id) merged.push(localItem);
          else if (exists && localItem.qty > exists.qty) {
            exists.qty = localItem.qty;
          }
        });
        // Persist merged to localStorage
        try { localStorage.setItem("ss_cart", JSON.stringify(merged)); } catch (_) {}
        // Sync local-only items up to Supabase
        prev.forEach(localItem => {
          if (localItem.id && cId) {
            upsertCartItem(cId, localItem.id, localItem.qty);
          }
        });
        return merged;
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) syncCart(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !syncedRef.current) {
        syncCart(session.user.id);
      }
      if (!session) {
        syncedRef.current = false;
        cartIdRef.current = null;
        setUserId(null);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // ── 3. Persist to localStorage on every change ───────────
  useEffect(() => {
    try { localStorage.setItem("ss_cart", JSON.stringify(cartItems)); } catch (_) {}
  }, [cartItems]);

  // ── Actions ───────────────────────────────────────────────

  const addItem = useCallback(async (product, qty = 1) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        const newQty = existing.qty + qty;
        // Update Supabase
        if (cartIdRef.current) upsertCartItem(cartIdRef.current, product.id, newQty);
        return prev.map(i => i.id === product.id ? { ...i, qty: newQty } : i);
      }
      // Add new item
      if (cartIdRef.current) upsertCartItem(cartIdRef.current, product.id, qty);
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
    setIsOpen(true);
  }, []);

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) return;
    setCartItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
    if (cartIdRef.current) upsertCartItem(cartIdRef.current, id, qty);
  }, []);

  const removeItem = useCallback((id) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
    if (cartIdRef.current) deleteCartItem(cartIdRef.current, id);
  }, []);

  const clearCart = useCallback(async () => {
    setCartItems([]);
    try { localStorage.removeItem("ss_cart"); } catch (_) {}
    if (cartIdRef.current) {
      await supabase.from("cart_items").delete().eq("cart_id", cartIdRef.current);
      await supabase.from("carts").update({ status: "completed" }).eq("id", cartIdRef.current);
      cartIdRef.current = null;
    }
  }, []);

  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const subtotal  = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{
      cartItems, isOpen, setIsOpen,
      addItem, updateQty, removeItem, clearCart,
      itemCount, subtotal, userId,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
