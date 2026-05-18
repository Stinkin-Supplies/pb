// app/harley/[family]/[model]/page.tsx
'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { HarleyProduct } from '@/lib/harley/catalog';
import { HARLEY_CATEGORIES } from '@/lib/harley/config';

const GOLD  = '#c9a84c';
const BLACK = '#080706';
const WHITE = '#ffffff';

const FAMILY_LABELS: Record<string, string> = {
  'touring': 'Touring', 'softail': 'Softail', 'sportster': 'Sportster',
  'dyna': 'Dyna', 'fxr': 'FXR', 'vintage': 'Vintage',
  'revolution-max': 'Revolution Max', 'trike': 'Trike',
};

const PER_PAGE = 48;

function fmt(n: number | null | undefined) {
  return n != null ? `$${Number(n).toFixed(2)}` : '—';
}

function toLabel(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Category Tab Bar ─────────────────────────────────────────────────────────

function CategoryTabBar({ categories, active, onChange }: {
  categories: { name: string; count: number }[];
  active: string | null;
  onChange: (v: string | null) => void;
}) {
  const tabs = [
    { name: null, label: 'All Parts', count: 0 },
    ...(categories ?? []).map(c => ({ name: c.name, label: c.name, count: c.count })),
  ];

  return (
    <div style={{
      background: BLACK, borderBottom: '2px solid #1c1c1c',
      position: 'sticky', top: 0, zIndex: 40,
      backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 8px,rgba(201,168,76,0.02) 8px,rgba(201,168,76,0.02) 9px)',
    }}>
      <div style={{
        maxWidth: 1400, margin: '0 auto', padding: '10px 32px 0',
        display: 'flex', alignItems: 'flex-end', gap: 3,
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {tabs.map(cat => {
          const isActive = active === cat.name;
          return (
            <motion.button
              key={cat.name ?? '__all__'}
              onClick={() => onChange(cat.name)}
              whileHover={!isActive ? { y: -3 } : {}}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                padding: '9px 20px',
                display: 'flex', alignItems: 'center', gap: 8,
                whiteSpace: 'nowrap', position: 'relative',
                background: GOLD,
                borderTop: isActive ? '2px solid #f0d870' : '2px solid #8a6820',
                borderRight: '1px solid #8a6820',
                borderLeft: '1px solid #8a6820',
                borderBottom: 'none',
                boxShadow: isActive ? 'inset 0 -2px 8px rgba(0,0,0,0.3)' : 'inset 0 -3px 6px rgba(0,0,0,0.4)',
              }}>
                {isActive && <div style={{ position: 'absolute', bottom: -3, left: 0, right: 0, height: 4, background: GOLD, zIndex: 2 }} />}
                <span style={{
                  fontFamily: 'var(--font-stencil, monospace)',
                  fontSize: 11, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: BLACK,
                  fontWeight: isActive ? 700 : 500,
                  position: 'relative', zIndex: 1,
                }}>{cat.label}</span>
                {cat.count > 0 && (
                  <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(8,7,6,0.45)', position: 'relative', zIndex: 1 }}>{cat.count}</span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, index }: { product: HarleyProduct; index: number }) {
  const [imgErr, setImgErr] = useState(false);
  const src = product.image_url ?? product.image_urls?.[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.5), type: 'spring', stiffness: 280, damping: 22 }}
    >
      <Link href={`/browse/${product.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
        <motion.div
          whileHover={{ y: -3, boxShadow: `0 4px 16px rgba(201,168,76,0.18)` }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          style={{ background: WHITE, border: '1.5px solid #b8952e', overflow: 'hidden' }}
        >
          <div style={{ aspectRatio: '1', background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
            {src && !imgErr ? (
              <img src={src} alt={product.name} onError={() => setImgErr(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 10 }} />
            ) : (
              <span style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: 2, color: '#9a9a9a', textTransform: 'uppercase' }}>No Image</span>
            )}
            {!product.in_stock && (
              <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.94)', border: '1px solid #2a2a2a', fontFamily: 'var(--font-stencil, monospace)', fontSize: 8, letterSpacing: 1, color: '#2a2a2a', padding: '3px 7px', textTransform: 'uppercase' }}>Out of Stock</div>
            )}
            {product.is_harley_fitment && (
              <div style={{ position: 'absolute', top: 8, left: 8, background: WHITE, border: '1px solid #2a2a2a', fontFamily: 'var(--font-stencil, monospace)', fontSize: 8, letterSpacing: 1, color: '#2a2a2a', padding: '3px 7px', textTransform: 'uppercase' }}>HD Fit</div>
            )}
          </div>
          <div style={{ padding: '12px 14px 16px', borderTop: '1px solid #e1e1e1' }}>
            <div style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 8, letterSpacing: 2, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>{product.brand}</div>
            <div style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 12, color: '#1f1f1f', lineHeight: 1.3, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 20, letterSpacing: 1, color: '#1d1d1d' }}>{fmt(product.price)}</div>
              <motion.button
                whileHover={{ scale: 1.08, background: '#2a2a2a', color: WHITE }}
                whileTap={{ scale: 0.93 }}
                onClick={e => e.preventDefault()}
                style={{ background: WHITE, border: '1px solid #2a2a2a', color: '#2a2a2a', width: 30, height: 30, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >+</motion.button>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function PaginationBtn({ children, active, disabled, onClick }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: active ? GOLD : '#f5f5f5',
      border: `1px solid ${active ? GOLD : '#e0e0e0'}`,
      color: active ? BLACK : disabled ? '#ccc' : '#666',
      fontFamily: 'var(--font-stencil, monospace)', fontSize: 10,
      padding: '7px 14px', cursor: disabled ? 'default' : 'pointer',
      minWidth: 36, letterSpacing: '0.1em', transition: 'all 0.15s',
    }}>{children}</button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModelProductPage({ params }: { params: Promise<{ family: string; model: string }> }) {
  const { family, model } = use(params);
  const familyLabel = FAMILY_LABELS[family] ?? family;
  const modelLabel  = toLabel(model);

  const [products, setProducts]   = useState<HarleyProduct[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [sort, setSort]           = useState('relevance');
  const [category, setCategory]   = useState<string | null>(null);
  const [facets, setFacets]       = useState<{ categories: { name: string; count: number }[] }>({ categories: [] });
  const [yearRange, setYearRange] = useState<{ min: number; max: number } | null>(null);
  const [yearFilter, setYearFilter] = useState<[number, number] | null>(null);
  const [yearInit, setYearInit]   = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE), sort });
      if (category)        p.set('category', category);
      if (yearFilter?.[0]) p.set('year_min', String(yearFilter[0]));
      if (yearFilter?.[1]) p.set('year_max', String(yearFilter[1]));

      const res  = await fetch(`/api/harley/${family}/${model}/products?${p}`);
      const data = await res.json();

      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
      setFacets(data.facets ?? { categories: [] });

      if (data.year_range?.min && !yearInit) {
        setYearRange(data.year_range);
        setYearFilter([data.year_range.min, data.year_range.max]);
        setYearInit(true);
      }
    } finally {
      setLoading(false);
    }
  }, [family, model, page, sort, category, yearFilter, yearInit]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <>
      <style>{`
        @font-face { font-family: 'New Sailor'; src: url('/New_Sailor.ttf') format('truetype'); font-display: swap; }
        @keyframes shimmer { from { background-position: -600px 0; } to { background-position: 600px 0; } }
      `}</style>

      <div style={{ background: '#f0ede8', minHeight: '100vh' }}>

        {/* Hero */}
        <div style={{ position: 'relative', background: '#f0ede8', borderBottom: '1px solid #ddd8d0' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: GOLD }} />
          <div style={{ padding: '28px 40px 16px', maxWidth: 1400, margin: '0 auto' }}>

            {/* Breadcrumb */}
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/modelshop" style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.18em', color: '#888', textDecoration: 'none', textTransform: 'uppercase' }}>Families</Link>
              <span style={{ color: '#bbb' }}>›</span>
              <Link href={`/harley/${family}`} style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.18em', color: '#888', textDecoration: 'none', textTransform: 'uppercase' }}>{familyLabel}</Link>
              <span style={{ color: '#bbb' }}>›</span>
              <span style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.18em', color: GOLD, textTransform: 'uppercase' }}>{modelLabel}</span>
            </div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 'clamp(40px, 7vw, 80px)', letterSpacing: '0.04em', lineHeight: 0.92, color: '#111', margin: 0 }}
            >{modelLabel}</motion.h1>

            {/* Year filter */}
            {yearRange && yearFilter && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#888' }}>Year:</span>
                {([0, 1] as const).map(i => (
                  <input key={i} type="number" min={yearRange.min} max={yearRange.max}
                    value={yearFilter[i]}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10);
                      if (isNaN(n)) return;
                      setYearFilter(i === 0 ? [n, yearFilter[1]] : [yearFilter[0], n]);
                      setPage(1);
                    }}
                    style={{ width: 72, background: 'transparent', border: 'none', borderBottom: `1px solid ${GOLD}`, color: '#111', fontFamily: 'var(--font-stencil, monospace)', fontSize: 13, padding: '4px 6px', outline: 'none', textAlign: 'center' }}
                  />
                ))}
                <span style={{ color: '#aaa', fontSize: 11 }}>({yearRange.min}–{yearRange.max})</span>
                {total > 0 && (
                  <span style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.18em', color: '#888', textTransform: 'uppercase', marginLeft: 8 }}>
                    {total.toLocaleString()} parts
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <CategoryTabBar
          categories={facets.categories}
          active={category}
          onChange={v => { setCategory(v); setPage(1); }}
        />

        {/* Product grid */}
        <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto', background: WHITE }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: '0.85', background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '600px 100%', animation: 'shimmer 1.4s infinite' }} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
              <div style={{ fontFamily: "var(--font-caesar, 'Bebas Neue', sans-serif)", fontSize: 36, letterSpacing: '0.04em', color: '#ccc' }}>No Parts Found</div>
              <button onClick={() => { setCategory(null); setYearFilter(yearRange ? [yearRange.min, yearRange.max] : null); setPage(1); }}
                style={{ background: 'none', border: `1px solid ${GOLD}44`, color: GOLD, fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '10px 24px', cursor: 'pointer' }}>
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 56, flexWrap: 'wrap' }}>
                  <PaginationBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</PaginationBtn>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    const pg = page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                    if (pg < 1 || pg > totalPages) return null;
                    return <PaginationBtn key={pg} active={pg === page} onClick={() => setPage(pg)}>{pg}</PaginationBtn>;
                  })}
                  <PaginationBtn disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</PaginationBtn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}