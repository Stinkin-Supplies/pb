'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ProductCard — extracted from browse/page.jsx (session 50).
 *
 * New props:
 *   selected  — warm bg + 2px gold border + glow
 *   onSelect  — if provided, card click calls this instead of navigating to PDP
 *               the + button always navigates to PDP (via stopPropagation)
 *
 * OEM chain badge (bottom-right) shown when product.oem_chain_match === true.
 */

// PU's image_url values point at asset.lemansnet.com's /z/ endpoint, which
// serves a zip archive rather than a direct image. Route those through the
// server-side proxy that extracts the real photo; every other vendor's URL
// (WPS, VTwin) renders directly as before — that path was never broken.
function resolveImageSrc(url) {
  if (!url) return url;
  try {
    const { hostname } = new URL(url);
    if (hostname === 'asset.lemansnet.com') {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // not a valid absolute URL — leave as-is
  }
  return url;
}

export default function ProductCard({ product, selected = false, onSelect }) {
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);

  const handleCardClick = () => {
    if (onSelect) {
      onSelect();
    } else {
      router.push(`/browse/${product.slug}`);
    }
  };

  const handlePdpClick = (e) => {
    e.stopPropagation();
    router.push(`/browse/${product.slug}`);
  };

  const variantCount = product.variant_count ?? 0;
  const hasVariants  = variantCount > 1;

  // ── Cream palette (light card, gold-bordered when selected) ──────────────
  const bg          = selected ? '#fffbf0' : '#fdfbf4';
  const border      = selected ? '2px solid #c9a84c' : '1px solid #e6dcc0';
  const glow        = selected ? '0 0 0 3px rgba(201,168,76,0.22)' : 'none';
  const imageBg     = '#ffffff';
  const brandColor  = '#8a7040';
  const nameColor   = '#241a08';
  const priceColor  = selected ? '#7a5810' : '#a8842c';
  const btnBg       = '#c9a84c';
  const btnBorder   = '#b8963a';
  const btnColor    = '#1a1208';

  return (
    <div
      onClick={handleCardClick}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter') onSelect(); } : undefined}
      style={{
        position: 'relative',
        background: bg,
        border,
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: glow,
      }}
    >
      {/* ── Image ── */}
      <div style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: imageBg,
        overflow: 'hidden',
      }}>
        {product.image_url && !imageFailed ? (
          <img
            src={resolveImageSrc(product.image_url)}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', padding:10 }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-stencil)',
            fontSize: 10,
            letterSpacing: '0.08em',
            color: '#a89878',
          }}>
            NO IMAGE
          </div>
        )}

        {/* Variant count badge — bottom-left */}
        {hasVariants && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: 'rgba(14,11,6,0.85)',
            border: '1px solid #2e2415',
            borderRadius: 4,
            padding: '2px 7px',
            fontFamily: 'var(--font-stencil)',
            fontSize: 9,
            letterSpacing: '0.06em',
            color: '#c9a84c',
            backdropFilter: 'blur(4px)',
            textTransform: 'uppercase',
          }}>
            {variantCount} options
          </div>
        )}

        {/* OEM chain badge — bottom-right */}
        {product.oem_chain_match && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(14,11,6,0.9)',
            border: '1px solid #c9a84c',
            borderRadius: 4,
            padding: '2px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            backdropFilter: 'blur(4px)',
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
              stroke="#c9a84c" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span style={{
              fontFamily: 'var(--font-stencil)',
              fontSize: 8,
              color: '#c9a84c',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
            }}>
              OEM CHAIN
            </span>
          </div>
        )}
      </div>

      {/* ── Info ── */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{
          fontFamily: 'var(--font-stencil)',
          fontSize: 9,
          color: brandColor,
          marginBottom: 3,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {product.brand}
        </div>

        <div style={{
          fontFamily: 'var(--font-bespoke)',
          fontSize: 13,
          fontWeight: 500,
          color: nameColor,
          lineHeight: 1.35,
          marginBottom: 10,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {product.name}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'var(--font-bespoke)',
            fontSize: 15,
            fontWeight: 600,
            color: priceColor,
          }}>
            ${Number(product.price ?? 0).toFixed(2)}
          </div>

          {/* + always goes to PDP regardless of onSelect */}
          <button
            onClick={handlePdpClick}
            aria-label={`View ${product.name}`}
            style={{
              background: btnBg,
              border: `1px solid ${btnBorder}`,
              borderRadius: 6,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: btnColor,
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1,
              flexShrink: 0,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
