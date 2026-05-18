// app/harley/[family]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';

const GOLD  = '#c9a84c';
const BLACK = '#080706';
const CREAM = '#f0ebe3';

const FAMILY_LABELS: Record<string, string> = {
  'touring':        'Touring',
  'softail':        'Softail',
  'sportster':      'Sportster',
  'dyna':           'Dyna',
  'fxr':            'FXR',
  'vintage':        'Vintage',
  'revolution-max': 'Revolution Max',
  'trike':          'Trike',
};

// Pairs to show side-by-side — everything else full width
const PAIR_CONFIG: Record<string, string[][]> = {
  'touring':   [['road-king', 'road-glide'], ['street-glide']],
  'softail':   [['fat-boy', 'heritage'], ['low-rider']],
  'fxr':       [['fxr', 'super-glide']],
  'dyna':      [],
  'sportster': [],
  'vintage':   [],
  'trike':     [],
  'revolution-max': [],
};

interface ModelGroup {
  filter_group:  string;
  label:         string;
  slug:          string;
  year_start:    number;
  year_end:      number;
  product_count: number;
}

function Tile({ model, family, flex = 1, delay }: {
  model: ModelGroup; family: string; flex?: number; delay: number;
}) {
  const router = useRouter();
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
      whileHover={{ y: -5, scale: 1.012,
        boxShadow: `inset 0 0 0 3px #0e0b07, inset 0 0 0 5px ${GOLD}, inset 0 0 0 7px #0e0b07, inset 0 0 0 9px #8a6820, 0 10px 28px rgba(0,0,0,0.75)`,
      }}
      whileTap={{ y: -2, scale: 1.006 }}
      onClick={() => router.push(`/harley/${family}/${model.slug}`)}
      aria-label={`Shop ${model.label}`}
      style={{
        flex,
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: '#0e0b07',
        border: 'none',
        outline: '1px solid #7a5c1a',
        boxShadow: `
          inset 0 0 0 3px #0e0b07,
          inset 0 0 0 5px #5a420e,
          inset 0 0 0 7px #0e0b07,
          inset 0 0 0 9px #3a2a08,
          0 2px 8px rgba(0,0,0,0.7)
        `,
        cursor: 'pointer',
        padding: '1.2rem 1rem',
        position: 'relative',
      }}
    >
      {(['tl','tr','bl','br'] as const).map(pos => (
        <span key={pos} aria-hidden="true" style={{
          position: 'absolute', width: 10, height: 10,
          borderColor: GOLD, borderStyle: 'solid', opacity: 0.5,
          top:    pos.startsWith('t') ? 7 : undefined,
          bottom: pos.startsWith('b') ? 7 : undefined,
          left:   pos.endsWith('l')   ? 7 : undefined,
          right:  pos.endsWith('r')   ? 7 : undefined,
          borderWidth: `${pos.startsWith('t') ? '1.5px' : '0'} ${pos.endsWith('r') ? '1.5px' : '0'} ${pos.startsWith('b') ? '1.5px' : '0'} ${pos.endsWith('l') ? '1.5px' : '0'}`,
        }} />
      ))}
      <span style={{
        fontFamily: "'New Sailor', serif",
        fontSize: 'clamp(1.8rem, 6vw, 3.2rem)',
        textTransform: 'uppercase',
        color: CREAM, lineHeight: 0.95,
        textAlign: 'center', letterSpacing: '0.02em',
        textShadow: '1px 1px 0 #000',
        position: 'relative', zIndex: 1,
      }}>{model.label}</span>
      <span style={{
        fontFamily: 'var(--font-stencil, monospace)',
        fontSize: 9, letterSpacing: '0.2em',
        color: `${GOLD}88`, textTransform: 'uppercase',
        position: 'relative', zIndex: 1,
      }}>
        {model.year_start}–{model.year_end}
        {model.product_count > 0 && ` · ${model.product_count.toLocaleString()} parts`}
      </span>
    </motion.button>
  );
}

export default function FamilyPage() {
  const params  = useParams();
  const family  = (params.family as string).toLowerCase();
  const label   = FAMILY_LABELS[family] ?? family;
  const pairCfg = PAIR_CONFIG[family] ?? [];

  const [models, setModels]   = useState<ModelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/harley/${family}/models`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setModels(d.models ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [family]);

  function buildRows(): { items: ModelGroup[]; }[] {
    const bySlug = Object.fromEntries(models.map(m => [m.slug, m]));
    const placed = new Set<string>();
    const rows: { items: ModelGroup[] }[] = [];

    for (const pair of pairCfg) {
      const items = pair.map(s => bySlug[s]).filter(Boolean);
      if (items.length === 0) continue;
      items.forEach(m => placed.add(m.slug));
      rows.push({ items });
    }

    for (const m of models) {
      if (!placed.has(m.slug)) {
        rows.push({ items: [m] });
      }
    }
    return rows;
  }

  const rows = buildRows();
  let tileIdx = 0;

  return (
    <>
      <style>{`
        @font-face { font-family: 'New Sailor'; src: url('/New_Sailor.ttf') format('truetype'); font-display: swap; }
        @keyframes shimmer { from { background-position: -600px 0; } to { background-position: 600px 0; } }
      `}</style>
      <main style={{
        background: BLACK, minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '2rem 1.5rem',
        position: 'relative', boxSizing: 'border-box',
      }}>
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(-45deg,transparent,transparent 10px,rgba(201,168,76,0.018) 10px,rgba(201,168,76,0.018) 11px)`,
        }} />

        {/* Breadcrumb */}
        <div style={{ maxWidth: 680, margin: '0 auto 1.25rem', width: '100%', position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/modelshop" style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.2em', color: `${GOLD}88`, textDecoration: 'none', textTransform: 'uppercase' }}>← Families</Link>
          <span style={{ color: '#333', fontSize: 10 }}>›</span>
          <span style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 9, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase' }}>{label}</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem', maxWidth: 680, margin: '0 auto 1.25rem', width: '100%', position: 'relative' }}>
          <div style={{ flex: 1, height: 2, background: GOLD }} />
          <span style={{ fontFamily: "'New Sailor', serif", fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>{label}</span>
          <div style={{ flex: 1, height: 2, background: GOLD }} />
        </div>

        {/* Tiles */}
        {loading ? (
          <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 120, background: 'linear-gradient(90deg,#0e0e0e 25%,#141414 50%,#0e0e0e 75%)', backgroundSize: '600px 100%', outline: '1px solid #2a1e06', animation: 'shimmer 1.4s infinite' }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: '#555', fontFamily: 'var(--font-stencil, monospace)', fontSize: 11 }}>{error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680, margin: '0 auto', width: '100%', position: 'relative' }}>
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: 'flex', gap: 14 }}>
                {row.items.map(model => (
                  <Tile key={model.slug} model={model} family={family} flex={1} delay={0.05 + (tileIdx++) * 0.06} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '1.5rem', maxWidth: 680, marginLeft: 'auto', marginRight: 'auto', width: '100%', position: 'relative' }}>
          <div style={{ flex: 1, height: 2, background: GOLD, opacity: 0.2 }} />
          <span style={{ fontFamily: 'var(--font-stencil, monospace)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${GOLD}44`, whiteSpace: 'nowrap' }}>Stinkin&apos; Supplies</span>
          <div style={{ flex: 1, height: 2, background: GOLD, opacity: 0.2 }} />
        </div>
      </main>
    </>
  );
}