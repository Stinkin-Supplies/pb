"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import NavBar from "@/components/NavBar";
import FilterGroupLinks from "@/components/FilterGroupLinks";
import { getProductImage, filterImageUrls } from "@/lib/getProductImage";
import {
  HARLEY_CATEGORIES,
  HARLEY_FAMILIES,
  type HarleyCategory,
  type HarleyFamily,
} from "@/lib/harley/config";
import { normalizeHarleyProductRow, type HarleyProduct } from "@/lib/harley/catalog";

type Step = "model" | "year" | "categories";
type YearModel = {
  year: number;
  models: { model_code: string; model_name: string; engine_nickname: string | null }[];
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [query]);
  return matches;
}

function ModelGrid({ families, selected, onSelect, compact = false }: {
  families: HarleyFamily[]; selected: HarleyFamily | null;
  onSelect: (f: HarleyFamily) => void; compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }}
      style={{ display: "grid", gridTemplateColumns: compact ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}
    >
      {families.map((family, i) => {
        const isSelected = selected?.name === family.name;
        return (
          <motion.button key={family.name}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, delay: i * 0.02 }}
            onClick={() => onSelect(family)}
            whileHover={{ y: -2, borderColor: "rgba(232,98,26,0.45)" }}
            style={{ background: isSelected ? "rgba(232,98,26,0.12)" : "rgba(16,15,14,0.95)", border: `1px solid ${isSelected ? "rgba(232,98,26,0.7)" : "rgba(38,36,34,0.8)"}`, borderRadius: 2, padding: compact ? "12px 10px" : "16px 14px", cursor: "pointer", textAlign: "left", position: "relative" }}
          >
            {isSelected && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#e8621a" }} />}
            <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: compact ? 18 : 22, lineHeight: 1, letterSpacing: "0.04em", color: isSelected ? "#e8621a" : "#f0ebe3", marginBottom: 5 }}>{family.display_name}</div>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: compact ? 7 : 8, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5856", marginBottom: 3 }}>{family.subtitle}</div>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: compact ? 7 : 8, color: "#3a3836", letterSpacing: "0.08em" }}>{family.year_range}</div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

function YearDropdown({ family, yearModels, loadingModels, selectedYear, onYearChange, onConfirm, loading }: {
  family: HarleyFamily; yearModels: YearModel[]; loadingModels: boolean;
  selectedYear: number | null; onYearChange: (y: number) => void; onConfirm: () => void; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const selected = yearModels.find(ym => ym.year === selectedYear);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.2 }}>
      <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4846", marginBottom: 12 }}>
        Year — {family.display_name}
      </div>
      <div ref={ref} style={{ position: "relative", marginBottom: 16 }}>
        <button onClick={() => !loadingModels && setOpen(o => !o)}
          style={{ width: "100%", background: "rgba(16,15,14,0.97)", border: `1px solid ${open ? "rgba(232,98,26,0.6)" : "rgba(52,50,48,0.8)"}`, borderRadius: 2, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: loadingModels ? "wait" : "pointer", gap: 12 }}
        >
          <div style={{ minWidth: 0 }}>
            {loadingModels ? (
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4a4846" }}>Loading models…</span>
            ) : selected ? (
              <>
                <span style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 26, letterSpacing: "0.04em", color: "#e8621a", marginRight: 10 }}>{selected.year}</span>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7a7876" }}>
                  {selected.models.slice(0, 4).map(m => m.model_code).join(" · ")}{selected.models.length > 4 ? ` +${selected.models.length - 4}` : ""}
                </span>
              </>
            ) : (
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4a4846" }}>Select a year</span>
            )}
          </div>
          <span style={{ color: "#4a4846", fontSize: 10, flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
              style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#0e0d0c", border: "1px solid rgba(52,50,48,0.9)", borderRadius: 2, zIndex: 50, maxHeight: 320, overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.7)" }}
            >
              {yearModels.map((ym) => {
                const isActive = ym.year === selectedYear;
                return (
                  <button key={ym.year} onClick={() => { onYearChange(ym.year); setOpen(false); }}
                    style={{ width: "100%", background: isActive ? "rgba(232,98,26,0.12)" : "transparent", border: "none", borderBottom: "1px solid rgba(36,34,32,0.5)", padding: "11px 16px", display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(232,98,26,0.06)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <span style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 22, letterSpacing: "0.04em", color: isActive ? "#e8621a" : "#f0ebe3", lineHeight: 1, minWidth: 48, flexShrink: 0 }}>{ym.year}</span>
                    <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: isActive ? "#c07040" : "#5a5856", lineHeight: 1.5 }}>{ym.models.map(m => m.model_code).join(" · ")}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.button onClick={onConfirm} disabled={loading || !selectedYear}
        whileHover={selectedYear ? { y: -2 } : {}} whileTap={selectedYear ? { scale: 0.97 } : {}}
        style={{ width: "100%", background: selectedYear ? "#e8621a" : "rgba(36,34,32,0.5)", color: selectedYear ? "#0a0908" : "#3a3836", border: `1px solid ${selectedYear ? "#e8621a" : "rgba(36,34,32,0.5)"}`, borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "14px 20px", cursor: loading || !selectedYear ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, transition: "background 0.15s, color 0.15s, border-color 0.15s" }}
      >
        {loading ? "Loading…" : selectedYear ? `Find ${selectedYear} ${family.display_name} Parts →` : "Select a year above"}
      </motion.button>
    </motion.div>
  );
}

function CategoryTile({ category, count, active, onClick }: { category: HarleyCategory; count: number; active: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={onClick} whileHover={{ y: -3, borderColor: "rgba(232,98,26,0.5)" }} whileTap={{ scale: 0.97 }}
      style={{ background: active ? "rgba(232,98,26,0.12)" : "rgba(12,11,10,0.95)", border: `1px solid ${active ? "rgba(232,98,26,0.65)" : "rgba(36,34,32,0.8)"}`, borderRadius: 4, padding: "16px 10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 90, position: "relative" }}
    >
      {active && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "#e8621a", borderRadius: "4px 4px 0 0" }} />}
      <span style={{ fontSize: 22, lineHeight: 1 }}>{category.icon}</span>
      <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, letterSpacing: "0.12em", textTransform: "uppercase", color: active ? "#f0ebe3" : "#7a7876", textAlign: "center", lineHeight: 1.35 }}>{category.label}</div>
      {count > 0 && <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7, color: active ? "#e8621a" : "#3a3836", letterSpacing: "0.08em" }}>{count}</div>}
    </motion.button>
  );
}

function ProductCard({ product, onOpen, index }: { product: HarleyProduct; onOpen: (p: HarleyProduct) => void; index: number }) {
  const imageSrc = getProductImage({ image: product.image_url ?? null, images: filterImageUrls(product.image_urls ?? []), brand: product.brand });
  return (
    <motion.div layout layoutId={`product-${product.id}`}
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, delay: index * 0.015 }}
      onClick={() => onOpen(product)}
      style={{ background: "rgba(14,13,12,0.97)", border: "1px solid rgba(36,34,32,0.8)", borderRadius: 2, cursor: "pointer", overflow: "hidden" }}
    >
      {imageSrc && (
        <div style={{ aspectRatio: "4/3", overflow: "hidden", background: "#0c0b0a" }}>
          <img src={imageSrc} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8 }} />
        </div>
      )}
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 7.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5a5856", marginBottom: 4 }}>{product.brand}</div>
        <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 15, lineHeight: 1.2, letterSpacing: "0.03em", color: "#f0ebe3", marginBottom: 6 }}>{product.name}</div>
        <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: 18, color: "#e8621a", letterSpacing: "0.04em" }}>${product.computed_price?.toFixed(2) ?? product.msrp?.toFixed(2)}</div>
      </div>
    </motion.div>
  );
}

export default function HarleySearchClient() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [step, setStep] = useState<Step>("model");
  const [selectedFamily, setSelectedFamily] = useState<HarleyFamily | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearModels, setYearModels] = useState<YearModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
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

  const fetchYearModels = useCallback(async (family: HarleyFamily) => {
    setLoadingModels(true); setYearModels([]); setSelectedYear(null);
    try {
      const res = await fetch(`/api/harley/models?family=${encodeURIComponent(family.name)}`);
      const data = await res.json();
      setYearModels(data.years ?? []);
      if (data.years?.length) setSelectedYear(data.years[0].year);
    } catch { setYearModels([]); } finally { setLoadingModels(false); }
  }, []);

  const loadProducts = useCallback(async (family: HarleyFamily, year: number) => {
    setLoading(true); setError(null);
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
      setProductsByCategory(byCategory); setCatCounts(counts);
      const first = HARLEY_CATEGORIES.find(c => (counts[c.slug] ?? 0) > 0);
      setActiveCatSlug(first?.slug ?? HARLEY_CATEGORIES[0].slug);
      setStep("categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally { setLoading(false); }
  }, []);

  const handleSelectFamily = (family: HarleyFamily) => {
    startTransition(() => { setSelectedFamily(family); setStep("year"); });
    fetchYearModels(family);
  };

  const handleFilterGroupSelect = (familyName: string) => {
    const family = HARLEY_FAMILIES.find(f => f.name === familyName);
    if (family) handleSelectFamily(family);
  };

  const reset = () => {
    startTransition(() => {
      setStep("model"); setSelectedFamily(null); setSelectedYear(null);
      setYearModels([]); setProductsByCategory({}); setCatCounts({});
      setActiveCatSlug(null); setError(null);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080706", color: "#f0ebe3" }}>
      <NavBar activePage="shop" cartCount={0} onCartClick={() => {}} />
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 80px" }}>

        {/* HERO */}
        <div style={{ paddingTop: 32, paddingBottom: 24, borderBottom: "1px solid rgba(36,34,32,0.6)", marginBottom: 32 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.28em", color: "#e8621a", textTransform: "uppercase", marginBottom: 10 }}>Harley-Davidson Parts</div>
            <h1 style={{ fontFamily: "var(--font-caesar, serif)", fontSize: isMobile ? "clamp(34px, 12vw, 52px)" : "clamp(52px, 8vw, 110px)", lineHeight: 0.9, letterSpacing: "0.04em", margin: 0 }}>
              {step === "model"      && <>Find parts for your <span style={{ color: "#e8621a" }}>Harley</span></>}
              {step === "year"       && <>{selectedFamily?.display_name} — <span style={{ color: "#e8621a" }}>what year?</span></>}
              {step === "categories" && <>{selectedYear} <span style={{ color: "#e8621a" }}>{selectedFamily?.display_name}</span></>}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {step !== "model" && (
              <button onClick={reset} style={{ background: "transparent", color: "#6b6460", border: "1px solid rgba(36,34,32,0.7)", borderRadius: 2, fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", padding: "8px 12px", cursor: "pointer" }}>← Change Model</button>
            )}
            {step === "year" && selectedFamily && (
              <span style={{ color: "#6b6460", fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase" }}>{selectedFamily.display_name}</span>
            )}
            {totalProducts > 0 && <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b6460" }}>{totalProducts.toLocaleString()} parts found</span>}
            {loading && <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "#e8621a" }}>Loading…</span>}
            {error && <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#ef4444" }}>{error}</span>}
          </div>
        </div>

        {/* BENTO LANDING */}
        <AnimatePresence mode="wait">
          {step === "model" && (
            <motion.div key="bento" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22 }}>
              <FilterGroupLinks onSelect={handleFilterGroupSelect} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* YEAR SELECTOR */}
        <AnimatePresence mode="wait">
          {step === "year" && (
            <motion.div key="year" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22 }}
              style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 2, marginBottom: 32 }}
            >
              <div style={{ borderRight: isMobile ? "none" : "1px solid rgba(36,34,32,0.5)", paddingRight: isMobile ? 0 : 28, marginBottom: isMobile ? 20 : 0 }}>
                {selectedFamily && (
                  <YearDropdown family={selectedFamily} yearModels={yearModels} loadingModels={loadingModels} selectedYear={selectedYear} onYearChange={setSelectedYear} onConfirm={() => selectedYear && loadProducts(selectedFamily, selectedYear)} loading={loading} />
                )}
              </div>
              <div style={{ paddingLeft: isMobile ? 0 : 28 }}>
                <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4a4846", marginBottom: 12 }}>Or pick a different family</div>
                <ModelGrid families={HARLEY_FAMILIES} selected={selectedFamily} onSelect={handleSelectFamily} compact={isMobile} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CATEGORIES + RESULTS */}
        <AnimatePresence>
          {step === "categories" && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {[selectedYear?.toString(), selectedFamily?.display_name, activeCategory?.label].filter(Boolean).map((label, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {i > 0 && <span style={{ color: "#2a2826" }}>›</span>}
                    <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: i === 2 ? "#e8621a" : "#6b6460" }}>{label}</span>
                  </span>
                ))}
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 10, marginBottom: 28, WebkitOverflowScrolling: "touch" }}>
                <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
                  {HARLEY_CATEGORIES.map(cat => (
                    <CategoryTile key={cat.slug} category={cat} count={catCounts[cat.slug] ?? 0} active={activeCatSlug === cat.slug} onClick={() => setActiveCatSlug(cat.slug)} />
                  ))}
                </div>
              </div>
              <AnimatePresence mode="wait">
                {activeCategory && (
                  <motion.div key={activeCatSlug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5a5856", marginBottom: 4 }}>{catCounts[activeCatSlug!] ?? 0} results</div>
                        <div style={{ fontFamily: "var(--font-caesar, serif)", fontSize: "clamp(24px, 3.5vw, 42px)", letterSpacing: "0.04em", lineHeight: 1 }}>{activeCategory.label}</div>
                      </div>
                      <div style={{ color: "#5a5856", fontSize: 13, maxWidth: "40ch", textAlign: "right" }}>{activeCategory.description}</div>
                    </div>
                    {activeProducts.length > 0 ? (
                      <LayoutGroup>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fill, minmax(172px, 1fr))", gap: 10 }}>
                          {activeProducts.map((product, i) => <ProductCard key={product.id} product={product} onOpen={setSelectedProduct} index={i} />)}
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
              {activeProducts.length > 0 && (
                <div style={{ marginTop: 52, borderTop: "1px solid rgba(32,30,28,0.6)", paddingTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#3a3836", marginBottom: 14 }}>More for your {selectedFamily?.display_name}</div>
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
    </div>
  );
}
