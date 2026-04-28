"use client";
// ============================================================
// app/page.jsx — Stinkin' Supplies Homepage
// ============================================================
// Structure:
//   1. Floating minimal header
//   2. Era cards — scroll-driven stacked reveal
//   3. Shop By Part — category grid with hover image reveal
//   4. Corner nav — fixed bottom-right
// ============================================================

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ERAS } from "@/lib/eras/config";
import { HARLEY_CATEGORIES } from "@/lib/harley/config";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL   = "#0d9488";
const DARK   = "#080808";
const LIGHT  = "#e8e2d8";
const MUTED  = "#3a3a3a";

// Category icons — override the emoji with SVG-style labels
const CAT_ICONS = {
  "engine":         "⚙",
  "controls":       "✦",
  "seats":          "▬",
  "exhaust":        "≋",
  "wheels-tires":   "○",
  "electrical":     "⚡",
  "suspension":     "⟨⟩",
  "brakes":         "◉",
  "frame-body":     "▣",
  "fuel-systems":   "◈",
  "drivetrain":     "⬡",
  "gaskets-seals":  "◎",
  "luggage":        "▤",
  "windshields":    "◻",
  "oils-chemicals": "◬",
};

// ─── Noise texture overlay ────────────────────────────────────────────────────

const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ─── Floating Header ──────────────────────────────────────────────────────────

function FloatingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      animate={{
        background: scrolled ? "rgba(8,8,8,0.96)" : TEAL,
        borderBottomColor: scrolled ? "#1a1a1a" : "transparent",
      }}
      transition={{ duration: 0.3 }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 90,
        height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 20px",
        borderBottom: "1px solid transparent",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Logo */}
      <Link href="/" style={{ textDecoration: "none" }}>
        <motion.div
          animate={{ color: scrolled ? LIGHT : DARK }}
          style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: 22, letterSpacing: "0.06em", lineHeight: 1,
          }}
        >
          STINKIN'<span style={{ color: scrolled ? TEAL : "#00000055" }}>'</span> SUPPLIES
        </motion.div>
      </Link>

      {/* Right — search + garage */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/search" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, textDecoration: "none",
          border: `1px solid ${scrolled ? "#222" : "#00000033"}`,
          color: scrolled ? "#888" : DARK,
          transition: "all 0.2s",
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </Link>
        <Link href="/garage" style={{
          fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
          fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase",
          textDecoration: "none", padding: "8px 14px",
          border: `1px solid ${scrolled ? "#222" : "#00000033"}`,
          color: scrolled ? "#888" : DARK,
          transition: "all 0.2s",
        }}>My Garage</Link>
      </div>
    </motion.header>
  );
}

// ─── Era Card ─────────────────────────────────────────────────────────────────

function EraCard({ era, index }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imageX = useTransform(
    scrollYProgress,
    [0, 1],
    index % 2 === 0 ? ["8%", "-8%"] : ["-8%", "8%"]
  );
  const textY = useTransform(scrollYProgress, [0, 1], ["12px", "-12px"]);

  const imageRight = index % 2 === 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "relative" }}
    >
      <Link href={`/era/${era.slug}`} style={{ textDecoration: "none", display: "block" }}>
        <motion.div
          whileHover="hover"
          style={{
            position: "relative",
            background: "#0c0c0c",
            border: "1px solid #181818",
            overflow: "hidden",
            cursor: "pointer",
            minHeight: 220,
            display: "flex",
            alignItems: "stretch",
          }}
        >
          {/* Accent bar */}
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: 3, background: era.accent,
            zIndex: 2,
          }} />

          {/* Noise overlay */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: NOISE, backgroundSize: "128px 128px",
            opacity: 0.025, pointerEvents: "none", zIndex: 1,
          }} />

          {/* Hover glow */}
          <motion.div
            variants={{ hover: { opacity: 1 }, initial: { opacity: 0 } }}
            initial="initial"
            style={{
              position: "absolute", inset: 0,
              background: `radial-gradient(ellipse at ${imageRight ? "80%" : "20%"} 50%, ${era.accent}0a 0%, transparent 70%)`,
              pointerEvents: "none", zIndex: 1,
              transition: "opacity 0.4s",
            }}
          />

          {/* Content row */}
          <div style={{
            display: "flex",
            flexDirection: imageRight ? "row" : "row-reverse",
            width: "100%", zIndex: 2,
          }}>
            {/* Text side */}
            <motion.div
              style={{
                flex: 1, padding: "36px 32px 36px 36px",
                display: "flex", flexDirection: "column",
                justifyContent: "center", y: textY,
              }}
            >
              <div style={{
                fontFamily: "var(--font-stencil, 'Share Tech Mono', monospace)",
                fontSize: 9, letterSpacing: "0.22em",
                color: era.accent, textTransform: "uppercase",
                marginBottom: 10,
              }}>{era.year_range}</div>

              <div style={{
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: "clamp(38px, 6vw, 72px)",
                letterSpacing: "0.03em", lineHeight: 0.9,
                color: LIGHT, marginBottom: 14,
              }}>{era.display_name}</div>

              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 11, color: "#555", lineHeight: 1.6,
                maxWidth: 340, marginBottom: 20,
              }}>{era.description}</div>

              <motion.div
                variants={{
                  hover: { x: 6, color: era.accent },
                  initial: { x: 0, color: "#444" },
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase",
                  transition: "color 0.2s",
                }}
              >
                <span>Shop {era.display_name}</span>
                <span style={{ fontSize: 12 }}>→</span>
              </motion.div>
            </motion.div>

            {/* Image side */}
            <div style={{
              width: "38%", minWidth: 160,
              position: "relative", overflow: "hidden",
              background: "#060606",
            }}>
              <motion.div
                style={{
                  position: "absolute", inset: "-10%",
                  backgroundImage: `linear-gradient(135deg, ${era.accent}15 0%, transparent 60%)`,
                  x: imageX,
                }}
              />
              {/* Era number watermark */}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: "clamp(80px, 14vw, 160px)",
                letterSpacing: "-0.04em", lineHeight: 1,
                color: `${era.accent}12`,
                userSelect: "none",
              }}>{String(index + 1).padStart(2, "0")}</div>
              {/* Image slot — swap src for real photography */}
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 8, letterSpacing: "0.18em",
                  color: "#1e1e1e", textTransform: "uppercase",
                }}>[ Photo ]</div>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({ cat, index }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: index * 0.04, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/browse?category=${encodeURIComponent(cat.dbCategories[0])}`}
        style={{ textDecoration: "none", display: "block" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <motion.div
          animate={{
            borderColor: hovered ? TEAL : "#1a1a1a",
            background: hovered ? "#0d0d0d" : "#0a0a0a",
          }}
          transition={{ duration: 0.2 }}
          style={{
            border: "1px solid #1a1a1a",
            padding: "20px 18px",
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
          }}
        >
          {/* Hover fill */}
          <motion.div
            animate={{ scaleX: hovered ? 1 : 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              height: 2, background: TEAL,
              transformOrigin: "left",
            }}
          />

          {/* Icon */}
          <div style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: 28, lineHeight: 1, marginBottom: 10,
            color: hovered ? TEAL : "#2a2a2a",
            transition: "color 0.2s",
          }}>{CAT_ICONS[cat.slug] ?? "◆"}</div>

          {/* Label */}
          <div style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: 18, letterSpacing: "0.04em", lineHeight: 1,
            color: hovered ? LIGHT : "#888",
            transition: "color 0.2s", marginBottom: 6,
          }}>{cat.label}</div>

          {/* Description */}
          <div style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: 9, letterSpacing: "0.08em",
            color: hovered ? "#666" : "#2a2a2a",
            lineHeight: 1.5, textTransform: "uppercase",
            transition: "color 0.2s",
          }}>{cat.description}</div>

          {/* Arrow */}
          <motion.div
            animate={{ x: hovered ? 4 : 0, opacity: hovered ? 1 : 0 }}
            style={{
              position: "absolute", top: 18, right: 16,
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 10, color: TEAL,
            }}
          >→</motion.div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ─── Corner Nav ───────────────────────────────────────────────────────────────

function CornerNav() {
  const [open, setOpen] = useState(false);

  const items = [
    { label: "My Garage",   href: "/garage",  icon: "⬡" },
    { label: "Browse All",  href: "/browse",  icon: "▤" },
    { label: "Search",      href: "/search",  icon: "◎" },
    { label: "All Eras",    href: "#eras",    icon: "◈" },
  ];

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 20, zIndex: 80,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8,
    }}>
      <AnimatePresence>
        {open && items.map((item, i) => (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            transition={{ delay: i * 0.05, type: "spring", stiffness: 400, damping: 28 }}
          >
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                textDecoration: "none",
                background: "rgba(8,8,8,0.95)",
                border: "1px solid #222",
                padding: "9px 14px",
                backdropFilter: "blur(12px)",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = TEAL}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#222"}
            >
              <span style={{ fontSize: 12, color: TEAL }}>{item.icon}</span>
              <span style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9, letterSpacing: "0.18em",
                textTransform: "uppercase", color: "#888",
                whiteSpace: "nowrap",
              }}>{item.label}</span>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        animate={{ rotate: open ? 45 : 0, background: open ? TEAL : "#0e0e0e" }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        style={{
          width: 44, height: 44,
          border: `1px solid ${open ? TEAL : "#2a2a2a"}`,
          cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(12px)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M7 2v10" stroke={open ? DARK : "#888"} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </motion.button>
    </div>
  );
}

// ─── Homepage ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div style={{ background: DARK, color: LIGHT, minHeight: "100vh" }}>
      <FloatingHeader />

      {/* Hero — era cards */}
      <section id="eras" style={{ paddingTop: 52 }}>
        {/* Section label */}
        <div style={{
          padding: "40px 20px 24px",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: 11, letterSpacing: "0.3em",
            color: "#333", textTransform: "uppercase",
          }}>Shop by Era</div>
          <div style={{ flex: 1, height: 1, background: "#161616" }} />
        </div>

        {/* Era cards stack */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 20px" }}>
          {ERAS.map((era, i) => (
            <EraCard key={era.slug} era={era} index={i} />
          ))}
        </div>
      </section>

      {/* Shop by Part */}
      <section style={{ padding: "64px 20px 80px" }}>
        {/* Section header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16, marginBottom: 32,
        }}>
          <div style={{ flex: 1, height: 1, background: "#161616" }} />
          <div style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: 11, letterSpacing: "0.3em",
            color: "#333", textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>Shop by Part</div>
          <div style={{ flex: 1, height: 1, background: "#161616" }} />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: "clamp(36px, 8vw, 72px)",
            letterSpacing: "0.03em", lineHeight: 0.9,
            color: LIGHT, marginBottom: 12,
            textAlign: "center",
          }}
        >All Makes.<br />All Eras.</motion.div>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: 11, color: "#444", textAlign: "center",
          letterSpacing: "0.1em", textTransform: "uppercase",
          marginBottom: 40,
        }}>Every category. Filter by era from any page.</div>

        {/* Category grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 2,
        }}>
          {HARLEY_CATEGORIES.map((cat, i) => (
            <CategoryCard key={cat.slug} cat={cat} index={i} />
          ))}
        </div>

        {/* Browse all CTA */}
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <Link href="/browse" style={{ textDecoration: "none" }}>
            <motion.div
              whileHover={{ background: TEAL, color: DARK, borderColor: TEAL }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                border: "1px solid #2a2a2a", padding: "12px 32px",
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase",
                color: "#666", cursor: "pointer", transition: "all 0.2s",
              }}
            >
              Browse All Parts
              <span>→</span>
            </motion.div>
          </Link>
        </div>
      </section>

      {/* Footer strip */}
      <div style={{
        borderTop: "1px solid #141414",
        padding: "20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
      }}>
        <div style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: 14, letterSpacing: "0.06em", color: "#333",
        }}>STINKIN' SUPPLIES</div>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: 8, letterSpacing: "0.18em", color: "#2a2a2a",
          textTransform: "uppercase",
        }}>88,000+ Parts · WPS · Parts Unlimited · VTwin</div>
      </div>

      <CornerNav />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        @media (max-width: 640px) {
          .era-image-side { display: none !important; }
        }
      `}</style>
    </div>
  );
}