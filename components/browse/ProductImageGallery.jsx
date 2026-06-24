'use client';

import { useState } from 'react';

// Same logic as ProductImage — route LeMans URLs through the proxy
function resolveImageSrc(url) {
  if (!url) return url;
  try {
    const { hostname } = new URL(url);
    if (hostname === 'asset.lemansnet.com') {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch { /* not an absolute URL */ }
  return url;
}

function buildImageList(primaryUrl, imageUrls) {
  const all = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (!all.length && primaryUrl) return [primaryUrl];
  if (!all.length) return [];
  // Deduplicate: if primary is already first in imageUrls, don't double-add
  if (primaryUrl && !all.includes(primaryUrl)) return [primaryUrl, ...all];
  return all;
}

export default function ProductImageGallery({ primaryUrl, imageUrls, alt }) {
  const images = buildImageList(primaryUrl, imageUrls);
  const [activeIdx, setActiveIdx] = useState(0);
  const [failed, setFailed] = useState({});

  const activeSrc = images[activeIdx];
  const showStrip = images.length > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Main image */}
      <div style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: '#ffffff',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #e6dcc0',
      }}>
        {activeSrc && !failed[activeIdx] ? (
          <img
            key={activeSrc}
            src={resolveImageSrc(activeSrc)}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(f => ({ ...f, [activeIdx]: true }))}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'contain',
              padding: 24,
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-stencil)',
            fontSize: 13,
            letterSpacing: '0.08em',
            color: '#b0a578',
          }}>
            NO IMAGE
          </div>
        )}
      </div>

      {/* Thumbnail strip — only shown when multiple images */}
      {showStrip && (
        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'thin',
          scrollbarColor: '#c9a84c #f5f0e8',
        }}>
          {images.map((url, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                style={{
                  flexShrink: 0,
                  width: 64,
                  height: 64,
                  padding: 0,
                  border: `2px solid ${isActive ? '#c9a84c' : '#e6dcc0'}`,
                  borderRadius: 8,
                  background: '#ffffff',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative',
                  transition: 'border-color 0.15s',
                  outline: 'none',
                  boxShadow: isActive ? '0 0 0 1px #c9a84c' : 'none',
                }}
              >
                {!failed[i] ? (
                  <img
                    src={resolveImageSrc(url)}
                    alt={`${alt} view ${i + 1}`}
                    loading="lazy"
                    onError={() => setFailed(f => ({ ...f, [i]: true }))}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      padding: 4,
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-stencil)',
                    fontSize: 8,
                    color: '#b0a578',
                  }}>
                    —
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
