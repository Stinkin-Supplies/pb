'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function ShimmerLine({ h = 18, mb = 6, w = '100%' }) {
  return (
    <div style={{
      height: h,
      marginBottom: mb,
      width: w,
      borderRadius: 4,
      background: 'linear-gradient(90deg, #221c10 25%, #2e2415 50%, #221c10 75%)',
      backgroundSize: '200% 100%',
      animation: 'ss-shimmer 1.4s ease-in-out infinite',
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InlinePanel({ product, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openAxis, setOpenAxis] = useState(null);
  const [showAllFitment, setShowAllFitment] = useState(false);

  useEffect(() => {
    if (!product?.id) return;
    setLoading(true);
    setData(null);
    setShowAllFitment(false);

    fetch(`/api/browse/panel?id=${product.id}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        // Auto-open first axis
        const axes = [...new Set(
          (d.variants ?? []).map(v => v.option_1_name).filter(Boolean)
        )];
        if (axes.length) setOpenAxis(axes[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [product?.id]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const variantsByAxis = {};
  for (const v of (data?.variants ?? [])) {
    const axis = v.option_1_name ?? 'Options';
    if (!variantsByAxis[axis]) variantsByAxis[axis] = [];
    variantsByAxis[axis].push(v);
  }
  const axes = Object.keys(variantsByAxis);

  const fitmentRows = data?.fitment ?? [];
  const visibleFitment = showAllFitment ? fitmentRows : fitmentRows.slice(0, 8);
  const oemRows = data?.oem ?? [];

  const hasVariants = axes.length > 0;
  const hasOem = !loading && oemRows.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{
        background: '#14100a',
        border: '1px solid #2a2010',
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 6,
        marginBottom: 14,
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid #2a2010',
        background: '#0e0b06',
      }}>
        <span style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 11,
          color: '#c9a84c',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          maxWidth: 'calc(100% - 32px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {product?.name}
        </span>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            background: 'none', border: 'none',
            color: '#6b5a3a', cursor: 'pointer',
            fontSize: 20, lineHeight: 1, padding: '0 2px',
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* ── Body: variants (left) + fitment (right) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: hasVariants ? '1fr 1fr' : '1fr',
        gap: 0,
      }}>

        {/* Variants column */}
        {(hasVariants || (loading)) && (
          <div style={{
            borderRight: '1px solid #2a2010',
            padding: '14px 16px',
            minWidth: 0,
          }}>
            <div style={sectionLabel}>Variants</div>

            {loading && (
              <>
                <ShimmerLine h={34} mb={5} />
                <ShimmerLine h={34} mb={5} />
                <ShimmerLine h={34} />
              </>
            )}

            {!loading && axes.map(axis => (
              <div key={axis} style={{ marginBottom: 10 }}>
                {/* Axis toggle (only shown when >1 axis) */}
                {axes.length > 1 && (
                  <button
                    onClick={() => setOpenAxis(openAxis === axis ? null : axis)}
                    style={{
                      width: '100%', background: 'none', border: 'none',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '5px 0',
                      color: '#c9a84c',
                      fontFamily: 'var(--font-stencil)',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {axis}
                    <span style={{
                      display: 'inline-block',
                      transform: openAxis === axis ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.18s',
                    }}>▾</span>
                  </button>
                )}

                {(axes.length === 1 || openAxis === axis) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {variantsByAxis[axis].map(v => {
                      const isCurrent = v.product_id === product.id;
                      return (
                        <button
                          key={v.product_id}
                          onClick={() => { if (!isCurrent) router.push(`/browse/${v.slug}`); }}
                          style={{
                            background: isCurrent ? '#26200f' : 'transparent',
                            border: `1px solid ${isCurrent ? '#c9a84c' : '#2a2010'}`,
                            borderRadius: 6,
                            padding: '7px 10px',
                            cursor: isCurrent ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            textAlign: 'left',
                            transition: 'border-color 0.12s, background 0.12s',
                          }}
                        >
                          {isCurrent && (
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: '#c9a84c', flexShrink: 0,
                            }} />
                          )}
                          <span style={{
                            fontFamily: 'var(--font-stencil)',
                            fontSize: 11,
                            color: isCurrent ? '#c9a84c' : '#c4b48a',
                            fontWeight: isCurrent ? '600' : '400',
                            flex: 1,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}>
                            {v.option_1_value ?? '—'}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-bespoke)',
                            fontSize: 12,
                            color: '#7a6840',
                          }}>
                            ${v.price != null ? Number(v.price).toFixed(2) : '—'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Fitment column */}
        <div style={{ padding: '14px 16px', minWidth: 0 }}>
          <div style={sectionLabel}>Fitment Guide</div>

          {loading && (
            <>
              <ShimmerLine h={18} mb={5} />
              <ShimmerLine h={18} mb={5} w="80%" />
              <ShimmerLine h={18} mb={5} />
              <ShimmerLine h={18} mb={5} w="90%" />
            </>
          )}

          {!loading && fitmentRows.length === 0 && (
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 11,
              color: '#5a4a2a',
              lineHeight: 1.5,
            }}>
              No fitment data — see description or contact us
            </div>
          )}

          {!loading && fitmentRows.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {visibleFitment.map((row, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    borderBottom: '1px solid #1c1608',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-stencil)',
                      fontSize: 11,
                      color: '#c9a84c',
                      letterSpacing: '0.04em',
                    }}>
                      {row.model_name ? `${row.model_name} (${row.model_code})` : row.model_code}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-stencil)',
                      fontSize: 11,
                      color: '#8a7040',
                    }}>
                      {row.year_from === row.year_to
                        ? String(row.year_from)
                        : `${row.year_from}–${row.year_to}`}
                    </span>
                    <span style={{ marginLeft: 'auto', color: '#3a6a3a', fontSize: 12 }}>✓</span>
                  </div>
                ))}
              </div>

              {fitmentRows.length > 8 && (
                <button
                  onClick={() => setShowAllFitment(v => !v)}
                  style={{
                    marginTop: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 10,
                    color: '#c9a84c',
                    padding: 0,
                    textDecoration: 'underline',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {showAllFitment
                    ? 'Show fewer'
                    : `Show all ${fitmentRows.length} models`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Footer: OEM cross-reference ── */}
      {hasOem && (
        <div style={{
          borderTop: '1px solid #2a2010',
          padding: '12px 16px',
          background: '#0e0b06',
        }}>
          <div style={{ ...sectionLabel, marginBottom: 10 }}>OEM Cross-Reference</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {oemRows.map((row, i) => {
              const tag = row.is_kit
                ? 'KIT INCLUDES OEM'
                : row.via_chain
                ? 'OEM CHAIN'
                : 'EXACT OEM MATCH';
              const tagColor = row.is_kit
                ? '#7a5a20'
                : row.via_chain
                ? '#2a5a7a'
                : '#2a6a3a';

              return (
                <button
                  key={i}
                  onClick={() => router.push(`/browse/${row.slug}`)}
                  style={{
                    background: '#18130c',
                    border: '1px solid #2a2010',
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    minWidth: 140,
                    maxWidth: 200,
                    transition: 'border-color 0.12s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 9,
                    color: tagColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.09em',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    {row.via_chain && <ChainIcon />}
                    {tag}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-bespoke)',
                    fontSize: 12,
                    color: '#c4b48a',
                    marginBottom: 3,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {row.name}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 11,
                    color: '#c9a84c',
                  }}>
                    ${row.price != null ? Number(row.price).toFixed(2) : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ss-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </motion.div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const sectionLabel = {
  fontFamily: 'var(--font-stencil)',
  fontSize: 9,
  color: '#5a4a2a',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 8,
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChainIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}
