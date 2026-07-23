"use client";
// ============================================================
// components/browse/FilterSidebar.jsx
//
// AwwwardsNav-style bottom pill that expands upward to reveal
// a 4-column filter panel (GSAP power4.inOut animation).
//
// Columns:
//   1. FITMENT  — Family → Model → Year cascade + Engine Era
//   2. CATEGORY — display_category → subcategory → detail
//   3. BRAND    — brand facet list
//   4. REFINE   — In Stock · Price · Clear All
//
// Props:
//   facets   — { categories, subcategories, subcategoryDetails, brands }
//   filters  — current filter state
//   onChange — filter update callback
//   total    — result count (shown in pill)
// ============================================================

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";

// ── Constants ────────────────────────────────────────────────
const PILL_H     = 56;
const EXPANDED_H = 460;

const GOLD     = "#c5a722";
const GOLD_DIM = "rgba(197,167,34,0.30)";
const GOLD_MUT = "rgba(197,167,34,0.10)";
const GOLD_ACT = "rgba(197,167,34,0.16)";
const IRON     = "#181614";
const COAL     = "#0f0e0d";
const STEEL    = "rgba(255,255,255,0.06)";
const SILVER   = "#a09890";
const CHROME   = "#706860";
const CREAM    = "#f0e8d8";

// ── Static fitment data ──────────────────────────────────────
const HD_FAMILIES = [
  "Touring", "Softail", "Dyna", "Sportster", "FXR", "Trike",
  "Revolution Max", "V-Rod", "Street", "Shovelhead", "Panhead",
  "Knucklehead", "Flathead",
];

const HD_ERAS = [
  { label: "Milwaukee-Eight",    slug: "milwaukee-8",        years: "2017+" },
  { label: "Twin Cam",           slug: "twin-cam",           years: "1999–2017" },
  { label: "Evolution",          slug: "evolution",          years: "1984–2000" },
  { label: "Evo Sportster",      slug: "evo-sportster",      years: "1986–2003" },
  { label: "Shovelhead",         slug: "shovelhead",         years: "1966–1984" },
  { label: "Ironhead Sportster", slug: "ironhead-sportster", years: "1957–1985" },
  { label: "Panhead",            slug: "panhead",            years: "1948–1965" },
  { label: "Knucklehead",        slug: "knucklehead",        years: "1936–1947" },
  { label: "Flathead",           slug: "flathead",           years: "1929–1973" },
  { label: "Chopper",            slug: "chopper",            years: "All eras" },
];

// ── Helpers ──────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// ── Sub-components ───────────────────────────────────────────

// Square checkbox (13×13, no border-radius)
function Checkbox({ active }) {
  return (
    <span style={{
      width: 13, height: 13, flexShrink: 0,
      border: `1.5px solid ${active ? GOLD : GOLD_DIM}`,
      background: active ? GOLD : "transparent",
      display: "grid", placeContent: "center",
      transition: "border-color 0.12s, background 0.12s",
    }}>
      {active && (
        <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
          <path d="M1 3L2.8 5L6 1" stroke="#0f0e0d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  );
}

// Single filter row with checkbox + label + optional count
function FilterRow({ label, count, active, onClick, small = false }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", gap: 8, padding: small ? "5px 0" : "6px 0",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <Checkbox active={active} />
        <span style={{
          fontFamily: "var(--font-body), sans-serif",
          fontSize: small ? 12 : 13,
          fontWeight: 500,
          color: active ? CREAM : hov ? CREAM : SILVER,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.3,
          transition: "color 0.12s",
        }}>
          {label}
        </span>
      </div>
      {count != null && (
        <span style={{
          fontFamily: "var(--font-stencil), monospace",
          fontSize: 10, color: CHROME, flexShrink: 0,
        }}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

// Column wrapper with dashed left separator (except first col)
function Col({ title, children, first = false }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      borderLeft: first ? "none" : `1px dashed rgba(197,167,34,0.18)`,
      padding: first ? "20px 20px 20px 0" : "20px",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Column header — matches section ident style */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
      }}>
        <span style={{
          width: 5, height: 5, flexShrink: 0,
          background: GOLD_DIM, display: "inline-block",
        }} />
        <span style={{
          fontFamily: "var(--font-stencil), monospace",
          fontSize: 11,
          letterSpacing: "3px",
          color: GOLD,
          textTransform: "uppercase",
        }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {children}
      </div>
    </div>
  );
}

// Dropdown select styled to match design system
function StyledSelect({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        width: "100%", background: COAL,
        border: `1px solid ${GOLD_DIM}`,
        color: value ? CREAM : SILVER,
        fontFamily: "var(--font-body), sans-serif",
        fontSize: 13, fontWeight: 500,
        padding: "9px 10px", outline: "none",
        cursor: "pointer", marginBottom: 8,
        borderRadius: 0,
        appearance: "none",
      }}
    >
      {children}
    </select>
  );
}

// Active filter chip — shown in the collapsed pill row
function Chip({ label, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: GOLD_ACT, border: `1px solid ${GOLD_DIM}`,
      padding: "2px 6px 2px 8px", flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "var(--font-body), sans-serif",
        fontSize: 11, fontWeight: 600,
        color: GOLD,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: GOLD, fontSize: 13, lineHeight: 1,
          padding: "0 1px", display: "flex", alignItems: "center",
        }}
      >×</button>
    </span>
  );
}

// ── Main export ──────────────────────────────────────────────
export default function FilterSidebar({ facets, filters, onChange, total = 0 }) {
  const panelRef   = useRef(null);
  const expandedRef = useRef(null);
  const openRef    = useRef(false);
  const animRef    = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  // Cascading fitment state
  const [familyModels, setFamilyModels] = useState([]);
  const [modelYears,   setModelYears]   = useState([]);

  useEffect(() => {
    if (!filters.family) { setFamilyModels([]); return; }
    let cancelled = false;
    fetch(`/api/fitment/models?family=${encodeURIComponent(filters.family)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setFamilyModels(d.models ?? []); })
      .catch(() => { if (!cancelled) setFamilyModels([]); });
    return () => { cancelled = true; };
  }, [filters.family]);

  const selectedModelObj = familyModels.find(m => m.model_code === filters.model);

  useEffect(() => {
    if (!selectedModelObj) { setModelYears([]); return; }
    let cancelled = false;
    fetch(`/api/fitment/years?model=${selectedModelObj.id}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setModelYears(d.years ?? []); })
      .catch(() => { if (!cancelled) setModelYears([]); });
    return () => { cancelled = true; };
  }, [selectedModelObj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Establish collapsed baseline
  useEffect(() => {
    if (!panelRef.current || !expandedRef.current) return;
    gsap.set(panelRef.current, { height: PILL_H });
    gsap.set(expandedRef.current, { opacity: 0, y: 12, display: "none" });
    return () => {
      gsap.killTweensOf([panelRef.current, expandedRef.current]);
    };
  }, []);

  const toggle = () => {
    if (animRef.current || !panelRef.current || !expandedRef.current) return;
    animRef.current = true;
    const opening = !openRef.current;
    openRef.current = opening;
    setIsOpen(opening);

    if (opening) {
      gsap.to(panelRef.current, { height: EXPANDED_H, duration: 0.72, ease: "power4.inOut" });
      gsap.to(expandedRef.current, {
        opacity: 1, y: 0, duration: 0.28, delay: 0.48,
        onStart: () => gsap.set(expandedRef.current, { display: "block" }),
        onComplete: () => { animRef.current = false; },
      });
    } else {
      gsap.to(expandedRef.current, {
        opacity: 0, y: 8, duration: 0.16,
        onComplete: () => gsap.set(expandedRef.current, { display: "none" }),
      });
      gsap.to(panelRef.current, {
        height: PILL_H, duration: 0.6, ease: "power4.inOut", delay: 0.12,
        onComplete: () => { animRef.current = false; },
      });
    }
  };

  // Build active chips for the pill summary row
  const clearAll = () => onChange({
    family: null, model: null, modelCodes: null, year: null,
    era: null, display_category: null, display_subcategory: null,
    subcategory_detail: null, brand: null,
    min_price: null, max_price: null, in_stock: false, q: null,
  });

  const chips = [
    filters.family     && { key: "family", label: filters.family,           clear: () => onChange({ family: null, model: null, modelCodes: null, year: null }) },
    filters.model      && { key: "model",  label: filters.model,            clear: () => onChange({ model: null, modelCodes: null }) },
    filters.year       && { key: "year",   label: String(filters.year),     clear: () => onChange({ year: null }) },
    filters.era        && { key: "era",    label: filters.era.replace(/-/g," "), clear: () => onChange({ era: null }) },
    filters.display_category && { key: "cat", label: filters.display_category, clear: () => onChange({ display_category: null, display_subcategory: null, subcategory_detail: null }) },
    filters.display_subcategory && { key: "sub", label: filters.display_subcategory, clear: () => onChange({ display_subcategory: null, subcategory_detail: null }) },
    filters.brand      && { key: "brand",  label: filters.brand,            clear: () => onChange({ brand: null }) },
    filters.in_stock   && { key: "stock",  label: "In Stock",               clear: () => onChange({ in_stock: false }) },
    (filters.min_price || filters.max_price) && {
      key: "price",
      label: `$${filters.min_price ?? 0}–$${filters.max_price ?? "∞"}`,
      clear: () => onChange({ min_price: null, max_price: null }),
    },
  ].filter(Boolean);

  const activeCount = chips.length;

  // In-stock toggle convenience
  const [priceMin, setPriceMin] = useState(filters.min_price ?? "");
  const [priceMax, setPriceMax] = useState(filters.max_price ?? "");
  const dPriceMin = useDebounce(priceMin, 400);
  const dPriceMax = useDebounce(priceMax, 400);

  useEffect(() => {
    onChange({ min_price: dPriceMin ? parseFloat(dPriceMin) : null });
  }, [dPriceMin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onChange({ max_price: dPriceMax ? parseFloat(dPriceMax) : null });
  }, [dPriceMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const subcategories     = facets.subcategories     ?? [];
  const subcategoryDetails = facets.subcategoryDetails ?? [];

  // ── Render ──────────────────────────────────────────────────
  return (
    <nav
      ref={panelRef}
      aria-label="Filter panel"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(1200px, 94vw)",
        zIndex: 200,
        background: IRON,
        border: `1px solid ${GOLD_DIM}`,
        overflow: "hidden",
        /* Subtle shadow so it lifts above the page */
        boxShadow: "0 -4px 40px rgba(0,0,0,0.60), 0 2px 8px rgba(0,0,0,0.40)",
      }}
    >
      {/* ── Expanded panel content ──────────────────────────── */}
      <div
        ref={expandedRef}
        style={{
          display: "none",
          height: EXPANDED_H - PILL_H,
          borderBottom: `1px solid ${GOLD_DIM}`,
          overflow: "hidden",
        }}
      >
        {/* Inner border frame */}
        <div style={{
          margin: 10,
          height: "calc(100% - 20px)",
          border: `1px solid rgba(197,167,34,0.08)`,
          background: COAL,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          overflow: "hidden",
        }}>

          {/* ── COL 1: FITMENT ──────────────────────────────── */}
          <Col title="Fitment" first>
            <StyledSelect
              value={filters.family ?? ""}
              onChange={e => onChange({ family: e.target.value || null, model: null, modelCodes: null, year: null })}
            >
              <option value="">Any Family</option>
              {HD_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
            </StyledSelect>

            {filters.family && (
              <StyledSelect
                value={filters.model ?? ""}
                onChange={e => onChange({ model: e.target.value || null, modelCodes: null, year: null })}
              >
                <option value="">Any Model</option>
                {familyModels.map(m => (
                  <option key={m.model_code} value={m.model_code}>
                    {m.name} ({m.model_code})
                  </option>
                ))}
              </StyledSelect>
            )}

            {filters.model && (
              <StyledSelect
                value={filters.year ?? ""}
                onChange={e => onChange({ year: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Any Year</option>
                {modelYears.map(y => <option key={y} value={y}>{y}</option>)}
              </StyledSelect>
            )}

            {/* Separator */}
            <div style={{
              height: 1, background: GOLD_DIM, margin: "12px 0 10px",
              opacity: 0.5,
            }} />

            {/* Engine Era */}
            <div style={{
              fontFamily: "var(--font-stencil), monospace",
              fontSize: 10, letterSpacing: "2.5px", color: SILVER,
              textTransform: "uppercase", marginBottom: 8,
            }}>
              Engine Era
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {HD_ERAS.map(era => (
                <button
                  key={era.slug}
                  onClick={() => onChange({ era: filters.era === era.slug ? null : era.slug })}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", gap: 8, padding: "5px 0",
                    background: "none", border: "none", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Checkbox active={filters.era === era.slug} />
                    <span style={{
                      fontFamily: "var(--font-body), sans-serif",
                      fontSize: 13, fontWeight: 500,
                      color: filters.era === era.slug ? CREAM : SILVER,
                      transition: "color 0.12s",
                    }}>
                      {era.label}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "var(--font-stencil), monospace",
                    fontSize: 10, color: CHROME, flexShrink: 0,
                  }}>
                    {era.years}
                  </span>
                </button>
              ))}
            </div>
          </Col>

          {/* ── COL 2: CATEGORY ─────────────────────────────── */}
          <Col title="Category">
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {(facets.categories ?? []).slice(0, 24).map(cat => (
                <FilterRow
                  key={cat.name}
                  label={cat.name}
                  count={cat.count}
                  active={filters.display_category === cat.name}
                  onClick={() => onChange({
                    display_category: filters.display_category === cat.name ? null : cat.name,
                    display_subcategory: null, subcategory_detail: null,
                  })}
                />
              ))}
            </div>

            {filters.display_category && subcategories.length > 0 && (
              <>
                <div style={{ height: 1, background: GOLD_DIM, margin: "10px 0", opacity: 0.4 }} />
                <div style={{
                  fontFamily: "var(--font-stencil), monospace",
                  fontSize: 10, letterSpacing: "2.5px", color: SILVER,
                  textTransform: "uppercase", marginBottom: 8,
                }}>
                  Subcategory
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {subcategories.map(sub => (
                    <FilterRow
                      key={sub.name} label={sub.name} count={sub.count} small
                      active={filters.display_subcategory === sub.name}
                      onClick={() => onChange({
                        display_subcategory: filters.display_subcategory === sub.name ? null : sub.name,
                        subcategory_detail: null,
                      })}
                    />
                  ))}
                </div>
              </>
            )}

            {filters.display_subcategory && subcategoryDetails.length > 0 && (
              <>
                <div style={{ height: 1, background: GOLD_DIM, margin: "10px 0", opacity: 0.4 }} />
                <div style={{
                  fontFamily: "var(--font-stencil), monospace",
                  fontSize: 10, letterSpacing: "2.5px", color: SILVER,
                  textTransform: "uppercase", marginBottom: 8,
                }}>
                  Detail
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {subcategoryDetails.map(d => (
                    <FilterRow
                      key={d.name} label={d.name} count={d.count} small
                      active={filters.subcategory_detail === d.name}
                      onClick={() => onChange({
                        subcategory_detail: filters.subcategory_detail === d.name ? null : d.name,
                      })}
                    />
                  ))}
                </div>
              </>
            )}
          </Col>

          {/* ── COL 3: BRAND ────────────────────────────────── */}
          <Col title="Brand">
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {(facets.brands ?? []).slice(0, 30).map(b => (
                <FilterRow
                  key={b.name} label={b.name} count={b.count}
                  active={filters.brand === b.name}
                  onClick={() => onChange({ brand: filters.brand === b.name ? null : b.name })}
                />
              ))}
            </div>
          </Col>

          {/* ── COL 4: REFINE ───────────────────────────────── */}
          <Col title="Refine">
            {/* In Stock toggle */}
            <button
              onClick={() => onChange({ in_stock: !filters.in_stock })}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "8px 0", marginBottom: 16,
                background: "none", border: "none", cursor: "pointer",
              }}
            >
              <span style={{
                fontFamily: "var(--font-body), sans-serif",
                fontSize: 14, fontWeight: 500,
                color: filters.in_stock ? GOLD : SILVER,
                transition: "color 0.15s",
              }}>
                In Stock Only
              </span>
              {/* Toggle track */}
              <span style={{
                width: 36, height: 20, flexShrink: 0,
                background: filters.in_stock ? GOLD : "rgba(112,104,96,0.25)",
                border: `1px solid ${filters.in_stock ? GOLD : GOLD_DIM}`,
                position: "relative", display: "inline-block",
                transition: "background 0.2s, border-color 0.2s",
              }}>
                <span style={{
                  position: "absolute", top: 2,
                  left: filters.in_stock ? 16 : 2,
                  width: 14, height: 14,
                  background: filters.in_stock ? COAL : CHROME,
                  transition: "left 0.2s",
                }} />
              </span>
            </button>

            {/* Price range */}
            <div style={{
              fontFamily: "var(--font-stencil), monospace",
              fontSize: 10, letterSpacing: "2.5px", color: SILVER,
              textTransform: "uppercase", marginBottom: 8,
            }}>
              Price Range
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
              <input
                type="number" placeholder="Min"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                style={{
                  flex: 1, background: COAL,
                  border: `1px solid ${GOLD_DIM}`,
                  color: CREAM, fontFamily: "var(--font-body), sans-serif",
                  fontSize: 13, fontWeight: 500,
                  padding: "9px 10px", outline: "none",
                  width: 0, borderRadius: 0,
                }}
              />
              <span style={{ fontFamily: "var(--font-stencil), monospace", fontSize: 12, color: SILVER }}>—</span>
              <input
                type="number" placeholder="Max"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                style={{
                  flex: 1, background: COAL,
                  border: `1px solid ${GOLD_DIM}`,
                  color: CREAM, fontFamily: "var(--font-body), sans-serif",
                  fontSize: 13, fontWeight: 500,
                  padding: "9px 10px", outline: "none",
                  width: 0, borderRadius: 0,
                }}
              />
            </div>

            {/* Fitment coverage hint */}
            {(filters.family || filters.model) && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                marginBottom: 20, padding: "6px 0",
                borderTop: `1px solid rgba(197,167,34,0.10)`,
                borderBottom: `1px solid rgba(197,167,34,0.10)`,
              }}>
                <span style={{ width: 5, height: 5, background: GOLD, flexShrink: 0, opacity: 0.6 }} />
                <span style={{
                  fontFamily: "var(--font-stencil), monospace",
                  fontSize: 9, color: CHROME,
                  letterSpacing: "0.5px", textTransform: "uppercase",
                }}>
                  Fitment-matched + universal
                </span>
              </div>
            )}

            {/* Clear all */}
            {activeCount > 0 && (
              <button
                onClick={clearAll}
                style={{
                  width: "100%", padding: "9px 0",
                  background: "none",
                  border: `1px solid ${GOLD_DIM}`,
                  color: GOLD,
                  fontFamily: "var(--font-body), sans-serif",
                  fontSize: 13, fontWeight: 600,
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = GOLD_DIM; }}
              >
                Clear All ({activeCount})
              </button>
            )}
          </Col>

        </div>
      </div>

      {/* ── Collapsed pill row — always visible ─────────────── */}
      <div style={{
        height: PILL_H,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 10px",
      }}>

        {/* Toggle button */}
        <button
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close filters" : "Open filters"}
          style={{
            display: "flex", alignItems: "center", gap: 9,
            flexShrink: 0,
            padding: "0 16px",
            height: 36,
            background: isOpen ? GOLD_MUT : "rgba(255,255,255,0.03)",
            border: `1px solid ${isOpen ? GOLD_DIM : STEEL}`,
            color: isOpen ? GOLD : SILVER,
            fontFamily: "var(--font-body), sans-serif",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s, color 0.15s",
          }}
        >
          {/* Hamburger / X icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {isOpen ? (
              <>
                <line x1="2" y1="2" x2="12" y2="12"/>
                <line x1="12" y1="2" x2="2" y2="12"/>
              </>
            ) : (
              <>
                <line x1="1" y1="3.5" x2="13" y2="3.5"/>
                <line x1="1" y1="7"   x2="13" y2="7"/>
                <line x1="1" y1="10.5" x2="13" y2="10.5"/>
              </>
            )}
          </svg>
          <span>Filters</span>
          {activeCount > 0 && (
            <span style={{
              background: GOLD, color: COAL,
              fontFamily: "var(--font-stencil), monospace",
              fontSize: 10, padding: "2px 6px",
              letterSpacing: "0.5px", lineHeight: 1.5,
            }}>
              {activeCount}
            </span>
          )}
        </button>

        {/* Active chips — scrollable strip */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center",
          gap: 6, overflowX: "auto", scrollbarWidth: "none",
          minWidth: 0,
        }}>
          {chips.length === 0 ? (
            <span style={{
              fontFamily: "var(--font-body), sans-serif",
              fontSize: 13, color: CHROME,
              fontWeight: 400,
            }}>
              No filters active
            </span>
          ) : chips.map(chip => (
            <Chip key={chip.key} label={chip.label} onRemove={chip.clear} />
          ))}
        </div>

        {/* Result count — right side */}
        <div style={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 12px",
          borderLeft: `1px solid ${STEEL}`,
          height: 36,
        }}>
          <span style={{
            fontFamily: "var(--font-tanker), sans-serif",
            fontSize: 18, color: GOLD, lineHeight: 1,
            letterSpacing: "0.02em",
          }}>
            {total.toLocaleString()}
          </span>
          <span style={{
            fontFamily: "var(--font-stencil), monospace",
            fontSize: 8, color: CHROME,
            letterSpacing: "2px", textTransform: "uppercase",
            lineHeight: 1.3,
          }}>
            parts
          </span>
        </div>

      </div>
    </nav>
  );
}
