'use client';
// ============================================================
// components/pdp/OemPartTimeline.jsx
//
// Renders two panels on the PDP:
//   LEFT  — all products sharing the current OEM number
//           (click any row → quick-view modal)
//   RIGHT — horizontal carousel of the full part-number family
//           across years (older → current → newer)
//           clicking a non-current year card opens its product
//           page in a new tab (first product in that OEM group)
//
// Props:
//   timeline  — OemPartTimeline object from getOemPartTimeline()
//   currentProductId — number, used to highlight the active row
//
// Usage in PDP page (server component):
//   const timeline = await getOemPartTimeline(product.id);
//   {timeline && (
//     <OemPartTimeline timeline={timeline} currentProductId={product.id} />
//   )}
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Palette (matches site-wide tokens) ───────────────────────
const GOLD   = '#c9a84c';
const GOLD_L = 'rgba(201,168,76,0.10)';
const GOLD_B = 'rgba(201,168,76,0.22)';
const CREAM  = '#fdfbf4';
const CREAM2 = '#f5f0e6';
const DARK   = '#1a1208';
const MUTED  = '#8a7040';
const BORDER = '#e6dcc0';

// ── Image proxy (matches resolveImageSrc in ProductImage.jsx) ─
function resolveImageSrc(url) {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    if (hostname === 'asset.lemansnet.com') {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch { /* relative url — leave as-is */ }
  return url;
}

// ── Helpers ───────────────────────────────────────────────────

function formatPrice(msrp) {
  if (msrp == null) return null;
  return `$${Number(msrp).toFixed(2)}`;
}

function formatPackQty(qty) {
  if (!qty || qty <= 1) return 'Single';
  return `${qty}-pack`;
}

// Group timeline entries by their OEM number, preserving order.
// Returns [{ oemNumber, year, entries, firstSlug }]
function groupByOem(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.oemNumber)) {
      map.set(e.oemNumber, { oemNumber: e.oemNumber, year: e.computedYear, entries: [], firstSlug: e.slug });
    }
    map.get(e.oemNumber).entries.push(e);
  }
  return [...map.values()];
}

// ── Sub-components ────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-stencil, monospace)',
      fontSize: 9,
      color: MUTED,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function ProductThumb({ entry, isActive, onClick }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = resolveImageSrc(entry.imageUrl);

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${isActive ? GOLD : BORDER}`,
        background: isActive ? GOLD_L : 'transparent',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        marginBottom: 4,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = GOLD_B;
          e.currentTarget.style.background = 'rgba(201,168,76,0.04)';
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = BORDER;
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 38, height: 38,
        flexShrink: 0,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {src && !imgFailed ? (
          <img
            src={src}
            alt={entry.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
          />
        ) : (
          <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 8, color: '#c4b48a' }}>—</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-bespoke)',
          fontSize: 12,
          color: DARK,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entry.name}
        </div>
        {entry.packQty > 1 && (
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 9,
            color: MUTED,
            letterSpacing: '0.04em',
            marginTop: 1,
          }}>
            {formatPackQty(entry.packQty)}
          </div>
        )}
      </div>

      {/* Price */}
      {entry.msrp != null && (
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 12,
          color: isActive ? '#7a5810' : MUTED,
          flexShrink: 0,
          letterSpacing: '0.02em',
        }}>
          {formatPrice(entry.msrp)}
        </div>
      )}
    </button>
  );
}

function YearCard({ group, bucket, onClick }) {
  const isCurrent = bucket === 'current';
  const count = group.entries.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      {/* Year label */}
      <div style={{
        fontFamily: 'var(--font-stencil)',
        fontSize: 9,
        color: MUTED,
        letterSpacing: '0.08em',
        marginBottom: 6,
      }}>
        {group.year}
      </div>

      {/* Card */}
      <button
        onClick={isCurrent ? undefined : onClick}
        style={{
          width: 112,
          padding: '10px 12px',
          borderRadius: 10,
          border: isCurrent ? `1.5px solid ${GOLD}` : `1px solid ${BORDER}`,
          background: isCurrent ? GOLD_L : CREAM,
          cursor: isCurrent ? 'default' : 'pointer',
          textAlign: 'center',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          if (!isCurrent) {
            e.currentTarget.style.borderColor = GOLD_B;
            e.currentTarget.style.background = 'rgba(201,168,76,0.04)';
          }
        }}
        onMouseLeave={e => {
          if (!isCurrent) {
            e.currentTarget.style.borderColor = BORDER;
            e.currentTarget.style.background = CREAM;
          }
        }}
      >
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 11,
          fontWeight: 500,
          color: isCurrent ? '#7a5810' : DARK,
          marginBottom: 4,
          letterSpacing: '0.04em',
        }}>
          {group.oemNumber}
        </div>
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 9,
          color: MUTED,
          letterSpacing: '0.04em',
        }}>
          {count} option{count !== 1 ? 's' : ''}
        </div>

        {/* Bucket badge */}
        <div style={{
          display: 'inline-block',
          marginTop: 6,
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 9,
          fontFamily: 'var(--font-stencil)',
          letterSpacing: '0.06em',
          background: isCurrent
            ? GOLD_B
            : bucket === 'older'
            ? 'rgba(0,0,0,0.04)'
            : 'rgba(90,138,74,0.12)',
          color: isCurrent
            ? '#7a5810'
            : bucket === 'older'
            ? MUTED
            : '#5a8a4a',
          border: isCurrent
            ? `1px solid ${GOLD_B}`
            : bucket === 'older'
            ? `1px solid ${BORDER}`
            : '1px solid rgba(90,138,74,0.22)',
        }}>
          {isCurrent ? 'viewing' : bucket === 'older' ? '← older' : 'newer →'}
        </div>
      </button>
    </div>
  );
}

function Connector() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      paddingTop: 30,
      color: BORDER,
      flexShrink: 0,
      fontSize: 16,
    }}>
      →
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────

function ProductModal({ entry, onClose }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = resolveImageSrc(entry?.imageUrl);

  // Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!entry) return null;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="tl-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: '#000',
          zIndex: 500,
          cursor: 'pointer',
        }}
      />

      {/* Panel */}
      <motion.div
        key="tl-modal"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 440, damping: 38 }}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 501,
          width: 'min(360px, 92vw)',
          background: CREAM2,
          boxShadow: `0 32px 96px rgba(0,0,0,0.45), 0 0 0 1px ${GOLD_B}`,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: `1px solid ${GOLD_B}`,
          background: CREAM2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 6V1H6" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{
              fontFamily: 'var(--font-stencil, monospace)',
              fontSize: 9, letterSpacing: '3px',
              color: GOLD, textTransform: 'uppercase',
            }}>
              Part Details
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none',
              cursor: 'pointer', color: '#999',
              fontSize: 22, lineHeight: 1, padding: '0 4px',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = DARK; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#999'; }}
          >×</button>
        </div>

        {/* Image */}
        <div style={{
          height: 160,
          background: '#fff',
          borderBottom: `1px solid ${GOLD_B}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}>
          {src && !imgFailed ? (
            <img
              src={src}
              alt={entry.name}
              onError={() => setImgFailed(true)}
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              color: '#c4b48a',
              letterSpacing: '0.08em',
            }}>
              NO IMAGE
            </div>
          )}
        </div>

        {/* Details */}
        <div style={{ padding: '16px 18px 0' }}>
          <div style={{
            fontFamily: 'var(--font-tanker, var(--font-sailor, sans-serif))',
            fontSize: 17,
            fontWeight: 400,
            color: DARK,
            lineHeight: 1.25,
            marginBottom: 14,
          }}>
            {entry.name}
          </div>

          {[
            { label: 'OEM number', value: entry.oemNumber },
            { label: 'Brand', value: entry.brand || '—' },
            { label: 'Pack quantity', value: formatPackQty(entry.packQty) },
            { label: 'Price', value: formatPrice(entry.msrp) || '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 0',
              borderBottom: `1px solid ${GOLD_B}`,
            }}>
              <span style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 9,
                color: MUTED,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
                {label}
              </span>
              <span style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 11,
                color: DARK,
                letterSpacing: '0.04em',
              }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div style={{ padding: '14px 18px 18px' }}>
          <a
            href={`/browse/${entry.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '11px 0',
              background: GOLD,
              border: 'none',
              color: '#fff',
              fontFamily: 'var(--font-stencil, monospace)',
              fontSize: 10,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#a07820'; }}
            onMouseLeave={e => { e.currentTarget.style.background = GOLD; }}
          >
            View Product Page
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main component ────────────────────────────────────────────

export default function OemPartTimeline({ timeline, currentProductId }) {
  const [modalEntry, setModalEntry] = useState(null);
  const carouselRef = useRef(null);

  const openModal = useCallback((entry) => setModalEntry(entry), []);
  const closeModal = useCallback(() => setModalEntry(null), []);

  if (!timeline) return null;

  // Left panel: current product + same-year siblings
  const leftOptions = [...timeline.current, ...timeline.sameYear];

  // Right carousel: older groups → current groups → newer groups
  const olderGroups = groupByOem(timeline.older);
  const currentGroups = groupByOem(timeline.current);
  const newerGroups = groupByOem(timeline.newer);

  const hasCarousel =
    olderGroups.length > 0 || newerGroups.length > 0;

  return (
    <>
      <div style={{
        padding: '28px 28px 32px',
        borderTop: `1px solid ${BORDER}`,
      }}>
        {/* Section heading */}
        <div style={{
          fontFamily: 'var(--font-stencil, monospace)',
          fontSize: 9,
          color: MUTED,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          OEM #{timeline.currentOemNumbers.join(' · ')} — Part History
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: hasCarousel ? '260px 1fr' : '1fr',
          gap: 16,
          alignItems: 'start',
        }}>

          {/* ── LEFT: product options for current OEM number ── */}
          <div style={{
            background: CREAM,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '14px 12px',
          }}>
            <SectionLabel>
              Options for {timeline.currentOemNumbers[0]}
            </SectionLabel>

            {leftOptions.map((entry) => (
              <ProductThumb
                key={`${entry.oemNumber}-${entry.productId}`}
                entry={entry}
                isActive={entry.productId === currentProductId}
                onClick={() => openModal(entry)}
              />
            ))}
          </div>

          {/* ── RIGHT: year carousel ── */}
          {hasCarousel && (
            <div style={{
              background: CREAM,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '14px 12px',
            }}>
              <SectionLabel>Other versions of this part</SectionLabel>

              <div
                ref={carouselRef}
                style={{
                  display: 'flex',
                  gap: 10,
                  overflowX: 'auto',
                  paddingBottom: 8,
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${GOLD_B} transparent`,
                }}
              >
                {olderGroups.map((group, i) => (
                  <div key={group.oemNumber} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <YearCard
                      group={group}
                      bucket="older"
                      onClick={() => window.open(`/browse/${group.firstSlug}`, '_blank')}
                    />
                    {(i < olderGroups.length - 1 || currentGroups.length > 0) && (
                      <Connector />
                    )}
                  </div>
                ))}

                {currentGroups.map((group, i) => (
                  <div key={group.oemNumber} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <YearCard group={group} bucket="current" />
                    {i < currentGroups.length - 1 || newerGroups.length > 0 ? (
                      <Connector />
                    ) : null}
                  </div>
                ))}

                {newerGroups.map((group, i) => (
                  <div key={group.oemNumber} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <YearCard
                      group={group}
                      bucket="newer"
                      onClick={() => window.open(`/browse/${group.firstSlug}`, '_blank')}
                    />
                    {i < newerGroups.length - 1 && <Connector />}
                  </div>
                ))}
              </div>

              <div style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 9,
                color: MUTED,
                letterSpacing: '0.06em',
                marginTop: 6,
              }}>
                Selecting a different version opens its product page in a new tab
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {modalEntry && (
          <ProductModal
            key="tl-modal"
            entry={modalEntry}
            onClose={closeModal}
          />
        )}
      </AnimatePresence>
    </>
  );
}
