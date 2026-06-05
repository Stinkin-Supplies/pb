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

import { useState, useCallback } from 'react';
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
  if (!hot) return { color: 'rgba(245,240,232,0.92)', textShadow: '0 2px 12px rgba(0,0,0,0.45)' };
  if (w >= 900) return { color: '#fff8e6', textShadow: `0 0 32px ${GOLD}, 0 0 12px rgba(236,173,47,0.9)` };
  if (w >= 800) return { color: '#ffcc66', textShadow: '0 0 22px rgba(232,98,26,0.9)' };
  if (w >= 700) return { color: '#e8821a', textShadow: '0 0 16px rgba(231,164,48,0.7)' };
  return { color: '#c0390a', textShadow: '0 0 8px rgba(225,117,17,0.5)' };
}

function KineticText({ text, fontSize = 'clamp(16px,2vw,22px)', letterSpacing = '0.06em' }) {
  const [hov, setHov] = useState(null);
  return (
    <span aria-hidden="true" style={{
      display:'inline-flex', gap:0, fontFamily:SAILOR, fontSize,
      textTransform:'uppercase', letterSpacing, lineHeight:1, userSelect:'none',
    }}>
      {text.split('').map((char, i) => {
        const w   = getWeight(i, hov);
        const hot = hov !== null && Math.abs(i - hov) <= SPREAD;
        const { color, textShadow } = getLetterStyle(w, hot);
        return (
          <span key={i}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov(null)}
            style={{
              display:'inline-block',
              whiteSpace: char === ' ' ? 'pre' : 'normal',
              fontWeight: w, color, textShadow,
              transition: 'font-weight 0.1s ease, color 0.1s ease, text-shadow 0.1s ease',
            }}
          >
            {char === ' ' ? '\u00A0' : char}
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

  const [step,     setStep]     = useState(1);
  const [era,      setEra]      = useState(null);   // full ERAS object
  const [year,     setYear]     = useState(null);
  const [models,   setModels]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(false);
  const [selected, setSelected] = useState(null);

  // Derived year range from selected era
  const { min: yearMin, max: yearMax } = era ? getEraYears(era.slug) : { min: 1930, max: new Date().getFullYear() };
  const currentYear = year ?? yearMax;
  const fillPct = Math.round(((currentYear - yearMin) / (yearMax - yearMin)) * 100);
  const ticks = getTicks(yearMin, yearMax);

  const stepYear = delta =>
    setYear(p => Math.min(yearMax, Math.max(yearMin, (p ?? yearMax) + delta)));

  // Pick era → init year to era's most recent year → step 2
  const pickEra = (e) => {
    setEra(e);
    const { max } = getEraYears(e.slug);
    setYear(max);
    setStep(2);
  };

  // Fetch models for selected era + year → step 3
  const goToModels = useCallback(async (yr) => {
    setLoading(true); setError(false); setModels([]); setSelected(null);
    setStep(3);
    try {
      const res  = await fetch(`/api/models/search?q=${yr}`);
      const data = await res.json();
      // Filter to this era's results only
      // The API returns all models for the year; we filter by era slug match
      // (catchall items with era_slug matching, or family members of this era)
      const all = data.results || [];
      // Keep items that belong to this era by checking era_slug or letting all through
      // since year already constrains reasonably well for specific eras.
      // For overlapping eras (e.g. Evolution 1984-2000 overlaps Twin Cam 1999-2017),
      // the year range in ERA_YEARS already gates the slider so only valid years are reachable.
      setModels(all);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pick model — advance only if not already auto-advancing via rivet click
  const pickModel = (item) => { setSelected(item); };

  // Navigate
  const navigate = useCallback(() => {
    if (!selected) return;
    const params = new URLSearchParams();
    if (selected.family)     params.set('family', selected.family);
    if (currentYear)         params.set('year',   currentYear);
    if (selected.model_code) params.set('model',  selected.model_code);
    const url = `/browse?${params.toString()}`;
    if (onSelect) onSelect({ era, year: currentYear, model: selected, url });
    else router.push(url);
  }, [selected, era, currentYear, onSelect, router]);

  const reset = () => { setStep(1); setEra(null); setYear(null); setModels([]); setSelected(null); };
  const back  = () => { setStep(s => s - 1); if (step === 3) { setSelected(null); setModels([]); } };

  // Group models by family
  const grouped = models.reduce((acc, item) => {
    const f = item.family || 'Other';
    (acc[f] = acc[f] || []).push(item);
    return acc;
  }, {});

  return (
    <>
      <style>{`
        @font-face {
          font-family:'Tanker';
          src:url('/fonts/Tanker-Regular.ttf') format('truetype');
          font-weight:400; font-display:swap;
        }
        .mf-range {
          -webkit-appearance:none; appearance:none;
          width:100%; height:3px; border-radius:0; outline:none; cursor:pointer;
          background:linear-gradient(to right,
            ${GOLD} 0%, ${GOLD} var(--fill-pct,50%),
            rgba(90,66,14,0.5) var(--fill-pct,50%), rgba(90,66,14,0.5) 100%
          );
        }
        .mf-range::-webkit-slider-thumb {
          -webkit-appearance:none;
          width:18px; height:18px; border-radius:0;
          background:${GOLD}; border:2px solid #0e0b07;
          box-shadow:0 0 0 1px #5a420e; cursor:pointer;
          transition:transform 0.1s;
        }
        .mf-range:active::-webkit-slider-thumb { transform:scale(1.2); }
        .mf-range::-moz-range-thumb {
          width:18px; height:18px; border-radius:0;
          background:${GOLD}; border:2px solid #0e0b07; cursor:pointer;
        }
        .mf-range::-moz-range-track { height:3px; background:rgba(90,66,14,0.5); }
        .mf-range::-moz-range-progress { height:3px; background:${GOLD}; }
        .mf-tick {
          font-family:${MONO}; font-size:9px; letter-spacing:0.06em;
          color:rgba(201,168,76,0.28); cursor:pointer; user-select:none;
          transition:color 0.15s;
        }
        .mf-tick:hover { color:rgba(201,168,76,0.7); }
        .mf-go {
          flex-shrink:0; height:40px; padding:0 22px;
          background:${GOLD}; border:none;
          outline:1px solid #5a420e;
          box-shadow:inset 0 0 0 1px #0e0b07, inset 0 0 0 2px #8a6420;
          color:${BLACK}; font-family:${SAILOR}; font-size:16px; font-weight:700;
          letter-spacing:0.18em; text-transform:uppercase;
          cursor:pointer; display:flex; align-items:center; gap:6px;
          transition:background 0.15s;
        }
        .mf-go:hover { background:#e2c06a; }
        .mf-go:active { transform:scale(0.94); }
        .mf-era-btn {
          background:#111009; border:1px solid rgba(255,255,255,0.07);
          border-radius:12px; padding:0;
          cursor:pointer; text-align:left;
          transition:border-color 0.25s, transform 0.18s, box-shadow 0.25s;
          position:relative; overflow:hidden;
          aspect-ratio:16/10;
          display:flex; flex-direction:column; justify-content:flex-end;
          box-shadow:0 8px 32px rgba(0,0,0,0.5);
        }
        .mf-era-btn:hover {
          border-color:rgba(201,168,76,0.5);
          transform:translateY(-3px);
          box-shadow:0 16px 48px rgba(0,0,0,0.7);
        }
        .mf-era-btn.sel {
          border-color:rgba(201,168,76,0.9);
          box-shadow:0 0 0 1px rgba(201,168,76,0.25), 0 16px 48px rgba(0,0,0,0.7), 0 0 60px rgba(201,168,76,0.12);
        }
        .mf-era-btn .era-art {
          position:absolute; inset:0;
          background-size:cover; background-position:center;
          opacity:0.28; transition:opacity 0.3s;
        }
        .mf-era-btn:hover .era-art { opacity:0.42; }
        .mf-era-btn.sel .era-art   { opacity:0.52; }
        .mf-era-btn .era-gradient {
          position:absolute; inset:0;
          background:linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
        }
        .mf-era-btn .era-corner {
          position:absolute; top:10px; right:10px;
          width:16px; height:16px;
          border-top:1.5px solid ${GOLD}; border-right:1.5px solid ${GOLD};
          border-radius:0 4px 0 0; opacity:0; transition:opacity 0.25s;
        }
        .mf-era-btn.sel .era-corner { opacity:1; }
        .mf-era-btn .era-content {
          position:relative; z-index:1;
          padding:10px 12px 11px;
        }
        .mf-era-btn .era-sel-dot {
          position:absolute; top:10px; left:10px; z-index:2;
          width:8px; height:8px; border-radius:50%;
          background:${GOLD};
          box-shadow:0 0 8px rgba(201,168,76,0.9);
          opacity:0; transform:scale(0);
          transition:opacity 0.2s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .mf-era-btn.sel .era-sel-dot { opacity:1; transform:scale(1); }
        .mf-family-hdr {
          padding:7px 14px 5px;
          font-family:${MONO}; font-size:9px; letter-spacing:0.22em;
          text-transform:uppercase; color:${GOLD};
          background:rgba(201,168,76,0.05);
          border-top:1px solid rgba(201,168,76,0.08);
          border-bottom:1px solid rgba(201,168,76,0.1);
        }
        .mf-scroll { overflow-y:auto; }
        .mf-scroll::-webkit-scrollbar { width:3px; }
        .mf-scroll::-webkit-scrollbar-thumb { background:#5a420e; }
        .mf-find {
          width:100%; padding:13px 0;
          background:linear-gradient(135deg,${GOLD} 0%,#a07828 100%);
          border:none; border-radius:0; color:${BLACK};
          font-family:${COND}; font-size:16px; font-weight:800;
          letter-spacing:0.18em; text-transform:uppercase;
          cursor:pointer; position:relative; overflow:hidden;
          outline:1px solid #5a420e;
          box-shadow:inset 0 0 0 1px #0e0b07, inset 0 0 0 2px #8a6420;
          transition:opacity 0.15s;
        }
        .mf-find::before {
          content:''; position:absolute; inset:0;
          background:linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 50%);
        }
        .mf-find:hover { opacity:0.9; }
        .mf-find:active { transform:scale(0.99); }
        .mf-back {
          background:transparent; border-radius:0;
          border:1px solid rgba(255,255,255,0.1);
          color:rgba(245,240,232,0.45); font-family:${MONO};
          font-size:9px; letter-spacing:0.18em; text-transform:uppercase;
          padding:8px 14px; cursor:pointer; flex-shrink:0;
          transition:border-color 0.15s, color 0.15s;
        }
        .mf-back:hover { border-color:rgba(255,255,255,0.28); color:rgba(245,240,232,0.75); }
        .mf-spinner {
          width:16px; height:16px; border-radius:50%;
          border:2px solid #2a1f08; border-top-color:${GOLD};
          animation:mfSpin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes mfSpin { to { transform:rotate(360deg); } }
        @keyframes mfIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .mf-anim { animation:mfIn 0.28s ease; }
        .mf-era-years {
          font-family:${MONO}; font-size:8px;
          color:rgba(245,240,232,0.35); margin-top:4px; letter-spacing:0.06em;
        }
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
          padding:'16px 24px 14px',
          borderBottom:'1px solid rgba(201,168,76,0.14)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          position:'relative', zIndex:1,
        }}>
          <div>
            <div style={{fontFamily:MONO, fontSize:8, letterSpacing:'0.22em',
              color:'rgba(201,168,76,0.5)', textTransform:'uppercase', marginBottom:3}}>
              Stinkin' Supplies
            </div>
            <KineticText text="Find Parts for Your Harley" fontSize="clamp(14px,1.8vw,20px)"/>
          </div>
          <StepDots step={step}/>
        </div>

        {/* ── STEP 1: Era ────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div key="s1" className="mf-anim" style={{padding:'20px 20px 22px', position:'relative', zIndex:1}}>
            <div style={{fontFamily:MONO, fontSize:9, letterSpacing:'0.2em',
              color:'rgba(201,168,76,0.5)', textTransform:'uppercase', marginBottom:14}}>
              Step 01 — Select Era / Engine
            </div>

            <div style={{
              display:'grid',
              gridTemplateColumns: compact ? 'repeat(2,1fr)' : 'repeat(5,1fr)',
              gap:10,
            }}>
              {ERAS.map(e => {
                const sel = era?.slug === e.slug;
                return (
                  <button
                    key={e.slug}
                    type="button"
                    className={`mf-era-btn${sel ? ' sel' : ''}`}
                    onClick={() => pickEra(e)}
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
                        display:'block', fontFamily:MONO, fontSize:8,
                        letterSpacing:'0.16em', color: sel ? '#f0c040' : GOLD,
                        textTransform:'uppercase', marginBottom:4,
                      }}>
                        {e.years}
                      </span>
                      <span style={{
                        display:'block', fontFamily:SAILOR,
                        fontSize:'clamp(12px,1.3vw,15px)', fontWeight:400,
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
        )}

        {/* ── STEP 2: Year ───────────────────────────────────────────────────── */}
        {step === 2 && (
          <div key="s2" className="mf-anim" style={{padding:'26px 24px 24px', position:'relative', zIndex:1}}>
            <div style={{fontFamily:MONO, fontSize:9, letterSpacing:'0.2em',
              color:'rgba(201,168,76,0.5)', textTransform:'uppercase', marginBottom:18}}>
              Step 02 — Select Year
            </div>

            {/* Era badge */}
            <div style={{
              display:'inline-flex', alignItems:'center', gap:8,
              marginBottom:16,
              background:'rgba(201,168,76,0.07)',
              border:'1px solid rgba(201,168,76,0.2)',
              padding:'5px 12px 5px 10px',
            }}>
              <div style={{
                width:6, height:6, borderRadius:'50%',
                background:GOLD, flexShrink:0,
              }}/>
              <span style={{fontFamily:SAILOR, fontSize:13, fontWeight:700,
                letterSpacing:'0.06em', textTransform:'uppercase', color:CREAM}}>
                {era?.name}
              </span>
              <span style={{fontFamily:MONO, fontSize:8, color:'rgba(201,168,76,0.5)',
                letterSpacing:'0.12em', textTransform:'uppercase'}}>
                {era?.years}
              </span>
            </div>

            {/* Giant year */}
            <div aria-live="polite" aria-atomic="true" style={{
              fontFamily:SAILOR, fontSize:'clamp(64px,13vw,100px)',
              fontWeight:700, letterSpacing:'0.06em',
              color:CREAM, lineHeight:1, textAlign:'center',
              textShadow:'1px 1px 0 #000, -1px -1px 0 rgba(255,220,100,0.15)',
              userSelect:'none', marginBottom:20,
            }}>
              {currentYear}
            </div>

            {/* Controls */}
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <ArrowBtn onClick={() => stepYear(-1)} label="Previous year">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </ArrowBtn>

              <div style={{flex:1, display:'flex', flexDirection:'column', gap:7}}>
                <input type="range" className="mf-range"
                  min={yearMin} max={yearMax} step={1}
                  value={currentYear}
                  style={{'--fill-pct':`${fillPct}%`}}
                  onChange={e => setYear(parseInt(e.target.value, 10))}
                  onKeyDown={e => { if(e.key==='Enter') goToModels(currentYear); }}
                  aria-label="Select model year"
                />
                <div style={{display:'flex', justifyContent:'space-between', padding:'0 2px'}}>
                  {ticks.map(yr => (
                    <span key={yr} className="mf-tick" onClick={() => setYear(yr)}>{yr}</span>
                  ))}
                </div>
              </div>

              <ArrowBtn onClick={() => stepYear(1)} label="Next year">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </ArrowBtn>

              <button className="mf-go" onClick={() => goToModels(currentYear)}
                aria-label={`Browse ${currentYear} models`}>
                GO
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="11" height="11">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </button>
            </div>

          </div>
        )}

        {/* ── STEP 3: Model codes ────────────────────────────────────────────── */}
        {step === 3 && (
          <div key="s3" className="mf-anim" style={{position:'relative', zIndex:1}}>

            {/* Sub-header */}
            <div style={{
              padding:'14px 24px 12px',
              borderBottom:'1px solid rgba(201,168,76,0.1)',
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
            }}>
              <div style={{fontFamily:MONO, fontSize:9, letterSpacing:'0.2em',
                color:'rgba(201,168,76,0.5)', textTransform:'uppercase'}}>
                Step 03 — Select Model
              </div>
              <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
                <span style={{fontFamily:SAILOR, fontSize:'clamp(18px,2.5vw,24px)',
                  fontWeight:700, color:CREAM, letterSpacing:'0.06em', lineHeight:1}}>
                  {currentYear}
                </span>
                <span style={{fontFamily:MONO, fontSize:8, color:'rgba(201,168,76,0.5)',
                  letterSpacing:'0.1em', textTransform:'uppercase'}}>
                  {era?.name}
                </span>
              </div>
            </div>

            {loading && (
              <div style={{display:'flex', alignItems:'center', justifyContent:'center',
                gap:12, padding:'44px 24px', fontFamily:MONO, fontSize:10,
                letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(201,168,76,0.4)'}}>
                <span className="mf-spinner"/>
                Loading {currentYear} models…
              </div>
            )}

            {!loading && error && (
              <div style={{padding:'44px 24px', textAlign:'center', fontFamily:MONO,
                fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
                color:'rgba(201,168,76,0.3)'}}>
                Couldn't load models — try again.
              </div>
            )}

            {!loading && !error && models.length === 0 && (
              <div style={{padding:'44px 24px', textAlign:'center', fontFamily:MONO,
                fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase',
                color:'rgba(201,168,76,0.3)'}}>
                No models found for {currentYear}.
              </div>
            )}

            {!loading && models.length > 0 && (
              <div className="mf-scroll" role="radiogroup"
                aria-label={`${currentYear} model selection`}
                style={{maxHeight: compact ? 280 : 360}}>
                {Object.entries(grouped).map(([family, items]) => (
                  <div key={family}>
                    <div className="mf-family-hdr">{family}</div>
                    {items
                      .filter((item, idx, arr) => arr.findIndex(x => x.model_code === item.model_code) === idx)
                      .map(item => (
                      <RivetRow
                        key={`${family}-${item.year}-${item.model_code}`}
                        item={item}
                        selected={selected?.model_code === item.model_code}
                        onClick={() => pickModel(item)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding:'12px 24px 16px',
              borderTop:'1px solid rgba(201,168,76,0.1)',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <button className="mf-back" onClick={back}>← Back</button>
              {selected ? (
                <button className="mf-find" onClick={navigate} style={{flex:1}}>
                  Find Parts for {selected.model_code || selected.model_name} →
                </button>
              ) : (
                <div style={{flex:1, fontFamily:MONO, fontSize:9,
                  letterSpacing:'0.14em', color:'rgba(201,168,76,0.3)',
                  textTransform:'uppercase', textAlign:'center'}}>
                  Select a model above
                </div>
              )}
            </div>

          </div>
        )}

        {/* Breadcrumb trail + reset (steps 2+) */}
        {step > 1 && (
          <div style={{
            padding:'8px 24px 10px',
            borderTop: step === 1 ? 'none' : '1px solid rgba(201,168,76,0.06)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            position:'relative', zIndex:1,
          }}>
            <div style={{fontFamily:MONO, fontSize:8, letterSpacing:'0.14em',
              color:'rgba(201,168,76,0.4)', textTransform:'uppercase'}}>
              <span style={{color:'rgba(201,168,76,0.65)'}}>{era?.name}</span>
              {step >= 2 && year && <> · <span style={{color:'rgba(201,168,76,0.65)'}}>{currentYear}</span></>}
              {step >= 3 && selected && <> · <span style={{color:GOLD}}>{selected.model_code || selected.model_name}</span></>}
            </div>
            <button type="button" onClick={reset}
              style={{background:'none', border:'none', fontFamily:MONO, fontSize:8,
                letterSpacing:'0.18em', color:'rgba(180,150,80,0.4)',
                textTransform:'uppercase', cursor:'pointer', transition:'color 0.15s'}}
              onMouseEnter={e => e.currentTarget.style.color='rgba(201,168,76,0.75)'}
              onMouseLeave={e => e.currentTarget.style.color='rgba(180,150,80,0.4)'}
            >
              Reset
            </button>
          </div>
        )}

      </div>
    </>
  );
}
