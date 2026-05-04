"use client";
// ============================================================
// components/HeroSearch.jsx
// Large hero search — sits above era cards on homepage
//
// 1. Copy to:  components/HeroSearch.jsx
// 2. In app/page.jsx add:
//      import HeroSearch from "@/components/HeroSearch";
// 3. Place <HeroSearch /> right after <FloatingHeader />
//    and remove paddingTop: 52 from the eras section
//    (the hero handles its own top padding for the fixed nav)
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DARK  = "#080808";
const GOLD  = "#b8952e";
const LIGHT = "#e8e2d8";

const PLACEHOLDERS = [
  "Search by OEM part number...",
  "Try: 17700-48A",
  "Try: Knucklehead rocker",
  "Try: S&S Super E carb",
  "Try: 1965 Panhead",
  "Try: Andrews N4 cams",
  "Try: Sportster primary cover",
  "Try: FLHR oil filter",
  "Try: shovelhead exhaust",
  "Try: 45849-71",
];

// ─── Cycling placeholder ───────────────────────────────────────────────────────

function CyclingPlaceholder({ hidden }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (hidden) return;
    const id = setInterval(() => setIdx(i => (i + 1) % PLACEHOLDERS.length), 2600);
    return () => clearInterval(id);
  }, [hidden]);

  return (
    <AnimatePresence mode="wait">
      {!hidden && (
        <motion.span
          key={idx}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.25 }}
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center",
            fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
            fontSize: "clamp(13px, 1.5vw, 16px)",
            letterSpacing: "0.1em",
            color: "#2a2a2a",
            textTransform: "uppercase",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {PLACEHOLDERS[idx]}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ─── Search result row ─────────────────────────────────────────────────────────

function ResultRow({ hit, index }) {
  const doc = hit.document;
  const oemList = Array.isArray(doc.oem_numbers) ? doc.oem_numbers.slice(0, 3) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.15 }}
    >
      <Link href={`/browse/${doc.slug}`} style={{ textDecoration: "none", display: "block" }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "10px 20px",
            borderBottom: "1px solid #0f0f0f",
            cursor: "pointer", transition: "background 0.1s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#0e0e0e"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          {/* Thumbnail */}
          <div style={{
            width: 38, height: 38, flexShrink: 0,
            background: "#090909", border: "1px solid #181818",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            {doc.image_url
              ? <img src={doc.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 3 }} />
              : <span style={{ fontSize: 7, color: "#222", fontFamily: "monospace" }}>—</span>
            }
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 7, letterSpacing: "0.18em", color: "#3a3a3a",
              textTransform: "uppercase", marginBottom: 2,
            }}>{doc.brand}</div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 11, color: "#bbb", letterSpacing: "0.04em",
              textTransform: "uppercase",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{doc.name}</div>
            {oemList.length > 0 && (
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 7, color: "#2e2e2e", letterSpacing: "0.1em",
                textTransform: "uppercase", marginTop: 2,
              }}>OEM {oemList.join(" · ")}</div>
            )}
          </div>

          {/* Price + badges */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {doc.msrp && (
              <div style={{
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: 17, color: LIGHT, letterSpacing: "0.04em",
              }}>${Number(doc.msrp).toFixed(2)}</div>
            )}
            {doc.is_harley_fitment && (
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 6, letterSpacing: "0.15em", color: GOLD,
                textTransform: "uppercase", marginTop: 2,
              }}>HD FIT</div>
            )}
            {doc.fitment_hd_families?.length > 0 && (
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 6, letterSpacing: "0.1em", color: "#3a3a3a",
                textTransform: "uppercase",
              }}>{doc.fitment_hd_families[0]}</div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Main HeroSearch ───────────────────────────────────────────────────────────

export default function HeroSearch() {
  const router = useRouter();
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [found, setFound]     = useState(null);
  const inputRef  = useRef(null);
  const debouncer = useRef(null);
  const wrapRef   = useRef(null);

  // Cursor-tracked glow
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const gx = useTransform(mx, v => `${v}px`);
  const gy = useTransform(my, v => `${v}px`);

  function onMouseMove(e) {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  }

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); setFound(null); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q.trim())}&per_page=7&query_by=name,brand,oem_numbers,oem_part_number,features&sort_by=sort_priority:desc,_text_match:desc`
      );
      const data = await res.json();
      setResults(data.hits || []);
      setFound(typeof data.found === "number" ? data.found : null);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function onChange(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debouncer.current);
    debouncer.current = setTimeout(() => doSearch(q), 200);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (query.trim()) router.push(`/browse?q=${encodeURIComponent(query.trim())}`);
  }

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocused(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDrop = focused && query.length >= 2;

  return (
    <section
      ref={wrapRef}
      onMouseMove={onMouseMove}
      style={{
        position: "relative",
        background: DARK,
        paddingTop: "clamp(80px, 12vw, 120px)",
        paddingBottom: "clamp(48px, 7vw, 80px)",
        paddingLeft: "clamp(20px, 5vw, 60px)",
        paddingRight: "clamp(20px, 5vw, 60px)",
        overflow: "hidden",
        borderBottom: "1px solid #111",
      }}
    >
      {/* Cursor glow */}
      <motion.div style={{
        position: "absolute", width: 700, height: 700, borderRadius: "50%",
        background: `radial-gradient(circle, ${GOLD}08 0%, transparent 65%)`,
        pointerEvents: "none", zIndex: 0,
        left: gx, top: gy, transform: "translate(-50%,-50%)",
      }} />

      {/* Static ambient glow at bottom */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(ellipse 80% 50% at 50% 110%, ${GOLD}05 0%, transparent 70%)`,
      }} />

      {/* Decorative hairlines */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "35%", height: 1, background: "#0d0d0d", zIndex: 0 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "68%", height: 1, background: "#0d0d0d", zIndex: 0 }} />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 820, margin: "0 auto" }}>

        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
            fontSize: "clamp(7px, 0.75vw, 9px)",
            letterSpacing: "0.3em", color: GOLD,
            textTransform: "uppercase", marginBottom: 20,
          }}
        >
          ◈ &nbsp;88,000+ PARTS · WPS · PARTS UNLIMITED · VTWIN
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06 }}
          style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: "clamp(52px, 9vw, 108px)",
            letterSpacing: "0.02em", lineHeight: 0.88,
            color: LIGHT, marginBottom: 12,
          }}
        >
          Find Your<br />
          <span style={{ color: GOLD }}>Parts.</span>
        </motion.div>

        {/* Subline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: "clamp(9px, 0.9vw, 11px)",
            letterSpacing: "0.16em", color: "#3a3a3a",
            textTransform: "uppercase", marginBottom: 36,
          }}
        >
          Search OEM numbers, model names, brands, or part types
        </motion.div>

        {/* ── Search bar ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.22 }}
          style={{ position: "relative" }}
        >
          <form onSubmit={onSubmit}>
            <div style={{
              display: "flex",
              border: `1.5px solid ${focused ? GOLD : "#1e1e1e"}`,
              transition: "border-color 0.2s",
              background: "#050505",
            }}>
              {/* Search icon + input */}
              <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
                <div style={{ padding: "0 14px 0 20px", flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="5" stroke={focused ? GOLD : "#2a2a2a"} strokeWidth="1.5"
                      style={{ transition: "stroke 0.2s" }} />
                    <path d="M11 11L15 15" stroke={focused ? GOLD : "#2a2a2a"} strokeWidth="1.5" strokeLinecap="round"
                      style={{ transition: "stroke 0.2s" }} />
                  </svg>
                </div>

                <div style={{ position: "relative", flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
                  <CyclingPlaceholder hidden={query.length > 0} />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={onChange}
                    onFocus={() => setFocused(true)}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setFocused(false); inputRef.current?.blur(); }
                    }}
                    autoComplete="off"
                    style={{
                      width: "100%",
                      height: "clamp(52px, 6vw, 68px)",
                      background: "transparent", border: "none", outline: "none",
                      fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                      fontSize: "clamp(13px, 1.5vw, 16px)",
                      letterSpacing: "0.1em", color: LIGHT,
                      textTransform: "uppercase", caretColor: GOLD,
                    }}
                  />
                </div>

                {/* Clear × */}
                <AnimatePresence>
                  {query && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={() => { setQuery(""); setResults([]); setFound(null); inputRef.current?.focus(); }}
                      style={{
                        background: "none", border: "none", color: "#2a2a2a",
                        cursor: "pointer", padding: "0 14px",
                        fontSize: 18, display: "flex", alignItems: "center",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = "#888"}
                      onMouseLeave={e => e.currentTarget.style.color = "#2a2a2a"}
                    >×</motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit */}
              <motion.button
                type="submit"
                whileHover={{ background: GOLD, color: DARK }}
                whileTap={{ scale: 0.97 }}
                style={{
                  background: "#0c0c0c",
                  border: "none", borderLeft: "1.5px solid #1a1a1a",
                  padding: "0 clamp(20px, 3vw, 40px)",
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: "clamp(8px, 0.8vw, 9px)",
                  letterSpacing: "0.22em", textTransform: "uppercase",
                  color: "#555", cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  whiteSpace: "nowrap",
                }}
              >Search</motion.button>
            </div>
          </form>

          {/* ── Dropdown ───────────────────────────────────────── */}
          <AnimatePresence>
            {showDrop && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "absolute", left: 0, right: 0, top: "100%",
                  background: "#060606",
                  border: `1.5px solid ${GOLD}33`,
                  borderTop: "none", zIndex: 50,
                  maxHeight: 440, overflowY: "auto",
                }}
              >
                {loading && (
                  <div style={{
                    padding: "16px 20px",
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: 8, letterSpacing: "0.2em", color: "#282828",
                    textTransform: "uppercase",
                  }}>Searching...</div>
                )}

                {!loading && results.map((hit, i) => (
                  <ResultRow key={hit.document?.id ?? i} hit={hit} index={i} />
                ))}

                {!loading && results.length > 0 && found !== null && found > results.length && (
                  <Link href={`/browse?q=${encodeURIComponent(query)}`} style={{ textDecoration: "none", display: "block" }}>
                    <div
                      style={{
                        padding: "12px 20px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        borderTop: "1px solid #111", cursor: "pointer", transition: "background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#0a0a0a"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{
                        fontFamily: "var(--font-stencil, monospace)",
                        fontSize: 8, letterSpacing: "0.18em",
                        color: "#3a3a3a", textTransform: "uppercase",
                      }}>
                        View all {found.toLocaleString()} results for &ldquo;{query}&rdquo;
                      </span>
                      <span style={{ color: GOLD, fontSize: 12 }}>→</span>
                    </div>
                  </Link>
                )}

                {!loading && results.length === 0 && (
                  <div style={{
                    padding: "20px", textAlign: "center",
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: 8, letterSpacing: "0.18em",
                    color: "#222", textTransform: "uppercase",
                  }}>No parts found</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Quick-search chips ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}
        >
          {["Knucklehead", "Panhead", "Shovelhead", "Sportster", "Twin Cam", "Milwaukee Eight"].map(term => (
            <button
              key={term}
              onClick={() => {
                setQuery(term);
                setFocused(true);
                doSearch(term);
                inputRef.current?.focus();
              }}
              style={{
                background: "none", border: "1px solid #161616",
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 7, letterSpacing: "0.16em",
                textTransform: "uppercase", color: "#282828",
                padding: "5px 12px", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD + "55"; e.currentTarget.style.color = GOLD; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#161616"; e.currentTarget.style.color = "#282828"; }}
            >{term}</button>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
