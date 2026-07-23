'use client';

/**
 * components/home/ModelFinder.jsx
 *
 * Era → Year → Model Code
 *
 * Step 1 — Era tiles (matches eras.js, uses kinetic letter animation)
 * Step 2 — Year slider, locked to era's year range
 * Step 3 — Model codes for that era + year, grouped by family (rivet radio)
 *
 * API: GET /api/models/search?q={year}   (existing endpoint)
 * Results filtered client-side to the selected era's families.
 *
 * Props:
 *   compact  {boolean}  narrow variant
 *   onSelect {fn}       controlled: receives { era, year, model, url }
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ERAS } from './eras';

const GOLD  = '#c9a84c';
const CREAM = '#d4c89a';
const BLACK = '#0e0b07';
const MONO  = "'Share Tech Mono', monospace";
const SAILOR= "'Tanker', 'Barlow Condensed', sans-serif";
const COND  = "'Barlow Condensed', sans-serif";

const BASE_SHADOW = `
  inset 0 0 0 3px #0e0b07,
  inset 0 0 0 5px #5a420e,
  inset 0 0 0 7px #0e0b07,
  inset 0 0 0 9px #3a2a08,
  0 2px 8px rgba(0,0,0,0.7),
  0 1px 2px rgba(0,0,0,0.9)
`;

// ── Year range per era slug (matches eras.js) ─────────────────────────────────
const ERA_YEARS = {
  'flathead':          { min: 1930, max: 1952 },
  'knucklehead':       { min: 1936, max: 1947 },
  'panhead':           { min: 1948, max: 1965 },
  'shovelhead':        { min: 1966, max: 1984 },
  'ironhead-sportster':{ min: 1957, max: 1985 },
  'evolution':         { min: 1984, max: 1999 },
  'evo-sportster':     { min: 1986, max: 2021 },
  'twin-cam':          { min: 1999, max: 2017 },
  'milwaukee-8':       { min: 2017, max: new Date().getFullYear() },
  'chopper':           { min: 1930, max: new Date().getFullYear() },
};

// ── Tick marks for each era's slider ─────────────────────────────────────────
function getEraYears(slug) {
  return ERA_YEARS[slug] || { min: 1930, max: new Date().getFullYear() };
}

function getTicks(min, max) {
  const span = max - min;
  if (span <= 15) {
    // Short eras: show every few years
    const step = span <= 6 ? 1 : span <= 12 ? 2 : 3;
    const ticks = [];
    for (let y = min; y <= max; y += step) ticks.push(y);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return ticks;
  }
  // Long eras: min, ~25%, ~50%, ~75%, max
  return [
    min,
    Math.round(min + span * 0.25),
    Math.round(min + span * 0.5),
    Math.round(min + span * 0.75),
    max,
  ];
}

// ── Kinetic letter text ───────────────────────────────────────────────────────
const WEIGHTS = [100,200,300,400,500,600,700,800,900];
const SPREAD  = 3;

function getWeight(i, hov) {
  if (hov === null) return 700;
  const dist = Math.abs(i - hov);
  if (dist > SPREAD) return 700;
  const t = 1 - dist / (SPREAD + 1);
  return WEIGHTS[Math.min(Math.round(t * (WEIGHTS.length - 1)), WEIGHTS.length - 1)];
}

function getLetterStyle(w, hot) {
  // Base state (no hover): brand gold — the title reads gold at rest
  if (!hot) return { color: '#c9a84c', textShadow: '0 2px 14px rgba(0,0,0,0.55)' };
  // Hottest letter — bright warm gold, strong glow
  if (w >= 900) return { color: '#ffe680', textShadow: `0 0 32px ${GOLD}, 0 0 16px rgba(201,168,76,0.95), 0 0 56px rgba(201,168,76,0.4)` };
  // Very hot — saturated gold
  if (w >= 800) return { color: '#e8c248', textShadow: '0 0 24px rgba(201,168,76,0.85), 0 0 44px rgba(201,168,76,0.35)' };
  // Hot — mid gold
  if (w >= 700) return { color: '#c9a84c', textShadow: '0 0 18px rgba(201,168,76,0.65)' };
  // Cooling — darker antique gold
  return { color: '#8a6c28', textShadow: '0 0 8px rgba(201,168,76,0.25)' };
}

function KineticText({ text, fontSize = 'clamp(16px,2vw,22px)', letterSpacing = '0.06em' }) {
  const [hov, setHov] = useState(null);

  // Build word groups preserving each character's global index so the
  // hover-distance math still works across the full text.
  // Space tokens become null (gaps are handled by columnGap on the container).
  const chars = [...text];
  const words = [];
  let buf = [];
  chars.forEach((ch, gi) => {
    if (ch === ' ') {
      if (buf.length) { words.push(buf); buf = []; }
      words.push(null); // null = word separator (rendered as columnGap gap)
    } else {
      buf.push({ ch, gi });
    }
  });
  if (buf.length) words.push(buf);

  return (
    <span aria-hidden="true" style={{
      // Outer container: flex row that wraps WHOLE WORDS, not letters
      display:'flex', flexWrap:'wrap', justifyContent:'center', alignItems:'flex-end',
      columnGap:'0.22em',  // space between words
      rowGap:0,
      fontFamily:SAILOR, fontSize,
      textTransform:'uppercase', lineHeight:1, userSelect:'none',
    }}>
      {words.map((word, wi) => {
        // Space tokens: skip — columnGap handles visual spacing
        if (word === null) return null;
        return (
          // Word wrapper: inline-flex + nowrap keeps all letters of a word together
          <span key={wi} style={{ display:'inline-flex', letterSpacing }}>
            {word.map(({ ch, gi }) => {
              const w   = getWeight(gi, hov);
              const hot = hov !== null && Math.abs(gi - hov) <= SPREAD;
              const { color, textShadow } = getLetterStyle(w, hot);
              return (
                <span key={gi}
                  onMouseEnter={() => setHov(gi)}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    display:'inline-block',
                    fontWeight: w, color, textShadow,
                    transition:'font-weight 0.1s ease, color 0.1s ease, text-shadow 0.1s ease',
                  }}
                >{ch}</span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

// ── Corners ───────────────────────────────────────────────────────────────────
function Corners() {
  return (
    <>
      {['tl','tr','bl','br'].map(pos => (
        <span key={pos} aria-hidden="true" style={{
          position:'absolute', width:10, height:10,
          borderColor:GOLD, borderStyle:'solid', opacity:0.5,
          top:    pos.startsWith('t') ? 7 : undefined,
          bottom: pos.startsWith('b') ? 7 : undefined,
          left:   pos.endsWith('l')   ? 7 : undefined,
          right:  pos.endsWith('r')   ? 7 : undefined,
          borderWidth: [
            pos.startsWith('t')?'1.5px':'0',
            pos.endsWith('r')  ?'1.5px':'0',
            pos.startsWith('b')?'1.5px':'0',
            pos.endsWith('l')  ?'1.5px':'0',
          ].join(' '),
        }}/>
      ))}
    </>
  );
}

// ── Arrow stepper button ──────────────────────────────────────────────────────
function ArrowBtn({ onClick, label, children }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick} aria-label={label}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width:40, height:40, flexShrink:0,
        background: hov ? 'rgba(201,168,76,0.16)' : 'rgba(201,168,76,0.07)',
        border: `1px solid ${hov ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.32)'}`,
        color: GOLD,
        display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', outline:'none',
        transition:'background 0.15s, border-color 0.15s',
      }}
    >{children}</button>
  );
}

// ── Step dots ─────────────────────────────────────────────────────────────────
function StepDots({ step }) {
  return (
    <div style={{display:'flex', gap:7, alignItems:'center'}}>
      {[1,2,3].map(n => (
        <span key={n} style={{
          width: n === step ? 16 : 6, height: 6, borderRadius: 999,
          background: n === step ? GOLD : n < step ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.12)',
          transition: 'width 0.3s ease, background 0.3s ease',
        }}/>
      ))}
    </div>
  );
}

// ── Gold rivet radio row ──────────────────────────────────────────────────────
function RivetRow({ item, selected, onClick }) {
  const catchall = item.is_catchall;
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:11,
        padding:'10px 14px',
        background: selected ? '#1a1508' : 'rgba(14,11,7,0.7)',
        borderTop:    `1px solid ${selected ? 'rgba(201,168,76,0.65)' : 'rgba(255,255,255,0.06)'}`,
        borderRight:  `1px solid ${selected ? 'rgba(201,168,76,0.65)' : 'rgba(255,255,255,0.06)'}`,
        borderBottom: `1px solid ${selected ? 'rgba(201,168,76,0.65)' : 'rgba(255,255,255,0.06)'}`,
        borderLeft:   catchall
          ? '2px solid rgba(201,168,76,0.3)'
          : `1px solid ${selected ? 'rgba(201,168,76,0.65)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 0,
        cursor:'pointer', textAlign:'left', width:'100%',
        transition:'border-color 0.18s, background 0.18s',
      }}
    >
      {/* Rivet */}
      <span style={{
        width:18, height:18, borderRadius:'50%', flexShrink:0,
        border: `2px solid ${selected ? GOLD : 'rgba(201,168,76,0.28)'}`,
        background: BLACK,
        display:'flex', alignItems:'center', justifyContent:'center',
        transition:'border-color 0.18s',
      }}>
        <span style={{
          width:8, height:8, borderRadius:'50%',
          background: `radial-gradient(circle at 35% 35%, #ffe566, ${GOLD})`,
          boxShadow: '0 0 5px rgba(201,168,76,0.7)',
          transform: selected ? 'scale(1)' : 'scale(0)',
          transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }}/>
      </span>

      {/* Label */}
      <span style={{flex:1, minWidth:0}}>
        <span style={{
          display:'block', fontFamily:SAILOR, fontSize:15, fontWeight:700,
          letterSpacing:'0.04em', textTransform:'uppercase',
          color: selected ? CREAM : 'rgba(212,200,154,0.75)',
          textShadow:'1px 1px 0 rgba(0,0,0,0.8)',
          lineHeight:1, marginBottom:2,
          transition:'color 0.18s',
        }}>
          {item.model_name}
        </span>
        {!catchall && item.model_code && (
          <span style={{
            fontFamily:MONO, fontSize:9, letterSpacing:'0.12em',
            color: selected ? GOLD : 'rgba(201,168,76,0.45)',
            textTransform:'uppercase',
            transition:'color 0.18s',
          }}>
            {item.model_code}
          </span>
        )}
      </span>

      {/* Right badge */}
      {catchall ? (
        <span style={{fontFamily:MONO, fontSize:8, letterSpacing:'0.12em',
          color:'rgba(201,168,76,0.5)', textTransform:'uppercase', flexShrink:0}}>
          ERA →
        </span>
      ) : (
        <svg style={{
          color: selected ? GOLD : 'rgba(201,168,76,0.25)', flexShrink:0,
          transition:'color 0.15s, transform 0.15s',
          transform: selected ? 'translateX(2px)' : 'translateX(0)',
        }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      )}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ModelFinder({ compact = false, onSelect }) {
  const router = useRouter();

  const [era, setEra] = useState(null);   // tracks selected tile for highlight

  // Pick era → navigate directly to browse filtered by that era.
  // No year slider, no model-code step — user refines on the browse page.
  const pickEra = (e) => {
    const url = `/browse?era=${e.slug}`;
    if (onSelect) onSelect({ era: e, url });
    else router.push(url);
  };

  return (
    <>
      <style>{`
        @font-face {
          font-family:'Tanker';
          src:url('/fonts/Tanker-Regular.ttf') format('truetype');
          font-weight:400; font-display:swap;
        }

        /* ── Era tile cards ───────────────────────────────────────────────── */
        .mf-era-btn {
          background:#111009;
          border:1px solid rgba(255,255,255,0.07);
          border-radius:0;
          padding:0;
          cursor:pointer;
          text-align:left;
          position:relative;
          overflow:hidden;
          width:100%;
          display:flex;
          flex-direction:column;
          justify-content:flex-end;
          box-shadow:0 8px 32px rgba(0,0,0,0.5);
          transition:border-color 0.25s, transform 0.18s, box-shadow 0.25s;
        }
        .mf-era-btn:hover {
          border-color:rgba(201,168,76,0.5);
          transform:translateY(-3px);
          box-shadow:0 16px 48px rgba(0,0,0,0.7);
        }
        .mf-era-btn.sel {
          border-color:rgba(201,168,76,0.9);
          box-shadow:0 0 0 1px rgba(201,168,76,0.25),
                     0 16px 48px rgba(0,0,0,0.7),
                     0 0 60px rgba(201,168,76,0.12);
        }

        /* Background photo — clipped to tile via parent overflow:hidden */
        .mf-era-btn .era-art {
          position:absolute;
          inset:0;
          background-size:cover;
          background-position:center;
          opacity:0.55;
          transition:opacity 0.3s;
        }
        .mf-era-btn:hover .era-art { opacity:0.72; }
        .mf-era-btn.sel   .era-art { opacity:0.80; }

        /* Dark gradient scrim — keeps text legible over the photo */
        .mf-era-btn .era-gradient {
          position:absolute;
          inset:0;
          background:linear-gradient(
            to top,
            rgba(0,0,0,0.92) 0%,
            rgba(0,0,0,0.4)  50%,
            transparent      100%
          );
        }

        /* Selected-state corner bracket */
        .mf-era-btn .era-corner {
          position:absolute; top:10px; right:10px;
          width:16px; height:16px;
          border-top:1.5px solid ${GOLD}; border-right:1.5px solid ${GOLD};
          border-radius:0;
          opacity:0; transition:opacity 0.25s;
        }
        .mf-era-btn.sel .era-corner { opacity:1; }

        /* Text content sits above all overlays */
        .mf-era-btn .era-content {
          position:relative;
          z-index:1;
          padding:14px 14px 16px;
        }

        /* Selected-state gold dot */
        .mf-era-btn .era-sel-dot {
          position:absolute; top:10px; left:10px; z-index:2;
          width:8px; height:8px; border-radius:50%;
          background:${GOLD};
          box-shadow:0 0 8px rgba(201,168,76,0.9);
          opacity:0; transform:scale(0);
          transition:opacity 0.2s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .mf-era-btn.sel .era-sel-dot { opacity:1; transform:scale(1); }

        /* ── Entrance animation ────────────────────────────────────────────── */
        @keyframes mfIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .mf-anim { animation:mfIn 0.28s ease; }
      `}</style>

      <div style={{
        background: BLACK, outline:'1px solid #7a5c1a',
        boxShadow: BASE_SHADOW,
        width:'100%', maxWidth: compact ? 420 : '100%',
        margin:'0 auto', position:'relative', boxSizing:'border-box',
      }}>
        <Corners/>

        {/* Hatch texture */}
        <div aria-hidden="true" style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:`repeating-linear-gradient(
            -45deg, transparent, transparent 10px,
            rgba(201,168,76,0.018) 10px, rgba(201,168,76,0.018) 11px
          )`,
        }}/>

        {/* Header */}
        <div style={{
          padding:'28px 32px 22px',
          borderBottom:'1px solid rgba(201,168,76,0.14)',
          position:'relative', zIndex:1,
        }}>
          {/* Top row: label */}
          <div style={{display:'flex', alignItems:'center', marginBottom:10}}>
            <div style={{
              fontFamily:MONO, fontSize:11, letterSpacing:'0.22em',
              color:'rgba(201,168,76,0.55)', textTransform:'uppercase',
            }}>
              Stinkin' Supplies
            </div>
          </div>

          {/* Big kinetic title — centered, 2× size */}
          <div style={{ textAlign:'center', width:'100%' }}>
            <KineticText
              text="Find Your Parts"
              fontSize="clamp(72px,10vw,144px)"
              letterSpacing="0.03em"
            />
          </div>

          {/* Gold rule under title */}
          <div style={{
            marginTop:14,
            height:1,
            background:'linear-gradient(to right, rgba(201,168,76,0.5), rgba(201,168,76,0.08) 60%, transparent)',
          }}/>
        </div>

        {/* Era tiles — click any tile to browse that era */}
        <div key="s1" className="mf-anim" style={{
          padding:'20px 20px 22px',
          position:'relative', zIndex:1,
          background: BLACK,
        }}>
          <div style={{fontFamily:MONO, fontSize:9, letterSpacing:'0.2em',
            color:'rgba(201,168,76,0.5)', textTransform:'uppercase', marginBottom:14}}>
            Select Era / Engine
          </div>

          <div style={{
            display:'grid',
            gridTemplateColumns: compact ? 'repeat(2,1fr)' : 'repeat(5,1fr)',
            gridAutoRows: compact ? '200px' : '320px',
            gap:10,
          }}>
            {ERAS.map(e => {
              const sel = era?.slug === e.slug;
              return (
                <button
                  key={e.slug}
                  type="button"
                  className={`mf-era-btn${sel ? ' sel' : ''}`}
                  onClick={() => { setEra(e); pickEra(e); }}
                >
                  {/* Background image */}
                  <div
                    className="era-art"
                    style={{ backgroundImage: e.img ? `url('/images/eras/${e.img}')` : 'none' }}
                  />
                  {/* Gradient overlay */}
                  <div className="era-gradient"/>
                  {/* Selected corner bracket */}
                  <div className="era-corner"/>
                  {/* Selected gold dot */}
                  <div className="era-sel-dot"/>
                  {/* Text content */}
                  <div className="era-content">
                    <span style={{
                      display:'block', fontFamily:MONO, fontSize:11,
                      letterSpacing:'0.16em', color: sel ? '#f0c040' : GOLD,
                      textTransform:'uppercase', marginBottom:6,
                    }}>
                      {e.years}
                    </span>
                    <span style={{
                      display:'block', fontFamily:SAILOR,
                      fontSize:'clamp(16px,2vw,26px)', fontWeight:400,
                      letterSpacing:'0.04em', textTransform:'uppercase',
                      color: sel ? '#fff8e6' : CREAM,
                      lineHeight:1.1,
                      textShadow:'0 1px 4px rgba(0,0,0,0.8)',
                    }}>
                      {e.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
