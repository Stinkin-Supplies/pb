"use client";
// ============================================================
// components/browse/ProductQuickViewModal.jsx
//
// Opens when a product card is clicked on the browse grid.
// Shows key product info immediately (card data = no fetch needed).
// "View Full Details →" stores the browse URL in sessionStorage
// so the PDP back button (BrowseBackButton.jsx) can return here.
//
// Wiring in your browse page:
//   const [quickView, setQuickView] = useState(null);
//   // on each product card: onClick={() => setQuickView(product)}
//   {quickView && (
//     <ProductQuickViewModal product={quickView} onClose={() => setQuickView(null)} />
//   )}
// ============================================================

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ── Palette (matches FilterSidebar / site-wide tokens) ────────
const GOLD   = "#b8922a";
const GOLD_L = "rgba(184,146,42,0.12)";
const GOLD_B = "rgba(184,146,42,0.25)";
const CREAM  = "#faf7f2";
const CREAM2 = "#f2ede4";
const DARK   = "#0a0909";
const MUTED  = "#888";

// ── Helpers ───────────────────────────────────────────────────

function formatPrice(product) {
  const p = product.computed_price ?? product.msrp ?? product.map_price;
  return p ? `$${parseFloat(p).toFixed(2)}` : null;
}

// Proxy image URL through the same pattern used elsewhere on the site
function resolveImage(url) {
  if (!url) return null;
  if (url.startsWith("http")) return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  return url;
}

// ── Sub-components ────────────────────────────────────────────

function MetaLabel({ children }) {
  return (
    <span style={{
      fontFamily: "var(--font-stencil, monospace)",
      fontSize: 9, letterSpacing: "2px",
      textTransform: "uppercase", color: MUTED,
    }}>
      {children}
    </span>
  );
}

function Divider() {
  return (
    <div style={{ height: 1, background: GOLD_B, margin: "14px 0" }} />
  );
}

// ── Main component ────────────────────────────────────────────

export default function ProductQuickViewModal({ product, onClose }) {
  const router = useRouter();

  // Escape key closes
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Navigate to PDP, storing browse URL for back-button restore
  const handleViewFull = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("stinkin_browse_return", window.location.href);
    }
    onClose();
    router.push(`/browse/${product.slug}`);
  }, [product.slug, router, onClose]);

  if (!product) return null;

  const price = formatPrice(product);
  const imageUrl = resolveImage(product.image_url);

  return (
    <AnimatePresence>
      {/* ── Backdrop ─────────────────────────────────── */}
      <motion.div
        key="qv-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.65 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "#000",
          zIndex: 400,
          cursor: "pointer",
        }}
      />

      {/* ── Modal panel ──────────────────────────────── */}
      <motion.div
        key="qv-panel"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 440, damping: 38 }}
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 401,
          width: "min(700px, 94vw)",
          maxHeight: "90vh",
          background: CREAM2,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 32px 96px rgba(0,0,0,0.5), 0 0 0 1px rgba(184,146,42,0.18)",
        }}
      >
        {/* ── Header bar ─────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${GOLD_B}`,
          flexShrink: 0,
          background: CREAM2,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Corner bracket decoration */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 6V1H6" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 9, letterSpacing: "3px",
              color: GOLD, textTransform: "uppercase",
            }}>
              Quick View
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none",
              cursor: "pointer", color: "#999",
              fontSize: 22, lineHeight: 1,
              padding: "0 4px",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = DARK}
            onMouseLeave={e => e.currentTarget.style.color = "#999"}
          >×</button>
        </div>

        {/* ── Body ───────────────────────────────────── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          scrollbarWidth: "none",
        }}
          className="qv-body"
        >
          {/* Left: image */}
          <div style={{
            width: 240, flexShrink: 0,
            background: CREAM,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 16px",
            borderRight: `1px solid ${GOLD_B}`,
          }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.name}
                style={{
                  maxWidth: "100%",
                  maxHeight: 220,
                  objectFit: "contain",
                  display: "block",
                }}
                onError={e => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <div style={{
                width: 100, height: 100,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: GOLD_B,
              }}>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <rect x="8" y="8" width="48" height="48" rx="2" stroke={GOLD_B} strokeWidth="1.5" strokeDasharray="4 3"/>
                  <path d="M20 44L28 32L34 40L40 34L44 44H20Z" fill={GOLD_B}/>
                  <circle cx="24" cy="26" r="4" fill={GOLD_B}/>
                </svg>
              </div>
            )}
          </div>

          {/* Right: details */}
          <div style={{ flex: 1, padding: "18px 20px 20px", minWidth: 0 }}>

            {/* Brand */}
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 10, color: GOLD,
              letterSpacing: "2.5px", textTransform: "uppercase",
              marginBottom: 6,
            }}>
              {product.brand}
            </div>

            {/* Product name */}
            <h2 style={{
              fontFamily: "var(--font-tanker, var(--font-sailor, sans-serif))",
              fontSize: 20, fontWeight: 400,
              color: DARK, lineHeight: 1.2,
              margin: "0 0 6px",
            }}>
              {product.name}
            </h2>

            {/* SKU */}
            <div style={{ marginBottom: 12 }}>
              <MetaLabel>SKU: {product.sku}</MetaLabel>
            </div>

            {/* Category tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
              {product.display_category && (
                <span style={{
                  border: `1px solid ${GOLD_B}`, padding: "2px 8px",
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9, color: GOLD,
                  letterSpacing: "1px", textTransform: "uppercase",
                }}>
                  {product.display_category}
                </span>
              )}
              {product.display_subcategory && (
                <span style={{
                  border: `1px solid rgba(184,146,42,0.15)`,
                  padding: "2px 8px",
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9, color: MUTED,
                  letterSpacing: "1px", textTransform: "uppercase",
                }}>
                  {product.display_subcategory}
                </span>
              )}
            </div>

            <Divider />

            {/* Price + stock row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
              {price && (
                <span style={{
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 24, color: DARK, letterSpacing: "0.5px",
                }}>
                  {price}
                </span>
              )}
              <span style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9, letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: product.in_stock ? "#5a8a4a" : "#c06060",
              }}>
                {product.in_stock
                  ? `● In Stock${product.stock_quantity > 0 ? ` (${product.stock_quantity})` : ""}`
                  : "○ Out of Stock"}
              </span>
            </div>

            {/* OEM numbers */}
            {product.oem_numbers?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <MetaLabel>
                  OEM#: {product.oem_numbers.slice(0, 5).join(" · ")}
                  {product.oem_numbers.length > 5 && " …"}
                </MetaLabel>
              </div>
            )}

            {/* Fitment badge */}
            {product.is_harley_fitment && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: GOLD_L, border: `1px solid ${GOLD_B}`,
                padding: "5px 10px", marginBottom: 14,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: GOLD, flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9, color: GOLD,
                  letterSpacing: "1px", textTransform: "uppercase",
                }}>
                  Harley-Davidson Fitment Available
                </span>
              </div>
            )}

            {/* Universal badge */}
            {product.is_universal && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(100,100,100,0.08)", border: `1px solid rgba(100,100,100,0.18)`,
                padding: "5px 10px", marginBottom: 14, marginLeft: product.is_harley_fitment ? 6 : 0,
              }}>
                <span style={{
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9, color: "#888",
                  letterSpacing: "1px", textTransform: "uppercase",
                }}>
                  Universal Fit
                </span>
              </div>
            )}

            {/* Variant count */}
            {product.variant_count > 1 && (
              <div style={{ marginTop: 4 }}>
                <MetaLabel>
                  + {product.variant_count - 1} variant{product.variant_count - 1 !== 1 ? "s" : ""}
                  {" "}available on full detail page
                </MetaLabel>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────── */}
        <div style={{
          padding: "12px 16px 16px",
          borderTop: `1px solid ${GOLD_B}`,
          display: "flex", gap: 10,
          flexShrink: 0, background: CREAM2,
        }}>
          <button
            onClick={onClose}
            style={{
              flexShrink: 0, height: 44,
              background: "none",
              border: `1.5px solid ${GOLD_B}`,
              color: GOLD,
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 10, letterSpacing: "2px",
              textTransform: "uppercase",
              cursor: "pointer", padding: "0 18px",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = GOLD_B; }}
          >
            ← Back
          </button>
          <button
            onClick={handleViewFull}
            style={{
              flex: 1, height: 44,
              background: GOLD, border: "none",
              color: "#fff",
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 10, letterSpacing: "3px",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#a07820"; }}
            onMouseLeave={e => { e.currentTarget.style.background = GOLD; }}
          >
            View Full Details →
          </button>
        </div>
      </motion.div>

      <style>{`
        .qv-body::-webkit-scrollbar { display: none; }

        /* Mobile: stack image on top of details */
        @media (max-width: 560px) {
          .qv-body { flex-direction: column !important; }
          .qv-body > div:first-child {
            width: 100% !important;
            border-right: none !important;
            border-bottom: 1px solid ${GOLD_B};
            padding: 16px !important;
            max-height: 180px;
          }
        }
      `}</style>
    </AnimatePresence>
  );
}
