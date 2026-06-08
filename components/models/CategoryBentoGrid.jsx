'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// ─── Slug → harley_families.name (must match DB exactly) ─────────────────────
// Simple charAt(0).toUpperCase() breaks on "v-rod" → "V-rod", so use explicit map.
const FAMILY_NAME_MAP = {
  'touring':    'Touring',
  'softail':    'Softail',
  'dyna':       'Dyna',
  'sportster':  'Sportster',
  'fxr':        'FXR',
  'shovelhead': 'Shovelhead',
  'vintage':    'Vintage',
  'trike':      'Trike',
  'v-rod':      'V-Rod',
  'street':     'Street',
};

// ─── Exact display_category values → grid-area name ──────────────────────────
// Source: SELECT DISTINCT display_category FROM catalog_unified WHERE is_active = true
// Excluded by design: "Riding Gear & Apparel", "Tools & Chemicals"
const AREA_MAP = {
  'Engine':                'engine',
  'Transmission & Clutch': 'trans',
  'Exhaust':               'exhaust',
  'Brakes':                'brakes',
  'Electrical':            'elec',
  'Handlebar & Controls':  'handle',
  'Carburetion & Fuel':    'carb',
  'Foot Controls':         'foot',
  'Lighting':              'light',
  'Suspension':            'susp',
  'Wheels & Tires':        'wheels',
  'Fenders & Body':        'fenders',
  'Seating':               'seat',
  'Frame & Hardware':      'frame',
  'Instrumentation':       'instr',
  'Luggage & Racks':       'lug',
  'Security & Covers':     'sec',
  'Accessories & Misc':    'access',
};

// ─── Background color per area (used when no image is provided) ───────────────
const BG = {
  engine:  '#C9A84C',  // gold — hero
  trans:   '#1e1508',
  exhaust: '#1a1208',
  brakes:  '#1a1208',
  elec:    '#1e1508',
  handle:  '#201408',
  carb:    '#1e1508',
  foot:    '#111009',
  light:   '#1a1208',
  susp:    '#201408',
  wheels:  '#1a1208',
  fenders: '#201408',
  seat:    '#1e1508',
  frame:   '#1a1208',
  instr:   '#201408',
  lug:     '#1a1208',
  sec:     '#1e1508',
  access:  '#111009',
};

// ─── Desktop grid layout — 4 columns, 7 rows ─────────────────────────────────
//
//  Col:      1         2         3         4
//  Row 1:  ENGINE    ENGINE    EXHAUST   TRANS
//  Row 2:  ENGINE    ENGINE    BRAKES    ELEC
//  Row 3:  HANDLE    HANDLE    CARB      CARB
//  Row 4:  FOOT      LIGHT     SUSP      SUSP
//  Row 5:  WHEELS    WHEELS    FENDERS   SEAT
//  Row 6:  FRAME     INSTR     LUG       LUG
//  Row 7:  SEC       SEC       ACCESS    ACCESS

const GRID_AREAS = `
  "engine  engine  exhaust  trans  "
  "engine  engine  brakes   elec   "
  "handle  handle  carb     carb   "
  "foot    light   susp     susp   "
  "wheels  wheels  fenders  seat   "
  "frame   instr   lug      lug    "
  "sec     sec     access   access "
`;

const ROW_HEIGHTS = '168px 168px 134px 134px 134px 134px 104px';

const GOLD  = '#C9A84C';
const CREAM = '#F2EAD3';
const DARK  = '#1a1208';
const GAP   = 5;

// ─── Single tile ─────────────────────────────────────────────────────────────
function Tile({ area, name, image, hov, setHov, familySlug }) {
  const router = useRouter();
  const isHero = area === 'engine';
  const isHov  = hov === area;
  const bg     = BG[area] ?? DARK;
  const hasImg = Boolean(image);

  // Font size — hero big, narrow 1×1 tiles smaller
  const fontSize = isHero
    ? 'clamp(2.8rem, 5vw, 5.6rem)'
    : area === 'foot' || area === 'instr' || area === 'sec'
    ? 'clamp(1rem, 1.9vw, 1.8rem)'
    : 'clamp(1.05rem, 2vw, 2rem)';

  const navigate = () => {
    // display_category matches cu.display_category (unified taxonomy).
    // browse.ts: displayCategory filter → `cu.display_category = $N`
    const params = new URLSearchParams({ display_category: name });
    if (familySlug) {
      // Must match harley_families.name exactly (e.g. "Softail", "V-Rod", "FXR")
      const familyName = FAMILY_NAME_MAP[familySlug] ?? familySlug;
      params.set('family', familyName);
    }
    router.push(`/browse?${params}`);
  };

  return (
    <div
      className="ss-cat-tile"
      data-area={area}
      onClick={navigate}
      onMouseEnter={() => setHov(area)}
      onMouseLeave={() => setHov(null)}
      style={{
        gridArea: area,
        // When an image is present, it shows through overlays below
        backgroundColor: hasImg ? '#1a1208' : (isHov && !isHero ? '#2b1c0c' : bg),
        backgroundImage: hasImg ? `url(${image})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: isHero && !hasImg ? DARK : CREAM,
        padding: isHero ? '1.6rem 1.8rem' : '0.95rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        outline: `${isHov ? 2 : 1}px solid ${isHov ? GOLD : 'rgba(201,168,76,0.14)'}`,
        outlineOffset: '-1px',
        transition: 'outline-color 0.15s',
        userSelect: 'none',
      }}
    >
      {/* ── Image overlay: darkens photo so text is always readable ── */}
      {hasImg && (
        <div style={{
          position: 'absolute', inset: 0,
          // Hero gets an amber tint; others get dark scrim
          background: isHero
            ? `linear-gradient(to top, rgba(20,12,2,0.72) 0%, rgba(20,12,2,0.35) 50%, rgba(201,168,76,0.18) 100%)`
            : `linear-gradient(to top, rgba(10,7,2,0.88) 0%, rgba(10,7,2,0.55) 55%, rgba(10,7,2,0.28) 100%)`,
          transition: 'opacity 0.15s',
          opacity: isHov ? 0.85 : 1,
          pointerEvents: 'none',
        }} />
      )}

      {/* ── No-image: hero light-leak ── */}
      {!hasImg && isHero && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(130deg,rgba(255,255,255,0.1) 0%,transparent 52%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── No-image: dark tile gold mesh texture ── */}
      {!hasImg && !isHero && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage:
            'linear-gradient(rgba(201,168,76,.04) 1px,transparent 1px),' +
            'linear-gradient(90deg,rgba(201,168,76,.04) 1px,transparent 1px)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
          opacity: isHov ? 1 : 0.45,
          transition: 'opacity 0.15s',
        }} />
      )}

      {/* ── Hover arrow ── */}
      {isHov && (
        <span style={{
          position: 'absolute',
          top:   isHero ? '1.6rem' : '0.95rem',
          right: isHero ? '1.8rem' : '1.1rem',
          fontFamily: 'var(--font-body, Barlow, sans-serif)',
          fontSize: isHero ? '1.1rem' : '0.85rem',
          fontWeight: 700,
          color: hasImg || !isHero ? GOLD : 'rgba(26,18,8,0.45)',
          zIndex: 2,
          lineHeight: 1,
          pointerEvents: 'none',
        }}>→</span>
      )}

      <span style={{
        fontFamily: 'var(--font-tanker)',
        fontSize,
        lineHeight: 1.0,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
        position: 'relative',
        zIndex: 1,
        // With images, always cream; no-image hero is dark
        color: hasImg ? CREAM : (isHero ? DARK : CREAM),
      }}>
        {name}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
//
//  Props:
//    categories  — display_category values to show
//                  accepts: string[] | {name:string}[] | {display_category:string}[]
//    familySlug  — e.g. "softail" → browse URL gets ?family=softail
//                  omit for site-wide category page (only ?category= param used)
//    images      — optional map of area → image path
//                  e.g. { engine: '/images/cats/engine.jpg', exhaust: '/images/cats/exhaust.jpg' }
//                  Any area without an entry falls back to the solid BG color.
//                  You can also pass a single string to use one image for all tiles:
//                  images="/images/cats/default.jpg"  (unusual but supported)

export default function CategoryBentoGrid({
  categories = [],
  familySlug = '',
  images = {},
}) {
  const [hov, setHov] = useState(null);

  // Normalize categories: accept strings, {name}, or {display_category}
  const names = categories.map((c) => {
    if (typeof c === 'string') return c;
    return c.name ?? c.display_category ?? '';
  });

  // Resolve image for a given area
  const getImage = (area) => {
    if (typeof images === 'string') return images;
    return images?.[area] ?? null;
  };

  // Sort into known grid slots vs overflow
  const known    = [];
  const overflow = [];
  const seen     = new Set();

  for (const name of names) {
    const area = AREA_MAP[name];
    if (area && !seen.has(area)) {
      seen.add(area);
      known.push({ name, area });
    } else if (!area && name) {
      overflow.push(name);
    }
  }

  const tileProps = { hov, setHov, familySlug };

  return (
    <>
      <style>{`
        .ss-cat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: ${ROW_HEIGHTS};
          grid-template-areas: ${GRID_AREAS};
          gap: ${GAP}px;
        }

        /* Tablet: 2-column flow */
        @media (max-width: 860px) and (min-width: 541px) {
          .ss-cat-grid {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas: none !important;
            grid-template-rows: none !important;
            grid-auto-rows: 128px;
            grid-auto-flow: dense;
          }
          .ss-cat-tile            { grid-area: unset !important; min-height: 128px; }
          .ss-cat-tile[data-area="engine"] { grid-column: span 2; min-height: 160px; }
        }

        /* Mobile: 2-column, tighter */
        @media (max-width: 540px) {
          .ss-cat-grid {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas: none !important;
            grid-template-rows: none !important;
            grid-auto-rows: 108px;
            grid-auto-flow: dense;
          }
          .ss-cat-tile {
            grid-area: unset !important;
            min-height: 108px;
            padding: 0.7rem 0.85rem !important;
          }
          .ss-cat-tile[data-area="engine"] {
            grid-column: span 2;
            min-height: 144px;
          }
          .ss-cat-tile .ss-cat-name {
            font-size: clamp(0.95rem, 4.5vw, 1.25rem) !important;
          }
          .ss-cat-tile[data-area="engine"] .ss-cat-name {
            font-size: clamp(2.4rem, 9vw, 3.2rem) !important;
          }
        }

        /* Overflow row */
        .ss-cat-overflow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: ${GAP}px;
          margin-top: ${GAP}px;
        }
        @media (max-width: 860px) {
          .ss-cat-overflow { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div className="ss-cat-grid">
        {known.map(({ name, area }) => (
          <Tile
            key={area}
            area={area}
            name={name}
            image={getImage(area)}
            {...tileProps}
          />
        ))}
      </div>

      {overflow.length > 0 && (
        <div className="ss-cat-overflow">
          {overflow.map((name, i) => (
            <Tile
              key={name}
              area={`ov${i}`}
              name={name}
              image={getImage(`ov${i}`)}
              {...tileProps}
            />
          ))}
        </div>
      )}
    </>
  );
}
