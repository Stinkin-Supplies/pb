'use client';

/**
 * app/page.jsx — Stinkin' Supplies Homepage
 *
 * Section order:
 *   1. VideoHero          — full-bleed video with hero copy + CTAs
 *   2. SearchFilterBar    — full-width paper band, search/model filter (placeholder)
 *   3. CategoryPhotoGrid  — image-backed category browse buttons
 *   4. ModelFinder        — era → browse, technical blueprint panel
 *   5. CategoryIndex      — parts catalog table of contents (paper)
 *   6. BrandRolodex       — vendor brand showcase
 */

import dynamic from 'next/dynamic';
import VideoHero       from '@/components/home/VideoHero';
import SearchFilterBar from '@/components/home/SearchFilterBar';
import ModelFinder    from '@/components/home/ModelFinder';
import CategoryIndex     from '@/components/home/CategoryIndex';
import CategoryPhotoGrid from '@/components/home/CategoryPhotoGrid';
import { BrandRolodex } from '@/components/home/BrandRolodex';

// SmokeBackground is canvas-heavy — lazy load it
const SmokeBackground = dynamic(
  () => import('@/components/home/SmokeBackground'),
  { ssr: false }
);

export default function HomePage() {
  return (
    <>
      <SmokeBackground />

      <main style={{ position: 'relative', zIndex: 1 }}>

        {/* ── 1. Video Hero ───────────────────────────────────────────── */}
        <VideoHero />

        {/* ── 2. Search / Model Filter placeholder ─────────────────────── */}
        <SearchFilterBar />

        {/* ── 3. Category Photo Grid ──────────────────────────────────── */}
        <CategoryPhotoGrid />

        {/* ── 4. Model Finder ─────────────────────────────────────────── */}
        <section className="hp-model-section">

          {/* Blueprint grid texture behind the section */}
          <div className="hp-blueprint-bg" aria-hidden="true" />

          {/* Section identifier — above the card */}
          <div className="hp-section-ident-row">
            <span className="hp-section-rule" />
            <span className="hp-section-ident">WHAT BIKE ARE YOU WORKING ON?</span>
            <span className="hp-section-rule" />
          </div>

          <div className="hp-model-inner">
            <ModelFinder />
          </div>

        </section>

        {/* ── 5. Category Index ───────────────────────────────────────── */}
        <CategoryIndex />

        {/* ── 5. Brand Rolodex ────────────────────────────────────────── */}
        <BrandRolodex />

      </main>

      <style>{`

        /* ── Model Finder section ─────────────────────────────────────── */
        .hp-model-section {
          position: relative;
          background: var(--black);
          padding: clamp(40px, 5vw, 72px) clamp(16px, 3vw, 40px) clamp(40px, 5vw, 64px);
          overflow: hidden;
        }

        /* Blueprint grid overlay */
        .hp-blueprint-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(61,90,122,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,90,122,0.05) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* Section identifier row */
        .hp-section-ident-row {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 28px;
          max-width: 1400px;
          margin-left: auto;
          margin-right: auto;
        }
        .hp-section-rule {
          flex: 1;
          height: 1px;
          background: var(--gold-rule);
        }
        .hp-section-ident {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--gold-dim);
          text-transform: uppercase;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Inner wrapper — constrains ModelFinder card width */
        .hp-model-inner {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto;
        }

      `}</style>
    </>
  );
}
