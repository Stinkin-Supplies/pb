'use client';

/**
 * app/page.jsx — Stinkin' Supplies Homepage
 *
 * Section order:
 *   1. VideoHero
 *   2. ModelFinder (era → year → model code)
 *   3. ScrollVelocity band
 *   4. BrandRolodex
 */

import dynamic from 'next/dynamic';
import VideoHero      from '@/components/home/VideoHero';
import ScrollVelocity from '@/components/home/ScrollVelocity';
import ModelFinder    from '@/components/home/ModelFinder';
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

        {/* ── 1. Video Hero ───────────────────────────────────────── */}
        <VideoHero />

        {/* ── 2. Model Finder ────────────────────────────────────── */}
        <section
          style={{
            width: '100%',
            background: '#080704',
            padding: 'clamp(24px, 4vw, 48px) clamp(12px, 3vw, 32px)',
            boxSizing: 'border-box',
          }}
        >
          <ModelFinder />
        </section>

        {/* ── 3. ScrollVelocity band ─────────────────────────────── */}
        <div style={{ background: '#050403', overflow: 'hidden' }}>
          <ScrollVelocity
            text="THE RIGHT STINKIN PARTS · "
            defaultVelocity={1.5}
          />
        </div>

        {/* ── 4. Brand Rolodex ───────────────────────────────────── */}
        <BrandRolodex />

      </main>
    </>
  );
}
