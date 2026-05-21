"use client";
// ============================================================
// app/browse/[slug]/ProductDetailClient.jsx
// Cream/gold theme · vertical scroll gallery · variant selector
// ============================================================

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import VariantSelector from "@/components/browse/VariantSelector";
import NavBar from "@/components/NavBar";

// ── Theme tokens ─────────────────────────────────────────────
const GOLD   = "#b8922a";
const CREAM  = "#f5f0e8";
const CREAM2 = "#ede8df";
const DARK   = "#2a2018";
const BORDER = "rgba(184,146,42,0.25)";
const FONT   = "var(--font-stencil, 'Barlow Condensed', monospace)";

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n) => (n != null ? `$${Number(n).toFixed(2)}` : null);

function proxyImg(src) {
  if (!src) return null;
  if (src.includes("lemansnet.com")) return `/api/img?u=${encodeURIComponent(src)}`;
  return src;
}

// ── Vertical Gallery ──────────────────────────────────────────
function VerticalGallery({ images, name }) {
  const [active, setActive] = useState(0);
  const imgRefs = useRef([]);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = imgRefs.current.indexOf(e.target);
            if (idx !== -1) setActive(idx);
          }
        });
      },
      { threshold: 0.5, root: containerRef.current }
    );
    imgRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [images]);

  const scrollTo = (i) => {
    imgRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setActive(i);
  };

  if (!images?.length) {
    return (
      <div style={{
        aspectRatio: "1", background: CREAM2, border: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: FONT, fontSize: 9, letterSpacing: "2px", color: "#bbb" }}>
          NO IMAGE
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          overflowY: images.length > 1 ? "auto" : "visible",
          maxHeight: images.length > 1 ? "520px" : "none",
          scrollSnapType: "y mandatory",
          borderRadius: 2,
          border: `1px solid ${BORDER}`,
          background: "#fff",
        }}
      >
        {images.map((src, i) => (
          <div
            key={i}
            ref={(el) => (imgRefs.current[i] = el)}
            style={{ aspectRatio: "1", scrollSnapAlign: "start", position: "relative", background: "#fff", flexShrink: 0 }}
          >
            <Image
              src={proxyImg(src)}
              alt={`${name} ${i + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              style={{ objectFit: "contain", padding: "12px" }}
              unoptimized
            />
          </div>
        ))}
      </div>

      {/* Dot nav */}
      {images.length > 1 && (
        <div style={{
          position: "absolute", right: -20, top: "50%", transform: "translateY(-50%)",
          display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
        }}>
          <button onClick={() => scrollTo(Math.max(0, active - 1))} style={dotNavBtn}>▲</button>
          {images.map((_, i) => (
            <button key={i} onClick={() => scrollTo(i)} style={{
              width: i === active ? 8 : 6, height: i === active ? 8 : 6,
              borderRadius: "50%", background: i === active ? GOLD : "rgba(0,0,0,0.25)",
              border: "none", padding: 0, cursor: "pointer", transition: "all 0.2s",
            }} />
          ))}
          <button onClick={() => scrollTo(Math.min(images.length - 1, active + 1))} style={dotNavBtn}>▼</button>
        </div>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
          {images.map((src, i) => (
            <button key={i} onClick={() => scrollTo(i)} style={{
              width: 56, height: 56, flexShrink: 0, position: "relative", overflow: "hidden",
              border: `2px solid ${i === active ? GOLD : BORDER}`,
              background: "#fff", padding: 2, cursor: "pointer", transition: "border-color 0.15s",
            }}>
              <Image src={proxyImg(src)} alt={`thumb ${i + 1}`} fill style={{ objectFit: "contain" }} unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dotNavBtn = {
  background: "rgba(0,0,0,0.5)", border: "none", color: "#fff",
  width: 20, height: 20, borderRadius: "50%", cursor: "pointer",
  fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};

// ── OEM Ribbon ────────────────────────────────────────────────
function OemRibbon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 22" width={72} height={22}>
      <defs>
        <linearGradient id="oem-g" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffd700" />
          <stop offset="50%" stopColor="#c8a800" />
          <stop offset="100%" stopColor="#a88800" />
        </linearGradient>
      </defs>
      <path d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z" fill="rgba(0,0,0,0.12)" transform="translate(1,1.5)" />
      <path d="M6,2 L66,2 L72,11 L66,20 L6,20 L0,11 Z" fill="url(#oem-g)" />
      <path d="M8,5 L64,5 L69,11 L64,17 L8,17 L3,11 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.75" />
      <text x="36" y="15" textAnchor="middle" fontFamily="'Barlow Condensed','Arial Narrow',sans-serif"
        fontWeight="700" fontSize="9" letterSpacing="1.5" fill="rgba(0,0,0,0.75)">OEM</text>
    </svg>
  );
}

// ── Tabs ──────────────────────────────────────────────────────
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{
      display: "flex", borderBottom: `2px solid ${BORDER}`,
      marginBottom: "20px", overflowX: "auto",
    }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: "10px 18px", background: "none", border: "none",
          borderBottom: `2px solid ${active === t.key ? GOLD : "transparent"}`,
          marginBottom: "-2px", fontFamily: FONT, fontSize: "9px", letterSpacing: "2px",
          textTransform: "uppercase", color: active === t.key ? GOLD : "#888",
          cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s",
        }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Fitment Table ─────────────────────────────────────────────
function FitmentTable({ fitment }) {
  if (!fitment?.length) {
    return (
      <p style={{ fontFamily: FONT, fontSize: 10, color: "#aaa", letterSpacing: "1px" }}>
        FITMENT DATA PENDING
      </p>
    );
  }

  // Normalize rows — handle both {model, year_start, year_end} and {model_code, year}
  const grouped = {};
  fitment.forEach((f) => {
    const model = f.model ?? f.model_code ?? "—";
    if (!grouped[model]) grouped[model] = new Set();
    if (f.year_start != null && f.year_end != null) {
      for (let y = Number(f.year_start); y <= Number(f.year_end); y++) grouped[model].add(y);
    } else if (f.year != null) {
      grouped[model].add(Number(f.year));
    }
  });

  // Collapse consecutive years into ranges for display
  const rangeStr = (years) => {
    const sorted = [...years].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) { end = sorted[i]; }
      else { ranges.push(start === end ? `${start}` : `${start}–${end}`); start = end = sorted[i]; }
    }
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
    return ranges.join(", ");
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Make", "Model", "Years"].map((h) => (
            <td key={h} style={{
              fontFamily: FONT, fontSize: "8px", letterSpacing: "2px", color: GOLD,
              padding: "8px 12px", borderBottom: `1px solid ${BORDER}`, textTransform: "uppercase",
            }}>{h}</td>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.entries(grouped).map(([model, years], i) => (
          <tr key={model} style={{ background: i % 2 === 0 ? CREAM : "#fff" }}>
            <td style={{ padding: "8px 12px", fontFamily: FONT, fontSize: 11, color: DARK }}>Harley-Davidson</td>
            <td style={{ padding: "8px 12px", fontFamily: FONT, fontSize: 11, color: DARK }}>{model}</td>
            <td style={{ padding: "8px 12px", fontFamily: FONT, fontSize: 11, color: DARK }}>{rangeStr(years)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Product Modal (related card quick-view) ───────────────────
function ProductModal({ product, fitment, onClose }) {
  const [tab, setTab] = useState("description");
  const gallery = Array.isArray(product.gallery) ? product.gallery.filter(Boolean) : [];

  const tabs = [
    { key: "description", label: "Description" },
    ...(product.features?.length ? [{ key: "features", label: "Features" }] : []),
    { key: "fitment", label: `Fitment${fitment?.length ? ` (${fitment.length})` : ""}` },
    ...(product.oemNumbers?.length ? [{ key: "oem", label: "OEM" }] : []),
  ];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: CREAM, width: "100%", maxWidth: 680,
        maxHeight: "92vh", overflowY: "auto",
        borderRadius: "12px 12px 0 0", padding: "24px 20px 48px",
      }}>
        <div style={{ width: 40, height: 4, background: BORDER, borderRadius: 2, margin: "0 auto 20px" }} />

        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {gallery[0] && (
            <div style={{ width: 80, height: 80, flexShrink: 0, position: "relative", border: `1px solid ${BORDER}`, background: "#fff" }}>
              <Image src={proxyImg(gallery[0])} alt={product.name} fill style={{ objectFit: "contain", padding: 4 }} unoptimized />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT, fontSize: 9, color: GOLD, letterSpacing: "2px", marginBottom: 4 }}>{product.brand}</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: DARK, lineHeight: 1.3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{product.name}</div>
            <div style={{ fontFamily: FONT, fontSize: 9, color: "#aaa", letterSpacing: "1px", marginTop: 4 }}>SKU: {product.sku}</div>
          </div>
          <div style={{ fontFamily: FONT, fontSize: 22, color: DARK, fontWeight: 700 }}>{fmt(product.price)}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: FONT, fontSize: 9, letterSpacing: "1px",
            color: product.inStock ? "#22a85a" : "#aaa",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: product.inStock ? "#22a85a" : "#aaa" }} />
            {product.inStock ? "IN STOCK" : "OUT OF STOCK"}
          </div>
          {product.oemNumbers?.length > 0 && <OemRibbon />}
        </div>

        <button disabled={!product.inStock} style={{
          width: "100%", height: 48,
          background: product.inStock ? GOLD : CREAM2,
          border: `1px solid ${product.inStock ? GOLD : BORDER}`,
          color: product.inStock ? "#fff" : "#aaa",
          fontFamily: FONT, fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase",
          cursor: product.inStock ? "pointer" : "not-allowed", marginBottom: 24,
        }}>
          {product.inStock ? "Add to Cart" : "Out of Stock"}
        </button>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === "description" && (
          <div style={{ fontFamily: FONT, fontSize: 12, color: DARK, lineHeight: 1.8 }}>
            {product.description
              ? <div dangerouslySetInnerHTML={{ __html: product.description }} />
              : <p style={{ color: "#aaa" }}>{product.name} by {product.brand}.</p>}
          </div>
        )}

        {tab === "features" && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {(Array.isArray(product.features) ? product.features : []).filter(Boolean).map((f, i) => (
              <li key={i} style={{
                display: "flex", gap: 10, padding: "8px 0",
                borderBottom: `1px solid ${BORDER}`,
                fontFamily: FONT, fontSize: 11, color: DARK, lineHeight: 1.6,
              }}>
                <span style={{ color: GOLD, flexShrink: 0 }}>▸</span> {f}
              </li>
            ))}
          </ul>
        )}

        {tab === "fitment" && (
          <div>
            <FitmentTable fitment={fitment} />
            {product.oemNumbers?.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: "#aaa", marginBottom: 10 }}>OEM NUMBERS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {product.oemNumbers.map((n, i) => (
                    <span key={i} style={{
                      fontFamily: FONT, fontSize: 10, padding: "4px 10px",
                      background: "#fff", border: `1px solid ${BORDER}`, color: DARK,
                    }}>{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "oem" && (
          <div>
            <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: "#aaa", marginBottom: 10 }}>OEM NUMBERS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
              {product.oemNumbers.map((n, i) => (
                <span key={i} style={{
                  fontFamily: FONT, fontSize: 11, padding: "6px 12px",
                  background: "#fff", border: `1px solid ${BORDER}`, color: DARK, letterSpacing: "1px",
                }}>{n}</span>
              ))}
            </div>
            {product.specialInstructions && (
              <div style={{
                padding: "14px 16px", marginBottom: 16,
                background: "rgba(184,146,42,0.06)", border: `1px solid rgba(184,146,42,0.2)`,
              }}>
                <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: GOLD, marginBottom: 8 }}>⚠ SPECIAL INSTRUCTIONS</div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: DARK, lineHeight: 1.7 }}>{product.specialInstructions}</div>
              </div>
            )}
          </div>
        )}

        {(product.weight || product.heightIn || product.widthIn || product.lengthIn) && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: "#aaa", marginBottom: 10 }}>DIMENSIONS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
              {[
                ["Weight", product.weight   && `${product.weight} lb`],
                ["Height", product.heightIn && `${product.heightIn} in`],
                ["Width",  product.widthIn  && `${product.widthIn} in`],
                ["Length", product.lengthIn && `${product.lengthIn} in`],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontFamily: FONT, fontSize: 8, color: "#aaa", letterSpacing: "1px" }}>{label}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: DARK }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Related Product Card ──────────────────────────────────────
function RelatedCard({ product, onOpenModal }) {
  const [imgErr, setImgErr] = useState(false);
  const src = proxyImg(product.primaryImage ?? product.gallery?.[0]);

  return (
    <div
      onClick={() => onOpenModal(product)}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.transform = ""; }}
      style={{
        background: "#fff", border: `1px solid ${BORDER}`,
        cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", overflow: "hidden",
      }}
    >
      <div style={{ aspectRatio: "1", background: CREAM, position: "relative" }}>
        {src && !imgErr ? (
          <Image src={src} alt={product.name} fill style={{ objectFit: "contain", padding: 8 }}
            unoptimized onError={() => setImgErr(true)} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: FONT, fontSize: 8, color: "#ccc", letterSpacing: "1px" }}>
            NO IMAGE
          </div>
        )}
        {product.oemNumbers?.length > 0 && (
          <div style={{ position: "absolute", top: 6, left: 0 }}><OemRibbon /></div>
        )}
        {!product.inStock && (
          <div style={{
            position: "absolute", top: 6, right: 6,
            background: "rgba(255,255,255,0.9)", border: "1px solid #ddd",
            fontFamily: FONT, fontSize: 8, color: "#aaa", padding: "2px 6px", letterSpacing: "1px",
          }}>OUT OF STOCK</div>
        )}
      </div>
      <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: FONT, fontSize: 8, color: GOLD, letterSpacing: "2px", marginBottom: 3 }}>{product.brand}</div>
        <div style={{
          fontFamily: FONT, fontSize: 11, color: DARK, lineHeight: 1.3,
          textTransform: "uppercase", letterSpacing: "0.5px",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden", marginBottom: 8,
        }}>{product.name}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: FONT, fontSize: 14, color: DARK }}>{fmt(product.price)}</span>
          <span style={{ fontFamily: FONT, fontSize: 8, color: GOLD, letterSpacing: "1px" }}>VIEW →</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function ProductDetailClient({ product, fitment = [], relatedProducts = [] }) {
  const [tab, setTab]             = useState("description");
  const [qty, setQty]             = useState(1);
  const [modalProduct, setModalProduct] = useState(null);
  const [cartToast, setCartToast] = useState(false);

  const gallery = Array.isArray(product.gallery) ? product.gallery.filter(Boolean) : [];

  // Normalise features — may be a single HTML string or an array of strings
  const featuresRaw   = Array.isArray(product.features) ? product.features.filter(Boolean) : [];
  const featuresIsHtml = featuresRaw.length === 1 && /<[a-z][^>]*>/i.test(featuresRaw[0] ?? "");
  const featuresHtml   = featuresIsHtml ? featuresRaw[0] : null;
  const featuresArray  = featuresIsHtml ? [] : featuresRaw;

  const tabs = [
    { key: "description", label: "Description" },
    ...(featuresRaw.length ? [{ key: "features", label: `Features (${featuresRaw.length})` }] : []),
    { key: "fitment", label: `Fitment${fitment?.length ? ` (${fitment.length})` : ""}` },
    ...(product.oemNumbers?.length ? [{ key: "oem", label: "OEM" }] : []),
    ...(product.specs?.length ? [{ key: "specs", label: "Specs" }] : []),
  ];

  const handleAddToCart = () => {
    // Placeholder — CartContext not yet wired
    setCartToast(true);
    setTimeout(() => setCartToast(false), 2000);
  };

  return (
    <div style={{ background: CREAM, minHeight: "100vh" }}>
      <NavBar activePage="shop" />

      {/* Breadcrumb */}
      <div style={{
        background: CREAM2, borderBottom: `1px solid ${BORDER}`,
        padding: "10px 24px", display: "flex", alignItems: "center",
        gap: "6px", fontFamily: FONT, fontSize: 9, color: "#aaa",
        letterSpacing: "1px", flexWrap: "wrap",
      }}>
        <Link href="/" style={{ color: "#aaa", textDecoration: "none" }}>HOME</Link>
        <span>→</span>
        <Link href="/browse" style={{ color: "#aaa", textDecoration: "none" }}>SHOP</Link>
        <span>→</span>
        <Link href={`/browse?category=${product.category}`} style={{ color: "#aaa", textDecoration: "none" }}>
          {product.category?.toUpperCase()}
        </Link>
        <span>→</span>
        <span style={{ color: DARK }}>{product.name?.toUpperCase()}</span>
      </div>

      {/* Main grid */}
      <div className="pdp-main-grid" style={{
        maxWidth: 1200, margin: "0 auto", padding: "32px 24px",
        display: "grid", gridTemplateColumns: "1fr 400px", gap: "48px",
      }}>
        {/* Gallery */}
        <div style={{ paddingRight: 24 }}>
          <VerticalGallery images={gallery} name={product.name} />
        </div>

        {/* Info column */}
        <div style={{ display: "flex", flexDirection: "column" }}>

          {/* Brand */}
          <div style={{ fontFamily: FONT, fontSize: 9, color: GOLD, letterSpacing: "3px", textTransform: "uppercase", marginBottom: 8 }}>
            {product.brand}
          </div>

          {/* Name */}
          <h1 style={{ fontFamily: FONT, fontSize: 28, color: DARK, lineHeight: 1.1, letterSpacing: "0.5px", textTransform: "uppercase", margin: "0 0 10px" }}>
            {product.name}
          </h1>

          {/* SKU + OEM badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT, fontSize: 9, color: "#aaa", letterSpacing: "1px" }}>SKU: {product.sku}</span>
            {product.oemNumbers?.length > 0 && <OemRibbon />}
          </div>

          {/* Price */}
          <div style={{ marginBottom: 16 }}>
            {product.was && (
              <div style={{ fontFamily: FONT, fontSize: 13, color: "#aaa", textDecoration: "line-through", marginBottom: 2 }}>
                {fmt(product.was)}
              </div>
            )}
            <div style={{ fontFamily: FONT, fontSize: 42, color: DARK, letterSpacing: "0.5px", lineHeight: 1 }}>
              {fmt(product.price)}
            </div>
            {product.hasMapPolicy && (
              <div style={{ fontFamily: FONT, fontSize: 8, color: "#aaa", letterSpacing: "1px", marginTop: 4 }}>
                MAP POLICY APPLIES
              </div>
            )}
          </div>

          {/* Stock */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: product.inStock ? "#22a85a" : "#aaa",
              boxShadow: product.inStock ? "0 0 5px #22a85a" : "none",
            }} />
            <span style={{ fontFamily: FONT, fontSize: 9, letterSpacing: "1px", color: product.inStock ? "#22a85a" : "#aaa" }}>
              {product.inStock ? "IN STOCK" : "OUT OF STOCK"}
            </span>
          </div>

          {/* ── Variant Selector ──────────────────────────────── */}
          <VariantSelector productId={product.id} currentSku={product.sku} />

          {/* Qty + Add to Cart */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, marginTop: 8 }}>
            <div style={{
              display: "flex", alignItems: "center",
              border: `1px solid ${BORDER}`, background: "#fff", flexShrink: 0,
            }}>
              <button onClick={() => setQty((n) => Math.max(1, n - 1))}
                style={{ width: 36, height: 48, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 18, color: DARK }}>
                −
              </button>
              <span style={{ width: 40, textAlign: "center", fontFamily: FONT, fontSize: 16, color: DARK }}>{qty}</span>
              <button onClick={() => setQty((n) => n + 1)}
                style={{ width: 36, height: 48, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 18, color: DARK }}>
                +
              </button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={!product.inStock}
              style={{
                flex: 1, height: 48,
                background: product.inStock ? GOLD : CREAM2,
                border: `1px solid ${product.inStock ? GOLD : BORDER}`,
                color: product.inStock ? "#fff" : "#aaa",
                fontFamily: FONT, fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase",
                cursor: product.inStock ? "pointer" : "not-allowed", transition: "all 0.15s",
              }}
            >
              {cartToast ? "✓ Added" : product.inStock ? "Add to Cart" : "Out of Stock"}
            </button>
          </div>

          {/* Perks */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
            {[
              ["🚚", "Free Shipping",   "Orders over $99"],
              ["↩",  "Easy Returns",    "30-day policy"],
              ["🔒", "Secure Checkout", "SSL encrypted"],
              ["📦", "Fast Dispatch",   "Same day on most"],
            ].map(([icon, title, sub]) => (
              <div key={title} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", background: "#fff", border: `1px solid ${BORDER}`,
              }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 9, color: DARK, letterSpacing: "0.5px" }}>{title}</div>
                  <div style={{ fontFamily: FONT, fontSize: 8, color: "#aaa", letterSpacing: "0.5px" }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Special instructions */}
          {product.specialInstructions && (
            <div style={{
              padding: "14px 16px", marginBottom: 20,
              background: "rgba(184,146,42,0.06)", border: `1px solid rgba(184,146,42,0.2)`,
            }}>
              <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: GOLD, marginBottom: 8 }}>⚠ SPECIAL INSTRUCTIONS</div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: DARK, lineHeight: 1.7 }}>{product.specialInstructions}</div>
            </div>
          )}
        </div>
      </div>

      {/* Tab section */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 60px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ paddingTop: 24 }}>
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {tab === "description" && (
          <div style={{ fontFamily: FONT, fontSize: 13, color: DARK, lineHeight: 1.8, maxWidth: 780 }}>
            {product.description
              ? <div dangerouslySetInnerHTML={{ __html: product.description }} />
              : (
                <div style={{ color: "#aaa" }}>
                  <p>{product.name} by {product.brand}.</p>
                  {product.weight && <p style={{ marginTop: 8 }}>Weight: {product.weight} lbs</p>}
                  <p style={{ marginTop: 8 }}>Category: {product.category}</p>
                </div>
              )}
          </div>
        )}

        {tab === "features" && (
          <div style={{ maxWidth: 780 }}>
            {featuresHtml ? (
              <div style={{ fontFamily: FONT, fontSize: 13, color: DARK, lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: featuresHtml }} />
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {featuresArray.map((f, i) => (
                  <li key={i} style={{
                    display: "flex", gap: 10, padding: "9px 0",
                    borderBottom: `1px solid ${BORDER}`,
                    fontFamily: FONT, fontSize: 12, color: DARK, lineHeight: 1.6,
                  }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>▸</span> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "fitment" && (
          <div>
            <FitmentTable fitment={fitment} />
            {product.oemNumbers?.length > 0 && (
              <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: "#aaa", marginBottom: 10 }}>OEM NUMBERS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {product.oemNumbers.map((n, i) => (
                    <span key={i} style={{
                      fontFamily: FONT, fontSize: 10, padding: "4px 10px",
                      background: CREAM2, border: `1px solid ${BORDER}`, color: DARK,
                    }}>{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "oem" && (
          <div style={{ maxWidth: 780 }}>
            <div style={{ fontFamily: FONT, fontSize: 8, letterSpacing: "2px", color: "#aaa", marginBottom: 12 }}>OEM NUMBERS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {product.oemNumbers?.map((n, i) => (
                <span key={i} style={{
                  fontFamily: FONT, fontSize: 12, padding: "6px 14px",
                  background: "#fff", border: `1px solid ${BORDER}`, color: DARK, letterSpacing: "1px",
                }}>{n}</span>
              ))}
            </div>
            {product.upc && (
              <div style={{ fontFamily: FONT, fontSize: 10, color: "#aaa", letterSpacing: "1px" }}>
                UPC: {product.upc}
              </div>
            )}
          </div>
        )}

        {tab === "specs" && product.specs?.length > 0 && (
          <table style={{ width: "100%", maxWidth: 600, borderCollapse: "collapse" }}>
            <tbody>
              {product.specs.map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? CREAM : "#fff" }}>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 9, color: "#aaa", letterSpacing: "1px", width: 180, textTransform: "uppercase" }}>{s.label}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 11, color: DARK }}>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 60px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginBottom: 20, paddingTop: 24, borderTop: `1px solid ${BORDER}`,
          }}>
            <span style={{ fontFamily: FONT, fontSize: 10, letterSpacing: "3px", color: DARK, textTransform: "uppercase" }}>
              More from <span style={{ color: GOLD }}>{product.brand}</span>
            </span>
            <Link href={`/browse?category=${product.category}`} style={{
              fontFamily: FONT, fontSize: 8, color: GOLD, letterSpacing: "1px", textDecoration: "none",
            }}>
              View All →
            </Link>
          </div>
          <div className="related-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {relatedProducts.map((p) => (
              <RelatedCard key={p.id} product={p} onOpenModal={setModalProduct} />
            ))}
          </div>
        </div>
      )}

      {/* Related product quick-view modal */}
      {modalProduct && (
        <ProductModal product={modalProduct} fitment={[]} onClose={() => setModalProduct(null)} />
      )}

      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 768px) {
          .pdp-main-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
            padding: 20px 16px !important;
          }
          .pdp-main-grid > div:first-child { padding-right: 32px !important; }
          .related-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
