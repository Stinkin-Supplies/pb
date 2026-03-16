"use client";
// app/account/wishlist/WishlistClient.jsx
import { useState } from "react";
import NavBar from "@/components/NavBar";
import { useCartSafe } from "@/components/CartContext";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:#e8621a; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .wl-wrap { background:#0a0909; min-height:100vh; color:#f0ebe3; font-family:'Barlow Condensed',sans-serif; }
  .wl-header { background:#111010;border-bottom:1px solid #2a2828;padding:28px 24px; }
  .wl-header-inner { max-width:1000px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px; }
  .wl-body { max-width:1000px;margin:0 auto;padding:28px 24px; }
  .wl-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px; }
  .wl-card { background:#111010;border:1px solid #2a2828;border-radius:3px;overflow:hidden;transition:all 0.22s;animation:fadeUp 0.3s ease both; }
  .wl-card:hover { border-color:rgba(232,98,26,0.35);transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,0.4); }
  .wl-card-img { width:100%;aspect-ratio:4/3;background:#1a1919;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden; }
  .wl-card-img::before { content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(232,98,26,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(232,98,26,0.04) 1px,transparent 1px);background-size:16px 16px; }
  .wl-card-body { padding:14px; }
  .wl-brand { font-family:'Share Tech Mono',monospace;font-size:9px;color:#e8621a;letter-spacing:0.14em;margin-bottom:3px; }
  .wl-name { font-size:14px;font-weight:700;color:#f0ebe3;line-height:1.3;margin-bottom:8px; }
  .wl-price { font-family:'Bebas Neue',sans-serif;font-size:22px;color:#f0ebe3;letter-spacing:0.04em;margin-bottom:10px; }
  .wl-stock { font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.1em;margin-bottom:10px; }
  .wl-stock.in { color:#22c55e; }
  .wl-stock.out { color:#8a8784; }
  .wl-actions { display:flex;gap:8px; }
  .wl-add-btn { flex:1;background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:0.1em;padding:8px;border-radius:2px;cursor:pointer;transition:background 0.2s; }
  .wl-add-btn:hover { background:#c94f0f; }
  .wl-add-btn:disabled { background:#2a2828;color:#8a8784;cursor:not-allowed; }
  .wl-remove-btn { background:transparent;border:1px solid #2a2828;color:#8a8784;font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.1em;padding:8px 12px;border-radius:2px;cursor:pointer;transition:all 0.2s; }
  .wl-remove-btn:hover { border-color:#b91c1c;color:#ef4444; }
  .wl-notify { display:flex;align-items:center;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #1a1919; }
  .wl-notify-label { font-family:'Share Tech Mono',monospace;font-size:8px;color:#8a8784;letter-spacing:0.1em;flex:1; }
  .wl-toggle { width:28px;height:16px;border-radius:8px;position:relative;cursor:pointer;transition:background 0.2s;flex-shrink:0; }
  .wl-toggle.on { background:#e8621a; }
  .wl-toggle.off { background:#2a2828; }
  .wl-thumb { position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#f0ebe3;transition:left 0.2s; }
  .wl-toggle.on .wl-thumb { left:14px; }
  .wl-empty { padding:80px 20px;text-align:center; }
  .wl-empty-title { font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:0.05em;color:#3a3838;margin-bottom:8px; }
  .wl-empty-sub { font-family:'Share Tech Mono',monospace;font-size:9px;color:#8a8784;letter-spacing:0.12em;margin-bottom:20px; }
  .wl-empty-btn { background:#e8621a;border:none;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:0.1em;padding:10px 24px;border-radius:2px;cursor:pointer; }
  .toast { position:fixed;bottom:24px;right:24px;z-index:200;background:#22c55e;color:#0a0909;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:0.1em;padding:11px 22px;border-radius:2px;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:fadeUp 0.25s ease; }
`;

export default function WishlistClient({ userId, initialItems }) {
  const [items,  setItems]  = useState(initialItems);
  const [toast,  setToast]  = useState(null);
  const { addItem } = useCartSafe();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleRemove = async (wishlistId) => {
    await supabase.from("wishlists").delete().eq("id", wishlistId);
    setItems(prev => prev.filter(i => i.wishlistId !== wishlistId));
    showToast("Removed from wishlist");
  };

  const handleToggleNotify = async (wishlistId, current) => {
    await supabase.from("wishlists").update({ notify_in_stock: !current }).eq("id", wishlistId);
    setItems(prev => prev.map(i => i.wishlistId === wishlistId ? { ...i, notifyInStock: !current } : i));
  };

  const handleAddToCart = (item) => {
    if (!item.inStock) return;
    addItem(item);
    showToast(`${item.name.split(" ").slice(0,3).join(" ")} added to cart`);
    // TODO Phase 4: write to Supabase cart_items
  };

  const B = s => ({ fontFamily:"'Bebas Neue',sans-serif",     ...s });
  const M = s => ({ fontFamily:"'Share Tech Mono',monospace", ...s });

  return (
    <div className="wl-wrap">
      <style>{css}</style>

      <NavBar activePage="account" />

      {/* HEADER */}
      <div className="wl-header">
        <div className="wl-header-inner">
          <div>
            <div style={M({fontSize:9, color:"#e8621a", letterSpacing:"0.25em", marginBottom:6})}>MY ACCOUNT</div>
            <div style={B({fontSize:40, letterSpacing:"0.04em", lineHeight:1})}>
              WISH<span style={{color:"#e8621a"}}>LIST</span>
            </div>
            <div style={{fontSize:13, color:"#8a8784", marginTop:4}}>{items.length} {items.length === 1 ? "item" : "items"} saved</div>
          </div>
          <a href="/shop" style={{...B({fontSize:15, letterSpacing:"0.1em"}), background:"#e8621a", color:"#0a0909", padding:"10px 20px", borderRadius:2, textDecoration:"none"}}>
            BROWSE PARTS →
          </a>
        </div>
      </div>

      {/* BODY */}
      <div className="wl-body">
        {items.length === 0 ? (
          <div className="wl-empty">
            <div style={{fontSize:40, marginBottom:16, opacity:0.2}}>♡</div>
            <div className="wl-empty-title">YOUR WISHLIST IS EMPTY</div>
            <div className="wl-empty-sub">SAVE PARTS YOU WANT TO BUY LATER</div>
            <button className="wl-empty-btn" onClick={() => window.location.href = "/shop"}>
              BROWSE PARTS
            </button>
          </div>
        ) : (
          <div className="wl-grid">
            {items.map((item, i) => (
              <div key={item.wishlistId} className="wl-card" style={{animationDelay:`${i*0.04}s`}}>
                <div className="wl-card-img" onClick={() => window.location.href = `/shop/${item.slug}`} style={{cursor:"pointer"}}>
                  <span style={M({fontSize:8, color:"#3a3838", letterSpacing:"0.1em", position:"relative", zIndex:1})}>NO IMAGE</span>
                </div>
                <div className="wl-card-body">
                  <div className="wl-brand">{item.brand}</div>
                  <div className="wl-name" onClick={() => window.location.href = `/shop/${item.slug}`} style={{cursor:"pointer"}}>{item.name}</div>
                  <div className="wl-price">${item.price.toFixed(2)}</div>
                  <div className={`wl-stock ${item.inStock?"in":"out"}`}>
                    {item.inStock ? "✓ IN STOCK" : "✗ OUT OF STOCK"}
                  </div>
                  <div className="wl-actions">
                    <button className="wl-add-btn" disabled={!item.inStock} onClick={() => handleAddToCart(item)}>
                      {item.inStock ? "ADD TO CART" : "OUT OF STOCK"}
                    </button>
                    <button className="wl-remove-btn" onClick={() => handleRemove(item.wishlistId)}>✕</button>
                  </div>
                  {!item.inStock && (
                    <div className="wl-notify">
                      <span className="wl-notify-label">NOTIFY WHEN BACK IN STOCK</span>
                      <div
                        className={`wl-toggle ${item.notifyInStock?"on":"off"}`}
                        onClick={() => handleToggleNotify(item.wishlistId, item.notifyInStock)}
                      >
                        <div className="wl-thumb"/>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="toast">✓ {toast.toUpperCase()}</div>}
    </div>
  );
}
