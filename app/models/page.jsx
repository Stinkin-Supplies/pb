'use client';
/**
 * app/models/page.jsx
 * Model family index — entry point to the parts catalog.
 */

import Link from 'next/link';

const FONT_DISPLAY = "'New Sailor', serif";
const FONT_UI      = "var(--font-stencil, 'Barlow Condensed', monospace)";
const GOLD         = '#c9960a';
const CREAM        = '#f5f0e8';
const CREAM2       = '#ede8df';
const DARK         = '#1a1208';
const BORDER       = 'rgba(201,150,10,0.2)';

const FAMILIES = [
  { slug: 'touring',    label: 'Touring',    years: '1980–2026', sub: 'Electra · Road · Street Glide · Ultra Classic', icon: '🏍' },
  { slug: 'softail',    label: 'Softail',    years: '1984–2026', sub: 'Fat Boy · Heritage · Breakout · Slim', icon: '🏍' },
  { slug: 'dyna',       label: 'Dyna',       years: '1991–2017', sub: 'Fat Bob · Wide Glide · Street Bob', icon: '🏍' },
  { slug: 'sportster',  label: 'Sportster',  years: '1957–2022', sub: 'Iron 883 · Forty-Eight · XL Series', icon: '🏍' },
  { slug: 'fxr',        label: 'FXR',        years: '1982–1994', sub: 'Super Glide II · FXRS · FXRT', icon: '🏍' },
  { slug: 'shovelhead', label: 'Shovelhead', years: '1966–1986', sub: 'FL · FLH · FX · FXWG · Low Rider', icon: '🏍' },
  { slug: 'vintage',    label: 'Vintage',    years: 'Pre-1966',  sub: 'Panhead · Knucklehead · Flathead', icon: '🏍' },
  { slug: 'trike',      label: 'Trike',      years: '2009–2026', sub: 'Freewheeler · Tri Glide Ultra', icon: '🏍' },
  { slug: 'v-rod',      label: 'V-Rod',      years: '2002–2017', sub: 'VRSC · Night Rod · Muscle', icon: '🏍' },
  { slug: 'street',     label: 'Street',     years: '2015–2020', sub: 'Street 500 · Street 750', icon: '🏍' },
];

export default function ModelsIndexPage() {
  return (
    <div style={{ background: CREAM, minHeight: '100vh', color: DARK }}>
      <div style={{
        background: CREAM2,
        borderBottom: `2px solid ${GOLD}`,
        padding: '32px 28px 24px',
      }}>
        <div style={{ fontFamily: FONT_UI, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#a07820', marginBottom: 10 }}>
          <Link href="/" style={{ color: '#a07820', textDecoration: 'none' }}>Home</Link>
          {' → '}
          <span style={{ color: DARK }}>Models</span>
        </div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(36px, 7vw, 60px)', color: DARK, letterSpacing: '.04em', textTransform: 'uppercase', lineHeight: 1, margin: '0 0 8px' }}>
          Shop by Model
        </h1>
        <p style={{ fontFamily: FONT_UI, fontSize: 11, color: '#a07820', letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Select a family to browse parts by era
        </p>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {FAMILIES.map(f => (
            <Link
              key={f.slug}
              href={`/models/${f.slug}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  background: '#fff',
                  border: `1px solid ${BORDER}`,
                  padding: '20px 22px',
                  transition: 'border-color .15s, transform .15s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.transform = ''; }}
              >
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 32, color: DARK, textTransform: 'uppercase', letterSpacing: '.04em', lineHeight: 1, marginBottom: 6 }}>
                  {f.label}
                </div>
                <div style={{ fontFamily: FONT_UI, fontSize: 10, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  {f.years}
                </div>
                <div style={{ fontFamily: FONT_UI, fontSize: 10, color: '#a07820', letterSpacing: '.04em' }}>
                  {f.sub}
                </div>
                <div style={{ fontFamily: FONT_UI, fontSize: 9, color: GOLD, letterSpacing: '.12em', textTransform: 'uppercase', marginTop: 14 }}>
                  Browse parts →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        @font-face {
          font-family: 'New Sailor';
          src: url('/New_Sailor.ttf') format('truetype');
          font-display: swap;
        }
      `}</style>
    </div>
  );
}
