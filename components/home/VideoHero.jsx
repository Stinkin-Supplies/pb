'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GlowButton from '@/components/ui/GlowButton';

function SoundOnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SoundOffIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

export default function VideoHero() {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const router = useRouter();

  const toggleSound = () => {
    if (!videoRef.current) return;
    const next = !muted;
    videoRef.current.muted = next;
    setMuted(next);
  };

  const goToCatalog = () => router.push('/browse');

  // Scrolls to the ModelFinder section further down this same page, rather
  // than duplicating the nav bar's /models link.
  const scrollToModelFinder = () => {
    document.getElementById('model-finder')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="vh-wrap">

      {/* ── Video ──────────────────────────────────────────────────────────── */}
      <video
        ref={videoRef}
        src="https://8xpstxcqsrkjpxhe.public.blob.vercel-storage.com/homevideo-GV4kH1trjPu96LCJQXSeiASXn9FMHL.mp4"
        autoPlay
        muted
        loop
        playsInline
        className="vh-video"
      />

      {/* ── Overlays ───────────────────────────────────────────────────────── */}

      {/* Primary dark gradient — heavier at top and bottom */}
      <div className="vh-overlay-gradient" aria-hidden="true" />

      {/* Blueprint grid — very faint technical drawing overlay */}
      <div className="vh-overlay-grid" aria-hidden="true" />

      {/* ── Corner registration marks ──────────────────────────────────────── */}
      <div className="vh-corner vh-corner-tl" aria-hidden="true" />
      <div className="vh-corner vh-corner-tr" aria-hidden="true" />
      <div className="vh-corner vh-corner-bl" aria-hidden="true" />
      <div className="vh-corner vh-corner-br" aria-hidden="true" />

      {/* ── Hero content ──────────────────────────────────────────────────── */}
      <div className="vh-content">

        {/* Section ident — top of content */}
        <p className="vh-ident">
          STINKIN&apos; SUPPLIES · AFTERMARKET HD PARTS
        </p>

        {/* Gold accent bar */}
        <span className="vh-accent-bar" aria-hidden="true" />

        {/* Primary headline */}
        <h1 className="vh-headline">
          The Right<br />
          Stinkin&apos;<br />
          Parts
        </h1>

        {/* Sub-line */}
        <p className="vh-subline">
          Aftermarket Harley-Davidson parts, accessories,
          and components — sourced from the brands that
          build bikes right.
        </p>

        {/* CTAs */}
        <div className="vh-ctas">
          <GlowButton size="lg" variant="gold" onClick={goToCatalog}>
            Browse the Catalog
          </GlowButton>
          <GlowButton size="lg" variant="steel" onClick={scrollToModelFinder}>
            Find By Model →
          </GlowButton>
        </div>

        {/* Spec data strip — bottom of content block */}
        <div className="vh-spec-strip">
          {[
            ["97,000+", "Parts in Catalog"],
            ["3 Vendors",  "PU · WPS · VTwin"],
            ["3.2M+",   "Fitment Records"],
          ].map(([val, label]) => (
            <div key={label} className="vh-spec-item">
              <span className="vh-spec-value">{val}</span>
              <span className="vh-spec-label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sound toggle — bottom right, styled as a stamp ──────────────── */}
      <button
        className="vh-sound-btn"
        onClick={toggleSound}
        aria-label={muted ? 'Unmute video' : 'Mute video'}
      >
        {muted ? <SoundOffIcon /> : <SoundOnIcon />}
        <span>{muted ? 'SOUND OFF' : 'SOUND ON'}</span>
      </button>

      {/* ── Scroll indicator ────────────────────────────────────────────── */}
      <div className="vh-scroll-indicator" aria-hidden="true">
        <div className="vh-scroll-line" />
        <span className="vh-scroll-label">SCROLL</span>
      </div>

      <style>{`

        /* ── Wrapper ─────────────────────────────────────────────────── */
        .vh-wrap {
          position: relative;
          width: 100%;
          min-height: 90vh;
          overflow: hidden;
          background: var(--black);
          display: flex;
          align-items: flex-end;
        }

        /* ── Video ───────────────────────────────────────────────────── */
        .vh-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
          opacity: 0.85;
        }

        /* ── Dark gradient overlay ────────────────────────────────────── */
        .vh-overlay-gradient {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              to bottom,
              rgba(8,7,6,0.55)  0%,
              rgba(8,7,6,0.15) 30%,
              rgba(8,7,6,0.05) 55%,
              rgba(8,7,6,0.65) 100%
            ),
            linear-gradient(
              to right,
              rgba(8,7,6,0.55) 0%,
              rgba(8,7,6,0.05) 60%,
              rgba(8,7,6,0.05) 100%
            );
          pointer-events: none;
          z-index: 1;
        }

        /* ── Blueprint grid overlay ───────────────────────────────────── */
        .vh-overlay-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(61,90,122,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(61,90,122,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 2;
        }

        /* ── Corner marks ─────────────────────────────────────────────── */
        .vh-corner {
          position: absolute;
          width: 20px;
          height: 20px;
          border-color: var(--gold-rule);
          border-style: solid;
          z-index: 4;
          pointer-events: none;
        }
        .vh-corner-tl { top: 24px; left: 24px;  border-width: 1px 0 0 1px; }
        .vh-corner-tr { top: 24px; right: 24px;  border-width: 1px 1px 0 0; }
        .vh-corner-bl { bottom: 24px; left: 24px;  border-width: 0 0 1px 1px; }
        .vh-corner-br { bottom: 24px; right: 24px; border-width: 0 1px 1px 0; }

        /* ── Hero content ─────────────────────────────────────────────── */
        .vh-content {
          position: relative;
          z-index: 3;
          padding: 80px 64px 72px;
          max-width: 760px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* Section ident */
        .vh-ident {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          letter-spacing: var(--tracking-stamp);
          text-transform: uppercase;
          color: var(--gold-dim);
          margin-bottom: 16px;
          line-height: 1;
        }

        /* Gold accent bar */
        .vh-accent-bar {
          display: block;
          width: 40px;
          height: 2px;
          background: var(--gold);
          margin-bottom: 24px;
          box-shadow: 0 0 12px rgba(197,167,34,0.5);
        }

        /* Primary headline — Tanker, maximum size */
        .vh-headline {
          font-family: var(--font-tanker), sans-serif;
          font-size: clamp(64px, 9vw, 130px);
          font-weight: 400;
          line-height: 0.92;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          color: var(--cream-light);
          margin-bottom: 28px;
          /* Embossed text on dark */
          text-shadow:
            0  2px 0 rgba(255,255,255,0.06),
            0 -1px 0 rgba(0,0,0,0.80),
            0  4px 24px rgba(0,0,0,0.60);
        }

        /* Sub-line */
        .vh-subline {
          font-family: var(--font-body), sans-serif;
          font-size: var(--text-md);
          font-weight: 400;
          line-height: var(--leading-relaxed);
          color: var(--silver);
          max-width: 420px;
          margin-bottom: 40px;
        }

        /* CTAs */
        .vh-ctas {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 56px;
        }

        /* Spec data strip */
        .vh-spec-strip {
          display: flex;
          gap: 0;
          border-top: 1px solid var(--gold-rule);
          padding-top: 20px;
        }
        .vh-spec-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-right: 32px;
          margin-right: 32px;
          border-right: 1px solid var(--steel2);
        }
        .vh-spec-item:last-child {
          border-right: none;
          padding-right: 0;
          margin-right: 0;
        }
        .vh-spec-value {
          font-family: var(--font-tanker), sans-serif;
          font-size: var(--text-2xl);
          color: var(--gold);
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .vh-spec-label {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-xs);
          letter-spacing: var(--tracking-wider);
          text-transform: uppercase;
          color: var(--chrome);
          line-height: 1;
        }

        /* ── Sound button — stamp treatment ───────────────────────────── */
        .vh-sound-btn {
          position: absolute;
          bottom: 28px;
          right: 40px;
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 12px;
          border: 1px solid var(--gold-rule);
          background: rgba(8,7,6,0.70);
          color: var(--chrome);
          cursor: pointer;
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          text-transform: uppercase;
          transition: border-color 0.15s, color 0.15s;
          line-height: 1;
        }
        .vh-sound-btn:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        /* ── Scroll indicator ─────────────────────────────────────────── */
        .vh-scroll-indicator {
          position: absolute;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 4;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }
        .vh-scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, var(--gold-rule), transparent);
          animation: vh-scroll-pulse 2s ease-in-out infinite;
        }
        .vh-scroll-label {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--fog);
          line-height: 1;
        }
        @keyframes vh-scroll-pulse {
          0%, 100% { opacity: 0.4; transform: scaleY(1);   }
          50%       { opacity: 0.9; transform: scaleY(1.1); }
        }

        /* ── Responsive ───────────────────────────────────────────────── */
        @media (max-width: 768px) {
          .vh-wrap       { min-height: 85vh; align-items: flex-end; }
          .vh-content    { padding: 48px 24px 64px; max-width: 100%; }
          .vh-headline   { font-size: clamp(52px, 14vw, 80px); }
          .vh-subline    { font-size: var(--text-base); }
          .vh-ctas       { flex-direction: column; }
          .vh-corner     { width: 14px; height: 14px; }
          .vh-corner-tl,
          .vh-corner-tr  { top: 16px; }
          .vh-corner-bl,
          .vh-corner-br  { bottom: 16px; }
          .vh-corner-tl,
          .vh-corner-bl  { left: 16px; }
          .vh-corner-tr,
          .vh-corner-br  { right: 16px; }
          .vh-scroll-indicator { display: none; }
          .vh-spec-strip { flex-wrap: wrap; gap: 16px; }
          .vh-spec-item  { border-right: none; margin-right: 0; padding-right: 0; }
        }

        @media (max-width: 480px) {
          .vh-content  { padding: 32px 18px 56px; }
          .vh-ident    { font-size: 8px; }
        }
      `}</style>
    </div>
  );
}
