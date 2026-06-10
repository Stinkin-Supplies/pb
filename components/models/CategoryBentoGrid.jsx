'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Slug → harley_families.name (must match DB exactly) ─────────────────────
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

// ─── Background color per area ────────────────────────────────────────────────
const BG = {
  engine:  '#C9A84C',
  trans:   '#1e1508',
  exhaust: '#1a1208',
  brakes:  '#1a1208',
  elec:    '#1e1508',
  handle:  '#170f04',  // deep dark — secondary hero (inverse of ENGINE's gold)
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
//  Row 2:  ENGINE    ENGINE    EXHAUST   SUSP
//  Row 3:  WHEELS    WHEELS    CARB      CARB
//  Row 4:  LIGHT     ELEC      BRAKES    FOOT    ← compact short-name row
//  Row 5:  FENDERS   LUG       SEAT      ACCESS  ← varied single tiles
//  Row 6:  FRAME     INSTR     HANDLE    HANDLE  ← secondary hero starts
//  Row 7:  SEC       SEC       HANDLE    HANDLE  ← secondary hero (2×2, bottom-right)
//
//  ENGINE:  top-left 2×2 hero  (13,060 parts — primary)
//  HANDLE:  bottom-right 2×2   (11,025 parts — secondary, diagonal anchor)
//  EXHAUST: tall narrow column spanning rows 1–2
const GRID_AREAS = `
  "engine  engine  exhaust  trans  "
  "engine  engine  exhaust  susp   "
  "wheels  wheels  carb     carb   "
  "light   elec    brakes   foot   "
  "fenders lug     seat     access "
  "frame   instr   handle   handle "
  "sec     sec     handle   handle "
`;

// Taper toward the bottom; hero rows 6–7 tall enough to rival ENGINE.
const ROW_HEIGHTS = '168px 168px 130px 110px 115px 138px 138px';

const GOLD  = '#C9A84C';
const CREAM = '#F2EAD3';
const DARK  = '#1a1208';
const GAP   = 5;

// ─── Subcategory data — exact display_subcategory values from DB ──────────────
// Source: SELECT DISTINCT display_subcategory FROM catalog_unified WHERE display_category = 'X'
const SUBCATEGORIES = {
  'Engine': [
    'Gaskets & Seals', 'Pistons & Cylinders', 'Cams & Valvetrain',
    'Engine Covers', 'Heads & Valves', 'Bottom End',
    'Oil Pumps & Lubrication', 'Motor Mounts', 'Complete Engines', 'Performance Kits',
  ],
  'Transmission & Clutch': [
    'Clutch Plates & Kits', 'Transmission Internals', 'Oil System',
    'Trans Covers & Cases', 'Sprockets', 'Belts & Pulleys',
    'Drive Chains & Kits', 'Kickstarters & Hardware', 'Primary Drive',
  ],
  'Exhaust': [
    'Exhaust Systems', 'Mufflers', 'Headers & Pipes', 'Exhaust Parts',
  ],
  'Brakes': [
    'Brake Lines & Hoses', 'Rotors & Drums', 'Brake Pads & Shoes',
    'Calipers', 'Brake Hardware', 'Master Cylinders', 'Brake Conversion Kits',
  ],
  'Electrical': [
    'Ignition', 'Wiring & Harnesses', 'Charging & Alternators',
    'Switches & Controls', 'Starters & Solenoids', 'Batteries',
    'Audio & Communication', 'Horns',
  ],
  'Handlebar & Controls': [
    'Cables & Lines', 'Handlebars', 'Risers & Clamps', 'Levers & Controls',
    'Mirrors', 'Grips', 'Throttle & Accessories', 'Switches & Wiring',
  ],
  'Carburetion & Fuel': [
    'Air Cleaners & Filters', 'Carburetors & Jets', 'Fuel Lines & Pumps',
    'Fuel Injection', 'Throttle & Cables', 'Intake Manifolds',
  ],
  'Foot Controls': [
    'Footpegs', 'Shifters', 'Floorboards', 'Kickstands',
    'Highway Bars & Pegs', 'Forward Controls', 'Brake Pedals', 'Rearsets & Mid Controls',
  ],
  'Lighting': [
    'Turn Signals', 'Auxiliary Lighting', 'Bulbs', 'Taillights',
    'Headlights', 'License Plate Lighting', 'Lighting Controls',
  ],
  'Suspension': [
    'Shocks & Springs', 'Fork Tubes & Internals', 'Triple Trees & Stems',
    'Fork Lowers & Sliders', 'Swingarms', 'Fork Seals & Boots', 'Lowering & Lift Kits',
  ],
  'Wheels & Tires': [
    'Wheels', 'Axles & Spacers', 'Tires & Tubes',
    'Hubs & Spokes', 'Bearings & Seals', 'Valves & Balancing',
  ],
  'Fenders & Body': [
    'Windshields', 'Gas Tanks', 'Fenders', 'Gas Caps & Petcocks',
    'Fender Parts & Accessories', 'Windshield Hardware & Parts', 'Fairings',
  ],
  'Seating': [
    'Seats', 'Seat Hardware', 'Backrests', 'Seat Pads & Covers',
  ],
  'Frame & Hardware': [
    'Hardware & Fasteners', 'Frame Parts', 'Kickstands', 'Body Panels', 'Protection',
  ],
  'Instrumentation': [
    'Speedometers', 'Gauges', 'Dash & Trim',
  ],
  'Luggage & Racks': [
    'Sissy Bars', 'Saddlebags', 'Bags & Packs', 'Luggage Racks', 'Luggage Parts',
  ],
  'Security & Covers': [
    'Security', 'Bike Covers', 'Shelters & Storage',
  ],
  'Accessories & Misc': [
    'Books & Manuals', 'Trailer & Towing', 'Decals & Emblems',
    'Tie-Downs & Transport', 'Cooling Systems',
  ],
};

// ─── Single tile ─────────────────────────────────────────────────────────────
// Routing responsibility removed — parent handles all navigation via onClick prop.
function Tile({ area, name, image, hov, setHov, onClick }) {
  // Both ENGINE and HANDLEBAR are "hero" tiles (large font + padding).
  // ENGINE is the primary (gold bg, dark text); HANDLEBAR is secondary (deep dark bg, gold text).
  const isHero    = area === 'engine' || area === 'handle';
  const isEngine  = area === 'engine';
  const isHov     = hov === area;
  const bg        = BG[area] ?? DARK;
  const hasImg    = Boolean(image);

  // Per-area font sizes — short names on prominent tiles go large, long names go small.
  // The contrast between EXHAUST at ~3.8rem and ACCESS at ~1.25rem creates visual rhythm.
  const FONT_SIZES = {
    engine:  'clamp(2.6rem, 4.6vw, 5rem)',     // primary hero
    handle:  'clamp(2rem, 3.5vw, 4rem)',        // secondary hero (longer name, slightly smaller)
    exhaust: 'clamp(2.2rem, 4vw, 3.8rem)',      // tall column, one word — run it big
    brakes:  'clamp(1.6rem, 3vw, 2.8rem)',      // short name, compact row
    susp:    'clamp(1.3rem, 2.4vw, 2.2rem)',    // medium
    seat:    'clamp(1.35rem, 2.5vw, 2.3rem)',   // short name "Seating"
    wheels:  'clamp(1.2rem, 2.2vw, 2rem)',      // wide tile
    light:   'clamp(1.1rem, 2vw, 1.85rem)',     // short name
    frame:   'clamp(1.05rem, 1.95vw, 1.8rem)',  // standard
    fenders: 'clamp(0.95rem, 1.75vw, 1.6rem)',  // medium name
    lug:     'clamp(0.95rem, 1.75vw, 1.6rem)',  // medium name
    elec:    'clamp(0.95rem, 1.75vw, 1.6rem)',  // medium-long in compact row
    trans:   'clamp(0.85rem, 1.55vw, 1.4rem)',  // long name, small tile
    carb:    'clamp(0.85rem, 1.55vw, 1.4rem)',  // "Carburetion & Fuel"
    foot:    'clamp(0.85rem, 1.55vw, 1.4rem)',  // "Foot Controls"
    instr:   'clamp(0.85rem, 1.55vw, 1.4rem)',  // "Instrumentation"
    sec:     'clamp(0.85rem, 1.55vw, 1.4rem)',  // "Security & Covers"
    access:  'clamp(0.75rem, 1.4vw, 1.25rem)',  // "Accessories & Misc" — very long
  };
  const fontSize = FONT_SIZES[area] ?? 'clamp(1.05rem, 2vw, 2rem)';

  // Text color:  ENGINE → dark (on gold),  HANDLEBAR hero → gold (on deep dark),  rest → cream
  const textColor = hasImg ? CREAM : (isEngine ? DARK : isHero ? GOLD : CREAM);

  return (
    <div
      className="ss-cat-tile"
      data-area={area}
      onClick={onClick}
      onMouseEnter={() => setHov(area)}
      onMouseLeave={() => setHov(null)}
      style={{
        gridArea: area,
        // Engine keeps its gold on hover too; others darken slightly
        backgroundColor: hasImg ? '#1a1208' : (isHov && !isEngine ? '#2b1c0c' : bg),
        backgroundImage: hasImg ? `url(${image})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
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
      {/* Image overlay */}
      {hasImg && (
        <div style={{
          position: 'absolute', inset: 0,
          background: isHero
            ? `linear-gradient(to top, rgba(20,12,2,0.72) 0%, rgba(20,12,2,0.35) 50%, rgba(201,168,76,0.18) 100%)`
            : `linear-gradient(to top, rgba(10,7,2,0.88) 0%, rgba(10,7,2,0.55) 55%, rgba(10,7,2,0.28) 100%)`,
          transition: 'opacity 0.15s',
          opacity: isHov ? 0.85 : 1,
          pointerEvents: 'none',
        }} />
      )}

      {/* No-image ENGINE only: diagonal light-leak on gold bg */}
      {!hasImg && isEngine && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(130deg,rgba(255,255,255,0.1) 0%,transparent 52%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* No-image HANDLEBAR hero: subtle gold corner glow (inverse of ENGINE light-leak) */}
      {!hasImg && area === 'handle' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(310deg,rgba(201,168,76,0.12) 0%,transparent 52%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* No-image dark tiles: gold mesh texture (all tiles except ENGINE) */}
      {!hasImg && !isEngine && (
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

      {/* Hover arrow */}
      {isHov && (
        <span style={{
          position: 'absolute',
          top:   isHero ? '1.6rem' : '0.95rem',
          right: isHero ? '1.8rem' : '1.1rem',
          fontFamily: 'var(--font-body, Barlow, sans-serif)',
          fontSize: isHero ? '1.1rem' : '0.85rem',
          fontWeight: 700,
          // ENGINE on gold → dark arrow; everything else → gold arrow
          color: hasImg ? GOLD : (isEngine ? 'rgba(26,18,8,0.45)' : GOLD),
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
        color: textColor,
      }}>
        {name}
      </span>
    </div>
  );
}

// ─── Subcategory overlay ─────────────────────────────────────────────────────
// Panel-only overlay — covers left 40% of the grid, right tiles fully visible.
// Springs from the clicked tile: starts as a tiny box AT the tile (via x/y translate),
// then animates to its final left-side position.
function SubcategoryOverlay({ categoryName, familySlug, onSubcatClick, onViewAll, onClose, tileOffset }) {
  const subs = SUBCATEGORIES[categoryName] ?? [];
  const familyLabel = familySlug ? (FAMILY_NAME_MAP[familySlug] ?? familySlug) : null;

  const itemSize = subs.length > 8
    ? 'clamp(1.05rem, 2.1vw, 1.5rem)'
    : subs.length > 5
    ? 'clamp(1.25rem, 2.6vw, 1.85rem)'
    : 'clamp(1.5rem, 3.2vw, 2.3rem)';

  const ox = tileOffset?.x ?? 0;
  const oy = tileOffset?.y ?? 0;

  return (
    <motion.div
      className="ss-subcat-panel"
      initial={{ x: ox, y: oy, scale: 0.12, opacity: 0 }}
      animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
      transition={{
        x:       { type: 'spring', stiffness: 300, damping: 30 },
        y:       { type: 'spring', stiffness: 300, damping: 30 },
        scale:   { type: 'spring', stiffness: 300, damping: 30 },
        opacity: { duration: 0.1 },
      }}
      style={{
        position: 'absolute',
        top: 0, left: 0, bottom: 0,
        width: '40%',
        background: 'rgba(8,7,6,0.97)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        padding: '22px 24px 18px',
        borderRight: `1px solid rgba(201,168,76,0.25)`,
        transformOrigin: '50% 50%',
      }}
    >
      {/* Close button */}
      <motion.button
        onClick={onClose}
        aria-label="Close subcategory panel"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        style={{
          position: 'absolute',
          top: 14, right: -28,
          zIndex: 30,
          width: 56, height: 56,
          background: GOLD,
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 0 3px rgba(201,168,76,0.35), 0 0 0 6px rgba(201,168,76,0.12)`,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 3L17 17M17 3L3 17" stroke={DARK} strokeWidth="2.8" strokeLinecap="round"/>
        </svg>
      </motion.button>

      {/* Category title */}
      <div style={{
        flexShrink: 0,
        borderBottom: `1px solid rgba(201,168,76,0.2)`,
        paddingBottom: '14px',
        marginBottom: '16px',
        paddingRight: '36px',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-tanker)',
          fontSize: 'clamp(1.8rem, 3.8vw, 2.8rem)',
          color: GOLD,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          lineHeight: 1,
          margin: 0,
        }}>
          {categoryName}
        </h2>
        <p style={{
          fontSize: '11px',
          color: 'rgba(242,234,211,0.32)',
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          marginTop: '5px',
          marginBottom: 0,
        }}>
          {familyLabel ? `${familyLabel} · ` : ''}select a subcategory
        </p>
      </div>

      {/* Subcategory list — top-aligned */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}>
        {subs.map((sub, i) => (
          <motion.button
            key={sub}
            className="ss-subcat-item"
            onClick={() => onSubcatClick(sub)}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.14, delay: 0.1 + Math.min(i * 0.025, 0.2) }}
            whileHover={{ x: 8 }}
            style={{
              fontFamily: 'var(--font-tanker)',
              fontSize: itemSize,
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              lineHeight: 1.25,
              color: CREAM,
              background: 'rgba(0,0,0,0)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '5px 0',
              display: 'block',
              width: '100%',
              textDecoration: 'underline',
              textUnderlineOffset: '4px',
              textDecorationThickness: '1px',
              textDecorationColor: 'rgba(242,234,211,0.28)',
            }}
          >
            {sub}
          </motion.button>
        ))}
      </div>

      {/* View all footer */}
      <button
        onClick={onViewAll}
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: `1px solid rgba(201,168,76,0.12)`,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          background: 'rgba(0,0,0,0)',
          cursor: 'pointer',
          color: 'rgba(201,168,76,0.38)',
          fontSize: '11px',
          fontFamily: 'var(--font-body, Barlow, sans-serif)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textAlign: 'left',
          width: '100%',
          flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = GOLD; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(201,168,76,0.38)'; }}
      >
        View all {categoryName} →
      </button>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
//
//  Props:
//    categories  — display_category values to show
//                  accepts: string[] | {name:string}[] | {display_category:string}[]
//    familySlug  — e.g. "softail" → browse URL gets ?family=Softail
//                  omit for site-wide category page
//    images      — optional map of area → image path
//                  e.g. { engine: '/images/cats/engine.jpg' }

export default function CategoryBentoGrid({
  categories = [],
  familySlug = '',
  images = {},
}) {
  const [hov, setHov]             = useState(null);
  const [activeCat, setActiveCat] = useState(null);
  const [tileRect, setTileRect]   = useState(null);  // last-clicked tile metrics
  const containerRef              = useRef(null);
  const router = useRouter();

  // ESC key closes overlay
  useEffect(() => {
    if (!activeCat) return;
    const handler = (e) => { if (e.key === 'Escape') setActiveCat(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCat]);

  const buildParams = useCallback((catName, subcatName = null) => {
    const p = new URLSearchParams({ display_category: catName });
    if (subcatName)  p.set('display_subcategory', subcatName);
    if (familySlug)  p.set('family', FAMILY_NAME_MAP[familySlug] ?? familySlug);
    return p.toString();
  }, [familySlug]);

  // Tile click: capture the tile's bounding rect relative to the grid container
  // so the overlay can scale from exactly that position.
  const handleTileClick = useCallback((name, e) => {
    if (SUBCATEGORIES[name]?.length) {
      if (e?.currentTarget && containerRef.current) {
        const c = containerRef.current.getBoundingClientRect();
        const t = e.currentTarget.getBoundingClientRect();
        setTileRect({
          cx: t.left - c.left + t.width  / 2,  // tile center-x from container left
          cy: t.top  - c.top  + t.height / 2,  // tile center-y from container top
          cw: c.width,
          ch: c.height,
        });
      }
      setActiveCat(name);
    } else {
      router.push(`/browse?${buildParams(name)}`);
    }
  }, [router, buildParams]);

  const handleSubcatClick = useCallback((subcatName) => {
    router.push(`/browse?${buildParams(activeCat, subcatName)}`);
    setActiveCat(null);
  }, [activeCat, router, buildParams]);

  const handleViewAll = useCallback(() => {
    router.push(`/browse?${buildParams(activeCat)}`);
    setActiveCat(null);
  }, [activeCat, router, buildParams]);

  // The panel (40% wide, full height) has its center at (20%, 50%) of the container.
  // We translate it so that center starts AT the clicked tile's center, then spring
  // it back to (0, 0). This makes the panel physically emerge from the tile.
  const PANEL_W = 0.40;
  const tileOffset = tileRect ? {
    x: Math.round(tileRect.cx - tileRect.cw * PANEL_W / 2),  // tile_cx − panel_center_x
    y: Math.round(tileRect.cy - tileRect.ch / 2),            // tile_cy − panel_center_y
  } : { x: 0, y: 0 };

  // Normalize categories
  const names = categories.map((c) => {
    if (typeof c === 'string') return c;
    return c.name ?? c.display_category ?? '';
  });

  const getImage = (area) => {
    if (typeof images === 'string') return images;
    return images?.[area] ?? null;
  };

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

  const tileProps = { hov, setHov };

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

        .ss-subcat-item:hover {
          color: ${GOLD} !important;
          text-decoration-color: rgba(201,168,76,0.7) !important;
        }

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
          .ss-cat-tile[data-area="engine"] { grid-column: span 2; min-height: 144px; }
          /* Wider overlay on mobile */
          .ss-subcat-panel { width: 80% !important; }
        }

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

      {/* ref captures the container rect for origin calculations */}
      <div style={{ position: 'relative' }} ref={containerRef}>
        <div className="ss-cat-grid">
          {known.map(({ name, area }) => (
            <Tile
              key={area}
              area={area}
              name={name}
              image={getImage(area)}
              onClick={(e) => handleTileClick(name, e)}
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
                onClick={(e) => handleTileClick(name, e)}
                {...tileProps}
              />
            ))}
          </div>
        )}

        <AnimatePresence>
          {activeCat && (
            <SubcategoryOverlay
              key={activeCat}
              categoryName={activeCat}
              familySlug={familySlug}
              tileOffset={tileOffset}
              onSubcatClick={handleSubcatClick}
              onViewAll={handleViewAll}
              onClose={() => setActiveCat(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
