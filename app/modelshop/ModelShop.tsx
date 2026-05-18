'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const FAMILIES: {
  label: string;
  slug: string;
  full: boolean;
  fontSize: string;
}[] = [
  { label: 'Touring',        slug: 'touring',        full: true,  fontSize: 'clamp(2.4rem, 10vw, 4.6rem)'  },
  { label: 'Softail',        slug: 'softail',        full: true,  fontSize: 'clamp(2.4rem, 10vw, 4.6rem)'  },
  { label: 'Sportster',      slug: 'sportster',      full: true,  fontSize: 'clamp(1.9rem, 8.5vw, 4rem)'   },
  { label: 'Dyna',           slug: 'dyna',           full: false, fontSize: 'clamp(3.5rem, 15vw, 6.5rem)'  },
  { label: 'FXR',            slug: 'fxr',            full: false, fontSize: 'clamp(3.5rem, 14vw, 6.5rem)'  },
  { label: 'Vintage',        slug: 'vintage',        full: true,  fontSize: 'clamp(2.8rem, 11vw, 5.2rem)'  },
  { label: 'Revolution Max', slug: 'revolution-max', full: true,  fontSize: 'clamp(2rem, 8vw, 4.2rem)'     },
];

const BASE_SHADOW = `
  inset 0 0 0 3px #0e0b07,
  inset 0 0 0 5px #5a420e,
  inset 0 0 0 7px #0e0b07,
  inset 0 0 0 9px #3a2a08,
  0 2px 8px rgba(0,0,0,0.7),
  0 1px 2px rgba(0,0,0,0.9)
`;

const HOVER_SHADOW = `
  inset 0 0 0 3px #130f08,
  inset 0 0 0 5px #c9a84c,
  inset 0 0 0 7px #130f08,
  inset 0 0 0 9px #8a6820,
  0 10px 28px rgba(0,0,0,0.75),
  0 4px 8px rgba(0,0,0,0.9),
  0 0 20px rgba(201,168,76,0.08)
`;

function Tile({
  label,
  slug,
  full,
  fontSize,
  delay,
}: {
  label: string;
  slug: string;
  full: boolean;
  fontSize: string;
  delay: number;
}) {
  const router = useRouter();

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
      whileHover={{ y: -5, scale: 1.012 }}
      whileTap={{ y: -2, scale: 1.006 }}
      onClick={() => router.push(`/harley/${slug}`)}
      aria-label={`Shop ${label}`}
      style={{
        gridColumn: full ? '1 / -1' : undefined,
        background: '#0e0b07',
        border: 'none',
        outline: '1px solid #7a5c1a',
        boxShadow: BASE_SHADOW,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 110,
        padding: '1.4rem 1rem',
        cursor: 'pointer',
        position: 'relative',
        width: '100%',
        textAlign: 'center',
      }}
    >
      {/* Corner ornaments */}
      {(['tl','tr','bl','br'] as const).map((pos) => (
        <span
          key={pos}
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            borderColor: '#c9a84c',
            borderStyle: 'solid',
            opacity: 0.55,
            top:    pos.startsWith('t') ? 7 : undefined,
            bottom: pos.startsWith('b') ? 7 : undefined,
            left:   pos.endsWith('l')   ? 7 : undefined,
            right:  pos.endsWith('r')   ? 7 : undefined,
            borderWidth: `${pos.startsWith('t') ? '1.5px' : '0'} ${pos.endsWith('r') ? '1.5px' : '0'} ${pos.startsWith('b') ? '1.5px' : '0'} ${pos.endsWith('l') ? '1.5px' : '0'}`,
          }}
        />
      ))}

      <span
        style={{
          fontFamily: "'New Sailor', serif",
          fontSize,
          textTransform: 'uppercase',
          color: '#d4c89a',
          lineHeight: 0.92,
          letterSpacing: '0.03em',
          position: 'relative',
          zIndex: 1,
          textShadow: '1px 1px 0 #000, -1px -1px 0 rgba(255,220,100,0.15)',
        }}
      >
        {label}
      </span>
    </motion.button>
  );
}

export default function ModelShop() {
  return (
    <>
      <style>{`
        @font-face {
          font-family: 'New Sailor';
          src: url('/New_Sailor.ttf') format('truetype');
          font-display: swap;
        }
      `}</style>

      <main
        style={{
          background: '#0a0806',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '2rem 1.25rem',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {/* Diagonal hatch texture */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent, transparent 10px,
              rgba(201,168,76,0.018) 10px, rgba(201,168,76,0.018) 11px
            )`,
          }}
        />

        {/* Header rule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: '1.5rem',
            maxWidth: 680,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '100%',
          }}
        >
          <div style={{ flex: 1, height: 2, background: '#c9a84c' }} />
          <span
            style={{
              fontFamily: "'New Sailor', serif",
              fontSize: 11,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: '#c9a84c',
            }}
          >
            Select Family
          </span>
          <div style={{ flex: 1, height: 2, background: '#c9a84c' }} />
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            maxWidth: 680,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {FAMILIES.map(({ label, slug, full, fontSize }, i) => (
            <Tile
              key={slug}
              label={label}
              slug={slug}
              full={full}
              fontSize={fontSize}
              delay={0.05 + i * 0.06}
            />
          ))}
        </div>

        {/* Footer rule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: '1.5rem',
            maxWidth: 680,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '100%',
          }}
        >
          <div style={{ flex: 1, height: 2, background: '#c9a84c', opacity: 0.3 }} />
          <span
            style={{
              fontFamily: "'New Sailor', serif",
              fontSize: 10,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'rgba(201,168,76,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            Stinkin&apos; Supplies
          </span>
          <div style={{ flex: 1, height: 2, background: '#c9a84c', opacity: 0.3 }} />
        </div>
      </main>
    </>
  );
}
