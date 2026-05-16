'use client';

import FloatingNav     from '@/components/home/FloatingNav';
import SmokeBackground from '@/components/home/SmokeBackground';
import ModelSearch     from '@/components/home/ModelSearch';
import EraCarousel     from '@/components/home/EraCarousel';
import VideoHero       from '@/components/home/VideoHero';
import ScrollVelocity  from '@/components/home/ScrollVelocity';
import EraKineticTile  from '@/components/home/EraKineticTile';
import { BrandRolodex } from '@/components/home/BrandRolodex';
import Link from 'next/link';

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <SmokeBackground />
      <FloatingNav />

      <main>
        <VideoHero />
        <ScrollVelocity />
        <div className="bento-page">

        {/* ── Kinetic "SHOP BY ERA" heading tile — links to /era */}
        <EraKineticTile />

        {/* ── Era 3D Carousel — full width */}
        <section
          className="tile tile-eras"
          style={{ '--delay': '160ms' }}
        >
          <EraCarousel />
        </section>

        {/* ── Search tile — wide left top */}
        <section className="tile tile-search" style={{ '--delay': '0ms' }}>
          <div className="tile-inner">
            <p className="tile-eyebrow">Find parts for your bike</p>
            <h2 className="tile-heading">What are you riding?</h2>
            <ModelSearch />
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

        </div>

        <BrandRolodex />

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
          padding: 0 48px var(--gap);
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-rows: auto auto auto auto;
          grid-template-areas:
            "search  search  video"
            "erahead erahead erahead"
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
        .tile-search      { grid-area: search;  min-height: 220px; }
        .tile-video       { grid-area: video;   min-height: 220px; }
        .tile-era-kinetic { grid-area: erahead; min-height: 120px; }
        .tile-eras        { grid-area: eras;    min-height: 580px; overflow: hidden; }
        .tile-category    { grid-area: cat;     min-height: 200px; }
        .tile-model       { grid-area: model;   min-height: 200px; }
        .tile-deals       { grid-area: deals;   min-height: 200px; background: var(--surface-2); }

        /* ── Era kinetic tile shell */
        .tile-era-kinetic {
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent; /* or just delete the background line */
            border-color: rgba(201,168,76,0.28);
            overflow: hidden;
        }
        .era-kinetic-wrap {
          position: relative;
          width: 100%;
          text-align: center;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
        }

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
          background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%);
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
        }

        /* ══════════════════════════════════════════════════════
           FLOATING NAV — dark glass pill sitting on a gold cloud
           ══════════════════════════════════════════════════════ */
        .nav-cloud-wrap {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 300;
          width: min(860px, calc(100vw - 32px));
          transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1);
        }
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
        .nav-cloud-wrap.scrolled::before {
          background: radial-gradient(
            ellipse 80% 60% at 50% 100%,
            rgba(212,175,55,0.7) 0%,
            rgba(180,140,20,0.38) 45%,
            transparent 75%
          );
          filter: blur(18px);
        }
        .float-nav {
          position: relative;
          overflow: hidden;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 32px;
          padding: 10px 20px 10px 14px;
          background: rgba(255, 247, 230, 0.82);
          backdrop-filter: blur(14px) saturate(120%);
          -webkit-backdrop-filter: blur(14px) saturate(120%);
          border: 1px solid rgba(201,168,76,0.35);
          border-radius: 999px;
          box-shadow:
            0 1px 0 rgba(201,168,76,0.18) inset,
            0 -1px 0 rgba(201,168,76,0.08) inset,
            0 2px 12px rgba(120,90,20,0.18);
          transition: background 0.3s, border-color 0.3s;
        }
        .float-nav::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
          background-size: 128px 128px;
          opacity: 0.35;
          pointer-events: none;
          z-index: 0;
          mix-blend-mode: overlay;
        }
        .float-nav > * { position: relative; z-index: 1; }
        .nav-cloud-wrap.scrolled .float-nav {
          background: #FFF7E6;
          border-color: rgba(201,168,76,0.45);
          box-shadow:
            0 1px 0 rgba(201,168,76,0.3) inset,
            0 -1px 0 rgba(201,168,76,0.12) inset,
            0 4px 20px rgba(120,90,20,0.22);
        }

        /* ── HD Bar & Shield mini button */
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
          clip-path: polygon(
            49.41% 0%,    32.99% 10.38%, 16.27% 14.57%, 16.12% 22.16%,
            19.82% 28.94%, 19.23% 31.94%, 0.44%  32.34%, 0.59%  65.07%,
            18.64% 65.87%, 19.38% 67.66%, 16.12% 72.65%, 16.57% 74.85%,
            37.28% 92.22%, 48.37% 99.20%, 52.81% 99.80%, 61.39% 95.21%,
            83.14% 75.05%, 84.76% 70.46%, 82.10% 65.07%, 99.85% 64.67%,
            99.26% 36.73%, 98.22% 32.34%, 96.45% 31.14%, 78.70% 30.94%,
            83.43% 20.36%, 81.66% 14.77%, 60.65% 7.58%
          );
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
        .nav-mini-logo { width: 38px; height: 38px; object-fit: contain; display: block; }

        .nav-close {
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border-dim);
          border-radius: 50%;
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(60,44,0,0.55);
          cursor: pointer;
          transition: color 0.2s, background 0.2s;
          margin-left: 4px;
          flex-shrink: 0;
        }
        .nav-close:hover { color: #1a1200; background: rgba(255,255,255,0.12); }

        .nav-logo img { display: block; }
        .nav-links { display: flex; align-items: center; gap: 6px; }
        .nav-links a {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #1a1200;
          text-decoration: none;
          padding: 6px 14px;
          border-radius: 999px;
          transition: color 0.2s, background 0.2s;
          white-space: nowrap;
        }
        .nav-links a:hover { color: #000; background: rgba(180,140,20,0.12); }

        /* ── Mobile */
        @media (max-width: 768px) {
          .bento-page {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "search  search"
              "video   video"
              "erahead erahead"
              "eras    eras"
              "cat     model"
              "deals   deals";
            padding-top: 0;
            padding-left: 16px;
            padding-right: 16px;
          }
          .tile-inner { padding: 24px 22px; }
          .tile-inner--eras { padding: 20px 0 20px 22px; }
          .tile-era-kinetic { min-height: 100px; }
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
              "erahead"
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
