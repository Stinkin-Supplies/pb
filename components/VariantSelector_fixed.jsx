'use client';
// components/browse/VariantSelector.jsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#b8922a';
const BORDER = '#e0d8c8';
const DARK   = '#2a1f0e';
const CREAM  = '#fdfaf5';
const CREAM2 = '#f5f0e8';

export default function VariantSelector({ productId, currentSku }) {
  const router = useRouter();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(productId);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/browse/variants/${productId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  if (loading) return <VariantSkeleton />;
  if (!data?.hasVariants || data.variants.length <= 1) return null;

  const { variants } = data;

  const sortedVariants = [...variants].sort((a, b) => {
    if (a.id === productId) return -1;
    if (b.id === productId) return 1;
    if (a.stock_qty > 0 && b.stock_qty === 0) return -1;
    if (b.stock_qty > 0 && a.stock_qty === 0) return 1;
    return (parseFloat(a.offer_price) || 0) - (parseFloat(b.offer_price) || 0);
  });

  const SHOW_INITIAL = 4;
  const displayVariants = expanded ? sortedVariants : sortedVariants.slice(0, SHOW_INITIAL);
  const hasMore = sortedVariants.length > SHOW_INITIAL;

  const handleSelect = (variant) => {
    setSelected(variant.id);
    if (variant.slug && variant.id !== productId) {
      router.push(`/browse/${variant.slug}`);
    }
  };

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
          Other fitments in this line
        </span>
        <span style={{
          fontSize: 11, color: '#9a8870', background: '#ede8de',
          padding: '2px 8px', borderRadius: 10,
        }}>
          {variants.length} options
        </span>
      </div>

      {/* Cards */}
      <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {displayVariants.map(v => (
          <VariantCard
            key={v.id}
            variant={v}
            isSelected={v.id === selected}
            isCurrent={v.id === productId}
            onSelect={() => handleSelect(v)}
          />
        ))}
      </div>

      {/* Show more/less */}
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
          {expanded
            ? <>Show less <Chevron up /></>
            : <>Show {sortedVariants.length - SHOW_INITIAL} more <Chevron /></>
          }
        </button>
      )}
    </div>
  );
}

function Chevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d={up ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

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
          {buildFitLabel(variant)}
        </div>
        <div style={{ fontSize: 11, color: '#9a8870', fontFamily: 'monospace' }}>
          {variant.sku}
        </div>
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

function buildFitLabel(variant) {
  if (variant.option_1_value) return variant.option_1_value;
  if (variant.fitment_by_family?.length > 0) {
    const families = variant.fitment_by_family;
    if (families.length === 1) {
      const f = families[0];
      return `${f.family} ${f.min_year}–${f.max_year}`;
    }
    return families.slice(0, 2).map(f =>
      `${f.family} ${f.min_year === f.max_year ? f.min_year : `${f.min_year}–${f.max_year}`}`
    ).join(' / ') + (families.length > 2 ? ` +${families.length - 2}` : '');
  }
  return variant.name || variant.sku;
}

function VariantSkeleton() {
  return (
    <div style={{ margin: '16px 0', border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, background: CREAM }}>
      <div style={{ height: 12, width: 160, background: '#ede8de', borderRadius: 4, marginBottom: 12 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 48, background: CREAM2, borderRadius: 6, marginBottom: 6, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}
