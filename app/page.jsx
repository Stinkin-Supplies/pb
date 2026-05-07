'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── Era Data ────────────────────────────────────────────────────────────────
const ERAS = [
  { name: 'Flathead',           slug: 'flathead',             years: '1930–1947' },
  { name: 'Knucklehead',        slug: 'knucklehead',          years: '1936–1947' },
  { name: 'Panhead',            slug: 'panhead',              years: '1948–1965' },
  { name: 'Shovelhead',         slug: 'shovelhead',           years: '1966–1984' },
  { name: 'Ironhead Sportster', slug: 'ironhead-sportster',   years: '1957–1985' },
  { name: 'Evolution Big Twin', slug: 'evolution-big-twin',   years: '1984–1999' },
  { name: 'Evolution Sportster',slug: 'evolution-sportster',  years: '1986–2003' },
  { name: 'Twin Cam',           slug: 'twin-cam',             years: '1999–2017' },
  { name: 'Milwaukee 8',        slug: 'milwaukee-8',          years: '2017–present' },
  { name: 'Other',              slug: 'other',                years: '' },
];

// Generate years 1930 → current year
const YEARS = Array.from(
  { length: new Date().getFullYear() - 1930 + 1 },
  (_, i) => new Date().getFullYear() - i
);

// ─── Model Search — Year dropdown + Modal ────────────────────────────────────
function ModelSearch() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState('');
  const [models, setModels] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const openModal = async (year) => {
    if (!year) return;
    setLoading(true);
    setModalOpen(true);
    try {
      const res = await fetch(`/api/models/search?q=${year}`);
      const data = await res.json();
      const sorted = (data.results || []).sort((a, b) =>
        a.model_name.localeCompare(b.model_name)
      );
      setModels(sorted);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const selectModel = (item) => {
    setModalOpen(false);
    router.push(`/browse?year=${item.year}&model=${encodeURIComponent(item.model_code)}&family=${encodeURIComponent(item.family)}`);
  };

  const handleYearChange = (e) => {
    const year = e.target.value;
    setSelectedYear(year);
    if (year) openModal(year);
  };

  // Close modal on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setModalOpen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  return (
    <>
      <div className="model-search-wrap">
        <div className="year-select-row">
          <svg className="select-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          <select
            className="year-select"
            value={selectedYear}
            onChange={handleYearChange}
          >
            <option value="">Select a year…</option>
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <svg className="chevron-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
        {selectedYear && (
          <button className="change-year-btn" onClick={() => { setSelectedYear(''); setModels([]); }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Modal — portaled to body to escape tile stacking context */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div className="model-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="model-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">Select your model</span>
                <h3 className="modal-title">{selectedYear} Models</h3>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {loading ? (
                <div className="modal-loading">
                  <span className="spinner" />
                  <span>Loading models…</span>
                </div>
              ) : models.length === 0 ? (
                <p className="modal-empty">No models found for {selectedYear}.</p>
              ) : (
                <ul className="model-list">
                  {models.map(item => (
                    <li key={`${item.year}-${item.model_code}`}>
                      <button className="model-list-item" onClick={() => selectModel(item)}>
                        <span className="mli-name">{item.model_name}</span>
                        <span className="mli-meta">
                          <span className="mli-code">{item.model_code}</span>
                          <span className="mli-family">{item.family}</span>
                        </span>
                        <svg className="mli-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}



// ─── Era Slider ───────────────────────────────────────────────────────────────
function EraSlider() {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = (e) => {
    setDragging(true);
    setStartX(e.pageX - trackRef.current.offsetLeft);
    setScrollLeft(trackRef.current.scrollLeft);
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const x = e.pageX - trackRef.current.offsetLeft;
    trackRef.current.scrollLeft = scrollLeft - (x - startX);
  };
  const onMouseUp = () => setDragging(false);

  return (
    <div className="era-slider-outer">
      <div
        ref={trackRef}
        className={`era-track ${dragging ? 'grabbing' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {ERAS.map((era) => (
          <Link key={era.slug} href={`/era/${era.slug}`} className="era-node" draggable={false}>
            <div className="era-dot">
              <span className="era-dot-inner" />
            </div>
            <span className="era-label">{era.name}</span>
            {era.years && <span className="era-years">{era.years}</span>}
          </Link>
        ))}
      </div>
      <div className="era-fade-left" />
      <div className="era-fade-right" />
    </div>
  );
}

// ─── Floating Nav ─────────────────────────────────────────────────────────────
function FloatingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav className={`float-nav ${scrolled ? 'scrolled' : ''}`}>
      <Link href="/" className="nav-logo">
        <img src="/logo.svg" alt="Stinkin' Supplies" style={{ height: '100px', width: 'auto', objectFit: 'contain' }} />
      </Link>
      <div className="nav-links">
        <Link href="/browse">Browse</Link>
        <Link href="/eras">Eras</Link>
        <Link href="/browse?category=all">Categories</Link>
        <Link href="/browse?deals=true">Deals</Link>
        <Link href="/admin/products">Admin</Link>
      </div>
    </nav>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <FloatingNav />

      <main className="bento-page">

        {/* ── Search tile — wide left top */}
        <section className="tile tile-search" style={{ '--delay': '0ms' }}>
          <div className="tile-inner">
            <p className="tile-eyebrow">Find parts for your bike</p>
            <h2 className="tile-heading">What are you riding?</h2>
            <ModelSearch />
          </div>
        </section>

        {/* ── Video tile — right top */}
        <section className="tile tile-video" style={{ '--delay': '80ms' }}>
          <div className="video-placeholder">
            <div className="play-ring">
              <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
            <span className="video-label">Brand Reel</span>
          </div>
        </section>

        {/* ── Era slider — full width */}
        <section className="tile tile-eras" style={{ '--delay': '160ms' }}>
          <div className="tile-inner tile-inner--eras">
            <p className="tile-eyebrow">Shop by era</p>
            <h2 className="tile-heading tile-heading--sm">Every generation. Every part.</h2>
            <EraSlider />
          </div>
        </section>

        {/* ── Category tile */}
        <section className="tile tile-category" style={{ '--delay': '240ms' }}>
          <div className="tile-inner tile-inner--center">
            <div className="placeholder-icon">⚙️</div>
            <h3 className="tile-heading tile-heading--sm">Browse by Category</h3>
            <p className="tile-sub">Engine · Suspension · Electrical · Exhaust</p>
            <Link href="/browse?category=all" className="tile-btn">Explore Categories</Link>
          </div>
        </section>

        {/* ── Model tile */}
        <section className="tile tile-model" style={{ '--delay': '300ms' }}>
          <div className="tile-inner tile-inner--center">
            <div className="placeholder-icon">🏍</div>
            <h3 className="tile-heading tile-heading--sm">Shop by Model</h3>
            <p className="tile-sub">Sportster · Softail · Dyna · Touring · FX</p>
            <Link href="/browse" className="tile-btn">Pick Your Model</Link>
          </div>
        </section>

        {/* ── Deals tile */}
        <section className="tile tile-deals" style={{ '--delay': '360ms' }}>
          <div className="tile-inner tile-inner--center">
            <p className="tile-eyebrow tile-eyebrow--gold">Limited time</p>
            <h3 className="tile-heading tile-heading--sm">Current Deals</h3>
            <p className="tile-sub">NOS &amp; aftermarket at unbeatable prices</p>
            <Link href="/browse?deals=true" className="tile-btn tile-btn--gold">Shop Deals</Link>
          </div>
        </section>

      </main>

      <style>{`
        /* ── Reset & base */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── Tokens */
        :root {
          --gold:       #C9A84C;
          --gold-light: #E2C06A;
          --gold-dim:   #8B6914;
          --black:      #0A0A0A;
          --surface:    #111111;
          --surface-2:  #1A1A1A;
          --surface-3:  #222222;
          --border:     rgba(201,168,76,0.18);
          --border-dim: rgba(255,255,255,0.07);
          --white:      #F5F0E8;
          --text-dim:   rgba(245,240,232,0.5);
          --radius:     16px;
          --radius-sm:  10px;
          --gap:        14px;
          --font-display: 'Barlow Condensed', sans-serif;
          --font-mono:    'Share Tech Mono', monospace;
        }

        /* ── Page shell */
        .bento-page {
          min-height: 100vh;
          background: var(--black);
          background-image:
            radial-gradient(ellipse 80% 50% at 20% 10%, rgba(201,168,76,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, rgba(201,168,76,0.04) 0%, transparent 50%);
          padding: 160px var(--gap) var(--gap);
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-rows: auto auto auto auto;
          grid-template-areas:
            "search  search  video"
            "eras    eras    eras"
            "cat     model   deals";
          gap: var(--gap);
          max-width: 1400px;
          margin: 0 auto;
          font-family: var(--font-display);
        }

        /* ── Tile base */
        .tile {
          background: var(--surface);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius);
          overflow: visible;
          position: relative;
          opacity: 0;
          transform: translateY(20px);
          animation: tileIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms) forwards;
          transition: border-color 0.25s, transform 0.25s;
        }
        .tile:hover {
          border-color: var(--border);
          transform: translateY(-2px) scale(1.003);
        }

        @keyframes tileIn {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Grid placement */
        .tile-search   { grid-area: search;  min-height: 220px; }
        .tile-video    { grid-area: video;   min-height: 220px; }
        .tile-eras     { grid-area: eras;    min-height: 180px; }
        .tile-category { grid-area: cat;     min-height: 200px; }
        .tile-model    { grid-area: model;   min-height: 200px; }
        .tile-deals    { grid-area: deals;   min-height: 200px; background: var(--surface-2); }

        /* ── Tile inner */
        .tile-inner {
          padding: 32px 36px;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 10px;
        }
        .tile-inner--center {
          align-items: center;
          text-align: center;
        }
        .tile-inner--eras {
          padding: 24px 0 24px 36px;
          gap: 8px;
        }

        /* ── Typography */
        .tile-eyebrow {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-dim);
        }
        .tile-eyebrow--gold { color: var(--gold); }

        .tile-heading {
          font-family: var(--font-display);
          font-size: clamp(26px, 3vw, 38px);
          font-weight: 700;
          line-height: 1.05;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--white);
        }
        .tile-heading--sm { font-size: clamp(18px, 2vw, 24px); }

        .tile-sub {
          font-size: 13px;
          color: var(--text-dim);
          letter-spacing: 0.04em;
          line-height: 1.5;
        }

        .placeholder-icon { font-size: 32px; margin-bottom: 4px; }

        /* ── CTA buttons */
        .tile-btn {
          display: inline-block;
          margin-top: 8px;
          padding: 10px 24px;
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--white);
          text-decoration: none;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
        }
        .tile-btn:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.2); }
        .tile-btn--gold {
          background: var(--gold);
          border-color: var(--gold);
          color: var(--black);
          font-weight: 700;
        }
        .tile-btn--gold:hover { background: var(--gold-light); border-color: var(--gold-light); }

        /* ── Video placeholder */
        .video-placeholder {
          width: 100%;
          height: 100%;
          min-height: 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          background:
            linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%);
          cursor: pointer;
        }
        .play-ring {
          width: 64px; height: 64px;
          border-radius: 50%;
          border: 2px solid var(--gold);
          display: flex; align-items: center; justify-content: center;
          color: var(--gold);
          transition: transform 0.25s, background 0.25s;
        }
        .tile-video:hover .play-ring {
          transform: scale(1.12);
          background: rgba(201,168,76,0.1);
        }
        .video-label {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-dim);
        }

        /* ── Deals tile gold accent line */
        .tile-deals::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
        }

        /* ── Year Select + Modal */
        .model-search-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
          max-width: 400px;
        }
        .year-select-row {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface-2);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-sm);
          padding: 0 14px;
          transition: border-color 0.2s;
          cursor: pointer;
        }
        .year-select-row:focus-within { border-color: var(--gold-dim); }
        .select-ico {
          width: 15px; height: 15px;
          color: var(--gold-dim);
          flex-shrink: 0;
        }
        .year-select {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 14px 0;
          font-family: var(--font-display);
          font-size: 16px;
          letter-spacing: 0.04em;
          color: var(--white);
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }
        .year-select option { background: var(--surface-2); color: var(--white); }
        .chevron-ico {
          width: 16px; height: 16px;
          color: var(--text-dim);
          flex-shrink: 0;
          pointer-events: none;
        }
        .change-year-btn {
          background: transparent;
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-sm);
          padding: 8px 14px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-dim);
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
          white-space: nowrap;
        }
        .change-year-btn:hover { color: var(--white); border-color: rgba(255,255,255,0.2); }

        /* ── Spinner */
        .spinner {
          width: 18px; height: 18px;
          border: 2px solid var(--border-dim);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Modal overlay */
        .model-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          z-index: 1000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: overlayIn 0.2s ease forwards;
        }
        @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

        .model-modal {
          background: var(--surface);
          border: 1px solid var(--border);
          border-bottom: none;
          border-radius: var(--radius) var(--radius) 0 0;
          width: min(560px, 100vw);
          max-height: 75vh;
          display: flex;
          flex-direction: column;
          animation: modalUp 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes modalUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 24px 24px 16px;
          border-bottom: 1px solid var(--border-dim);
          flex-shrink: 0;
        }
        .modal-eyebrow {
          display: block;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold);
          margin-bottom: 4px;
        }
        .modal-title {
          font-family: var(--font-display);
          font-size: 26px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--white);
        }
        .modal-close {
          background: transparent;
          border: 1px solid var(--border-dim);
          border-radius: 50%;
          width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-dim);
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
          flex-shrink: 0;
        }
        .modal-close:hover { color: var(--white); border-color: rgba(255,255,255,0.3); }

        .modal-body {
          overflow-y: auto;
          flex: 1;
          scrollbar-width: thin;
          scrollbar-color: var(--gold-dim) transparent;
        }

        .modal-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-dim);
          letter-spacing: 0.08em;
        }
        .modal-empty {
          text-align: center;
          padding: 48px;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-dim);
        }

        .model-list {
          list-style: none;
          padding: 8px 0;
        }
        .model-list-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 24px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-dim);
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
        }
        .model-list li:last-child .model-list-item { border-bottom: none; }
        .model-list-item:hover { background: rgba(201,168,76,0.07); }

        .mli-name {
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.03em;
          color: var(--white);
          flex: 1;
        }
        .mli-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        .mli-code {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--gold);
          letter-spacing: 0.08em;
        }
        .mli-family {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 0.06em;
        }
        .mli-arrow { color: var(--text-dim); flex-shrink: 0; }

        /* ── Era slider */
        .era-slider-outer {
          position: relative;
          width: 100%;
        }
        .era-track {
          display: flex;
          gap: 0;
          overflow-x: auto;
          scroll-behavior: smooth;
          scrollbar-width: none;
          cursor: grab;
          padding: 12px 0 16px 0;
          /* Horizontal connecting line */
          position: relative;
        }
        .era-track::-webkit-scrollbar { display: none; }
        .era-track.grabbing { cursor: grabbing; }

        /* The line connecting dots */
        .era-track::before {
          content: '';
          position: absolute;
          top: 28px;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, var(--gold-dim) 5%, var(--gold-dim) 95%, transparent 100%);
          pointer-events: none;
        }

        .era-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 0 28px;
          text-decoration: none;
          flex-shrink: 0;
          position: relative;
          transition: transform 0.2s;
        }
        .era-node:hover { transform: translateY(-3px); }

        .era-dot {
          width: 28px; height: 28px;
          border-radius: 50%;
          border: 2px solid var(--gold-dim);
          display: flex; align-items: center; justify-content: center;
          background: var(--surface);
          position: relative;
          z-index: 1;
          transition: border-color 0.2s, background 0.2s;
        }
        .era-node:hover .era-dot {
          border-color: var(--gold);
          background: rgba(201,168,76,0.12);
        }
        .era-dot-inner {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--gold-dim);
          transition: background 0.2s, transform 0.2s;
        }
        .era-node:hover .era-dot-inner {
          background: var(--gold);
          transform: scale(1.3);
        }

        .era-label {
          font-family: var(--font-display);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-dim);
          white-space: nowrap;
          transition: color 0.2s;
        }
        .era-node:hover .era-label { color: var(--white); }

        .era-years {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--gold-dim);
          white-space: nowrap;
        }

        /* Fade edges */
        .era-fade-left,
        .era-fade-right {
          position: absolute;
          top: 0; bottom: 0;
          width: 60px;
          pointer-events: none;
          z-index: 2;
        }
        .era-fade-left  { left: 0;  background: linear-gradient(90deg,  var(--surface), transparent); }
        .era-fade-right { right: 0; background: linear-gradient(270deg, var(--surface), transparent); }

        /* ── Floating nav */
        .float-nav {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          padding: 14px 20px 14px 16px;
          background: rgba(10,10,10,0.6);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid var(--border-dim);
          border-radius: 999px;
          width: min(860px, calc(100vw - 32px));
          transition: background 0.3s, border-color 0.3s;
        }
        .float-nav.scrolled {
          background: rgba(10,10,10,0.85);
          border-color: var(--border);
        }
        .nav-logo img { display: block; }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .nav-links a {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-dim);
          text-decoration: none;
          padding: 6px 12px;
          border-radius: 999px;
          transition: color 0.2s, background 0.2s;
        }
        .nav-links a:hover { color: var(--white); background: rgba(255,255,255,0.07); }

        /* ── Mobile */
        @media (max-width: 768px) {
          .bento-page {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "search  search"
              "video   video"
              "eras    eras"
              "cat     model"
              "deals   deals";
            padding-top: 148px;
          }
          .tile-inner { padding: 24px 22px; }
          .tile-inner--eras { padding: 20px 0 20px 22px; }
          .float-nav { padding: 8px 14px 8px 12px; gap: 16px; }
          .nav-links { gap: 2px; }
          .nav-links a { font-size: 11px; padding: 5px 8px; }
        }

        @media (max-width: 480px) {
          .bento-page {
            grid-template-columns: 1fr;
            grid-template-areas:
              "search"
              "video"
              "eras"
              "cat"
              "model"
              "deals";
          }
          .nav-links a:not(:first-child):not(:last-child) { display: none; }
        }
      `}</style>
    </>
  );
}