"use client";
// ============================================================
// components/browse/FilterSidebar.jsx
// Desktop: sticky left column — collapsible
// Mobile:  bottom sheet — slides up when open=true, mobileSheet=true
// ============================================================

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Debounce search input so we don't hit Typesense on every keystroke
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Palette ───────────────────────────────────────────────────
const GOLD   = "#b8922a";
const GOLD_L = "rgba(184,146,42,0.12)";
const GOLD_B = "rgba(184,146,42,0.25)";
const CREAM  = "#faf7f2";
const CREAM2 = "#f2ede4";
const DARK   = "#0a0909";
const MUTED  = "#888";

// ── Static data ───────────────────────────────────────────────

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

// ── Micro-components ──────────────────────────────────────────

function Checkbox({ active }) {
  return (
    <motion.div
      animate={{ background: active ? GOLD : "rgba(0,0,0,0)", borderColor: active ? GOLD : GOLD_B }}
      transition={{ duration: 0.12 }}
      style={{
        width: 13, height: 13,
        borderWidth: "1.5px", borderStyle: "solid", borderColor: active ? GOLD : GOLD_B,
        flexShrink: 0, display: "grid", placeContent: "center",
      }}
    >
      {active && (
        <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
          <path d="M1 3L2.8 5L6 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </motion.div>
  );
}

function FilterRow({ label, count, active, onClick, indent = false }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ background: active ? GOLD_L : "rgba(184,146,42,0.04)" }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: active ? GOLD_L : "transparent",
        border: "none", padding: indent ? "5px 14px 5px 28px" : "6px 14px",
        cursor: "pointer", gap: 8, textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <Checkbox active={active} />
        <span style={{
          fontFamily: "var(--font-stencil, monospace)", fontSize: indent ? 11 : 12,
          color: active ? DARK : MUTED, textTransform: "uppercase",
          letterSpacing: "0.6px", whiteSpace: "nowrap", overflow: "hidden",
          textOverflow: "ellipsis", lineHeight: 1.3,
        }}>
          {label}
        </span>
      </div>
      {count != null && (
        <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 10, color: "#ccc", flexShrink: 0 }}>
          {count.toLocaleString()}
        </span>
      )}
    </motion.button>
  );
}

// Gold pill for active filter chips at top of sidebar
function ActiveChip({ label, onRemove }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: GOLD_L, border: `1px solid ${GOLD_B}`,
      padding: "3px 6px 3px 8px", borderRadius: 2,
    }}>
      <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px" }}>
        {label}
      </span>
      <button
        onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", color: GOLD, fontSize: 13, lineHeight: 1, padding: "0 1px", display: "flex", alignItems: "center" }}
      >×</button>
    </div>
  );
}

// Collapsible section wrapper
function Section({ label, sectionKey, open, onToggle, children, hasActive = false, collapsed = false }) {
  return (
    <div style={{ borderBottom: `1px solid rgba(184,146,42,0.1)` }}>
      <button
        onClick={() => !collapsed && onToggle(sectionKey)}
        title={collapsed ? label : undefined}
        style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          width: "100%", background: "none", border: "none",
          padding: collapsed ? "13px 0" : "10px 14px",
          cursor: "pointer",
        }}
      >
        {collapsed ? (
          <span style={{
            fontSize: 9, fontFamily: "var(--font-stencil, monospace)",
            color: hasActive ? GOLD : "#bbb", letterSpacing: "1px",
            writingMode: "vertical-rl", transform: "rotate(180deg)",
          }}>
            {label.slice(0,3)}
          </span>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: "var(--font-stencil, monospace)", fontSize: 11,
                letterSpacing: "2.5px", textTransform: "uppercase",
                color: open || hasActive ? GOLD : "#999",
                transition: "color 0.15s",
              }}>
                {label}
              </span>
              {hasActive && !open && (
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD }} />
              )}
            </div>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.18 }}
              style={{ color: open ? GOLD : "#ccc", fontSize: 10, display: "block", lineHeight: 1 }}
            >▼</motion.span>
          </>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── FilterContent (shared between desktop + mobile) ───────────

function FilterContent({ facets, filters, onChange, sections, setSections, collapsed = false }) {
  function toggle(key) { setSections(s => ({ ...s, [key]: !s[key] })); }

  const subcategories = facets.subcategories ?? [];

  // ── Search input (controlled locally, synced to filters.search) ──────────
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const debouncedSearch = useDebounce(searchInput, 320);

  // Push debounced value up to browse page
  useEffect(() => {
    const v = debouncedSearch.trim();
    const current = filters.search ?? "";
    if (v !== current) onChange({ search: v || null });
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local input when filter is cleared externally (chip × or clear-all)
  useEffect(() => {
    if (!filters.search && searchInput) setSearchInput("");
  }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAll = () => {
    setSearchInput("");
    onChange({ family: null, model: null, modelCodes: null, year: null, era: null, display_category: null, display_subcategory: null, brand: null, min_price: null, max_price: null, in_stock: false, search: null });
  };

  // Active filter chips
  const chips = [
    filters.search     && { key: "search",   label: `"${filters.search}"`,             clear: () => { setSearchInput(""); onChange({ search: null }); } },
    filters.family     && { key: "family",   label: filters.family,                    clear: () => onChange({ family: null, model: null, modelCodes: null, year: null }) },
    filters.year       && { key: "year",     label: String(filters.year),              clear: () => onChange({ year: null }) },
    filters.model      && { key: "model",    label: filters.model,                     clear: () => onChange({ model: null, modelCodes: null }) },
    filters.era        && { key: "era",      label: filters.era.replace(/-/g," "),     clear: () => onChange({ era: null }) },
    filters.display_category && { key: "cat",    label: filters.display_category,      clear: () => onChange({ display_category: null, display_subcategory: null }) },
    filters.display_subcategory && { key: "subcat", label: filters.display_subcategory, clear: () => onChange({ display_subcategory: null }) },
    filters.brand      && { key: "brand",    label: filters.brand,                     clear: () => onChange({ brand: null }) },
    filters.in_stock   && { key: "stock",    label: "In Stock",                        clear: () => onChange({ in_stock: false }) },
    (filters.min_price || filters.max_price) && { key: "price", label: `$${filters.min_price||0}–$${filters.max_price||"∞"}`, clear: () => onChange({ min_price: null, max_price: null }) },
  ].filter(Boolean);

  const activeCount = chips.length;

  return (
    <>
      {/* Search box — hidden in collapsed mode (sidebar too narrow) */}
      {!collapsed && (
        <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid rgba(184,146,42,0.1)` }}>
          <div style={{
            display: "flex", alignItems: "center",
            border: `1.5px solid ${searchInput ? GOLD_B : "rgba(184,146,42,0.15)"}`,
            background: "rgba(255,255,255,0.45)",
            padding: "0 8px 0 10px", gap: 6,
            transition: "border-color 0.18s",
          }}>
            {/* Search icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={searchInput ? GOLD : MUTED} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: "stroke 0.15s" }}>
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="22" y2="22" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search parts, OEM#…"
              style={{
                flex: 1, border: "none", outline: "none",
                background: "transparent",
                fontSize: 11, fontFamily: "var(--font-stencil, monospace)",
                letterSpacing: "0.5px", color: DARK,
                padding: "8px 0",
              }}
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(""); onChange({ search: null }); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#bbb", padding: "0 1px", fontSize: 15,
                  lineHeight: 1, display: "flex", alignItems: "center",
                }}
              >×</button>
            )}
          </div>
        </div>
      )}

      {/* Active filter chips — only when not collapsed */}
      {!collapsed && activeCount > 0 && (
        <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid rgba(184,146,42,0.1)`, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {chips.map(chip => (
            <ActiveChip key={chip.key} label={chip.label} onRemove={chip.clear} />
          ))}
          <button
            onClick={clearAll}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#bbb", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 4px" }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Fitment coverage hint — shown when bike context is active */}
      {!collapsed && (filters.family || filters.model) && (
        <div style={{ padding: "5px 14px 6px", borderBottom: `1px solid rgba(184,146,42,0.08)`, display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0, opacity: 0.6 }} />
          <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: "#aaa", letterSpacing: "0.6px", textTransform: "uppercase" }}>
            Fitment-matched + universal parts
          </span>
        </div>
      )}

      {/* In Stock toggle */}
      <div
        onClick={() => onChange({ in_stock: !filters.in_stock })}
        style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "11px 0" : "9px 14px",
          cursor: "pointer",
          borderBottom: `1px solid rgba(184,146,42,0.1)`,
          background: filters.in_stock ? GOLD_L : "transparent",
          transition: "background 0.15s",
        }}
      >
        {collapsed ? (
          <span style={{ fontSize: 12, color: filters.in_stock ? GOLD : "#bbb" }} title="In Stock Only">◉</span>
        ) : (
          <>
            <span style={{
              fontFamily: "var(--font-stencil, monospace)", fontSize: 11,
              letterSpacing: "2px", textTransform: "uppercase",
              color: filters.in_stock ? GOLD : "#999",
            }}>
              In Stock
            </span>
            {/* Pill toggle */}
            <motion.div
              animate={{ background: filters.in_stock ? GOLD : "rgba(184,146,42,0.15)" }}
              style={{ width: 34, height: 18, borderRadius: 9, position: "relative", flexShrink: 0 }}
            >
              <motion.div
                animate={{ x: filters.in_stock ? 17 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                style={{ position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
              />
            </motion.div>
          </>
        )}
      </div>

      {/* Category */}
      <Section label="Category" sectionKey="category" open={sections.category} onToggle={toggle}
        hasActive={!!filters.display_category} collapsed={collapsed}>
        <div style={{ paddingBottom: 6, maxHeight: 260, overflowY: "auto" }}>
          {facets.categories.slice(0, 30).map(cat => (
            <FilterRow
              key={cat.name} label={cat.name} count={cat.count}
              active={filters.display_category === cat.name}
              onClick={() => onChange({ display_category: filters.display_category === cat.name ? null : cat.name, display_subcategory: null })}
            />
          ))}
        </div>
      </Section>

      {/* Subcategory — only when a category is active and subcats exist */}
      {filters.display_category && subcategories.length > 0 && (
        <Section label="Subcategory" sectionKey="subcategory" open={sections.subcategory} onToggle={toggle}
          hasActive={!!filters.display_subcategory} collapsed={collapsed}>
          <div style={{ paddingBottom: 6, maxHeight: 200, overflowY: "auto" }}>
            {subcategories.map(sub => (
              <FilterRow
                key={sub.name} label={sub.name} count={sub.count}
                active={filters.display_subcategory === sub.name}
                onClick={() => onChange({ display_subcategory: filters.display_subcategory === sub.name ? null : sub.name })}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Engine Era */}
      <Section label="Engine Era" sectionKey="era" open={sections.era} onToggle={toggle}
        hasActive={!!filters.era} collapsed={collapsed}>
        <div style={{ paddingBottom: 6 }}>
          {HD_ERAS.map(era => (
            <motion.button
              key={era.slug}
              onClick={() => onChange({ era: filters.era === era.slug ? null : era.slug })}
              whileHover={{ background: filters.era === era.slug ? GOLD_L : "rgba(184,146,42,0.04)" }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: filters.era === era.slug ? GOLD_L : "transparent",
                border: "none", padding: "6px 14px", cursor: "pointer", gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Checkbox active={filters.era === era.slug} />
                <span style={{
                  fontFamily: "var(--font-stencil, monospace)", fontSize: 12,
                  color: filters.era === era.slug ? DARK : MUTED,
                  textTransform: "uppercase", letterSpacing: "0.6px",
                }}>
                  {era.label}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 10, color: "#ccc", flexShrink: 0 }}>
                {era.years}
              </span>
            </motion.button>
          ))}
        </div>
      </Section>

      {/* Brand */}
      {facets.brands?.length > 0 && (
        <Section label="Brand" sectionKey="brand" open={sections.brand} onToggle={toggle}
          hasActive={!!filters.brand} collapsed={collapsed}>
          <div style={{ paddingBottom: 6, maxHeight: 240, overflowY: "auto" }}>
            {facets.brands.slice(0, 25).map(b => (
              <FilterRow
                key={b.name} label={b.name} count={b.count}
                active={filters.brand === b.name}
                onClick={() => onChange({ brand: filters.brand === b.name ? null : b.name })}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Price */}
      <Section label="Price" sectionKey="price" open={sections.price} onToggle={toggle}
        hasActive={!!(filters.min_price || filters.max_price)} collapsed={collapsed}>
        <div style={{ padding: "8px 14px 14px", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number" placeholder="Min" value={filters.min_price ?? ""}
            onChange={e => onChange({ min_price: e.target.value ? parseFloat(e.target.value) : null })}
            style={{
              flex: 1, background: "#fff", border: `1px solid ${GOLD_B}`,
              color: DARK, fontFamily: "var(--font-stencil, monospace)",
              fontSize: 11, padding: "7px 10px", outline: "none", width: 0,
            }}
          />
          <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 10, color: "#ccc" }}>—</span>
          <input
            type="number" placeholder="Max" value={filters.max_price ?? ""}
            onChange={e => onChange({ max_price: e.target.value ? parseFloat(e.target.value) : null })}
            style={{
              flex: 1, background: "#fff", border: `1px solid ${GOLD_B}`,
              color: DARK, fontFamily: "var(--font-stencil, monospace)",
              fontSize: 11, padding: "7px 10px", outline: "none", width: 0,
            }}
          />
        </div>
      </Section>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────

export default function FilterSidebar({ facets, filters, onChange, open, onClose, mobileSheet = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState({
    category: true,
    subcategory: false,
    era: false,
    brand: false,
    price: false,
  });

  // Auto-open subcategory section when a category is selected
  useEffect(() => {
    if (filters.display_category) setSections(s => ({ ...s, subcategory: true }));
  }, [filters.display_category]);

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (!mobileSheet) return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open, mobileSheet]);

  const activeCount = [
    filters.search, filters.family, filters.model, filters.year,
    filters.era, filters.display_category,
    filters.brand, filters.min_price, filters.max_price, filters.in_stock,
  ].filter(Boolean).length;

  // ── Mobile bottom sheet ───────────────────────────────────────
  if (mobileSheet) {
    return (
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              style={{ position: "fixed", inset: 0, background: "#000", zIndex: 300 }}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 42 }}
              style={{
                position: "fixed",
                bottom: 0, left: 0, right: 0,
                zIndex: 301,
                background: CREAM2,
                borderRadius: "18px 18px 0 0",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 -12px 48px rgba(0,0,0,0.2)",
              }}
            >
              {/* Drag handle + header */}
              <div style={{ padding: "10px 16px 8px", flexShrink: 0, borderBottom: `1px solid rgba(184,146,42,0.12)` }}>
                <div style={{ width: 40, height: 4, background: GOLD_B, borderRadius: 2, margin: "0 auto 10px" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
                      letterSpacing: "3px", color: GOLD, textTransform: "uppercase",
                    }}>
                      Filters
                    </span>
                    {activeCount > 0 && (
                      <span style={{
                        background: GOLD, color: "#fff", fontFamily: "var(--font-stencil, monospace)",
                        fontSize: 9, padding: "2px 6px", borderRadius: 2, letterSpacing: "0.5px",
                      }}>
                        {activeCount} active
                      </span>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: "4px 6px", fontSize: 20, lineHeight: 1 }}
                  >×</button>
                </div>
              </div>

              {/* Scrollable content */}
              <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
                <FilterContent
                  facets={facets}
                  filters={filters}
                  onChange={(updates) => { onChange(updates); }}
                  sections={sections}
                  setSections={setSections}
                  collapsed={false}
                />
              </div>

              {/* Footer: clear + apply */}
              <div style={{
                padding: "12px 16px 28px", flexShrink: 0,
                borderTop: `1px solid rgba(184,146,42,0.12)`,
                background: CREAM2,
                display: "flex", gap: 10,
              }}>
                {activeCount > 0 && (
                  <button
                    onClick={() => onChange({ family: null, model: null, modelCodes: null, year: null, era: null, display_category: null, display_subcategory: null, brand: null, min_price: null, max_price: null, in_stock: false, search: null })}
                    style={{
                      flex: "0 0 auto", height: 46, background: "none",
                      border: `1.5px solid ${GOLD_B}`, color: GOLD,
                      fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
                      letterSpacing: "2px", textTransform: "uppercase",
                      cursor: "pointer", borderRadius: 3, padding: "0 16px",
                    }}
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, height: 46, background: GOLD, border: "none",
                    color: "#fff", fontFamily: "var(--font-stencil, monospace)",
                    fontSize: 10, letterSpacing: "3px", textTransform: "uppercase",
                    cursor: "pointer", borderRadius: 3,
                  }}
                >
                  {activeCount > 0 ? `Show Results` : "Done"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // ── Desktop sticky sidebar ────────────────────────────────────
  return (
    <motion.nav
      layout
      style={{
        position: "sticky",
        top: 0,
        height: "100vh",
        background: CREAM2,
        borderRight: `1px solid rgba(184,146,42,0.18)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        width: collapsed ? 42 : 236,
        transition: "width 0.22s ease",
        zIndex: 10,
      }}
    >
      {/* Sidebar header */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "14px 0" : "14px 14px 10px",
        borderBottom: `1px solid rgba(184,146,42,0.12)`,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <span style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "3px", color: GOLD, textTransform: "uppercase",
          }}>
            Filters {activeCount > 0 && (
              <span style={{ background: GOLD, color: "#fff", padding: "1px 5px", borderRadius: 2, marginLeft: 4, fontSize: 8 }}>
                {activeCount}
              </span>
            )}
          </span>
        )}
        {collapsed && activeCount > 0 && (
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD }} />
        )}
      </div>

      {/* Scrollable filter content */}
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        padding: collapsed ? "4px 0" : 0,
        scrollbarWidth: "none",
      }}>
        <FilterContent
          facets={facets}
          filters={filters}
          onChange={onChange}
          sections={sections}
          setSections={setSections}
          collapsed={collapsed}
        />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center",
          padding: collapsed ? "12px 0" : "11px 14px",
          background: "none", border: "none",
          borderTop: `1px solid rgba(184,146,42,0.12)`,
          cursor: "pointer", width: "100%", flexShrink: 0,
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 8,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d={collapsed ? "M4 2 L10 7 L4 12" : "M10 2 L4 7 L10 12"}
            stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        {!collapsed && (
          <span style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
            letterSpacing: "2px", color: "#bbb", textTransform: "uppercase",
          }}>
            Collapse
          </span>
        )}
      </button>
    </motion.nav>
  );
}
