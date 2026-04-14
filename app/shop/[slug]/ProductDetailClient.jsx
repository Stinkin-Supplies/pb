"use client";
// ============================================================
// app/shop/[slug]/ProductDetailClient.jsx
// ============================================================
// Full product detail page UI:
//   - Image gallery with thumbnail rail
//   - Fitment check badge + full fitment table
//   - Price / MAP display
//   - Points earned preview
//   - Add to cart with quantity selector
//   - Tabbed content: Description | Features | Fitment | Specs
//   - OEM numbers + page references
//   - Related products strip
// ============================================================

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { useCartSafe } from "@/components/CartContext";
import NotifyMeButton from "@/components/NotifyMeButton";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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

  /* ── VARIANT SELECTOR ── */
  .variants-section { margin-bottom: 20px; }
  .variant-group { margin-bottom: 14px; }
  .variant-group-label {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784;
    letter-spacing: 0.18em; text-transform: uppercase;
    margin-bottom: 8px;
  }
  .variant-btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .variant-btn {
    padding: 6px 14px;
    background: #111010; border: 1px solid #2a2828;
    color: #c4c0bc; border-radius: 2px;
    font-family: var(--font-stencil), monospace;
    font-size: 11px; letter-spacing: 0.08em;
    cursor: pointer; transition: all 0.15s;
  }
  .variant-btn:hover  { border-color: rgba(232,98,26,0.5); color: #f0ebe3; }
  .variant-btn.selected {
    background: rgba(232,98,26,0.1);
    border-color: #e8621a; color: #e8621a;
  }

  /* ── TABS ── */
  .pdp-tabs-section {
    max-width: 1200px; margin: 0 auto;
    padding: 0 24px 60px;
    border-top: 1px solid #2a2828;
  }
  .pdp-tab-strip {
    display: flex; gap: 0;
    border-bottom: 1px solid #2a2828;
    margin-bottom: 24px;
  }
  .pdp-tab {
    padding: 14px 24px;
    font-family: var(--font-stencil), monospace;
    font-size: 10px; letter-spacing: 0.18em;
    color: #8a8784; cursor: pointer;
    border: none; background: none;
    border-bottom: 2px solid transparent;
    transition: all 0.2s; margin-bottom: -1px;
  }
  .pdp-tab:hover  { color: #f0ebe3; }
  .pdp-tab.active { color: #e8621a; border-bottom-color: #e8621a; }

  /* ── SPECS TABLE ── */
  .specs-table { width: 100%; border-collapse: collapse; }
  .specs-table tr:nth-child(odd) td { background: #111010; }
  .specs-table td {
    padding: 10px 14px;
    font-size: 13px;
    border-bottom: 1px solid #1a1919;
    vertical-align: top;
  }
  .pdp-specs-table td:first-child {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #8a8784;
    letter-spacing: 0.15em; text-transform: uppercase;
    width: 180px; white-space: nowrap;
  }
  .pdp-specs-table td:last-child {
    color: #f0ebe3;
    font-family: var(--font-stencil), monospace;
    font-size: 11px; letter-spacing: 0.06em;
  }

  /* OEM numbers strip */
  .pdp-oem-strip {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #2a2828;
  }
  .pdp-oem-label {
    font-family: var(--font-stencil), monospace;
    font-size: 8px; letter-spacing: 0.2em; color: #8a8784;
    margin-bottom: 10px;
  }
  .pdp-oem-chips {
    display: flex; gap: 8px; flex-wrap: wrap;
  }
  .pdp-oem-chip {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; letter-spacing: 0.1em;
    padding: 4px 10px;
    background: #111010; border: 1px solid #2a2828;
    border-radius: 2px; color: #c8c3bc;
  }

  /* ── FITMENT TABLE ── */
  .fitment-table { width: 100%; border-collapse: collapse; }
  .fitment-table thead td {
    font-family: var(--font-stencil), monospace;
    font-size: 9px; color: #e8621a;
    letter-spacing: 0.15em; padding: 8px 14px;
    border-bottom: 1px solid #2a2828;
    text-transform: uppercase;
  }
  .fitment-table tbody tr:nth-child(odd) td { background: #111010; }
  .fitment-table tbody td {
    padding: 9px 14px; font-size: 13px; font-weight: 500;
    color: #f0ebe3; border-bottom: 1px solid #1a1919;
  }
  .fitment-empty {
    font-family: var(--font-stencil), monospace;
    font-size: 10px; color: #8a8784;
    letter-spacing: 0.12em; padding: 24px 0;
  }

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
    .pdp-features-list { grid-template-columns: 1fr; }
    .pdp-tab-btn { padding: 12px 14px; font-size: 9px; }
  }
`;

export default function ProductDetailClient({ product, variants = [], fitment = [], relatedProducts = [], fetchError = null }) {
  const [activeImg,  setActiveImg]  = useState(0);
  const [qty,        setQty]        = useState(1);
  const [activeTab,  setActiveTab]  = useState("description");

  // Group variants by option_name: { Size: ["S","M","L"], Color: ["Red","Black"] }
  const variantGroups = variants.reduce((acc, v) => {
    if (!acc[v.option_name]) acc[v.option_name] = [];
    if (!acc[v.option_name].includes(v.option_value)) acc[v.option_name].push(v.option_value);
    return acc;
  }, {});
  const variantGroupEntries = Object.entries(variantGroups);

  const [selectedVariants, setSelectedVariants] = useState(() =>
    Object.fromEntries(variantGroupEntries.map(([k, vals]) => [k, vals[0] ?? null]))
  );
  const [wishlisted, setWishlisted] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistToast, setWishlistToast] = useState(null);
  const [added,      setAdded]      = useState(false);
  const [toast,      setToast]      = useState(false);
  const { addItem } = useCartSafe();

  // ── Brand / vendor option cards ───────────────────────────────
  const [groupOptions, setGroupOptions] = useState(null);
  const [selectedSku,  setSelectedSku]  = useState(product.sku);
  const [groupMeta,    setGroupMeta]    = useState(null); // { oem_numbers, page_references }

  useEffect(() => {
    let cancelled = false;
    const slug = product.slug ?? window.location.pathname.split("/").pop();
    fetch(`/api/products/group?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return;
        // Store OEM numbers + page references for the specs tab
        setGroupMeta({
          oem_numbers:     data.oem_numbers     ?? [],
          page_references: data.page_references ?? [],
        });
        if (data.options?.length > 1) {
          setGroupOptions(data.options);
          const canon = data.options.find(o => o.is_canonical) ?? data.options[0];
          setSelectedSku(canon.vendor_sku);
        } else {
          setGroupOptions([]);
        }
      })
      .catch(() => { if (!cancelled) setGroupOptions([]); });
    return () => { cancelled = true; };
  }, [product.slug, product.sku]);

  // Derive active product data from the selected option
  const activeOption  = groupOptions?.find(o => o.vendor_sku === selectedSku);
  const activePrice   = activeOption ? Number(activeOption.msrp ?? product.price) : product.price;
  const activeInStock = activeOption ? activeOption.in_stock : product.inStock;
  const activeStock   = activeOption ? Number(activeOption.stock_quantity ?? 0) : Number(product.stockQty ?? 0);
  const activeBrand   = activeOption
    ? (activeOption.display_brand || activeOption.brand || product.display_brand || product.brand)
    : (product.display_brand || product.brand);

  const supabaseRef = useRef(null);
  if (!supabaseRef.current) supabaseRef.current = createBrowserSupabaseClient();
  const supabase = supabaseRef.current;

  // ── Fitment check ──────────────────────────────────────────
  const fitmentStatus =
    !product.fitmentIds                              ? "no-data" :
    product.fitmentIds.includes(SAVED_VEHICLE.id)   ? "fits"    : "no-fit";

  const fitmentLabel = {
    "fits":    `✓ FITS YOUR ${SAVED_VEHICLE.year} ${SAVED_VEHICLE.make} ${SAVED_VEHICLE.model}`,
    "no-fit":  `✗ DOES NOT FIT YOUR ${SAVED_VEHICLE.year} ${SAVED_VEHICLE.make}`,
    "no-data": `FITMENT DATA PENDING — ADD TO VERIFY`,
  }[fitmentStatus];

  // ── Auto-select tab based on available data ────────────────
  useEffect(() => {
    if (!product.description && !product.features?.length) {
      if (product.fitmentHdFamilies?.length || product.fitmentYearStart) {
        setActiveTab("fitment");
      }
    }
  }, [product]);

  // ── Add to cart ────────────────────────────────────────────
  const handleAdd = () => {
    if (!activeInStock) return;
    setAdded(true);
    addItem({
      ...product,
      sku:    activeOption?.vendor_sku ?? product.sku,
      price:  activePrice,
      brand:  activeBrand,
      image:  (activeOption?.image_url ? activeOption.image_url : resolvedGallery[0]) ?? null,
      images: resolvedGallery,
    }, qty);
    setToast(true);
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
      if (!user) { if (mounted) setWishlisted(false); return; }
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
      if (!user) { window.location.href = "/auth"; return; }
      if (wishlisted) {
        const { error } = await supabase.from("wishlists").delete()
          .eq("user_id", user.id).eq("product_sku", product.sku);
        if (!error) { setWishlisted(false); showWishlistToast("Removed from wishlist"); }
        else showWishlistToast("Could not remove");
      } else {
        const { error } = await supabase.from("wishlists").insert({
          user_id: user.id,
          product_sku: product.sku,
          product_name: product.name,
          notify_in_stock: !product.inStock,
        });
        if (!error) { setWishlisted(true); showWishlistToast("Saved to wishlist"); }
        else showWishlistToast("Could not save");
      }
    } finally {
      setWishlistBusy(false);
    }
  };

  // ── Image helpers ──────────────────────────────────────────
  const WPS_DOMAINS = ["cdn.wpsstatic.com", "asset.lemansnet.com"];
  const isWpsCdn = (url) => {
    try { return WPS_DOMAINS.some(d => new URL(url).hostname.includes(d)); }
    catch { return false; }
  };

  const resolvedGallery = (() => {
    const rawGallery = Array.isArray(product.gallery) ? product.gallery.filter(Boolean) : [];
    const raw = rawGallery.length > 0
      ? rawGallery
      : (typeof product.primaryImage === "string" && product.primaryImage.length > 0)
        ? [product.primaryImage]
        : [];
    if (raw.length > 0) {
      return raw.map(url => isWpsCdn(url) ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url);
    }
    return [fallback];
  })();

  const toProxySrc = (src) =>
    typeof src === "string" && src.startsWith("http") && isWpsCdn(src)
      ? `/api/image-proxy?url=${encodeURIComponent(src)}`
      : src;

  // ── Fitment table data ─────────────────────────────────────
  const hasFitmentData =
    product.isUniversal ||
    product.fitmentHdFamilies?.length > 0 ||
    product.fitmentHdModels?.length > 0 ||
    product.fitmentYearStart != null;

  // Build fitment rows from HD families + year ranges
  const fitmentRows = (() => {
    const families  = product.fitmentHdFamilies ?? [];
    const models    = product.fitmentHdModels   ?? [];
    const codes     = product.fitmentHdCodes    ?? [];
    const yearStart = product.fitmentYearStart;
    const yearEnd   = product.fitmentYearEnd;

    if (!families.length && !models.length) return [];

    // If we have models use those, otherwise use families
    const entries = models.length > 0 ? models : families;
    return entries.map((entry, i) => ({
      make:   "Harley-Davidson",
      model:  entry,
      code:   codes[i] ?? null,
      years:  yearStart && yearEnd
                ? (yearStart === yearEnd ? String(yearStart) : `${yearStart}–${yearEnd}`)
                : yearStart
                  ? `${yearStart}+`
                  : yearEnd
                    ? `Up to ${yearEnd}`
                    : "Verify Application",
    }));
  })();

  // ── Features data ──────────────────────────────────────────
  // product.features can be:
  //   a) an array of plain-text strings  ["trivalent plating...", "pure alumina..."]
  //   b) an array with ONE HTML string   ["<UL><LI>trivalent...</LI></UL>"]
  //   c) null / empty
  const featuresRaw = Array.isArray(product.features) ? product.features.filter(Boolean) : [];
  // Detect if the first item is an HTML blob (vendor catalogs often store it this way)
  const featuresIsHtml =
    featuresRaw.length === 1 &&
    typeof featuresRaw[0] === "string" &&
    /<[a-z][^>]*>/i.test(featuresRaw[0]);
  // Plain-text items only (used for bullet-list rendering)
  const featuresArray = featuresIsHtml ? [] : featuresRaw;
  // HTML blob (used for dangerouslySetInnerHTML)
  const featuresHtml  = featuresIsHtml ? featuresRaw[0] : null;
  // Total feature count for the tab label
  const featuresCount = featuresIsHtml ? 1 : featuresArray.length;

  // ── Tab visibility ─────────────────────────────────────────
  const tabs = [
    { key: "description", label: "DESCRIPTION" },
    { key: "features",    label: "FEATURES",    count: featuresCount || null },
    { key: "fitment",     label: "FITMENT",     highlight: hasFitmentData },
    { key: "specs",       label: "SPECS" },
  ];

  // ── Specs rows ─────────────────────────────────────────────
  // Only display the SKU if it looks like an internal vendor-formatted number
  // (WPS-style SKUs have a letter prefix: e.g. "DS275118", "NGK-DR9EA").
  // Raw PU manufacturer codes like "DR9EA" (no dash, short, no vendor prefix)
  // are suppressed — they belong in the OEM cross-ref, not the product header.
  const isVendorSku = (s) => {
    if (!s) return false;
    if (product.sourceVendor === "PU" || product.vendor === "PU") return false;
    return true;
  };
  const displaySku = isVendorSku(product.sku) ? product.sku : null;

  const specsRows = [
    displaySku            && { label: "SKU",              value: displaySku },
    product.upc           && { label: "UPC",              value: product.upc },
    product.weight        && { label: "WEIGHT",           value: `${product.weight} lbs` },
    (product.lengthIn || product.widthIn || product.heightIn) && {
      label: "DIMENSIONS",
      value: [product.lengthIn, product.widthIn, product.heightIn].filter(Boolean).join(" × ") + " in"
    },
    product.uom           && { label: "UNIT",             value: product.uom },
    product.countryOfOrigin && { label: "ORIGIN",         value: product.countryOfOrigin },
    product.oemPartNumber && { label: "OEM PART #",       value: product.oemPartNumber },
    product.category      && { label: "CATEGORY",         value: product.category },
    product.vendor        && { label: "VENDOR",           value: product.vendor },
    product.inFatbook     && { label: "FATBOOK",          value: "YES" },
    product.inOldbook     && { label: "OLDBOOK",          value: "YES" },
  ].filter(Boolean);

  // Inline notify button for related cards
  function RelatedNotifyButton({ sku, productName, vendor }) {
    const [state, setState] = useState("idle");
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
      } catch { setState("error"); }
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
    const src = toProxySrc(product.primaryImage ?? product.gallery?.[0] ?? fallback);
    const isPlaceholder = src === "/placeholder-product.png" || src === "/images/placeholder.jpg";
    return (
      <div className="related-img">
        {isPlaceholder ? (
          <span style={{ fontFamily:"var(--font-stencil),monospace", fontSize:8, color:"#3a3838", letterSpacing:"0.1em", position:"relative", zIndex:1 }}>
            NO IMAGE
          </span>
        ) : (
          <Image
            src={src} alt={product.name}
            width={200} height={200}
            style={{ width:"100%", height:"100%", objectFit:"cover", opacity: product.inStock ? 1 : 0.5 }}
            unoptimized
          />
        )}
        {!product.inStock && <span className="related-oos-badge">OUT OF STOCK</span>}
      </div>
    );
  }

  return (
    <div className="pdp-wrap">
      <style>{css}</style>

      <NavBar activePage="shop" />

      {/* ── BREADCRUMB ── */}
      <div className="pdp-breadcrumb">
        <Link href="/">HOME</Link>
        <span className="sep">→</span>
        <Link href="/shop">SHOP</Link>
        <span className="sep">→</span>
        <Link href={`/shop?category=${product.category}`}>{product.category?.toUpperCase()}</Link>
        <span className="sep">→</span>
        <span className="current">{product.name?.toUpperCase()}</span>
      </div>

      {/* ── MAIN GRID ── */}
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
              src={toProxySrc(resolvedGallery[activeImg] ?? resolvedGallery[0])}
              alt={product.name}
              style={{ width:"100%", height:"100%", objectFit:"contain", position:"relative", zIndex:1 }}
            />
          </div>

          {/* Thumbnails */}
          {resolvedGallery.length > 1 && (
            <div className="gallery-thumbs">
              {resolvedGallery.map((img, i) => (
                <div
                  key={i}
                  className={`gallery-thumb ${activeImg === i ? "active" : ""}`}
                  onClick={() => setActiveImg(i)}
                >
                  <img src={toProxySrc(img)} alt={`${product.name} view ${i + 1}`} />
                </div>
              ))}
            </div>
          )}

          {/* Specs/Fitment/Description moved to tabbed section below */}
        </div>

        {/* RIGHT — Info */}
        <div className="info-col">
          {activeBrand && <div className="info-brand">{activeBrand}</div>}
          <div className="info-name">{product.name}</div>
          {(displaySku || product.oemPartNumber) && (
            <div className="info-sku">
              {displaySku && `SKU: ${displaySku}`}
              {displaySku && product.oemPartNumber && ` · `}
              {product.oemPartNumber && `OEM: ${product.oemPartNumber}`}
            </div>
          )}

          {/* Brand / vendor option cards */}
          {groupOptions && groupOptions.length > 1 && (
            <div>
              <div className="brand-opts-label">SELECT BRAND / OPTION</div>
              <div className="brand-opts">
                {groupOptions.map((opt) => {
                  const optBrand  = opt.display_brand || opt.brand || "Unknown Brand";
                  const optPrice  = opt.msrp ? Number(opt.msrp) : null;
                  const selected  = opt.vendor_sku === selectedSku;
                  return (
                    <div
                      key={opt.vendor_sku}
                      className={`brand-opt${selected ? " selected" : ""}${!opt.in_stock ? " oos" : ""}`}
                      onClick={() => setSelectedSku(opt.vendor_sku)}
                      role="radio"
                      aria-checked={selected}
                    >
                      <div className="brand-opt-radio">
                        <div className="brand-opt-radio-dot" />
                      </div>
                      <div className="brand-opt-body">
                        <div className="brand-opt-name">{optBrand.toUpperCase()}</div>
                        {opt.internal_sku && <div className="brand-opt-part">{opt.internal_sku}</div>}
                      </div>
                      <div className="brand-opt-right">
                        {optPrice != null && (
                          <div className="brand-opt-price">${optPrice.toFixed(2)}</div>
                        )}
                        <div className={`brand-opt-stock ${opt.in_stock ? "in" : "out"}`}>
                          {opt.in_stock
                            ? (opt.stock_quantity > 5 ? "IN STOCK" : `ONLY ${opt.stock_quantity} LEFT`)
                            : "OUT OF STOCK"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fitment badge */}
          <div className={`fitment-badge ${fitmentStatus}`}>
            <div className="fitment-dot"/>
            {fitmentLabel}
          </div>

          {/* Variant selector */}
          {variantGroupEntries.length > 0 && (
            <div className="variants-section">
              {variantGroupEntries.map(([groupName, values]) => (
                <div key={groupName} className="variant-group">
                  <div className="variant-group-label">
                    {groupName}: <span style={{ color:"#f0ebe3" }}>{selectedVariants[groupName]}</span>
                  </div>
                  <div className="variant-btns">
                    {values.map(val => (
                      <button
                        key={val}
                        className={`variant-btn ${selectedVariants[groupName] === val ? "selected" : ""}`}
                        onClick={() => setSelectedVariants(prev => ({ ...prev, [groupName]: val }))}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price */}
          <div className="price-block">
            {product.was && (
              <div className="price-was">${product.was.toFixed(2)}</div>
            )}
            <div className="price-main">${activePrice.toFixed(2)}</div>
            {product.mapPrice && (
              <div className="price-map-note">MAP PRICE: ${product.mapPrice.toFixed(2)}</div>
            )}
            {product.pointsEarned > 0 && (
              <div className="price-points">
                EARN {product.pointsEarned.toLocaleString()} POINTS ON THIS ORDER
              </div>
            )}
          </div>

          {/* Stock */}
          <div className="stock-row">
            <div className={`stock-dot ${activeInStock ? "in" : "out"}`}/>
            <span className={`stock-label ${activeInStock ? "in" : "out"}`}>
              {(() => {
                if (!activeInStock || activeStock <= 0) return "OUT OF STOCK";
                if (activeStock > 5) return "IN STOCK";
                return `ONLY ${activeStock} LEFT`;
              })()}
            </span>
          </div>

          {/* Qty + Add to Cart */}
          <div className="purchase-row">
            <div className="qty-wrap">
              <button className="qty-btn" onClick={() => setQty(q => Math.max(1, q-1))} disabled={qty <= 1}>−</button>
              <div className="qty-val">QTY: {qty}</div>
              <button className="qty-btn" onClick={() => setQty(q => Math.min(Number(product.stockQty ?? 10), q+1))} disabled={!activeInStock}>+</button>
            </div>

            {activeInStock ? (
              <button className={`add-to-cart-btn ${added ? "added" : ""}`} onClick={handleAdd}>
                {added ? "✓ ADDED TO CART" : "ADD TO CART"}
              </button>
            ) : (
              <NotifyMeButton
                sku={activeOption?.vendor_sku ?? product.sku}
                productName={product.name}
                vendor={product.vendor ?? "wps"}
                source="pdp"
              />
            )}

            <button
              className={`wishlist-btn ${wishlisted ? "active" : ""}`}
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
        </div>
      </div>

          {/* Tab shortcuts */}
          {(product.specs?.length > 0 || fitment.length > 0) && (
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              {product.specs?.length > 0 && (
                <button
                  onClick={() => { setActiveTab("specs"); document.getElementById("pdp-tabs")?.scrollIntoView({ behavior:"smooth", block:"start" }); }}
                  style={{ background:"transparent", border:"1px solid #2a2828", color:"#8a8784",
                           fontFamily:"var(--font-stencil),monospace", fontSize:9, letterSpacing:"0.12em",
                           padding:"5px 12px", borderRadius:2, cursor:"pointer", transition:"all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#e8621a"; e.currentTarget.style.color="#e8621a"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#2a2828"; e.currentTarget.style.color="#8a8784"; }}
                >
                  VIEW SPECS ↓
                </button>
              )}
              {fitment.length > 0 && (
                <button
                  onClick={() => { setActiveTab("fitment"); document.getElementById("pdp-tabs")?.scrollIntoView({ behavior:"smooth", block:"start" }); }}
                  style={{ background:"transparent", border:"1px solid #2a2828", color:"#8a8784",
                           fontFamily:"var(--font-stencil),monospace", fontSize:9, letterSpacing:"0.12em",
                           padding:"5px 12px", borderRadius:2, cursor:"pointer", transition:"all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor="#e8621a"; e.currentTarget.style.color="#e8621a"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor="#2a2828"; e.currentTarget.style.color="#8a8784"; }}
                >
                  VIEW FITMENT ↓
                </button>
              )}
            </div>
          )}
      {/* ── TABS: Description | Specs | Fitment ── */}
      <div id="pdp-tabs" className="pdp-tabs-section">
        <div className="pdp-tab-strip">
          <button
            className={`pdp-tab ${activeTab === "description" ? "active" : ""}`}
            onClick={() => setActiveTab("description")}
          >
            DESCRIPTION
          </button>
          {product.specs?.length > 0 && (
            <button
              className={`pdp-tab ${activeTab === "specs" ? "active" : ""}`}
              onClick={() => setActiveTab("specs")}
            >
              SPECS ({product.specs.length})
            </button>
          )}
          <button
            className={`pdp-tab ${activeTab === "fitment" ? "active" : ""}`}
            onClick={() => setActiveTab("fitment")}
          >
            FITMENT {fitment.length > 0 ? `(${fitment.length})` : ""}
          </button>
        </div>

        {activeTab === "description" && (
          <div>
            {product.description ? (
              <div
                className="prose prose-invert max-w-none text-sm text-gray-300"
                style={{ lineHeight:1.8, color:"#c4c0bc", fontSize:14 }}
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            ) : (
              <div style={{ fontFamily:"var(--font-stencil),monospace", fontSize:12, color:"#8a8784", letterSpacing:"0.05em", lineHeight:1.8 }}>
                <p>{product.name} by {product.brand}.</p>
                {product.weight && <p style={{ marginTop:8 }}>WEIGHT: {product.weight} LBS</p>}
                <p style={{ marginTop:8 }}>CATEGORY: {product.category?.toUpperCase()}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "specs" && product.specs?.length > 0 && (
          <table className="specs-table">
            <tbody>
              {product.specs.map((s, i) => (
                <tr key={i}>
                  <td>{s.label ?? s.attribute}</td>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === "fitment" && (
          fitment.length > 0 ? (
            <table className="fitment-table">
              <thead>
                <tr>
                  <td>MAKE</td>
                  <td>MODEL</td>
                  <td>YEARS</td>
                </tr>
              </thead>
              <tbody>
                {fitment.map((f, i) => (
                  <tr key={i}>
                    <td>{f.make ?? "—"}</td>
                    <td>{f.model ?? "—"}</td>
                    <td>
                      {f.year_start === f.year_end
                        ? f.year_start
                        : `${f.year_start}–${f.year_end}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="fitment-empty">
              FITMENT DATA PENDING — CHECK BACK AFTER ACES SYNC
            </div>
          )
        )}
      </div>

      {/* ── RELATED PRODUCTS ── */}
      {relatedProducts.length > 0 && (
        <div className="related-section">
          <div className="related-head">
            <div className="related-title">
              MORE FROM <span>{(activeBrand || "THIS CATEGORY").toUpperCase()}</span>
            </div>
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
                  <div className="related-brand">{p.display_brand || p.brand}</div>
                  <div className="related-name">{p.name}</div>
                  <div className="related-footer">
                    <div className="related-price" style={{ color: p.inStock ? "#f0ebe3" : "#8a8784" }}>
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

      {/* ── TOASTS ── */}
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
