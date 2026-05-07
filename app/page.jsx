'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

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

// ─── Combobox ─────────────────────────────────────────────────────────────────
function ModelCombobox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/models/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setOpen(true);
      setHighlighted(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 220);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const select = (item) => {
    setQuery(`${item.year} ${item.model_name}`);
    setOpen(false);
    router.push(`/browse?year=${item.year}&model=${encodeURIComponent(item.model_code)}&family=${encodeURIComponent(item.family)}`);
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); select(results[highlighted]); }
    if (e.key === 'Escape') setOpen(false);
  };

  // scroll highlighted into view
  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const el = listRef.current.children[highlighted];
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  return (
    <div className="combobox-wrap">
      <div className="combobox-input-row">
        <svg className="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          className="combobox-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type a year, model, or era…"
          autoComplete="off"
          spellCheck="false"
        />
        {loading && <span className="spinner" />}
      </div>

      {open && results.length > 0 && (
        <ul ref={listRef} className="combobox-list" role="listbox">
          {results.map((item, i) => (
            <li
              key={`${item.year}-${item.model_code}`}
              className={`combobox-item ${i === highlighted ? 'highlighted' : ''}`}
              onMouseDown={() => select(item)}
              onMouseEnter={() => setHighlighted(i)}
              role="option"
            >
              <span className="item-year">{item.year}</span>
              <span className="item-name">{item.model_name}</span>
              <span className="item-family">{item.family}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        <Image src="/logo.png" alt="Stinkin' Supplies" width={120} height={40} style={{ objectFit: 'contain' }} />
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
            <ModelCombobox />
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
          padding: 100px var(--gap) var(--gap);
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
          overflow: hidden;
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

        /* ── Combobox */
        .combobox-wrap {
          position: relative;
          width: 100%;
          max-width: 540px;
          margin-top: 8px;
        }
        .combobox-input-row {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface-2);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-sm);
          padding: 0 16px;
          transition: border-color 0.2s;
        }
        .combobox-input-row:focus-within {
          border-color: var(--gold-dim);
        }
        .search-ico {
          width: 16px; height: 16px;
          color: var(--text-dim);
          flex-shrink: 0;
        }
        .combobox-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 14px 0;
          font-family: var(--font-display);
          font-size: 16px;
          letter-spacing: 0.03em;
          color: var(--white);
          caret-color: var(--gold);
        }
        .combobox-input::placeholder { color: var(--text-dim); }

        .spinner {
          width: 14px; height: 14px;
          border: 2px solid var(--border-dim);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .combobox-list {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: var(--surface-2);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius-sm);
          list-style: none;
          max-height: 320px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
          scrollbar-width: thin;
          scrollbar-color: var(--gold-dim) transparent;
        }
        .combobox-item {
          display: grid;
          grid-template-columns: 52px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--border-dim);
          transition: background 0.12s;
        }
        .combobox-item:last-child { border-bottom: none; }
        .combobox-item.highlighted,
        .combobox-item:hover { background: rgba(201,168,76,0.08); }

        .item-year {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--gold);
          letter-spacing: 0.05em;
        }
        .item-name {
          font-size: 14px;
          color: var(--white);
          letter-spacing: 0.02em;
        }
        .item-family {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-dim);
          text-align: right;
        }

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
          padding: 10px 20px 10px 16px;
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
            padding-top: 88px;
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