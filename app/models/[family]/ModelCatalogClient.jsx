'use client';
/**
 * app/models/[family]/ModelCatalogClient.jsx
 * Interactive parts catalog — model-first, era-bucketed.
 * New Sailor for display headings, Barlow Condensed for UI, stencil for labels.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const GOLD    = '#c9960a';
const CREAM   = '#f5f0e8';
const CREAM2  = '#ede8df';
const DARK    = '#1a1208';
const BORDER  = 'rgba(201,150,10,0.2)';
const FONT_UI = "var(--font-stencil, 'Barlow Condensed', monospace)";
const FONT_DISPLAY = "var(--font-stencil, 'Barlow Condensed', monospace)";

// Engine era → visual accent color
const ERA_COLORS = {
  'Flathead V-Twin':        '#7a6545',
  'Knucklehead':            '#8b6020',
  'Panhead':                '#9a7030',
  'Ironhead Sportster':     '#a07820',
  'Shovelhead':             '#b08020',
  'V2 Evolution Big Twin':  '#c9960a',
  'Sportster Evolution':    '#b88a0a',
  'Twin Cam':               '#6b5a30',
  'Milwaukee-Eight V-Twin': '#3a2e18',
};

function eraColor(eraName) {
  return ERA_COLORS[eraName] ?? '#888';
}

function eraShort(eraName) {
  if (!eraName) return '—';
  const shorts = {
    'Flathead V-Twin':        'Flathead',
    'Knucklehead':            'Knuck',
    'Panhead':                'Pan',
    'Ironhead Sportster':     'Ironhead',
    'Shovelhead':             'Shovel',
    'V2 Evolution Big Twin':  'Evolution',
    'Sportster Evolution':    'Evo Sport',
    'Twin Cam':               'Twin Cam',
    'Milwaukee-Eight V-Twin': 'M-Eight',
  };
  return shorts[eraName] ?? eraName;
}

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

// ── Era chip ──────────────────────────────────────────────────
function EraChip({ family, subcat, yearStart, yearEnd, count, eraName }) {
  const [hov, setHov] = useState(false);
  const color = eraColor(eraName);
  const yearStr = yearStart === yearEnd ? `${yearStart}` : `${yearStart}–${yearEnd}`;
  const VINTAGE_FAMILIES = ['Panhead','Knucklehead','Flathead'];
  const params = new URLSearchParams();

  if (family === 'vintage') {
    VINTAGE_FAMILIES.forEach(f => params.append('family', f));
  } else {
    params.set('family', family.charAt(0).toUpperCase() + family.slice(1));
  }
  if (subcat && subcat !== '(General)') params.set('display_subcategory', subcat);
  params.set('year_min', String(yearStart));
  params.set('year_max', String(yearEnd));
  const href = `/browse?${params.toString()}`;

  return (
    <Link
      href={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 6px 10px',
        background: hov ? '#fffbf0' : '#fff',
        borderTop: `1px solid ${hov ? color : BORDER}`,
        borderRight: `1px solid ${hov ? color : BORDER}`,
        borderBottom: `1px solid ${hov ? color : BORDER}`,
        borderLeft: `3px solid ${color}`,
        textDecoration: 'none',
        transition: 'all .14s',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 16,
          color: hov ? color : DARK,
          letterSpacing: '.02em',
          lineHeight: 1,
          transition: 'color .14s',
        }}>
          {yearStr}
        </span>
        <span style={{
          fontFamily: FONT_UI,
          fontSize: 9,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: color,
          lineHeight: 1,
        }}>
          {eraShort(eraName)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, marginLeft: 4 }}>
        <span style={{
          fontFamily: FONT_UI,
          fontSize: 11,
          color: '#999',
          letterSpacing: '.04em',
        }}>
          {count} parts
        </span>
        <span style={{ fontSize: 10, color: hov ? color : '#ccc', transition: 'color .14s' }}>→</span>
      </div>
    </Link>
  );
}

// ── Subcategory row ───────────────────────────────────────────
function SubcatRow({ family, subcat, ranges }) {
  const totalParts = ranges.reduce((s, r) => s + r.product_count, 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
      }}>
        <span style={{
          fontFamily: FONT_UI,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: '#5a4020',
          whiteSpace: 'nowrap',
        }}>
          {subcat === '(General)' ? 'General' : subcat}
        </span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{
          fontFamily: FONT_UI,
          fontSize: 9,
          color: '#bba060',
          letterSpacing: '.06em',
          whiteSpace: 'nowrap',
        }}>
          {totalParts.toLocaleString()} parts total
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {ranges.map((r, i) => (
          <EraChip
            key={i}
            family={family}
            subcat={subcat}
            yearStart={r.year_start}
            yearEnd={r.year_end}
            count={r.product_count}
            eraName={r.era_name}
          />
        ))}
      </div>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────
function CatSection({ family, category, subcats, totalParts, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      borderBottom: `1px solid ${BORDER}`,
      paddingBottom: open ? 20 : 0,
      marginBottom: 4,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '14px 0 10px',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontFamily: "var(--font-bespoke, serif)",
          fontSize: 28,
          color: DARK,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}>
          {category}
        </span>
        <span style={{
          fontFamily: FONT_UI,
          fontSize: 10,
          color: '#bba060',
          letterSpacing: '.08em',
        }}>
          {totalParts.toLocaleString()} parts
        </span>
        <span style={{
          fontFamily: FONT_UI,
          fontSize: 9,
          color: GOLD,
          letterSpacing: '.1em',
          marginLeft: 'auto',
          textTransform: 'uppercase',
        }}>
          {open ? '▲ collapse' : '▼ expand'}
        </span>
      </button>

      {open && (
        <div style={{ paddingLeft: 2 }}>
          {Object.entries(subcats).map(([subcat, ranges]) => (
            <SubcatRow
              key={subcat}
              family={family}
              subcat={subcat}
              ranges={ranges}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────
function CatalogSkeleton() {
  return (
    <div style={{ paddingTop: 8 }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          marginBottom: 20,
          borderBottom: `1px solid ${BORDER}`,
          paddingBottom: 20,
        }}>
          <div style={{ height: 32, width: 180 + i * 40, background: CREAM2, marginBottom: 14, borderRadius: 2 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[0,1,2,3].map(j => (
              <div key={j} style={{ height: 52, width: 130, background: CREAM2, borderRadius: 2, opacity: 1 - j * 0.15 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────
export default function ModelCatalogClient({ family, meta }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/models/${family}/parts`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [family]);

  const catalog       = data?.catalog ?? {};
  const categoryTotals = data?.categoryTotals ?? {};

  // Sort categories by total parts descending
  const sortedCats = Object.keys(catalog).sort(
    (a, b) => (categoryTotals[b] ?? 0) - (categoryTotals[a] ?? 0)
  );

  const TOP_OPEN = new Set(sortedCats.slice(0, 2));

  return (
    <div style={{ background: CREAM, minHeight: '100vh', color: DARK }}>

      {/* ── Header ── */}
      <div style={{
        background: CREAM2,
        borderBottom: `2px solid ${GOLD}`,
        padding: '28px 28px 20px',
      }}>
        {/* Breadcrumb */}
        <div style={{
          fontFamily: FONT_UI,
          fontSize: 9,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: '#a07820',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Link href="/" style={{ color: '#a07820', textDecoration: 'none' }}>Home</Link>
          <span>→</span>
          <Link href="/models" style={{ color: '#a07820', textDecoration: 'none' }}>Models</Link>
          <span>→</span>
          <span style={{ color: DARK }}>{meta.label}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <h1 style={{
            fontFamily: "var(--font-bespoke, serif)",
            fontSize: 'clamp(42px, 8vw, 72px)',
            color: DARK,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            lineHeight: 1,
            margin: 0,
          }}>
            {meta.label}
          </h1>
          <div style={{ paddingBottom: 8 }}>
            <div style={{ fontFamily: FONT_UI, fontSize: 11, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {meta.years}
            </div>
            <div style={{ fontFamily: FONT_UI, fontSize: 10, color: '#a07820', letterSpacing: '.06em' }}>
              {meta.sub}
            </div>
          </div>
        </div>

        {/* Family tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginTop: 4 }}>
          {FAMILIES.map(f => {
            const active = f.slug === family;
            return (
              <Link
                key={f.slug}
                href={`/models/${f.slug}`}
                style={{
                  padding: '8px 18px',
                  fontFamily: FONT_UI,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: active ? DARK : '#a07820',
                  textDecoration: 'none',
                  borderBottom: `2px solid ${active ? GOLD : 'transparent'}`,
                  marginBottom: -1,
                  transition: 'color .14s',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Catalog body ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 80px' }}>

        {/* Era legend */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
          padding: '12px 0',
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: '#aaa', alignSelf: 'center' }}>
            Engine era
          </span>
          {Object.entries(ERA_COLORS).map(([era, color]) => (
            <div key={era} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: FONT_UI, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: '#888' }}>
                {eraShort(era)}
              </span>
            </div>
          ))}
        </div>

        {loading ? (
          <CatalogSkeleton />
        ) : error ? (
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: '#b05a40', padding: '24px 0', letterSpacing: '.1em' }}>
            Failed to load catalog — {error}
          </div>
        ) : sortedCats.length === 0 ? (
          <div style={{ fontFamily: FONT_UI, fontSize: 11, color: '#aaa', padding: '48px 0', textAlign: 'center', letterSpacing: '.1em' }}>
            No parts data found for {meta.label}
          </div>
        ) : (
          sortedCats.map(cat => (
            <CatSection
              key={cat}
              family={family}
              category={cat}
              subcats={catalog[cat]}
              totalParts={categoryTotals[cat] ?? 0}
              defaultOpen={TOP_OPEN.has(cat)}
            />
          ))
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        }
        @media (max-width: 600px) {
          .era-chip-wrap { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
