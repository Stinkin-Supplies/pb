// patch_era_hero.js
// Run from project root: node patch_era_hero.js

const fs = require('fs');
const filePath = 'app/era/[slug]/page.jsx';
let src = fs.readFileSync(filePath, 'utf8');

// ── 1. Hero background: #080808 → light gray ──────────────────────────────────
src = src.replace(
  `    position: "relative",
      background: "#080808",
      borderBottom: "1px solid #1c1c1c",
      overflow: "hidden",`,
  `    position: "relative",
      background: "#f0ede8",
      borderBottom: "1px solid #ddd8d0",
      overflow: "hidden",`
);

// ── 2. Flip text colors in hero for light bg ──────────────────────────────────
// Era name color
src = src.replace(
  `fontSize: "clamp(52px, 8vw, 96px)",
            letterSpacing: "0.04em",
            lineHeight: 0.92,
            color: "#e8e2d8",`,
  `fontSize: "clamp(52px, 8vw, 96px)",
            letterSpacing: "0.04em",
            lineHeight: 0.92,
            color: "#111",`
);

// Year range color
src = src.replace(
  `fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
            letterSpacing: "0.2em", color: era.accent, textTransform: "uppercase",
          }}>{era.year_range}</div>`,
  `fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
            letterSpacing: "0.2em", color: era.accent, textTransform: "uppercase",
          }}>{era.year_range}</div>`
);

// Breadcrumb colors: #444 → #888, #2a2a2a → #bbb
src = src.replace(
  `onMouseEnter={e => e.currentTarget.style.color = "#888"}
            onMouseLeave={e => e.currentTarget.style.color = "#444"}
          >Home</Link>
          <span style={{ color: "#2a2a2a", fontSize: 10 }}>›</span>
          <span style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#444", textTransform: "uppercase",
          }}>Eras</span>
          <span style={{ color: "#2a2a2a", fontSize: 10 }}>›</span>`,
  `onMouseEnter={e => e.currentTarget.style.color = "#555"}
            onMouseLeave={e => e.currentTarget.style.color = "#888"}
          >Home</Link>
          <span style={{ color: "#bbb", fontSize: 10 }}>›</span>
          <span style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#888", textTransform: "uppercase",
          }}>Eras</span>
          <span style={{ color: "#bbb", fontSize: 10 }}>›</span>`
);

// Breadcrumb home link color
src = src.replace(
  `letterSpacing: "0.18em", color: "#444", textDecoration: "none",
            textTransform: "uppercase", transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#888"}
            onMouseLeave={e => e.currentTarget.style.color = "#444"}
          >Home`,
  `letterSpacing: "0.18em", color: "#888", textDecoration: "none",
            textTransform: "uppercase", transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = "#555"}
            onMouseLeave={e => e.currentTarget.style.color = "#888"}
          >Home`
);

// Description text color
src = src.replace(
  `fontFamily: "var(--font-stencil, monospace)", fontSize: 12,
            color: "#555", maxWidth: 520, lineHeight: 1.6,
          }}>{era.description}</div>`,
  `fontFamily: "var(--font-stencil, monospace)", fontSize: 12,
            color: "#888", maxWidth: 520, lineHeight: 1.6,
          }}>{era.description}</div>`
);

// ── 3. Remove description block + toolbar from EraHero ────────────────────────
// Remove the motion.div wrapping year_range + description + toolbar
// Find and remove from the motion.div with delay:0.15 down to end of </div> before closing hero div

const removeStart = `        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <div style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 10,
            letterSpacing: "0.2em", color: era.accent, textTransform: "uppercase",
          }}>{era.year_range}</div>
          <div style={{
            fontFamily: "var(--font-stencil, monospace)", fontSize: 12,
            color: "#888", maxWidth: 520, lineHeight: 1.6,
          }}>{era.description}</div>
        </motion.div>`;

const removeEnd_toolbar = `        {/* Toolbar */}
        <div style={{
          marginTop: 32, display: "flex", alignItems: "center",
          gap: 12, flexWrap: "wrap",
        }}>
          {/* Filter button */}
          <motion.button
            whileHover={{ borderColor: era.accent, color: era.accent }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenFilters}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "1px solid #2a2a2a",
              color: "#777", cursor: "pointer", padding: "9px 18px",
              fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
              letterSpacing: "0.18em", textTransform: "uppercase",
              transition: "border-color 0.15s, color 0.15s",
            }}
          >
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M0 1h12M2 5h8M4 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                background: era.accent, color: "#080808",
                borderRadius: "50%", width: 16, height: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700,
              }}>{activeFilterCount}</span>
            )}
          </motion.button>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => onSortChange(e.target.value)}
            style={{
              background: "#0e0e0e", border: "1px solid #2a2a2a",
              color: "#666", fontFamily: "var(--font-stencil, monospace)",
              fontSize: 9, letterSpacing: "0.12em", padding: "9px 14px",
              outline: "none", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Active filter tags */}
          {filters.category && (
            <ActiveTag
              label={ERA_CATEGORIES.find(c => c.slug === filters.category)?.label ?? filters.category}
              onRemove={() => onFilterChange({ category: null })}
              accent={era.accent}
            />
          )}
          {filters.brand && (
            <ActiveTag label={filters.brand} onRemove={() => onFilterChange({ brand: null })} accent={era.accent} />
          )}
          {filters.in_stock && (
            <ActiveTag label="In Stock" onRemove={() => onFilterChange({ in_stock: false })} accent={era.accent} />
          )}

          {/* Count */}
          <div style={{ marginLeft: "auto",
            fontFamily: "var(--font-stencil, monospace)", fontSize: 9,
            letterSpacing: "0.18em", color: "#333", textTransform: "uppercase",
          }}>
            {total.toLocaleString()} parts
          </div>
        </div>`;

if (src.includes(removeStart)) {
  src = src.replace(removeStart, '');
  console.log('✓ Removed description block');
} else {
  console.warn('⚠ Description block not found — may need manual removal');
}

if (src.includes(removeEnd_toolbar)) {
  src = src.replace(removeEnd_toolbar, '');
  console.log('✓ Removed toolbar');
} else {
  console.warn('⚠ Toolbar block not found — may need manual removal');
}

// ── 4. Tab bar: taller + bigger font ──────────────────────────────────────────
src = src.replace(
  `        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        padding: "16px 20px 14px",`,
  `        fontSize: 11,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        padding: "20px 24px 17px",`
);

// ── 5. EraHero — remove unused props (onOpenFilters, sort, onSortChange) ──────
// Update the function signature to remove unused params
src = src.replace(
  'function EraHero({ era, total, onOpenFilters, filters, onFilterChange, sort, onSortChange }) {',
  'function EraHero({ era, total, filters, onFilterChange }) {'
);

// Remove the activeFilterCount calc since we removed the button
src = src.replace(
  `  const activeFilterCount = [
    filters.category, filters.brand, filters.min_price, filters.max_price, filters.in_stock,
  ].filter(Boolean).length;

  return (`,
  '  return ('
);

// ── 6. Noise texture: flip opacity for light bg ───────────────────────────────
src = src.replace(
  `position: "absolute", inset: 0, opacity: 0.03,`,
  `position: "absolute", inset: 0, opacity: 0.015,`
);

// ── 7. Accent stripe stays ────────────────────────────────────────────────────
// Already there, no change needed

// ── 8. Fix EraHero call site — remove unused props ───────────────────────────
src = src.replace(
  `      <EraHero
        era={era}
        total={total}
        onOpenFilters={() => setPanelOpen(true)}
        filters={filters}
        onFilterChange={handleFilterChange}
        sort={sort}
        onSortChange={s => { setSort(s); setPage(1); }}
      />`,
  `      <EraHero
        era={era}
        total={total}
        filters={filters}
        onFilterChange={handleFilterChange}
      />`
);

fs.writeFileSync(filePath, src);
console.log('✅ Era page patched. Run: npm run build && npx vercel --prod');
