'use client';
/**
 * app/models/[family]/ModelCatalogClient.jsx
 * Model family parts page — category bento grid navigation.
 * No API fetch needed; categories are static display_category values.
 */

import Link from 'next/link';
import CategoryBentoGrid from '@/components/models/CategoryBentoGrid';

const GOLD    = '#c9960a';
const CREAM   = '#f5f0e8';
const CREAM2  = '#ede8df';
const DARK    = '#1a1208';
const BORDER  = 'rgba(201,150,10,0.2)';
const FONT_UI = "var(--font-stencil, 'Barlow Condensed', monospace)";

const FAMILIES = [
  { slug: 'touring',    label: 'Touring'    },
  { slug: 'softail',    label: 'Softail'    },
  { slug: 'dyna',       label: 'Dyna'       },
  { slug: 'sportster',  label: 'Sportster'  },
  { slug: 'fxr',        label: 'FXR'        },
  { slug: 'shovelhead', label: 'Shovelhead' },
  { slug: 'vintage',    label: 'Vintage'    },
  { slug: 'trike',      label: 'Trike'      },
];

// All active display_category values — Riding Gear & Apparel + Tools & Chemicals excluded
const CATEGORIES = [
  'Engine',
  'Transmission & Clutch',
  'Exhaust',
  'Brakes',
  'Electrical',
  'Handlebar & Controls',
  'Carburetion & Fuel',
  'Foot Controls',
  'Lighting',
  'Suspension',
  'Wheels & Tires',
  'Fenders & Body',
  'Seating',
  'Frame & Hardware',
  'Instrumentation',
  'Luggage & Racks',
  'Security & Covers',
  'Accessories & Misc',
];

export default function ModelCatalogClient({ family, meta }) {
  return (
    <div style={{ background: CREAM, minHeight: '100vh', color: DARK }}>

      {/* ── Header ── */}
      <div style={{
        background:    CREAM2,
        borderBottom:  `2px solid ${GOLD}`,
        padding:       '28px 28px 0',
      }}>

        {/* Breadcrumb */}
        <div style={{
          fontFamily:    FONT_UI,
          fontSize:      9,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color:         '#a07820',
          marginBottom:  10,
          display:       'flex',
          alignItems:    'center',
          gap:           8,
        }}>
          <Link href="/" style={{ color: '#a07820', textDecoration: 'none' }}>Home</Link>
          <span>→</span>
          <Link href="/models" style={{ color: '#a07820', textDecoration: 'none' }}>Models</Link>
          <span>→</span>
          <span style={{ color: DARK }}>{meta.label}</span>
        </div>

        {/* Title row */}
        <div style={{
          display:     'flex',
          alignItems:  'flex-end',
          gap:         16,
          flexWrap:    'wrap',
          marginBottom: 16,
        }}>
          <h1 style={{
            fontFamily:    'var(--font-bespoke, serif)',
            fontSize:      'clamp(42px, 8vw, 72px)',
            color:         DARK,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            lineHeight:    1,
            margin:        0,
          }}>
            {meta.label}
          </h1>
          <div style={{ paddingBottom: 6 }}>
            {meta.years && (
              <div style={{
                fontFamily:    FONT_UI,
                fontSize:      11,
                color:         GOLD,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}>
                {meta.years}
              </div>
            )}
            <div style={{
              fontFamily:    FONT_UI,
              fontSize:      10,
              color:         '#a07820',
              letterSpacing: '.06em',
            }}>
              {meta.sub}
            </div>
          </div>
        </div>

        {/* Family tabs */}
        <div style={{
          display:    'flex',
          gap:        0,
          borderBottom: `1px solid ${BORDER}`,
          overflowX:  'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}>
          {FAMILIES.map(f => {
            const active = f.slug === family;
            return (
              <Link
                key={f.slug}
                href={`/models/${f.slug}`}
                style={{
                  padding:       '8px 18px',
                  fontFamily:    FONT_UI,
                  fontSize:      11,
                  fontWeight:    700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color:         active ? DARK : '#a07820',
                  textDecoration: 'none',
                  borderBottom:  `2px solid ${active ? GOLD : 'transparent'}`,
                  marginBottom:  -1,
                  transition:    'color .14s',
                  whiteSpace:    'nowrap',
                  flexShrink:    0,
                }}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Category bento grid ── */}
      {/* 5px padding matches the internal tile gap for a seamless edge */}
      <div style={{ padding: 5 }}>
        <CategoryBentoGrid
          categories={CATEGORIES}
          familySlug={family}
        />
      </div>

      <style>{`
        * { box-sizing: border-box; }
        /* Hide tab scrollbar on mobile */
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
