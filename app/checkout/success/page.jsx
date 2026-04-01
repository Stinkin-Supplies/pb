"use client";

import { useEffect } from "react";
import { useCart } from "@/components/CartContext";
import NavBar from "@/components/NavBar";

export default function CheckoutSuccessPage() {
  const { clearCart } = useCart();

  useEffect(() => {
    // Clear cart on successful payment
    clearCart();
    // Also clear localStorage directly as a safety net
    try { localStorage.removeItem("ss_cart"); } catch (_) {}
  }, [clearCart]);

  return (
    <div style={{ background:"#0a0909", minHeight:"100vh", color:"#f0ebe3",
                  fontFamily:"var(--font-stencil),sans-serif" }}>
      <NavBar />
      <div style={{ maxWidth:600, margin:"0 auto", padding:"80px 24px", textAlign:"center" }}>
        <div style={{ fontFamily:"var(--font-caesar),sans-serif", fontSize:52,
                      letterSpacing:"0.05em", color:"#22c55e", marginBottom:12 }}>
          ORDER CONFIRMED
        </div>
        <div style={{ fontFamily:"var(--font-stencil),monospace", fontSize:11,
                      color:"#8a8784", letterSpacing:"0.15em", marginBottom:32 }}>
          YOUR ORDER HAS BEEN PLACED SUCCESSFULLY
        </div>
        <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
          <a href="/shop" style={{ background:"#e8621a", border:"none", color:"#0a0909",
            fontFamily:"var(--font-caesar),sans-serif", fontSize:18, letterSpacing:"0.1em",
            padding:"12px 28px", borderRadius:2, textDecoration:"none" }}>
            CONTINUE SHOPPING
          </a>
          <a href="/account/orders" style={{ background:"#111010", border:"1px solid #2a2828",
            color:"#f0ebe3", fontFamily:"var(--font-caesar),sans-serif", fontSize:18,
            letterSpacing:"0.1em", padding:"12px 28px", borderRadius:2, textDecoration:"none" }}>
            VIEW ORDERS
          </a>
        </div>
      </div>
    </div>
  );
}
