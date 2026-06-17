'use client';
// components/browse/VariantSelector.jsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#b8922a';
const BORDER = '#e0d8c8';
const DARK   = '#2a1f0e';
const CREAM  = '#fdfaf5';
const CREAM2 = '#f5f0e8';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractGaugeTab(displayName) {
  const m = displayName?.match(/(\d+)\s*Gauge/i);
  if (m) return `${m[1]}g`;
  if (/OEM/i.test(displayName)) return 'OEM';
  const parts = displayName?.split(' - ');
  const last = parts?.[parts.length - 1] ?? displayName;
  return last.length > 8 ? last.slice(0, 6) + '…' : last;
}

function extractBaseName(displayName) {
  return displayName?.replace(/\s*-\s*\d+\s*Gauge\s*$/i, '').trim() ?? displayName;
}

function makeShortLabel(name, groupDisplayName) {
  if (!name) return name;
  if (!groupDisplayName) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s\-–]+/g, ' ').trim();
  const grp = norm(groupDisplayName);
  const nm  = norm(name);
  if (nm.startsWith(grp)) {
    const stripped = name.slice(groupDisplayName.length).replace(/^[\s\-–]+/, '').trim();
    return stripped || name;
  }
  return name;
}

function yearRangeLabel(variant) {
  const fams = variant.fitment_by_family;
  if (!fams?.length) return null;
  if (fams.length === 1) {
    const f = fams[0];
    return f.min_year === f.max_year ? `${f.min_year}` : `${f.min_year}–${f.max_year}`;
  }
  const min = Math.min(...fams.map(f => f.min_year));
  const max = Math.max(...fams.map(f => f.max_year));
  return min === max ? `${min}` : `${min}–${max}`;
}

function groupByFamily(variants) {
  const groups = new Map();
  const UNIVERSAL = 'Universal / All Models';
  for (const v of variants) {
    const fams = v.fitment_by_family;
    if (!fams?.length) {
      if (!groups.has(UNIVERSAL)) groups.set(UNIVERSAL, []);
      groups.get(UNIVERSAL).push(v);
    } else {
      const seen = new Set();
      for (const f of fams) {
        if (!seen.has(f.family)) {
          seen.add(f.family);
          if (!groups.has(f.family)) groups.set(f.family, []);
          groups.get(f.family).push(v);
        }
      }
    }
  }
  return groups;
}

function hasFitmentData(variants) {
  return variants.some(v => v.fitment_by_family?.length > 0);
}

/**
 * Determine render mode:
 *
 * MODE A — fitment+color (NEW):
 *   Variants have BOTH option_1_value (color/finish) AND fitment_by_family.
 *   Group by fitment family first; within each group show color swatches.
 *   This fixes the "3x BLACK / 2x CHROME" duplicate problem.
 *
 * MODE B — fitment only:
 *   Variants have fitment but no option values.
 *   Show FitmentVariantCard rows (year range prominent).
 *
 * MODE C — options only:
 *   Variants have option values but no meaningful fitment.
 *   Show flat VariantCard list (original behavior).
 */
function getRenderMode(variants) {
  const hasOptions  = variants.some(v => v.option_1_value);
  const hasFitment  = hasFitmentData(variants);
  if (hasOptions && hasFitment) return 'fitment+color';
  if (!hasOptions && hasFitment) return 'fitment';
  // Mode D: two separate radio groups when variants differ by BOTH color and pack qty
  if (hasOptions) {
    const colors = new Set(variants.map(v => v.option_1_value).filter(Boolean));
    const qtys   = new Set(variants.map(v => v.pack_qty).filter(q => q && q > 1));
    if (colors.size > 1 && qtys.size > 1) return 'color+qty';
  }
  return 'options';
}

// ── Chevron ───────────────────────────────────────────────────────────────────
function Chevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d={up ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── MODE A: Fitment+Color grouped selector ────────────────────────────────────
//
// Layout:
//   Row per fitment group (family name + year range) — like a radio
//   When a row is selected, color swatches slide open beneath it
//   Selecting a swatch navigates to that variant's PDP
//
function FitmentColorSelector({ variants, currentId, onSelect, groupDisplayName }) {
  // Build fitment groups: Map<familyKey, { label, yearRange, variants[] }>
  const fitmentGroups = buildFitmentGroups(variants);

  // Find which fitment group contains the current product
  const currentGroup = [...fitmentGroups.values()].find(g =>
    g.variants.some(v => v.id === currentId)
  ) ?? fitmentGroups.values().next().value;

  const [activeGroupKey, setActiveGroupKey] = useState(currentGroup?.key ?? null);
  const [selectedId, setSelectedId]         = useState(currentId);

  const activeGroup = fitmentGroups.get(activeGroupKey);

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[...fitmentGroups.values()].map(group => {
        const isOpen     = activeGroupKey === group.key;
        const groupHasCurrent = group.variants.some(v => v.id === currentId);

        return (
          <div key={group.key}>
            {/* Fitment row — click to expand */}
            <button
              onClick={() => setActiveGroupKey(isOpen ? null : group.key)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                width: '100%', textAlign: 'left', cursor: 'pointer',
                border: `1px solid ${isOpen ? GOLD : BORDER}`,
                borderRadius: isOpen ? '6px 6px 0 0' : 6,
                background: isOpen ? '#fffbf0' : CREAM,
                boxShadow: isOpen ? `0 0 0 2px ${GOLD}22` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ minWidth: 0 }}>
                {/* Family name */}
                <div style={{
                  fontFamily: "var(--font-caesar,'Bebas Neue',sans-serif)",
                  fontSize: 17, color: isOpen ? GOLD : DARK,
                  letterSpacing: '0.04em', lineHeight: 1.1,
                  transition: 'color 0.15s',
                }}>
                  {group.familyLabel}
                </div>
                {/* Year range */}
                {group.yearRange && (
                  <div style={{
                    fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                    fontSize: 9, color: '#9a8870', letterSpacing: '0.1em',
                    textTransform: 'uppercase', marginTop: 2,
                  }}>
                    {group.yearRange}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {groupHasCurrent && (
                  <span style={{
                    fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                    fontSize: 8, color: GOLD, letterSpacing: '0.1em',
                    background: `${GOLD}18`, padding: '2px 7px', borderRadius: 3,
                  }}>
                    ← HERE
                  </span>
                )}
                <span style={{ color: '#9a8870', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                  <Chevron />
                </span>
              </div>
            </button>

            {/* Color swatches — slide open */}
            {isOpen && (
              <div style={{
                border: `1px solid ${GOLD}`,
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                background: '#fffdf8',
                padding: '10px 12px 12px',
                display: 'flex', flexDirection: 'column', gap: 1,
              }}>
                <div style={{
                  fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                  fontSize: 9, letterSpacing: '0.14em', color: '#9a8870',
                  textTransform: 'uppercase', marginBottom: 8,
                }}>
                  Select Finish / Color
                </div>
                {/* Dedupe by option_1_value within this group */}
                {dedupeByOption(group.variants).map(v => {
                  const isSelected = v.id === selectedId || v.id === currentId;
                  const inStock    = v.stock_qty > 0;
                  const price      = v.offer_price || v.msrp;
                  const vPackQty   = v.pack_qty && v.pack_qty > 1 ? v.pack_qty : null;
                  const label      = v.option_1_value
                    ? [v.option_1_value, v.option_2_value, vPackQty ? `${vPackQty}pk` : null].filter(Boolean).join(' · ')
                    : makeShortLabel(v.name, groupDisplayName) || v.sku;

                  return (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedId(v.id); onSelect(v); }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', width: '100%', textAlign: 'left',
                        cursor: 'pointer',
                        border: `1px solid ${isSelected ? GOLD : BORDER}`,
                        borderRadius: 4,
                        background: isSelected ? '#fffbf0' : 'white',
                        boxShadow: isSelected ? `0 0 0 2px ${GOLD}33` : 'none',
                        opacity: inStock ? 1 : 0.55,
                        transition: 'all 0.12s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Color dot if we can infer */}
                        <ColorDot value={v.option_1_value} selected={isSelected} />
                        <span style={{
                          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                          fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: DARK,
                        }}>
                          {label}
                        </span>
                        {!inStock && (
                          <span style={{
                            fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                            fontSize: 9, color: '#b05a40', letterSpacing: '0.06em',
                          }}>
                            OUT OF STOCK
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
                        fontSize: 13, fontWeight: 700, color: DARK, flexShrink: 0,
                      }}>
                        {price ? `$${parseFloat(price).toFixed(2)}` : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Build fitment groups from variants that have both option values AND fitment
function buildFitmentGroups(variants) {
  const groups = new Map(); // key → { key, familyLabel, yearRange, variants[] }

  for (const v of variants) {
    const fams = v.fitment_by_family;
    if (!fams?.length) {
      // No fitment — put in universal bucket
      const key = '__universal__';
      if (!groups.has(key)) groups.set(key, { key, familyLabel: 'Universal / All Models', yearRange: null, variants: [] });
      groups.get(key).variants.push(v);
    } else {
      // Group by primary family (first one)
      const primaryFam = fams[0];
      const key = primaryFam.family;
      if (!groups.has(key)) {
        const min = Math.min(...fams.map(f => f.min_year).filter(Boolean));
        const max = Math.max(...fams.map(f => f.max_year).filter(Boolean));
        const yearRange = isFinite(min) && isFinite(max)
          ? (min === max ? `${min}` : `'${String(min).slice(-2)}–'${String(max).slice(-2)}`)
          : null;
        groups.set(key, { key, familyLabel: primaryFam.family, yearRange, variants: [] });
      }
      groups.get(key).variants.push(v);
    }
  }

  return groups;
}

// Dedupe variants within a fitment group by option_1_value
// keeping the best one (in stock preferred, then cheapest)
function dedupeByOption(variants) {
  const seen = new Map();
  for (const v of variants) {
    const key = (v.option_1_value ?? v.name ?? v.id).toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, v);
    } else {
      const existing = seen.get(key);
      // Prefer in-stock
      if (!existing.stock_qty && v.stock_qty > 0) {
        seen.set(key, v);
      }
    }
  }
  return [...seen.values()];
}

// Simple color dot for common finish names
const COLOR_MAP = {
  black:   '#1a1a1a',
  chrome:  'linear-gradient(135deg, #c8c8c8, #f0f0f0, #a8a8a8)',
  silver:  'linear-gradient(135deg, #c0c0c0, #e8e8e8)',
  gold:    'linear-gradient(135deg, #c9a84c, #f0d070)',
  red:     '#c0392b',
  blue:    '#2471a3',
  white:   '#f5f5f5',
  natural: '#d4a96a',
  polished:'linear-gradient(135deg, #d0d0d0, #f8f8f8)',
};

function ColorDot({ value, selected }) {
  if (!value) return null;
  const key   = value.toLowerCase().split(/[\s/]/)[0];
  const style = COLOR_MAP[key];
  if (!style) return null;
  const isGrad = style.startsWith('linear');
  return (
    <span style={{
      width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
      background: isGrad ? style : style,
      border: `1.5px solid ${selected ? GOLD : BORDER}`,
      display: 'inline-block',
    }}/>
  );
}

// ── MODE B: Flat fitment list ─────────────────────────────────────────────────
function FitmentList({ variants, currentId, onSelect, groupDisplayName }) {
  const [expanded, setExpanded] = useState(false);
  const SHOW = 6;

  const sorted = [...variants].sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    return 0;
  });
  const display = expanded ? sorted : sorted.slice(0, SHOW);

  // When multiple variants share the same year-range label, fall back to product names
  const labels = sorted.map(v => yearRangeLabel(v));
  const hasDupeLabels = labels.some((l, i) => labels.indexOf(l) !== i);
  const packQtys = new Set(sorted.map(v => v.pack_qty ?? 1));
  const hasQtyVariation = packQtys.size > 1;

  return (
    <>
      <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {display.map(v => (
          <FitmentVariantCard
            key={v.id}
            variant={v}
            isSelected={v.id === currentId}
            isCurrent={v.id === currentId}
            onSelect={() => onSelect(v)}
            groupDisplayName={groupDisplayName}
            useNameLabel={hasDupeLabels || hasQtyVariation}
            showQtyBadge={hasQtyVariation}
          />
        ))}
      </div>
      {sorted.length > SHOW && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '9px 10px', background: 'none', border: 'none',
            borderTop: `1px solid ${BORDER}`, color: '#8b7355', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          {expanded ? <>Show less <Chevron up /></> : <>Show {sorted.length - SHOW} more <Chevron /></>}
        </button>
      )}
    </>
  );
}

// ── MODE C: Flat option list (original) ───────────────────────────────────────
function OptionList({ variants, currentId, onSelect, groupDisplayName }) {
  const [expanded, setExpanded] = useState(false);
  const SHOW = 6;

  const sorted = [...variants].sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    return 0;
  });
  const display = expanded ? sorted : sorted.slice(0, SHOW);

  return (
    <>
      <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {display.map(v => (
          <VariantCard
            key={v.id}
            variant={v}
            isSelected={v.id === currentId}
            isCurrent={v.id === currentId}
            onSelect={() => onSelect(v)}
            groupDisplayName={groupDisplayName}
          />
        ))}
      </div>
      {sorted.length > SHOW && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '9px 10px', background: 'none', border: 'none',
            borderTop: `1px solid ${BORDER}`, color: '#8b7355', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          {expanded ? <>Show less <Chevron up /></> : <>Show {sorted.length - SHOW} more <Chevron /></>}
        </button>
      )}
    </>
  );
}

// ── MODE D: Color + Qty two-radio-group selector ─────────────────────────────
function ColorQtySelector({ variants, currentId, onSelect }) {
  // Find current product's color and qty to init selection
  const current = variants.find(v => v.id === currentId) ?? variants[0];

  const [selectedColor, setSelectedColor] = useState(current?.option_1_value ?? null);
  const [selectedQty,   setSelectedQty]   = useState(current?.pack_qty ?? null);

  // Unique colors sorted alphabetically
  const colors = [...new Set(variants.map(v => v.option_1_value).filter(Boolean))].sort();
  // Unique qtys sorted numerically
  const qtys = [...new Set(variants.map(v => v.pack_qty).filter(q => q && q > 1))].sort((a, b) => a - b);

  // Best variant for a color+qty combo: cheapest in-stock, else cheapest overall
  function bestVariant(color, qty) {
    const matches = variants.filter(v => v.option_1_value === color && v.pack_qty === qty);
    if (!matches.length) return null;
    const inStock = matches.filter(v => v.stock_qty > 0);
    const pool = inStock.length ? inStock : matches;
    return pool.reduce((best, v) => {
      const p = parseFloat(v.offer_price || v.msrp || 0);
      const bp = parseFloat(best.offer_price || best.msrp || 0);
      return p < bp ? v : best;
    });
  }

  function handleColorChange(color) {
    setSelectedColor(color);
    if (selectedQty) {
      const v = bestVariant(color, selectedQty);
      if (v) onSelect(v);
    }
  }

  function handleQtyChange(qty) {
    setSelectedQty(qty);
    if (selectedColor) {
      const v = bestVariant(selectedColor, qty);
      if (v) onSelect(v);
    }
  }

  const activeVariant = selectedColor && selectedQty ? bestVariant(selectedColor, selectedQty) : null;
  const activePrice   = activeVariant ? parseFloat(activeVariant.offer_price || activeVariant.msrp || 0) : null;
  const activeStock   = activeVariant?.stock_qty ?? 0;

  const pillBase = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
    fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    border: `1px solid ${BORDER}`, background: 'white', color: DARK,
    transition: 'all 0.13s',
  };
  const pillActive = {
    border: `1px solid ${GOLD}`, background: '#fffbf0',
    boxShadow: `0 0 0 2px ${GOLD}33`, color: DARK,
  };

  return (
    <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Color */}
      <div>
        <div style={{
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
          fontSize: 9, letterSpacing: '0.14em', color: '#9a8870',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Color
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {colors.map(color => {
            const isActive = selectedColor === color;
            return (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                style={{ ...pillBase, ...(isActive ? pillActive : {}) }}
              >
                <ColorDot value={color} selected={isActive} />
                {color}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <div style={{
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
          fontSize: 9, letterSpacing: '0.14em', color: '#9a8870',
          textTransform: 'uppercase', marginBottom: 8,
        }}>
          Quantity
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {qtys.map(qty => {
            const isActive   = selectedQty === qty;
            const candidate  = selectedColor ? bestVariant(selectedColor, qty) : null;
            const available  = !selectedColor || !!candidate;
            const priceLabel = candidate
              ? `$${parseFloat(candidate.offer_price || candidate.msrp || 0).toFixed(2)}`
              : null;
            return (
              <button
                key={qty}
                onClick={() => available && handleQtyChange(qty)}
                style={{
                  ...pillBase,
                  ...(isActive ? pillActive : {}),
                  opacity: available ? 1 : 0.35,
                  cursor: available ? 'pointer' : 'not-allowed',
                }}
              >
                <span>{qty} pack</span>
                {priceLabel && (
                  <span style={{ color: isActive ? GOLD : '#9a8870', fontSize: 11 }}>
                    {priceLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected summary */}
      {activeVariant && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px',
          background: '#f5f0e8', border: `1px solid ${BORDER}`, borderRadius: 6,
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
        }}>
          <span style={{ fontSize: 11, color: '#6b5c40', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {selectedColor} · {selectedQty} pack
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, color: activeStock > 0 ? '#4a8c5c' : '#b05a40', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {activeStock > 0 ? 'In stock' : 'Out of stock'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: DARK }}>
              ${activePrice?.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function VariantSelector({ productId }) {
  const router = useRouter();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected,setSelected]= useState(productId);

  useEffect(() => {
    fetch(`/api/browse/variants/${productId}`)
      .then(r => r.json())
      .then(d => { setData(d); setSelected(d.currentProductId ?? productId); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  if (loading) return null;
  if (!data?.hasVariants || data.variants.length <= 1) return null;

  const { variants, currentProductId, group, siblingGroups } = data;
  const currentId = currentProductId ?? productId;

  // Gauge tabs
  const hasTabs = siblingGroups?.length > 0;
  const allGroups = hasTabs
    ? (() => {
        const all = [group, ...siblingGroups].sort((a, b) => {
          const ga = parseInt(a.displayName?.match(/(\d+)\s*Gauge/i)?.[1] ?? '999');
          const gb = parseInt(b.displayName?.match(/(\d+)\s*Gauge/i)?.[1] ?? '999');
          return ga - gb;
        });
        const seen = new Map();
        for (const g of all) {
          const label = extractGaugeTab(g.displayName);
          if (!seen.has(label)) seen.set(label, g);
          else if (g.id === group?.id) seen.set(label, g);
        }
        return [...seen.values()];
      })()
    : null;

  const handleSelect = (variant) => {
    setSelected(variant.id);
    if (variant.slug && variant.id !== productId) {
      router.push(`/browse/${variant.slug}`);
    }
  };

  const handleTabClick = (g) => {
    if (g.id === group?.id) return;
    if (g.representativeSlug) router.push(`/browse/${g.representativeSlug}`);
  };

  const mode = getRenderMode(variants);

  return (
    <div style={{
      margin: '16px 0',
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      overflow: 'hidden',
      background: CREAM,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', background: CREAM2, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#6b5c40',
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
        }}>
          {hasTabs ? extractBaseName(group?.displayName) : (group?.displayName ?? 'Options')}
        </span>
        <span style={{
          fontSize: 11, color: '#9a8870', background: '#ede8de',
          padding: '2px 8px', borderRadius: 10,
        }}>
          {variants.length} options
        </span>
      </div>

      {/* Gauge tabs */}
      {hasTabs && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 10px',
          borderBottom: `1px solid ${BORDER}`, background: '#fff',
          flexWrap: 'wrap',
        }}>
          {allGroups.map(g => {
            const isActive = g.id === group?.id;
            return (
              <button key={g.id} onClick={() => handleTabClick(g)} style={{
                padding: '5px 14px', borderRadius: 20,
                border: `1.5px solid ${isActive ? GOLD : BORDER}`,
                background: isActive ? GOLD : '#fff',
                color: isActive ? '#fff' : '#6b5c40',
                fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                cursor: isActive ? 'default' : 'pointer',
                transition: 'all 0.15s',
                fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
              }}>
                {extractGaugeTab(g.displayName)}
              </button>
            );
          })}
        </div>
      )}

      {/* Body — mode-switched */}
      {mode === 'fitment+color' && (
        <FitmentColorSelector
          variants={variants}
          currentId={currentId}
          onSelect={handleSelect}
          groupDisplayName={group?.displayName}
        />
      )}
      {mode === 'fitment' && (
        <FitmentList
          variants={variants}
          currentId={currentId}
          onSelect={handleSelect}
          groupDisplayName={group?.displayName}
        />
      )}
      {mode === 'color+qty' && (
        <ColorQtySelector
          variants={variants}
          currentId={currentId}
          onSelect={handleSelect}
        />
      )}
      {mode === 'options' && (
        <OptionList
          variants={variants}
          currentId={currentId}
          onSelect={handleSelect}
          groupDisplayName={group?.displayName}
        />
      )}
    </div>
  );
}

// ── FitmentVariantCard (Mode B) ───────────────────────────────────────────────
function FitmentVariantCard({ variant, isSelected, isCurrent, onSelect, groupDisplayName, useNameLabel = false, showQtyBadge = false }) {
  const [hovered, setHovered] = useState(false);
  const inStock = variant.stock_qty > 0;
  const price   = variant.offer_price || variant.msrp;
  const active  = isSelected || isCurrent;
  const yearLabel = yearRangeLabel(variant);
  const families  = variant.fitment_by_family ?? [];

  const qty = variant.pack_qty ?? 1;
  const qtyLabel = qty > 1 ? `${qty}-Pack` : '1 pc';

  // When year labels duplicate across the group, use product name as primary
  const primaryLabel = useNameLabel
    ? (makeShortLabel(variant.name, groupDisplayName) || variant.name || variant.sku)
    : (yearLabel ?? variant.name ?? variant.sku);
  const subLabel = useNameLabel
    ? (yearLabel ? `${yearLabel} · ${variant.sku}` : variant.sku)
    : (families.length > 1 ? families.map(f => f.family).join(' · ') : variant.sku);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
        gap: 12, padding: '10px 14px', width: '100%', textAlign: 'left',
        cursor: 'pointer',
        border: `1px solid ${active || hovered ? GOLD : BORDER}`,
        borderRadius: 6,
        background: active ? '#fffbf0' : hovered ? '#fffdf8' : 'white',
        boxShadow: active ? `0 0 0 2px ${GOLD}33` : 'none',
        opacity: inStock ? 1 : 0.6,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            fontFamily: "var(--font-caesar,'Bebas Neue',sans-serif)",
            fontSize: 18, color: active ? GOLD : DARK,
            letterSpacing: '0.04em', lineHeight: 1.1, transition: 'color 0.15s',
          }}>
            {primaryLabel}
          </div>
          {showQtyBadge && (
            <span style={{
              fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: active ? GOLD : '#6b5c40',
              background: active ? `${GOLD}18` : '#f0ebe0',
              padding: '2px 7px', borderRadius: 3, flexShrink: 0,
            }}>
              {qtyLabel}
            </span>
          )}
        </div>
        <div style={{
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
          fontSize: 9, color: '#9a8870', letterSpacing: '0.08em',
          textTransform: 'uppercase', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {subLabel}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-caesar,'Bebas Neue',sans-serif)", fontSize: 17, color: DARK, letterSpacing: '0.03em' }}>
          {price ? `$${parseFloat(price).toFixed(2)}` : '—'}
        </div>
        <div style={{
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
          fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
          color: inStock ? '#4a8c5c' : '#b05a40',
        }}>
          {inStock ? `${variant.stock_qty} IN STOCK` : 'OUT OF STOCK'}
        </div>
        {isCurrent && (
          <div style={{
            fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
            fontSize: 8, color: GOLD, letterSpacing: '0.1em',
            background: `${GOLD}18`, padding: '1px 6px', borderRadius: 3,
          }}>
            ← HERE
          </div>
        )}
      </div>
    </button>
  );
}

// ── VariantCard (Mode C) ──────────────────────────────────────────────────────
function VariantCard({ variant, isSelected, isCurrent, onSelect, groupDisplayName }) {
  const [hovered, setHovered] = useState(false);
  const inStock = variant.stock_qty > 0;
  const price   = variant.offer_price || variant.msrp;
  const active  = isSelected || isCurrent;

  const packQty = variant.pack_qty && variant.pack_qty > 1 ? variant.pack_qty : null;
  const shortLabel = (variant.option_1_value
    ? [variant.option_1_value, variant.option_2_value, packQty ? `${packQty}pk` : null].filter(Boolean).join(' · ')
    : makeShortLabel(variant.name, groupDisplayName))
    || variant.name || variant.sku;

  const optParts = [variant.option_1_value, variant.option_2_value].filter(Boolean);
  const optLabel = optParts.length ? optParts.join(' · ') : null;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={variant.name}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${active || hovered ? GOLD : BORDER}`,
        borderRadius: 6,
        background: active ? '#fffbf0' : hovered ? '#fffdf8' : 'white',
        boxShadow: active ? `0 0 0 2px ${GOLD}33` : 'none',
        opacity: inStock ? 1 : 0.6,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: DARK,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
          letterSpacing: '0.03em', textTransform: 'uppercase',
        }}>
          {shortLabel}
        </div>
        {optLabel && optLabel !== shortLabel && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {optParts.map((v, i) => (
              <span key={i} style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 3,
                background: '#f0ebe0', color: '#7a6848', letterSpacing: '0.05em',
                fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
              }}>{v}</span>
            ))}
          </div>
        )}
        {isCurrent && (
          <div style={{
            fontFamily: "var(--font-stencil,'Barlow Condensed',monospace)",
            fontSize: 8, color: GOLD, letterSpacing: '0.1em',
            background: `${GOLD}18`, padding: '1px 6px', borderRadius: 3,
            display: 'inline-block', marginTop: 2,
          }}>
            ← HERE
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>
          {price ? `$${parseFloat(price).toFixed(2)}` : '—'}
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: inStock ? '#4a8c5c' : '#b05a40' }}>
          {inStock ? `${variant.stock_qty} in stock` : 'Out of stock'}
        </div>
      </div>
    </button>
  );
}
