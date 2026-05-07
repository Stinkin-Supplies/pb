'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── Era Data ────────────────────────────────────────────────────────────────
const ERAS = [
  { name: 'Flathead',           slug: 'flathead',           img: 'flathead.webp',           years: '1930–1947' },
  { name: 'Knucklehead',        slug: 'knucklehead',        img: 'knucklehead.webp',        years: '1936–1947' },
  { name: 'Panhead',            slug: 'panhead',            img: 'panhead.webp',            years: '1948–1965' },
  { name: 'Shovelhead',         slug: 'shovelhead',         img: 'shovelhead.webp',         years: '1966–1984' },
  { name: 'Ironhead Sportster', slug: 'ironhead-sportster', img: 'ironhead-sportster.webp', years: '1957–1985' },
  { name: 'Evolution Big Twin', slug: 'evolution-big-twin', img: 'evolution.webp',          years: '1984–1999' },
  { name: 'Evolution Sportster',slug: 'evolution-sportster',img: 'evo-sportster.webp',      years: '1986–2003' },
  { name: 'Twin Cam',           slug: 'twin-cam',           img: 'twin-cam.webp',           years: '1999–2017' },
  { name: 'Milwaukee 8',        slug: 'milwaukee-8',        img: 'milwaukee-8.webp',        years: '2017–present' },
  { name: 'Chopper',            slug: 'chopper',            img: 'chopper.webp',            years: '' },
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



// ─── Era 3D Fan Carousel ─────────────────────────────────────────────────────
function EraCarousel() {
  const router = useRouter();
  const total = ERAS.length;
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const wrapRef = useRef(null);
  const autoRef = useRef(null);
  const touchStartX = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragDelta = useRef(0);
  const lastScrollIdx = useRef(0);

  // ── Auto-rotate
  const resetAuto = useCallback(() => {
    clearInterval(autoRef.current);
    autoRef.current = setInterval(() => {
      setActive(a => (a + 1) % total);
    }, 3600);
  }, [total]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    resetAuto();
    return () => clearInterval(autoRef.current);
  }, [resetAuto]);

  const goTo = (idx) => {
    setActive((idx + total) % total);
    resetAuto();
  };

  // ── Scroll-driven advance
  // When the tile is in view, scroll within it advances the active card
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // Only intercept if tile is roughly centered in viewport
      const rect = el.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.6 && rect.bottom > window.innerHeight * 0.4;
      if (!inView) return;

      e.preventDefault();
      const delta = e.deltaY;

      // Accumulate scroll, advance card every ~120px of scroll
      lastScrollIdx.current += delta;
      if (lastScrollIdx.current > 120) {
        lastScrollIdx.current = 0;
        goTo(active + 1);
      } else if (lastScrollIdx.current < -120) {
        lastScrollIdx.current = 0;
        goTo(active - 1);
      }

      // Also drive a smooth progress value for parallax feel
      setScrollProgress(p => Math.max(0, Math.min(1,
        p + delta / (window.innerHeight * 2)
      )));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [active, goTo]);

  // ── Drag
  const onMouseDown = (e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragDelta.current = 0;
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    dragDelta.current = e.clientX - dragStartX.current;
  };
  const onMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (Math.abs(dragDelta.current) > 40) {
      goTo(dragDelta.current < 0 ? active + 1 : active - 1);
    }
  };

  // ── Touch swipe
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? active + 1 : active - 1);
    touchStartX.current = null;
  };

  // ── Card transform — fan bottom-right to top-left
  const getCardStyle = (i) => {
    const diff = ((i - active + total) % total);
    const pos  = diff > total / 2 ? diff - total : diff;
    const absP = Math.abs(pos);

    if (absP > 4) return { display: 'none' };

    // Subtle extra rotation driven by scroll progress
    const scrollBias = scrollProgress * 4;

    // Fixed offsets — no window access (avoids SSR hydration mismatch)
    const unit  = 192; // px per step, consistent server+client
    const rotZ  = pos * -15 - (pos !== 0 ? scrollBias * Math.sign(pos) : 0);
    const rotX  = 10 + absP * 5;
    const tx    = pos * unit;
    const ty    = pos * unit * 0.72;
    const tz    = -absP * 60;
    const scale = absP === 0 ? 1 : absP === 1 ? 0.88 : absP === 2 ? 0.76 : absP === 3 ? 0.64 : 0.54;
    const op    = absP === 0 ? 1 : absP === 1 ? 0.92 : absP === 2 ? 0.72 : absP === 3 ? 0.48 : 0.26;

    return {
      transform: `translateX(${tx}px) translateY(${ty}px) translateZ(${tz}px) rotateX(${rotX}deg) rotateZ(${rotZ}deg) scale(${scale})`,
      opacity: op,
      zIndex: 20 - absP * 2,
      pointerEvents: absP <= 3 ? 'auto' : 'none',
      cursor: 'pointer',
    };
  };

  if (!mounted) return (
    <div className="carousel-wrap carousel-placeholder" />
  );

  return (
    <div ref={wrapRef} className="carousel-wrap">
      <div
        className="carousel-stage"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="carousel-scene">
          {ERAS.map((era, i) => {
            const diff = ((i - active + total) % total);
            const pos  = diff > total / 2 ? diff - total : diff;
            const isActive = pos === 0;
            return (
              <div
                key={era.slug}
                className={`era-card ${isActive ? 'era-card--active' : ''}`}
                style={getCardStyle(i)}
                onClick={() => isActive ? router.push(`/era/${era.slug}`) : goTo(i)}
              >
                <div className="era-card-face">
                  <div className="era-card-art"
                    style={{ backgroundImage: era.img ? `url('/images/eras/${era.img}')` : 'none' }}
                  />
                  <span className="era-card-num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="era-card-content">
                    <span className="era-card-years">{era.years}</span>
                    <h3 className="era-card-name">{era.name}</h3>
                    {isActive && (
                      <span className="era-card-cta">
                        Shop Parts
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <path d="m9 18 6-6-6-6"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="era-card-corner" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="carousel-footer">
        <button className="carousel-arrow-sm" onClick={() => goTo(active - 1)} aria-label="Previous">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="carousel-dots">
          {ERAS.map((era, i) => (
            <button key={era.slug} className={`carousel-dot ${i === active ? 'carousel-dot--active' : ''}`} onClick={() => goTo(i)} aria-label={era.name} />
          ))}
        </div>
        <button className="carousel-arrow-sm" onClick={() => goTo(active + 1)} aria-label="Next">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Scroll hint — fades out after first interaction */}
      <div className="scroll-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
        <span>Scroll to browse eras</span>
      </div>
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
      <div className="smoke-bg" aria-hidden="true">
        <span className="smoke smoke-1" />
        <span className="smoke smoke-2" />
        <span className="smoke smoke-3" />
        <span className="smoke smoke-4" />
        <span className="smoke smoke-5" />
        <span className="smoke smoke-6" />
      </div>

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

        {/* ── Era 3D Carousel — full width */}
        <section className="tile tile-eras" style={{ '--delay': '160ms' }}>
          <EraCarousel />
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
          --gap:        24px;
          --font-display: 'Barlow Condensed', sans-serif;
          --font-mono:    'Share Tech Mono', monospace;
        }

        /* ── Page shell */
        .bento-page {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          background: var(--black);
          background-image:
            radial-gradient(ellipse 80% 50% at 20% 10%, rgba(201,168,76,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 80%, rgba(201,168,76,0.04) 0%, transparent 50%);
          padding: 188px calc(var(--gap) + 6px) calc(var(--gap) + 6px);
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

        /* ── Smoke background */
        .smoke-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background:
            radial-gradient(circle at 20% 15%, rgba(201,168,76,0.13), transparent 45%),
            radial-gradient(circle at 80% 85%, rgba(201,168,76,0.12), transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(201,168,76,0.08), transparent 60%),
            #080808;
        }
        .smoke {
          position: absolute;
          width: 72vw;
          height: 72vw;
          min-width: 560px;
          min-height: 560px;
          border-radius: 50%;
          filter: blur(72px);
          opacity: 0.46;
          background: radial-gradient(circle at 40% 40%, rgba(244, 224, 170, 0.82), rgba(120, 96, 40, 0.38) 48%, transparent 74%);
          animation: smokeDrift 18s ease-in-out infinite alternate;
        }
        .smoke-1 { top: -12%; left: -8%; animation-duration: 22s; }
        .smoke-2 { top: 8%; right: -12%; animation-duration: 26s; animation-delay: -4s; }
        .smoke-3 { bottom: -16%; left: 16%; animation-duration: 24s; animation-delay: -8s; }
        .smoke-4 { bottom: -8%; right: 8%; animation-duration: 20s; animation-delay: -2s; }
        .smoke-5 { top: 38%; left: 34%; animation-duration: 28s; animation-delay: -10s; opacity: 0.28; }
        .smoke-6 { top: 22%; left: 62%; animation-duration: 30s; animation-delay: -6s; opacity: 0.36; }

        @keyframes smokeDrift {
          0%   { transform: translate3d(0, 0, 0) scale(1); }
          50%  { transform: translate3d(18px, -24px, 0) scale(1.08); }
          100% { transform: translate3d(-16px, 14px, 0) scale(0.95); }
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
        .tile-eras     { grid-area: eras;    min-height: 580px; overflow: hidden; }
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

        /* ── Era Fan Carousel */
        .tile-eras {
          grid-area: eras;
          min-height: 700px !important;
          overflow: visible !important;
          position: relative;
          background: rgba(17,17,17,0.38);
          border-color: rgba(201,168,76,0.16);
          display: flex;
          justify-content: center;
        }
        .carousel-placeholder {
          width: 100%;
          min-height: 700px;
          background: var(--surface);
        }
        .carousel-wrap {
          position: relative;
          width: min(1040px, calc(100% - 140px));
          height: 100%;
          min-height: 700px;
          display: flex;
          flex-direction: column;
          user-select: none;
          margin: 0 auto;
        }
        .carousel-stage {
          position: absolute;
          inset: 0;
          bottom: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 2000px;
          perspective-origin: 55% 50%;
          cursor: grab;
          overflow: visible;
        }
        .carousel-stage:active { cursor: grabbing; }

        /* Scene — centered, slight bottom-right offset */
        .carousel-scene {
          position: relative;
          width: 84%;
          max-width: 900px;
          aspect-ratio: 16/10;
          transform-style: preserve-3d;
          margin: 4% auto 0;
        }

        /* Cards — same size as scene, bleed past edges */
        .era-card {
          position: absolute;
          top: 0; left: 0;
          width: 100%;
          height: 100%;
          transition: transform 0.65s cubic-bezier(0.22, 1, 0.36, 1),
                      opacity  0.55s ease;
          transform-origin: center center;
          will-change: transform, opacity;
        }
        .era-card-face {
          width: 100%; height: 100%;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(145deg, rgba(30,30,30,0.72) 0%, rgba(18,18,18,0.62) 100%);
          overflow: hidden;
          position: relative;
          box-shadow:
            0 20px 70px rgba(0,0,0,0.65),
            inset 0 1px 0 rgba(255,255,255,0.04);
          transition: border-color 0.35s, box-shadow 0.35s;
        }
        .era-card--active .era-card-face {
          border-color: rgba(201,168,76,0.6);
          box-shadow:
            0 0 0 1px rgba(201,168,76,0.22),
            0 32px 100px rgba(0,0,0,0.8),
            0 0 140px rgba(201,168,76,0.1);
        }
        .era-card-art {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          opacity: 0.25;
          transition: opacity 0.4s;
        }
        .era-card--active .era-card-art { opacity: 0.48; }

        .era-card-num {
          position: absolute;
          top: 4%; right: 4%;
          font-family: var(--font-display);
          font-size: clamp(80px, 14vw, 160px);
          font-weight: 900;
          line-height: 1;
          color: rgba(255,255,255,0.04);
          letter-spacing: -0.03em;
          pointer-events: none;
        }
        .era-card--active .era-card-num { color: rgba(201,168,76,0.07); }

        .era-card-content {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: clamp(18px, 4%, 40px);
          background: linear-gradient(to top,
            rgba(0,0,0,0.94) 0%,
            rgba(0,0,0,0.5) 50%,
            transparent 100%);
        }
        .era-card-years {
          display: block;
          font-family: var(--font-mono);
          font-size: clamp(10px, 1.2vw, 13px);
          color: var(--gold);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .era-card-name {
          font-family: var(--font-display);
          font-size: clamp(24px, 4.5vw, 52px);
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: var(--white);
          line-height: 1.0;
          margin: 0;
        }
        .era-card-cta {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: clamp(8px, 1.5%, 16px);
          font-family: var(--font-mono);
          font-size: clamp(9px, 1vw, 12px);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--gold);
          border: 1px solid var(--gold-dim);
          border-radius: 999px;
          padding: 6px 18px;
          background: rgba(0,0,0,0.5);
          transition: background 0.2s, border-color 0.2s;
          width: fit-content;
        }
        .era-card--active:hover .era-card-cta {
          background: rgba(201,168,76,0.18);
          border-color: var(--gold);
        }
        .era-card-corner {
          position: absolute;
          top: 18px; right: 18px;
          width: 22px; height: 22px;
          border-top: 2px solid var(--gold);
          border-right: 2px solid var(--gold);
          border-radius: 0 6px 0 0;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .era-card--active .era-card-corner { opacity: 1; }

        /* Footer */
        .carousel-footer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          z-index: 30;
          background: linear-gradient(to top, rgba(10,10,10,0.7) 0%, transparent 100%);
        }
        .carousel-dots {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .carousel-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          border: none;
          cursor: pointer;
          padding: 0;
          transition: background 0.2s, transform 0.2s;
        }
        .carousel-dot--active {
          background: var(--gold);
          transform: scale(1.6);
        }
        .carousel-arrow-sm {
          background: rgba(10,10,10,0.5);
          border: 1px solid var(--border-dim);
          border-radius: 50%;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-dim);
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
          backdrop-filter: blur(8px);
        }
        .carousel-arrow-sm:hover {
          color: var(--gold);
          border-color: var(--gold-dim);
          background: rgba(201,168,76,0.1);
        }
        .scroll-hint {
          position: absolute;
          bottom: 58px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-dim);
          animation: hintPulse 2.5s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
        }
        @keyframes hintPulse {
          0%, 100% { opacity: 0.35; transform: translateY(0); }
          50%       { opacity: 0.75; transform: translateY(3px); }
        }

        /* Mobile */
        @media (max-width: 768px) {
          .tile-eras      { min-height: 520px !important; }
          .carousel-wrap  { min-height: 520px; width: calc(100% - 36px); }
          .carousel-scene { width: 88%; margin: 0 auto; }
        }
        @media (max-width: 480px) {
          .tile-eras      { min-height: 420px !important; }
          .carousel-wrap  { min-height: 420px; width: calc(100% - 20px); }
          .carousel-scene { width: 92%; margin: 0 auto; }
          .era-card-face  { border-radius: 16px; }
        }

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
            padding: 160px 18px 18px;
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
            padding: 146px 14px 14px;
          }
          .nav-links a:not(:first-child):not(:last-child) { display: none; }
        }
      `}</style>
    </>
  );
}
