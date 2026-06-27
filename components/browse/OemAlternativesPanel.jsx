'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// Routes LeMans/PU images through the local proxy (same as ProductImageGallery)
function resolveImageSrc(url) {
  if (!url) return null;
  if (url.includes('asset.lemansnet.com') || url.includes('lemans')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const VENDOR_COLORS = {
  PU:    { bg: '#e8edf8', color: '#2a4a7a', label: 'PU' },
  WPS:   { bg: '#fdf0e3', color: '#7a3810', label: 'WPS' },
  VTWIN: { bg: '#e8f5e3', color: '#2a5a2a', label: 'VTwin' },
};

function useOutsideClick(ref, callback) {
  useEffect(() => {
    function handler(e) {
      if (!ref.current || ref.current.contains(e.target)) return;
      callback(e);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [ref, callback]);
}

// ── Collapsed list row ────────────────────────────────────────────────────────

function OemRow({ product, onExpand, isLast, isChain }) {
  const vc = VENDOR_COLORS[product.source_vendor] ?? { bg: '#f0ece4', color: '#5a4a2a', label: product.source_vendor };

  return (
    <button
      onClick={() => onExpand(product)}
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr auto',
        alignItems: 'center',
        gap: 16,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid #ede5d0',
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#ede8df'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: 8,
        background: '#f5f0e8',
        border: '1px solid #e6dcc0',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {product.image_url ? (
          <img
            src={resolveImageSrc(product.image_url)}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
            loading="lazy"
          />
        ) : (
          <div style={{ fontFamily: 'var(--font-stencil)', fontSize: 7, color: '#c9a84c', letterSpacing: '0.06em', textAlign: 'center', lineHeight: 1.4 }}>
            NO<br/>IMAGE
          </div>
        )}
      </div>

      {/* Brand + name + badges */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 9,
            letterSpacing: '0.07em',
            color: vc.color,
            background: vc.bg,
            borderRadius: 4,
            padding: '2px 7px',
          }}>
            {vc.label}
          </span>
          {product.is_kit && (
            <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 8, color: '#5a5ab0', background: '#eaeaf5', borderRadius: 4, padding: '2px 6px' }}>KIT</span>
          )}
          {isChain && (
            <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 8, color: '#8a7040', background: '#fdf6e3', border: '1px solid #e6dcc0', borderRadius: 4, padding: '2px 6px' }}>SUPERSESSION</span>
          )}
        </div>
        {product.brand && (
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 10,
            color: '#c9a84c',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 3,
          }}>
            {product.brand}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-bespoke)',
          fontSize: 15,
          fontWeight: 600,
          color: '#1a1208',
          lineHeight: 1.3,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {product.name}
        </div>
      </div>

      {/* Price + cta */}
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-tanker)',
          fontSize: 20,
          color: '#c9a84c',
          letterSpacing: '0.03em',
          lineHeight: 1,
          marginBottom: 4,
        }}>
          ${Number(product.price ?? 0).toFixed(2)}
        </div>
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 9,
          color: '#8a7040',
          letterSpacing: '0.1em',
          background: '#f5f0e8',
          border: '1px solid #e6dcc0',
          borderRadius: 4,
          padding: '3px 8px',
          display: 'inline-block',
        }}>
          DETAILS →
        </div>
      </div>
    </button>
  );
}

// ── Expanded overlay ──────────────────────────────────────────────────────────

function OemExpanded({ product, onClose }) {
  const ref = useRef(null);
  useOutsideClick(ref, onClose);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const vc = VENDOR_COLORS[product.source_vendor] ?? { bg: '#f0ece4', color: '#5a4a2a', label: product.source_vendor };
  const details = product.product_details || {};
  const features = details.features?.slice(0, 4) ?? [];
  const description = details.description ?? null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'rgba(26,18,8,0.65)',
      backdropFilter: 'blur(4px)',
    }}>
      <div
        ref={ref}
        style={{
          background: '#f5f0e8',
          borderRadius: 14,
          width: '100%',
          maxWidth: 560,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1px solid #e6dcc0',
            background: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-stencil)',
            fontSize: 12,
            color: '#5a4a2a',
            zIndex: 1,
          }}
        >
          ✕
        </button>

        {/* Image */}
        <div style={{
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#ffffff',
          borderRadius: '14px 14px 0 0',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {product.image_url ? (
            <img
              src={resolveImageSrc(product.image_url)}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 24 }}
            />
          ) : (
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              color: '#c9a84c',
              letterSpacing: '0.08em',
            }}>
              NO IMAGE
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px 24px' }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 9,
              letterSpacing: '0.07em',
              color: vc.color,
              background: vc.bg,
              borderRadius: 4,
              padding: '3px 7px',
            }}>
              {vc.label}
            </span>
            {product.via_chain && (
              <span style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 9,
                color: '#8a7040',
                background: '#fdf6e3',
                border: '1px solid #e6dcc0',
                borderRadius: 4,
                padding: '3px 7px',
              }}>
                OEM SUPERSESSION
              </span>
            )}
            {product.is_kit && (
              <span style={{
                fontFamily: 'var(--font-stencil)',
                fontSize: 9,
                color: '#5a5ab0',
                background: '#eaeaf5',
                borderRadius: 4,
                padding: '3px 7px',
              }}>
                KIT
              </span>
            )}
          </div>

          {/* Brand */}
          {product.brand && (
            <div style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 10,
              color: '#c9a84c',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              {product.brand}
            </div>
          )}

          {/* Name */}
          <div style={{
            fontFamily: 'var(--font-bespoke)',
            fontSize: 20,
            fontWeight: 600,
            color: '#1a1208',
            lineHeight: 1.25,
            marginBottom: 10,
          }}>
            {product.name}
          </div>

          {/* Price */}
          <div style={{
            fontFamily: 'var(--font-bespoke)',
            fontSize: 26,
            fontWeight: 700,
            color: '#c9a84c',
            marginBottom: 16,
          }}>
            ${Number(product.price ?? 0).toFixed(2)}
          </div>

          {/* Gold divider */}
          <div style={{
            height: 2,
            background: 'linear-gradient(90deg, #c9a84c 0%, rgba(201,168,76,0.1) 100%)',
            borderRadius: 2,
            marginBottom: 16,
          }} />

          {/* Description */}
          {description && (
            <p style={{
              fontFamily: 'var(--font-bespoke)',
              fontSize: 13,
              color: '#3a2e1a',
              lineHeight: 1.6,
              marginBottom: features.length ? 12 : 20,
            }}>
              {description}
            </p>
          )}

          {/* Features */}
          {features.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#c9a84c', flexShrink: 0, lineHeight: '1.6', fontSize: 12 }}>›</span>
                  <span style={{ fontFamily: 'var(--font-bespoke)', fontSize: 13, color: '#3a2e1a', lineHeight: 1.55 }}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* CTA */}
          <Link
            href={`/browse/${product.slug}`}
            style={{
              display: 'block',
              width: '100%',
              padding: '13px 24px',
              background: '#c9a84c',
              border: 'none',
              borderRadius: 8,
              fontFamily: 'var(--font-tanker)',
              fontSize: 17,
              letterSpacing: '0.06em',
              color: '#1a1208',
              cursor: 'pointer',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            VIEW FULL PRODUCT
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function OemAlternativesPanel({ alternatives, oemRows }) {
  const [active, setActive] = useState(null);

  if (!alternatives || alternatives.length === 0) return null;

  const myOems = oemRows
    .filter(r => r.oem_format?.startsWith('hd_oem') && !r.expanded_from)
    .map(r => r.oem_number);

  const direct = alternatives.filter(a => !a.via_chain);
  const chain  = alternatives.filter(a => a.via_chain);

  return (
    <section style={{ maxWidth: 1100, margin: '32px auto 0', padding: '0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
        <div style={{
          fontFamily: 'var(--font-tanker)',
          fontSize: 26,
          letterSpacing: '0.04em',
          color: '#1a1208',
          textTransform: 'uppercase',
        }}>
          All Options for This OEM Slot
        </div>
        {myOems.length > 0 && (
          <div style={{
            fontFamily: 'var(--font-stencil)',
            fontSize: 11,
            color: '#c9a84c',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            background: '#fdf6e3',
            border: '1px solid #e6dcc0',
            borderRadius: 4,
            padding: '3px 8px',
          }}>
            OEM {myOems.join(' · ')}
          </div>
        )}
      </div>

      {/* Direct matches */}
      {direct.length > 0 && (
        <div style={{ border: '1px solid #e6dcc0', borderRadius: 10, overflow: 'hidden' }}>
          {direct.map((p, i) => (
            <OemRow
              key={p.id}
              product={p}
              isChain={false}
              isLast={i === direct.length - 1}
              onExpand={setActive}
            />
          ))}
        </div>
      )}

      {/* Chain matches */}
      {chain.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
            <div style={{ flex: 1, height: 1, background: '#e6dcc0' }} />
            <span style={{ fontFamily: 'var(--font-stencil)', fontSize: 9, color: '#8a7040', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Via OEM Supersession Chain
            </span>
            <div style={{ flex: 1, height: 1, background: '#e6dcc0' }} />
          </div>
          <div style={{ border: '1px solid #e6dcc0', borderRadius: 10, overflow: 'hidden' }}>
            {chain.map((p, i) => (
              <OemRow
                key={p.id}
                product={p}
                isChain={true}
                isLast={i === chain.length - 1}
                onExpand={setActive}
              />
            ))}
          </div>
        </>
      )}

      {/* Expanded overlay */}
      {active && (
        <OemExpanded product={active} onClose={() => setActive(null)} />
      )}
    </section>
  );
}
