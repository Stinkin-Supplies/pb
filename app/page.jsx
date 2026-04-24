"use client";

/**
 * app/page.jsx  (NEW — replaces current landing)
 *
 * Animations used:
 * - Framer Motion: spring step transitions in fitment selector,
 *   staggered hero reveal, magnetic button effect
 * - GSAP: velocity ticker (scroll-based-velocity style)
 * - CSS: grain overlay, card hover accents, layered era cards
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "framer-motion";
import { gsap } from "gsap";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD       = "#b8922a";
const GOLD_DIM   = "#8a6a1a";
const GOLD_LIGHT = "#d4aa44";

const ENGINE_ERAS = [
  { key: "Knucklehead", years: "1936–1947", color: "#1a1510" },
  { key: "Panhead",     years: "1948–1965", color: "#151a10" },
  { key: "Shovelhead",  years: "1966–1984", color: "#1a1510" },
  { key: "Evolution",   years: "1984–1999", color: "#101518" },
  { key: "Twin Cam",    years: "1999–2017", color: "#101418" },
  { key: "FXR",         years: "1982–1994", color: "#151510" },
  { key: "Sportster",   years: "1957–2022", color: "#181210" },
  { key: "Dyna",        years: "1991–2017", color: "#121518" },
  { key: "Touring",     years: "1969–2026", color: "#181210" },
  { key: "Softail M8",  years: "2018–2026", color: "#101518" },
  { key: "Revolution Max", years: "2021–2026", color: "#181010" },
  { key: "Trike",       years: "2009–2026", color: "#121510" },
];

const CATEGORIES = [
  { name: "Engine",           icon: "⚙",  slug: "Engine" },
  { name: "Exhaust",          icon: "💨", slug: "Exhaust" },
  { name: "Brakes",           icon: "🛑", slug: "Brakes" },
  { name: "Wheels & Tires",   icon: "🛞", slug: "Tire & Wheel" },
  { name: "Electrical",       icon: "⚡", slug: "Electrical" },
  { name: "Suspension",       icon: "🔧", slug: "Suspension" },
  { name: "Controls",         icon: "🎛", slug: "Hand Controls" },
  { name: "Drivetrain",       icon: "⛓", slug: "Drive" },
  { name: "Gaskets & Seals",  icon: "🔩", slug: "Gaskets/Seals" },
  { name: "Fuel Systems",     icon: "⛽", slug: "Intake/Carb/Fuel System" },
  { name: "Frame & Body",     icon: "🏗", slug: "Body" },
  { name: "Oils & Chemicals", icon: "🛢", slug: "Oils & Chemicals" },
  { name: "Seats",            icon: "💺", slug: "Seat" },
  { name: "Luggage",          icon: "🎒", slug: "Luggage" },
  { name: "Windshields",      icon: "🌬", slug: "Windshield/Windscreen" },
];

const TICKER_ITEMS = [
  "88,301 Parts In Stock",
  "Knucklehead to M8",
  "Free Shipping Over $99",
  "V-Twin · WPS · Parts Unlimited",
  "Fitment Guaranteed",
  "Same Day Processing",
  "1936 to Present",
  "Dealer Pricing",
];

// ─── Magnetic Button ──────────────────────────────────────────────────────────

function MagneticButton({ children, className, onClick, ...props }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  function handleMove(e) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setPos({
      x: (e.clientX - cx) * 0.25,
      y: (e.clientY - cy) * 0.25,
    });
  }

  return (
    <motion.button
      ref={ref}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={() => setPos({ x: 0, y: 0 })}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={onClick}
      {...props}
    >
      {children}
    </motion.button>
  );
}

// ─── Velocity Ticker ──────────────────────────────────────────────────────────

function VelocityTicker() {
  const tickerRef = useRef(null);
  const { scrollY } = useScroll();
  const x = useTransform(scrollY, [0, 3000], [0, -800]);
  const smoothX = useSpring(x, { stiffness: 80, damping: 20 });

  const items = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div style={{
      background: GOLD,
      padding: "10px 0",
      overflow: "hidden",
      whiteSpace: "nowrap",
      borderTop: "1px solid #0a0a0a",
    }}>
      <motion.div style={{ x: smoothX, display: "inline-flex" }}>
        {items.map((item, i) => (
          <span key={i} style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: "12px",
            letterSpacing: "3px",
            color: "rgba(10,9,9,0.85)",
            padding: "0 32px",
          }}>
            {item}
            <span style={{ marginLeft: "32px", opacity: 0.4 }}>◆</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Fitment Selector ─────────────────────────────────────────────────────────

function FitmentSelector() {
  const [step, setStep] = useState(0); // 0=era, 1=model, 2=year
  const [families, setFamilies] = useState([]);
  const [models, setModels]   = useState([]);
  const [years, setYears]     = useState([]);
  const [counts, setCounts]   = useState({});

  const [selFamily, setSelFamily] = useState(null);
  const [selModel, setSelModel]   = useState(null);
  const [selYear, setSelYear]     = useState(null);

  useEffect(() => {
    fetch("/api/browse/fitment?type=families")
      .then(r => r.json()).then(d => setFamilies(d.families ?? []));
    fetch("/api/browse/fitment?type=counts")
      .then(r => r.json()).then(d => setCounts(d.counts ?? {}));
  }, []);

  useEffect(() => {
    if (!selFamily) return;
    setModels([]); setSelModel(null); setSelYear(null);
    fetch(`/api/browse/fitment?type=models&familyId=${selFamily.id}`)
      .then(r => r.json()).then(d => setModels(d.models ?? []));
  }, [selFamily]);

  useEffect(() => {
    if (!selModel) return;
    setYears([]); setSelYear(null);
    fetch(`/api/browse/fitment?type=years&modelId=${selModel.id}`)
      .then(r => r.json()).then(d => setYears(d.years ?? []));
  }, [selModel]);

  function handleFind() {
    if (!selFamily) return;
    const params = new URLSearchParams();
    params.set("family", selFamily.name);
    if (selModel)  params.set("model",  selModel.model_code);
    if (selYear)   params.set("year",   selYear);
    window.location.href = `/browse?${params.toString()}`;
  }

  const stepLabels = ["Engine / Era", "Model", "Year"];
  const stepValues = [
    selFamily?.name ?? null,
    selModel?.name  ?? null,
    selYear         ?? null,
  ];

  return (
    <div style={{
      background: "#141414",
      border: `1px solid #2a2828`,
      borderLeft: `3px solid ${GOLD}`,
      padding: "28px 32px",
      maxWidth: 580,
      position: "relative",
    }}>
      <div style={{
        fontFamily: "var(--font-stencil, monospace)",
        fontSize: "9px",
        letterSpacing: "3px",
        color: GOLD,
        marginBottom: "20px",
        textTransform: "uppercase",
      }}>
        Select Your Bike
      </div>

      {/* Step progress */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {stepLabels.map((label, i) => (
          <button
            key={i}
            onClick={() => i < step + 1 && setStep(i)}
            style={{
              flex: 1,
              background: step === i ? GOLD : i < step ? "#1e1e1e" : "#111",
              border: `1px solid ${step === i ? GOLD : i < step ? "#2a2a2a" : "#1a1a1a"}`,
              color: step === i ? "#0a0909" : i < step ? "#c4c0bc" : "#444",
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              padding: "6px 8px",
              cursor: i < step + 1 ? "pointer" : "default",
              textTransform: "uppercase",
              transition: "all 0.2s",
            }}
          >
            {stepValues[i] ?? label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div style={{
              fontSize: "11px",
              color: "#666",
              marginBottom: "12px",
              fontFamily: "var(--font-stencil, monospace)",
              letterSpacing: "1px",
            }}>
              Choose your engine family
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "6px",
              maxHeight: "220px",
              overflowY: "auto",
            }}>
              {families.map(fam => (
                <motion.button
                  key={fam.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setSelFamily(fam); setStep(1); }}
                  style={{
                    background: "#0f0f0f",
                    border: `1px solid #252525`,
                    color: "#c4c0bc",
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: "10px",
                    letterSpacing: "1px",
                    padding: "10px 8px",
                    cursor: "pointer",
                    textAlign: "left",
                    textTransform: "uppercase",
                    transition: "border-color 0.15s",
                    lineHeight: 1.3,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = GOLD}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#252525"}
                >
                  <div style={{ color: "#e0d8cc", fontSize: "11px", marginBottom: "2px" }}>
                    {fam.name}
                  </div>
                  <div style={{ color: "#6f6a62", fontSize: "9px", marginBottom: "2px" }}>
                    {fam.start_year && fam.end_year
                      ? `${fam.start_year}–${fam.end_year}`
                      : "All years"}
                  </div>
                  {counts[fam.name] && (
                    <div style={{ color: "#555", fontSize: "9px" }}>
                      {counts[fam.name].toLocaleString()} parts
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div style={{
              fontSize: "11px",
              color: "#666",
              marginBottom: "12px",
              fontFamily: "var(--font-stencil, monospace)",
              letterSpacing: "1px",
            }}>
              {selFamily?.name} — Select model
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "6px",
              maxHeight: "220px",
              overflowY: "auto",
            }}>
              {/* All models option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setSelModel(null); setStep(2); }}
                style={{
                  gridColumn: "1 / -1",
                  background: "#0f0f0f",
                  border: `1px solid ${GOLD}`,
                  color: GOLD_LIGHT,
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: "10px",
                  letterSpacing: "1px",
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                  textTransform: "uppercase",
                }}
              >
                All {selFamily?.name} Models →
              </motion.button>
              {models.map(mod => (
                <motion.button
                  key={mod.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setSelModel(mod); setStep(2); }}
                  style={{
                    background: "#0f0f0f",
                    border: "1px solid #252525",
                    color: "#c4c0bc",
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: "10px",
                    letterSpacing: "1px",
                    padding: "10px 8px",
                    cursor: "pointer",
                    textAlign: "left",
                    textTransform: "uppercase",
                    transition: "border-color 0.15s",
                    lineHeight: 1.3,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = GOLD}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#252525"}
                >
                  <div style={{ color: "#e0d8cc", fontSize: "10px", marginBottom: "2px" }}>
                    {mod.name}
                  </div>
                  <div style={{ color: "#555", fontSize: "9px" }}>
                    {mod.model_code}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div style={{
              fontSize: "11px",
              color: "#666",
              marginBottom: "12px",
              fontFamily: "var(--font-stencil, monospace)",
              letterSpacing: "1px",
            }}>
              {selFamily?.name}{selModel ? ` / ${selModel.name}` : ""} — Select year
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "4px",
              maxHeight: "160px",
              overflowY: "auto",
              marginBottom: "16px",
            }}>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setSelYear(null)}
                style={{
                  gridColumn: "1 / -1",
                  background: !selYear ? GOLD : "#0f0f0f",
                  border: `1px solid ${!selYear ? GOLD : "#252525"}`,
                  color: !selYear ? "#0a0909" : GOLD,
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: "9px",
                  letterSpacing: "1px",
                  padding: "8px",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                All Years
              </motion.button>
              {years.map(yr => (
                <motion.button
                  key={yr}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setSelYear(yr)}
                  style={{
                    background: selYear === yr ? GOLD : "#0f0f0f",
                    border: `1px solid ${selYear === yr ? GOLD : "#252525"}`,
                    color: selYear === yr ? "#0a0909" : "#888",
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: "10px",
                    padding: "7px 4px",
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {yr}
                </motion.button>
              ))}
            </div>
            <MagneticButton
              onClick={handleFind}
              style={{
                width: "100%",
                background: GOLD,
                border: "none",
                color: "#0a0909",
                fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                fontSize: "20px",
                letterSpacing: "3px",
                padding: "12px",
                cursor: "pointer",
              }}
            >
              Find My Parts →
            </MagneticButton>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Divider + raw search */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        margin: "20px 0 16px",
      }}>
        <div style={{ flex: 1, height: 1, background: "#252525" }} />
        <span style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "2px",
          color: "#444",
          textTransform: "uppercase",
        }}>or search by part / OEM number</span>
        <div style={{ flex: 1, height: 1, background: "#252525" }} />
      </div>
      <QuickSearchBar />
    </div>
  );
}

// ─── Quick Search Bar ─────────────────────────────────────────────────────────

function QuickSearchBar() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/browse/products?q=${encodeURIComponent(q)}&per_page=6`);
        const d = await r.json();
        setResults(d.products ?? []);
        setOpen(true);
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex" }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="e.g. rocker cover gasket, 17362-92, EBC FA84..."
          style={{
            flex: 1,
            background: "#0f0f0f",
            border: "1px solid #252525",
            borderRight: "none",
            color: "#e0d8cc",
            fontFamily: "var(--font-stencil, sans-serif)",
            fontSize: "12px",
            padding: "10px 14px",
            outline: "none",
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && q.length > 1) {
              window.location.href = `/browse?q=${encodeURIComponent(q)}`;
            }
          }}
        />
        <button
          onClick={() => q.length > 1 && (window.location.href = `/browse?q=${encodeURIComponent(q)}`)}
          style={{
            background: "#1a1a1a",
            border: "1px solid #252525",
            color: "#888",
            padding: "10px 16px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          {loading ? "…" : "⌕"}
        </button>
      </div>

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{
              position: "absolute",
              top: "100%",
              left: 0, right: 0,
              background: "#141414",
              border: "1px solid #252525",
              zIndex: 50,
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {results.map(p => (
              <Link
                key={p.id}
                href={`/browse/${p.slug}`}
                onClick={() => setOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderBottom: "1px solid #1a1a1a",
                  textDecoration: "none",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#1a1a1a"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", background: "#111" }} />
                ) : (
                  <div style={{ width: 36, height: 36, background: "#111", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-stencil, monospace)",
                    fontSize: "11px",
                    color: "#e0d8cc",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>
                    {p.brand} · {p.category}
                  </div>
                </div>
                <div style={{
                  fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
                  fontSize: "16px",
                  color: GOLD_LIGHT,
                  flexShrink: 0,
                }}>
                  {p.computed_price ? `$${Number(p.computed_price).toFixed(2)}` : "—"}
                </div>
              </Link>
            ))}
            <Link
              href={`/browse?q=${encodeURIComponent(q)}`}
              style={{
                display: "block",
                padding: "10px 14px",
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: "9px",
                letterSpacing: "2px",
                color: GOLD,
                textTransform: "uppercase",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              See all results for "{q}" →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Era Card (layered stack on hover) ───────────────────────────────────────

function EraCard({ era, count, index }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{ position: "relative", cursor: "pointer" }}
      onClick={() => window.location.href = `/browse?family=${encodeURIComponent(era.key)}`}
    >
      {/* Shadow layers for depth */}
      {[2, 1].map(i => (
        <motion.div
          key={i}
          animate={{
            x: hovered ? i * 5 : 0,
            y: hovered ? i * 5 : 0,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{
            position: "absolute",
            inset: 0,
            background: era.color,
            border: `1px solid #252525`,
            opacity: 0.5 - i * 0.15,
          }}
        />
      ))}

      {/* Main card */}
      <motion.div
        animate={{
          x: hovered ? -4 : 0,
          y: hovered ? -4 : 0,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        style={{
          position: "relative",
          background: era.color,
          border: `1px solid ${hovered ? GOLD : "#252525"}`,
          padding: "24px 20px",
          minHeight: 140,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          transition: "border-color 0.2s",
          zIndex: 1,
        }}
      >
        <motion.div
          animate={{ width: hovered ? "100%" : "0%" }}
          style={{
            position: "absolute",
            bottom: 0, left: 0,
            height: 2,
            background: GOLD,
          }}
          transition={{ duration: 0.3 }}
        />
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "2px",
          color: "#555",
          marginBottom: "4px",
          textTransform: "uppercase",
        }}>
          {era.years}
        </div>
        <div style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: "22px",
          letterSpacing: "1px",
          color: "#e0d8cc",
          lineHeight: 1,
        }}>
          {era.key}
        </div>
        {count != null && (
          <div style={{
            fontSize: "10px",
            color: "#444",
            marginTop: "6px",
            fontFamily: "var(--font-stencil, monospace)",
          }}>
            {count.toLocaleString()} parts
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Category Card (expandable) ───────────────────────────────────────────────

function CategoryCard({ cat, count }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => window.location.href = `/browse?category=${encodeURIComponent(cat.slug)}`}
      style={{
        background: "#111",
        border: "1px solid #1e1e1e",
        padding: "24px 20px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        transition: "border-color 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#2a2a2a"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#1e1e1e"}
    >
      <div style={{ fontSize: "24px" }}>{cat.icon}</div>
      <div style={{
        fontFamily: "var(--font-stencil, monospace)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "1px",
        color: "#e0d8cc",
        textTransform: "uppercase",
      }}>
        {cat.name}
      </div>
      {count != null && (
        <div style={{ fontSize: "11px", color: "#444", fontFamily: "var(--font-stencil, monospace)" }}>
          {count.toLocaleString()} parts
        </div>
      )}
      <motion.div
        initial={{ x: "-100%" }}
        whileHover={{ x: "0%" }}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: 1,
          background: GOLD,
          transformOrigin: "left",
        }}
      />
    </motion.div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function FloatingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handle);
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <motion.nav
      animate={{
        background: scrolled ? "rgba(10,9,9,0.96)" : "rgba(10,9,9,0.7)",
        borderBottomColor: scrolled ? "#1e1e1e" : "transparent",
      }}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 48px",
        height: 56,
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid transparent",
      }}
    >
      <div style={{
        fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
        fontSize: "22px",
        letterSpacing: "4px",
        color: "#e0d8cc",
      }}>
        STINKIN'<span style={{ color: GOLD }}>'</span> SUPPLIES
      </div>

      <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
        {["Browse", "Brands", "Deals"].map(label => (
          <Link
            key={label}
            href={`/${label.toLowerCase()}`}
            style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "10px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "#666",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#c4c0bc"}
            onMouseLeave={e => e.currentTarget.style.color = "#666"}
          >
            {label}
          </Link>
        ))}
        <Link
          href="/garage"
          style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: "10px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            background: GOLD,
            color: "#0a0909",
            padding: "8px 18px",
            textDecoration: "none",
            transition: "background 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = GOLD_LIGHT}
          onMouseLeave={e => e.currentTarget.style.background = GOLD}
        >
          ⚙ My Garage
        </Link>
      </div>
    </motion.nav>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [eraProducts, setEraProducts] = useState({});
  const [catStats, setCatStats] = useState({});

  useEffect(() => {
    fetch("/api/browse/fitment?type=counts")
      .then(r => r.json())
      .then(d => setEraProducts(d.counts ?? {}));
    fetch("/api/browse/products?per_page=0")
      .then(r => r.json())
      .then(d => {
        const map = {};
        (d.facets?.categories ?? []).forEach(c => { map[c.name] = c.count; });
        setCatStats(map);
      });
  }, []);

  const stagger = {
    container: { animate: { transition: { staggerChildren: 0.08 } } },
    item: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
    },
  };

  return (
    <div style={{ background: "#0a0909", color: "#e0d8cc", minHeight: "100vh" }}>
      <FloatingNav />
      <VelocityTicker />

      {/* ── HERO ── */}
      <section style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        padding: "56px 80px 0",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background grain (inherited from globals.css body::before) */}

        <motion.div
          variants={stagger.container}
          initial="initial"
          animate="animate"
          style={{ maxWidth: 620, position: "relative", zIndex: 2 }}
        >
          <motion.div
            variants={stagger.item}
            style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "10px",
              letterSpacing: "4px",
              color: GOLD,
              marginBottom: "16px",
              textTransform: "uppercase",
            }}
          >
            Parts for Every Era of American Iron
          </motion.div>

          <motion.h1
            variants={stagger.item}
            style={{
              fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
              fontSize: "clamp(64px, 9vw, 120px)",
              lineHeight: 0.9,
              letterSpacing: "2px",
              marginBottom: "20px",
              color: "#e0d8cc",
            }}
          >
            FIND YOUR<br />
            <span style={{ color: GOLD }}>EXACT</span><br />
            FIT.
          </motion.h1>

          <motion.p
            variants={stagger.item}
            style={{
              fontSize: "15px",
              fontWeight: 300,
              color: "#666",
              lineHeight: 1.6,
              maxWidth: 400,
              marginBottom: "40px",
              fontFamily: "var(--font-stencil, monospace)",
              textTransform: "none",
              letterSpacing: "0.5px",
            }}
          >
            From Knucklehead to M8 — every part matched to your specific year, model, and engine. No guessing.
          </motion.p>

          <motion.div variants={stagger.item}>
            <FitmentSelector />
          </motion.div>
        </motion.div>

        {/* Decorative right side — large era text */}
        <div style={{
          position: "absolute",
          right: -20,
          top: "50%",
          transform: "translateY(-50%)",
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: "clamp(120px, 18vw, 240px)",
          letterSpacing: "4px",
          color: "rgba(184,146,42,0.04)",
          userSelect: "none",
          pointerEvents: "none",
          lineHeight: 0.85,
          textAlign: "right",
        }}>
          HARLEY<br />DAVIDSON
        </div>
      </section>

      {/* ── STATS ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        borderTop: "1px solid #1a1a1a",
        borderBottom: "1px solid #1a1a1a",
      }}>
        {[
          { num: "88k",        label: "Parts in Catalog" },
          { num: "1936–2026",  label: "Model Years" },
          { num: "3",          label: "Wholesale Sources" },
          { num: "$99",        label: "Free Shipping" },
        ].map((s, i) => (
          <div key={i} style={{
            padding: "32px 48px",
            borderRight: i < 3 ? "1px solid #1a1a1a" : "none",
          }}>
            <div style={{
              fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
              fontSize: "48px",
              letterSpacing: "1px",
              color: "#e0d8cc",
              lineHeight: 1,
            }}>
              {s.num}
            </div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "9px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "#444",
              marginTop: "4px",
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── ENGINE ERA GRID ── */}
      <section style={{ padding: "80px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "40px",
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "9px",
              letterSpacing: "4px",
              color: GOLD,
              textTransform: "uppercase",
              marginBottom: "8px",
            }}>
              Fitment by Engine
            </div>
            <div style={{
              fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
              fontSize: "48px",
              letterSpacing: "2px",
              lineHeight: 1,
            }}>
              SHOP BY <span style={{ color: GOLD }}>ERA</span>
            </div>
          </div>
          <Link href="/browse" style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: "9px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: "#555",
            textDecoration: "none",
            borderBottom: "1px solid #2a2a2a",
            paddingBottom: "2px",
            transition: "color 0.2s",
          }}>
            View All →
          </Link>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "3px",
        }}>
          {ENGINE_ERAS.map((era, i) => (
            <EraCard
              key={era.key}
              era={era}
              count={eraProducts[era.key]}
              index={i}
            />
          ))}
        </div>
      </section>

      {/* ── CATEGORIES ── */}
      <section style={{
        padding: "80px",
        background: "#0e0e0e",
        borderBottom: "1px solid #1a1a1a",
      }}>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "4px",
          color: GOLD,
          textTransform: "uppercase",
          marginBottom: "8px",
        }}>
          Browse by Part Type
        </div>
        <div style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: "48px",
          letterSpacing: "2px",
          lineHeight: 1,
          marginBottom: "40px",
        }}>
          SHOP <span style={{ color: GOLD }}>CATEGORIES</span>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "12px",
        }}>
          {CATEGORIES.map(cat => (
            <CategoryCard
              key={cat.slug}
              cat={cat}
              count={catStats[cat.slug]}
            />
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: "60px 80px 40px",
        borderTop: "1px solid #1a1a1a",
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr",
        gap: "60px",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
            fontSize: "26px",
            letterSpacing: "4px",
            marginBottom: "12px",
          }}>
            STINKIN'<span style={{ color: GOLD }}>'</span> SUPPLIES
          </div>
          <p style={{
            fontSize: "12px",
            color: "#444",
            lineHeight: 1.6,
            maxWidth: 260,
            textTransform: "none",
            fontFamily: "var(--font-stencil, monospace)",
          }}>
            The parts catalog built for people who know what they're wrenching on.
            Every part matched to your exact bike.
          </p>
        </div>
        {[
          { title: "Shop", links: [["By Engine Era", "/browse"], ["By Category", "/browse"], ["Deals", "/deals"]] },
          { title: "Account", links: [["My Garage", "/garage"], ["Orders", "/account/orders"], ["Wishlist", "/account/wishlist"]] },
          { title: "Info", links: [["Shipping", "/"], ["Returns", "/"], ["Contact", "/"]] },
        ].map(col => (
          <div key={col.title}>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: "9px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "#555",
              marginBottom: "16px",
            }}>
              {col.title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {col.links.map(([label, href]) => (
                <Link key={label} href={href} style={{
                  fontSize: "12px",
                  color: "#444",
                  textDecoration: "none",
                  textTransform: "none",
                  fontFamily: "var(--font-stencil, monospace)",
                  transition: "color 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#888"}
                onMouseLeave={e => e.currentTarget.style.color = "#444"}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </footer>
      <div style={{
        padding: "16px 80px",
        borderTop: "1px solid #1a1a1a",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "1px",
          color: "#333",
          textTransform: "uppercase",
        }}>
          © 2026 Stinkin' Supplies. All rights reserved.
        </div>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: "9px",
          letterSpacing: "1px",
          color: "#333",
          textTransform: "uppercase",
        }}>
          Palm Coast, FL
        </div>
      </div>
    </div>
  );
}
