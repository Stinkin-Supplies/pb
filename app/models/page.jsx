'use client';
/**
 * app/models/page.jsx
 * /models index — model family selector using FlowingMenu.
 * Zero API calls. Static data only. Instant load.
 */

import Link from 'next/link';
import FlowingMenu from '@/components/models/FlowingMenu';

const GOLD     = '#c9960a';
const GOLD_DIM = 'rgba(201,150,10,0.22)';
const CREAM    = '#f5f0e8';
const DARK     = '#1a1208';
const TAN      = '#a07820';
const FONT_UI  = "var(--font-stencil, 'Barlow Condensed', monospace)";
const FONT_D   = "var(--font-bespoke, serif)";

const FAMILIES = [
  { slug: 'touring',    label: 'Touring',    years: '1980–2026', sub: 'Electra Glide · Road King · Street Glide · Ultra Classic',   image: '/images/models/touring.jpg'    },
  { slug: 'softail',    label: 'Softail',    years: '1984–2026', sub: 'Fat Boy · Heritage Classic · Breakout · Slim · Street Bob',  image: '/images/models/softail.jpg'    },
  { slug: 'dyna',       label: 'Dyna',       years: '1991–2017', sub: 'Fat Bob · Wide Glide · Street Bob · Low Rider',              image: '/images/models/dyna.jpg'       },
  { slug: 'sportster',  label: 'Sportster',  years: '1957–2022', sub: 'Iron 883 · Forty-Eight · SuperLow · Custom · XL Series',    image: '/images/models/sportster.jpg'  },
  { slug: 'fxr',        label: 'FXR',        years: '1982–1994', sub: 'Super Glide II · FXRS · FXRT · FXRD · Low Glide',           image: '/images/models/fxr.jpg'        },
  { slug: 'shovelhead', label: 'Shovelhead', years: '1966–1986', sub: 'FL · FLH · FX · FXWG · Low Rider · Wide Glide',             image: '/images/models/shovelhead.jpg' },
  { slug: 'vintage',    label: 'Vintage',    years: 'Pre-1966',  sub: 'Panhead · Knucklehead · Flathead · WL · EL · FL',           image: '/images/models/vintage.jpg'    },
  { slug: 'trike',      label: 'Trike',      years: '2009–2026', sub: 'Freewheeler · Tri Glide Ultra · CVO Tri Glide',             image: '/images/models/trike.jpg'      },
  { slug: 'v-rod',      label: 'V-Rod',      years: '2002–2017', sub: 'VRSC · Night Rod · Night Rod Special · V-Rod Muscle',       image: '/images/models/v-rod.jpg'      },
  { slug: 'street',     label: 'All Makes',  years: '',          sub: 'Universal · Multi-Make · All Applications',                 image: ''                              },
];

const menuItems = FAMILIES.map(f => ({
  link:  f.slug === 'street' ? '/browse?universal=true' : `/models/${f.slug}`,
  text:  f.label,
  sub:   f.sub,
  years: f.years,
  image: f.image,
}));

export default function ModelsIndexPage() {
  return (
    <div style={{
      background:    DARK,
      minHeight:     '100dvh',
      color:         CREAM,
      display:       'flex',
      flexDirection: 'column',
    }}>

      {/* ── Header — cream background, black text ── */}
      <header style={{
        background:  CREAM,
        borderBottom: `2px solid ${GOLD}`,
        boxShadow:   `0 3px 0 0 ${GOLD_DIM}`,
        padding:     'clamp(16px, 3vw, 28px) clamp(20px, 5vw, 56px)',
        flexShrink:  0,
      }}>

        {/* Breadcrumb */}
        <nav style={{
          fontFamily:    FONT_UI,
          fontSize:      10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color:         DARK,
          opacity:       0.45,
          marginBottom:  10,
          display:       'flex',
          alignItems:    'center',
          gap:           8,
        }}>
          <Link href="/" style={{ color: DARK, textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ opacity: 1, color: DARK }}>Models</span>
        </nav>

        {/* Title row */}
        <div style={{
          display:        'flex',
          alignItems:     'flex-end',
          justifyContent: 'space-between',
          flexWrap:       'wrap',
          gap:            12,
        }}>
          <h1 style={{
            fontFamily:    FONT_D,
            fontSize:      'clamp(36px, 6vw, 72px)',
            color:         DARK,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight:    0.95,
            margin:        0,
          }}>
            Shop by <span style={{ color: GOLD }}>Model</span>
          </h1>
          <p style={{
            fontFamily:    FONT_UI,
            fontSize:      'clamp(10px, 1.1vw, 12px)',
            letterSpacing: '0.08em',
            color:         TAN,
            lineHeight:    1.6,
            margin:        0,
            paddingBottom: 4,
          }}>
            Select a family · browse by era &amp; category
          </p>
        </div>
      </header>

      {/* ── Flowing menu ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <FlowingMenu
          items={menuItems}
          speed={60}
          textColor={CREAM}
          bgColor={DARK}
          marqueeBgColor="#ffffff"
          marqueeTextColor={DARK}
          borderColor={GOLD_DIM}
        />
      </div>

      {/* ── Footer hint ── */}
      <div style={{
        padding:        'clamp(8px, 1.5vw, 14px) clamp(20px, 5vw, 56px)',
        borderTop:      `1px solid ${GOLD_DIM}`,
        background:     DARK,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            8,
        flexShrink:     0,
      }}>
        <span style={{
          fontFamily:    FONT_UI,
          fontSize:      9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color:         'rgba(201,150,10,0.3)',
        }}>
          Hover to preview · Click to browse
        </span>
        <Link href="/browse" style={{
          fontFamily:    FONT_UI,
          fontSize:      9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color:         TAN,
          textDecoration: 'none',
        }}>
          Browse all parts →
        </Link>
      </div>

      <style>{`* { box-sizing: border-box; }`}</style>
    </div>
  );
}
