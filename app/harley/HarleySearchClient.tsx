"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
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
}: {
  families: HarleyFamily[];
  selected: HarleyFamily | null;
  onSelect: (f: HarleyFamily) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const VISIBLE = 5;
  const CARD_H = 72;
  const PEEK = 14;

  return (
    <div style={{ position: "relative", width: "100%", height: CARD_H + (VISIBLE - 1) * PEEK + 8 }}>
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
            onClick={() => onSelect(family)}
            animate={{
              y: isHov && !isTop ? baseY - 6 : baseY,
              scale: isTop ? 1 : 1 - i * 0.015,
              opacity: 1 - i * 0.12,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: CARD_H,
              zIndex,
              background: isSelected
                ? "linear-gradient(90deg, rgba(232,98,26,0.18), rgba(232,98,26,0.06))"
                : "linear-gradient(90deg, rgba(28,26,25,0.98), rgba(22,21,20,0.95))",
              border: `1px solid ${isSelected ? "rgba(232,98,26,0.75)" : "rgba(52,50,48,0.8)"}`,
              borderRadius: 2,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 18px",
              gap: 14,
              boxShadow: isTop
                ? "0 4px 24px rgba(0,0,0,0.4)"
                : `0 ${2 + i}px ${8 + i * 4}px rgba(0,0,0,${0.2 + i * 0.06})`,
              textAlign: "left",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--font-caesar, serif)",
                fontSize: 26,
                lineHeight: 1,
                letterSpacing: "0.05em",
                color: isSelected ? "#e8621a" : "#f0ebe3",
                marginBottom: 4,
              }}>
                {family.display_name}
              </div>
              <div style={{
                fontFamily: "var(--font-stencil, monospace)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6b6460",
              }}>
                {family.subtitle}
              </div>
            </div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "#4a4846",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}>
              {family.year_range}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── FULL MODEL GRID ──────────────────────────────────────────────────────────
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
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      gap: 10,
    }}>
      {families.map((family, i) => {
        const isSelected = selected?.name === family.name;
        return (
          <motion.button
            key={family.name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, delay: i * 0.025 }}
            onClick={() => onSelect(family)}
            style={{
              background: isSelected
                ? "linear-gradient(135deg, rgba(232,98,26,0.16), rgba(232,98,26,0.06))"
                : "rgba(18,17,16,0.9)",
              border: `1px solid ${isSelected ? "rgba(232,98,26,0.7)" : "rgba(42,40,38,0.8)"}`,
              borderRadius: 2,
              padding: "16px 14px",
              cursor: "pointer",
              textAlign: "left",
              position: "relative",
            }}
            whileHover={{ y: -2, borderColor: "rgba(232,98,26,0.4)" }}
          >
            {isSelected && (
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                height: 2,
                background: "linear-gradient(90deg, #e8621a, transparent)",
              }} />
            )}
            <div style={{
              fontFamily: "var(--font-caesar, serif)",
              fontSize: 24,
              lineHeight: 1,
              letterSpacing: "0.04em",
              color: isSelected ? "#e8621a" : "#f0ebe3",
              marginBottom: 6,
            }}>
              {family.display_name}
            </div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "#6b6460",
              textTransform: "uppercase",
              marginBottom: 4,
            }}>
              {family.subtitle}
            </div>
            <div style={{
              fontFamily: "var(--font-stencil, monospace)",
              fontSize: 8,
              color: "#4a4846",
              letterSpacing: "0.08em",
            }}>
              {family.year_range}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── CATEGORY ICON BUTTON ────────────────────────────────────────────────────
function CategoryTile({
  category,
  count,
  active,
  onClick,
}: {
  category: HarleyCategory;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3, borderColor: "rgba(232,98,26,0.5)" }}
      whileTap={{ scale: 0.97 }}
      style={{
        background: active
          ? "linear-gradient(135deg, rgba(232,98,26,0.14), rgba(232,98,26,0.04))"
          : "rgba(14,13,12,0.9)",
        border: `1px solid ${active ? "rgba(232,98,26,0.65)" : "rgba(38,36,34,0.8)"}`,
        borderRadius: 4,
        padding: "18px 12px 14px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        position: "relative",
      }}
    >
      {active && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: 2,
          background: "#e8621a",
          borderRadius: "4px 4px 0 0",
        }} />
      )}
      <span style={{ fontSize: 24, lineHeight: 1 }}>{category.icon}</span>
      <div style={{
        fontFamily: "var(--font-stencil, monospace)",
        fontSize: 8,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: active ? "#f0ebe3" : "#8a8784",
        textAlign: "center",
        lineHeight: 1.3,
      }}>
        {category.label}
      </div>
      {count > 0 && (
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: 7,
          color: active ? "#e8621a" : "#4a4846",
          letterSpacing: "0.1em",
        }}>
          {count}
        </div>
      )}
    </motion.button>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({
  product,
  onOpen,
  index,
}: {
  product: HarleyProduct;
  onOpen: (p: HarleyProduct) => void;
  index: number;
}) {
  const imageSrc = getProductImage({
    image: product.image_url ?? null,
    images: filterImageUrls(product.image_urls ?? []),
    brand: product.brand,
  });

  return (
    <motion.div
      layout
      layoutId={`product-${product.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18, delay: index * 0.04 }}
      onClick={() => onOpen(product)}
      style={{
        background: "rgba(10,9,8,0.95)",
        border: "1px solid rgba(38,36,34,0.8)",
        borderRadius: 2,
        cursor: "pointer",
        overflow: "hidden",
      }}
      whileHover={{ y: -3, borderColor: "rgba(232,98,26,0.4)" }}
    >
      <motion.div
        layoutId={`img-${product.id}`}
        style={{ position: "relative", aspectRatio: "1/1", background: "#fff" }}
      >
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 50vw, 20vw"
          style={{ objectFit: "contain", padding: 10 }}
          unoptimized
        />
      </motion.div>
      <div style={{ padding: "10px 12px 14px" }}>
        <div style={{
          fontFamily: "var(--font-stencil, monospace)",
          fontSize: 8,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#6b6460",
          marginBottom: 4,
        }}>
          {product.brand}
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: "#f0ebe3",
          lineHeight: 1.3,
          marginBottom: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {product.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{
            fontFamily: "var(--font-caesar, serif)",
            fontSize: 22,
            letterSpacing: "0.03em",
            color: "#f0ebe3",
          }}>
            ${Number(product.price || 0).toFixed(2)}
          </div>
          <div style={{
            fontFamily: "var(--font-stencil, monospace)",
            fontSize: 7,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: product.in_stock ? "#22c55e" : "#6b6460",
          }}>
            {product.in_stock ? "In Stock" : "Order"}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── PRODUCT MODAL ────────────────────────────────────────────────────────────
function ProductModal({ product, onClose }: { product: HarleyProduct | null; onClose: () => void }) {
  const imageSrc = product
    ? getProductImage({ image: product.image_url ?? null, images: filterImageUrls(product.image_urls ?? []), brand: product.brand })
    : null;

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(14px)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <motion.div
            initial={{ scale: 0.96, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 20, opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(1040px, 100%)",
              maxHeight: "min(90svh, 900px)",
              overflow: "auto",
              border: "1px solid rgba(52,50,48,0.9)",
              background: "radial-gradient(circle at 0% 0%, rgba(232,98,26,0.14), transparent 28%), #0e0d0c",
              display: "grid",
              gridTemplateColumns: "minmax(260px, 0.9fr) minmax(0, 1.1fr)",
            }}
          >
            <motion.div
              layoutId={`img-${product.id}`}
              style={{ position: "relative", minHeight: 300, background: "#fff" }}
            >
              {imageSrc && (
                <Image
                  src={imageSrc}
                  alt={product.name}
                  fill
                  sizes="45vw"
                  style={{ objectFit: "contain", padding: 20 }}
                  unoptimized
                />
              )}
            </motion.div>
            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
              <button
                onClick={onClose}
                style={{
                  alignSelf: "flex-start",
                  border: "1px solid rgba(52,50,48,0.8)",
                  background: "transparent",
                  color: "#8a8784",
                  fontFamily: "var(--font-stencil, monospace)",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderRadius: 2,
                }}
              >
                ← Close
              </button>
              <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b6460" }}>
                {product.brand} · {product.category}
              </div>
              <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(26px, 4vw, 48px)", lineHeight: 0.98, letterSpacing: "0.04em", color: "#f0ebe3" }}>
                {product.name}
              </div>
              <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 34, color: "#e8621a" }}>
                ${Number(product.price || 0).toFixed(2)}
              </div>
              {product.description && (
                <div style={{ color: "#a09b92", lineHeight: 1.7, fontSize: 14 }}>
                  {product.description}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.7)", padding: "6px 10px", borderRadius: 999, color: product.in_stock ? "#22c55e" : "#6b6460" }}>
                  {product.in_stock ? "In Stock" : "Out of Stock"}
                </span>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.7)", padding: "6px 10px", borderRadius: 999, color: "#8a8784" }}>
                  SKU {product.sku}
                </span>
                {product.fitment_year_start && (
                  <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.7)", padding: "6px 10px", borderRadius: 999, color: "#8a8784" }}>
                    {product.fitment_year_start}{product.fitment_year_end && product.fitment_year_end !== product.fitment_year_start ? `–${product.fitment_year_end}` : ""}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                <Link
                  href={`/shop/${product.slug}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", background: "#e8621a", color: "#0a0909", border: "1px solid #e8621a", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 18px" }}
                >
                  Open Full Page
                </Link>
                <button
                  onClick={onClose}
                  style={{ display: "inline-flex", alignItems: "center", background: "transparent", color: "#a09b92", border: "1px solid rgba(52,50,48,0.8)", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 18px", cursor: "pointer" }}
                >
                  Keep Browsing
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── RELATED CATEGORIES ROW ───────────────────────────────────────────────────
function RelatedCategories({
  categories,
  activeCat,
  counts,
  onPick,
}: {
  categories: HarleyCategory[];
  activeCat: string | null;
  counts: Record<string, number>;
  onPick: (slug: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
        {categories.map(cat => (
          <CategoryTile
            key={cat.slug}
            category={cat}
            count={counts[cat.slug] ?? 0}
            active={activeCat === cat.slug}
            onClick={() => onPick(cat.slug)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── MAIN CLIENT ──────────────────────────────────────────────────────────────
export default function HarleySearchClient() {
  const [step, setStep] = useState<Step>("model");
  const [allFamiliesOpen, setAllFamiliesOpen] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<HarleyFamily | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(YEAR_MAX);
  const [activeCatSlug, setActiveCatSlug] = useState<string | null>(null);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, HarleyProduct[]>>({});
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<HarleyProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeCategory = useMemo(
    () => activeCatSlug ? HARLEY_CATEGORIES.find(c => c.slug === activeCatSlug) ?? null : null,
    [activeCatSlug]
  );

  const activeProducts = useMemo(
    () => activeCatSlug ? (productsByCategory[activeCatSlug] ?? []) : [],
    [activeCatSlug, productsByCategory]
  );

  const loadProducts = useCallback(async (family: HarleyFamily, year: number) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        HARLEY_CATEGORIES.map(async cat => {
          const params = new URLSearchParams({
            family: family.name,
            year: String(year),
            category: cat.label,
            limit: "24",
          });
          const res = await fetch(`/api/harley2/products?${params}`);
          const data = await res.json();
          const rows: HarleyProduct[] = (Array.isArray(data) ? data : data.products ?? []).map(normalizeHarleyProductRow);
          return [cat.slug, rows] as const;
        })
      );
      const byCategory = Object.fromEntries(results);
      setProductsByCategory(byCategory);
      const counts: Record<string, number> = {};
      for (const [slug, rows] of results) counts[slug] = rows.length;
      setCatCounts(counts);
      const firstWithProducts = HARLEY_CATEGORIES.find(c => (counts[c.slug] ?? 0) > 0);
      setActiveCatSlug(firstWithProducts?.slug ?? HARLEY_CATEGORIES[0].slug);
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
      setAllFamiliesOpen(false);
    });
  };

  const handleConfirmYear = () => {
    if (!selectedFamily) return;
    loadProducts(selectedFamily, selectedYear);
  };

  const reset = () => {
    startTransition(() => {
      setStep("model");
      setSelectedFamily(null);
      setProductsByCategory({});
      setCatCounts({});
      setActiveCatSlug(null);
      setError(null);
      setAllFamiliesOpen(false);
    });
  };

  const totalProducts = useMemo(
    () => Object.values(catCounts).reduce((a, b) => a + b, 0),
    [catCounts]
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080807", color: "#f0ebe3" }}>
      <NavBar activePage="shop" cartCount={0} onCartClick={() => {}} />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px 80px" }}>

        {/* ── HERO ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(340px, 0.9fr)",
            gap: 28,
            alignItems: "end",
            minHeight: "calc(100svh - 84px)",
            padding: "28px 0 18px",
          }}
        >
          {/* Left copy */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 22 }}>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.28em", color: "#e8621a", textTransform: "uppercase" }}>
              Stinkin&apos; Supplies / Harley-First Shop
            </div>
            <h1 style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(44px, 6vw, 88px)", lineHeight: 0.95, letterSpacing: "0.04em", maxWidth: "11ch", margin: 0 }}>
              Find parts for your{" "}
              <span style={{ color: "#e8621a" }}>
                {selectedFamily ? selectedFamily.display_name : "Harley"}
              </span>
            </h1>
            <p style={{ maxWidth: "54ch", color: "#a09b92", fontSize: 15, lineHeight: 1.7, margin: 0 }}>
              {step === "model" && "Pick your model family. We&apos;ll show you everything in the catalog that fits."}
              {step === "year" && `${selectedFamily?.display_name} selected. Pick your year to see exact fitment.`}
              {step === "categories" && `${totalProducts.toLocaleString()} parts found for ${selectedYear} ${selectedFamily?.display_name}.`}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid rgba(232,98,26,0.3)", background: "rgba(232,98,26,0.07)", color: "#f0ebe3", padding: "6px 10px", borderRadius: 999 }}>
                PU Oldbook + Fatbook
              </span>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid rgba(232,98,26,0.3)", background: "rgba(232,98,26,0.07)", color: "#f0ebe3", padding: "6px 10px", borderRadius: 999 }}>
                WPS HardDrive
              </span>
              {totalProducts > 0 && (
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid rgba(52,50,48,0.8)", color: "#8a8784", padding: "6px 10px", borderRadius: 999 }}>
                  {totalProducts.toLocaleString()} results
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {step !== "model" && (
                <button
                  onClick={reset}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", color: "#a09b92", border: "1px solid rgba(52,50,48,0.8)", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "11px 16px", cursor: "pointer" }}
                >
                  ← Change Model
                </button>
              )}
              <Link
                href="/shop/classic"
                style={{ display: "inline-flex", alignItems: "center", background: "transparent", color: "#6b6460", border: "1px solid rgba(38,36,34,0.7)", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "11px 16px", textDecoration: "none" }}
              >
                Classic Shop
              </Link>
            </div>
            {error && (
              <div style={{ color: "#ef4444", fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.1em" }}>
                {error}
              </div>
            )}
          </div>

          {/* Right: Layered Stack */}
          <div style={{ borderLeft: "1px solid rgba(38,36,34,0.6)", paddingLeft: 22, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 16 }}>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#4a4846", marginBottom: 4 }}>
              {step === "model" ? "Select model family" : selectedFamily?.display_name}
            </div>

            <LayeredStack
              families={HARLEY_FAMILIES}
              selected={selectedFamily}
              onSelect={handleSelectFamily}
            />

            <button
              onClick={() => setAllFamiliesOpen(v => !v)}
              style={{ background: "transparent", border: "1px solid rgba(38,36,34,0.7)", borderRadius: 2, color: "#6b6460", fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", padding: "10px 14px", cursor: "pointer", marginTop: 4 }}
            >
              {allFamiliesOpen ? "↑ Collapse" : `↓ All ${HARLEY_FAMILIES.length} families`}
            </button>
          </div>
        </motion.div>

        {/* ── ALL FAMILIES EXPANDED ── */}
        <AnimatePresence>
          {allFamiliesOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24 }}
              style={{ overflow: "hidden", borderTop: "1px solid rgba(38,36,34,0.6)", paddingTop: 20, marginBottom: 20 }}
            >
              <ModelGrid
                families={HARLEY_FAMILIES}
                selected={selectedFamily}
                onSelect={handleSelectFamily}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── YEAR PICKER ── */}
        <AnimatePresence>
          {step === "year" && selectedFamily && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.22 }}
              style={{ borderTop: "1px solid rgba(38,36,34,0.6)", paddingTop: 24, marginTop: 8 }}
            >
              <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b6460", marginBottom: 10 }}>
                {selectedFamily.display_name} — Select Year
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  style={{ background: "#111010", color: "#f0ebe3", border: "1px solid rgba(52,50,48,0.8)", fontFamily: "var(--font-stencil, monospace)", letterSpacing: "0.12em", fontSize: 14, padding: "12px 16px", borderRadius: 2, minWidth: 140 }}
                >
                  {YEARS.filter(y => {
                    const range = selectedFamily.year_range.split("–");
                    const min = parseInt(range[0]);
                    const max = parseInt(range[1]) || YEAR_MAX;
                    return y >= min && y <= max;
                  }).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <motion.button
                  onClick={handleConfirmYear}
                  disabled={loading}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  style={{ background: "#e8621a", color: "#0a0909", border: "1px solid #e8621a", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "12px 24px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? "Loading…" : `Find ${selectedYear} ${selectedFamily.display_name} Parts →`}
                </motion.button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── CATEGORIES + RESULTS ── */}
        <AnimatePresence>
          {step === "categories" && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              style={{ borderTop: "1px solid rgba(38,36,34,0.6)", paddingTop: 24, marginTop: 8 }}
            >
              {/* Breadcrumb */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { label: selectedYear.toString() },
                  { label: selectedFamily?.display_name ?? "" },
                  activeCategory ? { label: activeCategory.label, accent: true } : null,
                ].filter(Boolean).map((item, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {i > 0 && <span style={{ color: "#3a3836" }}>›</span>}
                    <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: item!.accent ? "#e8621a" : "#8a8784" }}>
                      {item!.label}
                    </span>
                  </span>
                ))}
              </div>

              {/* Category tiles */}
              <div style={{ marginBottom: 28 }}>
                <RelatedCategories
                  categories={HARLEY_CATEGORIES}
                  activeCat={activeCatSlug}
                  counts={catCounts}
                  onPick={setActiveCatSlug}
                />
              </div>

              {/* Products for active category */}
              <AnimatePresence mode="wait">
                {activeCategory && (
                  <motion.div
                    key={activeCatSlug}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b6460", marginBottom: 4 }}>
                          {catCounts[activeCatSlug!] ?? 0} results
                        </div>
                        <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(22px, 3.5vw, 38px)", letterSpacing: "0.04em", lineHeight: 1 }}>
                          {activeCategory.label}
                        </div>
                      </div>
                      <div style={{ color: "#6b6460", fontSize: 13 }}>{activeCategory.description}</div>
                    </div>

                    {activeProducts.length > 0 ? (
                      <LayoutGroup>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                          gap: 10,
                        }}>
                          {activeProducts.map((product, i) => (
                            <ProductCard
                              key={product.id}
                              product={product}
                              onOpen={setSelectedProduct}
                              index={i}
                            />
                          ))}
                        </div>
                      </LayoutGroup>
                    ) : (
                      <div style={{ padding: "32px 0", fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4a4846" }}>
                        No parts found for this category
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Related categories footer */}
              {activeProducts.length > 0 && (
                <div style={{ marginTop: 48, borderTop: "1px solid rgba(38,36,34,0.5)", paddingTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#4a4846", marginBottom: 14 }}>
                    More for your {selectedFamily?.display_name}
                  </div>
                  <RelatedCategories
                    categories={HARLEY_CATEGORIES.filter(c => c.slug !== activeCatSlug && (catCounts[c.slug] ?? 0) > 0)}
                    activeCat={null}
                    counts={catCounts}
                    onPick={setActiveCatSlug}
                  />
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

      </div>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}