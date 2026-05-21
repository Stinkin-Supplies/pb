'use client';
// components/browse/VariantSelector.jsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const GOLD   = '#b8922a';
const BORDER = '#e0d8c8';
const DARK   = '#2a1f0e';
const CREAM  = '#fdfaf5';
const CREAM2 = '#f5f0e8';
const FONT   = "var(--font-stencil, 'Barlow Condensed', monospace)";

export default function VariantSelector({ productId, currentSku }) {
  const router = useRouter();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [selOpt1, setSelOpt1] = useState(null);
  const [selOpt2, setSelOpt2] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/browse/variants/${productId}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        // Pre-select current product's options
        if (d.variants) {
          const current = d.variants.find(v => v.id === productId);
          if (current) {
            setSelOpt1(current.option_1_value);
            setSelOpt2(current.option_2_value);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId]);

  if (loading) return <VariantSkeleton />;
  if (!data?.hasVariants || data.variants.length <= 1) return null;

  const { variants } = data;
  const isTwoAxis = variants.some(v => v.option_2_value);

  if (isTwoAxis) {
    return <TwoAxisSelector
      variants={variants}
      productId={productId}
      selOpt1={selOpt1}
      selOpt2={selOpt2}
      setSelOpt1={setSelOpt1}
      setSelOpt2={setSelOpt2}
      router={router}
    />;
  }

  return <SingleAxisSelector
    variants={variants}
    productId={productId}
    expanded={expanded}
    setExpanded={setExpanded}
    router={router}
  />;
}

// ── Two-axis: Color + Size pills ──────────────────────────────
function TwoAxisSelector({ variants, productId, selOpt1, selOpt2, setSelOpt1, setSelOpt2, router }) {
  // Unique sorted option values
  const colors = [...new Set(variants.map(v => v.option_1_value).filter(Boolean))].sort();
  const sizes  = [...new Set(variants.map(v => v.option_2_value).filter(Boolean))]
    .sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));

  const opt1Label = variants.find(v => v.option_1_name)?.option_1_name ?? 'Color';
  const opt2Label = variants.find(v => v.option_2_name)?.option_2_name ?? 'Size';

  // Find variant matching current selection
  const match = variants.find(v => v.option_1_value === selOpt1 && v.option_2_value === selOpt2);
  // Check which combos are available
  const isAvailable = (o1, o2) => variants.some(v => v.option_1_value === o1 && v.option_2_value === o2);
  const hasStock    = (o1, o2) => variants.some(v => v.option_1_value === o1 && v.option_2_value === o2 && v.stock_qty > 0);

  const handleSelect = (o1, o2) => {
    setSelOpt1(o1);
    setSelOpt2(o2);
    const target = variants.find(v => v.option_1_value === o1 && v.option_2_value === o2);
    if (target?.slug && target.id !== productId) {
      router.push(`/browse/${target.slug}`);
    }
  };

  return (
    <div style={{ margin: '16px 0', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', background: CREAM }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', background: CREAM2, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b5c40' }}>
          {data?.group?.displayName ?? 'Options'}
        </span>
        <span style={{ fontSize: 11, color: '#9a8870', background: '#ede8de', padding: '2px 8px', borderRadius: 10 }}>
          {variants.length} variants
        </span>
      </div>

      <div style={{ padding: '14px 14px 10px' }}>
        {/* Option 1 — Color */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: FONT, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a8870', marginBottom: 8 }}>
            {opt1Label}: <span style={{ color: DARK, fontWeight: 700 }}>{selOpt1 ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {colors.map(color => {
              const active    = selOpt1 === color;
              const available = sizes.some(s => isAvailable(color, s));
              const inStock   = sizes.some(s => hasStock(color, s));
              return (
                <button key={color} onClick={() => handleSelect(color, selOpt2 ?? sizes[0])}
                  style={{
                    padding: '6px 12px', borderRadius: 4, cursor: available ? 'pointer' : 'not-allowed',
                    fontFamily: FONT, fontSize: 11, fontWeight: active ? 700 : 400,
                    border: `1.5px solid ${active ? GOLD : BORDER}`,
                    background: active ? '#fffbf0' : '#fff',
                    color: available ? DARK : '#bbb',
                    boxShadow: active ? `0 0 0 2px ${GOLD}33` : 'none',
                    opacity: available ? 1 : 0.5,
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}>
                  {color}
                  {!inStock && available && (
                    <span style={{ position: 'absolute', top: 2, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#e0a060' }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Option 2 — Size */}
        <div>
          <div style={{ fontFamily: FONT, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a8870', marginBottom: 8 }}>
            {opt2Label}: <span style={{ color: DARK, fontWeight: 700 }}>{selOpt2 ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sizes.map(size => {
              const active    = selOpt2 === size;
              const available = isAvailable(selOpt1, size);
              const inStock   = hasStock(selOpt1, size);
              return (
                <button key={size} onClick={() => available && handleSelect(selOpt1, size)}
                  style={{
                    width: 48, height: 36, borderRadius: 4,
                    cursor: available ? 'pointer' : 'not-allowed',
                    fontFamily: FONT, fontSize: 12, fontWeight: active ? 700 : 500,
                    border: `1.5px solid ${active ? GOLD : available ? BORDER : '#ece8e0'}`,
                    background: active ? '#fffbf0' : available ? '#fff' : '#f8f5f0',
                    color: available ? DARK : '#ccc',
                    boxShadow: active ? `0 0 0 2px ${GOLD}33` : 'none',
                    transition: 'all 0.15s',
                    textDecoration: !available ? 'line-through' : 'none',
                  }}>
                  {size}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected variant info */}
        {match && (
          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontFamily: FONT, fontSize: 9, color: '#9a8870', letterSpacing: '0.05em' }}>
              {match.sku}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: match.stock_qty > 0 ? '#4a8c5c' : '#b05a40' }}>
                {match.stock_qty > 0 ? `${match.stock_qty} in stock` : 'Out of stock'}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: DARK }}>
                ${parseFloat(match.offer_price || match.msrp || 0).toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single-axis: fitment / measurement / finish list ──────────
function SingleAxisSelector({ variants, productId, expanded, setExpanded, router }) {
  const [selected, setSelected] = useState(productId);

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
    <div style={{ margin: '16px 0', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', background: CREAM }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', background: CREAM2, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b5c40' }}>
          Other options in this line
        </span>
        <span style={{ fontSize: 11, color: '#9a8870', background: '#ede8de', padding: '2px 8px', borderRadius: 10 }}>
          {variants.length} options
        </span>
      </div>

      <div style={{ padding: '10px 10px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {displayVariants.map(v => (
          <VariantRow key={v.id} variant={v}
            isSelected={v.id === selected}
            isCurrent={v.id === productId}
            onSelect={() => handleSelect(v)}
          />
        ))}
      </div>

      {hasMore && (
        <button onClick={() => setExpanded(e => !e)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', padding: '9px 10px', background: 'none', border: 'none',
          borderTop: `1px solid ${BORDER}`, color: '#8b7355', fontSize: 12,
          fontFamily: FONT, fontWeight: 600, cursor: 'pointer',
        }}>
          {expanded ? <>Show less <Chevron up /></> : <>Show {sortedVariants.length - SHOW_INITIAL} more <Chevron /></>}
        </button>
      )}
    </div>
  );
}

function VariantRow({ variant, isSelected, isCurrent, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const inStock = variant.stock_qty > 0;
  const price   = variant.offer_price || variant.msrp;
  const active  = isSelected || isCurrent;
  const label   = variant.option_1_value || variant.name || variant.sku;

  return (
    <button onClick={onSelect}
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
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: DARK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#9a8870', fontFamily: 'monospace' }}>{variant.sku}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: DARK }}>
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
    <div style={{ margin: '16px 0', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, background: CREAM }}>
      <div style={{ height: 12, width: 160, background: '#ede8de', borderRadius: 4, marginBottom: 12 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 48, background: CREAM2, borderRadius: 6, marginBottom: 6, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

const SIZE_ORDER = ['XS','SM','MD','LG','XL','2X','3X','4X','5X'];
