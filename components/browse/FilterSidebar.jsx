"use client";
// ============================================================
// components/browse/FilterSidebar.jsx
// Desktop: sticky left column (unchanged)
// Mobile:  bottom sheet — slides up when open=true, mobileSheet=true
// ============================================================

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const GOLD   = "#b8922a";
const CREAM2 = "#f2ede4";
const DARK   = "#0a0909";

const HD_FAMILY_SUBMODELS = {
  Touring: [
    { label: "Road King",      codes: ["FLHR","FLHRC","FLHRCI","FLHRS","FLHRSI","FLHRI","FLHRXS","FLHRSE","FLHRSE3","FLHRSE4","FLHRSE5","FLHRSE6","FLHRSEI","FLHRSEI2","FLHRXI"] },
    { label: "Road Glide",     codes: ["FLTR","FLTRI","FLTRX","FLTRXS","FLTRXST","FLTRU","FLTRXL","FLTRK","FLTRXP","FLTRXRRSE","FLTRSE","FLTRSE3","FLTRSEI","FLTRSEI2","FLTRXSE","FLTRXSE2","FLTRKSE","FLTRUSE","FLTRXSTSE"] },
    { label: "Street Glide",   codes: ["FLHX","FLHXI","FLHXS","FLHXST","FLHXU","FLHXL","FLHXSE","FLHXSE2","FLHXSE3","FLHXLSE","FLHXSTSE"] },
    { label: "Electra Glide",  codes: ["FL","FLH","FLI","FLHT","FLHTI","FLHS","FLHP","FLHTP","FLHTPI","FLHB","FLHF","FLHTC","FLHTCI","FLHFB","FLHTCSE","FLHTCSE2","FLHTKSE"] },
    { label: "Ultra Classic",  codes: ["FLHTCU","FLHTCUI","FLHTCUL","FLHTCUTC","FLHTK","FLHTKL","FLHTCUSE","FLHTCUSE2","FLHTCUSE3","FLHTCUSE4","FLHTCUSE5","FLHTCUSE6","FLHTCUSE7","FLHTCUSE8"] },
    { label: "Tour Glide",     codes: ["FLT","FLTC","FLTCU","FLTCUI"] },
  ],
  Softail: [
    { label: "Fat Boy",        codes: ["FLSTF","FLSTFI","FLSTFSE","FLSTFSE2","FLFB","FLFBS"] },
    { label: "Heritage",       codes: ["FLST","FLSTC","FLSTCI","FLSTN","FLSTNI","FLSTNSE","FLSTS","FLSTSI"] },
    { label: "Springer",       codes: ["FXSTS","FXSTSI","FXSTSB","FLSTS","FLSTSI","FLSTSB","FLSTSBE"] },
    { label: "Slim",           codes: ["FLS","FLSS","FLSB"] },
    { label: "Deluxe",         codes: ["FLSTN","FLSTNI","FLDE"] },
    { label: "Breakout",       codes: ["FXSB","FXSBSE","FXBR","FXBRS","FXSE"] },
    { label: "Night Train",    codes: ["FXSTB","FXSTBI"] },
    { label: "Deuce",          codes: ["FXSTD","FXSTDI"] },
    { label: "Softail Standard", codes: ["FXST","FXSTI","FXSTC","FXSTCI"] },
    { label: "Blackline / Low Rider S", codes: ["FXS","FXLR","FXLRS","FXLRST"] },
    { label: "Bad Boy",        codes: ["FXSTSB"] },
  ],
  Dyna: [
    { label: "Fat Bob",        codes: ["FXDF","FXDFI","FXDFSE","FXDFSE2"] },
    { label: "Wide Glide",     codes: ["FXDWG","FXDWGI","FXDWG2","FXDWG3"] },
    { label: "Super Glide",    codes: ["FXD","FXDI","FXDI35","FXDSE","FXDSE2"] },
    { label: "Low Rider",      codes: ["FXDL","FXDLI","FXDLS","FXDRS"] },
    { label: "Street Bob",     codes: ["FXDB","FXDBI"] },
    { label: "Super Glide Sport", codes: ["FXDX","FXDXI","FXDXT"] },
    { label: "Super Glide Custom", codes: ["FXDC","FXDCI"] },
    { label: "Switchback",     codes: ["FLD"] },
    { label: "Convertible",    codes: ["FXDS","FXDS-CONV"] },
  ],
  Sportster: [
    { label: "Iron 883",       codes: ["XL883N"] },
    { label: "Iron 1200",      codes: ["XL1200NS"] },
    { label: "1200 Custom",    codes: ["XL1200C","XLH1200C"] },
    { label: "1200 Sport",     codes: ["XL1200S"] },
    { label: "1200 Roadster",  codes: ["XL1200R","XL1200CX"] },
    { label: "Forty-Eight",    codes: ["XL1200X","XL1200XS"] },
    { label: "Seventy-Two",    codes: ["XL1200V"] },
    { label: "Nightster",      codes: ["XL1200N"] },
    { label: "SuperLow",       codes: ["XL883L","XL1200L","XL1200T"] },
    { label: "883 Custom",     codes: ["XL883C","XLH883C"] },
    { label: "883 / 1200",     codes: ["XL883","XLH883","XL1200","XLH1200","XLH","XLH1000","XLH1100","XLH900"] },
    { label: "K / KH Models",  codes: ["K","KK","KH","KHK","KR"] },
    { label: "Cafe Racer",     codes: ["XLCR"] },
    { label: "XR Models",      codes: ["XR1000","XR1200","XR1200X","XR750"] },
  ],
  FXR: [
    { label: "Super Glide II", codes: ["FXR","FXRS","FXRT","FXRD","FXRDG","FXRC"] },
    { label: "Low Rider",      codes: ["FXRS","FXLR"] },
    { label: "Sport Glide",    codes: ["FXRT","FXRD"] },
    { label: "Convertible",    codes: ["FXRS-CONV"] },
  ],
};

const HD_FAMILIES_FLAT = [
  "Touring","Softail","Dyna","Sportster","FXR",
  "Trike","Revolution Max","V-Rod","Street",
  "Twin Cam","Evolution","Shovelhead","Flathead","Knucklehead","Panhead",
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

// ── Shared sub-components ─────────────────────────────────────

function FilterItem({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", background: active ? "rgba(184,146,42,0.08)" : "none",
        border: "none", padding: "7px 8px", cursor: "pointer", gap: "8px",
        borderRadius: 2, transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
        <div style={{ width: 10, height: 10, border: `1px solid ${active ? GOLD : "rgba(184,146,42,0.25)"}`, background: active ? GOLD : "transparent", flexShrink: 0, transition: "background 0.15s, border-color 0.15s" }} />
        <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "10px", color: active ? DARK : "#888", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}>
          {label}
        </span>
      </div>
      {count != null && (
        <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "8px", color: "#bbb", flexShrink: 0 }}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

// ── The filter content (shared between desktop sidebar + mobile sheet) ────────

function FilterContent({ facets, filters, onChange, sections, setSections, collapsed = false }) {
  function toggle(key) { setSections(s => ({ ...s, [key]: !s[key] })); }

  const subcategories = facets.subcategories ?? [];
  const activeCount = [filters.family, filters.model, filters.era, filters.category, filters.brand, filters.min_price, filters.max_price, filters.in_stock].filter(Boolean).length;

  const sectionDefs = [
    {
      key: "family",
      label: "Model Family",
      content: (
        <div style={{ paddingBottom: 8, maxHeight: 320, overflowY: "auto" }}>
          {HD_FAMILIES_FLAT.map(fam => (
            <div key={fam}>
              <FilterItem
                label={fam} count={null}
                active={filters.family === fam}
                onClick={() => onChange({ family: filters.family === fam ? null : fam, model: null })}
              />
              {filters.family === fam && HD_FAMILY_SUBMODELS[fam] && (
                <div style={{ paddingLeft: 18, borderLeft: `2px solid rgba(184,146,42,0.2)`, marginLeft: 8, marginBottom: 4 }}>
                  {HD_FAMILY_SUBMODELS[fam].map(sub => (
                    <button
                      key={sub.label}
                      onClick={e => { e.stopPropagation(); onChange({ model: filters.model === sub.label ? null : sub.label, modelCodes: filters.model === sub.label ? null : sub.codes }); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: filters.model === sub.label ? "rgba(184,146,42,0.1)" : "none", border: "none", padding: "5px 8px", cursor: "pointer", borderRadius: 2 }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: filters.model === sub.label ? GOLD : "rgba(184,146,42,0.3)", transition: "background 0.15s" }} />
                      <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 9, color: filters.model === sub.label ? DARK : "#888", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "left" }}>
                        {sub.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "era",
      label: "Era",
      content: (
        <div style={{ paddingBottom: 8 }}>
          {HD_ERAS.map(era => (
            <button
              key={era.slug}
              onClick={() => onChange({ era: filters.era === era.slug ? null : era.slug })}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: filters.era === era.slug ? "rgba(184,146,42,0.08)" : "none", border: "none", padding: "7px 8px", cursor: "pointer", gap: 8, borderRadius: 2 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div style={{ width: 10, height: 10, flexShrink: 0, border: `1px solid ${filters.era === era.slug ? GOLD : "rgba(184,146,42,0.25)"}`, background: filters.era === era.slug ? GOLD : "transparent", transition: "all 0.15s" }} />
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 10, color: filters.era === era.slug ? DARK : "#888", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "left" }}>
                  {era.label}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: 8, color: "#bbb", flexShrink: 0 }}>{era.years}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      content: (
        <div style={{ paddingBottom: 8, maxHeight: 260, overflowY: "auto" }}>
          {facets.categories.slice(0, 20).map(cat => (
            <FilterItem
              key={cat.name} label={cat.name} count={cat.count}
              active={filters.category === cat.name}
              onClick={() => onChange({ category: filters.category === cat.name ? null : cat.name, subcategory: null })}
            />
          ))}
        </div>
      ),
    },
    ...(filters.category && subcategories.length > 0 ? [{
      key: "subcategory",
      label: "Subcategory",
      content: (
        <div style={{ paddingBottom: 8, maxHeight: 200, overflowY: "auto" }}>
          {subcategories.map(sub => (
            <FilterItem
              key={sub.name} label={sub.name} count={sub.count}
              active={filters.subcategory === sub.name}
              onClick={() => onChange({ subcategory: filters.subcategory === sub.name ? null : sub.name })}
            />
          ))}
        </div>
      ),
    }] : []),
    {
      key: "brand",
      label: "Brand",
      content: (
        <div style={{ paddingBottom: 8, maxHeight: 240, overflowY: "auto" }}>
          {facets.brands.slice(0, 25).map(b => (
            <FilterItem
              key={b.name} label={b.name} count={b.count}
              active={filters.brand === b.name}
              onClick={() => onChange({ brand: filters.brand === b.name ? null : b.name })}
            />
          ))}
        </div>
      ),
    },
    {
      key: "price",
      label: "Price",
      content: (
        <div style={{ padding: "8px 14px 14px", display: "flex", gap: 8 }}>
          <input type="number" placeholder="Min" value={filters.min_price ?? ""} onChange={e => onChange({ min_price: e.target.value || null })}
            style={{ flex: 1, background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, color: DARK, fontFamily: "var(--font-stencil, monospace)", fontSize: 11, padding: "7px 10px", outline: "none" }} />
          <input type="number" placeholder="Max" value={filters.max_price ?? ""} onChange={e => onChange({ max_price: e.target.value || null })}
            style={{ flex: 1, background: "#fff", border: `1px solid rgba(184,146,42,0.3)`, color: DARK, fontFamily: "var(--font-stencil, monospace)", fontSize: 11, padding: "7px 10px", outline: "none" }} />
        </div>
      ),
    },
  ];

  return (
    <>
      {/* In Stock toggle */}
      <div
        onClick={() => onChange({ in_stock: !filters.in_stock })}
        style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "10px 0" : "10px 14px",
          cursor: "pointer", borderBottom: `1px solid rgba(184,146,42,0.12)`,
          background: filters.in_stock ? "rgba(184,146,42,0.08)" : "none",
        }}
      >
        {collapsed ? (
          <span style={{ fontSize: 14, color: filters.in_stock ? GOLD : "#aaa" }} title="In Stock Only">●</span>
        ) : (
          <>
            <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: filters.in_stock ? GOLD : "#888" }}>
              In Stock
            </span>
            <motion.div
              animate={{ background: filters.in_stock ? GOLD : "rgba(184,146,42,0.15)" }}
              style={{ width: 32, height: 18, borderRadius: 9, position: "relative", flexShrink: 0, cursor: "pointer" }}
            >
              <motion.div
                animate={{ x: filters.in_stock ? 15 : 2 }}
                style={{ position: "absolute", top: 2, width: 14, height: 14, borderRadius: "50%", background: "#fff" }}
              />
            </motion.div>
          </>
        )}
      </div>

      {/* Collapsible sections */}
      {sectionDefs.map(({ key, label, content }) => (
        <div key={key} style={{ borderBottom: `1px solid rgba(184,146,42,0.12)` }}>
          <button
            onClick={() => collapsed ? undefined : toggle(key)}
            style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", width: "100%", background: "none", border: "none", padding: collapsed ? "12px 0" : "11px 14px", cursor: "pointer" }}
            title={collapsed ? label : undefined}
          >
            {collapsed ? (
              <span style={{ fontSize: 12, color: "#aaa", fontFamily: "var(--font-stencil, monospace)", letterSpacing: "1px" }}>—</span>
            ) : (
              <>
                <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: sections[key] ? GOLD : "#888", transition: "color 0.15s" }}>
                  {label}
                </span>
                <motion.span animate={{ rotate: sections[key] ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ color: "#bbb", fontSize: 10, display: "block" }}>▼</motion.span>
              </>
            )}
          </button>
          <AnimatePresence initial={false}>
            {!collapsed && sections[key] && (
              <motion.div
                key="content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                style={{ overflow: "hidden" }}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* Clear all */}
      {!collapsed && activeCount > 0 && (
        <div style={{ padding: "12px 14px" }}>
          <button
            onClick={() => onChange({ family: null, model: null, modelCodes: null, era: null, category: null, brand: null, min_price: null, max_price: null, in_stock: false, subcategory: null })}
            style={{ width: "100%", background: "none", border: `1px solid rgba(184,146,42,0.3)`, color: GOLD, fontFamily: "var(--font-stencil, monospace)", fontSize: "8px", letterSpacing: "2px", padding: "7px", cursor: "pointer", textTransform: "uppercase" }}
          >
            Clear All Filters
          </button>
        </div>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────

export default function FilterSidebar({ facets, filters, onChange, open, onClose, mobileSheet = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState({
    family: true, era: false, category: false, subcategory: false, brand: false, price: false,
  });

  useEffect(() => {
    if (filters.category) setSections(s => ({ ...s, subcategory: true }));
  }, [filters.category]);

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (!mobileSheet) return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open, mobileSheet]);

  const activeCount = [filters.family, filters.model, filters.era, filters.category, filters.brand, filters.min_price, filters.max_price, filters.in_stock].filter(Boolean).length;

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
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300 }}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 301,
                background: CREAM2,
                borderRadius: "16px 16px 0 0",
                maxHeight: "82vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
              }}
            >
              {/* Handle + header */}
              <div style={{ padding: "12px 16px 10px", flexShrink: 0 }}>
                {/* Drag handle */}
                <div style={{ width: 36, height: 4, background: "rgba(184,146,42,0.3)", borderRadius: 2, margin: "0 auto 12px" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "3px", color: GOLD, textTransform: "uppercase" }}>
                    FILTER {activeCount > 0 && (
                      <span style={{ background: GOLD, color: "#fff", padding: "1px 5px", borderRadius: 2, marginLeft: 4, fontSize: 8 }}>{activeCount}</span>
                    )}
                  </span>
                  <button
                    onClick={onClose}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}
                  >×</button>
                </div>
              </div>

              {/* Scrollable filter content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "0 2px 100px" }}>
                <FilterContent
                  facets={facets}
                  filters={filters}
                  onChange={(updates) => { onChange(updates); }}
                  sections={sections}
                  setSections={setSections}
                  collapsed={false}
                />
              </div>

              {/* Apply button */}
              <div style={{ padding: "12px 16px 28px", flexShrink: 0, borderTop: `1px solid rgba(184,146,42,0.15)`, background: CREAM2 }}>
                <button
                  onClick={onClose}
                  style={{ width: "100%", height: 46, background: GOLD, border: "none", color: "#fff", fontFamily: "var(--font-stencil, monospace)", fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase", cursor: "pointer", borderRadius: 3 }}
                >
                  Show Results
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
        borderRight: `1px solid rgba(184,146,42,0.2)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        width: collapsed ? 48 : 220,
        transition: "width 0.25s ease",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "16px 0" : "16px 14px 12px",
        borderBottom: `1px solid rgba(184,146,42,0.15)`,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <span style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "9px", letterSpacing: "3px", color: GOLD }}>
            FILTER {activeCount > 0 && (
              <span style={{ background: GOLD, color: "#fff", padding: "1px 5px", borderRadius: 2, marginLeft: 4, fontSize: 8 }}>{activeCount}</span>
            )}
          </span>
        )}
        {collapsed && activeCount > 0 && (
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD }} />
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: collapsed ? "8px 0" : "8px 0 80px" }}>
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
      <motion.button
        layout
        onClick={() => setCollapsed(c => !c)}
        style={{ display: "flex", alignItems: "center", padding: "12px 14px", background: "none", border: "none", borderTop: `1px solid rgba(184,146,42,0.15)`, cursor: "pointer", width: "100%", flexShrink: 0 }}
      >
        <motion.div layout style={{ display: "grid", placeContent: "center", width: 20, height: 20 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <motion.path
              animate={{ d: collapsed ? "M4 2 L10 7 L4 12" : "M10 2 L4 7 L10 12" }}
              stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              transition={{ duration: 0.2 }}
            />
          </svg>
        </motion.div>
        {!collapsed && (
          <motion.span
            layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            style={{ fontFamily: "var(--font-stencil, monospace)", fontSize: "8px", letterSpacing: "2px", color: "#aaa", marginLeft: 8, textTransform: "uppercase" }}
          >
            Hide
          </motion.span>
        )}
      </motion.button>
    </motion.nav>
  );
}
