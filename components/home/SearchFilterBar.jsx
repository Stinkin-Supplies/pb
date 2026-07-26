'use client';

/**
 * SearchFilterBar — full-width placeholder band between VideoHero and
 * CategoryPhotoGrid. Vintage paper texture, matching CategoryIndex.
 *
 * TODO: replace placeholder box with a real search input / model selector
 * that filters products.
 */
export default function SearchFilterBar() {
  return (
    <section className="sfb-wrap">
      <div className="sfb-inner">
        <span className="sfb-label">SEARCH · FILTER BY MODEL</span>
        <div className="sfb-placeholder-box" aria-hidden="true">
          <span className="sfb-placeholder-text">SEARCH / MODEL SELECTOR — COMING SOON</span>
        </div>
      </div>

      <style>{`

        /* ── Wrapper — aged paper background, full width ─────────────── */
        .sfb-wrap {
          position: relative;
          background: var(--cream);
          border-top: 3px solid var(--gold-dim);
          border-bottom: 3px solid var(--gold-dim);
          padding: 32px clamp(20px, 4vw, 56px);
          overflow: hidden;
        }

        /* Subtle paper grain texture */
        .sfb-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }

        /* Horizontal ruled lines — notebook paper */
        .sfb-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 31px,
            rgba(139,110,44,0.07) 31px,
            rgba(139,110,44,0.07) 32px
          );
          pointer-events: none;
          z-index: 0;
        }

        .sfb-inner {
          position: relative;
          z-index: 1;
          max-width: 1400px;
          margin: 0 auto;
        }

        .sfb-label {
          display: block;
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-stamp);
          color: var(--gold-dim);
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .sfb-placeholder-box {
          width: 100%;
          height: 64px;
          border: 1px dashed rgba(139,110,44,0.35);
          background: rgba(139,110,44,0.04);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sfb-placeholder-text {
          font-family: var(--font-stencil), monospace;
          font-size: var(--text-2xs);
          letter-spacing: var(--tracking-wider);
          text-transform: uppercase;
          color: rgba(139,110,44,0.55);
        }

        @media (max-width: 480px) {
          .sfb-placeholder-box { height: 52px; }
        }
      `}</style>
    </section>
  );
}
