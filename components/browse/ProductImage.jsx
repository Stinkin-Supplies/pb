'use client';

import { useState } from 'react';

/**
 * Renders a product image with a graceful fallback when the URL is missing
 * or fails to load (dead CDN link) — avoids the browser's native broken-image
 * glyph + alt text bleeding into the card.
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

export default function ProductImage({ src, alt, padding = 10, placeholderFontSize = 10 }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-stencil)',
        fontSize: placeholderFontSize,
        letterSpacing: '0.08em',
        color: '#b0a578',
      }}>
        NO IMAGE
      </div>
    );
  }

  return (
    <img
      src={resolveImageSrc(src)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        objectFit: 'contain', padding,
      }}
    />
  );
}
