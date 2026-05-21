'use client';
// components/browse/VariantSelector.jsx
// Variants grouped by HD family → year range

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#b8922a';
const BORDER = '#e0d8c8';
const DARK   = '#2a1f0e';
const CREAM  = '#fdfaf5';
const CREAM2 = '#f5f0e8';

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

// Given a variant, determine the best year-range label for display
function yearRangeLabel(variant) {
  const fams = variant.fitment_by_family;
  if (!fams?.length) return null;
  if (fams.length === 1) {
    const f = fams[0];
    return f.min_year === f.max_year ? `${f.min_year}` : `${f.min_year}–${f.max_year}`;
  }
  // Multiple families — find the widest range
  const min = Math.min(...fams.map(f => f.min_year));
  const max = Math.max(...fams.map(f => f.max_year));
  return min === max ? `${min}` : `${min}–${max}`;
}

// Group variants by primary fitment family.
// Variants with no fitment go into an "Universal / All Models" bucket.
function groupByFamily(variants) {
  const groups = new Map(); // family name → variants[]
  const UNIVERSAL = 'Universal / All Models';

  for (const v of variants) {
    const fams = v.fitment_by_family;
    if (!fams?.length) {
      if (!groups.has(UNIVERSAL)) groups.set(UNIVERSAL, []);
      groups.get(UNIVERSAL).push(v);
    } else {
      // Primary family = first one (already sorted by family name in SQL)
      // But if only one family, use it; if multiple, add to each family's group
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

// Check if any variant has fitment_by_family data
function hasFitmentData(variants) {
  return variants.some(v => v.fitment_by_family?.length > 0);
}

export default function VariantSelector({ productId, currentSku }) {
  const router = useRouter();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(productId);

  useEffect(() => {
    fetch(`/api/browse/variants/${productId}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setSelected(d.currentProductId ?? productId);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId]);

  if (loading) return <VariantSkeleton />;
  if (!data?.hasVariants || data.variants.length <= 1) return null;

  const { variants, currentProductId, group, siblingGroups } = data;
  const currentId = currentProductId ?? productId;

  // ── Gauge tabs (wire spools etc.) ────────────────────────────
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

  // ── Decide render mode ────────────────────────────────────────
  // If variants have fitment data → grouped by family view
  // Otherwise → flat list (color/size variants like wire spools)
  const useFitmentGrouping = hasFitmentData(variants);
  const familyGroups = useFitmentGrouping ? groupByFamily(variants) : null;

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
          fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
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

      {/* Gauge / sibling tabs */}
      {hasTabs && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 10px',
          borderBottom: `1px solid ${BORDER}`, background: '#fff',
          flexWrap: 'wrap',
        }}>
          {allGroups.map(g => {
            const isActive = g.id === group?.id;
            return (
              <button
                key={g.id}
                onClick={() => handleTabClick(g)}
                style={{
                  padding: '5px 14px', borderRadius: 20,
                  border: `1.5px solid ${isActive ? GOLD : BORDER}`,
                  background: isActive ? GOLD : '#fff',
                  color: isActive ? '#fff' : '#6b5c40',
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                  cursor: isActive ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
                }}
              >
                {extractGaugeTab(g.displayName)}
              </button>
            );
          })}
        </div>
      )}

      {/* ── FITMENT-GROUPED VIEW ── */}
      {useFitmentGrouping ? (
        <div style={{ padding: '8px 10px 4px' }}>
          {[...familyGroups.entries()].map(([family, fvariants], gi) => (
            <div key={family} style={{ marginBottom: gi < familyGroups.size - 1 ? 14 : 4 }}>
              {/* Family header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 4px 8px',
              }}>
                <div style={{ width: 3, height: 14, background: GOLD, borderRadius: 2, flexShrink: 0 }} />
                <span style={{
                  fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
                  fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: GOLD, fontWeight: 700,
                }}>
                  {family}
                </span>
                <div style={{ flex: 1, height: 1, background: BORDER }} />
                <span style={{
                  fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
                  fontSize: 8, color: '#bbb', letterSpacing: '0.08em',
                }}>
                  {fvariants.length} {fvariants.length === 1 ? 'option' : 'options'}
                </span>
              </div>

              {/* Variants under this family */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {fvariants
                  .sort((a, b) => {
                    // Sort by year start ascending, current item first
                    if (a.id === currentId) return -1;
                    if (b.id === currentId) return 1;
                    const ya = a.fitment_by_family?.[0]?.min_year ?? 9999;
                    const yb = b.fitment_by_family?.[0]?.min_year ?? 9999;
                    return ya - yb;
                  })
                  .map(v => (
                    <FitmentVariantCard
                      key={v.id}
                      variant={v}
                      isSelected={v.id === selected}
                      isCurrent={v.id === currentId}
                      onSelect={() => handleSelect(v)}
                    />
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── FLAT LIST VIEW (color/size variants) ── */
        <FlatVariantList
          variants={variants}
          currentId={currentId}
          selected={selected}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}

// ── Flat list with show more/less (original behavior for non-fitment variants) ─
function FlatVariantList({ variants, currentId, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const SHOW_INITIAL = 4;

  const sorted = [...variants].sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    const la = (a.option_1_value || a.name || '').toLowerCase();
    const lb = (b.option_1_value || b.name || '').toLowerCase();
    return la.localeCompare(lb);
  });

  const display = expanded ? sorted : sorted.slice(0, SHOW_INITIAL);
  const hasMore = sorted.length > SHOW_INITIAL;

  return (
    <>
      <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {display.map(v => (
          <VariantCard
            key={v.id}
            variant={v}
            isSelected={v.id === selected}
            isCurrent={v.id === currentId}
            onSelect={() => onSelect(v)}
          />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '9px 10px', background: 'none', border: 'none',
            borderTop: `1px solid ${BORDER}`, color: '#8b7355', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          {expanded ? <>Show less <Chevron up /></> : <>Show {sorted.length - SHOW_INITIAL} more <Chevron /></>}
        </button>
      )}
    </>
  );
}

// ── Fitment variant card — year range prominent ───────────────
function FitmentVariantCard({ variant, isSelected, isCurrent, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const inStock = variant.stock_qty > 0;
  const price   = variant.offer_price || variant.msrp;
  const active  = isSelected || isCurrent;

  const yearLabel = yearRangeLabel(variant);
  const families  = variant.fitment_by_family ?? [];

  // Sub-label: show all families if multiple, otherwise show model codes hint
  const subLabel = families.length > 1
    ? families.map(f => f.family).join(' · ')
    : variant.sku;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${active || hovered ? GOLD : BORDER}`,
        borderRadius: 6,
        background: active ? '#fffbf0' : hovered ? '#fffdf8' : 'white',
        boxShadow: active ? `0 0 0 2px ${GOLD}33` : 'none',
        opacity: inStock ? 1 : 0.6,
        transition: 'all 0.15s',
      }}
    >
      {/* Left: year + sub info */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: 18, color: active ? GOLD : DARK,
          letterSpacing: '0.04em', lineHeight: 1.1,
          transition: 'color 0.15s',
        }}>
          {yearLabel ?? variant.name ?? variant.sku}
        </div>
        <div style={{
          fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
          fontSize: 9, color: '#9a8870', letterSpacing: '0.08em',
          textTransform: 'uppercase', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {subLabel}
        </div>
      </div>

      {/* Right: price + stock */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)",
          fontSize: 17, color: DARK, letterSpacing: '0.03em',
        }}>
          {price ? `$${parseFloat(price).toFixed(2)}` : '—'}
        </div>
        <div style={{
          fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
          fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
          color: inStock ? '#4a8c5c' : '#b05a40',
        }}>
          {inStock ? `${variant.stock_qty} IN STOCK` : 'OUT OF STOCK'}
        </div>
        {isCurrent && (
          <div style={{
            fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
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

// ── Original flat variant card (color/size) ───────────────────
function VariantCard({ variant, isSelected, isCurrent, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const inStock = variant.stock_qty > 0;
  const price   = variant.offer_price || variant.msrp;
  const active  = isSelected || isCurrent;

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
          fontSize: 13, fontWeight: 600, color: DARK,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {variant.option_1_value || variant.name || variant.sku}
        </div>
        <div style={{ fontSize: 11, color: '#9a8870', fontFamily: 'monospace' }}>
          {variant.sku}
        </div>
        {isCurrent && (
          <div style={{
            fontFamily: "var(--font-stencil, 'Barlow Condensed', monospace)",
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

function Chevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d={up ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function VariantSkeleton() {
  return (
    <div style={{ margin: '16px 0', border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, background: CREAM }}>
      <div style={{ height: 12, width: 160, background: '#ede8de', borderRadius: 4, marginBottom: 12 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 56, background: CREAM2, borderRadius: 6, marginBottom: 6, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}
