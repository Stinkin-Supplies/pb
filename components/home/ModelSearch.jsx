'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { YEARS } from './eras';

const GOLD  = '#c9a84c';
const CREAM = '#d4c89a';
const BLACK = '#0e0b07';

const BASE_SHADOW = `
  inset 0 0 0 3px #0e0b07,
  inset 0 0 0 5px #5a420e,
  inset 0 0 0 7px #0e0b07,
  inset 0 0 0 9px #3a2a08,
  0 2px 8px rgba(0,0,0,0.7),
  0 1px 2px rgba(0,0,0,0.9)
`;

const POSITIONS = ['tl', 'tr', 'bl', 'br'];

const MIN_YEAR = YEARS[YEARS.length - 1];
const MAX_YEAR = YEARS[0];

const TICKS = [MIN_YEAR, 1950, 1970, 1990, 2010, MAX_YEAR];

// ─── Corner bracket ornaments ─────────────────────────────────────────────
function Corners() {
  return (
    <>
      {POSITIONS.map((pos) => (
        <span key={pos} aria-hidden="true" style={{
          position: 'absolute',
          width: 10, height: 10,
          borderColor: GOLD, borderStyle: 'solid', opacity: 0.55,
          top:    pos.startsWith('t') ? 7 : undefined,
          bottom: pos.startsWith('b') ? 7 : undefined,
          left:   pos.endsWith('l')   ? 7 : undefined,
          right:  pos.endsWith('r')   ? 7 : undefined,
          borderWidth: [
            pos.startsWith('t') ? '1.5px' : '0',
            pos.endsWith('r')   ? '1.5px' : '0',
            pos.startsWith('b') ? '1.5px' : '0',
            pos.endsWith('l')   ? '1.5px' : '0',
          ].join(' '),
        }} />
      ))}
    </>
  );
}

// ─── Arrow button ─────────────────────────────────────────────────────────
// To use a custom SVG icon: replace the <svg> inside ArrowBtn with your own.
// Keep width/height set and stroke="currentColor" so gold color is inherited.
function ArrowBtn({ onClick, label, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 40, height: 40,
        flexShrink: 0,
        background: hovered ? 'rgba(201,168,76,0.16)' : 'rgba(201,168,76,0.07)',
        border: `1px solid ${hovered ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.32)'}`,
        color: GOLD,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        outline: 'none',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {children}
    </motion.button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function ModelSearch() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState(MAX_YEAR);
  const [models, setModels]             = useState([]);
  const [modalOpen, setModalOpen]       = useState(false);
  const [loading, setLoading]           = useState(false);
  const [mounted, setMounted]           = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const openModal = async (year) => {
    if (!year) return;
    setLoading(true);
    setModalOpen(true);
    try {
      const res  = await fetch(`/api/models/search?q=${year}`);
      const data = await res.json();
      setModels(data.results || []);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const selectModel = (item) => {
    setModalOpen(false);
    // Route to the model product page if we have enough info, else fall back to /browse
    if (item.family_slug && item.filter_group) {
      router.push(
        `/harley/${item.family_slug}/${item.filter_group.toLowerCase()}?year=${item.year}`
      );
    } else {
      router.push(
        `/browse?year=${item.year}&model=${encodeURIComponent(item.model_code)}`
      );
    }
  };

  const stepYear = (delta) =>
    setSelectedYear(prev => Math.min(MAX_YEAR, Math.max(MIN_YEAR, prev + delta)));

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  const fillPct = Math.round(((selectedYear - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100);

  // ─── Modal ───────────────────────────────────────────────────────────────
  const modal = mounted && modalOpen && createPortal(
    <>
      <style>{`
        .ms-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: msOverlayIn 0.2s ease;
        }
        @keyframes msOverlayIn { from { opacity:0 } to { opacity:1 } }
        .ms-modal {
          position: relative;
          background: #0e0b07;
          outline: 1px solid #7a5c1a;
          box-shadow: ${BASE_SHADOW};
          width: 100%; max-width: 520px; max-height: 72vh;
          display: flex; flex-direction: column;
          animation: msModalIn 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes msModalIn {
          from { opacity:0; transform:translateY(14px) scale(0.97) }
          to   { opacity:1; transform:translateY(0) scale(1) }
        }
        .ms-modal-header {
          display:flex; align-items:flex-start; justify-content:space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid rgba(201,168,76,0.15);
          flex-shrink: 0;
        }
        .ms-modal-eyebrow {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
          color: rgba(201,168,76,0.55); display: block; margin-bottom: 5px;
        }
        .ms-modal-title {
          font-family: 'New Sailor', serif;
          font-size: 30px; font-weight: 700; letter-spacing: 0.04em;
          text-transform: uppercase; color: ${CREAM}; line-height: 1;
          text-shadow: 1px 1px 0 #000, -1px -1px 0 rgba(255,220,100,0.12);
        }
        .ms-modal-close {
          background: rgba(201,168,76,0.07);
          border: 1px solid rgba(201,168,76,0.28);
          color: rgba(201,168,76,0.6);
          width: 32px; height: 32px;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; flex-shrink:0;
          transition: background 0.15s, color 0.15s;
        }
        .ms-modal-close:hover { background: rgba(201,168,76,0.15); color: ${GOLD}; }
        .ms-modal-body { overflow-y:auto; flex:1; padding: 6px 0; }
        .ms-modal-body::-webkit-scrollbar { width:3px; }
        .ms-modal-body::-webkit-scrollbar-thumb { background: #5a420e; }
        .ms-loading {
          display:flex; align-items:center; justify-content:center;
          gap:12px; padding:48px;
          font-family:'Share Tech Mono',monospace; font-size:10px;
          letter-spacing:0.15em; text-transform:uppercase;
          color: rgba(201,168,76,0.4);
        }
        .ms-spinner {
          width:16px; height:16px;
          border:2px solid #2a1f08; border-top-color:${GOLD};
          border-radius:50%; animation:msSpin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes msSpin { to { transform:rotate(360deg) } }
        .ms-empty {
          padding:48px 24px; text-align:center;
          font-family:'Share Tech Mono',monospace; font-size:10px;
          letter-spacing:0.12em; text-transform:uppercase;
          color: rgba(201,168,76,0.25);
        }
        .ms-model-list { list-style:none; margin:0; padding:0; }
        .ms-model-item {
          display:flex; align-items:center; justify-content:space-between;
          width:100%; background:none; border:none;
          border-bottom: 1px solid rgba(201,168,76,0.08);
          padding:13px 24px; cursor:pointer; text-align:left;
          transition: background 0.15s; gap:12px;
        }
        .ms-model-item:hover { background: rgba(201,168,76,0.05); }
        .ms-model-item:hover .ms-item-arrow { color:${GOLD}; transform:translateX(3px); }
        .ms-item-name {
          font-family:'New Sailor', serif;
          font-size:15px; font-weight:700; letter-spacing:0.04em;
          text-transform:uppercase; color:${CREAM}; flex:1;
          text-shadow: 1px 1px 0 rgba(0,0,0,0.8);
        }
        .ms-item-meta { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .ms-item-code {
          font-family:'Share Tech Mono',monospace;
          font-size:9px; letter-spacing:0.12em; color:${GOLD};
          text-transform:uppercase; background:rgba(201,168,76,0.07);
          border:1px solid rgba(201,168,76,0.22); padding:2px 7px;
        }
        .ms-item-family {
          font-family:'Share Tech Mono',monospace;
          font-size:9px; letter-spacing:0.1em;
          color: rgba(201,168,76,0.35); text-transform:uppercase;
        }
        .ms-item-arrow {
          color: rgba(201,168,76,0.3); flex-shrink:0;
          transition:color 0.15s, transform 0.15s;
        }
      `}</style>
      <div className="ms-overlay" onClick={() => setModalOpen(false)}>
        <div className="ms-modal" onClick={e => e.stopPropagation()}>
          <Corners />
          <div className="ms-modal-header">
            <div>
              <span className="ms-modal-eyebrow">Select your model</span>
              <h3 className="ms-modal-title">{selectedYear} Models</h3>
            </div>
            <button className="ms-modal-close" onClick={() => setModalOpen(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="ms-modal-body">
            {loading ? (
              <div className="ms-loading">
                <span className="ms-spinner" />
                <span>Loading models…</span>
              </div>
            ) : models.length === 0 ? (
              <p className="ms-empty">No models found for {selectedYear}.</p>
            ) : (
              <ul className="ms-model-list">
                {models.reduce((acc, item, i) => {
                  const prev = models[i - 1];
                  if (!prev || prev.family !== item.family) {
                    acc.push(
                      <li key={`header-${item.family}`} style={{
                        padding: '8px 24px 4px',
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: 9,
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        color: GOLD,
                        borderBottom: '1px solid rgba(201,168,76,0.12)',
                        background: 'rgba(201,168,76,0.04)',
                      }}>
                        {item.family}
                      </li>
                    );
                  }
                  acc.push(
                    <li key={`${item.year}-${item.model_code}`}>
                      <button className="ms-model-item" onClick={() => selectModel(item)}>
                        <span className="ms-item-name">{item.model_name}</span>
                        <span className="ms-item-meta">
                          <span className="ms-item-code">{item.model_code}</span>
                        </span>
                        <svg className="ms-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </button>
                    </li>
                  );
                  return acc;
                }, [])}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  // ─── Tile ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .ms-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%; height: 3px;
          border-radius: 0; outline: none; cursor: pointer;
          background: linear-gradient(
            to right,
            ${GOLD} 0%, ${GOLD} var(--fill-pct, 50%),
            rgba(90,66,14,0.5) var(--fill-pct, 50%), rgba(90,66,14,0.5) 100%
          );
        }
        .ms-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px; border-radius: 0;
          background: ${GOLD}; border: 2px solid #0e0b07;
          box-shadow: 0 0 0 1px #5a420e; cursor: pointer;
          transition: transform 0.1s;
        }
        .ms-range:active::-webkit-slider-thumb { transform: scale(1.2); }
        .ms-range::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 0;
          background: ${GOLD}; border: 2px solid #0e0b07; cursor: pointer;
        }
        .ms-range::-moz-range-track { height: 3px; background: rgba(90,66,14,0.5); }
        .ms-range::-moz-range-progress { height: 3px; background: ${GOLD}; }
        .ms-tick-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; letter-spacing: 0.06em;
          color: rgba(201,168,76,0.28);
          cursor: pointer; user-select: none;
          transition: color 0.15s;
        }
        .ms-tick-label:hover { color: rgba(201,168,76,0.7); }
        .ms-go-btn {
          flex-shrink: 0; height: 40px; padding: 0 20px;
          background: ${GOLD}; border: none;
          outline: 1px solid #5a420e;
          box-shadow: inset 0 0 0 1px #0e0b07, inset 0 0 0 2px #8a6420;
          color: ${BLACK};
          font-family: 'New Sailor', serif;
          font-size: 16px; font-weight: 700; letter-spacing: 0.18em;
          text-transform: uppercase; cursor: pointer;
          display: flex; align-items: center; gap: 6px;
          transition: background 0.15s;
        }
        .ms-go-btn:hover { background: #e2c06a; }
        .ms-go-btn:active { transform: scale(0.94); }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
        style={{
          background: BLACK,
          outline: '1px solid #7a5c1a',
          boxShadow: BASE_SHADOW,
          width: '100%', height: '100%',
          minHeight: 220,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem 2.2rem',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <Corners />

        {/* Diagonal hatch texture */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: `repeating-linear-gradient(
            -45deg, transparent, transparent 10px,
            rgba(201,168,76,0.018) 10px, rgba(201,168,76,0.018) 11px
          )`,
        }} />

        <div style={{
          width: '100%', maxWidth: 460,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 16,
          position: 'relative', zIndex: 1,
        }}>

          {/* Eyebrow rule */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.3 }} />
            <span style={{
              fontFamily: "'New Sailor', serif",
              fontSize: 10, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: GOLD, opacity: 0.6,
              whiteSpace: 'nowrap',
            }}>
              What are you riding?
            </span>
            <div style={{ flex: 1, height: 1, background: GOLD, opacity: 0.3 }} />
          </div>

          {/* Giant year */}
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              fontFamily: "'New Sailor', serif",
              fontSize: 'clamp(60px, 12vw, 96px)',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: CREAM,
              lineHeight: 1,
              textAlign: 'center',
              textShadow: '1px 1px 0 #000, -1px -1px 0 rgba(255,220,100,0.15)',
              userSelect: 'none',
              minWidth: '5ch',
            }}
          >
            {selectedYear}
          </div>

          {/* Controls row */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>

            {/* ← arrow — swap SVG for any icon */}
            <ArrowBtn onClick={() => stepYear(-1)} label="Previous year">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </ArrowBtn>

            {/* Slider + ticks */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <input
                type="range"
                className="ms-range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={1}
                value={selectedYear}
                style={{ '--fill-pct': `${fillPct}%` }}
                onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                onKeyDown={e => { if (e.key === 'Enter') openModal(selectedYear); }}
                aria-label="Select model year"
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
                {TICKS.map(yr => (
                  <span
                    key={yr}
                    className="ms-tick-label"
                    onClick={() => setSelectedYear(yr)}
                  >
                    {yr}
                  </span>
                ))}
              </div>
            </div>

            {/* → arrow — swap SVG for any icon */}
            <ArrowBtn onClick={() => stepYear(1)} label="Next year">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </ArrowBtn>

            {/* GO */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              className="ms-go-btn"
              onClick={() => openModal(selectedYear)}
              aria-label={`Browse ${selectedYear} models`}
            >
              GO
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="11" height="11">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </motion.button>

          </div>
        </div>
      </motion.div>

      {modal}
    </>
  );
}
