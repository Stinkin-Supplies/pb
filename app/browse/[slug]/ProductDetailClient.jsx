"use client";
// app/browse/[slug]/ProductDetailClient.jsx
// Full rebuild — Cream/Gold/Black — Thirty-Third Pass

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import VariantSelector from "@/components/browse/VariantSelector";

// ── Tokens ────────────────────────────────────────────────────
const C = {
  gold:        "#C9A84C",
  goldText:    "#E8C96A",
  goldBorder:  "rgba(201,168,76,0.35)",
  goldBg:      "rgba(201,168,76,0.08)",
  cream:       "#F2EAD3",
  creamMid:    "#EDE0C0",
  creamDeep:   "#E0CFA0",
  surface:     "#FAF7EF",
  white:       "#FFFFFF",
  black:       "#141210",
  charcoal:    "#2A2520",
  ink:         "#574E38",
  inkLight:    "#8C7E62",
  border:      "#D6C99A",
  borderLight: "#EAE0C0",
  green:       "#3A6B3A",
  red:         "#8B2E2E",
};

const DISPLAY = "'Bebas Neue','Barlow Condensed',sans-serif";
const MONO    = "'IBM Plex Mono','Courier New',monospace";
const BODY    = "'Barlow','Barlow Condensed',sans-serif";

const fmt = (n) => n != null ? `$${Number(n).toFixed(2)}` : null;

function proxyImg(src) {
  if (!src) return null;
  if (src.startsWith("/api/img") || src.startsWith("/api/image-proxy")) return src;
  if (src.endsWith(".zip")) return null;
  if (src.includes("lemansnet.com") || src.startsWith("http://"))
    return `/api/img?u=${encodeURIComponent(src)}`;
  return src;
}

// ── Gallery ────────────────────────────────────────────────────
function Gallery({ images, name }) {
  const [active, setActive] = useState(0);
  const proxied = (images ?? []).filter(Boolean).map(proxyImg).filter(Boolean);
  const hasSrc  = proxied.length > 0;

  return (
    <div style={{ display: "flex", gap: 10 }}>
      {/* Main image */}
      <div style={{
        flex: 1, aspectRatio: "1", position: "relative",
        background: C.surface, border: `1px solid ${C.borderLight}`,
        overflow: "hidden",
      }}>
        {hasSrc ? (
          <Image
            src={proxied[active]}
            alt={name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            style={{ objectFit: "contain", padding: 24 }}
            unoptimized
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.borderLight} strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="1"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15L16 10L5 21"/>
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight, letterSpacing: "0.14em", textTransform: "uppercase" }}>No Image</span>
          </div>
        )}
      </div>

      {/* Thumbs — vertical strip RIGHT */}
      {proxied.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          {proxied.slice(0, 5).map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                width: 68, height: 68, padding: 3, flexShrink: 0,
                border: `2px solid ${i === active ? C.gold : C.borderLight}`,
                background: C.surface, cursor: "pointer",
                transition: "border-color 0.15s",
                position: "relative", overflow: "hidden",
              }}
            >
              <Image src={src} alt={`${name} ${i + 1}`} fill style={{ objectFit: "contain" }} unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stock indicator ────────────────────────────────────────────
function Stock({ inStock, qty }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: inStock ? C.green : "#9A9080",
        boxShadow: inStock ? `0 0 0 3px rgba(58,107,58,0.15)` : "none",
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: inStock ? C.green : C.inkLight,
      }}>
        {inStock ? (qty > 0 ? `${qty} In Stock` : "In Stock") : "Out of Stock"}
      </span>
    </div>
  );
}

// ── Fitment grouped ────────────────────────────────────────────
function groupFitment(fitment) {
  const map = new Map();
  (fitment ?? []).forEach((f) => {
    const key = f.model ?? f.model_code ?? "—";
    if (!map.has(key)) map.set(key, new Set());
    const s = map.get(key);
    if (f.year_start != null && f.year_end != null) {
      for (let y = Number(f.year_start); y <= Number(f.year_end); y++) s.add(y);
    } else if (f.year != null) s.add(Number(f.year));
  });
  const rangeStr = (years) => {
    const sorted = [...years].sort((a, b) => a - b);
    if (!sorted.length) return "—";
    const out = []; let s = sorted[0], e = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === e + 1) e = sorted[i];
      else { out.push(s === e ? `${s}` : `${s}–${e}`); s = e = sorted[i]; }
    }
    out.push(s === e ? `${s}` : `${s}–${e}`);
    return out.join(", ");
  };
  return [...map.entries()]
    .map(([model, years]) => ({ model, range: rangeStr(years), minYear: Math.min(...years) }))
    .sort((a, b) => a.minYear - b.minYear);
}

// ── Tab panel (left-side vertical tabs + content right) ────────
function TabPanel({ fitment, product, featuresHtml, featuresArray }) {
  const [active, setActive] = useState("fitment");

  const rows = groupFitment(fitment);

  const tabs = [
    { key: "fitment",     label: "Fitment" },
    { key: "details",     label: "Details" },
    ...(product.oemNumbers?.length ? [{ key: "oem", label: "OEM" }] : []),
    ...(product.specs?.length      ? [{ key: "specs", label: "Specs" }] : []),
  ];

  return (
    <div style={{
      display: "flex",
      border: `1px solid ${C.border}`,
      background: C.surface,
      minHeight: 320,
    }}>
      {/* Vertical tab strip */}
      <div style={{
        display: "flex", flexDirection: "column",
        borderRight: `1px solid ${C.border}`,
        flexShrink: 0, width: 160,
        background: C.cream,
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              padding: "18px 16px",
              background: active === t.key ? C.surface : "transparent",
              border: "none",
              borderLeft: `4px solid ${active === t.key ? C.gold : "transparent"}`,
              textAlign: "left",
              fontFamily: DISPLAY,
              fontSize: 22,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: active === t.key ? C.black : C.inkLight,
              textShadow: active === t.key
                ? `1px 1px 0px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)`
                : `1px 1px 0px rgba(0,0,0,0.08)`,
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s",
              lineHeight: 1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto", maxHeight: 420, background: "rgba(201,168,76,0.05)" }}>

        {/* FITMENT */}
        {active === "fitment" && (
          <div>
            {rows.length === 0 ? (
              <div style={{ fontFamily: MONO, fontSize: 13, color: C.inkLight, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Fitment data pending
              </div>
            ) : (
              <>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkLight, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
                  {rows.length} compatible model{rows.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {rows.map((row, i) => (
                    <div key={row.model} style={{
                      padding: "7px 12px",
                      background: i % 2 === 0 ? C.cream : C.surface,
                      borderBottom: `1px solid ${C.borderLight}`,
                      fontFamily: MONO, fontSize: 14, color: C.black, letterSpacing: "0.04em",
                    }}>
                      {row.range} &nbsp;{row.model}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* DETAILS */}
        {active === "details" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {product.description && (
              <div style={{ fontFamily: BODY, fontSize: 14, color: C.ink, lineHeight: 1.8 }}>
                <div dangerouslySetInnerHTML={{ __html: product.description }} />
              </div>
            )}
            {!product.description && !featuresArray.length && !featuresHtml && (
              <p style={{ fontFamily: BODY, fontSize: 14, color: C.inkLight, lineHeight: 1.8 }}>
                {product.name}{product.brand ? ` by ${product.brand}` : ""}.
              </p>
            )}
            {featuresHtml && (
              <div style={{ fontFamily: BODY, fontSize: 15, color: C.ink, lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: featuresHtml }} />
            )}
            {featuresArray.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {featuresArray.map((f, i) => (
                  <li key={i} style={{
                    display: "flex", gap: 10, padding: "8px 0",
                    borderBottom: `1px solid ${C.borderLight}`,
                    fontFamily: BODY, fontSize: 15, color: C.ink, lineHeight: 1.6,
                  }}>
                    <span style={{ color: C.gold, flexShrink: 0, marginTop: 2 }}>▸</span>{f}
                  </li>
                ))}
              </ul>
            )}
            {product.specialInstructions && (
              <div style={{ padding: "12px 16px", background: C.goldBg, border: `1px solid ${C.goldBorder}`, borderLeft: `3px solid ${C.gold}` }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: C.gold, marginBottom: 6, textTransform: "uppercase" }}>⚠ Note</div>
                <div style={{ fontFamily: BODY, fontSize: 15, color: C.black, lineHeight: 1.7 }}>{product.specialInstructions}</div>
              </div>
            )}
          </div>
        )}

        {/* OEM */}
        {active === "oem" && (
          <OemList oemNumbers={product.oemNumbers} upc={product.upc} />
        )}

        {/* SPECS */}
        {active === "specs" && product.specs?.length > 0 && (
          <div>
            {product.specs.map((s, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "9px 0", borderBottom: `1px solid ${C.borderLight}`, gap: 16,
              }}>
                <span style={{ fontFamily: BODY, fontSize: 15, color: C.ink }}>{s.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 14, color: C.black, textAlign: "right" }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── OEM list ───────────────────────────────────────────────────
function OemList({ oemNumbers, upc }) {
  const [copied, setCopied] = useState(null);
  const copy = (n) => {
    try { navigator.clipboard.writeText(n); } catch {}
    setCopied(n);
    setTimeout(() => setCopied(null), 2000);
  };
  if (!oemNumbers?.length) return (
    <div style={{ fontFamily: MONO, fontSize: 13, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>No OEM numbers on file</div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        {oemNumbers.length} cross-reference{oemNumbers.length !== 1 ? "s" : ""} — tap to copy
      </div>
      {oemNumbers.map((num, i) => (
        <button key={i} onClick={() => copy(num)} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 14px",
          background: C.cream, border: `1px solid ${copied === num ? C.gold : C.borderLight}`,
          cursor: "pointer", textAlign: "left", width: "100%",
          transition: "border-color 0.15s",
          WebkitTapHighlightColor: "transparent",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 15, color: C.black, letterSpacing: "0.05em" }}>{num}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: copied === num ? C.green : C.inkLight }}>
            {copied === num ? "Copied ✓" : "Copy"}
          </span>
        </button>
      ))}
      {upc && (
        <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 13, color: C.inkLight, letterSpacing: "0.06em" }}>
          UPC: {upc}
        </div>
      )}
    </div>
  );
}

// ── Related card ───────────────────────────────────────────────
function RelatedCard({ product, onOpen }) {
  const [err, setErr] = useState(false);
  const src = proxyImg(product.primaryImage ?? product.gallery?.[0]);
  return (
    <Link href={`/browse/${product.slug}`} style={{ textDecoration: "none" }}>
      <div
        onClick={(e) => { e.preventDefault(); onOpen(product); }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderLight; e.currentTarget.style.transform = ""; }}
        style={{ border: `1px solid ${C.borderLight}`, background: C.surface, cursor: "pointer", transition: "border-color 0.15s, transform 0.15s", overflow: "hidden" }}
      >
        <div style={{ aspectRatio: "1", background: C.cream, position: "relative" }}>
          {src && !err
            ? <Image src={src} alt={product.name} fill style={{ objectFit: "contain", padding: 10 }} unoptimized onError={() => setErr(true)} />
            : <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, color: C.borderLight, letterSpacing: "0.1em" }}>NO IMAGE</div>
          }
        </div>
        <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${C.borderLight}` }}>
          {product.brand && <div style={{ fontFamily: MONO, fontSize: 11, color: C.gold, letterSpacing: "0.14em", marginBottom: 4, textTransform: "uppercase" }}>{product.brand}</div>}
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: C.black, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 8 }}>
            {product.name}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 18, color: C.black }}>{fmt(product.price)}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.gold, letterSpacing: "0.08em", textTransform: "uppercase" }}>View →</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Timeline card ──────────────────────────────────────────────
function TimelineCard({ part, direction }) {
  const [err, setErr] = useState(false);
  const src = proxyImg(part.image_url);
  const yr = part.fitment_year_start && part.fitment_year_end
    ? part.fitment_year_start === part.fitment_year_end ? `${part.fitment_year_start}` : `${part.fitment_year_start}–${part.fitment_year_end}`
    : null;
  return (
    <Link href={`/browse/${part.slug}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
      <div
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.gold; e.currentTarget.style.transform = "translateY(-2px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderLight; e.currentTarget.style.transform = ""; }}
        style={{ background: C.surface, border: `1px solid ${C.borderLight}`, overflow: "hidden", transition: "border-color 0.15s, transform 0.15s" }}
      >
        <div style={{ background: C.cream, borderBottom: `1px solid ${C.borderLight}`, padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: direction === "prev" ? "flex-start" : "flex-end", gap: 6 }}>
          {direction === "prev" && <span style={{ fontFamily: MONO, fontSize: 11, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>← Earlier</span>}
          {yr && <span style={{ fontFamily: DISPLAY, fontSize: 15, color: C.black }}>{yr}</span>}
          {direction === "next" && <span style={{ fontFamily: MONO, fontSize: 11, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>Later →</span>}
        </div>
        <div style={{ aspectRatio: "1", background: C.cream, position: "relative" }}>
          {src && !err
            ? <img src={src} alt={part.name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12 }} />
            : <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, color: C.borderLight, letterSpacing: "0.1em" }}>NO IMAGE</div>
          }
        </div>
        <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${C.borderLight}` }}>
          {part.brand && <div style={{ fontFamily: MONO, fontSize: 11, color: C.gold, letterSpacing: "0.14em", marginBottom: 3, textTransform: "uppercase" }}>{part.brand}</div>}
          <div style={{ fontFamily: BODY, fontSize: 14, fontWeight: 500, color: C.black, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 6 }}>{part.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 17, color: C.black }}>{part.computed_price ? `$${Number(part.computed_price).toFixed(2)}` : "—"}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: part.in_stock ? C.green : C.red }}>{part.in_stock ? "In Stock" : "Out"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Model timeline ─────────────────────────────────────────────
function ModelTimeline({ prevPart, nextPart, currentYearStart, currentYearEnd }) {
  if (!prevPart && !nextPart) return null;
  const label = currentYearStart && currentYearEnd
    ? currentYearStart === currentYearEnd ? `${currentYearStart}` : `${currentYearStart}–${currentYearEnd}`
    : null;
  return (
    <div style={{ marginTop: 60, paddingTop: 40, borderTop: `1px solid ${C.borderLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 24, letterSpacing: "0.04em", color: C.black }}>Model <span style={{ color: C.gold }}>Timeline</span></span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.inkLight, letterSpacing: "0.08em" }}>Same model · adjacent years</span>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {prevPart ? <TimelineCard part={prevPart} direction="prev" /> : (
            <div style={{ border: `1px dashed ${C.borderLight}`, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, fontFamily: MONO, fontSize: 11, color: C.borderLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>No earlier version</div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 6px" }}>
          <div style={{ width: 1, flex: 1, background: C.borderLight }} />
          <div style={{ background: C.black, color: C.goldText, fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em", padding: "4px 10px", whiteSpace: "nowrap", textTransform: "uppercase" }}>
            {label ?? "This Part"}
          </div>
          <div style={{ width: 1, flex: 1, background: C.borderLight }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {nextPart ? <TimelineCard part={nextPart} direction="next" /> : (
            <div style={{ border: `1px dashed ${C.borderLight}`, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, fontFamily: MONO, fontSize: 11, color: C.borderLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>No later version</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick-view modal ───────────────────────────────────────────
function QuickView({ product, fitment, onClose }) {
  const [tab, setTab] = useState("details");
  const gallery = Array.isArray(product.gallery) ? product.gallery.filter(Boolean).map(proxyImg).filter(Boolean) : [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,16,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", borderRadius: "8px 8px 0 0", padding: "20px 20px 48px" }}>
        <div style={{ width: 32, height: 3, background: C.border, margin: "0 auto 20px", borderRadius: 2 }} />
        <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
          {gallery[0] && (
            <div style={{ width: 64, height: 64, flexShrink: 0, position: "relative", border: `1px solid ${C.borderLight}`, background: C.cream }}>
              <Image src={gallery[0]} alt={product.name} fill style={{ objectFit: "contain", padding: 4 }} unoptimized />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {product.brand && <div style={{ fontFamily: MONO, fontSize: 11, color: C.gold, letterSpacing: "0.14em", marginBottom: 3, textTransform: "uppercase" }}>{product.brand}</div>}
            <div style={{ fontFamily: BODY, fontSize: 15, fontWeight: 600, color: C.black, lineHeight: 1.3 }}>{product.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkLight, letterSpacing: "0.08em", marginTop: 4 }}>{product.sku}</div>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 28, color: C.black, flexShrink: 0 }}>{fmt(product.price)}</div>
        </div>
        <Stock inStock={product.inStock} qty={product.stockQty} />
        <Link href={`/browse/${product.slug}`} style={{ display: "block", width: "100%", padding: "14px 0", textAlign: "center", background: C.black, color: C.goldText, fontFamily: DISPLAY, fontSize: 17, letterSpacing: "0.12em", textDecoration: "none", marginTop: 16, marginBottom: 20 }}>
          View Full Page →
        </Link>
        {/* Mini tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {["details","fitment"].map((k) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "10px 16px", background: "none", border: "none",
              borderBottom: `2px solid ${tab === k ? C.gold : "transparent"}`, marginBottom: "-1px",
              fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
              color: tab === k ? C.black : C.inkLight, cursor: "pointer",
            }}>{k}</button>
          ))}
        </div>
        <div style={{ paddingTop: 18 }}>
          {tab === "details" && (
            <div style={{ fontFamily: BODY, fontSize: 13, color: C.ink, lineHeight: 1.8 }}>
              {product.description ? <div dangerouslySetInnerHTML={{ __html: product.description }} /> : <p style={{ color: C.inkLight }}>{product.name}.</p>}
            </div>
          )}
          {tab === "fitment" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groupFitment(fitment).length === 0
                ? <div style={{ fontFamily: MONO, fontSize: 10, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>Fitment data pending</div>
                : groupFitment(fitment).map((row) => (
                    <div key={row.model} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: C.cream, border: `1px solid ${C.borderLight}`, borderLeft: `3px solid ${C.gold}` }}>
                      <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, color: C.black }}>{row.model}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.gold }}>{row.range}</span>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function ProductDetailClient({
  product,
  fitment = [],
  relatedProducts = [],
  prevPart = null,
  nextPart = null,
  timelineYearStart = null,
  timelineYearEnd = null,
}) {
  const [qty, setQty]             = useState(1);
  const [modal, setModal]         = useState(null);
  const [cartDone, setCartDone]   = useState(false);

  const gallery = Array.isArray(product.gallery)
    ? product.gallery.filter(Boolean).map(proxyImg).filter(Boolean)
    : [];

  const featuresRaw    = Array.isArray(product.features) ? product.features.filter(Boolean) : [];
  const featuresIsHtml = featuresRaw.length === 1 && /<[a-z][^>]*>/i.test(featuresRaw[0] ?? "");
  const featuresHtml   = featuresIsHtml ? featuresRaw[0] : null;
  const featuresArray  = featuresIsHtml ? [] : featuresRaw;

  const addToCart = () => { setCartDone(true); setTimeout(() => setCartDone(false), 2000); };

  // Era / category badge line
  const categoryBadge = [product.displayCategory, product.displaySubcategory]
    .filter(Boolean).join(" · ") || product.category || null;

  return (
    <div style={{ background: C.surface, minHeight: "100vh", fontFamily: BODY }}>

      {/* ── BREADCRUMB ── */}
      <div style={{
        background: C.cream, borderBottom: `2px solid ${C.border}`,
        padding: "18px 28px",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <Link href="/" style={{ fontFamily: BODY, fontSize: 16, fontWeight: 500, color: C.inkLight, textDecoration: "none", letterSpacing: "0.01em", transition: "color 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.color = C.black}
          onMouseLeave={(e) => e.currentTarget.style.color = C.inkLight}>
          Home
        </Link>
        <span style={{ color: C.border, fontSize: 20, lineHeight: 1, fontWeight: 300 }}>›</span>
        <Link href="/browse" style={{ fontFamily: BODY, fontSize: 16, fontWeight: 500, color: C.inkLight, textDecoration: "none", letterSpacing: "0.01em", transition: "color 0.15s" }}
          onMouseEnter={(e) => e.currentTarget.style.color = C.black}
          onMouseLeave={(e) => e.currentTarget.style.color = C.inkLight}>
          Shop
        </Link>
        {product.displayCategory && <>
          <span style={{ color: C.border, fontSize: 20, lineHeight: 1, fontWeight: 300 }}>›</span>
          <Link href={`/browse?display_category=${encodeURIComponent(product.displayCategory)}`}
            style={{ fontFamily: BODY, fontSize: 16, fontWeight: 500, color: C.inkLight, textDecoration: "none", letterSpacing: "0.01em", transition: "color 0.15s" }}
            onMouseEnter={(e) => e.currentTarget.style.color = C.black}
            onMouseLeave={(e) => e.currentTarget.style.color = C.inkLight}>
            {product.displayCategory}
          </Link>
        </>}
        <span style={{ color: C.border, fontSize: 20, lineHeight: 1, fontWeight: 300 }}>›</span>
        <span style={{ fontFamily: BODY, fontSize: 16, fontWeight: 700, color: C.black, letterSpacing: "0.01em", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.name}
        </span>
      </div>


      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "36px 28px 0" }}>
        <div className="pdp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.6fr) minmax(340px,1fr)", gap: 52, alignItems: "start" }}>

          {/* LEFT — Gallery */}
          <div className="pdp-sticky" style={{ position: "sticky", top: 20, maxWidth: 360 }}>
            <Gallery images={gallery} name={product.name} />
          </div>

          {/* RIGHT — Info */}
          <div>

            {/* Category chip */}
            {categoryBadge && (
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.inkLight, marginBottom: 8 }}>
                {categoryBadge}
              </div>
            )}

            {/* Brand */}
            {product.brand && (
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", color: C.gold, marginBottom: 10 }}>
                {product.brand}
              </div>
            )}

            {/* Product name */}
            <h1 style={{
              fontFamily: DISPLAY,
              fontSize: "clamp(32px, 3.8vw, 48px)",
              lineHeight: 0.95,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              color: C.black,
              margin: "0 0 22px",
              fontWeight: 400,
            }}>
              {product.name}
            </h1>

            {/* Price + stock */}
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 10 }}>
                <span style={{
                  fontFamily: DISPLAY,
                  fontSize: "clamp(44px, 4.5vw, 56px)",
                  color: C.black,
                  letterSpacing: "0.01em",
                  lineHeight: 1,
                }}>
                  {fmt(product.price)}
                </span>
                {product.was && (
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.inkLight, textDecoration: "line-through" }}>
                    {fmt(product.was)}
                  </span>
                )}
              </div>
              {product.hasMapPolicy && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Map policy applies</div>
              )}
              <Stock inStock={product.inStock} qty={product.stockQty} />
            </div>

            {/* OEM inline — if present */}
            {product.oemNumbers?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
                {product.oemNumbers.slice(0, 3).map((n, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ background: C.gold, color: C.black, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", padding: "3px 8px", textTransform: "uppercase" }}>OEM</span>
                    <span style={{ background: C.cream, border: `1px solid ${C.border}`, borderLeft: "none", fontFamily: MONO, fontSize: 13, color: C.black, padding: "3px 12px", letterSpacing: "0.05em" }}>{n}</span>
                  </div>
                ))}
                {product.oemNumbers.length > 3 && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.inkLight, letterSpacing: "0.08em", alignSelf: "center" }}>+{product.oemNumbers.length - 3} more in OEM tab</span>
                )}
              </div>
            )}

            {/* Note */}
            {product.specialInstructions && (
              <div style={{ padding: "10px 14px", marginBottom: 18, background: "rgba(201,168,76,0.07)", border: `1px solid rgba(201,168,76,0.25)`, borderLeft: `3px solid ${C.gold}` }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: C.gold, marginBottom: 4, textTransform: "uppercase" }}>⚠ Note</div>
                <div style={{ fontFamily: BODY, fontSize: 14, color: C.black, lineHeight: 1.6 }}>{product.specialInstructions}</div>
              </div>
            )}

            <VariantSelector productId={product.id} currentSku={product.sku} />

            {/* Qty + Add to Cart */}
            <div style={{ display: "flex", gap: 10, marginTop: 16, marginBottom: 10 }}>
              {/* Qty stepper */}
              <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${C.border}`, background: C.white, flexShrink: 0 }}>
                <button onClick={() => setQty((n) => Math.max(1, n - 1))}
                  style={{ width: 40, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.black, fontFamily: BODY, borderRight: `1px solid ${C.borderLight}` }}>
                  −
                </button>
                <span style={{ width: 40, textAlign: "center", fontFamily: MONO, fontSize: 15, color: C.black, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {qty}
                </span>
                <button onClick={() => setQty((n) => n + 1)}
                  style={{ width: 40, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.black, fontFamily: BODY, borderLeft: `1px solid ${C.borderLight}` }}>
                  +
                </button>
              </div>

              {/* Add to cart */}
              <button
                onClick={addToCart}
                disabled={!product.inStock}
                style={{
                  flex: 1,
                  height: 54,
                  background: product.inStock ? C.gold : C.creamMid,
                  border: "none",
                  color: product.inStock ? C.black : C.inkLight,
                  fontFamily: DISPLAY,
                  fontSize: 22,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  cursor: product.inStock ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                  WebkitTapHighlightColor: "transparent",
                  fontWeight: 700,
                }}
                onMouseEnter={(e) => { if (product.inStock) e.currentTarget.style.background = C.creamDeep; }}
                onMouseLeave={(e) => { if (product.inStock) e.currentTarget.style.background = C.gold; }}
              >
                {cartDone ? "✓ Added" : product.inStock ? "Add to Cart" : "Out of Stock"}
              </button>
            </div>

            {/* Tab panel — fitment + details inline in info column */}
            <div style={{ marginTop: 20 }}>
              <TabPanel
                fitment={fitment}
                product={product}
                featuresHtml={featuresHtml}
                featuresArray={featuresArray}
              />
            </div>

            {/* SKU */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderLight}`, fontFamily: MONO, fontSize: 12, color: C.inkLight, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              SKU: {product.sku}
            </div>
          </div>
        </div>

        {/* ── MODEL TIMELINE ── */}
        <ModelTimeline
          prevPart={prevPart}
          nextPart={nextPart}
          currentYearStart={timelineYearStart}
          currentYearEnd={timelineYearEnd}
        />
      </div>

      {/* ── RELATED ── */}
      {relatedProducts.length > 0 && (
        <div style={{ marginTop: 60, borderTop: `1px solid ${C.borderLight}`, padding: "40px 28px 80px", maxWidth: 1240, margin: "60px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 26, letterSpacing: "0.04em", color: C.black }}>
              More from <span style={{ color: C.gold }}>{product.brand ?? "This Category"}</span>
            </span>
            <Link href={`/browse?display_category=${encodeURIComponent(product.displayCategory ?? product.category ?? "")}`}
              style={{ fontFamily: MONO, fontSize: 12, color: C.gold, letterSpacing: "0.1em", textDecoration: "none", textTransform: "uppercase" }}>
              View All →
            </Link>
          </div>
          <div className="related-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 14 }}>
            {relatedProducts.map((p) => (
              <RelatedCard key={p.id} product={p} onOpen={setModal} />
            ))}
          </div>
        </div>
      )}

      {/* Quick-view */}
      {modal && <QuickView product={modal} fitment={[]} onClose={() => setModal(null)} />}

      {/* ── RESPONSIVE ── */}
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 768px) {
          .pdp-grid {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
          }
          .pdp-sticky { position: static !important; }
          .related-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
        }
        @media (min-width: 769px) and (max-width: 1080px) {
          .pdp-grid { grid-template-columns: minmax(0,1fr) 320px !important; gap: 36px !important; }
        }
      `}</style>
    </div>
  );
}
