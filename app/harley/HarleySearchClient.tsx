"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { getProductImage, filterImageUrls } from "@/lib/getProductImage";
import {
  HARLEY_CATEGORIES,
  HARLEY_FAMILIES,
  YEAR_MIN,
  YEAR_MAX,
  type HarleyCategory,
  type HarleyFamily,
} from "@/lib/harley/config";
import { normalizeHarleyProductRow, type HarleyProduct } from "@/lib/harley/catalog";

type Step = "model" | "year" | "categories";

const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MAX - i);

// ─── LAYERED STACK ────────────────────────────────────────────────────────────
function LayeredStack({
  families,
  selected,
  onSelect,
  onExpandAll,
}: {
  families: HarleyFamily[];
  selected: HarleyFamily | null;
  onSelect: (f: HarleyFamily) => void;
  onExpandAll: () => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const VISIBLE = 5;
  const CARD_H = 76;
  const PEEK = 13;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4846", marginBottom: 12 }}>
        Model family
      </div>
      <div style={{ position: "relative", height: CARD_H + (VISIBLE - 1) * PEEK + 8, marginBottom: 12 }}>
        {families.slice(0, VISIBLE).map((family, i) => {
          const isTop = i === 0;
          const isHov = hovered === i;
          const isSelected = selected?.name === family.name;
          const zIndex = VISIBLE - i;
          const baseY = i * PEEK;

          return (
            <motion.button
              key={family.name}
              onHoverStart={() => setHovered(i)}
              onHoverEnd={() => setHovered(null)}
              onClick={isTop ? onExpandAll : () => onSelect(family)}
              animate={{
                y: isHov && !isTop ? baseY - 6 : baseY,
                scale: isTop ? 1 : 1 - i * 0.015,
                opacity: 1 - i * 0.12,
              }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                height: CARD_H,
                zIndex,
                background: isSelected
                  ? "linear-gradient(90deg, rgba(232,98,26,0.2), rgba(232,98,26,0.07))"
                  : isTop
                    ? "linear-gradient(90deg, rgba(32,30,28,0.99), rgba(24,22,21,0.97))"
                    : "linear-gradient(90deg, rgba(22,21,19,0.97), rgba(18,17,16,0.95))",
                border: `1px solid ${isSelected ? "rgba(232,98,26,0.8)" : isTop ? "rgba(58,55,52,0.9)" : "rgba(42,40,38,0.7)"}`,
                borderRadius: 2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 20px",
                gap: 14,
                textAlign: "left",
                boxShadow: isTop
                  ? "0 6px 28px rgba(0,0,0,0.5)"
                  : `0 ${2 + i * 2}px ${6 + i * 4}px rgba(0,0,0,${0.22 + i * 0.07})`,
              }}
            >
              {isTop && !selected && (
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg, transparent, rgba(232,98,26,0.8), transparent)", borderRadius: "2px 0 0 2px" }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-caesar, serif)",
                  fontSize: 28,
                  lineHeight: 1,
                  letterSpacing: "0.05em",
                  color: isSelected ? "#e8621a" : isTop ? "#f0ebe3" : "#c4c0bc",
                  marginBottom: 5,
                }}>
                  {isTop && !selected ? "All Models" : family.display_name}
                </div>
                <div style={{
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#5a5856",
                }}>
                  {isTop && !selected ? `${families.length} model families` : family.subtitle}
                </div>
              </div>
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 8,
                color: isTop ? "#6a6866" : "#3a3836",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                {isTop && !selected ? "tap to browse ↓" : family.year_range}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─── MODEL GRID ───────────────────────────────────────────────────────────────
function ModelGrid({
  families,
  selected,
  onSelect,
}: {
  families: HarleyFamily[];
  selected: HarleyFamily | null;
  onSelect: (f: HarleyFamily) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
        gap: 8,
      }}
    >
      {families.map((family, i) => {
        const isSelected = selected?.name === family.name;
        return (
          <motion.button
            key={family.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, delay: i * 0.02 }}
            onClick={() => onSelect(family)}
            whileHover={{ y: -2, borderColor: "rgba(232,98,26,0.45)" }}
            style={{
              background: isSelected ? "rgba(232,98,26,0.12)" : "rgba(16,15,14,0.95)",
              border: `1px solid ${isSelected ? "rgba(232,98,26,0.7)" : "rgba(38,36,34,0.8)"}`,
              borderRadius: 2,
              padding: "16px 14px",
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
            }}
          >
            {isSelected && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#e8621a" }} />}
            <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 22, lineHeight: 1, letterSpacing: "0.04em", color: isSelected ? "#e8621a" : "#f0ebe3", marginBottom: 5 }}>
              {family.display_name}
            </div>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5856", marginBottom: 3 }}>
              {family.subtitle}
            </div>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#3a3836", letterSpacing: "0.08em" }}>
              {family.year_range}
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ─── YEAR PANEL ───────────────────────────────────────────────────────────────
function YearPanel({
  family,
  selectedYear,
  onYearChange,
  onConfirm,
  loading,
}: {
  family: HarleyFamily;
  selectedYear: number;
  onYearChange: (y: number) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const range = family.year_range.split("–");
  const minY = parseInt(range[0]);
  const maxY = parseInt(range[1]) || YEAR_MAX;
  const years = YEARS.filter(y => y >= minY && y <= maxY);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
    >
      <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4846", marginBottom: 12 }}>
        Year — {family.display_name}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))",
        gap: 6,
        maxHeight: 280,
        overflowY: "auto",
        marginBottom: 16,
        paddingRight: 4,
      }}>
        {years.map(year => (
          <motion.button
            key={year}
            onClick={() => onYearChange(year)}
            whileTap={{ scale: 0.95 }}
            style={{
              background: selectedYear === year ? "#e8621a" : "rgba(16,15,14,0.95)",
              border: `1px solid ${selectedYear === year ? "#e8621a" : "rgba(38,36,34,0.8)"}`,
              borderRadius: 2,
              color: selectedYear === year ? "#0a0908" : "#a09b92",
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 11,
              letterSpacing: "0.08em",
              padding: "10px 6px",
              cursor: "pointer",
              fontWeight: selectedYear === year ? 700 : 400,
            }}
          >
            {year}
          </motion.button>
        ))}
      </div>
      <motion.button
        onClick={onConfirm}
        disabled={loading}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        style={{
          width: "100%",
          background: "#e8621a",
          color: "#0a0908",
          border: "1px solid #e8621a",
          borderRadius: 2,
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          padding: "14px 20px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Loading…" : `Find ${selectedYear} ${family.display_name} Parts →`}
      </motion.button>
    </motion.div>
  );
}

// ─── CATEGORY TILE ────────────────────────────────────────────────────────────
function CategoryTile({ category, count, active, onClick }: {
  category: HarleyCategory; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3, borderColor: "rgba(232,98,26,0.5)" }}
      whileTap={{ scale: 0.97 }}
      style={{
        background: active ? "rgba(232,98,26,0.12)" : "rgba(12,11,10,0.95)",
        border: `1px solid ${active ? "rgba(232,98,26,0.65)" : "rgba(36,34,32,0.8)"}`,
        borderRadius: 4,
        padding: "16px 10px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        minWidth: 90,
        position: "relative",
      }}
    >
      {active && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#e8621a", borderRadius: "4px 4px 0 0" }} />}
      <span style={{ fontSize: 22, lineHeight: 1 }}>{category.icon}</span>
      <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: active ? "#f0ebe3" : "#7a7876", textAlign: "center", lineHeight: 1.35 }}>
        {category.label}
      </div>
      {count > 0 && (
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, color: active ? "#e8621a" : "#3a3836", letterSpacing: "0.08em" }}>
          {count}
        </div>
      )}
    </motion.button>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({ product, onOpen, index }: { product: HarleyProduct; onOpen: (p: HarleyProduct) => void; index: number }) {
  const imageSrc = getProductImage({ image: product.image_url ?? null, images: filterImageUrls(product.image_urls ?? []), brand: product.brand });
  return (
    <motion.div
      layout
      layoutId={`product-${product.id}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.16, delay: index * 0.03 }}
      onClick={() => onOpen(product)}
      whileHover={{ y: -3, borderColor: "rgba(232,98,26,0.4)" }}
      style={{ background: "rgba(10,9,8,0.97)", border: "1px solid rgba(36,34,32,0.8)", borderRadius: 2, cursor: "pointer", overflow: "hidden" }}
    >
      <motion.div layoutId={`img-${product.id}`} style={{ position: "relative", aspectRatio: "1/1", background: "#fff" }}>
        <Image src={imageSrc} alt={product.name} fill sizes="(max-width: 768px) 50vw, 18vw" style={{ objectFit: "contain", padding: 10 }} unoptimized />
      </motion.div>
      <div style={{ padding: "10px 12px 14px" }}>
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a5856", marginBottom: 4 }}>{product.brand}</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#f0ebe3", lineHeight: 1.3, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{product.name}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 20, letterSpacing: "0.03em", color: "#f0ebe3" }}>${Number(product.price || 0).toFixed(2)}</div>
          <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase", color: product.in_stock ? "#22c55e" : "#5a5856" }}>{product.in_stock ? "In Stock" : "Order"}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── PRODUCT MODAL ────────────────────────────────────────────────────────────
function ProductModal({ product, onClose }: { product: HarleyProduct | null; onClose: () => void }) {
  const imageSrc = product ? getProductImage({ image: product.image_url ?? null, images: filterImageUrls(product.image_urls ?? []), brand: product.brand }) : null;
  return (
    <AnimatePresence>
      {product && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.84)", backdropFilter: "blur(14px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <motion.div initial={{ scale: 0.96, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.96, y: 20, opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            style={{ width: "min(1040px, 100%)", maxHeight: "min(90svh, 900px)", overflow: "auto", border: "1px solid rgba(52,50,48,0.9)", background: "radial-gradient(circle at 0% 0%, rgba(232,98,26,0.13), transparent 28%), #0e0d0c", display: "grid", gridTemplateColumns: "minmax(260px, 0.9fr) minmax(0, 1.1fr)" }}>
            <motion.div layoutId={`img-${product.id}`} style={{ position: "relative", minHeight: 300, background: "#fff" }}>
              {imageSrc && <Image src={imageSrc} alt={product.name} fill sizes="45vw" style={{ objectFit: "contain", padding: 20 }} unoptimized />}
            </motion.div>
            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
              <button onClick={onClose} style={{ alignSelf: "flex-start", border: "1px solid rgba(52,50,48,0.8)", background: "transparent", color: "#8a8784", fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", padding: "10px 12px", cursor: "pointer", borderRadius: 2 }}>← Close</button>
              <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b6460" }}>{product.brand} · {product.category}</div>
              <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(26px, 4vw, 48px)", lineHeight: 0.98, letterSpacing: "0.04em", color: "#f0ebe3" }}>{product.name}</div>
              <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 34, color: "#e8621a" }}>${Number(product.price || 0).toFixed(2)}</div>
              {product.description && <div style={{ color: "#a09b92", lineHeight: 1.7, fontSize: 14 }}>{product.description}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.7)", padding: "6px 10px", borderRadius: 999, color: product.in_stock ? "#22c55e" : "#6b6460" }}>{product.in_stock ? "In Stock" : "Out of Stock"}</span>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.7)", padding: "6px 10px", borderRadius: 999, color: "#8a8784" }}>SKU {product.sku}</span>
                {product.fitment_year_start && (
                  <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.7)", padding: "6px 10px", borderRadius: 999, color: "#8a8784" }}>{product.fitment_year_start}{product.fitment_year_end && product.fitment_year_end !== product.fitment_year_start ? `–${product.fitment_year_end}` : ""}</span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                <Link href={`/shop/${product.slug}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", background: "#e8621a", color: "#0a0908", border: "1px solid #e8621a", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 18px" }}>Open Full Page</Link>
                <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", background: "transparent", color: "#a09b92", border: "1px solid rgba(52,50,48,0.8)", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 18px", cursor: "pointer" }}>Keep Browsing</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function HarleySearchClient() {
  const [step, setStep] = useState<Step>("model");
  const [allOpen, setAllOpen] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<HarleyFamily | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(YEAR_MAX);
  const [activeCatSlug, setActiveCatSlug] = useState<string | null>(null);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, HarleyProduct[]>>({});
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<HarleyProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeCategory = useMemo(() => activeCatSlug ? HARLEY_CATEGORIES.find(c => c.slug === activeCatSlug) ?? null : null, [activeCatSlug]);
  const activeProducts = useMemo(() => activeCatSlug ? (productsByCategory[activeCatSlug] ?? []) : [], [activeCatSlug, productsByCategory]);
  const totalProducts = useMemo(() => Object.values(catCounts).reduce((a, b) => a + b, 0), [catCounts]);

  const loadProducts = useCallback(async (family: HarleyFamily, year: number) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        HARLEY_CATEGORIES.map(async cat => {
          const params = new URLSearchParams({ family: family.name, year: String(year), category: cat.label, limit: "24" });
          const res = await fetch(`/api/harley2/products?${params}`);
          const data = await res.json();
          const rows: HarleyProduct[] = (Array.isArray(data) ? data : data.products ?? []).map(normalizeHarleyProductRow);
          return [cat.slug, rows] as const;
        })
      );
      const byCategory = Object.fromEntries(results);
      const counts: Record<string, number> = {};
      for (const [slug, rows] of results) counts[slug] = rows.length;
      setProductsByCategory(byCategory);
      setCatCounts(counts);
      const first = HARLEY_CATEGORIES.find(c => (counts[c.slug] ?? 0) > 0);
      setActiveCatSlug(first?.slug ?? HARLEY_CATEGORIES[0].slug);
      setStep("categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectFamily = (family: HarleyFamily) => {
    startTransition(() => {
      setSelectedFamily(family);
      setStep("year");
      setAllOpen(false);
    });
  };

  const reset = () => {
    startTransition(() => {
      setStep("model");
      setSelectedFamily(null);
      setProductsByCategory({});
      setCatCounts({});
      setActiveCatSlug(null);
      setError(null);
      setAllOpen(false);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080706", color: "#f0ebe3" }}>
      <NavBar activePage="shop" cartCount={0} onCartClick={() => {}} />

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 80px" }}>

        {/* ── FULL-WIDTH HERO ── */}
        <div style={{ paddingTop: 32, paddingBottom: 24, borderBottom: "1px solid rgba(36,34,32,0.6)", marginBottom: 32 }}>

          {/* Big title — full width */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.28em", color: "#e8621a", textTransform: "uppercase", marginBottom: 10 }}>
              Harley-Davidson Parts
            </div>
            <h1 style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(52px, 8vw, 110px)", lineHeight: 0.9, letterSpacing: "0.04em", margin: 0, maxWidth: "100%" }}>
              {step === "model" && <>Find parts for your <span style={{ color: "#e8621a" }}>Harley</span></>}
              {step === "year" && <>{selectedFamily?.display_name} — <span style={{ color: "#e8621a" }}>what year?</span></>}
              {step === "categories" && <>{selectedYear} <span style={{ color: "#e8621a" }}>{selectedFamily?.display_name}</span></>}
            </h1>
          </div>

          {/* Status strip */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {step !== "model" && (
              <button onClick={reset} style={{ background: "transparent", color: "#6b6460", border: "1px solid rgba(36,34,32,0.7)", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 12px", cursor: "pointer" }}>
                ← Change Model
              </button>
            )}
            {totalProducts > 0 && (
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b6460" }}>
                {totalProducts.toLocaleString()} parts found
              </span>
            )}
            {loading && <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "#e8621a" }}>Loading…</span>}
            {error && <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#ef4444" }}>{error}</span>}
          </div>
        </div>

        {/* ── TWO-COLUMN SELECTOR ── */}
        <AnimatePresence mode="wait">
          {(step === "model" || step === "year") && (
            <motion.div
              key="selector"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
                marginBottom: 32,
              }}
            >
              {/* LEFT: Year picker (shows when family selected) or instructions */}
              <div style={{ borderRight: "1px solid rgba(36,34,32,0.5)", paddingRight: 28 }}>
                <AnimatePresence mode="wait">
                  {step === "year" && selectedFamily ? (
                    <YearPanel
                      key="year"
                      family={selectedFamily}
                      selectedYear={selectedYear}
                      onYearChange={setSelectedYear}
                      onConfirm={() => loadProducts(selectedFamily, selectedYear)}
                      loading={loading}
                    />
                  ) : (
                    <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4846", marginBottom: 12 }}>
                        Year
                      </div>
                      <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 36, color: "#2a2826", letterSpacing: "0.04em", lineHeight: 1 }}>
                        Select a model →
                      </div>
                      <div style={{ marginTop: 12, fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#3a3836" }}>
                        then pick your year
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* RIGHT: Layered stack → expands to full grid */}
              <div style={{ paddingLeft: 28 }}>
                <AnimatePresence mode="wait">
                  {allOpen ? (
                    <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4846" }}>All model families</div>
                        <button onClick={() => setAllOpen(false)} style={{ background: "transparent", border: "none", color: "#4a4846", fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>↑ Collapse</button>
                      </div>
                      <ModelGrid families={HARLEY_FAMILIES} selected={selectedFamily} onSelect={handleSelectFamily} />
                    </motion.div>
                  ) : (
                    <motion.div key="stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <LayeredStack
                        families={HARLEY_FAMILIES}
                        selected={selectedFamily}
                        onSelect={handleSelectFamily}
                        onExpandAll={() => setAllOpen(true)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CATEGORIES + RESULTS ── */}
        <AnimatePresence>
          {step === "categories" && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}>

              {/* Breadcrumb */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {[selectedYear.toString(), selectedFamily?.display_name, activeCategory?.label].filter(Boolean).map((label, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {i > 0 && <span style={{ color: "#2a2826" }}>›</span>}
                    <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: i === 2 ? "#e8621a" : "#6b6460" }}>{label}</span>
                  </span>
                ))}
              </div>

              {/* Category tiles — horizontal scroll */}
              <div style={{ overflowX: "auto", paddingBottom: 10, marginBottom: 28 }}>
                <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
                  {HARLEY_CATEGORIES.map(cat => (
                    <CategoryTile key={cat.slug} category={cat} count={catCounts[cat.slug] ?? 0} active={activeCatSlug === cat.slug} onClick={() => setActiveCatSlug(cat.slug)} />
                  ))}
                </div>
              </div>

              {/* Active category products */}
              <AnimatePresence mode="wait">
                {activeCategory && (
                  <motion.div key={activeCatSlug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5a5856", marginBottom: 4 }}>
                          {catCounts[activeCatSlug!] ?? 0} results
                        </div>
                        <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(24px, 3.5vw, 42px)", letterSpacing: "0.04em", lineHeight: 1 }}>
                          {activeCategory.label}
                        </div>
                      </div>
                      <div style={{ color: "#5a5856", fontSize: 13, maxWidth: "40ch", textAlign: "right" }}>
                        {activeCategory.description}
                      </div>
                    </div>

                    {activeProducts.length > 0 ? (
                      <LayoutGroup>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(172px, 1fr))", gap: 10 }}>
                          {activeProducts.map((product, i) => (
                            <ProductCard key={product.id} product={product} onOpen={setSelectedProduct} index={i} />
                          ))}
                        </div>
                      </LayoutGroup>
                    ) : (
                      <div style={{ padding: "32px 0", fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3a3836" }}>
                        No parts found in this category for {selectedYear} {selectedFamily?.display_name}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* More for your bike */}
              {activeProducts.length > 0 && (
                <div style={{ marginTop: 52, borderTop: "1px solid rgba(32,30,28,0.6)", paddingTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#3a3836", marginBottom: 14 }}>
                    More for your {selectedFamily?.display_name}
                  </div>
                  <div style={{ overflowX: "auto", paddingBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
                      {HARLEY_CATEGORIES.filter(c => c.slug !== activeCatSlug && (catCounts[c.slug] ?? 0) > 0).map(cat => (
                        <CategoryTile key={cat.slug} category={cat} count={catCounts[cat.slug] ?? 0} active={false} onClick={() => { setActiveCatSlug(cat.slug); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
