"use client";
// ============================================================
// app/shop/[slug]/ProductDetailClient.jsx
// ============================================================
// Full product detail page UI:
//   - Image gallery with thumbnail rail
//   - Fitment check badge (ACES — lights up Phase 5)
//   - Price / MAP display
//   - Points earned preview
//   - Add to cart with quantity selector
//   - Specs table
//   - Related products strip
//
// TODO Phase 3: pull SAVED_VEHICLE from Supabase user_garage
//               via useUser() once auth is built
// TODO Phase 5: fitmentIds populated by ACES vendor sync
// ============================================================

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import NavBar from "@/components/NavBar";
import { useCartSafe } from "@/components/CartContext";
import NotifyMeButton from "@/components/NotifyMeButton";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getProductImage, filterImageUrls } from "@/lib/getProductImage";
import { proxyAllImages, primaryImage } from "@/lib/imageProxy";

// Saved garage vehicle — hardcoded until Phase 3 auth
const SAVED_VEHICLE = { id:1, year:2022, make:"Harley-Davidson", model:"Road King" };

const css = `
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

  .pdp-wrap {
    background: #0a0909;
    min-height: 100vh;
    color: #f0ebe3;
    font-family: var(--font-stencil), sans-serif;
  }

  /* ── BREADCRUMB ── */
  .pdp-breadcrumb {
    background: #111010;
    border-bottom: 1px solid #2a2828;
    padding: 10px 24px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.15em;
    display: flex; align-items: center; gap: 6px;
  }
  .pdp-breadcrumb a { color: #8a8784; text-decoration: none; transition: color 0.2s; }
  .pdp-breadcrumb a:hover { color: #e8621a; }
  .pdp-breadcrumb .sep { color: #3a3838; }
  .pdp-breadcrumb .current { color: #f0ebe3; }

  /* ── MAIN LAYOUT ── */
  .pdp-main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px;
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: 48px;
  }

  /* ── GALLERY ── */
  .gallery-col {}
  .gallery-main {
    width: 100%;
    aspect-ratio: 1;
    background: #ffffff;
    border: 1px solid #2a2828;
    border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden; cursor: zoom-in;
    margin-bottom: 10px;
  }
  .gallery-main::before {
    content: '';
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.04) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .gallery-main img {
    width: 100%; height: 100%; object-fit: contain; position: relative; z-index: 1;
  }
  .gallery-placeholder {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #3a3838; letter-spacing: 0.15em;
    position: relative; z-index: 1;
  }
  .gallery-badge {
    position: absolute; top: 12px; left: 12px; z-index: 2;
    font-family: var(--font-stencil), monospace;
    font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
    padding: 4px 9px; border-radius: 1px;
  }
  .gallery-badge.sale { background: #b91c1c; color: #fff; }
  .gallery-badge.new  { background: #c9a84c; color: #0a0909; }

  .gallery-thumbs {
    display: flex; gap: 8px; flex-wrap: wrap;
  }
  .gallery-thumb {
    width: 72px; height: 72px;
    background: #1a1919;
    border: 1px solid #2a2828;
    border-radius: 2px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: border-color 0.2s; overflow: hidden;
    flex-shrink: 0;
  }
  .gallery-thumb.active { border-color: #e8621a; }
  .gallery-thumb:hover  { border-color: rgba(232,98,26,0.4); }
  .gallery-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .gallery-thumb-placeholder {
    font-family: var(--font-stencil), monospace;
    font-size: 7px; color: #3a3838; letter-spacing: 0.05em;
  }

  /* ── INFO COL ── */
  .info-col { display: flex; flex-direction: column; gap: 0; }

  .info-brand {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #e8621a; letter-spacing: 0.2em;
    margin-bottom: 8px;
  }
  .info-name {
    font-family: var(--font-stencil), monospace;
    font-size: 38px; line-height: 0.95; letter-spacing: 0.03em;
    color: #f0ebe3; margin-bottom: 14px;
  }
  .info-sku {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.15em;
    margin-bottom: 20px;
  }

  /* fitment badge */
  .fitment-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px;
    border-radius: 2px; margin-bottom: 20px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px; letter-spacing: 0.14em;
  }
  .fitment-badge.fits {
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.25);
    color: #22c55e;
  }
  .fitment-badge.no-data {
    background: rgba(138,135,132,0.08);
    border: 1px solid rgba(138,135,132,0.15);
    color: #8a8784;
  }
  .fitment-badge.no-fit {
    background: rgba(185,28,28,0.08);
    border: 1px solid rgba(185,28,28,0.2);
    color: #ef4444;
  }
  .fitment-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  .fitment-badge.fits    .fitment-dot { background: #22c55e; box-shadow: 0 0 5px #22c55e; }
  .fitment-badge.no-data .fitment-dot { background: #8a8784; }
  .fitment-badge.no-fit  .fitment-dot { background: #ef4444; }

  /* price block */
  .price-block { margin-bottom: 20px; }
  .price-was {
    font-family: var(--font-stencil), sans-serif;
    font-size: 14px; color: #8a8784;
    text-decoration: line-through; margin-bottom: 2px;
  }
  .price-main {
    font-family: var(--font-stencil), monospace;
    font-size: 52px; color: #f0ebe3;
    letter-spacing: 0.03em; line-height: 1;
  }
  .price-map-note {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; color: #8a8784; letter-spacing: 0.12em;
    margin-top: 4px;
  }
  .price-points {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(201,168,76,0.08);
    border: 1px solid rgba(201,168,76,0.2);
    padding: 5px 11px; border-radius: 2px; margin-top: 8px;
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #c9a84c; letter-spacing: 0.12em;
  }

  /* stock indicator */
  .stock-row {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 20px;
  }
  .stock-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .stock-dot.in  { background: #22c55e; box-shadow: 0 0 5px #22c55e; }
  .stock-dot.out { background: #8a8784; }
  .stock-label {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; letter-spacing: 0.14em;
  }
  .stock-label.in  { color: #22c55e; }
  .stock-label.out { color: #8a8784; }
  .stock-qty {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.1em;
  }

  /* qty + add */
  .purchase-row {
    display: flex; gap: 10px; margin-bottom: 14px;
  }
  .qty-wrap {
    display: flex; align-items: center;
    border: 1px solid #2a2828; border-radius: 2px;
    overflow: hidden; flex-shrink: 0;
  }
  .qty-btn {
    width: 36px; height: 48px;
    background: #1a1919; border: none;
    color: #f0ebe3; font-size: 18px;
    cursor: pointer; transition: background 0.15s;
    display: flex; align-items: center; justify-content: center;
  }
  .qty-btn:hover:not(:disabled) { background: #2a2828; }
  .qty-btn:disabled { color: #3a3838; cursor: not-allowed; }
  .qty-val {
    width: 44px; height: 48px;
    background: #111010; border: none;
    color: #f0ebe3; font-family: var(--font-stencil), monospace;
    font-size: 20px; letter-spacing: 0.05em;
    text-align: center; outline: none;
    display: flex; align-items: center; justify-content: center;
    line-height: 1;
  }
  .add-to-cart-btn {
    flex: 1; height: 48px;
    background: #e8621a; border: none;
    color: #0a0909;
    font-family: var(--font-caesar), sans-serif;
    font-size: 22px; letter-spacing: 0.1em;
    border-radius: 2px; cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 24px rgba(232,98,26,0.25);
  }
  .add-to-cart-btn:hover:not(:disabled) {
    background: #c94f0f;
    box-shadow: 0 6px 32px rgba(232,98,26,0.4);
    transform: translateY(-1px);
  }
  .add-to-cart-btn:disabled {
    background: #2a2828; color: #8a8784;
    cursor: not-allowed; box-shadow: none; transform: none;
  }
  .add-to-cart-btn.added {
    background: #22c55e; color: #0a0909;
  }

  .wishlist-btn {
    height: 48px; width: 48px;
    background: #111010; border: 1px solid #2a2828;
    color: #8a8784; font-size: 18px;
    border-radius: 2px; cursor: pointer;
    transition: all 0.2s; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .wishlist-btn:hover { border-color: #e8621a; color: #e8621a; }
  .wishlist-btn.active { border-color: #e8621a; color: #e8621a; background: rgba(232,98,26,0.06); }

  /* perks strip */
  .perks-strip {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 8px; margin-bottom: 24px;
  }
  .perk {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px;
    background: #111010; border: 1px solid #2a2828;
    border-radius: 2px;
  }
  .perk-icon { font-size: 16px; flex-shrink: 0; }
  .perk-text {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784; letter-spacing: 0.1em; line-height: 1.4;
  }
  .perk-text strong { color: #f0ebe3; display: block; }

  /* divider */
  .pdp-divider {
    border: none; border-top: 1px solid #2a2828;
    margin: 20px 0;
  }

  /* ── SPECS TABLE ── */
  .specs-section { margin-top: 48px; }
  .specs-title {
    font-family: var(--font-stencil), monospace;
    font-size: 26px; letter-spacing: 0.05em;
    color: #f0ebe3; margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #2a2828;
  }
  .specs-title span { color: #e8621a; }
  .specs-table { width: 100%; border-collapse: collapse; }
  .specs-table tr:nth-child(odd) td { background: #111010; }
  .specs-table td {
    padding: 10px 14px;
    font-size: 14px; font-weight: 500;
    border-bottom: 1px solid #1a1919;
    vertical-align: top;
  }
  .specs-table td:first-child {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784;
    letter-spacing: 0.15em; text-transform: uppercase;
    width: 160px; white-space: nowrap;
  }
  .specs-table td:last-child { color: #f0ebe3; }

  /* ── RELATED ── */
  .related-section {
    max-width: 1200px; margin: 0 auto;
    padding: 0 24px 60px;
  }
  .related-head {
    display: flex; align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid #2a2828;
    padding-bottom: 14px; margin-bottom: 20px;
  }
  .related-title {
    font-family: var(--font-stencil), monospace;
    font-size: 30px; letter-spacing: 0.05em;
  }
  .related-title span { color: #e8621a; }
  .related-link {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #8a8784;
    letter-spacing: 0.15em; cursor: pointer;
    text-decoration: none; transition: color 0.2s;
  }
  .related-link:hover { color: #e8621a; }
  .related-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .related-card {
    background: #111010; border: 1px solid #2a2828;
    border-radius: 2px; overflow: hidden;
    cursor: pointer; transition: all 0.22s;
  }
  .related-card:hover {
    border-color: rgba(232,98,26,0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(0,0,0,0.4);
  }
  .related-img {
    width: 100%; aspect-ratio: 4/3;
    background: #1a1919;
    display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .related-img::before {
    content: ''; position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(232,98,26,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,98,26,0.04) 1px, transparent 1px);
    background-size: 16px 16px;
  }
  .related-body { padding: 11px 13px; }
  .related-brand {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #e8621a; letter-spacing: 0.14em; margin-bottom: 4px;
  }
  .related-name {
    font-size: 13px; font-weight: 700;
    color: #f0ebe3; line-height: 1.3; margin-bottom: 8px;
  }
  .related-footer { display: flex; justify-content: space-between; align-items: center; }
  .related-price {
    font-family: var(--font-stencil), monospace;
    font-size: 20px; color: #f0ebe3; letter-spacing: 0.04em;
  }
  .related-oos-badge {
    position: absolute; bottom: 7px; left: 7px; z-index: 2;
    font-family: var(--font-stencil), monospace;
    font-size: 7px; color: #8a8784; letter-spacing: 0.1em;
    background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 1px;
  }
  .related-notify-btn {
    width: 100%; margin-top: 8px;
    padding: 6px 10px;
    background: transparent; border: 1px solid #e8621a;
    color: #e8621a; border-radius: 2px; cursor: pointer;
    font-family: var(--font-stencil), monospace;
    font-size: 8px; letter-spacing: 0.1em;
    transition: all 0.15s;
  }
  .related-notify-btn:hover { background: rgba(232,98,26,0.1); }
  .related-notify-btn.done {
    border-color: #22c55e; color: #22c55e;
    background: rgba(34,197,94,0.08); cursor: default;
  }

  /* ── TOAST ── */
  .toast {
    position: fixed; bottom: 24px; right: 24px; z-index: 200;
    background: #22c55e; color: #0a0909;
    font-family: var(--font-caesar), sans-serif;
    font-size: 16px; letter-spacing: 0.1em;
    padding: 12px 24px; border-radius: 2px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: toastIn 0.25s ease;
  }
  @keyframes toastIn {
    from { opacity:0; transform:translateY(12px); }
    to   { opacity:1; transform:translateY(0); }
  }

  @media (max-width: 860px) {
    .pdp-main { grid-template-columns: 1fr; gap: 28px; }
    .info-name { font-size: 30px; }
    .price-main { font-size: 40px; }
  }
`;

export default function ProductDetailClient({ product, relatedProducts = [], fetchError = null }) {
  const [activeImg,  setActiveImg]  = useState(0);
  const [qty,        setQty]        = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistToast, setWishlistToast] = useState(null);
  const [added,      setAdded]      = useState(false);
  const [toast,      setToast]      = useState(false);
  const { addItem } = useCartSafe();
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createBrowserSupabaseClient();
  }
  const supabase = supabaseRef.current;

  // ── Fitment check ──────────────────────────────────────────
  // Phase 5: fitmentIds will be an array of vehicle IDs from ACES data.
  // Until vendor sync runs, fitmentIds is null → show "no data" state.
  const fitmentStatus =
    !product.fitmentIds                         ? "no-data" :
    product.fitmentIds.includes(SAVED_VEHICLE.id) ? "fits"    : "no-fit";

  const fitmentLabel = {
    "fits":    `✓ FITS YOUR ${SAVED_VEHICLE.year} ${SAVED_VEHICLE.make} ${SAVED_VEHICLE.model}`,
    "no-fit":  `✗ DOES NOT FIT YOUR ${SAVED_VEHICLE.year} ${SAVED_VEHICLE.make}`,
    "no-data": `FITMENT DATA PENDING — ADD TO VERIFY`,
  }[fitmentStatus];

  // ── Add to cart ────────────────────────────────────────────
  const handleAdd = () => {
    if (!product.inStock) return;
    setAdded(true);
    // Ensure cart item has a resolved image
    addItem({
      ...product,
      image: images[0] ?? product.image ?? null,
      images: images,
    }, qty);
    setToast(true);
    // TODO Phase 2 (cart drawer):
    //   await db.getOrCreateCart()
    //   await supabase.from('cart_items').upsert({
    //     cart_id, product_id: product.id, quantity: qty
    //   })
    setTimeout(() => setAdded(false), 2000);
    setTimeout(() => setToast(false),  2500);
  };

  // ── Wishlist (Supabase) ────────────────────────────────────
  const showWishlistToast = (msg) => {
    setWishlistToast(msg);
    setTimeout(() => setWishlistToast(null), 2000);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) setWishlisted(false);
        return;
      }
      const { data, error } = await supabase
        .from("wishlists")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("product_sku", product.sku)
        .maybeSingle();
      if (!mounted) return;
      if (!error && data?.user_id) setWishlisted(true);
      else setWishlisted(false);
    };
    load();
    return () => { mounted = false; };
  }, [product.id]);

  const handleWishlistToggle = async () => {
    if (wishlistBusy) return;
    setWishlistBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }

      if (wishlisted) {
        const { error } = await supabase
          .from("wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("product_sku", product.sku);
        if (!error) {
          setWishlisted(false);
          showWishlistToast("Removed from wishlist");
        } else {
          console.warn("Wishlist remove failed:", error.message);
          showWishlistToast("Could not remove");
        }
      } else {
        const { error } = await supabase
          .from("wishlists")
          .insert({
            user_id: user.id,
            product_sku: product.sku,
            product_name: product.name,
            notify_in_stock: !product.inStock,
          });
        if (!error) {
          setWishlisted(true);
          showWishlistToast("Saved to wishlist");
        } else {
          console.warn("Wishlist add failed:", error.message);
          showWishlistToast("Could not save");
        }
      }
    } finally {
      setWishlistBusy(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────
  const WPS_DOMAINS = ["cdn.wpsstatic.com", "asset.lemansnet.com"];
  const isWpsCdn = (url) => {
    try { return WPS_DOMAINS.some(d => new URL(url).hostname.includes(d)); }
    catch { return false; }
  };

  const images = (() => {
    const raw = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    if (raw.length > 0) {
      // Proxy CDN URLs that need referer/auth; leave other direct URLs alone.
      return raw.map(url => isWpsCdn(url) ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url);
    }
    // Fallback to getProductImage
    const fallback = getProductImage(product);
    return [fallback];
  })();

  const toProxySrc = (src) =>
    typeof src === "string" && src.startsWith("http") && isWpsCdn(src)
      ? `/api/image-proxy?url=${encodeURIComponent(src)}`
      : src;

  // Lightweight inline notify button for related cards
  function RelatedNotifyButton({ sku, productName, vendor }) {
    const [state, setState] = useState("idle"); // idle | loading | done | error

    const handleClick = async (e) => {
      e.stopPropagation();
      if (state !== "idle" && state !== "error") return;
      setState("loading");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.href = "/auth"; return; }
        await fetch("/api/notifications/restock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_sku: sku, product_name: productName, vendor, source: "pdp" }),
        });
        setState("done");
      } catch {
        setState("error");
      }
    };

    const label = { idle: "🔔 NOTIFY ME", loading: "...", done: "✓ ON THE LIST", error: "RETRY" }[state];

    return (
      <button
        className={`related-notify-btn ${state === "done" ? "done" : ""}`}
        onClick={handleClick}
        disabled={state === "loading" || state === "done"}
      >
        {label}
      </button>
    );
  }

  function RelatedCardImage({ product }) {
    const src = toProxySrc(primaryImage(product.images));
    const isPlaceholder = src === "/placeholder-product.png" || src === "/images/placeholder.jpg";

    return (
      <div className="related-img">
        {isPlaceholder ? (
          <span
            style={{
              fontFamily: "var(--font-stencil),monospace",
              fontSize: 8,
              color: "#3a3838",
              letterSpacing: "0.1em",
              position: "relative",
              zIndex: 1,
            }}
          >
            NO IMAGE
          </span>
        ) : (
          <Image
            src={src}
            alt={product.name}
            width={200}
            height={200}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: product.inStock ? 1 : 0.5 }}
            unoptimized
          />
        )}
        {!product.inStock && (
          <span className="related-oos-badge">OUT OF STOCK</span>
        )}
      </div>
    );
  }

  return (
    <div className="pdp-wrap">
      <style>{css}</style>

      <NavBar activePage="shop" />

      {/* ── BREADCRUMB ── */}
      <div className="pdp-breadcrumb">
        <a href="/">HOME</a>
        <span className="sep">→</span>
        <a href="/shop">SHOP</a>
        <span className="sep">→</span>
        <a href={`/shop?category=${product.category}`}>{product.category.toUpperCase()}</a>
        <span className="sep">→</span>
        <span className="current">{product.name.toUpperCase()}</span>
      </div>

      {/* ── MAIN ── */}
      <div className="pdp-main">

        {/* LEFT — Gallery */}
        <div className="gallery-col">
          <div className="gallery-main">
            {product.badge && (
              <span className={`gallery-badge ${product.badge}`}>
                {product.badge.toUpperCase()}
              </span>
            )}
            <img
              src={toProxySrc(images[activeImg])}
              alt={product.name}
              style={{ width:"100%", height:"100%", objectFit:"contain", position:"relative", zIndex:1 }}
            />
          </div>

          {/* Thumbnails (if multiple) */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-4">
              {images.map((img, i) => (
                <Image
                  key={i}
                  src={toProxySrc(img)}
                  alt={`${product.name} ${i}`}
                  width={80}
                  height={80}
                  className={`border rounded cursor-pointer ${activeImg===i ? "border-[#e8621a]" : "border-[#2a2828]"}`}
                  onClick={() => setActiveImg(i)}
                  unoptimized
                />
              ))}
            </div>
          )}

          {/* Specs table — below gallery on desktop */}
          {product.specs && product.specs.length > 0 && (
            <div className="specs-section">
              <div className="specs-title">SPEC<span>S</span></div>
              <table className="specs-table">
                <tbody>
                  {product.specs.map((s, i) => (
                    <tr key={i}>
                      <td>{s.label}</td>
                      <td>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT — Info */}
        <div className="info-col">
          <div className="info-brand">{product.brand}</div>
          <div className="info-name">{product.name}</div>
          {product.sku && (
            <div className="info-sku">SKU: {product.sku}</div>
          )}

          {/* Fitment badge */}
          <div className={`fitment-badge ${fitmentStatus}`}>
            <div className="fitment-dot"/>
            {fitmentLabel}
          </div>

          {/* Price */}
          <div className="price-block">
            {product.was && (
              <div className="price-was">${product.was.toFixed(2)}</div>
            )}
            <div className="price-main">${product.price.toFixed(2)}</div>
            {product.mapPrice && (
              <div className="price-map-note">MAP PRICE: ${product.mapPrice.toFixed(2)}</div>
            )}
            {product.pointsEarned > 0 && (
              <div className="price-points">
                ★ EARN {product.pointsEarned.toLocaleString()} POINTS ON THIS ORDER
              </div>
            )}
          </div>

          {/* Stock */}
          <div className="stock-row">
            <div className={`stock-dot ${product.inStock?"in":"out"}`}/>
            <span className={`stock-label ${product.inStock?"in":"out"}`}>
              {(() => {
                const stock = Number(product.stockQty ?? 0);
                if (!product.inStock || stock <= 0) return "OUT OF STOCK";
                if (stock > 5) return "IN STOCK";
                return `ONLY ${stock} LEFT`;
              })()}
            </span>
          </div>

          {/* Qty + Add to Cart */}
          <div className="purchase-row">
            <div className="qty-wrap">
              <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q-1))} disabled={qty<=1}>−</button>
              <div className="qty-val">{qty}</div>
              <button className="qty-btn" onClick={() => setQty(q => Math.min(Number(product.stockQty ?? 10), q+1))} disabled={!product.inStock}>+</button>
            </div>

            {product.inStock ? (
              <button
                className={`add-to-cart-btn ${added?"added":""}`}
                onClick={handleAdd}
              >
                {added ? "✓ ADDED TO CART" : "ADD TO CART"}
              </button>
            ) : (
              <NotifyMeButton
                sku={product.sku}
                productName={product.name}
                vendor={product.vendor ?? "wps"}
                source="pdp"
              />
            )}

            <button
              className={`wishlist-btn ${wishlisted?"active":""}`}
              onClick={handleWishlistToggle}
              title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
              disabled={wishlistBusy}
            >
              {wishlisted ? "♥" : "♡"}
            </button>
          </div>

          {/* Perks */}
          <div className="perks-strip">
            <div className="perk">
              <span className="perk-icon">🚚</span>
              <div className="perk-text">
                <strong>{product.shipping ? "FREE SHIPPING" : "FLAT RATE $9.99"}</strong>
                {product.shipping ? "ON THIS ORDER" : "SHIPS IN 1–2 DAYS"}
              </div>
            </div>
            <div className="perk">
              <span className="perk-icon">↩</span>
              <div className="perk-text">
                <strong>30-DAY RETURNS</strong>
                HASSLE-FREE POLICY
              </div>
            </div>
            <div className="perk">
              <span className="perk-icon">🔒</span>
              <div className="perk-text">
                <strong>MAP PROTECTED</strong>
                BEST PRICE GUARANTEED
              </div>
            </div>
            {product.pointsEarned > 0 && (
              <div className="perk">
                <span className="perk-icon">★</span>
                <div className="perk-text">
                  <strong>{product.pointsEarned.toLocaleString()} POINTS</strong>
                  EARNED ON THIS ORDER
                </div>
              </div>
            )}
          </div>

          <hr className="pdp-divider"/>

          {/* Description */}
          {product.description && (
            <div
              className="prose prose-invert max-w-none text-sm text-gray-300"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}
        </div>
      </div>

      {/* ── RELATED PRODUCTS ── */}
      {relatedProducts.length > 0 && (
        <div className="related-section">
          <div className="related-head">
            <div className="related-title">MORE FROM <span>{product.brand.toUpperCase()}</span></div>
            <a href={`/shop?category=${product.category}`} className="related-link">
              VIEW ALL IN CATEGORY →
            </a>
          </div>
          <div className="related-grid">
            {relatedProducts.map(p => (
              <div
                key={p.id}
                className="related-card"
                onClick={() => window.location.href = `/shop/${p.slug}`}
              >
                <RelatedCardImage product={p} />
                <div className="related-body">
                  <div className="related-brand">{p.brand}</div>
                  <div className="related-name">{p.name}</div>
                  <div className="related-footer">
                    <div className="related-price"
                      style={{ color: p.inStock ? "#f0ebe3" : "#8a8784" }}>
                      ${p.price.toFixed(2)}
                    </div>
                    {p.inStock
                      ? <span style={{fontFamily:"var(--font-stencil),monospace",fontSize:9,color:"#e8621a",letterSpacing:"0.1em"}}>VIEW →</span>
                      : <span style={{fontFamily:"var(--font-stencil),monospace",fontSize:9,color:"#8a8784",letterSpacing:"0.1em"}}>OOS</span>
                    }
                  </div>
                  {!p.inStock && (
                    <RelatedNotifyButton sku={p.sku} productName={p.name} vendor={p.vendor ?? "wps"} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className="toast">
          ✓ {qty > 1 ? `${qty}× ` : ""}{product.name.split(" ").slice(0,3).join(" ")} ADDED TO CART
        </div>
      )}
      {wishlistToast && (
        <div className="toast" style={{background:"#e8621a"}}>
          {wishlistToast.toUpperCase()}
        </div>
      )}
    </div>
  );
}
