'use client';

// SmokeBackground removed — replaced with cream grid overlay
import ModelSearch     from '@/components/home/ModelSearch';
import EraCarousel     from '@/components/home/EraCarousel';
import VideoHero       from '@/components/home/VideoHero';
import ScrollVelocity  from '@/components/home/ScrollVelocity';
import EraKineticTile  from '@/components/home/EraKineticTile';
import { BrandRolodex } from '@/components/home/BrandRolodex';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <main>
        <VideoHero />
        <ScrollVelocity />
        <div className="tile-inner tile-inner--search">
          <ModelSearch />
        </div>
        <div className="bento-page">

          {/* ── Kinetic "SHOP BY ERA" heading tile */}
          <EraKineticTile />

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

        </div>

        <BrandRolodex />
      </main>

      <style>{`
        /* ── Reset & base */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F5F0E8; }

        /* ── Cream grid background */
        body::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 0;
          background-image:
            linear-gradient(rgba(180,165,130,0.55) 1px, transparent 1px),
            linear-gradient(90deg, rgba(180,165,130,0.55) 1px, transparent 1px);
          background-size: 40px 40px;
          background-color: #F5F0E8;
          pointer-events: none;
        }

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
          grid-template-rows: auto auto auto;
          grid-template-areas:
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
          background: rgba(14,14,14,0.90);
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
        .tile-video       { grid-area: video;   min-height: 220px; }
        .tile-era-kinetic { grid-area: erahead; min-height: 120px; }
        .tile-category    { grid-area: cat;     min-height: 200px; }
        .tile-model       { grid-area: model;   min-height: 200px; }
        .tile-deals       { grid-area: deals;   min-height: 200px; background: var(--surface-2); }

        /* ── Era carousel tile — transparent, no border, tall, overflow visible */
        .tile-eras {
          grid-area: eras;
          min-height: 780px;      /* bigger cards need more height */
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          box-shadow: none !important;
          overflow: visible !important;
          margin-top: -20px;      /* bleed up into era heading */
          z-index: 1;
        }
        .tile-eras:hover {
          transform: none;        /* disable the base tile hover lift */
          border-color: transparent !important;
        }

        /* ── Era kinetic tile shell — fully ghost */
        .tile.tile-era-kinetic {
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          box-shadow: none !important;
          overflow: visible;
          z-index: 10;
          pointer-events: none;
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
          pointer-events: auto;
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
        .tile-inner--search {
          align-items: center;
          justify-content: center;
          width: 100%;
          box-sizing: border-box;
          font-family: 'New Sailor', serif;
          text-align: center;
          padding: 0 48px 14px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .tile-inner--center {
          align-items: center;
          text-align: center;
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

        /* ── Mobile */
        @media (max-width: 768px) {
          .bento-page {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "erahead erahead"
              "eras    eras"
              "cat     model"
              "deals   deals";
            padding-top: 0;
            padding-left: 16px;
            padding-right: 16px;
          }
          .tile-eras { min-height: 620px; }
          .tile-inner { padding: 24px 22px; }
          .tile-inner--search { padding: 0 16px 14px; }
          .tile-era-kinetic { min-height: 100px; }
        }

        @media (max-width: 480px) {
          .bento-page {
            grid-template-columns: 1fr;
            grid-template-areas:
              "erahead"
              "eras"
              "cat"
              "model"
              "deals";
          }
          .tile-eras { min-height: 520px; }
        }
      `}</style>
    </>
  );
}
