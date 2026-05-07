'use client';

import FloatingNav    from '@/components/home/FloatingNav';
import SmokeBackground from '@/components/home/SmokeBackground';
import ModelSearch    from '@/components/home/ModelSearch';
import EraCarousel   from '@/components/home/EraCarousel';
import Link from 'next/link';


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <SmokeBackground />
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

        {/* ── Era 3D Carousel — full width */}
        <section
          className="tile tile-eras"
          style={{ '--delay': '160ms' }}
        >
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
        body { background: #080808; }

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
          background: transparent;
          padding: 160px 48px var(--gap);
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
          position: relative;
          z-index: 2;
        }

        /* ── Tile base */
        .tile {
          background: rgba(14,14,14,0.82);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          border: 1px solid var(--border-dim);
          border-radius: var(--radius);
          overflow: visible;
          position: relative;
          isolation: isolate;
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
          min-height: 500px !important;
          overflow: hidden !important;
          position: relative;
          background: rgba(8,8,8,0.35) !important;
          border-color: rgba(201,168,76,0.15);
        }
        .carousel-placeholder {
          width: 100%;
          min-height: 500px;
          background: var(--surface);
        }
        .carousel-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 500px;
          display: flex;
          flex-direction: column;
          user-select: none;
          background: transparent;
          isolation: isolate;
        }
        .carousel-stage {
          position: absolute;
          top: 0;
          bottom: 52px;
          left: 220px;
          right: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          perspective: 2000px;
          perspective-origin: 55% 50%;
          cursor: grab;
          overflow: visible;
        }
        .carousel-stage:active { cursor: grabbing; }

        /* Scene — constrained with gutters so side cards peek but stay in tile */
        .carousel-scene {
          position: relative;
          width: 90%;
          max-width: 880px;
          aspect-ratio: 16/10;
          transform-style: preserve-3d;
          margin-left: 2%;
          margin-top: 3%;
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
          background: linear-gradient(145deg, #1e1e1e 0%, #121212 100%);
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
          .carousel-wrap  { min-height: 520px; }
          .carousel-stage { left: 60px !important; right: 60px !important; }
          .carousel-scene { width: 88%; margin-left: 0; }
        }
        @media (max-width: 480px) {
          .tile-eras      { min-height: 420px !important; }
          .carousel-wrap  { min-height: 420px; }
          .carousel-stage { left: 40px !important; right: 40px !important; }
          .carousel-scene { width: 92%; margin-left: 0; }
          .era-card-face  { border-radius: 16px; }
        }

        /* ══════════════════════════════════════════════════════
           FLOATING NAV — dark glass pill sitting on a gold cloud
           ══════════════════════════════════════════════════════ */

        /* Wrapper positions both the glow layer and the pill */
        .nav-cloud-wrap {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 300;
          width: min(860px, calc(100vw - 32px));
          transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1);
        }

        /* The golden cloud — blurred blob sitting behind the pill */
        .nav-cloud-wrap::before {
          content: '';
          position: absolute;
          inset: 8px 20px -4px;
          border-radius: 999px;
          background: radial-gradient(
            ellipse 80% 60% at 50% 100%,
            rgba(201,168,76,0.55) 0%,
            rgba(180,140,20,0.28) 45%,
            transparent 75%
          );
          filter: blur(14px);
          z-index: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }

        /* Brighter cloud on scroll — nav is more prominent */
        .nav-cloud-wrap.scrolled::before {
          background: radial-gradient(
            ellipse 80% 60% at 50% 100%,
            rgba(212,175,55,0.7) 0%,
            rgba(180,140,20,0.38) 45%,
            transparent 75%
          );
          filter: blur(18px);
        }

        /* The dark glass pill itself */
        .float-nav {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          padding: 10px 20px 10px 14px;
          background: rgba(8, 8, 8, 0.78);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
          border: 1px solid rgba(201,168,76,0.22);
          border-radius: 999px;
          /* Subtle gold rim glow on the bottom edge */
          box-shadow:
            0 1px 0 rgba(201,168,76,0.18) inset,
            0 -1px 0 rgba(201,168,76,0.08) inset,
            0 2px 12px rgba(0,0,0,0.6);
          transition: background 0.3s, border-color 0.3s;
        }
        .nav-cloud-wrap.scrolled .float-nav {
          background: rgba(6, 6, 6, 0.9);
          border-color: rgba(201,168,76,0.35);
          box-shadow:
            0 1px 0 rgba(201,168,76,0.25) inset,
            0 -1px 0 rgba(201,168,76,0.1) inset,
            0 4px 20px rgba(0,0,0,0.7);
        }

        /* ── HD Bar & Shield mini button ──────────────────── */
        .nav-mini {
          position: fixed;
          top: 10px;
          left: 16px;
          z-index: 300;
          width: 62px;
          height: 46px;
          background: rgba(8,8,8,0.88);
          border: none;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          /* Clip to HD bar & shield silhouette */
          clip-path: polygon(
            49.41% 0%,
            32.99% 10.38%,
            16.27% 14.57%,
            16.12% 22.16%,
            19.82% 28.94%,
            19.23% 31.94%,
            0.44%  32.34%,
            0.59%  65.07%,
            18.64% 65.87%,
            19.38% 67.66%,
            16.12% 72.65%,
            16.57% 74.85%,
            37.28% 92.22%,
            48.37% 99.20%,
            52.81% 99.80%,
            61.39% 95.21%,
            83.14% 75.05%,
            84.76% 70.46%,
            82.10% 65.07%,
            99.85% 64.67%,
            99.26% 36.73%,
            98.22% 32.34%,
            96.45% 31.14%,
            78.70% 30.94%,
            83.43% 20.36%,
            81.66% 14.77%,
            60.65% 7.58%
          );
          /* Gold cloud glow underneath */
          filter: drop-shadow(0 6px 12px rgba(201,168,76,0.5)) drop-shadow(0 2px 4px rgba(0,0,0,0.8));
          transition: filter 0.2s, transform 0.2s, opacity 0.25s;
          animation: miniIn 0.3s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        @keyframes miniIn {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        .nav-mini:hover {
          filter: drop-shadow(0 8px 18px rgba(212,175,55,0.75)) drop-shadow(0 2px 6px rgba(0,0,0,0.9));
          transform: scale(1.08);
        }
        .nav-mini-logo {
          width: 38px;
          height: 38px;
          object-fit: contain;
          display: block;
          /* No border-radius — the clip-path handles the shape */
        }

        /* Close button inside nav when manually opened */
        .nav-close {
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border-dim);
          border-radius: 50%;
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-dim);
          cursor: pointer;
          transition: color 0.2s, background 0.2s;
          margin-left: 4px;
          flex-shrink: 0;
        }
        .nav-close:hover { color: var(--white); background: rgba(255,255,255,0.12); }

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
          padding-left: 16px;
          padding-right: 16px;
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