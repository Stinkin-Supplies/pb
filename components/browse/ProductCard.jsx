'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ProductCard — specification sheet tile
 *
 * Grid border style: thin 1px ruled lines + crosshair registration marks
 * at each corner (technical drawing / engineering blueprint aesthetic).
 *
 * The crosshair marks bleed 8px outside the card boundary, so the outer
 * wrapper must NOT use overflow:hidden — only the image div does.
 *
 * Props:
 *   product   — product row from browse API
 *   selected  — highlight state (warm gold border)
 *   onSelect  — if provided, card click calls this instead of navigating
 */

// PU's image_url values point at asset.lemansnet.com's /z/ endpoint, which
// serves a zip archive rather than a direct image. Route those through the
// server-side proxy that extracts the real photo.
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

// ── Registration mark corner crosshair ───────────────────────────────────────
// A single 16×16px element centered on the card corner.
// Two overlapping linear-gradients draw a 1px horizontal + 1px vertical line.
function RegMark({ pos, color }) {
  const style = {
    position: 'absolute',
    width: 20,
    height: 20,
    zIndex: 10,
    pointerEvents: 'none',
    backgroundImage: [
      `linear-gradient(to right,
        transparent 0,
        transparent calc(50% - 0.5px),
        ${color} calc(50% - 0.5px),
        ${color} calc(50% + 0.5px),
        transparent calc(50% + 0.5px))`,
      `linear-gradient(to bottom,
        transparent 0,
        transparent calc(50% - 0.5px),
        ${color} calc(50% - 0.5px),
        ${color} calc(50% + 0.5px),
        transparent calc(50% + 0.5px))`,
    ].join(', '),
  };
  if (pos === 'tl') { style.top = -10;    style.left   = -10; }
  if (pos === 'tr') { style.top = -10;    style.right  = -10; }
  if (pos === 'bl') { style.bottom = -10; style.left   = -10; }
  if (pos === 'br') { style.bottom = -10; style.right  = -10; }
  return <span aria-hidden="true" style={style} />;
}

export default function ProductCard({ product, selected = false, onSelect }) {
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);

  const handleCardClick = () => {
    if (onSelect) onSelect();
    else router.push(`/browse/${product.slug}`);
  };

  const handlePdpClick = (e) => {
    e.stopPropagation();
    router.push(`/browse/${product.slug}`);
  };

  const variantCount = product.variant_count ?? 0;
  const hasVariants  = variantCount > 1;

  // ── Tokens ───────────────────────────────────────────────────────────────
  const bg     = selected ? '#fffbf0' : '#fdfbf4';
  const regClr = selected ? 'rgba(197,167,34,0.85)' : 'rgba(139,110,44,0.50)';
  const nameColor  = '#241a08';
  const brandColor = '#8a7040';
  const priceColor = selected ? '#7a5810' : '#a8842c';

  return (
    <div
      onClick={handleCardClick}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === 'Enter') onSelect(); } : undefined}
      style={{
        position: 'relative',
        background: bg,
        /* No border — the 1px grid gap is the line */
        /* Selected state uses an inset box-shadow to highlight */
        boxShadow: selected ? `inset 0 0 0 2px rgba(197,167,34,0.80)` : 'none',
        borderRadius: 0,
        /* overflow MUST be visible — crosshair marks extend 10px beyond edges */
        overflow: 'visible',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, background 0.15s',
      }}
    >
      {/* ── Registration mark crosshairs — 1 per corner ── */}
      <RegMark pos="tl" color={regClr} />
      <RegMark pos="tr" color={regClr} />
      <RegMark pos="bl" color={regClr} />
      <RegMark pos="br" color={regClr} />

      {/* ── Image — overflow:hidden lives HERE, not on the outer card ── */}
      <div style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: '#ffffff',
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
            borderRadius: 0,
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
            borderRadius: 0,
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

      {/* ── Info block ── */}
      <div style={{ padding: '10px 12px 14px' }}>

        {/* Brand */}
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

        {/* Product name */}
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

        {/* Price + View button */}
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

          {/* Always navigates to PDP regardless of onSelect */}
          <button
            onClick={handlePdpClick}
            aria-label={`View ${product.name}`}
            style={{
              background: '#c9a84c',
              border: '1px solid #b8963a',
              borderRadius: 0,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#1a1208',
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1,
              flexShrink: 0,
              transition: 'background 0.12s',
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
